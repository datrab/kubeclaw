import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry,
  discoverPackages,
  loadPipelineTestScope,
  resolveTestPlan,
  type ResolverPolicy,
  type SuiteTemplateV1,
} from '../../../skills/nova/core/src/index.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'test-suite-resolver-'));
const plugins = path.join(temporary, 'plugins');
const packageRoot = path.join(plugins, 'providers');
fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
fs.writeFileSync(path.join(packageRoot, 'dist', 'provider.js'), 'export function execute() { return {}; }\n');

const schemas = {
  empty: { type: 'object', additionalProperties: false },
  json: { type: 'object', additionalProperties: true },
  http: {
    type: 'object',
    additionalProperties: false,
    required: ['path'],
    properties: {
      path: { type: 'string', minLength: 1 },
      method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
      headers: {
        type: 'object',
        additionalProperties: false,
        properties: {
          userAgent: { type: 'string' },
          locale: { type: 'string' },
        },
      },
    },
  },
  unit: {
    type: 'object',
    additionalProperties: false,
    required: ['command'],
    properties: {
      command: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
      runtime: { type: 'string' },
    },
  },
};
for (const [name, schema] of Object.entries(schemas)) {
  fs.writeFileSync(path.join(packageRoot, 'schemas', `${name}.json`), `${JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema,
  }, null, 2)}\n`);
}

function provider(
  id: string,
  contractId: string,
  configSchema: string,
  options: Record<string, unknown> = {},
) {
  return {
    id,
    contractId,
    kind: 'test',
    module: 'dist/provider.js',
    export: 'execute',
    configSchema: `schemas/${configSchema}.json`,
    inputs: [],
    outputs: [],
    requiredCapabilities: [],
    retrySafe: true,
    matrixFields: [],
    reportFormats: [],
    evidenceTypes: ['log', 'report'],
    evidenceDefaults: { onPass: ['log'], onFail: ['log', 'report'], onError: ['log'] },
    ...options,
  };
}

fs.writeFileSync(path.join(packageRoot, 'plugin.json'), `${JSON.stringify({
  id: 'example.test-tools',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.2.3',
  stages: [],
  observers: [],
  adapters: [],
  testProviders: [
    provider('deployment', 'example.deployment@1', 'empty', {
      kind: 'fixture',
      outputs: [{ name: 'endpoint', kind: 'value', required: true, schemaId: 'example.endpoint@1' }],
    }),
    provider('report', 'example.report-fixture@1', 'empty', {
      kind: 'fixture',
      outputs: [{ name: 'report', kind: 'artifact', required: true, mediaTypes: ['application/junit+xml'] }],
    }),
    provider('http', 'example.http@1', 'http', {
      inputs: [{ name: 'target', kind: 'value', required: true, schemaId: 'example.endpoint@1' }],
      requiredCapabilities: ['network.http'],
    }),
    provider('consume-report', 'example.consume-report@1', 'empty', {
      inputs: [{ name: 'report', kind: 'artifact', required: true, mediaTypes: ['application/junit+xml'] }],
    }),
    provider('consume-typed-report', 'example.consume-typed-report@1', 'empty', {
      inputs: [{ name: 'report', kind: 'artifact', required: true, schemaId: 'example.junit-report@1', mediaTypes: ['application/junit+xml'] }],
    }),
    provider('unit', 'example.unit@1', 'unit', { matrixFields: ['runtime'] }),
    provider('unsafe', 'example.unsafe@1', 'unit', { retrySafe: false }),
    provider('json', 'example.json@1', 'json'),
  ],
}, null, 2)}\n`);

const registry = buildRegistry(discoverPackages({
  installationRoots: [plugins],
  trustPolicy: {
    trustedBuiltinRoots: [plugins],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:suite-resolver',
  },
  now: () => new Date('2026-08-05T16:00:00Z'),
}));

const suite: SuiteTemplateV1 = {
  schemaVersion: 'test-suite-template.v1',
  contractId: 'example.release-suite@1',
  fixtures: {
    deployment: { uses: 'example.deployment@1' },
    report: { uses: 'example.report-fixture@1' },
  },
  tests: {
    smoke: {
      uses: 'example.http@1',
      config: { path: '/', headers: { userAgent: 'suite' } },
      inputs: { target: { from: 'deployment', output: 'endpoint' } },
      concurrencyGroup: 'browser',
    },
    consume: {
      uses: 'example.consume-report@1',
      inputs: { report: { from: 'report', output: 'report' } },
    },
    conditional: {
      uses: 'example.unit@1',
      config: { command: ['npm', 'test'] },
      when: { changedPaths: ['frontend/**'] },
    },
    excluded: { uses: 'example.unit@1', config: { command: ['never'] } },
  },
  concurrencyLimits: { browser: 2 },
};

const swarm = path.join(temporary, '.swarm');
fs.mkdirSync(swarm);
const pipelinePath = path.join(swarm, 'pipeline.json');
fs.writeFileSync(pipelinePath, `${JSON.stringify({
  project: 'example-project',
  modules: {
    app: {
      title: 'Fields unrelated to tests remain valid pipeline data',
      suites: {
        quality: {
          uses: 'example.release-suite@1',
          exclude: ['excluded'],
          overrides: {
            smoke: {
              mode: 'advisory',
              config: { headers: { locale: 'en-US' } },
              evidence: { onPass: ['log', 'report'] },
            },
          },
          add: {
            extra: { uses: 'example.unit@1', config: { command: ['go', 'test', './...'] } },
          },
        },
      },
      tests: {
        direct: {
          uses: 'example.unit@1',
          config: { command: ['npm', 'run', 'direct'] },
          needs: [{ nodeId: 'quality/smoke', acceptedResults: ['failed'] }],
        },
        matrix: {
          uses: 'example.unit@1',
          config: { command: ['npm', 'test'] },
          matrix: { runtime: ['node22', 'node24'] },
        },
        unsafe: {
          uses: 'example.unsafe@1',
          config: { command: ['npm', 'test'] },
        },
      },
      concurrencyLimits: { browser: 1 },
    },
  },
  gates: {},
}, null, 2)}\n`);

const loaded = loadPipelineTestScope(pipelinePath, { moduleId: 'app', gateId: null });
assert.equal(loaded.project, 'example-project');
assert.equal('title' in loaded.declaration, false, 'the loader selects only test-plan fields');

const limits = {
  cpuMillis: 1000,
  memoryBytes: 1024 * 1024 * 1024,
  logBytes: 1024 * 1024,
  artifactBytes: 16 * 1024 * 1024,
  artifactFiles: 64,
  processes: 64,
};
const policy: ResolverPolicy = {
  defaultTimeoutMs: 60_000,
  maximumTimeoutMs: 300_000,
  defaultLimits: limits,
  maximumLimits: { ...limits, cpuMillis: 4000, memoryBytes: 4 * 1024 * 1024 * 1024 },
  maximumRetryCount: 3,
  maximumMatrixSize: 16,
  maximumNodes: 100,
  defaultConcurrencyLimit: 4,
  maximumConcurrencyLimits: { browser: 3 },
};
const resolverInput = {
  planId: 'plan:app',
  runId: 'run:1',
  project: loaded.project,
  scope: { moduleId: 'app', gateId: null },
  createdAt: '2026-08-05T16:00:00Z',
  declaration: loaded.declaration,
  suiteTemplates: [suite],
  registry,
  facts: { changedPaths: ['backend/api.ts'], moduleType: 'web', pipelineStage: 'implementation' },
  policy,
} as const;
const plan = resolveTestPlan(resolverInput);
assert.equal(plan.nodes.length, 10);
assert.equal(plan.suites.length, 1);
assert.equal(plan.suites[0]?.contractId, 'example.release-suite@1');
assert.match(plan.suites[0]?.templateDigest ?? '', /^sha256:[a-f0-9]{64}$/);
assert.equal(plan.nodes.some((node) => node.id === 'quality/excluded'), false, 'excluded tests are absent');
assert.equal(plan.nodes.filter((node) => node.parentNodeId === 'matrix').length, 2, 'matrix entries are expanded');
assert.equal(plan.concurrencyLimits.browser, 1, 'project concurrency can lower the suite value');
assert.equal(Object.isFrozen(plan), true);
assert.equal(Object.isFrozen(plan.nodes[0]), true);
assert.equal(Object.isFrozen(plan.nodes[0]?.configuration.values), true);
assert.equal(Object.isFrozen(resolverInput.scope), false, 'resolution does not freeze caller-owned input');
assert.match(plan.planDigest, /^sha256:[a-f0-9]{64}$/);
assert.equal(resolveTestPlan(resolverInput).planDigest, plan.planDigest, 'resolution is deterministic');
const laterRun = resolveTestPlan({ ...resolverInput, planId: 'plan:app:later', runId: 'run:2',
  createdAt: '2026-08-12T10:00:00Z' });
assert.deepEqual(laterRun.nodes.map((node) => [node.id, node.testIdentity]),
  plan.nodes.map((node) => [node.id, node.testIdentity]),
  'logical test identity must remain stable across plans and runs');
assert.notDeepEqual(laterRun.nodes.map((node) => node.executionId), plan.nodes.map((node) => node.executionId),
  'execution identity remains unique to the resolved plan');
const otherProject = resolveTestPlan({ ...resolverInput, planId: 'plan:other', runId: 'run:other', project: 'other-project' });
assert.notEqual(otherProject.nodes[0]?.testIdentity, plan.nodes[0]?.testIdentity,
  'project identity is part of logical test identity');

const smoke = plan.nodes.find((node) => node.id === 'quality/smoke')!;
assert.equal(smoke.mode, 'advisory');
assert.deepEqual(smoke.configuration.values, {
  path: '/',
  method: 'GET',
  headers: { userAgent: 'suite', locale: 'en-US' },
});
assert.equal(Object.isFrozen(smoke.configuration.values.headers), true);
assert.deepEqual(smoke.evidence.onPass, ['log', 'report']);
assert.deepEqual(smoke.dependencies.map((item) => item.nodeId), ['quality/deployment']);
assert.equal(plan.links.some((link) => link.from.nodeId === 'quality/deployment' && link.to.nodeId === 'quality/smoke'), true);
assert.equal(plan.links.some((link) => link.kind === 'artifact' && link.to.nodeId === 'quality/consume'), true);

const conditional = plan.nodes.find((node) => node.id === 'quality/conditional')!;
assert.equal(conditional.skipReason, 'condition changedPaths did not match');
const direct = plan.nodes.find((node) => node.id === 'direct')!;
assert.equal(direct.mode, 'blocking', 'declared tests are blocking by default');
assert.deepEqual(direct.dependencies, [{ nodeId: 'quality/smoke', acceptedResults: ['failed'] }]);
assert.equal(direct.retryCount, 1, 'retry-safe tests receive exactly one retry by default');
assert.equal(direct.provider.contractId, 'example.unit@1', 'the stable tool contract is stored');
assert.equal(direct.provider.packageVersion, '1.2.3', 'the exact provider package version is stored');
assert.match(direct.provider.contentDigest, /^sha256:[a-f0-9]{64}$/, 'the exact provider package digest is stored');
const deployment = plan.nodes.find((node) => node.id === 'quality/deployment')!;
assert.equal(deployment.kind, 'fixture');
assert.equal(deployment.mode, null, 'fixtures do not make blocking or advisory decisions');
const unsafe = plan.nodes.find((node) => node.id === 'unsafe')!;
assert.equal(unsafe.retryCount, 0, 'unsafe providers do not receive the default retry');

const allowlistPlan = resolveTestPlan({
  ...resolverInput,
  suiteTemplates: [suite, {
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.unselected-suite@1',
    tests: { hidden: { uses: 'example.unit@1', config: { command: ['hidden'] } } },
  }],
});
assert.equal(allowlistPlan.nodes.some((node) => node.id.includes('hidden')), false, 'an available but unselected suite stays disabled');

const retryPlan = resolveTestPlan({
  ...resolverInput,
  declaration: {
    tests: {
      disabled: { uses: 'example.unit@1', config: { command: ['npm'] }, retries: 0 },
      increased: { uses: 'example.unit@1', config: { command: ['npm'] }, retries: 3 },
      acceptedUnsafe: { uses: 'example.unsafe@1', config: { command: ['npm'] }, retries: 1, acceptUnsafeRetry: true },
    },
  },
});
assert.equal(retryPlan.nodes.find((node) => node.id === 'disabled')?.retryCount, 0);
assert.equal(retryPlan.nodes.find((node) => node.id === 'increased')?.retryCount, 3);
assert.equal(retryPlan.nodes.find((node) => node.id === 'acceptedUnsafe')?.retryCount, 1);

function rejects(declaration: unknown, code: string, extra: Partial<typeof resolverInput> = {}): void {
  assert.throws(() => resolveTestPlan({ ...resolverInput, declaration: declaration as typeof loaded.declaration, ...extra }),
    (error: unknown) => (error as { code?: string }).code === code, code);
}

rejects({}, 'TEST_PLAN_EMPTY');
rejects({ tests: { bad: { uses: 'missing.provider@1' } } }, 'TEST_PLAN_PROVIDER_MISSING');
rejects({ tests: { bad: { uses: 'example.http@1', config: { path: '/' } } } }, 'TEST_PLAN_INPUT_REQUIRED');
rejects({
  fixtures: { deployment: { uses: 'example.deployment@1' } },
  tests: { bad: {
    uses: 'example.http@1',
    config: { path: '/' },
    inputs: { target: { from: 'deployment', output: 'endpoint', mediaType: 'application/json' } },
  } },
}, 'TEST_PLAN_LINK_MEDIA_MISMATCH');
rejects({
  fixtures: { deployment: { uses: 'example.deployment@1' } },
  tests: { bad: {
    uses: 'example.http@1',
    config: { path: '/' },
    needs: [{ nodeId: 'deployment', acceptedResults: ['passed', 'failed'] }],
    inputs: { target: { from: 'deployment', output: 'endpoint' } },
  } },
}, 'TEST_PLAN_LINK_DEPENDENCY_INVALID');
rejects({ tests: { bad: { uses: 'example.unit@1', config: { command: 'npm test' } } } }, 'TEST_PLAN_CONFIGURATION_INVALID');
rejects({ tests: { bad: { uses: 'example.unit@1', config: { command: ['npm'] }, evidence: { onPass: ['video'] } } } }, 'TEST_PLAN_EVIDENCE_INVALID');
rejects({ tests: { bad: { uses: 'example.unsafe@1', config: { command: ['npm'] }, retries: 1 } } }, 'TEST_PLAN_RETRY_UNSAFE');
rejects({ tests: { bad: { uses: 'example.unit@1', config: { command: ['npm'] }, retries: 4 } } }, 'TEST_PLAN_RETRY_INVALID');
rejects({ tests: { bad: { uses: 'example.unit@1', config: { command: ['npm'] }, matrix: { browser: ['x'] } } } }, 'TEST_PLAN_MATRIX_INVALID');
rejects({ tests: { bad: {
  uses: 'example.unit@1',
  config: { command: ['npm'] },
  matrix: { runtime: Array.from({ length: 17 }, (_, index) => `runtime-${index}`) },
} } }, 'TEST_PLAN_MATRIX_LIMIT');
rejects({ tests: {
  matrix: { uses: 'example.unit@1', config: { command: ['npm'] }, matrix: { runtime: ['node22'] } },
  'matrix/matrix-001': { uses: 'example.unit@1', config: { command: ['npm'] } },
} }, 'TEST_PLAN_NODE_DUPLICATE');
rejects({ tests: {
  [`n${'x'.repeat(245)}`]: { uses: 'example.unit@1', config: { command: ['npm'] }, matrix: { runtime: ['node22'] } },
} }, 'TEST_PLAN_ID_INVALID');
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_ID_INVALID', {
  planId: `p${'x'.repeat(251)}`,
});
rejects({ tests: { bad: { uses: 'example.unit@1', config: { command: ['npm'] }, retries: '1' } } }, 'TEST_PLAN_RETRY_INVALID');
rejects({ tests: {
  bad: { uses: 'example.unit@1', config: { command: ['npm'] }, when: { changedPaths: ['**', '../invalid'] } },
} }, 'TEST_PLAN_CONDITION_INVALID');
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_POLICY_INVALID', {
  policy: { ...policy, maximumRetryCount: 0 },
});
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_POLICY_INVALID', {
  policy: { ...policy, maximumMatrixSize: 0 },
});
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_FACTS_INVALID', {
  facts: { changedPaths: ['index.ts'], moduleType: 42, pipelineStage: 'implementation' } as unknown as typeof resolverInput.facts,
});
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_FACTS_INVALID', {
  facts: { changedPaths: ['../outside.ts'], moduleType: 'web', pipelineStage: 'implementation' },
});
rejects({
  fixtures: { report: { uses: 'example.report-fixture@1' } },
  tests: { consume: { uses: 'example.consume-typed-report@1', inputs: { report: { from: 'report', output: 'report' } } } },
}, 'TEST_PLAN_LINK_SCHEMA_MISMATCH');
rejects({ tests: {
  first: { uses: 'example.unit@1', config: { command: ['a'] }, needs: ['second'] },
  second: { uses: 'example.unit@1', config: { command: ['b'] }, needs: ['first'] },
} }, 'TEST_PLAN_DEPENDENCY_CYCLE');
rejects({ suites: { quality: { uses: 'example.release-suite@1', exclude: ['deployment'] } } }, 'TEST_PLAN_LINK_SOURCE_MISSING');
rejects({ suites: { quality: { uses: 'example.release-suite@2' } } }, 'TEST_PLAN_SUITE_MISSING');
rejects(loaded.declaration, 'TEST_PLAN_SUITE_DUPLICATE', { suiteTemplates: [suite, suite] });
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } }, concurrencyLimits: { unused: 1 } }, 'TEST_PLAN_CONCURRENCY_UNUSED');
rejects({ suites: { quality: { uses: 'example.release-suite@1' } }, concurrencyLimits: { browser: 3 } }, 'TEST_PLAN_CONCURRENCY_INVALID');
rejects({ suites: { quality: { uses: 'example.release-suite@1' } }, concurrencyLimits: { browser: '2' } }, 'TEST_PLAN_CONCURRENCY_INVALID');
rejects({ suites: { simple: { uses: 'example.string-limit-suite@1' } } }, 'TEST_PLAN_CONCURRENCY_INVALID', {
  suiteTemplates: [{
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.string-limit-suite@1',
    tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } },
    concurrencyLimits: { browser: '2' as unknown as number },
  }],
});
rejects({ suites: { 'team/quality': { uses: 'example.release-suite@1' } } }, 'TEST_PLAN_LOCAL_ID_INVALID');

rejects({ suites: { quality: { uses: 'example.nested-suite@1' } } }, 'TEST_PLAN_LOCAL_ID_INVALID', {
  suiteTemplates: [{
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.nested-suite@1',
    fixtures: { 'group/setup': { uses: 'example.deployment@1' } },
  }],
});
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_LOCAL_ID_INVALID', {
  suiteTemplates: [{
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.unused-nested-suite@1',
    fixtures: { 'group/setup': { uses: 'example.deployment@1' } },
  }],
});
rejects({ tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } } }, 'TEST_PLAN_CONCURRENCY_INVALID', {
  suiteTemplates: [{
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.unused-invalid-limit-suite@1',
    tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } },
    concurrencyLimits: { browser: 0 },
  }],
});

const rootGlob = resolveTestPlan({
  ...resolverInput,
  declaration: {
    tests: {
      root: { uses: 'example.unit@1', config: { command: ['npm'] }, when: { changedPaths: ['**/*.ts'] } },
    },
  },
  facts: { ...resolverInput.facts, changedPaths: ['index.ts'] },
});
assert.equal(rootGlob.nodes[0]?.skipReason, null, '`**/` matches zero directories');

const factConditionPlan = resolveTestPlan({
  ...resolverInput,
  declaration: {
    tests: {
      matching: {
        uses: 'example.unit@1',
        config: { command: ['npm'] },
        when: { moduleType: 'web', pipelineStage: 'implementation' },
      },
      skipped: {
        uses: 'example.unit@1',
        config: { command: ['npm'] },
        when: { moduleType: 'api' },
      },
    },
  },
});
assert.equal(factConditionPlan.nodes.find((node) => node.id === 'matching')?.skipReason, null);
assert.equal(factConditionPlan.nodes.find((node) => node.id === 'skipped')?.skipReason, 'condition moduleType did not match');

const exactTemplateA: SuiteTemplateV1 = {
  schemaVersion: 'test-suite-template.v1',
  contractId: 'example.exact-template@1',
  tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } },
};
const exactTemplateB: SuiteTemplateV1 = { ...exactTemplateA, fixtures: {}, concurrencyLimits: {} };
const exactTemplateDeclaration = { suites: { exact: { uses: 'example.exact-template@1' } } };
const exactDigestA = resolveTestPlan({ ...resolverInput, declaration: exactTemplateDeclaration, suiteTemplates: [exactTemplateA] }).suites[0]?.templateDigest;
const exactDigestB = resolveTestPlan({ ...resolverInput, declaration: exactTemplateDeclaration, suiteTemplates: [exactTemplateB] }).suites[0]?.templateDigest;
assert.notEqual(exactDigestA, exactDigestB, 'suite digest identifies the exact validated template source');

const protoSuite = JSON.parse(`{
  "schemaVersion": "test-suite-template.v1",
  "contractId": "example.proto-suite@1",
  "tests": {
    "json": {
      "uses": "example.json@1",
      "config": { "__proto__": { "suite": true }, "nested": { "base": true } }
    }
  }
}`) as SuiteTemplateV1;
const protoDeclaration = JSON.parse(`{
  "suites": {
    "proto": {
      "uses": "example.proto-suite@1",
      "overrides": {
        "json": { "config": { "__proto__": { "project": true }, "nested": { "__proto__": { "deep": true } } } }
      }
    }
  }
}`);
const protoPlan = resolveTestPlan({ ...resolverInput, declaration: protoDeclaration, suiteTemplates: [protoSuite] });
const protoValues = protoPlan.nodes[0]?.configuration.values as Record<string, unknown>;
assert.equal(Object.hasOwn(protoValues, '__proto__'), true, 'top-level __proto__ remains an own JSON property');
assert.deepEqual(protoValues.__proto__, { suite: true, project: true });
assert.equal(Object.hasOwn(protoValues.nested as object, '__proto__'), true, 'nested __proto__ remains an own JSON property');

const unusedSuiteLimit = resolveTestPlan({
  ...resolverInput,
  declaration: { suites: { simple: { uses: 'example.simple-suite@1' } } },
  suiteTemplates: [{
    schemaVersion: 'test-suite-template.v1',
    contractId: 'example.simple-suite@1',
    tests: { unit: { uses: 'example.unit@1', config: { command: ['npm'] } } },
    concurrencyLimits: { unused: 1 },
  }],
});
assert.deepEqual(unusedSuiteLimit.concurrencyLimits, {}, 'unused suite limits do not fail or enter the plan');

assert.throws(() => loadPipelineTestScope(path.join(swarm, 'progress.json'), { moduleId: 'app', gateId: null }),
  /TEST_PLAN_PIPELINE_NAME_INVALID/);

fs.rmSync(temporary, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, nodes: plan.nodes.length, links: plan.links.length, digest: plan.planDigest }));
