import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/nova/core/src/index.ts')).href);
const attempt = { runId: 'run:01', stageId: 'stage', attemptId: 'attempt:01', attemptNumber: 1 };
const packageIdentity = {
  pluginId: 'example.stage',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'a'.repeat(64)}`,
};
const provenance = {
  schemaVersion: 'registration-provenance.v2',
  package: {
    schemaVersion: 'package-provenance.v2',
    package: packageIdentity,
    source: { type: 'builtin', canonicalReference: 'builtin:example.stage' },
    canonicalPath: '/plugins/example',
    trustScope: 'trusted_first_party',
    trustEvidence: {
      method: 'builtin_allowlist',
      verifier: 'test:registry',
      verifiedAt: '2026-07-25T22:00:00Z',
    },
    resolvedAt: '2026-07-25T22:00:00Z',
  },
  surface: 'stage',
  registrationId: 'main',
};
const leaseContract = {
  schemaVersion: 'invocation-lease.v2',
  leaseId: 'lease:01',
  attempt,
  registration: provenance,
  status: 'active',
  grants: [{
    capability: 'state.read',
    provider: { ...packageIdentity, pluginId: 'example.state', registrationId: 'state' },
    constraints: { allowedNamespaces: ['run:01'] },
  }],
  limits: { wallTimeMs: 60000, memoryBytes: 1, cpuMillis: 1 },
  issuedAt: '2026-07-25T22:00:00Z',
  expiresAt: '2026-07-25T22:01:00Z',
};
const lease = new core.RevocableLease(leaseContract, () => new Date('2026-07-25T22:00:10Z'));
const calls = [];
const context = core.createPluginInvocationContext({
  schemaVersion: 'plugin-context.v2',
  lease: leaseContract,
  config: {},
  input: {},
  artifacts: [],
}, lease, {
  async invoke(...args) {
    calls.push(args);
    return { ok: true };
  },
}, {
  async append() {},
});
await context.invoke('state.read', {
  operation: 'read',
  resource: { type: 'state.namespace', canonicalId: 'run:01/stage' },
  payload: {},
});
assert.equal(calls.length, 1);
await assert.rejects(() => context.invoke('network.http', {
  operation: 'get',
  resource: { type: 'network.host', canonicalId: 'example.com' },
  payload: {},
}), /PLUGIN_CAPABILITY_DENIED/);
lease.revoke({ code: 'core.attempt_completed' }, new Date('2026-07-25T22:00:30Z'));
await assert.rejects(() => context.invoke('state.read', {
  operation: 'read',
  resource: { type: 'state.namespace', canonicalId: 'run:01' },
  payload: {},
}), /PLUGIN_CONTEXT_REVOKED/);

const journal = new core.MemoryEffectJournal();
const effects = new core.EffectCoordinator(
  journal,
  () => new Date('2026-07-25T22:00:00Z'),
  undefined,
  new core.MemoryResourceLockManager(),
);
let invocations = 0;
const adapter = {
  async ready() {},
  async invoke({ confidential, fence }) {
    if (!confidential) fence.assertCurrent();
    invocations += 1;
    return { value: 1 };
  },
  async shutdown() {},
};
const owner = { ...packageIdentity, pluginId: 'example.state', registrationId: 'state' };
const invocation = {
  idempotencyKey: 'effect:01',
  attempt,
  capability: 'state.read',
  operation: 'get',
  resource: { type: 'state.entry', canonicalId: 'run:01' },
  payload: {},
};
const first = await effects.invoke(adapter, owner, invocation, new AbortController().signal);
const replay = await effects.invoke(adapter, owner, invocation, new AbortController().signal);
assert.equal(first.status, 'completed');
assert.deepEqual(replay, first);
assert.equal(invocations, 1, 'durable receipt prevents duplicate adapter effects');

const confidentialJournal = new core.MemoryEffectJournal();
const confidentialAudit = [];
const confidentialEffects = new core.EffectCoordinator(
  confidentialJournal,
  () => new Date('2026-07-25T22:00:00Z'),
  {
    requested(request) { confidentialAudit.push(['requested', request]); },
    accepted(request) { confidentialAudit.push(['accepted', request]); },
    completed(request, receipt) { confidentialAudit.push(['completed', request, receipt]); },
  },
  new core.MemoryResourceLockManager(),
);
const confidentialAdapter = {
  async ready() {},
  async invoke() { return { value: 'do-not-persist' }; },
  async shutdown() {},
};
const confidential = await confidentialEffects.invokeConfidential(
  confidentialAdapter,
  owner,
  {
    ...invocation,
    capability: 'secrets.read',
    resource: {
      type: 'secret.name',
      canonicalId: 'confidential-resource-must-not-survive',
    },
    payload: { resolvedValue: 'audit-request-secret-must-not-survive' },
  },
  new AbortController().signal,
);
assert.deepEqual(confidential, { value: 'do-not-persist' });
assert.equal(await confidentialJournal.request('effect:01'), undefined);
assert.equal(await confidentialJournal.receipt('effect:01'), undefined);
assert.deepEqual(confidentialAudit.map(([type]) => type), ['requested', 'accepted', 'completed']);
assert.deepEqual(confidentialAudit[0][1].payload, { confidential: true });
assert.deepEqual(confidentialAudit[0][1].resource, {
  type: 'secret.name',
  canonicalId: '[confidential]',
});
assert.deepEqual(confidentialAudit[1][1].payload, { confidential: true });
assert.deepEqual(confidentialAudit[2][1].payload, { confidential: true });
assert.deepEqual(confidentialAudit[2][2].result, { confidential: true });
assert.doesNotMatch(JSON.stringify(confidentialAudit), /do-not-persist/);
assert.doesNotMatch(JSON.stringify(confidentialAudit), /audit-request-secret-must-not-survive/);
assert.doesNotMatch(JSON.stringify(confidentialAudit), /confidential-resource-must-not-survive/);
const confidentialFailureAudit = [];
const confidentialFailureEffects = new core.EffectCoordinator(
  new core.MemoryEffectJournal(),
  () => new Date('2026-07-25T22:00:00Z'),
  {
    requested(request) { confidentialFailureAudit.push(['requested', request]); },
    accepted(request) { confidentialFailureAudit.push(['accepted', request]); },
    completed(request, receipt) { confidentialFailureAudit.push(['completed', request, receipt]); },
  },
  new core.MemoryResourceLockManager(),
);
await assert.rejects(
  () => confidentialFailureEffects.invokeConfidential(
    {
      async ready() {},
      async invoke() { throw new Error('resolved-secret-must-not-survive'); },
      async shutdown() {},
    },
    owner,
    { ...invocation, capability: 'secrets.read' },
    new AbortController().signal,
  ),
  /resolved-secret-must-not-survive/,
);
assert.doesNotMatch(JSON.stringify(confidentialFailureAudit), /resolved-secret-must-not-survive/);
assert.equal(
  confidentialFailureAudit[2][2].error.message,
  'Confidential adapter operation failed',
);

const runtimeRoot = path.resolve('skills/common/plugins/agent-observability');
const runtimeSnapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: [path.resolve('skills/common/plugins')],
  trustPolicy: {
    trustedBuiltinRoots: [path.resolve('skills/common/plugins')],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:adapter-rollback',
  },
  now: () => new Date('2026-07-25T22:00:00Z'),
}));
const adapterRegistration = (pluginId, id) => ({
  package: {
    root: runtimeRoot,
    manifest: { id: pluginId },
    provenance: { package: { ...packageIdentity, pluginId } },
  },
  registration: {
    id,
    configSchema: 'schemas/config.schema.json',
    requiredCapabilities: [],
  },
  provenance: { ...provenance, surface: 'adapter', registrationId: id },
});
const firstId = 'example.first:first';
const secondId = 'example.second:second';
let firstShutdowns = 0;
let secondShutdowns = 0;
const runtime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([
        [firstId, adapterRegistration('example.first', 'first')],
        [secondId, adapterRegistration('example.second', 'second')],
      ]),
    },
    enabledRegistrations: new Set([firstId, secondId]),
    selectedProviders: new Map(),
    grants: new Map(),
  },
  activated: {
    adapters: new Map([
      [firstId, { execute: async () => ({
        async ready() {},
        async invoke() { return {}; },
        async shutdown() { firstShutdowns += 1; },
      }) }],
      [secondId, { execute: async () => ({
        async ready() { throw new Error('SECOND_ADAPTER_READY_FAILED'); },
        async invoke() { return {}; },
        async shutdown() { secondShutdowns += 1; },
      }) }],
    ]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});
await assert.rejects(runtime.start(), /SECOND_ADAPTER_READY_FAILED/);
assert.equal(firstShutdowns, 1, 'successful adapters are rolled back when a later adapter fails readiness');
assert.equal(secondShutdowns, 1, 'the adapter that fails readiness is also rolled back');

let retainedAdapterContext;
let lifecycleActivations = 0;
let lifecycleShutdowns = 0;
const lifecycleRuntime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([[firstId, adapterRegistration('example.first', 'first')]]),
    },
    enabledRegistrations: new Set([firstId]),
    selectedProviders: new Map(),
    grants: new Map([[firstId, []]]),
  },
  activated: {
    adapters: new Map([[
      firstId,
      {
        execute: async (activationContext) => {
          lifecycleActivations += 1;
          retainedAdapterContext = activationContext;
          return {
            async ready() {},
            async invoke() { return {}; },
            async shutdown() { lifecycleShutdowns += 1; },
          };
        },
      },
    ]]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});
await lifecycleRuntime.start();
await lifecycleRuntime.start();
assert.equal(lifecycleActivations, 1, 'sequential starts are idempotent');
await lifecycleRuntime.shutdown();
assert.equal(lifecycleShutdowns, 1, 'an idempotently started adapter is torn down once');
await assert.rejects(
  () => retainedAdapterContext.emit('plugin.example.first.after-shutdown', { runId: 'run:01' }, {}),
  /ADAPTER_CONTEXT_REVOKED/,
);
await assert.rejects(
  () => retainedAdapterContext.invoke('state.read', {
    operation: 'read',
    resource: { type: 'state.namespace', canonicalId: 'run:01' },
    payload: {},
  }),
  /ADAPTER_CONTEXT_REVOKED/,
);

let releaseReady;
let signalReadyEntered;
const readyEntered = new Promise((resolve) => { signalReadyEntered = resolve; });
let racingContext;
let racingShutdowns = 0;
const racingRuntime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([[firstId, adapterRegistration('example.first', 'first')]]),
    },
    enabledRegistrations: new Set([firstId]),
    selectedProviders: new Map(),
    grants: new Map([[firstId, []]]),
  },
  activated: {
    adapters: new Map([[
      firstId,
      {
        execute: async (activationContext) => {
          racingContext = activationContext;
          return {
            async ready() {
              signalReadyEntered();
              await new Promise((resolve) => { releaseReady = resolve; });
            },
            async invoke() { return {}; },
            async shutdown() { racingShutdowns += 1; },
          };
        },
      },
    ]]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});
const racingStart = racingRuntime.start();
await readyEntered;
let racingShutdownSettled = false;
const racingShutdown = racingRuntime.shutdown().then(() => {
  racingShutdownSettled = true;
});
await Promise.resolve();
assert.equal(
  racingShutdownSettled,
  false,
  'shutdown must wait for in-flight activation cleanup',
);
releaseReady();
await assert.rejects(racingStart, /ADAPTER_RUNTIME_STOPPING/);
await racingShutdown;
assert.equal(racingShutdowns, 1, 'startup rollback is the single teardown owner');
await assert.rejects(
  () => racingContext.emit('plugin.example.first.after-race', { runId: 'run:01' }, {}),
  /ADAPTER_CONTEXT_REVOKED/,
);

let releaseFactory;
let signalFactoryEntered;
const factoryEntered = new Promise((resolve) => { signalFactoryEntered = resolve; });
let factoryShutdowns = 0;
const factoryRaceRuntime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([[firstId, adapterRegistration('example.first', 'first')]]),
    },
    enabledRegistrations: new Set([firstId]),
    selectedProviders: new Map(),
    grants: new Map([[firstId, []]]),
  },
  activated: {
    adapters: new Map([[
      firstId,
      {
        execute: async () => {
          signalFactoryEntered();
          await new Promise((resolve) => { releaseFactory = resolve; });
          return {
            async ready() {},
            async invoke() { return {}; },
            async shutdown() { factoryShutdowns += 1; },
          };
        },
      },
    ]]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});
const factoryRaceStart = factoryRaceRuntime.start();
await factoryEntered;
let factoryRaceShutdownSettled = false;
const factoryRaceShutdown = factoryRaceRuntime.shutdown().then(() => {
  factoryRaceShutdownSettled = true;
});
await Promise.resolve();
assert.equal(factoryRaceShutdownSettled, false);
releaseFactory();
await assert.rejects(factoryRaceStart, /ADAPTER_RUNTIME_STOPPING/);
await factoryRaceShutdown;
assert.equal(factoryShutdowns, 1);

let stalledShutdowns = 0;
let signalStalledReady;
const stalledReadyEntered = new Promise((resolve) => { signalStalledReady = resolve; });
const stalledRuntime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([[firstId, adapterRegistration('example.first', 'first')]]),
    },
    enabledRegistrations: new Set([firstId]),
    selectedProviders: new Map(),
    grants: new Map([[firstId, []]]),
  },
  activated: {
    adapters: new Map([[
      firstId,
      {
        execute: async () => ({
          async ready() {
            signalStalledReady();
            await new Promise(() => {});
          },
          async invoke() { return {}; },
          async shutdown() { stalledShutdowns += 1; },
        }),
      },
    ]]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 20,
  async emitDomainEvent() {},
});
const stalledStart = stalledRuntime.start();
await stalledReadyEntered;
await assert.rejects(stalledStart, /ADAPTER_START_TIMEOUT:example\.first:first:ready/);
assert.equal(stalledShutdowns, 1, 'ready timeout immediately tears down the constructed adapter');
await stalledRuntime.shutdown();
assert.equal(stalledShutdowns, 1, 'shutdown attempts teardown once while startup remains stalled');

let resolveLateFactory;
let lateShutdowns = 0;
const lateRuntime = new core.AdapterRuntime({
  granted: {
    snapshot: {
      ...runtimeSnapshot,
      adapters: new Map([[firstId, adapterRegistration('example.first', 'first')]]),
    },
    enabledRegistrations: new Set([firstId]),
    selectedProviders: new Map(),
    grants: new Map([[firstId, []]]),
  },
  activated: {
    adapters: new Map([[
      firstId,
      {
        execute: () => new Promise((resolve) => {
          resolveLateFactory = () => resolve({
            async ready() {},
            async invoke() { return {}; },
            async shutdown() { lateShutdowns += 1; },
          });
        }),
      },
    ]]),
  },
  configs: new Map(),
  effects: new core.EffectCoordinator(
    new core.MemoryEffectJournal(),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  ),
  shutdownTimeoutMs: 20,
  async emitDomainEvent() {},
});
await assert.rejects(lateRuntime.start(), /ADAPTER_START_TIMEOUT:example\.first:first:activate/);
resolveLateFactory();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(lateShutdowns, 1, 'an adapter resolving after activation timeout is shut down exactly once');
await lateRuntime.shutdown();
assert.equal(lateShutdowns, 1, 'runtime shutdown does not double-close late activation');
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-capability-runtime' }));
