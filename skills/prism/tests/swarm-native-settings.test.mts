import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismNativeSettings, type PrismSupervisorSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import { nativeResourcePolicy } from './native/resource-policy.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { AddressInfo } from 'node:net';
import { loadControlServerConfig } from '../server/control-config.ts';
import { loadWorkerConfig } from '../server/worker-config.ts';
import { requestWorkerResult } from '../control/worker-operation-transport.ts';
import { prismNativeAttempt } from '../engine/worker-envelope.ts';

const configRoot = fileURLToPath(new URL('../../../config/', import.meta.url));
// Author the actual complete profiles selected by BOTH real caller tuples.
// A standard-profile edit alone must not masquerade as an active spiffe edit.
const canonicalEntry = JSON.parse(fs.readFileSync(path.join(configRoot, 'pipeline.config.json'), 'utf8'));
const selectedProfiles = Object.fromEntries(['prism-execution', 'prism-control'].map(owner => {
  const profiles = [...new Set<string>(canonicalEntry.bindings
    .filter((binding: { owner: string; instanceId: string }) => binding.owner === owner
      && ['kubeclaw/prism/prism-control', 'kubeclaw/prism/prism-worker'].includes(binding.instanceId))
    .map((binding: { profileId: string }) => binding.profileId))];
  assert.equal(profiles.length, 1, `fixture requires one shared selected ${owner} profile`);
  return [owner, profiles[0]!];
}));
const executionDefaults = JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-execution.config.json'), 'utf8')).profiles[selectedProfiles['prism-execution']!].settings;
const controlDefaults = JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-control.config.json'), 'utf8')).profiles[selectedProfiles['prism-control']!].settings;
const supervisorDefaults = JSON.parse(fs.readFileSync(path.join(configRoot, 'components/prism-worker.config.json'), 'utf8')).profiles.standard.settings.supervisor;
const nativeDefaults = { ...executionDefaults, dispatchTimeoutMs: controlDefaults.dispatchTimeoutMs, supervisor: supervisorDefaults };
const credentials = { PRISM_SESSION_SECRET: 'test-session', PRISM_INGRESS_SECRET: 'test-ingress',
  PRISM_INGESTION_SECRET: 'test-ingestion', PRISM_DISPATCH_SECRET: 'test-dispatch', PRISM_WORKER_SECRET: 'test-worker', DATABASE_URL: 'postgresql://not-opened' };
const attempt = prismNativeAttempt('render', { artifactId: 'input:config-test', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example/input' }, 'config-transport-test', nativeResourcePolicy, 600000, 300000, 10000, 1048576, 16777216, 134217728, 64);
function fixture(t: { after(fn: () => void): void }, settings: {maximumResultBytes?: unknown; dispatchTimeoutMs?: unknown}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-native-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(configRoot, root, { recursive: true });
  const value: Record<string, { settings: any }> = {};
  for (const owner of ['prism-execution', 'prism-control']) {
    const author = JSON.parse(fs.readFileSync(path.join(root, `components/${owner}.config.json`), 'utf8'));
    value[owner] = author.profiles[selectedProfiles[owner]!];
  }
  value['prism-execution']!.settings.maximumResultBytes = settings.maximumResultBytes;
  value['prism-control']!.settings.dispatchTimeoutMs = settings.dispatchTimeoutMs;
  const write = () => {
    for (const [owner, profile] of Object.entries(value)) {
      const file = path.join(root, `components/${owner}.config.json`);
      const author = JSON.parse(fs.readFileSync(file, 'utf8'));
      author.profiles[selectedProfiles[owner]!] = profile;
      fs.writeFileSync(file, JSON.stringify(author));
    }
  };
  write();
  const load = (callerId: 'prism-control' | 'prism-worker') => {
    const entryFile = path.join(root, 'pipeline.config.json');
    const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
    const instanceId = `kubeclaw/prism/${callerId}`;
    const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId, serviceInstanceId: instanceId,
      bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
        .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
    const execution = captured.components['prism-execution']!.settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes' | 'enginePolicy'>;
    const control = captured.components['prism-control']!.settings;
    const native = Object.freeze({ ...execution, dispatchTimeoutMs: control.dispatchTimeoutMs as number,
      ...(callerId === 'prism-worker' ? { supervisor: captured.components['prism-worker']!.settings.supervisor as unknown as PrismSupervisorSettings } : {}) });
    // Selected consumer snapshots only, not authenticated startup/native-host admission.
    return Object.freeze({ native, maximumWorkerResponseBytes: native.maximumResultBytes,
      nativeWorkerDispatchTimeoutMs: native.dispatchTimeoutMs, workerUrl: new URL(control.workerUrl as string),
      spiffeEnabled: false, workerSecret: credentials.PRISM_WORKER_SECRET });
  };
  return { root, value, write, load, environment: credentials };
}

async function listener(t: { after(fn: () => Promise<void>): void }, handler: RequestListener) {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
for (const settings of [{ maximumResultBytes: 64, dispatchTimeoutMs: 100 }, { maximumResultBytes: 128, dispatchTimeoutMs: 2000 }]) {
  test(`CR01 both selected consumer snapshots use authored ${JSON.stringify(settings)}`, t => {
    const f = fixture(t, settings), control = f.load('prism-control'), worker = f.load('prism-worker');
    assert.equal(control.maximumWorkerResponseBytes, settings.maximumResultBytes);
    assert.equal(control.nativeWorkerDispatchTimeoutMs, settings.dispatchTimeoutMs);
    assert.deepEqual(worker.native, { ...executionDefaults, supervisor: nativeDefaults.supervisor, ...settings }); assert.equal(Object.isFrozen(worker.native), true);
    f.value['prism-execution'].settings.maximumResultBytes = 999;
    f.value['prism-control'].settings.dispatchTimeoutMs = 999;
    f.write();
    assert.equal(control.maximumWorkerResponseBytes, settings.maximumResultBytes);
    assert.equal(control.nativeWorkerDispatchTimeoutMs, settings.dispatchTimeoutMs); assert.deepEqual(worker.native, { ...executionDefaults, supervisor: nativeDefaults.supervisor, ...settings });
  });
}
for (const key of ['maximumResultBytes', 'dispatchTimeoutMs']) for (const invalid of [undefined, null, '5', 0, -1, 1.5, 2147483648]) {
  test(`CR01 both roles reject ${key}=${String(invalid)}`, t => {
    const f = fixture(t, { ...nativeDefaults, [key]: invalid });
    for (const role of ['prism-worker', 'prism-control'] as const) assert.throws(() => f.load(role), /SWARM_CONFIG_INVALID/);
  });
}
for (const settings of [undefined, null, { ...nativeDefaults, unknown: 1 }]) test('CR01 both roles reject missing or unsupported native section', t => {
  const f = fixture(t, nativeDefaults);
  f.value['prism-execution'].settings = settings == null ? settings : { ...executionDefaults, unknown: 1 };
  f.write();
  for (const role of ['prism-worker', 'prism-control'] as const) assert.throws(() => f.load(role), /SWARM_CONFIG_INVALID/);
});
for (const key of ['PRISM_NATIVE_MAXIMUM_RESULT_BYTES', 'PRISM_NATIVE_DISPATCH_TIMEOUT_MS']) test(`CR02 both roles reject ${key}`, t => {
  const f = fixture(t, nativeDefaults);
  const value = key.includes('RESULT') ? nativeDefaults.maximumResultBytes : nativeDefaults.dispatchTimeoutMs;
  for (const load of [loadWorkerConfig, loadControlServerConfig]) assert.throws(() => load(undefined as never, { ...f.environment, [key]: String(value) }), /SWARM_CONFIG_LEGACY_OVERRIDE/);
});
for (const maximumResultBytes of [8, 9]) test(`CR03 original HTTP transport enforces ${maximumResultBytes} UTF-8 bytes`, async t => {
  const f = fixture(t, { maximumResultBytes, dispatchTimeoutMs: 2000 });
  const url = await listener(t, (request, response) => {
    request.resume(); response.writeHead(200, { 'content-type': 'application/json' });
    response.write('"€'); response.end('€ "'); // 9 UTF-8 bytes, 5 characters; chunked response.
  });
  const config = { ...f.load('prism-control'), workerUrl: new URL(url) };
  if (maximumResultBytes === 8) await assert.rejects(requestWorkerResult(config, attempt), /PRISM_NATIVE_RESULT_BODY_LIMIT/);
  else assert.equal(await requestWorkerResult(config, attempt), '€€ ');
});
for (const mode of ['headers', 'body']) test(`CR04 real ${mode} deadline follows short and long author budgets`, { timeout: 10000 }, async t => {
  let requests = 0, closed = 0;
  const url = await listener(t, (request, response) => {
    requests++; request.resume(); response.on('close', () => closed++);
    if (mode === 'body') { response.writeHead(200, { 'content-type': 'application/json' }); response.write('"'); }
    void delay(300).then(() => { if (!response.destroyed) response.end(mode === 'body' ? 'ok"' : '"ok"'); });
  });
  const short = fixture(t, { maximumResultBytes: 128, dispatchTimeoutMs: 75 });
  const long = fixture(t, { maximumResultBytes: 128, dispatchTimeoutMs: 2000 });
  await assert.rejects(requestWorkerResult({ ...short.load('prism-control'), workerUrl: new URL(url) }, attempt),
    error => error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
  assert.equal(await requestWorkerResult({ ...long.load('prism-control'), workerUrl: new URL(url) }, attempt), 'ok');
  assert.equal(requests, 2); assert.equal(closed, 2, 'aborted request and completed request release their responses');
});

// The inactive author is still whole-owner validated, but must not supply the
// selected dispatch budget. Exercise both obligations instead of changing the
// existing A/B thresholds or relaxing deep equality to selected scalar checks.
test('CR01 inactive control profile cannot replace selected transport; invalid inactive profile rejects', t => {
  const f = fixture(t, { maximumResultBytes: 128, dispatchTimeoutMs: 75 });
  const file = path.join(f.root, 'components/prism-control.config.json');
  const author = JSON.parse(fs.readFileSync(file, 'utf8'));
  const inactive = Object.keys(author.profiles).filter(profile => profile !== selectedProfiles['prism-control']);
  assert.ok(inactive.length > 0, 'real complete owner must include an inactive contrast');
  for (const profile of inactive) author.profiles[profile].settings.dispatchTimeoutMs = 2000;
  fs.writeFileSync(file, JSON.stringify(author));
  for (const role of ['prism-control', 'prism-worker'] as const) {
    assert.equal(f.load(role).nativeWorkerDispatchTimeoutMs, 75);
  }
  for (const profile of inactive) author.profiles[profile].settings.dispatchTimeoutMs = 0;
  fs.writeFileSync(file, JSON.stringify(author));
  for (const role of ['prism-control', 'prism-worker'] as const) {
    assert.throws(() => f.load(role), /SWARM_CONFIG_INVALID/);
  }
});
