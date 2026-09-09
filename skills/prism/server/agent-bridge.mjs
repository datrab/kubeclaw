import { preferencePrompt } from "./preference-prompt.mjs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 18080);
const controlUrl = process.env.PRISM_CONTROL_URL || "http://127.0.0.1:28080";
const studioUrl = process.env.PRISM_STUDIO_PUBLIC_URL || "https://prism-studio";
const running = new Map();

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response, status, value) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function runAgent(sessionKey, prompt) {
  const execute = () => new Promise((resolve, reject) => {
    const child = spawn("openclaw", [
      "agent", "--agent", "main", "--session-key", sessionKey,
      "--message", prompt, "--json", "--timeout", "900"
    ], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`openclaw agent exited ${code}: ${errors.slice(-2000)}`)));
  });
  const previous = running.get(sessionKey) || Promise.resolve();
  const task = previous.catch(() => undefined).then(execute);
  running.set(sessionKey, task);
  void task.finally(() => {
    if (running.get(sessionKey) === task) running.delete(sessionKey);
  }).catch(() => undefined);
  return task;
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/health" || request.url === "/ready") return send(response, 200, { status: "ready" });
    if (request.method !== "POST") return send(response, 404, { error: "not found" });
    const payload = await readJson(request);
    if (request.url === "/v1/dispatch") {
      const persisted = await fetch(new URL("/v1/dispatch", controlUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": String(request.headers["idempotency-key"] || "")
        },
        body: JSON.stringify(payload)
      });
      const result = await persisted.json();
      if (!persisted.ok || persisted.status !== 202) return send(response, persisted.status, result);
      const designRequest = payload.request;
      const externalProjectId = String(designRequest?.projectId || "");
      if (!externalProjectId) throw new Error("Prism projectId is required");
      const sessionKey = `prism-${externalProjectId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96)}`;
      const prompt = [
        "You are Prism, the single OpenClaw design agent.",
        "Nova sent the following approved architecture. Create exactly three materially different, complete Prism design documents.",
        "Before drafting, read /app/skills/packages/prism-contract/schemas/prism-v1.schema.json and /app/skills/packages/prism-contract/fixtures/minimal-web.json from the versioned Prism code bundle. Every document must validate against that schema; do not invent fields.",
        "You MUST finish by calling prism_create_design_set exactly once with the external projectId and exactly three designs. Do not call OpenAI or any provider directly; your OpenClaw gateway owns all model routing.",
        `Studio base URL: ${studioUrl}`,
        `Design request: ${JSON.stringify(designRequest)}`,
        preferencePrompt(result.preferences)
      ].join("\n\n");
      void runAgent(sessionKey, prompt).catch((error) => console.error("Prism OpenClaw generation failed", error));
      return send(response, 202, result);
    }
    if (request.url === "/v1/revise") {
      const externalProjectId = String(payload.projectId || "");
      const documentId = String(payload.documentId || "");
      const instruction = String(payload.instruction || "").trim();
      if (!externalProjectId || !documentId || !instruction) throw new Error("projectId, documentId, and instruction are required");
      const sessionKey = `prism-${externalProjectId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96)}`;
      const prompt = [
        "Continue this Prism project in the same session.",
        `Apply this Studio feedback: ${instruction}`,
        `Target documentId: ${documentId}; expected revision: ${Number(payload.expectedRevision)}`,
        `Current document: ${JSON.stringify(payload.document)}`,
        preferencePrompt(payload.preferences),
        "Return no prose-only answer. You MUST call prism_apply_revision with the complete updated document."
      ].join("\n\n");
      void runAgent(sessionKey, prompt).catch((error) => console.error("Prism OpenClaw revision failed", error));
      return send(response, 202, { status: "accepted", sessionKey, generationId: payload.preferences.generationId, snapshotDigest: payload.preferences.snapshotDigest });
    }
    if (request.url === "/v1/design-set") {
      const externalProjectId = String(payload.projectId || "");
      if (!externalProjectId || !payload.request) throw new Error("projectId and request are required");
      const sessionKey = `prism-${externalProjectId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96)}`;
      const prompt = [
        "Create exactly three materially different, complete Prism design documents for this project.",
        "Read /app/skills/packages/prism-contract/schemas/prism-v1.schema.json and /app/skills/packages/prism-contract/fixtures/minimal-web.json from the versioned Prism code bundle before drafting.",
        "You MUST call prism_create_design_set exactly once. Do not return a prose-only result.",
        `Design request: ${JSON.stringify(payload.request)}`,
        preferencePrompt(payload.preferences)
      ].join("\n\n");
      void runAgent(sessionKey, prompt).catch((error) => console.error("Prism OpenClaw design-set generation failed", error));
      return send(response, 202, { status: "accepted", sessionKey, generationId: payload.preferences.generationId, snapshotDigest: payload.preferences.snapshotDigest });
    }
    return send(response, 404, { error: "not found" });
  } catch (error) {
    return send(response, 422, { error: error instanceof Error ? error.message : "failed" });
  }
});
server.listen(port, "127.0.0.1");
