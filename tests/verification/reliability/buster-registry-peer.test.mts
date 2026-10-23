import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { capabilitySources, validateCapabilitySourceClosure } from '../../../skills/buster/engine/test-gates/production-capability-sources.ts';
import { networkHttpOptions, securityScanOptions } from '../../../skills/buster/engine/test-gates/production-command-options.ts';
import { registryClientConfig, registryClientOrigin } from '../../../scripts/registry-client-config.mjs';
import { RegistryHealthAccess } from '../../../skills/buster/engine/test-gates/registry-health-access.ts';

const peer = { registryBaseUrl: 'https://registry.example', registryReference: 'registry.example',
  registryUsernameEnvironmentVariable: 'REGISTRY_USER', registryPasswordEnvironmentVariable: 'REGISTRY_PASSWORD' };
const network = { registryHealth: true, allowedPorts: [443], maximumResponseBytes: 1024, maximumExecutionMs: 1000 };
const env = { REGISTRY_USER: 'fixture-user', REGISTRY_PASSWORD: 'fixture-password' };
const noReads = new Proxy({}, { get() { assert.fail('must not read inactive or invalid credentials'); } });

test('network-only health receives the independent peer and scoped native credentials', () => {
  const reads: PropertyKey[] = [];
  const sources = capabilitySources({ registryPeer: peer, networkHttp: network }, new Set(['network.http']),
    new Proxy(env, { get(target, key) { reads.push(key); return Reflect.get(target, key); } }));
  assert.equal(sources.containerBuildSource, null);
  const captured = sources.capturedRegistryPeer!;
  assert.deepEqual(reads, ['REGISTRY_USER', 'REGISTRY_PASSWORD']);
  const options = networkHttpOptions(sources.networkHttpSource, captured.source, captured.username, captured.password).networkHttp!;
  const access = new RegistryHealthAccess(options.registryHealth!);
  assert.equal(access.headers(new URL('https://registry.example/v2/'), 'request', {})?.authorization,
    `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`);
  assert.throws(() => access.headers(new URL('https://registry.example/private'), 'request', {}), /SCOPE_DENIED/);
  assert.equal(Object.isFrozen(captured.source), true);
});

test('anonymous HTTP peer works without build source or confidential lookup; inactive health has no peer', () => {
  const source = { registryBaseUrl: 'http://registry.example:5000', registryReference: 'registry.example:5000' };
  const captured = capabilitySources({ registryPeer: source, networkHttp: network }, new Set(['network.http']), noReads).capturedRegistryPeer!;
  assert.deepEqual(new RegistryHealthAccess({ origin: String(captured.source.registryBaseUrl) }).headers(
    new URL('http://registry.example:5000/v2/'), 'request', {}), {});
  const { registryHealth, ...disabled } = network;
  const sources = capabilitySources({ networkHttp: disabled }, new Set(['network.http']), noReads);
  assert.equal(sources.capturedRegistryPeer, undefined);
  assert.equal(networkHttpOptions(sources.networkHttpSource, null, undefined, undefined).networkHttp?.registryHealth, undefined);
  assert.equal(capabilitySources({}, new Set(), noReads).capturedRegistryPeer, undefined);
});

test('presence, alias, transport, and credential-name errors reject before lookup', () => {
  for (const source of [undefined, { ...peer, registryReference: 'other.example' },
    { ...peer, registryPasswordEnvironmentVariable: undefined }, { ...peer, nodeCaFile: '/node/ca' },
    { ...peer, registryBaseUrl: 'http://registry.example' }, { ...peer, registryCaFile: 'relative' }]) {
    assert.throws(() => capabilitySources({ networkHttp: network, ...(source ? { registryPeer: source } : {}) },
      new Set(['network.http']), noReads), /REGISTRY_PEER/);
  }
  assert.throws(() => capabilitySources({ registryPeer: peer }, new Set(), noReads), /PEER_INACTIVE/);
  assert.throws(() => capabilitySources({ containerBuild: peer }, new Set(), noReads), /INACTIVE_CAPABILITY_SOURCE/);
  assert.throws(() => capabilitySources({ networkHttp: { ...network, registryHealth: false } }, new Set(['network.http']), noReads), /HEALTH_CONFIG_INVALID/);
  for (const capability of ['container.build', 'security.scan']) {
    const field = capability === 'container.build' ? 'containerBuild' : 'securityScan';
    const alias = { ...peer, registryPasswordEnvironmentVariable: 'OTHER_PASSWORD' };
    assert.throws(() => capabilitySources({ registryPeer: peer, [field]: field === 'securityScan' ? { registry: alias } : alias },
      new Set([capability]), noReads), /PEER_MISMATCH/);
  }
});

test('fixture and scanner use the same peer without activating build; scanner never rereads credentials', () => {
  assert.deepEqual(capabilitySources({ registryPeer: peer, clusterBindings: { controllerNamespace: 'original' } }, new Set(['kubernetes.fixture']), env).capturedRegistryPeer?.source, peer);
  const scan = { registry: { ...peer }, trivyExecutable: '/trivy', cacheDirectory: '/cache',
    allowedRegistryPrefixes: ['registry.example/'], maximumExecutionMs: 1000, maximumOutputBytes: 1024 };
  const sources = capabilitySources({ registryPeer: peer, securityScan: scan }, new Set(['security.scan']), env);
  const options = securityScanOptions(sources.securityScanSource, '/', sources.capturedRegistryPeer).securityScan!;
  assert.equal(options.registryAccess?.password, env.REGISTRY_PASSWORD);
  assert.equal(sources.containerBuildSource, null);
});

test('actual entrypoint materializer reads one operator peer and repeats that exact projection', () => {
  const shell = fs.readFileSync(new URL('../../../docker/buster-runtime-entrypoint.sh', import.meta.url), 'utf8');
  const producer = shell.match(/node <<'NODE'\n([\s\S]*?)\nNODE/u);
  assert(producer, 'actual runtime producer heredoc must be present');
  const script = producer[1]!;
  const writes = new Map<string, string>(); let peerReads = 0;
  vm.runInNewContext(script, { process: { env: { RUNTIME_CONFIG_ROOT: '/runtime', REGISTRY_REFERENCE: 'registry.example', REGISTRY_CLIENT_RUNTIME: '/peer' } },
    require(name: string) {
      if (name === 'fs') return { readFileSync(file: string) { assert.equal(file, '/peer'); peerReads++; return JSON.stringify(peer); },
        writeFileSync(file: string, text: string) { writes.set(file, text); } };
      if (name === 'path') return { join: (...parts: string[]) => parts.join('/') };
      if (name.endsWith('preparation-runtime-source.ts')) return { projectLegacyBusterPreparationSource: () => ({}) };
      if (name.endsWith('/playwright')) return { chromium: { executablePath: () => '/chromium' } };
      throw new Error(name);
    } });
  const runtime = JSON.parse(writes.get('/runtime/runtime.json')!);
  assert.equal(peerReads, 1);
  assert.deepEqual(runtime.registryPeer, peer);
  for (const [key, value] of Object.entries(peer)) assert.equal(runtime.containerBuild[key], value);
  assert.deepEqual(runtime.securityScan.registry, peer);
});

test('production loader starts network-only runtime, rejects bad peer before registry/store, and restores', async t => {
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { cliProfile } = await import('../../fixtures/test-gate/buster-cli-profile.mjs');
  const { loadProductionBusterRemotePlanRuntime } = await import('../../../skills/buster/engine/test-gates/production.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-peer-production-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = JSON.parse(fs.readFileSync(new URL('../../../config/components/buster-engine.config.json', import.meta.url), 'utf8')).profiles.runtime.settings;
  const worker = JSON.parse(fs.readFileSync(new URL('../../../config/components/worker-core.config.json', import.meta.url), 'utf8')).profiles.standard.settings;
  const fixture = cliProfile(root, settings.admission);
  const runtimeSource = JSON.parse(fs.readFileSync(fixture.runtime, 'utf8'));
  Object.assign(runtimeSource, { allowedCapabilities: ['network.http'], networkHttp: network, registryPeer: peer });
  const preparation = { stage() { throw new Error('unexpected admission'); } };
  const load = () => loadProductionBusterRemotePlanRuntime(fixture.runtime, preparation as never, settings, worker.localRuntime, { ...fixture.environment, ...env });
  fs.writeFileSync(fixture.runtime, JSON.stringify({ ...runtimeSource, registryPeer: { ...peer, registryReference: 'wrong.example' }, platformConfig: '/never/read/platform' }));
  assert.throws(load, /REGISTRY_PEER_INVALID/);
  assert.equal(fs.existsSync(path.join(root, 'plan-jobs')), false);
  const publicOnly = new Proxy({}, { get(_target, name) {
    if (name === 'KUBECLAW_BUILD_REVISION') return fixture.environment.KUBECLAW_BUILD_REVISION;
    if (['REGISTRY_USER', 'REGISTRY_PASSWORD', 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY',
      'BUSTER_V2_TOKEN'].includes(String(name)) || String(name) === runtimeSource.tokenEnvironmentVariable
      || String(name) === runtimeSource.sourceAttestationPublicKeyEnvironmentVariable) {
      assert.fail('invalid network policy must reject before confidential lookup: ' + String(name));
    }
    return undefined;
  } });
  for (const patch of [{ allowedPorts: [65536] }, { maximumResponseBytes: 0 },
    { maximumExecutionMs: 0 }, { maximumExecutionMs: 2147483648 },
    { allowedMethods: ['TRACE'] }, { allowedMethods: ['get'] },
    { allowedRequestHeaders: ['Host'] }, { allowedRequestHeaders: ['x bad'] },
    { allowWebSocket: 'false' }]) {
    fs.writeFileSync(fixture.runtime, JSON.stringify({ ...runtimeSource, networkHttp: { ...network, ...patch } }));
    assert.throws(() => loadProductionBusterRemotePlanRuntime(fixture.runtime, preparation as never,
      settings, worker.localRuntime, publicOnly), /BUSTER_REMOTE_CONFIG_INVALID:networkHttp/);
    assert.equal(fs.existsSync(path.join(root, 'plan-jobs')), false);
  }
  fs.writeFileSync(fixture.runtime, JSON.stringify(runtimeSource));
  const runtime = load();
  try {
    const address = await runtime.start();
    const response = await fetch(`http://127.0.0.1:${address.port}/readyz`, { headers: { authorization: `Bearer ${fixture.environment.ADMISSION_TEST_TOKEN}` } });
    assert.equal(response.status, 200);
  } finally { await runtime.stop(); }
});


test('every active public network policy field rejects before confidential lookup and restores', () => {
  const capabilities = new Set(['network.http']);
  const invalid = [
    { allowedOrigins: [1] }, { allowedHostSuffixes: [1] }, { allowedPorts: [65536] },
    { maximumResponseBytes: 0 }, { maximumExecutionMs: 0 }, { maximumRequestBytes: 0 },
    { allowedMethods: [] }, { allowedMethods: ['TRACE'] }, { allowedMethods: ['get'] },
    { allowedMethods: ['GET', 'CONNECT'] }, { allowedRequestHeaders: [1] },
    ...['connection', 'content-length', 'HOST', 'Proxy-Authorization', 'transfer-encoding', 'upgrade', 'x bad', 'x:bad', 'x\r\ny'].map(name => ({ allowedRequestHeaders: [name] })),
    { maximumExecutionMs: 2147483648 }, { allowWebSocket: 'false' },
  ];
  for (const patch of invalid) {
    assert.throws(() => capabilitySources({ registryPeer: peer, networkHttp: { ...network, ...patch } },
      capabilities, noReads), /BUSTER_REMOTE_CONFIG_INVALID:networkHttp/);
  }
  for (const method of ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']) {
    const policy = { ...network, maximumExecutionMs: 2147483647, allowedMethods: [method],
      allowedRequestHeaders: ['X-Custom', 'accept', "x!#$%&'*+.^_`|~-"] };
    assert.doesNotThrow(() => validateCapabilitySourceClosure({ networkHttp: policy, registryPeer: peer }, capabilities));
    const options = networkHttpOptions(policy, peer, env.REGISTRY_USER, env.REGISTRY_PASSWORD).networkHttp!;
    assert.deepEqual(options.allowedMethods, [method]);
    assert.deepEqual(options.allowedRequestHeaders, policy.allowedRequestHeaders);
    assert.equal(options.maximumExecutionMs, 2147483647);
  }
  const restored = capabilitySources({ registryPeer: peer, networkHttp: network }, capabilities, env);
  assert.deepEqual(restored.capturedRegistryPeer?.source, peer);
  assert.equal(networkHttpOptions(restored.networkHttpSource, restored.capturedRegistryPeer!.source,
    restored.capturedRegistryPeer!.username, restored.capturedRegistryPeer!.password).networkHttp?.maximumExecutionMs, 1000);
});


test('registry peer preserves the original operator producer domain before any confidential read', () => {
  const capabilities = new Set(['network.http']);
  const auth = { usernameEnvironmentVariable: 'REGISTRY_USER', passwordEnvironmentVariable: 'REGISTRY_PASSWORD' };
  // Use the actual original operator producer, not hand-authored output aliases.
  // Public projection equality still does NOT authenticate original revisions.
  for (const registry of [
    { endpoint: 'http://registry.example:5000', transport: 'http-lab' },
    { endpoint: 'https://registry.example', transport: 'https', auth },
    { endpoint: 'https://REGISTRY.example:443/', transport: 'https', auth },
    { endpoint: 'https://registry.example:5443', transport: 'https', auth,
      caFile: '/worker/registry-ca.crt', nodeCaFile: '/node/registry-ca.crt' },
  ]) {
    const original = { schemaVersion: 'registry-clients.v1', registry };
    const produced = registryClientConfig(original, env).runtime;
    assert.equal(produced.registryBaseUrl, registryClientOrigin(original));
    const captured = capabilitySources({ registryPeer: produced, networkHttp: network }, capabilities,
      registry.transport === 'http-lab' ? noReads : env).capturedRegistryPeer!;
    assert.deepEqual(captured.source, produced);
    assert.equal(Object.isFrozen(captured.source), true);
  }
  for (const [registry, received] of [
    [{ endpoint: 'https://[::1]', transport: 'https', auth },
      { ...peer, registryBaseUrl: 'https://[::1]', registryReference: '[::1]' }],
    [{ endpoint: 'https://bad_host.example', transport: 'https', auth },
      { ...peer, registryBaseUrl: 'https://bad_host.example', registryReference: 'bad_host.example' }],
    [{ endpoint: peer.registryBaseUrl, transport: 'https', auth: { ...auth, usernameEnvironmentVariable: 'A' } },
      { ...peer, registryUsernameEnvironmentVariable: 'A' }],
    [{ endpoint: peer.registryBaseUrl, transport: 'https', auth: { ...auth, passwordEnvironmentVariable: 'Z' } },
      { ...peer, registryPasswordEnvironmentVariable: 'Z' }],
  ]) {
    assert.throws(() => registryClientOrigin({ schemaVersion: 'registry-clients.v1', registry }));
    assert.throws(() => capabilitySources({ registryPeer: received, networkHttp: network }, capabilities, noReads),
      /BUSTER_REGISTRY_PEER_INVALID/);
    // Restore the original supported projection after every rejected input.
    assert.deepEqual(capabilitySources({ registryPeer: peer, networkHttp: network }, capabilities, env)
      .capturedRegistryPeer!.source, peer);
  }
});


test('conditional provider closure rejects every explicitly present inactive source before carrier reads', () => {
  const providers = [
    ['command.execute', 'directCommand'], ['container.build', 'containerBuild'],
    ['network.http', 'networkHttp'], ['browser.axe', 'browserAxe'],
    ['browser.lighthouse', 'browserLighthouse'], ['browser.visual', 'browserVisual'],
    ['browser.playwright', 'browserPlaywright'], ['security.scan', 'securityScan'],
  ] as const;
  for (const [capability, field] of providers) {
    for (const supplied of [undefined, null, {}, false, 0, '']) {
      assert.throws(() => capabilitySources({ [field]: supplied }, new Set(), noReads),
        new RegExp('BUSTER_INACTIVE_CAPABILITY_SOURCE:' + field), field + ':' + String(supplied));
    }
    assert.throws(() => capabilitySources({ [field]: undefined }, new Set([capability]), noReads),
      /CONFIG_REQUIRED/, field + ': active omission stays required');
    // Restored omission must not resolve an inactive credential carrier.
    assert.equal(capabilitySources({}, new Set(), noReads).capturedRegistryPeer, undefined);
  }
});
