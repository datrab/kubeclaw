import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { capabilitySources } from '../../../skills/buster/engine/test-gates/production-capability-sources.ts';
import { networkHttpOptions, securityScanOptions } from '../../../skills/buster/engine/test-gates/production-command-options.ts';
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
  assert.deepEqual(capabilitySources({ registryPeer: peer }, new Set(['kubernetes.fixture']), env).capturedRegistryPeer?.source, peer);
  const scan = { registry: { ...peer }, trivyExecutable: '/trivy', cacheDirectory: '/cache',
    allowedRegistryPrefixes: ['registry.example/'], maximumExecutionMs: 1000, maximumOutputBytes: 1024 };
  const sources = capabilitySources({ registryPeer: peer, securityScan: scan }, new Set(['security.scan']), env);
  const options = securityScanOptions(sources.securityScanSource, '/', sources.capturedRegistryPeer).securityScan!;
  assert.equal(options.registryAccess?.password, env.REGISTRY_PASSWORD);
  assert.equal(sources.containerBuildSource, null);
});

test('actual entrypoint materializer reads one operator peer and repeats that exact projection', () => {
  const shell = fs.readFileSync(new URL('../../../docker/buster-runtime-entrypoint.sh', import.meta.url), 'utf8');
  const script = shell.split("  node <<'NODE'\n")[1]!.split('\nNODE')[0]!;
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
  fs.writeFileSync(fixture.runtime, JSON.stringify(runtimeSource));
  const runtime = load();
  try {
    const address = await runtime.start();
    const response = await fetch(`http://127.0.0.1:${address.port}/readyz`, { headers: { authorization: `Bearer ${fixture.environment.ADMISSION_TEST_TOKEN}` } });
    assert.equal(response.status, 200);
  } finally { await runtime.stop(); }
});
