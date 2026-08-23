import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRegistry,
  discoverPackages,
  resolveTestPlan,
  type NodeDeclaration,
  type ResolverPolicy,
} from "../../../skills/nova/core/src/index.ts";
import {
  createBusterWorkerProfiles,
  LocalWorkerRuntime,
  RegisteredTestProviderLoader,
  TestPlanRunner,
  type TestPlanRunnerOptions,
  type LoadedTestProvider,
  type TestProviderLoader,
  type WorkerAttemptRuntime,
} from "../../../skills/buster/engine/src/index.ts";
import type { WorkerAttemptResultV1 } from "@kubeclaw/pipeline-worker-core-contract";
import type {
  ProviderInvocationV1,
  ProviderResultV1,
} from "@kubeclaw/pipeline-test-gate-contract";
import type { TestProviderInstance } from "../../../skills/common/plugin-runtime/sdk/src/index.ts";
import type { TestProviderRegistryEntry } from "../../../skills/common/plugin-runtime/foundation/registry/types.ts";
import { FileObservabilityAdmissionStore } from "../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "test-plan-runner-"));

type LocalTestPlanRunnerOptions = Omit<
  TestPlanRunnerOptions,
  "observabilityRoot"
> & { readonly observabilityRoot?: string };
class LocalTestPlanRunner extends TestPlanRunner {
  constructor(options: LocalTestPlanRunnerOptions) {
    super({
      ...options,
      observabilityRoot:
        options.observabilityRoot ??
        path.join(options.artifactRoot, "observability"),
    });
  }
}
const plugins = path.join(temporary, "plugins");
const packageRoot = path.join(plugins, "providers");
const workspace = path.join(temporary, "workspace");
const repository = path.join(workspace, "repository");
const artifacts = path.join(temporary, "artifacts");
fs.mkdirSync(path.join(packageRoot, "dist"), { recursive: true });
fs.mkdirSync(path.join(packageRoot, "schemas"), { recursive: true });
fs.mkdirSync(path.join(packageRoot, "node_modules", "example-dep"), {
  recursive: true,
});
fs.mkdirSync(repository, { recursive: true });
fs.writeFileSync(
  path.join(packageRoot, "node_modules", "example-dep", "package.json"),
  '{"name":"example-dep","type":"module","exports":"./index.js"}\n',
);
fs.writeFileSync(
  path.join(packageRoot, "node_modules", "example-dep", "index.js"),
  'export const dependencyValue = "dependency loaded";\n',
);
fs.writeFileSync(
  path.join(packageRoot, "dist", "provider.js"),
  `import { dependencyValue } from 'example-dep';
export function provider() {
  return { async execute(invocation, context) {
    if (invocation.configuration.values.hang === true) { while (true) {} }
    if (invocation.configuration.values.waitForAbort === true) {
      (await import('node:fs')).writeFileSync(context.workspaceRoot + '/' + invocation.workspace.scratch + '/ready.txt', 'ready');
      await new Promise((resolve) => context.signal.addEventListener('abort', resolve, { once: true }));
      (await import('node:fs')).writeFileSync(context.workspaceRoot + '/' + invocation.workspace.scratch + '/aborted.txt', 'aborted');
    }
    if (invocation.configuration.values.readForbidden === true) { (await import('node:fs')).readFileSync('/etc/passwd'); }
    if (invocation.configuration.values.spawnForbidden === true) { (await import('node:child_process')).spawnSync('true'); }
    if (invocation.configuration.values.networkForbidden === true) { await fetch('http://127.0.0.1:1'); }
    if (invocation.configuration.values.symlinkEscape === true) {
      const file = context.workspaceRoot + '/' + invocation.workspace.evidence + '/leak';
      (await import('node:fs')).symlinkSync('/etc/passwd', file);
      (await import('node:fs')).readFileSync(file);
    }
    if (invocation.nodeId === 'isolatedProducer') {
      const report = invocation.configuration.values.invalidReport === true ? 'invalid' : '<testsuite tests="1"/>';
      (await import('node:fs')).writeFileSync(context.workspaceRoot + '/' + invocation.workspace.evidence + '/report.xml', report);
      return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'produced',
        counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
        evidenceFiles: [{ evidenceId: 'junit', type: 'test-report', file: 'report.xml', mediaType: 'application/junit+xml' }],
        reports: [{ evidenceId: 'junit', format: 'junit' }],
        outputs: [{ name: 'report', kind: 'artifact', evidenceId: 'junit' }], exitCode: 0, signal: null, providerDetails: null };
    }
    if (invocation.nodeId === 'isolatedConsumer') {
      const artifact = invocation.inputs.find((input) => input.name === 'report').artifact;
      const content = (await import('node:fs')).readFileSync((await import('node:url')).fileURLToPath(artifact.storageUrl), 'utf8');
      if (!content.includes('tests="1"')) throw new Error('artifact content missing');
    }
    return {
    schemaVersion: 'provider-result.v1', outcome: 'passed', summary: dependencyValue,
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [], evidenceFiles: [], reports: [], outputs: [],
    exitCode: 0, signal: null, providerDetails: null,
  }; }, async cleanup() {} };
}\n`,
);
fs.writeFileSync(
  path.join(packageRoot, "dist", "report-adapter.js"),
  `export function adapter(input) { if (new TextDecoder().decode(input.bytes) === 'invalid') throw new Error('REPORT_INVALID'); return {
    counts: { total: 1, passed: 0, failed: 1, errored: 0, skipped: 0 },
    durationMs: 0, cases: [], casesTruncated: true, omittedCaseCount: 1,
    findings: [], findingsTruncated: false, omittedFindingCount: 0,
  }; }\n`,
);
fs.writeFileSync(
  path.join(packageRoot, "schemas", "empty.json"),
  `${JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: true,
    },
    null,
    2,
  )}\n`,
);

function provider(
  id: string,
  contractId: string,
  options: Record<string, unknown> = {},
) {
  return {
    id,
    contractId,
    kind: "test",
    module: "dist/provider.js",
    export: "provider",
    configSchema: "schemas/empty.json",
    inputs: [],
    outputs: [],
    requiredCapabilities: [],
    retrySafe: true,
    matrixFields: [],
    reportFormats: [],
    evidenceTypes: ["log", "report"],
    evidenceDefaults: {
      onPass: ["log", "report"],
      onFail: ["log", "report"],
      onError: ["log"],
    },
    ...options,
  };
}

fs.writeFileSync(
  path.join(packageRoot, "plugin.json"),
  `${JSON.stringify(
    {
      id: "example.runner",
      apiVersion: "pipeline-plugin-v2",
      packageVersion: "1.0.0",
      stages: [],
      observers: [],
      adapters: [],
      testProviders: [
        provider("deployment", "example.deployment@1", {
          kind: "fixture",
          outputs: [
            {
              name: "endpoint",
              kind: "value",
              required: true,
              schemaId: "example.endpoint@1",
            },
          ],
        }),
        provider("report", "example.report@1", {
          kind: "fixture",
          reportFormats: ["junit"],
          evidenceTypes: ["log", "report", "test-report"],
          evidenceDefaults: { onPass: ["log", "report"], onFail: ["log", "report"], onError: ["log"] },
          outputs: [
            {
              name: "report",
              kind: "artifact",
              required: true,
              mediaTypes: ["application/junit+xml"],
            },
          ],
        }),
        provider("optional-report", "example.optional-report@1", {
          kind: "fixture",
          outputs: [
            {
              name: "report",
              kind: "artifact",
              required: false,
              mediaTypes: ["application/junit+xml"],
            },
          ],
        }),
        provider("endpoint-consumer", "example.endpoint-consumer@1", {
          inputs: [
            {
              name: "target",
              kind: "value",
              required: true,
              schemaId: "example.endpoint@1",
            },
          ],
        }),
        provider("report-consumer", "example.report-consumer@1", {
          inputs: [
            {
              name: "report",
              kind: "artifact",
              required: true,
              mediaTypes: ["application/junit+xml"],
            },
          ],
        }),
        provider("generic", "example.generic@1", {
          matrixFields: ["runtime"],
          evidenceTypes: ["log", "report", "diagnostic"],
        }),
        provider("capability", "example.capability@1", {
          requiredCapabilities: ["network.http"],
        }),
      ],
      reportAdapters: [{
        id: "junit", format: "junit", contractVersion: 1,
        module: "dist/report-adapter.js", export: "adapter",
        mediaTypes: ["application/junit+xml"],
      }],
    },
    null,
    2,
  )}\n`,
);

const registry = buildRegistry(
  discoverPackages({
    installationRoots: [plugins],
    trustPolicy: {
      trustedBuiltinRoots: [plugins],
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: "test:runner",
    },
    now: () => new Date("2026-08-05T17:00:00Z"),
  }),
);

const limits = {
  cpuMillis: 10_000,
  memoryBytes: 512 * 1024 * 1024,
  logBytes: 1024 * 1024,
  artifactBytes: 16 * 1024 * 1024,
  artifactFiles: 16,
  processes: 16,
};
const policy: ResolverPolicy = {
  defaultTimeoutMs: 1_000,
  maximumTimeoutMs: 10_000,
  defaultLimits: limits,
  maximumLimits: limits,
  maximumRetryCount: 3,
  maximumMatrixSize: 16,
  maximumNodes: 100,
  defaultConcurrencyLimit: 4,
  maximumConcurrencyLimits: { serial: 1 },
};

function plan(
  tests: Record<string, NodeDeclaration>,
  fixtures: Record<string, NodeDeclaration> = {},
  concurrencyLimits: Record<string, number> = {},
) {
  return resolveTestPlan({
    planId: `plan:${Object.keys(tests).join("-")}`,
    runId: "run:runner",
    project: "runner-project",
    scope: { moduleId: "app", gateId: null },
    createdAt: "2026-08-05T17:00:00Z",
    declaration: { tests, fixtures, concurrencyLimits },
    suiteTemplates: [],
    registry,
    facts: {
      changedPaths: ["src/app.ts"],
      moduleType: "web",
      pipelineStage: "test",
    },
    policy,
  });
}

function result(overrides: Partial<ProviderResultV1> = {}): ProviderResultV1 {
  return {
    schemaVersion: "provider-result.v1",
    outcome: "passed",
    summary: "passed",
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    findings: [],
    metrics: [],
    evidenceFiles: [],
    reports: [],
    outputs: [],
    exitCode: 0,
    signal: null,
    providerDetails: null,
    ...overrides,
  };
}

async function waitForNamedFile(
  root: string,
  name: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(root)) {
      const files = fs.readdirSync(root, { recursive: true, encoding: "utf8" });
      if (files.some((file) => path.basename(file) === name)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`TEST_READY_FILE_TIMEOUT:${name}`);
}

type Behavior = (
  invocation: ProviderInvocationV1,
  context: Parameters<TestProviderInstance["execute"]>[1],
) => Promise<ProviderResultV1>;

class BehaviorLoader implements TestProviderLoader {
  readonly cleanups: string[] = [];
  readonly terminations: string[] = [];
  readonly behavior: Behavior;
  readonly usage: LoadedTestProvider["resources"];
  constructor(
    behavior: Behavior,
    usage: LoadedTestProvider["resources"] = () => ({
      cpuTimeMs: 1,
      maximumMemoryBytes: 1,
      maximumProcesses: 1,
    }),
  ) {
    this.behavior = behavior;
    this.usage = usage;
  }
  async load(
    _entry: TestProviderRegistryEntry,
    invocation: ProviderInvocationV1,
  ): Promise<LoadedTestProvider> {
    return {
      supportsCleanup: async () => true,
      execute: (value, context) => this.behavior(value, context),
      cleanup: async () => {
        this.cleanups.push(`${invocation.nodeId}:${invocation.attemptNumber}`);
      },
      terminate: async () => {
        this.terminations.push(
          `${invocation.nodeId}:${invocation.attemptNumber}`,
        );
      },
      resources: this.usage,
    };
  }
}

let sequence = 0;
const id = () => `id-${++sequence}`;
const calls = new Map<string, number>();
const observedInputs = new Map<string, ProviderInvocationV1["inputs"]>();
let active = 0;
let maximumActive = 0;
let serialActive = 0;
let maximumSerial = 0;
const loader = new BehaviorLoader(async (invocation, context) => {
  calls.set(invocation.nodeId, (calls.get(invocation.nodeId) ?? 0) + 1);
  observedInputs.set(invocation.nodeId, invocation.inputs);
  context.log("stdout", `${invocation.nodeId}\n`);
  if (invocation.nodeId === "deployment") {
    return result({
      outputs: [
        {
          name: "endpoint",
          kind: "value",
          schemaId: "example.endpoint@1",
          value: "http://test.local",
        },
      ],
    });
  }
  if (invocation.nodeId === "report") {
    const directory = path.join(
      context.workspaceRoot,
      invocation.workspace.evidence,
    );
    fs.writeFileSync(
      path.join(directory, "report.xml"),
      '<testsuite tests="1"/>',
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "junit",
          type: "report",
          file: "report.xml",
          mediaType: "application/junit+xml",
        },
      ],
      outputs: [{ name: "report", kind: "artifact", evidenceId: "junit" }],
    });
  }
  if (invocation.nodeId === "retry" && invocation.attemptNumber === 1) {
    return result({
      outcome: "failed",
      summary: "first failure",
      counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
    });
  }
  if (invocation.nodeId === "failure") {
    return result({
      outcome: "failed",
      summary: "failed",
      counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
    });
  }
  if (invocation.nodeId === "provider-skip") {
    return result({
      outcome: "skipped",
      summary: "provider skipped",
      counts: { total: 1, passed: 0, failed: 0, skipped: 1 },
    });
  }
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  if (invocation.nodeId.startsWith("serial-")) {
    serialActive += 1;
    maximumSerial = Math.max(maximumSerial, serialActive);
  }
  await new Promise((resolve) => setTimeout(resolve, 15));
  if (invocation.nodeId.startsWith("serial-")) serialActive -= 1;
  active -= 1;
  return result();
});

const mainPlan = plan(
  {
    consumeEndpoint: {
      uses: "example.endpoint-consumer@1",
      inputs: { target: { from: "deployment", output: "endpoint" } },
    },
    consumeReport: {
      uses: "example.report-consumer@1",
      inputs: { report: { from: "report", output: "report" } },
    },
    retry: { uses: "example.generic@1" },
    failure: { uses: "example.generic@1" },
    diagnose: {
      uses: "example.generic@1",
      needs: [{ nodeId: "failure", acceptedResults: ["failed"] }],
    },
    rejected: { uses: "example.generic@1", needs: ["failure"] },
    "provider-skip": { uses: "example.generic@1" },
    "after-provider-skip": {
      uses: "example.generic@1",
      needs: [{ nodeId: "provider-skip", acceptedResults: ["skipped"] }],
    },
    conditional: {
      uses: "example.generic@1",
      when: { changedPaths: ["frontend/**"] },
    },
    "serial-a": { uses: "example.generic@1", concurrencyGroup: "serial" },
    "serial-b": { uses: "example.generic@1", concurrencyGroup: "serial" },
    matrix: {
      uses: "example.generic@1",
      matrix: { runtime: ["node22", "node24"] },
    },
  },
  {
    deployment: { uses: "example.deployment@1" },
    report: { uses: "example.report@1" },
  },
  { serial: 1 },
);

const main = await new LocalTestPlanRunner({
  plan: mainPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: artifacts,
  maximumConcurrency: 4,
  loader,
  id,
}).run();
const durableAttemptState = JSON.parse(
  fs.readFileSync(
    path.join(artifacts, "observability", "attempts", "attempt-store.json"),
    "utf8",
  ),
) as { results: Array<{ result: WorkerAttemptResultV1 }>; closures: unknown[] };
assert.equal(
  durableAttemptState.results.length,
  main.attempts.length,
  "live Buster attempts must persist terminal results before return",
);
assert.equal(
  durableAttemptState.closures.length,
  main.attempts.length,
  "live Buster attempts must persist producer closures before return",
);
for (const stored of durableAttemptState.results) {
  const expected = `sha256:${crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        authorityId: `test-runner:${mainPlan.planDigest}`,
        receiptId: stored.result.receipt.receiptId,
        resultDigest: stored.result.resultDigest,
      }),
    )
    .digest("hex")}`;
  assert.equal(
    stored.result.receipt.receiptDigest,
    expected,
    "durable result receipt must attest the recomputed durable result digest",
  );
}
assert.equal(main.nodes.length, mainPlan.nodes.length);
assert.equal(
  main.nodes.find((node) => node.nodeId === "retry")?.unstable,
  true,
  "fail-then-pass is unstable",
);
assert.equal(
  main.attempts.filter((attempt) => attempt.nodeId === "retry").length,
  2,
  "the default retry preserves both attempts",
);
assert.equal(
  main.nodes.find((node) => node.nodeId === "failure")?.outcome,
  "failed",
);
assert.equal(
  calls.get("diagnose"),
  1,
  "a result-filter dependency can run after failure",
);
assert.equal(
  main.nodes.find((node) => node.nodeId === "rejected")?.state,
  "skipped",
);
assert.equal(
  main.nodes.find((node) => node.nodeId === "conditional")?.state,
  "skipped",
);
assert.equal(
  main.nodes.find((node) => node.nodeId === "provider-skip")?.outcome,
  "skipped",
);
assert.equal(
  calls.get("after-provider-skip"),
  1,
  "a provider skip remains a completed attempt and can satisfy a result filter",
);
assert.equal(calls.has("conditional"), false);
assert.equal(maximumActive > 1, true, "independent nodes run in parallel");
assert.equal(maximumSerial, 1, "the named concurrency limit is enforced");
assert.equal(
  main.nodes.filter((node) => node.nodeId.startsWith("matrix/matrix-")).length,
  2,
  "each matrix variation runs",
);
assert.equal(observedInputs.get("consumeEndpoint")?.[0]?.kind, "value");
assert.equal(observedInputs.get("consumeReport")?.[0]?.kind, "artifact");
assert.match(
  observedInputs.get("consumeReport")?.[0]?.kind === "artifact"
    ? observedInputs.get("consumeReport")![0]!.artifact.storageUrl
    : "",
  /\/observability\/attempts\/blobs\//,
  "dependent nodes must consume the durable artifact reference",
);
assert.equal(
  main.attempts.some((attempt) =>
    attempt.evidence.some((item) => item.type === "report"),
  ),
  true,
);
assert.equal(
  main.attempts.every((attempt) => attempt.resources.cpuTimeMs === 1),
  true,
);
assert.equal(main.cleanupErrors.length, 0);
assert.equal(
  loader.cleanups.some((entry) => entry.startsWith("deployment:")),
  true,
  "fixture cleanup runs after the graph",
);
const independentPlan = plan({
  independent: { uses: "example.generic@1" },
});
const independent = await new LocalTestPlanRunner({
  plan: independentPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: artifacts,
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async () => result()),
  id,
}).run();
assert.equal(
  independent.nodes[0]?.outcome,
  "passed",
  "a completed plan in the shared run store must not block another plan",
);
let admissionOutageCalls = 0;
const outageArtifactRoot = path.join(temporary, "admission-outage-artifacts");
const admissionOutagePlan = plan({
  admissionOutage: { uses: "example.generic@1", retries: 2 },
});
const unavailableAdmission = new FileObservabilityAdmissionStore(
  path.join(outageArtifactRoot, "observability", "admission"),
  {
    maximumIngressBytes: 10000,
    maximumRecords: 10,
    maximumBytes: 100000,
    maximumQuarantineRecords: 10,
    maximumQuarantineBytes: 10000,
  },
);
Object.defineProperty(unavailableAdmission, "admit", {
  value: async () => {
    throw new Error("OBSERVABILITY_ADMISSION_UNAVAILABLE");
  },
});
Object.defineProperty(unavailableAdmission, "admitAndRead", {
  value: async () => {
    throw new Error("OBSERVABILITY_ADMISSION_UNAVAILABLE");
  },
});
const admissionOutage = await new LocalTestPlanRunner({
  plan: admissionOutagePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: outageArtifactRoot,
  maximumConcurrency: 1,
  observabilityAdmissionStore: unavailableAdmission,
  loader: new BehaviorLoader(async () => {
    admissionOutageCalls += 1;
    return result();
  }),
  id,
}).run();
assert.equal(
  admissionOutage.nodes[0]?.outcome,
  "passed",
  "durably completed provider work must not become a provider failure during an admission outage",
);
assert.equal(
  admissionOutageCalls,
  1,
  "an admission outage must not execute a completed provider again",
);
const outageState = JSON.parse(
  fs.readFileSync(
    path.join(
      outageArtifactRoot,
      "observability",
      "attempts",
      "attempt-store.json",
    ),
    "utf8",
  ),
) as { results: unknown[]; closures: unknown[] };
assert.equal(
  outageState.results.length,
  1,
  "the completed result and retryable intent must remain durable",
);
assert.equal(
  outageState.closures.length,
  0,
  "the closure remains pending until admission recovers",
);
await assert.rejects(
  () =>
    new LocalTestPlanRunner({
      plan: admissionOutagePlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: outageArtifactRoot,
      maximumConcurrency: 1,
      loader: new BehaviorLoader(async () => {
        admissionOutageCalls += 1;
        return result();
      }),
      id,
    }).run(),
  /TEST_RUNNER_RECOVERY_OWNED_BY_NOVA:1/,
  "a restarted Buster must hand durable completion recovery to Nova",
);
assert.equal(
  admissionOutageCalls,
  1,
  "Buster restart must not execute completed provider work again",
);
await assert.rejects(
  () =>
    new LocalTestPlanRunner({
      plan: admissionOutagePlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: outageArtifactRoot,
      maximumConcurrency: 1,
      loader: new BehaviorLoader(async () => {
        admissionOutageCalls += 1;
        return result();
      }),
      id,
    }).run(),
  /TEST_RUNNER_RECOVERY_OWNED_BY_NOVA:1/,
  "a durable closure must still keep recovery owned by Nova",
);
assert.equal(
  admissionOutageCalls,
  1,
  "Buster must not execute provider work after its closure is durable",
);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: artifacts,
      maximumConcurrency: 1,
      cleanupTimeoutMs: 2_147_483_648,
    }),
  /TEST_RUNNER_CLEANUP_TIMEOUT_INVALID/,
);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: path.join(workspace, "artifacts"),
      maximumConcurrency: 1,
    }),
  /TEST_RUNNER_ARTIFACT_ROOT_OVERLAPS_WORKSPACE/,
);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: temporary,
      maximumConcurrency: 1,
    }),
  /TEST_RUNNER_ARTIFACT_ROOT_OVERLAPS_WORKSPACE/,
);
const outsideObservabilityRoot = path.join(
  temporary,
  "outside-observability-root",
);
fs.mkdirSync(outsideObservabilityRoot);
const linkedObservabilityRoot = path.join(
  temporary,
  "linked-observability-root",
);
fs.symlinkSync(outsideObservabilityRoot, linkedObservabilityRoot);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: path.join(temporary, "symlink-observability-artifacts"),
      observabilityRoot: linkedObservabilityRoot,
      maximumConcurrency: 1,
    }),
  /TEST_RUNNER_OBSERVABILITY_ROOT_SYMLINK/,
  "runner must reject a symlinked observability root",
);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: path.join(temporary, "workspace-observability-artifacts"),
      observabilityRoot: path.join(workspace, "observability"),
      maximumConcurrency: 1,
    }),
  /TEST_RUNNER_OBSERVABILITY_ROOT_OVERLAPS_WORKSPACE/,
  "provider-writable workspace must not contain durable observability state",
);
const linkedArtifactRoot = path.join(temporary, "linked-artifact-root");
fs.mkdirSync(path.join(workspace, "linked-artifacts"));
fs.symlinkSync(path.join(workspace, "linked-artifacts"), linkedArtifactRoot);
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: mainPlan,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: linkedArtifactRoot,
      observabilityRoot: path.join(temporary, "linked-artifact-observability"),
      maximumConcurrency: 1,
    }),
  /TEST_RUNNER_ARTIFACT_ROOT_OVERLAPS_WORKSPACE/,
);

const timeoutLoader = new BehaviorLoader(
  async () => new Promise<ProviderResultV1>(() => undefined),
);
const timeoutPlan = plan({
  timeout: { uses: "example.generic@1", timeoutMs: 5, retries: 0 },
});
const timedOut = await new LocalTestPlanRunner({
  plan: timeoutPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "timeout-artifacts"),
  maximumConcurrency: 1,
  loader: timeoutLoader,
  id,
}).run();
assert.equal(timedOut.nodes[0]?.state, "timed_out");
assert.equal(
  timeoutLoader.cleanups.length,
  1,
  "cleanup is requested after a timeout",
);

const cancelController = new AbortController();
const cancelLoader = new BehaviorLoader(
  async (_invocation, context) =>
    new Promise<ProviderResultV1>((_resolve, reject) => {
      context.signal.addEventListener(
        "abort",
        () => reject(context.signal.reason),
        { once: true },
      );
      setTimeout(() => cancelController.abort(new Error("cancel test")), 5);
    }),
);
const cancelPlan = plan({
  cancelled: { uses: "example.generic@1", retries: 0 },
});
const cancelled = await new LocalTestPlanRunner({
  plan: cancelPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cancel-artifacts"),
  maximumConcurrency: 1,
  loader: cancelLoader,
  signal: cancelController.signal,
  id,
}).run();
assert.equal(cancelled.nodes[0]?.state, "cancelled");

const loadCancelController = new AbortController();
let lateLoadTerminated = 0;
let lateLoadCleaned = false;
const loadCancelPlan = plan({
  loadCancelled: { uses: "example.generic@1", retries: 0 },
});
const loadCancelled = await new LocalTestPlanRunner({
  plan: loadCancelPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "load-cancel-artifacts"),
  maximumConcurrency: 1,
  signal: loadCancelController.signal,
  loader: {
    load: async () => {
      setTimeout(
        () => loadCancelController.abort(new Error("cancel provider load")),
        5,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        supportsCleanup: async () => true,
        execute: async () => result(),
        cleanup: async () => {
          lateLoadCleaned = true;
        },
        terminate: async () => {
          lateLoadTerminated += 1;
        },
        resources: () => ({
          cpuTimeMs: 1,
          maximumMemoryBytes: 1,
          maximumProcesses: 1,
        }),
      };
    },
  },
  id,
}).run();
assert.equal(loadCancelled.nodes[0]?.state, "cancelled");
assert.equal(
  lateLoadTerminated,
  1,
  "cancellation waits for and terminates an in-flight provider load exactly once",
);
assert.equal(
  lateLoadCleaned,
  false,
  "a provider that never started does not receive cleanup",
);

const resourcePlan = plan({
  resource: { uses: "example.generic@1", retries: 0, limits: { cpuMillis: 1 } },
});
const resourceFailure = await new LocalTestPlanRunner({
  plan: resourcePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "resource-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(
    async () => result(),
    () => ({ cpuTimeMs: 2, maximumMemoryBytes: 1, maximumProcesses: 1 }),
  ),
  id,
}).run();
assert.equal(resourceFailure.nodes[0]?.state, "errored");
assert.equal(resourceFailure.attempts[0]?.summary, "TEST_PROVIDER_CPU_LIMIT");

const logPlan = plan({
  logLimit: { uses: "example.generic@1", retries: 0, limits: { logBytes: 1 } },
});
const logFailure = await new LocalTestPlanRunner({
  plan: logPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "log-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (_invocation, context) => {
    context.log("stdout", "too much output");
    return result();
  }),
  id,
}).run();
assert.equal(logFailure.nodes[0]?.state, "errored");
assert.equal(logFailure.attempts[0]?.summary, "TEST_PROVIDER_LOG_LIMIT");

const logHangStarted = Date.now();
const logHang = await new LocalTestPlanRunner({
  plan: logPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "log-hang-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (_invocation, context) => {
    context.log("stdout", "too much output");
    return new Promise<ProviderResultV1>(() => undefined);
  }),
  id,
}).run();
assert.equal(logHang.attempts[0]?.summary, "TEST_PROVIDER_LOG_LIMIT");
assert.equal(
  Date.now() - logHangStarted < 1_000,
  true,
  "the log limit stops a provider that does not return",
);

const reservedLogId = await new LocalTestPlanRunner({
  plan: plan({ reservedLog: { uses: "example.generic@1", retries: 0 } }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "reserved-log-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    fs.writeFileSync(
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "claimed.txt",
      ),
      "claimed",
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "runner-log",
          type: "log",
          file: "claimed.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(
  reservedLogId.attempts[0]?.summary,
  "TEST_PROVIDER_EVIDENCE_ID_RESERVED:runner-log",
);

const duplicateEvidencePath = await new LocalTestPlanRunner({
  plan: plan({
    duplicateEvidencePath: { uses: "example.generic@1", retries: 0 },
  }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "duplicate-evidence-path-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    fs.writeFileSync(
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "shared.txt",
      ),
      "shared",
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "report",
          type: "report",
          file: "shared.txt",
          mediaType: "text/plain",
        },
        {
          evidenceId: "diagnostic",
          type: "diagnostic",
          file: "shared.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(
  duplicateEvidencePath.attempts[0]?.summary,
  "TEST_PROVIDER_EVIDENCE_DUPLICATE:diagnostic",
  "one physical file has one evidence identity",
);

const artifactPlan = plan({
  artifactLimit: {
    uses: "example.generic@1",
    retries: 0,
    limits: { artifactBytes: 1 },
  },
});
const artifactFailure = await new LocalTestPlanRunner({
  plan: artifactPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "artifact-limit-store"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    fs.writeFileSync(
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "large.txt",
      ),
      "large",
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "large",
          type: "report",
          file: "large.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(artifactFailure.nodes[0]?.state, "errored");
assert.equal(
  artifactFailure.attempts[0]?.summary,
  "TEST_PROVIDER_ARTIFACT_BYTE_LIMIT",
);

const artifactFailureWithDiagnostic = await new LocalTestPlanRunner({
  plan: plan({
    artifactFailureWithDiagnostic: {
      uses: "example.generic@1",
      retries: 0,
      limits: { artifactBytes: 5, artifactFiles: 1 },
      evidence: {
        onPass: ["report"],
        onFail: ["report"],
        onError: ["diagnostic"],
      },
    },
  }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "artifact-limit-diagnostic-store"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    const root = path.join(
      context.workspaceRoot,
      invocation.workspace.evidence,
    );
    fs.writeFileSync(path.join(root, "large.txt"), "123456");
    fs.writeFileSync(path.join(root, "diagnostic.txt"), "error");
    return result({
      evidenceFiles: [
        {
          evidenceId: "large",
          type: "report",
          file: "large.txt",
          mediaType: "text/plain",
        },
        {
          evidenceId: "diagnostic",
          type: "diagnostic",
          file: "diagnostic.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(artifactFailureWithDiagnostic.nodes[0]?.state, "errored");
assert.equal(
  artifactFailureWithDiagnostic.attempts[0]?.summary,
  "TEST_PROVIDER_ARTIFACT_BYTE_LIMIT",
);
assert.deepEqual(
  artifactFailureWithDiagnostic.attempts[0]?.evidence.map(
    (item) => item.evidenceId,
  ),
  ["diagnostic"],
  "normal evidence staging failure keeps independently bounded error evidence",
);

const symlinkEvidence = await new LocalTestPlanRunner({
  plan: plan({ symlink: { uses: "example.generic@1", retries: 0 } }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "symlink-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    fs.symlinkSync(
      "/etc/passwd",
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "escaped.txt",
      ),
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "escaped",
          type: "report",
          file: "escaped.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(symlinkEvidence.nodes[0]?.state, "errored");
assert.match(
  symlinkEvidence.attempts[0]?.summary ?? "",
  /TEST_EVIDENCE_PATH_FORBIDDEN/,
);

const cleanupDeletesEvidence = await new LocalTestPlanRunner({
  plan: plan({
    cleanupDeletesEvidence: { uses: "example.generic@1", retries: 0 },
  }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-deletes-evidence-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async (_entry, invocation) => ({
      supportsCleanup: async () => true,
      execute: async (_value, context) => {
        fs.writeFileSync(
          path.join(
            context.workspaceRoot,
            invocation.workspace.evidence,
            "report.xml",
          ),
          "<testsuite/>",
        );
        return result({
          evidenceFiles: [
            {
              evidenceId: "report",
              type: "report",
              file: "report.xml",
              mediaType: "application/xml",
            },
          ],
        });
      },
      cleanup: async () => {
        fs.rmSync(path.join(workspace, invocation.workspace.evidence), {
          recursive: true,
          force: true,
        });
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(cleanupDeletesEvidence.nodes[0]?.outcome, "passed");
assert.equal(
  cleanupDeletesEvidence.attempts[0]?.evidence.some(
    (item) => item.evidenceId === "report",
  ),
  true,
  "declared evidence is staged before provider cleanup",
);

const mutableProviderResult = result();
const cleanupMutatesResult = await new LocalTestPlanRunner({
  plan: plan({
    cleanupMutatesResult: { uses: "example.generic@1", retries: 0 },
  }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-mutates-result-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async () => ({
      supportsCleanup: async () => true,
      execute: async () => mutableProviderResult,
      cleanup: async () => {
        (mutableProviderResult as { outcome: string }).outcome = "failed";
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(
  cleanupMutatesResult.nodes[0]?.outcome,
  "passed",
  "cleanup cannot mutate the validated provider-result snapshot",
);

const nestedEvidence = await new LocalTestPlanRunner({
  plan: plan({ nestedEvidence: { uses: "example.generic@1", retries: 0 } }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "nested-evidence-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    const directory = path.join(
      context.workspaceRoot,
      invocation.workspace.evidence,
      "reports",
      "unit",
    );
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "report.xml"), "<testsuite/>");
    return result({
      evidenceFiles: [
        {
          evidenceId: "nested-report",
          type: "report",
          file: "reports/unit/report.xml",
          mediaType: "application/xml",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(
  nestedEvidence.nodes[0]?.outcome,
  "passed",
  "nested evidence paths remain valid",
);

const parentSymlinkEvidence = await new LocalTestPlanRunner({
  plan: plan({ parentSymlink: { uses: "example.generic@1", retries: 0 } }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "parent-symlink-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    const outside = path.join(temporary, "outside-evidence");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "report.xml"), "outside");
    fs.symlinkSync(
      outside,
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "reports",
      ),
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "parent-link",
          type: "report",
          file: "reports/report.xml",
          mediaType: "application/xml",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(parentSymlinkEvidence.nodes[0]?.state, "errored");
assert.match(
  parentSymlinkEvidence.attempts[0]?.summary ?? "",
  /TEST_EVIDENCE_PATH_FORBIDDEN/,
);

const unselectedErrorEvidence = await new LocalTestPlanRunner({
  plan: plan({
    diagnostics: {
      uses: "example.generic@1",
      retries: 0,
      limits: { artifactBytes: 1 },
      evidence: { onPass: [], onFail: [], onError: ["report"] },
    },
  }),
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "unselected-error-evidence-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    fs.writeFileSync(
      path.join(
        context.workspaceRoot,
        invocation.workspace.evidence,
        "diagnostic.txt",
      ),
      "large",
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "diagnostic",
          type: "report",
          file: "diagnostic.txt",
          mediaType: "text/plain",
        },
      ],
    });
  }),
  id,
}).run();
assert.equal(
  unselectedErrorEvidence.nodes[0]?.outcome,
  "passed",
  "unselected error evidence cannot fail a successful attempt",
);

const capabilityPlan = plan({
  capability: { uses: "example.capability@1", retries: 0 },
});
const denied = await new LocalTestPlanRunner({
  plan: capabilityPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "denied-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async () => result()),
  id,
}).run();
assert.equal(
  denied.attempts[0]?.summary,
  "TEST_PROVIDER_CAPABILITY_DENIED:network.http",
);
let invokedCapability = "";
const allowed = await new LocalTestPlanRunner({
  plan: capabilityPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "allowed-artifacts"),
  maximumConcurrency: 1,
  grants: new Map([
    ["example.runner:capability", ["network.http", "undeclared.extra"]],
  ]),
  capabilityInvoker: {
    invoke: async (capability) => {
      invokedCapability = capability;
      return {};
    },
  },
  loader: new BehaviorLoader(async (_invocation, context) => {
    await context.invoke("network.http", {
      operation: "GET",
      resource: { type: "url", canonicalId: "http://test.local" },
      payload: {},
    });
    return result();
  }),
  id,
}).run();
assert.equal(allowed.nodes[0]?.outcome, "passed");
assert.equal(invokedCapability, "network.http");
assert.deepEqual(
  allowed.attempts[0]?.provider.contractId,
  "example.capability@1",
);

const cleanupPlan = plan({
  cleanup: { uses: "example.generic@1", retries: 0 },
});
const cleanupFailure = await new LocalTestPlanRunner({
  plan: cleanupPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async () => ({
      supportsCleanup: async () => true,
      execute: async () => result(),
      cleanup: async () => {
        throw new Error("cleanup failed");
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(cleanupFailure.nodes[0]?.state, "errored");
assert.equal(cleanupFailure.cleanupErrors[0]?.message, "cleanup failed");

const cleanupEvidencePlan = plan({
  cleanupEvidence: {
    uses: "example.generic@1",
    retries: 0,
    limits: { artifactBytes: 5, artifactFiles: 1 },
    evidence: {
      onPass: ["report"],
      onFail: ["report"],
      onError: ["diagnostic"],
    },
  },
});
const cleanupErrorEvidence = await new LocalTestPlanRunner({
  plan: cleanupEvidencePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-error-evidence-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async (_entry, invocation) => ({
      supportsCleanup: async () => true,
      execute: async (_value, context) => {
        const root = path.join(
          context.workspaceRoot,
          invocation.workspace.evidence,
        );
        fs.writeFileSync(path.join(root, "pass.txt"), "12345");
        fs.writeFileSync(path.join(root, "error.txt"), "abcde");
        return result({
          evidenceFiles: [
            {
              evidenceId: "pass-report",
              type: "report",
              file: "pass.txt",
              mediaType: "text/plain",
            },
            {
              evidenceId: "error-diagnostic",
              type: "diagnostic",
              file: "error.txt",
              mediaType: "text/plain",
            },
          ],
        });
      },
      cleanup: async () => {
        throw new Error("cleanup failed");
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(cleanupErrorEvidence.nodes[0]?.state, "errored");
assert.deepEqual(
  cleanupErrorEvidence.attempts[0]?.evidence.map((item) => item.evidenceId),
  ["error-diagnostic"],
  "a later cleanup fault keeps its independently bounded error evidence",
);

const cleanupDependencyPlan = plan({
  cleanupSource: { uses: "example.generic@1", retries: 0 },
  cleanupConsumer: {
    uses: "example.generic@1",
    needs: ["cleanupSource"],
    retries: 0,
  },
});
const cleanupDependency = await new LocalTestPlanRunner({
  plan: cleanupDependencyPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-dependency-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async () => ({
      supportsCleanup: async () => true,
      execute: async () => result(),
      cleanup: async () => {
        throw new Error("cleanup failed");
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(
  cleanupDependency.nodes.find((node) => node.nodeId === "cleanupSource")
    ?.state,
  "errored",
);
assert.equal(
  cleanupDependency.nodes.find((node) => node.nodeId === "cleanupConsumer")
    ?.state,
  "skipped",
  "cleanup failure is visible before dependent scheduling",
);

let cleanupTerminated = false;
const cleanupTimeout = await new LocalTestPlanRunner({
  plan: cleanupPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cleanup-timeout-artifacts"),
  maximumConcurrency: 1,
  cleanupTimeoutMs: 10,
  loader: {
    load: async () => ({
      supportsCleanup: async () => true,
      execute: async () => result(),
      cleanup: async () => new Promise<void>(() => undefined),
      terminate: async () => {
        cleanupTerminated = true;
      },
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(cleanupTimeout.nodes[0]?.state, "errored");
assert.equal(
  cleanupTerminated,
  true,
  "cleanup timeout terminates the provider",
);

const terminationFailurePlan = plan({
  terminationFailure: { uses: "example.generic@1", timeoutMs: 5 },
});
const terminationFailure = await new LocalTestPlanRunner({
  plan: terminationFailurePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "termination-failure-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async () => ({
      supportsCleanup: async () => true,
      execute: async () => new Promise<ProviderResultV1>(() => undefined),
      cleanup: async () => undefined,
      terminate: async () => {
        throw new Error("termination failed");
      },
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(
  terminationFailure.attempts.length,
  1,
  "failed provider termination prevents retry overlap",
);
assert.equal(terminationFailure.attempts[0]?.summary, "termination failed");

const missingCleanupPlan = plan(
  {},
  { missingCleanup: { uses: "example.deployment@1", retries: 0 } },
);
let unsupportedFixtureCleaned = false;
const missingCleanup = await new LocalTestPlanRunner({
  plan: missingCleanupPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "missing-cleanup-artifacts"),
  maximumConcurrency: 1,
  loader: {
    load: async () => ({
      supportsCleanup: async () => false,
      execute: async () => result(),
      cleanup: async () => {
        unsupportedFixtureCleaned = true;
      },
      terminate: async () => undefined,
      resources: () => ({
        cpuTimeMs: 1,
        maximumMemoryBytes: 1,
        maximumProcesses: 1,
      }),
    }),
  },
  id,
}).run();
assert.equal(missingCleanup.nodes[0]?.state, "errored");
assert.equal(
  missingCleanup.attempts[0]?.summary,
  "TEST_PROVIDER_FIXTURE_CLEANUP_REQUIRED",
);
assert.equal(
  unsupportedFixtureCleaned,
  true,
  "fixture initialization failure still receives cleanup",
);

const missingOutputPlan = plan(
  {
    missingLink: {
      uses: "example.report-consumer@1",
      inputs: { report: { from: "optional", output: "report" } },
      retries: 0,
    },
    unrelated: { uses: "example.generic@1", retries: 0 },
  },
  { optional: { uses: "example.optional-report@1", retries: 0 } },
);
const missingOutput = await new LocalTestPlanRunner({
  plan: missingOutputPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "missing-output-artifacts"),
  maximumConcurrency: 2,
  loader: new BehaviorLoader(async () => result()),
  id,
}).run();
assert.equal(
  missingOutput.nodes.find((node) => node.nodeId === "missingLink")?.state,
  "errored",
);
assert.match(
  missingOutput.attempts.find((attempt) => attempt.nodeId === "missingLink")
    ?.summary ?? "",
  /TEST_PLAN_LINK_OUTPUT_MISSING/,
);
assert.equal(
  missingOutput.nodes.find((node) => node.nodeId === "unrelated")?.outcome,
  "passed",
  "one missing output does not stop other nodes",
);

const tampered = structuredClone(timeoutPlan);
tampered.nodes[0]!.timeoutMs = 99;
assert.throws(
  () =>
    new LocalTestPlanRunner({
      plan: tampered,
      registry,
      workspaceRoot: workspace,
      repositoryRoot: repository,
      artifactRoot: path.join(temporary, "tampered-artifacts"),
      maximumConcurrency: 1,
    }),
  /TEST_PLAN_DIGEST_MISMATCH/,
);

const loadedPlan = plan({ loaded: { uses: "example.generic@1", retries: 0 } });
const registeredLoader = new RegisteredTestProviderLoader();
const loaded = await new LocalTestPlanRunner({
  plan: loadedPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "loaded-artifacts"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  id,
}).run();
assert.equal(
  loaded.nodes[0]?.outcome,
  "passed",
  "the registered provider export is loaded and executed",
);

const isolatedArtifactPlan = plan(
  {
    isolatedConsumer: {
      uses: "example.report-consumer@1",
      inputs: { report: { from: "isolatedProducer", output: "report" } },
      retries: 0,
    },
  },
  { isolatedProducer: { uses: "example.report@1", retries: 0 } },
);
const isolatedArtifact = await new LocalTestPlanRunner({
  plan: isolatedArtifactPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "isolated-artifact-store"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  id,
}).run();
assert.equal(
  isolatedArtifact.nodes.find((node) => node.nodeId === "isolatedConsumer")
    ?.outcome,
  "passed",
  "an isolated consumer can read only its declared stored artifact",
);
const producerAttempt = isolatedArtifact.attempts.find((attempt) => attempt.nodeId === "isolatedProducer");
assert.equal(producerAttempt?.outcome, "passed", "report facts do not replace the provider verdict");
assert.deepEqual(producerAttempt?.reports[0]?.counts,
  { total: 1, passed: 0, failed: 1, errored: 0, skipped: 0 },
  "the frozen report adapter normalizes the declared report artifact");
assert.equal(producerAttempt?.reports[0]?.sourceArtifact.type, "test-report",
  "the normalized result retains the exact source artifact identity");
const storedIsolated = JSON.parse(fs.readFileSync(
  path.join(temporary, "isolated-artifact-store", "observability", "attempts", "attempt-store.json"), "utf8",
)) as { results: Array<{ result: WorkerAttemptResultV1 }> };
const durableProducer = storedIsolated.results.find(({ result: stored }) => stored.attemptId === producerAttempt?.attemptId)?.result;
assert.deepEqual((durableProducer?.specialistResult?.values.reports as unknown[] | undefined)?.[0],
  producerAttempt?.reports[0], "normalized report facts are part of the durable worker result");

const invalidReportPlan = plan({}, {
  isolatedProducer: { uses: "example.report@1", config: { invalidReport: true }, retries: 0 },
});
const invalidReport = await new LocalTestPlanRunner({
  plan: invalidReportPlan, registry, workspaceRoot: workspace, repositoryRoot: repository,
  artifactRoot: path.join(temporary, "invalid-report-store"), maximumConcurrency: 1,
  loader: registeredLoader, id,
}).run();
assert.equal(invalidReport.attempts[0]?.executionState, "errored",
  "a report adapter failure is an execution error");
assert.equal(invalidReport.attempts[0]?.evidence[0]?.type, "test-report",
  "the original report remains durable when normalization fails");

class CapturingRuntime implements WorkerAttemptRuntime {
  readonly results: WorkerAttemptResultV1[] = [];
  async runAttempt<T>(
    _envelope: Parameters<WorkerAttemptRuntime["runAttempt"]>[0],
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const value = await execute(new AbortController().signal);
    if (
      typeof value === "object" &&
      value !== null &&
      "schemaVersion" in value &&
      value.schemaVersion === "worker-attempt-result.v1"
    ) {
      this.results.push(value as WorkerAttemptResultV1);
    }
    return value;
  }
}

function parityView(value: Awaited<ReturnType<TestPlanRunner["run"]>>) {
  return {
    nodes: value.nodes.map(({ state, outcome, unstable, skipReason }) => ({
      state,
      outcome,
      unstable,
      skipReason,
    })),
    attempts: value.attempts.map((attempt) => ({
      executionState: attempt.executionState,
      outcome: attempt.outcome,
      summary: attempt.summary,
      counts: attempt.counts,
      findings: attempt.findings,
      metrics: attempt.metrics,
      evidence: attempt.evidence.map(({ evidenceId, type, artifact }) => ({
        evidenceId,
        type,
        mediaType: artifact.mediaType,
        contentDigest: artifact.contentDigest,
        sizeBytes: artifact.sizeBytes,
      })),
      outputs: attempt.outputs,
      exitCode: attempt.exitCode,
      signal: attempt.signal,
    })),
    cleanupErrors: value.cleanupErrors,
  };
}

const parityPlan = plan({
  parity: {
    uses: "example.generic@1",
    retries: 0,
    evidence: { onPass: [], onFail: [], onError: [] },
  },
});
const parityBehavior = async () => result({ summary: "parity" });
const directRuntime = new CapturingRuntime();
let directSequence = 0;
const directResult = await new LocalTestPlanRunner({
  plan: parityPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "direct-parity-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(parityBehavior),
  workerRuntime: directRuntime,
  id: () => `parity-${++directSequence}`,
}).run();
let localSequence = 0;
const localResult = await new LocalTestPlanRunner({
  plan: parityPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "local-parity-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(parityBehavior),
  id: () => `parity-${++localSequence}`,
}).run();
assert.deepEqual(
  parityView(localResult),
  parityView(directResult),
  "the local worker lifecycle preserves the direct Phase 5 result facts",
);

const evidenceRuntime = new CapturingRuntime();
const evidencePlan = plan(
  {},
  { report: { uses: "example.report@1", retries: 0 } },
);
const evidenceResult = await new LocalTestPlanRunner({
  plan: evidencePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "worker-evidence-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation, context) => {
    context.log("stdout", "report generated\n");
    const directory = path.join(
      context.workspaceRoot,
      invocation.workspace.evidence,
    );
    fs.writeFileSync(
      path.join(directory, "report.xml"),
      '<testsuite tests="1"/>',
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "junit",
          type: "report",
          file: "report.xml",
          mediaType: "application/junit+xml",
        },
      ],
      outputs: [{ name: "report", kind: "artifact", evidenceId: "junit" }],
    });
  }),
  workerRuntime: evidenceRuntime,
  id,
}).run();
assert.equal(evidenceResult.nodes[0]?.outcome, "passed");
assert.deepEqual(
  evidenceRuntime.results[0]?.evidence.map((item) => item.evidenceId).sort(),
  ["junit", "runner-log"],
  "the worker result covers Buster reports and logs",
);
assert.equal(
  evidenceRuntime.results[0]?.resources.evidenceBytes,
  evidenceRuntime.results[0]?.evidence.reduce(
    (sum, item) => sum + item.artifact.sizeBytes,
    0,
  ),
);

class RejectAfterRuntime implements WorkerAttemptRuntime {
  async runAttempt<T>(
    _envelope: Parameters<WorkerAttemptRuntime["runAttempt"]>[0],
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    await execute(new AbortController().signal);
    throw new Error("WORKER_LOCAL_CLAIM_EXPIRED");
  }
}

const rejectedArtifactRoot = path.join(temporary, "rejected-runtime-artifacts");
const rejectedRuntimeResult = await new LocalTestPlanRunner({
  plan: evidencePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: rejectedArtifactRoot,
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (invocation) => {
    const directory = path.join(workspace, invocation.workspace.evidence);
    fs.writeFileSync(
      path.join(directory, "report.xml"),
      '<testsuite tests="1"/>',
    );
    return result({
      evidenceFiles: [
        {
          evidenceId: "junit",
          type: "report",
          file: "report.xml",
          mediaType: "application/junit+xml",
        },
      ],
      outputs: [{ name: "report", kind: "artifact", evidenceId: "junit" }],
    });
  }),
  workerRuntime: new RejectAfterRuntime(),
  id,
}).run();
assert.equal(
  rejectedRuntimeResult.nodes[0]?.state,
  "errored",
  "a worker-runtime rejection becomes one attempt failure",
);
assert.equal(
  rejectedRuntimeResult.attempts[0]?.summary,
  "WORKER_LOCAL_CLAIM_EXPIRED",
);
assert.deepEqual(
  rejectedRuntimeResult.attempts[0]?.evidence.map((item) => item.evidenceId),
  ["junit"],
  "evidence completed before claim loss remains available",
);
assert.equal(
  fs.existsSync(
    path.join(
      rejectedArtifactRoot,
      "observability",
      "attempts",
      "attempt-store.json",
    ),
  ),
  false,
  "a result rejected by the worker runtime must not become a durable completion",
);
assert.deepEqual(
  fs.readdirSync(path.join(rejectedArtifactRoot, ".staging")),
  [],
  "a worker-runtime rejection removes attempt staging data",
);

const lifecyclePlan = plan({
  lifecycle: { uses: "example.generic@1", retries: 0 },
});
const lifecycleProfiles = createBusterWorkerProfiles(lifecyclePlan, registry);
const lifecycleWorker = new LocalWorkerRuntime({
  workerId: "worker:buster:local",
  workerType: "buster",
  coreVersion: "1.0.0",
  protocolVersions: ["worker-protocol.v1"],
  profiles: lifecycleProfiles,
  capacity: 1,
  drainTimeoutMs: 5,
  cancellationTimeoutMs: 500,
});
lifecycleWorker.markReady();
let lifecycleStarted!: () => void;
const lifecycleReady = new Promise<void>((resolve) => {
  lifecycleStarted = resolve;
});
const lifecycleRun = new LocalTestPlanRunner({
  plan: lifecyclePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "lifecycle-artifacts"),
  maximumConcurrency: 1,
  loader: new BehaviorLoader(async (_invocation, context) => {
    lifecycleStarted();
    await new Promise<void>((resolve) =>
      context.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    throw context.signal.reason ?? new Error("lifecycle cancelled");
  }),
  workerRuntime: lifecycleWorker,
  id,
}).run();
await lifecycleReady;
assert.equal(
  lifecycleWorker.health().capacity.active,
  1,
  "the real Buster attempt consumes worker capacity",
);
await lifecycleWorker.drain();
const lifecycleResult = await lifecycleRun;
assert.equal(lifecycleWorker.state, "stopped");
assert.equal(
  lifecycleResult.nodes[0]?.state,
  "cancelled",
  "worker draining cancels the real Buster attempt",
);

const cooperativeController = new AbortController();
const cooperativePlan = plan({
  cooperative: {
    uses: "example.generic@1",
    config: { waitForAbort: true },
    retries: 0,
  },
});
const cooperativeRun = new LocalTestPlanRunner({
  plan: cooperativePlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "cooperative-artifacts"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  signal: cooperativeController.signal,
  id,
}).run();
await waitForNamedFile(path.join(workspace, "test-attempts"), "ready.txt");
cooperativeController.abort(new Error("cancel cooperative provider"));
const cooperative = await cooperativeRun;
assert.equal(cooperative.nodes[0]?.state, "cancelled");
const attemptFiles = fs.readdirSync(path.join(workspace, "test-attempts"), {
  recursive: true,
  encoding: "utf8",
});
assert.equal(
  attemptFiles.some((file) => path.basename(file) === "aborted.txt"),
  true,
  "cancellation reaches the provider context signal before forced termination",
);

for (const forbidden of [
  "readForbidden",
  "spawnForbidden",
  "networkForbidden",
  "symlinkEscape",
]) {
  const forbiddenPlan = plan({
    forbidden: {
      uses: "example.generic@1",
      config: { [forbidden]: true },
      retries: 0,
    },
  });
  const forbiddenResult = await new LocalTestPlanRunner({
    plan: forbiddenPlan,
    registry,
    workspaceRoot: workspace,
    repositoryRoot: repository,
    artifactRoot: path.join(temporary, `${forbidden}-artifacts`),
    maximumConcurrency: 1,
    loader: registeredLoader,
    id,
  }).run();
  assert.equal(
    forbiddenResult.nodes[0]?.state,
    "errored",
    `${forbidden} is denied by the provider process boundary`,
  );
}

const providerPath = path.join(packageRoot, "dist", "provider.js");
const verifiedProviderSource = fs.readFileSync(providerPath, "utf8");
const pinnedRunPromise = new LocalTestPlanRunner({
  plan: loadedPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "pinned-artifacts"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  id,
}).run();
fs.writeFileSync(providerPath, 'throw new Error("unverified replacement");\n');
const pinnedRun = await pinnedRunPromise;
fs.writeFileSync(providerPath, verifiedProviderSource);
assert.equal(
  pinnedRun.nodes[0]?.outcome,
  "passed",
  "execution uses the verified provider snapshot, not changed installed bytes",
);
assert.deepEqual(
  fs.readdirSync(path.join(workspace, "test-provider-snapshots")),
  [],
  "provider snapshots are removed after cleanup",
);

const hardTimeoutPlan = plan({
  hardTimeout: {
    uses: "example.generic@1",
    config: { hang: true },
    timeoutMs: 20,
    retries: 0,
  },
});
const hardTimeoutStarted = Date.now();
const hardTimeout = await new LocalTestPlanRunner({
  plan: hardTimeoutPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "hard-timeout-artifacts"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  id,
}).run();
assert.equal(hardTimeout.nodes[0]?.state, "timed_out");
assert.equal(
  Date.now() - hardTimeoutStarted < 2_000,
  true,
  "a non-cooperative provider process is terminated within the bound",
);

fs.appendFileSync(providerPath, "\n// changed after registry freeze\n");
const changed = await new LocalTestPlanRunner({
  plan: loadedPlan,
  registry,
  workspaceRoot: workspace,
  repositoryRoot: repository,
  artifactRoot: path.join(temporary, "changed-artifacts"),
  maximumConcurrency: 1,
  loader: registeredLoader,
  id,
}).run();
assert.equal(changed.nodes[0]?.state, "errored");
assert.match(
  changed.attempts[0]?.summary ?? "",
  /TEST_PROVIDER_PACKAGE_DIGEST_MISMATCH/,
);

console.log(
  JSON.stringify({
    ok: true,
    nodes: main.nodes.length,
    attempts: main.attempts.length,
    unstable: main.nodes
      .filter((node) => node.unstable)
      .map((node) => node.nodeId),
  }),
);
