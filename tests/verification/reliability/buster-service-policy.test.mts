import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { swarmReaderAssets } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { readBusterRemotePlanServicePolicy, readLegacyBusterRuntimeServicePolicy, receiveBusterRuntimeV2ServicePolicy } from '../../../skills/common/plugin-runtime/foundation/config/buster-service-policy.ts';
import { capabilitySources, validateCapabilitySourceClosure } from '../../../skills/buster/engine/test-gates/production-capability-sources.ts';
import { containerBuildOptions, directCommandOptions, networkHttpOptions, securityScanOptions } from '../../../skills/buster/engine/test-gates/production-command-options.ts';
import { browserAxeOptions, browserLighthouseOptions, browserVisualOptions, browserPlaywrightOptions } from '../../../skills/buster/engine/test-gates/production-browser-options.ts';
import { runtimeAuthority } from '../../../skills/buster/engine/test-gates/production-config-values.ts';
import { loadProductionBusterRemotePlanRuntime } from '../../../skills/buster/engine/test-gates/production.ts';
import type { BusterSettings, WorkerCoreSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import type { BusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-client.ts';

const evidence = new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/', import.meta.url);
const read = (file: string) => JSON.parse(fs.readFileSync(new URL(file, evidence), 'utf8'));
const contract = read('PACKAGE-GENERATION-CONTRACT.json');
const owner = JSON.parse(fs.readFileSync(new URL('../../../'+contract.service10.existingFinalOwner.path, import.meta.url), 'utf8'));
const baseline = owner.profiles['local-A'].settings.remotePlanService;

test('service schema exactly preserves reviewed receiving domain and reader receipts bind both new assets', () => {
  const view = read('buster-remote-plan-profile-01/service-policy-view.schema.json');
  const { $schema, ...schema } = JSON.parse(fs.readFileSync(new URL('../../../skills/common/plugin-runtime/foundation/config/buster-service-policy.schema.json', import.meta.url), 'utf8'));
  assert.equal($schema, view.$schema);
  assert.deepEqual(schema, view.properties.policy, 'no weakened or reconstructed policy domain');
  const expectedOwner = fs.readFileSync(new URL('../../../'+contract.service10.existingFinalOwner.path, import.meta.url));
  assert.equal(createHash('sha256').update(expectedOwner).digest('hex'), contract.service10.existingFinalOwner.sha256);
  for (const name of ['buster-service-policy.ts', 'buster-service-policy.schema.json']) {
    const bytes = fs.readFileSync(new URL('../../../skills/common/plugin-runtime/foundation/config/'+name, import.meta.url));
    const receipt = swarmReaderAssets.find(asset => asset.name === name);
    assert.equal(receipt?.digest, 'sha256:'+createHash('sha256').update(bytes).digest('hex'));
    assert.equal(receipt?.byteLength, bytes.byteLength);
  }
});

test('exact approved final owner95 service profiles pass the shared real reader unchanged', () => {
  assert.equal(Object.keys(owner.profiles).length, 95);
  for (const [name, profile] of Object.entries(owner.profiles)) {
    const value = (profile as { settings: { remotePlanService: unknown } }).settings.remotePlanService;
    const policy = readBusterRemotePlanServicePolicy(value);
    assert.deepEqual(policy, value, name);
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(Object.isFrozen(policy.recordLimits), true);
    assert.equal(Object.isFrozen(policy.allowedCapabilities), true);
  }
  assert.equal(contract.service10.fieldProjections.length, 20);
  for (const row of contract.service10.fieldProjections) {
    const parts = row.receivingPointer.split('/').slice(1);
    const value = parts.reduce((node: any, key: string) => node[key], owner);
    const selected = readBusterRemotePlanServicePolicy(owner.profiles[parts[1]].settings.remotePlanService);
    const received = parts.slice(4).reduce((node: any, key: string) => node[key], selected);
    assert.deepEqual(received, value, row.originalFieldIds.join(','));
  }
});

test('required service leaves, closed aliases and actual wire/timer boundaries reject without defaults', () => {
  for (const key of Object.keys(baseline)) {
    const value = structuredClone(baseline); delete value[key];
    assert.throws(() => readBusterRemotePlanServicePolicy(value), /BUSTER_SERVICE_POLICY_INVALID/, key);
  }
  for (const patch of [
    { maximumResponseBytes: 96 }, { shutdownTimeoutMs: 2147483648 }, { port: 65536 },
    { maximumResultBytes: Number.MAX_SAFE_INTEGER+1 }, { host: 'unregistered.example' },
    { allowedCapabilities: ['network.http', 'network.http'] }, { runtimeService: baseline },
    { recordLimits: { ...baseline.recordLimits, maximumRecords: 0 } },
  ]) assert.throws(() => readBusterRemotePlanServicePolicy({ ...baseline, ...patch }), /BUSTER_SERVICE_POLICY_INVALID/);
  const boundary = readBusterRemotePlanServicePolicy({ ...baseline, port: 0, maximumResponseBytes: 97, shutdownTimeoutMs: 2147483647 });
  assert.equal(boundary.port, 0); assert.equal(boundary.maximumResponseBytes, 97);
  const original = structuredClone(baseline), captured = readBusterRemotePlanServicePolicy(original);
  original.recordLimits.maximumBytes++; original.allowedCapabilities.length = 0;
  assert.deepEqual(captured, baseline, 'returned service policy cannot drift with its input');
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline };
  assert.deepEqual(readLegacyBusterRuntimeServicePolicy(runtime), baseline);
  assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, remotePlanService: baseline }), /COMPETING_AUTHOR/);
  assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, schemaVersion: 'buster-remote-plan-runtime.v2' }), /VERSION_INVALID/);
});

const key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
const source = { tokenEnvironmentVariable: 'TEST_BUSTER_TOKEN', sourceAttestationPublicKeyEnvironmentVariable: 'TEST_SOURCE_KEY', trustedSourceAuthority: 'fixture:original-source' };
const directCommandPolicy = {
  executableCatalog: { node: '/usr/bin/node' }, executableSearchPath: ['/usr/bin'], runtimeReadRoots: ['/usr/lib'],
  maximumOutputBytes: 1024, maximumExecutionMs: 1000, maximumProcesses: 8,
  maximumMemoryBytes: 1048576, maximumCpuMillis: 100, terminationGraceMs: 10,
};

test('real source key preflight rejects malformed/non-Ed25519 keys and absent issuer; never authenticates provenance', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  for (const value of ['not a key', rsa]) assert.throws(() => runtimeAuthority(source, { TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: value }), /BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  assert.throws(() => runtimeAuthority({ ...source, trustedSourceAuthority: ' ' }, { TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }), /AUTHORITY_REQUIRED/);
  assert.equal(runtimeAuthority(source, { TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }).sourceAttestationPublicKey, key);
});

test('production authority requires one token or proxied-SPIFFE author before confidential reads', () => {
  const { tokenEnvironmentVariable, ...publicSource } = source;
  const peer = { ...publicSource, trustedPeerSpiffeIds: ['spiffe://fixture/buster'] };
  const environment = { TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key };
  const token = runtimeAuthority(source, environment);
  assert.equal(token.token, 'fixture-token-00000000000000000000');
  assert.equal(token.trustedPeerSpiffeIds, undefined);
  const spiffe = runtimeAuthority(peer, environment);
  assert.deepEqual(spiffe.trustedPeerSpiffeIds, peer.trustedPeerSpiffeIds);
  assert.equal(spiffe.token, undefined);
  const unreadable = new Proxy({}, { get() { assert.fail('ambiguous authority must reject before secret lookup'); } });
  for (const value of [publicSource, { ...peer, tokenEnvironmentVariable },
    { ...peer, tokenEnvironmentVariable: undefined }, { ...source, trustedPeerSpiffeIds: undefined }]) {
    assert.throws(() => runtimeAuthority(value, unreadable), /AUTHORITY_XOR_REQUIRED/);
  }
  assert.deepEqual(runtimeAuthority(source, environment), token, 'restored token source retains exact authority');
  assert.deepEqual(runtimeAuthority(peer, environment), spiffe, 'restored SPIFFE source retains exact authority');
});

test('source carrier and issuer metadata reject before any confidential carrier lookup', () => {
  const unreadable = new Proxy({}, { get() { assert.fail('invalid source metadata must not read confidential carriers'); } });
  for (const sourceAttestationPublicKeyEnvironmentVariable of [undefined, null, [], ['TEST_SOURCE_KEY'], 1, 'bad-name', 'TEST_BUSTER_TOKEN']) {
    assert.throws(() => runtimeAuthority({ ...source, sourceAttestationPublicKeyEnvironmentVariable }, unreadable), /BUSTER_SOURCE_ATTESTATION_ENV_INVALID/);
  }
  for (const trustedSourceAuthority of [undefined, null, '', ' ', 1]) {
    assert.throws(() => runtimeAuthority({ ...source, trustedSourceAuthority }, unreadable), /BUSTER_SOURCE_ATTESTATION_AUTHORITY_REQUIRED/);
  }
  let reads = 0;
  const restored = new Proxy({ TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }, {
    get(target, name) { reads++; return Reflect.get(target, name); },
  });
  assert.equal(runtimeAuthority(source, restored).sourceAttestationPublicKey, key);
  assert.equal(reads, 2, 'restored valid names read each original carrier once');
});

test('runtime child retains the admitted original issuer across either confidential carrier read', () => {
  const environment = { TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key };
  const original = runtimeAuthority(source, environment);
  assert.equal(original.trustedSourceAuthority, source.trustedSourceAuthority);
  for (const carrier of ['TEST_BUSTER_TOKEN', 'TEST_SOURCE_KEY']) {
    const candidate = { ...source };
    const reads: PropertyKey[] = [];
    const received = runtimeAuthority(candidate, new Proxy(environment, {
      get(target, name) {
        reads.push(name);
        if (name === carrier) candidate.trustedSourceAuthority = 'foreign:replacement-issuer';
        return Reflect.get(target, name);
      },
    }));
    assert.equal(candidate.trustedSourceAuthority, 'foreign:replacement-issuer');
    assert.deepEqual(received, original, 'carrier lookup must not replace the admitted issuer');
    assert.equal(Object.isFrozen(received), true);
    assert.deepEqual(reads, ['TEST_BUSTER_TOKEN', 'TEST_SOURCE_KEY']);
  }
  assert.deepEqual(runtimeAuthority(source, environment), original, 'restored original source');
});

test('actual production loader rejects service policy/source crypto BEFORE registry or store effects', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-service-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings as BusterSettings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings as WorkerCoreSettings;
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline, ...source,
    allowedCapabilities: [], platformConfig: path.join(root, 'never-resolve-platform.json'), stateRoot: path.join(root, 'must-not-create-store'),
    runtimeRoot: path.join(root, 'must-not-create-runs'), tarExecutable: '/usr/bin/tar' };
  const file = path.join(root, 'runtime.json');
  let environmentReads = 0;
  const environment = new Proxy({ KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }, { get(target, name) {
    if (name === 'TEST_SOURCE_KEY' || name === 'TEST_BUSTER_TOKEN') environmentReads++;
    return Reflect.get(target, name);
  } });
  for (const [patch, expected] of [
    [{ allowedCapabilities: ['network.http'] }, /BUSTER_NETWORK_HTTP_CONFIG_REQUIRED/],
    [{ networkHttp: {} }, /BUSTER_INACTIVE_CAPABILITY_SOURCE:networkHttp/],
    [{ allowedCapabilities: ['browser.playwright'], browserPlaywright: {} }, /BUSTER_BROWSER_PLAYWRIGHT_CGROUP_REQUIRED/],
    [{ allowedCapabilities: ['network.http'], networkHttp: { registryHealth: true } }, /BUSTER_REGISTRY_PEER_REQUIRED/],
    ...['kubernetes.fixture', 'kubernetes.exposure', 'kubernetes.runtime-security'].flatMap(capability => [
      [{ allowedCapabilities: [capability] }, /BUSTER_REMOTE_CONFIG_INVALID:clusterBindings/],
      ...[null, [], {}, { controllerNamespace: 'Bad_namespace' }, { controllerNamespace: 'ok', extra: true }].map(clusterBindings =>
        [{ allowedCapabilities: [capability], clusterBindings }, /BUSTER_(?:CLUSTER_BINDINGS_INVALID|REMOTE_CONFIG_INVALID:clusterBindings)/] as const),
    ]),
    [{ clusterBindings: { controllerNamespace: 'Bad_namespace' } }, /BUSTER_CLUSTER_BINDINGS_INVALID/],
    [{ registryPeer: {} }, /BUSTER_REGISTRY_PEER_INACTIVE/],
    [{ allowedCapabilities: ['container.build'], containerBuild: {}, registryPeer: {
      registryBaseUrl: 'https://registry.example', registryReference: 'registry.example',
      registryUsernameEnvironmentVariable: 'REGISTRY_USER', registryPasswordEnvironmentVariable: 'REGISTRY_PASSWORD',
    } }, /BUSTER_REGISTRY_PEER_MISMATCH/],
  ] as const) {
    fs.writeFileSync(file, JSON.stringify({ ...runtime, ...patch }));
    assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
      settings, worker.localRuntime, environment), expected);
    assert.equal(environmentReads, 0, 'conditional source rejection precedes source-key/token reads');
  }
  fs.writeFileSync(file, JSON.stringify({ ...runtime, maximumResponseBytes: 96 }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings, worker.localRuntime, environment), /SERVICE_POLICY_INVALID/);
  assert.equal(environmentReads, 0, 'service policy rejects before credential lookup');
  fs.writeFileSync(file, JSON.stringify(runtime));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings, worker.localRuntime,
    { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: 'not a public key' }), /BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID/);
  fs.writeFileSync(file, JSON.stringify({ ...runtime, trustedPeerSpiffeIds: ['spiffe://fixture/buster'] }));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings,
    worker.localRuntime, environment), /AUTHORITY_XOR_REQUIRED/);
  assert.equal(environmentReads, 0, 'competing authority rejects before confidential source lookup');
  for (const [patch, expected] of [
    ...[undefined, null, 'tar', '/bin/tar', '/tmp/tar', {}, ['/usr/bin/tar']].map(tarExecutable => [{ tarExecutable }, /BUSTER_NATIVE_TAR_LOCATOR_INVALID/] as const),
    [{ sourceAttestationPublicKeyEnvironmentVariable: 'TEST_BUSTER_TOKEN' }, /BUSTER_SOURCE_ATTESTATION_ENV_INVALID/],
    [{ sourceAttestationPublicKeyEnvironmentVariable: ['TEST_SOURCE_KEY'] }, /BUSTER_REMOTE_CONFIG_INVALID:sourceAttestationPublicKeyEnvironmentVariable/],
    [{ trustedSourceAuthority: ' ' }, /BUSTER_SOURCE_ATTESTATION_AUTHORITY_REQUIRED/],
  ] as const) {
    fs.writeFileSync(file, JSON.stringify({ ...runtime, ...patch }));
    assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings,
      worker.localRuntime, environment), expected);
    assert.equal(environmentReads, 0, 'invalid source metadata rejects in the actual loader before any confidential read');
  }
  fs.writeFileSync(file, JSON.stringify(runtime));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation, settings,
    worker.localRuntime, { KUBECLAW_BUILD_REVISION: 'a'.repeat(40), TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }),
    /ENOENT/, 'restored valid authority reaches the original missing registry source');
  assert.deepEqual(fs.readdirSync(root), ['runtime.json'], 'invalid inputs never reach registry discovery/store handles');
});

 test('legacy v1 preserves immutable deny-all without weakening selected-owner validation', () => {
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...structuredClone(baseline), allowedCapabilities: [] as string[] };
  const policy = readLegacyBusterRuntimeServicePolicy(runtime);
  assert.deepEqual(policy.allowedCapabilities, []);
  assert.equal(Object.isFrozen(policy.allowedCapabilities), true);
  runtime.allowedCapabilities.push('network.http');
  assert.deepEqual(policy.allowedCapabilities, [], 'no implicit capability or mutable alias');
  assert.throws(() => readBusterRemotePlanServicePolicy({ ...baseline, allowedCapabilities: [] }), /SERVICE_POLICY_INVALID/);
  for (const allowedCapabilities of [undefined, ['unknown.capability'], ['network.http', 'network.http']]) {
    assert.throws(() => readLegacyBusterRuntimeServicePolicy({ ...runtime, allowedCapabilities }), /SERVICE_POLICY_INVALID/);
  }
});


test('real capability receivers reject malformed boolean authors without false-value refill', () => {
  const command = (value: unknown) => capabilitySources({ directCommand: {
    ...directCommandPolicy, cgroupRoot: '/fixture/cgroup', allowSampledProcessLimit: value,
  } }, new Set(['command.execute']), {});
  const network = (value: unknown) => networkHttpOptions({
    allowedPorts: [443], maximumResponseBytes: 1024, maximumExecutionMs: 1000, allowWebSocket: value,
  }, null, undefined, undefined);
  for (const value of [null, 0, 1, '', 'false', 'true', [], {}]) {
    assert.throws(() => command(value), /BUSTER_REMOTE_CONFIG_INVALID:directCommand.allowSampledProcessLimit/);
    assert.throws(() => network(value), /BUSTER_REMOTE_CONFIG_INVALID:networkHttp.allowWebSocket/);
  }
  for (const value of [undefined, false, true]) {
    assert.equal(command(value).allowSampledProcessLimit, value === true);
    assert.equal(network(value).networkHttp?.allowWebSocket, value === true);
  }
  assert.throws(() => capabilitySources({ directCommand: { allowSampledProcessLimit: false } },
    new Set(['command.execute']), {}), /BUSTER_DIRECT_COMMAND_ISOLATION_REQUIRED/);
  assert.equal(capabilitySources({ directCommand: { ...directCommandPolicy, allowSampledProcessLimit: true } },
    new Set(['command.execute']), {}).allowSampledProcessLimit, true);
  assert.equal(capabilitySources({}, new Set(), {}).directCommandSource, null);
  assert.deepEqual(networkHttpOptions(null, null, undefined, undefined), {});
});


test('production token admission rejects before reading source key or discovering registry', () => {
  for (const token of [undefined, '', 'x'.repeat(31)]) {
    const environment = new Proxy({ TEST_BUSTER_TOKEN: token }, {
      get(target, name) {
        assert.equal(name, 'TEST_BUSTER_TOKEN', 'invalid token must not reach public source carrier');
        return Reflect.get(target, name);
      },
    });
    assert.throws(() => runtimeAuthority(source, environment), token ? /BUSTER_REMOTE_TOKEN_INVALID/ : /BUSTER_REMOTE_CONFIG_TOKEN_MISSING/);
  }
  assert.equal(runtimeAuthority(source, { TEST_BUSTER_TOKEN: 'x'.repeat(32), TEST_SOURCE_KEY: key }).token, 'x'.repeat(32));
});


test('conditional source closure preserves active-only public peers and restored controls without credentials', () => {
  const peer = { registryBaseUrl: 'https://registry.example', registryReference: 'registry.example',
    registryUsernameEnvironmentVariable: 'REGISTRY_USER', registryPasswordEnvironmentVariable: 'REGISTRY_PASSWORD' };
  const networkPolicy = { allowedPorts: [443], maximumResponseBytes: 1024, maximumExecutionMs: 1000 };
  const runtime = { networkHttp: { ...networkPolicy, registryHealth: true }, registryPeer: peer };
  assert.doesNotThrow(() => validateCapabilitySourceClosure(runtime, new Set(['network.http'])));
  assert.throws(() => validateCapabilitySourceClosure(runtime, new Set()), /INACTIVE_CAPABILITY_SOURCE/);
  assert.throws(() => validateCapabilitySourceClosure({ ...runtime, registryPeer: { ...peer,
    registryPasswordEnvironmentVariable: 'invalid-name' } }, new Set(['network.http'])), /REGISTRY_PEER_INVALID/);
  assert.doesNotThrow(() => validateCapabilitySourceClosure(runtime, new Set(['network.http'])));
  assert.doesNotThrow(() => validateCapabilitySourceClosure({}, new Set()));
  assert.doesNotThrow(() => validateCapabilitySourceClosure({ networkHttp: networkPolicy }, new Set(['network.http'])));
});


test('runtime v2 receives every original complete selected service policy and denies current-B refill', () => {
  for (const [name, profile] of Object.entries(owner.profiles)) {
    const selected = (profile as { settings: { remotePlanService: Record<string, unknown> } }).settings.remotePlanService;
    const runtime = { schemaVersion: 'buster-remote-plan-runtime.v2', ...structuredClone(selected) };
    assert.deepEqual(receiveBusterRuntimeV2ServicePolicy(runtime, selected), selected, name);
    for (const key of Object.keys(selected)) {
      const missing: Record<string, unknown> = structuredClone(runtime); delete missing[key];
      assert.throws(() => receiveBusterRuntimeV2ServicePolicy(missing, selected), /BUSTER_SERVICE_POLICY_INVALID/, `${name}:${key}`);
    }
    const changed = { ...runtime, port: selected.port === 0 ? 1 : 0 };
    assert.throws(() => receiveBusterRuntimeV2ServicePolicy(changed, selected), /BUSTER_SELECTED_SERVICE_POLICY_MISMATCH/, name);
    assert.deepEqual(receiveBusterRuntimeV2ServicePolicy(runtime, selected), selected, 'restored original');
    assert.throws(() => receiveBusterRuntimeV2ServicePolicy({ ...runtime, remotePlanService: selected }, selected), /COMPETING_AUTHOR/);
    assert.throws(() => receiveBusterRuntimeV2ServicePolicy({ ...runtime, schemaVersion: 'buster-remote-plan-runtime.v1' }, selected), /VERSION_INVALID/);
  }
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v2', ...structuredClone(baseline) };
  const received = receiveBusterRuntimeV2ServicePolicy(runtime, baseline);
  runtime.recordLimits.maximumBytes++;
  assert.deepEqual(received, baseline);
  assert.equal(Object.isFrozen(received.recordLimits), true);
});


test('cluster source preflight shares the actual namespace domain and preserves legacy inactive binding support', () => {
  const peer = { registryBaseUrl: 'http://registry.example:5000', registryReference: 'registry.example:5000' };
  const noReads = new Proxy({}, { get() { assert.fail('public cluster source must reject before confidential reads'); } });
  for (const capability of ['kubernetes.fixture', 'kubernetes.exposure', 'kubernetes.runtime-security']) {
    for (const controllerNamespace of ['a', 'a'.repeat(63), 'a-b']) {
      const runtime = { clusterBindings: { controllerNamespace }, ...(capability === 'kubernetes.fixture' ? { registryPeer: peer } : {}) };
      assert.doesNotThrow(() => validateCapabilitySourceClosure(runtime, new Set([capability])));
      assert.doesNotThrow(() => capabilitySources(runtime, new Set([capability]), noReads));
    }
    for (const controllerNamespace of ['', 'a'.repeat(64), '-a', 'a-', 'A', 'a.b', 'a/b', 'a\n', 1, null]) {
      const runtime = { clusterBindings: { controllerNamespace }, registryPeer: peer };
      assert.throws(() => capabilitySources(runtime, new Set([capability]), noReads), /BUSTER_CLUSTER_BINDINGS_INVALID/);
    }
  }
  // v1 historically validates an explicitly supplied binding even without a
  // cluster provider; the selected v2 receiver must separately forbid unused aliases.
  assert.doesNotThrow(() => validateCapabilitySourceClosure({ clusterBindings: { controllerNamespace: 'original' } }, new Set()));
  assert.doesNotThrow(() => validateCapabilitySourceClosure({}, new Set()));
});


test('command public policy rejects before confidential reads in source closure and actual loader', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-command-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings as BusterSettings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings as WorkerCoreSettings;
  const directCommand = { ...directCommandPolicy, cgroupRoot: '/fixture/cgroup' };
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline, ...source,
    allowedCapabilities: ['command.execute'], directCommand,
    platformConfig: path.join(root, 'never-resolve-platform.json'), stateRoot: path.join(root, 'must-not-create-store'),
    runtimeRoot: path.join(root, 'must-not-create-runs'), tarExecutable: '/usr/bin/tar' };
  const file = path.join(root, 'runtime.json');
  let confidentialReads = 0;
  const environment = new Proxy({ KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }, {
    get(target, name) {
      if (name === 'TEST_SOURCE_KEY' || name === 'TEST_BUSTER_TOKEN') confidentialReads++;
      return Reflect.get(target, name);
    },
  });
  const capabilities = new Set(['command.execute']);
  for (const field of Object.keys(directCommandPolicy)) {
    for (const bad of [undefined, null, false, 0, '', {}, []]) {
      // An empty executable catalog is permitted by the original decoder.
      if (field === 'executableCatalog' && bad && typeof bad === 'object' && !Array.isArray(bad)) continue;
      const invalid = { ...directCommand, [field]: bad };
      const error = new RegExp('BUSTER_REMOTE_CONFIG_INVALID:directCommand.' + field);
      assert.throws(() => validateCapabilitySourceClosure({ directCommand: invalid }, capabilities), error, field);
      fs.writeFileSync(file, JSON.stringify({ ...runtime, directCommand: invalid }));
      assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
        settings, worker.localRuntime, environment), error, field);
      assert.equal(confidentialReads, 0, field + ' must reject before source-key/token reads');
    }
  }
  assert.throws(() => validateCapabilitySourceClosure({ directCommand }, new Set()), /INACTIVE_CAPABILITY_SOURCE/);
  assert.doesNotThrow(() => validateCapabilitySourceClosure({ directCommand }, capabilities));
  assert.deepEqual(directCommandOptions(directCommand, root, '/fixture/cgroup', false).directCommand,
    { ...directCommandPolicy, executableCatalog: new Map(Object.entries(directCommandPolicy.executableCatalog)), cgroupRoot: '/fixture/cgroup' });
  fs.writeFileSync(file, JSON.stringify(runtime));
  assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
    settings, worker.localRuntime, { KUBECLAW_BUILD_REVISION: 'a'.repeat(40),
      TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }), /ENOENT/,
    'restored complete command source reaches original missing platform, not a native launch');
  assert.deepEqual(fs.readdirSync(root), ['runtime.json'], 'no provider, store, cgroup or executable activation');
});


test('build and scanner original public limits reject before loader authority; restored domains stay unchanged', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-build-scan-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings as BusterSettings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings as WorkerCoreSettings;
  const registryPeer = { registryBaseUrl: 'http://registry.example', registryReference: 'registry.example' };
  const build = { ...registryPeer, buildctlExecutable: '/not-an-installed-buildctl', buildkitHost: 'unix:///not-a-socket',
    repositoryPrefix: 'fixture', allowedPlatforms: ['linux/amd64'], maximumLogBytes: 1,
    maximumExecutionMs: 1, maximumManifestBytes: 1 };
  const scan = { trivyExecutable: '/not-an-installed-trivy', cacheDirectory: '/not-a-cache',
    registry: registryPeer, allowedRegistryPrefixes: ['registry.example/fixture'], maximumExecutionMs: 1, maximumOutputBytes: 1 };
  const runtime = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline, ...source,
    platformConfig: path.join(root, 'missing-platform.json'), stateRoot: path.join(root, 'must-not-create-store'),
    runtimeRoot: path.join(root, 'must-not-create-runs'), tarExecutable: '/usr/bin/tar', registryPeer };
  const file = path.join(root, 'runtime.json');
  let confidentialReads = 0;
  const environment = new Proxy({ KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }, { get(target, name) {
    if (name === 'TEST_SOURCE_KEY' || name === 'TEST_BUSTER_TOKEN') confidentialReads++;
    return Reflect.get(target, name);
  } });
  for (const [capability, field, valid, requiredFields] of [
    ['container.build', 'containerBuild', build, ['allowedPlatforms', 'maximumLogBytes', 'maximumExecutionMs', 'maximumManifestBytes']],
    ['security.scan', 'securityScan', scan, ['allowedRegistryPrefixes', 'maximumExecutionMs', 'maximumOutputBytes']],
  ] as const) {
    const capabilities = new Set([capability]);
    const complete = { ...runtime, allowedCapabilities: [capability], [field]: valid };
    const patches: Record<string, unknown>[] = requiredFields.flatMap(name =>
      [undefined, null, false, 0, '', {}, []].map(bad => ({ [name]: bad })));
    if (field === 'containerBuild') patches.push({ allowedBuildArguments: null }, { allowedBuildArguments: [1] });
    else patches.push({ databasePolicy: null }, ...['maximumVulnerabilityAgeMs', 'maximumJavaAgeMs', 'maximumDatabaseBytes'].flatMap(name =>
      [undefined, null, 0, Number.MAX_SAFE_INTEGER + 1].map(bad => ({ databasePolicy: {
        maximumVulnerabilityAgeMs: 1, maximumJavaAgeMs: 1, maximumDatabaseBytes: 1, [name]: bad,
      } }))));
    for (const patch of patches) {
      const invalid = { ...complete, [field]: { ...valid, ...patch } };
      const error = new RegExp('BUSTER_REMOTE_CONFIG_INVALID:' + field);
      assert.throws(() => validateCapabilitySourceClosure(invalid, capabilities), error);
      fs.writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
        settings, worker.localRuntime, environment), error);
      assert.equal(confidentialReads, 0, 'public rejection before source key/token/registry secrets');
    }
    assert.doesNotThrow(() => validateCapabilitySourceClosure(complete, capabilities));
    assert.throws(() => validateCapabilitySourceClosure(complete, new Set()), /INACTIVE_CAPABILITY_SOURCE/);
    fs.writeFileSync(file, JSON.stringify(complete));
    assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
      settings, worker.localRuntime, { KUBECLAW_BUILD_REVISION: 'a'.repeat(40),
        TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }), /ENOENT/,
      'restored valid input reaches original platform lookup without launching tools');
  }
  const buildOptions = containerBuildOptions(build, root, undefined, undefined).containerBuild!;
  assert.deepEqual(buildOptions.allowedBuildArguments, [], 'original absent optional build argument domain');
  assert.equal(buildOptions.maximumManifestBytes, 1, 'no invented minimum');
  assert.doesNotThrow(() => validateCapabilitySourceClosure({ registryPeer, containerBuild: { ...build, allowedBuildArguments: [] } }, new Set(['container.build'])));
  const databasePolicy = { maximumVulnerabilityAgeMs: 1, maximumJavaAgeMs: 1, maximumDatabaseBytes: 1 };
  assert.deepEqual(securityScanOptions({ ...scan, databasePolicy }, root,
    { source: registryPeer, username: undefined, password: undefined }).securityScan!.databasePolicy, databasePolicy);
  assert.equal(securityScanOptions(scan, root, { source: registryPeer, username: undefined, password: undefined }).securityScan!.databasePolicy, undefined);
  assert.deepEqual(fs.readdirSync(root), ['runtime.json'], 'no cache/store/native tool activation');
});


test('all original browser public policies reject before confidential reads without resolving native tools', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-browser-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings as BusterSettings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings as WorkerCoreSettings;
  const common = { allowedBrowsers: ['chromium'], maximumCombinations: 1, maximumConcurrency: 1,
    maximumExecutionMs: 1, maximumResultBytes: 1, maximumScreenshotBytes: 1 };
  const policies: [string, string, Record<string, unknown>][] = [
    ['browser.axe', 'browserAxe', { ...common, maximumScreenshots: 1 }],
    ['browser.lighthouse', 'browserLighthouse', { maximumRuns: 1, maximumExecutionMs: 1, maximumResultBytes: 1 }],
    ['browser.visual', 'browserVisual', { ...common, maximumMasksPerCombination: 1 }],
    ['browser.playwright', 'browserPlaywright', { allowedTargetPorts: [65535], readOnlyRoots: ['/'],
      maximumWorkers: 1, maximumExecutionMs: 1, maximumOutputBytes: 1, maximumResultBytes: 1,
      maximumArtifactBytes: 1, maximumArtifactFiles: 1, maximumProcesses: 1, maximumMemoryBytes: 1,
      maximumCpuMillis: 1, terminationGraceMs: 1, runAsUid: 1, runAsGid: 1 }],
  ];
  const file = path.join(root, 'runtime.json');
  let confidentialReads = 0;
  const environment = new Proxy({ KUBECLAW_BUILD_REVISION: 'a'.repeat(40) }, { get(target, name) {
    if (name === 'TEST_SOURCE_KEY' || name === 'TEST_BUSTER_TOKEN') confidentialReads++;
    return Reflect.get(target, name);
  } });
  for (const [capability, field, policy] of policies) {
    const valid = { ...policy, cgroupRoot: '/not-a-cgroup', browserExecutables: { chromium: '/not-an-executable' },
      chromeExecutable: '/not-a-chrome', playwrightExecutable: '/not-a-playwright' };
    const complete = { schemaVersion: 'buster-remote-plan-runtime.v1', ...baseline, ...source,
      platformConfig: path.join(root, 'missing-platform.json'), stateRoot: path.join(root, 'must-not-create-store'),
      runtimeRoot: path.join(root, 'must-not-create-runs'), tarExecutable: '/usr/bin/tar',
      allowedCapabilities: [capability], [field]: valid };
    const patches = Object.keys(policy).flatMap(name => [undefined, null, false, 0, '', {}, []].map(bad => ({ [name]: bad })));
    patches.push({ allowedOrigins: [1] });
    if (field === 'browserPlaywright') patches.push({ allowedTargetPorts: [65536] });
    if (field === 'browserAxe' || field === 'browserVisual') {
      patches.push({ allowedBrowsers: ['safari'] }, { allowedBrowsers: ['chromium', 'safari'] },
        { allowedBrowsers: ['Chromium'] });
      for (const browser of ['chromium', 'firefox', 'webkit']) {
        assert.doesNotThrow(() => validateCapabilitySourceClosure({ ...complete,
          [field]: { ...valid, allowedBrowsers: [browser] } }, new Set([capability])),
        'every original provider browser stays supported without native tool lookup');
      }
    }
    for (const patch of patches) {
      const invalid = { ...complete, [field]: { ...valid, ...patch } };
      const error = new RegExp('BUSTER_REMOTE_CONFIG_INVALID:' + field);
      assert.throws(() => validateCapabilitySourceClosure(invalid, new Set([capability])), error);
      fs.writeFileSync(file, JSON.stringify(invalid));
      assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
        settings, worker.localRuntime, environment), error);
      assert.equal(confidentialReads, 0, 'public browser rejection before source key/token');
    }
    assert.doesNotThrow(() => validateCapabilitySourceClosure(complete, new Set([capability])),
      'source closure must not stat, resolve or activate invalid native paths');
    assert.doesNotThrow(() => validateCapabilitySourceClosure({ ...complete, [field]: { ...valid, allowedOrigins: [] } }, new Set([capability])));
    assert.throws(() => validateCapabilitySourceClosure(complete, new Set()), /INACTIVE_CAPABILITY_SOURCE/);
    fs.writeFileSync(file, JSON.stringify(complete));
    assert.throws(() => loadProductionBusterRemotePlanRuntime(file, null as unknown as BusterPreparation,
      settings, worker.localRuntime, { KUBECLAW_BUILD_REVISION: 'a'.repeat(40),
        TEST_BUSTER_TOKEN: 'fixture-token-00000000000000000000', TEST_SOURCE_KEY: key }), /ENOENT/,
      'restored complete browser policy reaches original platform lookup, not tool activation');
  }
  const axe = browserAxeOptions({ ...policies[0][2] }).browserAxe!;
  assert.deepEqual(axe.allowedOrigins, []); assert.deepEqual(axe.browserExecutables, {});
  assert.equal(axe.maximumScreenshots, 1);
  const lighthouse = browserLighthouseOptions({ ...policies[1][2], chromeExecutable: process.execPath }).browserLighthouse!;
  assert.equal(lighthouse.maximumRuns, 1); assert.equal(lighthouse.chromeExecutable, fs.realpathSync(process.execPath));
  assert.equal(browserVisualOptions(policies[2][2]).browserVisual!.maximumMasksPerCombination, 1);
  const playwright = browserPlaywrightOptions(policies[3][2], root, 'cg').browserPlaywright!;
  assert.deepEqual(playwright.allowedTargetPorts, [65535]); assert.equal(playwright.runAsUid, 1);
  assert.equal(playwright.cgroupRoot, path.join(root, 'cg'));
  assert.deepEqual(fs.readdirSync(root), ['runtime.json'], 'no browser/store/cgroup effects');
});
