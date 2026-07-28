import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/common/plugin-runtime/core/src/index.ts')).href);
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
    constraints: { namespace: 'run:01' },
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
  operation: 'get',
  resource: { type: 'state.entry', canonicalId: 'run:01/stage' },
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
  operation: 'get',
  resource: { type: 'state.entry', canonicalId: 'run:01' },
  payload: {},
}), /PLUGIN_CONTEXT_REVOKED/);

const journal = new core.MemoryEffectJournal();
const effects = new core.EffectCoordinator(journal, () => new Date('2026-07-25T22:00:00Z'));
let invocations = 0;
const adapter = {
  async ready() {},
  async invoke() {
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
const confidentialEffects = new core.EffectCoordinator(confidentialJournal);
const confidentialAdapter = {
  async ready() {},
  async invoke() { return { value: 'do-not-persist' }; },
  async shutdown() {},
};
const confidential = await confidentialEffects.invokeConfidential(
  confidentialAdapter,
  { ...invocation, capability: 'secrets.read' },
  new AbortController().signal,
);
assert.deepEqual(confidential, { value: 'do-not-persist' });
assert.equal(await confidentialJournal.request('effect:01'), undefined);
assert.equal(await confidentialJournal.receipt('effect:01'), undefined);

const runtimeRoot = path.resolve('skills/common/plugins/agent-observability');
core.buildRegistry(core.discoverPackages({
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
  effects: new core.EffectCoordinator(new core.MemoryEffectJournal()),
  shutdownTimeoutMs: 1_000,
  async emitDomainEvent() {},
});
await assert.rejects(runtime.start(), /SECOND_ADAPTER_READY_FAILED/);
assert.equal(firstShutdowns, 1, 'successful adapters are rolled back when a later adapter fails readiness');
assert.equal(secondShutdowns, 1, 'the adapter that fails readiness is also rolled back');
console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-capability-runtime' }));
