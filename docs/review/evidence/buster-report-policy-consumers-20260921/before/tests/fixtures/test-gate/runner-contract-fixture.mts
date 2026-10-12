import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRegistry, discoverPackages, resolveTestPlan, type NodeDeclaration, type ResolverPolicy } from "../../../skills/nova/core/src/index.ts";
import { TestPlanRunner, type TestPlanRunnerOptions, type LoadedTestProvider, type TestProviderLoader } from "../../../skills/buster/engine/src/index.ts";
import type { ProviderInvocationV1, ProviderResultV1 } from "@kubeclaw/pipeline-test-gate-contract";
import type { TestProviderInstance } from "../../../skills/common/plugin-runtime/sdk/src/index.ts";
import type { TestProviderRegistryEntry } from "../../../skills/common/plugin-runtime/foundation/registry/types.ts";

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
    if (invocation.configuration.values.logHang === true) {
      (await import('node:fs')).writeFileSync(context.workspaceRoot + '/' + invocation.workspace.scratch + '/log-hang-pid', String(process.pid));
      context.log('stdout', 'too much output');
      while (true) {}
    }
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

export { temporary, LocalTestPlanRunner, packageRoot, workspace, repository, artifacts, registry, limits, plan, result, waitForNamedFile, BehaviorLoader };
