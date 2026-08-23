import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../../contracts/prism/v1/fixtures/minimal-web.json" with { type: "json" };
import { PrismEngine, DeterministicDesignProvider } from "../engine/index.ts";
import { executePrismOperation } from "../engine/worker-binding.ts";
import { engineRequestSchema } from "@kubeclaw/prism-contracts-v1/digest";
import { prismAttempt, prismRequestDigest } from "../engine/worker-envelope.ts";
import { validatePipelineWorkerCoreContract } from "@kubeclaw/pipeline-worker-core-contract";
test("engine generates, renders, evaluates and publishes idempotently", async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const base = {
    contract: "kubeclaw.prism-design-engine@1" as const,
    input: { document: fixture },
    idempotencyKey: "a",
  };
  const generated = await engine.execute({
    ...base,
    operation: "generate",
    input: { document: fixture, instruction: "Services" },
  });
  assert.equal((generated.output.document as any).meta.revision, 2);
  const render = await engine.execute({
    ...base,
    operation: "render",
    input: { document: fixture, view: "home", state: "default", viewport: "wide" },
    idempotencyKey: "b",
  });
  assert.match(String(render.output.html), /Deployments/);
  const evaluation = await engine.execute({
    ...base,
    operation: "evaluate",
    idempotencyKey: "c",
  });
  assert.equal(evaluation.output.status, "needs-attention");
  await assert.rejects(
    () =>
      engine.execute({ ...base, operation: "publish", idempotencyKey: "d" }),
    /approval/,
  );
  const first = await engine.execute({
    ...base,
    operation: "publish",
    input: { document: fixture, approved: true },
    idempotencyKey: "e",
  });
  const second = await engine.execute({
    ...base,
    operation: "publish",
    input: { document: fixture, approved: true },
    idempotencyKey: "e",
  });
  assert.deepEqual(first, second);
});
test("the generic worker carries an opaque Prism operation", async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const result = await executePrismOperation(
    engine,
    {
      contractId: "kubeclaw.prism-design-engine@1",
      inputSchemaId: engineRequestSchema("render").schemaId,
      inputSchemaDigest: engineRequestSchema("render").schemaDigest,
      values: {
        operation: "render",
        input: { document: fixture, view: "home", state: "default", viewport: "wide" },
      },
    },
    "worker:1",
  );
  assert.match(result.schemaId, /engine-results\.v1\.json#\/\$defs\/render$/);
  assert.notEqual(result.schemaDigest, `sha256:${"a".repeat(64)}`);
  assert.match(String(result.values.html), /Deployments/);
});
test("the worker binding rejects unknown operations", async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  await assert.rejects(
    () =>
      executePrismOperation(
        engine,
        {
          contractId: "kubeclaw.prism-design-engine@1",
          inputSchemaId: "unknown",
          inputSchemaDigest: `sha256:${"a".repeat(64)}`,
          values: { operation: "destroy", input: { document: fixture } },
        },
        "worker:bad",
      ),
    /unsupported Prism operation/,
  );
});

test("concurrent retries share one provider execution", async () => {
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const engine = new PrismEngine({
    async embed() { return { embedding: [0], model: "test", modelVersion: "1" }; },
    async propose() {
      calls += 1;
      await waiting;
      return [];
    },
  });
  const request = {
    contract: "kubeclaw.prism-design-engine@1" as const,
    operation: "generate" as const,
    input: { document: fixture, instruction: "Keep it" },
    idempotencyKey: "concurrent-generate",
  };
  const first = engine.execute(request);
  const second = engine.execute(request);
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test("an idempotency key cannot identify different requests", async () => {
  const engine = new PrismEngine(new DeterministicDesignProvider());
  await engine.execute({
    contract: "kubeclaw.prism-design-engine@1",
    operation: "render",
    input: { document: fixture, view: "home", state: "default", viewport: "wide" },
    idempotencyKey: "same-key",
  });
  await assert.rejects(
    () =>
      engine.execute({
        contract: "kubeclaw.prism-design-engine@1",
        operation: "evaluate",
        input: { document: fixture },
        idempotencyKey: "same-key",
      }),
    /different request/,
  );
});

test("Prism creates a valid neutral worker envelope", () => {
  const attempt = prismAttempt("render", {artifactId:"artifact:sha256:"+"a".repeat(64),type:"prism-engine-input",mediaType:"application/json",contentDigest:"sha256:"+"a".repeat(64),sizeBytes:128,storageUrl:"http://prism-control:8080/v1/internal/artifacts/sha256:"+"a".repeat(64)}, "render-one");
  validatePipelineWorkerCoreContract("workerAttemptEnvelope", attempt);
  assert.equal(attempt.operation.contractId, "kubeclaw.prism-design-engine@1");
  assert.notEqual(prismRequestDigest(attempt.operation,`sha256:${"a".repeat(64)}`),prismRequestDigest(attempt.operation,`sha256:${"b".repeat(64)}`));
});
