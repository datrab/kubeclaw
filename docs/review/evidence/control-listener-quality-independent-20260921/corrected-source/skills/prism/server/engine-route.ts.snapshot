import {
  validatePrism,
  type PrismDocument,
} from "@kubeclaw/prism-contracts-v1";
import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import {
  agentReceipt,
  startAgentRevision,
} from "../control/agent-admission.ts";

import type { AuthenticatedControlContext } from "./control-context.ts";
import { body, json, userKey } from "./control-http.ts";
type RouteContext = Pick<
  AuthenticatedControlContext,
  "pool" | "repository" | "artifacts" | "actor" | "config" | "runWorker"
>;

export async function engineRoute(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const execute = /^\/v1\/documents\/([0-9a-f-]+)\/engine$/.exec(url.pathname);
  if (execute && request.method === "POST") {
    await executeDocument(context, request, response, execute);
    return true;
  }
  return false;
}
async function executeDocument(
  context: RouteContext,
  request: IncomingMessage,
  response: ServerResponse,
  execute: RegExpExecArray,
) {
  const { repository, artifacts, runWorker } = context;

  const input = (await body(request)) as EngineInput;
  const idempotencyKey =
    input.idempotencyKey ?? randomBytes(16).toString("hex");
  if (
    !["generate", "render", "evaluate", "publish"].includes(
      input.operation ?? "",
    )
  )
    throw new Error("unsupported Prism engine operation");
  if (
    !Number.isSafeInteger(input.baseRevision) ||
    Number(input.baseRevision) < 1
  )
    throw new Error("baseRevision is required");
  const requestDocument = await repository.revision(
    execute[1]!,
    Number(input.baseRevision),
  );
  const operation = input.operation as
    "generate" | "render" | "evaluate" | "publish";
  if (operation === "generate")
    return reviseWithAgent(context, response, input, execute, requestDocument);
  const defaults =
    operation === "render"
      ? { view: "home", state: "default", viewport: "wide" }
      : {};
  const engineInput: Record<string, unknown> = {
    ...defaults,
    ...input.input,
    document: requestDocument.document,
  };
  if (operation === "render")
    engineInput.assetSources = await renderAssets(
      artifacts,
      requestDocument.document,
    );
  const values = await runWorker(operation, engineInput, idempotencyKey);
  await retainGeneratedRevision(
    context,
    execute,
    input,
    values,
    idempotencyKey,
  );
  return json(response, 200, {
    state: "completed",
    specialistResult: { values },
  });
}

interface EngineInput {
  operation?: string;
  input?: Record<string, unknown>;
  idempotencyKey?: string;
  baseRevision?: number;
}
type Revision = Awaited<
  ReturnType<AuthenticatedControlContext["repository"]["revision"]>
>;
async function reviseWithAgent(
  context: Pick<AuthenticatedControlContext, "pool" | "actor" | "config">,
  response: ServerResponse,
  input: EngineInput,
  execute: RegExpExecArray,
  requestDocument: Revision,
) {
  const { pool, actor } = context;
  const { trustedControlSpiffeId } = context.config;

  const owner = await pool.query<{ external_id: string }>(
    "SELECT p.external_id FROM prism.design_document d JOIN prism.project p ON p.id=d.project_id WHERE d.id=$1",
    [execute[1]],
  );
  if (!owner.rows[0]) throw new Error("Prism project not found");
  const instruction = String(input.input?.instruction ?? "").trim();
  if (!instruction) throw new Error("Prism revision instruction is required");
  if (!input.idempotencyKey)
    throw new Error("agent revision idempotency key is required");
  const job = await startAgentRevision(
    pool,
    `${trustedControlSpiffeId}/prism/main/v2`,
    userKey(actor.user),
    input.idempotencyKey,
    {
      projectId: owner.rows[0].external_id,
      documentId: execute[1]!,
      expectedRevision: Number(input.baseRevision),
      instruction,
      document: requestDocument.document,
    },
  );
  return json(response, 202, agentReceipt(job));
}
async function renderAssets(
  artifacts: AuthenticatedControlContext["artifacts"],
  document: PrismDocument,
) {
  const assetSources: Record<string, string> = {};
  let totalBytes = 0;
  for (const [assetId, rawAsset] of Object.entries(document.assets)) {
    const asset = rawAsset as { artifact?: string; mediaType?: string };
    if (!asset.artifact || !asset.mediaType)
      throw new Error(`asset metadata is incomplete for ${assetId}`);
    const bytes = await artifacts.get(asset.artifact);
    totalBytes += bytes.byteLength;
    if (totalBytes > 6_000_000)
      throw new Error("render assets exceed the 6 MB baseline limit");
    assetSources[assetId] =
      `data:${asset.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  return assetSources;
}
async function retainGeneratedRevision(
  context: Pick<AuthenticatedControlContext, "repository" | "actor">,
  execute: RegExpExecArray,
  input: EngineInput,
  values: Record<string, unknown>,
  idempotencyKey: string,
) {
  const { repository, actor } = context;
  const generated = values.document;
  if (input.operation !== "generate" || !generated) return;
  validatePrism<PrismDocument>("designDocument", generated);
  const currentDocument = await repository.current(execute[1]!);
  if (currentDocument.document.meta.revision === input.baseRevision) {
    try {
      await repository.replace(
        execute[1]!,
        currentDocument.id,
        generated as PrismDocument,
        { type: "engine.generate", idempotencyKey },
        actor.user,
      );
    } catch (error) {
      if (!(await repository.includesOperation(execute[1]!, idempotencyKey)))
        throw error;
    }
  } else if (currentDocument.document.meta.revision < input.baseRevision!)
    throw new Error("design revision moved backwards");
  else if (!(await repository.includesOperation(execute[1]!, idempotencyKey)))
    throw new Error(
      "revision conflict: generated proposal is based on a stale design",
    );
}
