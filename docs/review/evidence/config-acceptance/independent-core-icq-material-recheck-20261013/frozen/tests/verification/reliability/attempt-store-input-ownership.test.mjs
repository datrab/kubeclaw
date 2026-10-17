import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { projectionFixture } from "./attempt-retirement-fixture.mjs";

test("public Attempt API snapshots owned inputs before a real writer fence can release", async (t) => {
  const f = await projectionFixture(t),
    file = path.join(f.scope.attemptRoot, "attempt-store.json");
  const module = new URL(
    "../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts",
    import.meta.url,
  ).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {withDurableStoreLock} from ${JSON.stringify(module)};await withDurableStoreLock(process.argv[1],async()=>{process.stdout.write('LOCKED');await new Promise(()=>{});});`,
      file,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  let errors = "";
  child.stderr.on("data", (chunk) => (errors += chunk));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(errors || "writer marker timeout"));
    }, 15000);
    child.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(errors || "writer exited"));
    });
  });
  const before = fs.readFileSync(file),
    result = structuredClone(f.result),
    intent = {
      record: structuredClone(f.record),
      closure: structuredClone(f.closure),
    };
  const owner = { planId: "plan:1", nodeId: "node:1" };
  const evidenceInput = {
    pipelineRunId: f.runId,
    attemptId: f.result.attemptId,
    claimGeneration: 1,
    producer: structuredClone(f.record.producer),
    evidenceId: f.evidence.evidenceId,
    type: "log",
    mediaType: "text/plain",
  };
  const bytes = Buffer.from("original evidence bytes"),
    closure = structuredClone(f.closure),
    required = structuredClone(f.imported.desired.requiredClosures);
  const pending = [
    f.attempts.storeEvidence(evidenceInput, bytes),
    f.attempts.storeResult(f.runId, result, intent, owner),
    f.attempts.storeClosure(closure, f.admission),
    f.attempts.evaluateCompleteness(f.runId, required, f.admission),
  ];
  const settled = Promise.all(pending);
  result.summary = "caller changed";
  intent.record.payload.diagnostic = "caller changed";
  intent.closure.closureId = "caller:changed";
  owner.planId = "caller:changed";
  evidenceInput.producer.producerId = "caller:changed";
  bytes.fill(0);
  closure.closureDigest = "sha256:".padEnd(71, "0");
  required[0].closureId = "caller:changed";
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(fs.readFileSync(file), before);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  assert.deepEqual(await exited, [null, "SIGKILL"]);
  const [evidence, stored, closed, completeness] = await settled;
  assert.deepEqual(evidence, f.evidence);
  assert.deepEqual(stored.result, f.result);
  assert.deepEqual(stored.completionIntent, {
    record: f.record,
    closure: f.closure,
  });
  assert.equal(stored.planId, "plan:1");
  assert.deepEqual(closed, f.closure);
  assert.equal(completeness.state, "complete");
  assert.deepEqual(completeness.requiredClosureIds, [f.closure.closureId]);
  assert.deepEqual(fs.readFileSync(file), before);
});
