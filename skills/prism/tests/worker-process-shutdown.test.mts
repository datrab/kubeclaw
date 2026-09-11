import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { prismAttempt } from '../engine/worker-envelope.ts';
import { ContentAddressedArtifactStore } from '../storage/artifacts.ts';
import { handleInternalArtifact } from '../server/internal-artifacts.ts';

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
      await handleInternalArtifact(req, res, new URL(req.url!, 'http://control'), {
        artifacts: store, spiffeEnabled: false, workerSecret: 'local', trustedControlSpiffeId: '', trustedWorkerSpiffeId: '',
      });
    })().catch((error: unknown) => { res.writeHead(500); res.end(String(error)); });
  });
  control.listen(0, '127.0.0.1'); await once(control, 'listening');
  const address = control.address(); assert(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  const port = await unusedPort(), workerOrigin = new URL(`http://127.0.0.1:${port}`);
  const child = spawn(process.execPath, [new URL('../server/worker.ts', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(port), WORKER_TRUST_SPIFFE_ENABLED: 'true', PRISM_TRUSTED_CONTROL_SPIFFE_ID: 'spiffe://local/control',
      PRISM_WORKER_SECRET: 'local', DATABASE_URL: '', PRISM_CONTROL_INTERNAL_URL: origin.href, PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: '1500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; child.stderr!.setEncoding('utf8'); child.stderr!.on('data', data => { stderr += String(data); });
  const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; }
    stalled?.destroy(); control.closeAllConnections();
    await new Promise<void>(resolve => control.close(() => resolve())); await rm(root, { recursive: true, force: true });
  });
  await ready(child, workerOrigin, () => stderr);
  const input = await store.put(Buffer.from(JSON.stringify({ document: fixture, view: 'home', state: 'default', viewport: 'wide' })));
  const envelope = prismAttempt('render', { artifactId: input.artifactId, type: 'prism-engine-input', mediaType: 'application/json',
    contentDigest: input.digest, sizeBytes: input.sizeBytes, storageUrl: new URL(`/v1/internal/artifacts/${input.digest}`, origin).href }, 'process-shutdown');
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
    assert.match(f.stderr(), /"state":"requests_drained"/u); assert.doesNotMatch(f.stderr(), /"state":"unresolved"/u);
    const result = await response; assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.equal(result.status, 200); assert.equal(result.body.attemptId, f.envelope.attemptId);
      if (phase === 'read') {
        assert.equal(result.body.state, 'cancelled'); assert.equal(result.body.error?.code, 'WORKER_ATTEMPT_CANCELLED');
      } else {
        // This actual SPIFFE-mode process has no deployed trust proxy. The
        // original HMAC Control handler refuses its input, then Core writes the
        // genuine failure log. Shutdown must drain that upload and retain the
        // first execution error; this is not a successful trust/render proof.
        assert.equal(result.body.state, 'errored'); assert.equal(result.body.error?.code, 'WORKER_ATTEMPT_ERROR');
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
    const child = spawn(process.execPath, [new URL('../server/worker.ts', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(port), WORKER_TRUST_SPIFFE_ENABLED: 'false', PRISM_WORKER_SECRET: 'local',
        DATABASE_URL: `postgresql://local:local@127.0.0.1:${address.port}/local`, PRISM_CONTROL_INTERNAL_URL: 'http://127.0.0.1:1',
        PRISM_WORKER_SHUTDOWN_TIMEOUT_MS: '30' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    assert.match(stderr, /"state":"unresolved"/u); assert.doesNotMatch(stderr, /"state":"requests_drained"/u);
    await pending; await closed;
  });
}
