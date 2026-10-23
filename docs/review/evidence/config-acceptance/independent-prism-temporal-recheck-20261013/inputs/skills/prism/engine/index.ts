import { createHash } from "node:crypto";
import type { PrismDocument } from "@kubeclaw/prism-contracts-v1";
import { validatePrism } from "@kubeclaw/prism-contracts-v1";
import { applyOperation, type PrismOperation } from "../domain/index.ts";
import { evaluate } from "../evaluation/index.ts";
import {
  EngineExecutionCache,
  type EngineCacheLimits,
} from "./execution-cache.ts";
import { renderOperation } from "./render-operation.ts";

export type EngineOperation =
  "generate" | "render" | "evaluate" | "ingest" | "publish";
export type EngineRequest = {
  contract: "kubeclaw.prism-design-engine@1";
  operation: EngineOperation;
  input: Record<string, unknown>;
  idempotencyKey: string;
};
export type EngineResult = {
  operation: EngineOperation;
  output: Record<string, unknown>;
};
export interface DesignProvider {
  propose(
    document: PrismDocument,
    instruction: string,
    signal?: AbortSignal,
  ): Promise<PrismOperation[]>;
  embed(
    text: string,
    signal?: AbortSignal,
  ): Promise<{ embedding: number[]; model: string; modelVersion: string }>;
}
const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
function exactInput(
  input: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      throw new Error(`unsupported Prism input field: ${key}`);
  for (const key of required)
    if (!(key in input)) throw new Error(`missing Prism input field: ${key}`);
}

function validateOperationInput(request: EngineRequest): void {
  if (request.operation === "generate")
    exactInput(
      request.input,
      ["document", "instruction", "mode"],
      ["document", "instruction"],
    );
  else if (request.operation === "render")
    exactInput(
      request.input,
      ["document", "view", "state", "viewport", "capture", "assetSources"],
      ["document", "view", "state", "viewport"],
    );
  else if (request.operation === "evaluate")
    exactInput(request.input, ["document"], ["document"]);
  else if (request.operation === "ingest")
    exactInput(request.input, ["text"], ["text"]);
  else exactInput(request.input, ["document", "approved"], ["document"]);
}

export class PrismEngine {
  private readonly provider: DesignProvider;
  private readonly executions: EngineExecutionCache<EngineResult>;
  constructor(provider: DesignProvider, cacheLimits?: EngineCacheLimits) {
    this.provider = provider;
    this.executions = new EngineExecutionCache(cacheLimits);
  }
  cacheUsage() {
    return this.executions.usage();
  }
  async execute(
    request: EngineRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<EngineResult> {
    const owner = options.signal;
    owner?.throwIfAborted();
    if (request.contract !== "kubeclaw.prism-design-engine@1")
      throw new Error("unsupported Prism engine contract");
    // Bind deferred execution to the same caller-independent input as its identity.
    const ownedRequest = structuredClone(request);
    const fingerprint = hash(
      JSON.stringify({
        operation: ownedRequest.operation,
        input: ownedRequest.input,
      }),
    );
    return this.executions.execute(
      ownedRequest.idempotencyKey,
      fingerprint,
      () => this.executeOnce(ownedRequest, owner),
      owner,
    );
  }
  private async ingest(
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<EngineResult> {
    const text = String(input.text ?? "").trim();
    if (!text || text.length > 200_000)
      throw new Error("ingest text length is invalid");
    const embedded = await this.provider.embed(text, signal);
    if (
      !embedded.embedding.length ||
      embedded.embedding.some((value) => !Number.isFinite(value))
    )
      throw new Error("embedding provider returned an invalid vector");
    return {
      operation: "ingest",
      output: { ...embedded, sourceDigest: hash(text) },
    };
  }
  private async executeOnce(
    request: EngineRequest,
    signal?: AbortSignal,
  ): Promise<EngineResult> {
    signal?.throwIfAborted();
    validateOperationInput(request);
    if (request.operation === "ingest")
      return this.ingest(request.input, signal);
    const document = request.input.document as PrismDocument;
    validatePrism<PrismDocument>("designDocument", document);
    let result: EngineResult;
    if (request.operation === "generate") {
      const operations = await this.provider.propose(
        document,
        String(request.input.instruction ?? ""),
        signal,
      );
      const next = operations.reduce(
        (current, operation) =>
          applyOperation(current, {
            ...operation,
            baseRevision: current.meta.revision,
          } as PrismOperation),
        document,
      );
      result = {
        operation: "generate",
        output: {
          document: next,
          operations,
          mode: String(request.input.mode ?? "refine"),
        },
      };
    } else if (request.operation === "render") {
      result = await renderOperation(document, request.input, signal);
    } else if (request.operation === "evaluate") {
      const report = evaluate(document);
      result = {
        operation: "evaluate",
        output: report,
      };
    } else {
      if (request.input.approved !== true)
        throw new Error("explicit approval is required");
      const canonical = JSON.stringify(document);
      const manifest = {
        schema: "prism.baseline-bundle.v1",
        projectId: document.meta.projectId,
        revision: document.meta.revision,
        designDigest: hash(canonical),
      };
      result = {
        operation: "publish",
        output: { manifest, bundleDigest: hash(JSON.stringify(manifest)) },
      };
    }
    return result;
  }
}

export { DeterministicDesignProvider, OpenAICompatibleDesignProvider } from "./design-providers.ts";
