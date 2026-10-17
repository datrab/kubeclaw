import { writeWorkerShutdownPolicy } from './fixtures/worker-shutdown-policy.mts';
import { nativeResourcePolicy, nativeControlSettings } from './native/resource-policy.mts';
import test, { before, after } from 'node:test';
import { preparePrismProcessPublication, spawnInstalledPrismProcess, type PrismProcessPublication } from './fixtures/published-process.mjs';
import assert from 'node:assert/strict';
import { type ChildProcess } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { prismNativeAttempt } from '../engine/worker-envelope.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';

assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true', 'A dedicated native test pool is required');

// Build once outside the original twelve-second process deadlines. Each case
// still materializes/authenticates its own complete selected generation.
let builtRole: PrismProcessPublication;
// Genuine host identity/launcher/pool inputs remain external; never copy policy
// ENV authors or manufacture the native engine digest. Missing inputs still fail.
const nativeEnvironment = Object.fromEntries(['PRISM_ENGINE_CONTENT_DIGEST', 'PRISM_NATIVE_POOL_POLICY_FILE',
  'PRISM_NATIVE_LAUNCHER', 'PLAYWRIGHT_BROWSERS_PATH', 'NODE_ENV'].flatMap(key =>
  process.env[key] === undefined ? [] : [[key, process.env[key]]]));
before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'prism-shutdown-package-'));
  try {
    builtRole = await preparePrismProcessPublication(writeWorkerShutdownPolicy(root, 1500, 23456, 1000, 100, 'http://127.0.0.1:1'), 'prism-worker');
  } finally { await rm(root, {recursive: true, force: true}); }
});
after(async () => { if (builtRole) await rm(builtRole.root, {recursive: true, force: true}); });

async function authoredConfig(t: { after(fn: () => Promise<void>): void }, shutdownTimeoutMs: number, port: number, closeTimeoutMs: number, drainTimeoutMs: number, controlInternalUrl: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'prism-shutdown-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return writeWorkerShutdownPolicy(root, shutdownTimeoutMs, port, closeTimeoutMs, drainTimeoutMs, controlInternalUrl);
}

async function unusedPort(): Promise<number> {
  const reservation = createTcpServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const address = reservation.address(); assert(address && typeof address !== 'string');
  await new Promise<void>(resolve => reservation.close(() => resolve())); return address.port;
}
async function ready(child: ChildProcess, origin: URL, stderr: () => string): Promise<void> {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    assert.equal(child.exitCode, null, stderr()); assert.equal(child.signalCode, null, stderr());
    try { const response = await fetch(new URL('/bootstrap', origin)); await response.body?.cancel(); if (response.status === 200) return; }
    catch { /* The original listener is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Original worker did not become ready: ${stderr()}`);
}
async function setup(t: { after(callback: () => Promise<void>): void }, phase: 'read' | 'upload') {
  const root = await mkdtemp(join(tmpdir(), 'prism-process-shutdown-'));
  const store = new ContentAddressedArtifactStore(root);
  let contact!: () => void, drained!: () => void, stalled: ServerResponse | undefined, stored: string | undefined;
  const started = new Promise<void>(resolve => { contact = resolve; });
  const closed = new Promise<void>(resolve => { drained = resolve; });
  const control = createServer((req, res) => {
    void (async () => {
      if ((phase === 'read' && req.method === 'GET') || (phase === 'upload' && req.method === 'POST')) {
        stalled = res; res.once('close', drained);
        if (phase === 'upload') {
          const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
          stored = (await store.put(Buffer.concat(chunks))).artifactId;
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); contact(); return;
      }
      await handleInternalArtifact(req, res, new URL(req.url!, 'http://control'), {maximumInternalEvidenceBytes: nativeControlSettings.maximumInternalEvidenceBytes,
        artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
      });
    })().catch((error: unknown) => { res.writeHead(500); res.end(String(error)); });
  });
  control.listen(0, '127.0.0.1'); await once(control, 'listening');
  const address = control.address(); assert(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const port = await unusedPort(), workerOrigin = new URL(`http://127.0.0.1:${port}`);
  const {child} = await spawnInstalledPrismProcess(t, await authoredConfig(t, 1500, port, 1000, 100, origin.href),
    'prism-worker', { ...nativeEnvironment, WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control',
      PRISM_WORKER_SECRET: 'local', DATABASE_URL: '' }, false, builtRole.code);
  let stderr = ''; child.stderr!.setEncoding('utf8'); child.stderr!.on('data', data => { stderr += String(data); });
  const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; }
    stalled?.destroy(); control.closeAllConnections();
    await new Promise<void>(resolve => control.close(() => resolve())); await rm(root, { recursive: true, force: true });
  });
  await ready(child, workerOrigin, () => stderr);
  const input = await store.put(Buffer.from(JSON.stringify({ document: fixture, view: 'home', state: 'default', viewport: 'wide' })));
  const envelope = prismNativeAttempt('render', { artifactId: input.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: input.digest, sizeBytes: input.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${input.digest}`, origin).href }, 'process-shutdown', nativeResourcePolicy, nativeControlSettings.nativeAttemptLifetimeMs, nativeControlSettings.nativeAttemptTimeoutMs,
    nativeControlSettings.nativeAttemptCleanupTimeoutMs, nativeControlSettings.nativeAttemptLogBytes,
    nativeControlSettings.nativeAttemptResultBytes, nativeControlSettings.nativeAttemptEvidenceBytes, nativeControlSettings.nativeAttemptEvidenceFiles);
  return { child, workerOrigin, envelope, started, closed, exit, store, stored: () => stored, stderr: () => stderr };
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) for (const phase of ['read', 'upload'] as const) {
  test(`original worker process drains ${phase === 'upload' ? 'failed-input full-log upload' : phase} on actual ${signal}`, { timeout: 12_000 }, async t => {
    const f = await setup(t, phase);
    const pending = fetch(new URL('/v1/attempts', f.workerOrigin), { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-client-cert': 'URI=spiffe://local/control' }, body: JSON.stringify(f.envelope) });
    // Observe failures immediately; the original pre-fix process loses this response.
    const response = pending.then(async value => ({ ok: true as const, status: value.status, body: await value.json() as { state: string; attemptId: string; error?: { code: string; message: string } } }),
      error => ({ ok: false as const, error: String(error) }));
    await f.started; assert.equal(f.child.kill(signal), true);
    const [code, exitSignal] = await f.exit;
    assert.equal(code, 0, f.stderr()); assert.equal(exitSignal, null);
    assert.match(f.stderr(), /"state":"ownership_reconciled"/u); assert.doesNotMatch(f.stderr(), /prism_native_worker_failure/u);
    const result = await response; assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.equal(result.status, 200); assert.equal(result.body.attemptId, f.envelope.attemptId);
      if (phase === 'read') {
        assert.equal(result.body.state, 'cancelled');
        assert.equal(result.body.error?.code, 'WORKER_ATTEMPT_CANCELLED');
      } else {
        // No trust proxy is deployed in this isolated process test. The original
        // HMAC artifact endpoint refuses SPIFFE input, then the genuine failure
        // log upload stalls. Cancellation preserves that first execution error.
        assert.equal(result.body.state, 'errored');
        assert.equal(result.body.error?.code, 'WORKER_ATTEMPT_ERROR');
        assert.match(result.body.error?.message ?? '', /Prism artifact read failed: 401/u);
      }
    }
    await f.closed;
    if (phase === 'upload') assert.equal(Buffer.from(await f.store.get(f.stored()!)).toString(), '[system] Prism render operation started');
  });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`actual ${signal} exits nonzero when native PostgreSQL startup exceeds the service drain deadline`, { timeout: 12_000 }, async t => {
    const tcp = createTcpServer(socket => { socket.on('data', () => {}); });
    tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
    const address = tcp.address(); assert(address && typeof address !== 'string');
    const port = await unusedPort(), origin = new URL(`http://127.0.0.1:${port}`);
    const {child} = await spawnInstalledPrismProcess(t, await authoredConfig(t, 30, port, 20, 5, 'http://127.0.0.1:1'),
      'prism-worker', { ...nativeEnvironment, WORKER_TRUST_SPIFFE_ENABLED: 'false', PRISM_WORKER_SECRET: 'local',
        DATABASE_URL: `postgresql://local:***@127.0.0.1:${address.port}/local` }, false, builtRole.code);
    let stderr = ''; child.stderr!.setEncoding('utf8'); child.stderr!.on('data', data => { stderr += String(data); });
    const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; }
      await new Promise<void>(resolve => tcp.close(() => resolve()));
    });
    await ready(child, origin, () => stderr);
    const connecting = once(tcp, 'connection');
    const pending = fetch(new URL('/ready', origin)).then(response => response.body?.cancel(), () => undefined);
    const [socket] = await connecting; const closed = once(socket, 'close');
    const started = performance.now(); assert.equal(child.kill(signal), true);
    const [code, exitSignal] = await exit;
    assert.equal(code, 1, stderr); assert.equal(exitSignal, null);
    assert(performance.now() - started < 2000, 'failed drain must reach a bounded nonzero process cutoff');
    assert.match(stderr, /PRISM_WORKER_SHUTDOWN_DEADLINE/u); assert.doesNotMatch(stderr, /"state":"ownership_reconciled"/u);
    await pending; await closed;
  });
}
