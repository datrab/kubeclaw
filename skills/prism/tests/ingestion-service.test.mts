import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('real ingestion cleanup failure is explicit, preserves authorization and supports retry without process restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'prism-ingestion-http-'));
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const address = reserve.address(); assert(address && typeof address !== 'string');
  const port = address.port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/ingestion.ts', import.meta.url))], {
    env: { ...process.env, PORT: String(port), PRISM_QUARANTINE_ROOT: root,
      PRISM_INGESTION_SECRET: 'local-ingestion-regression' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); }); child.stdout.resume();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${port}`; const deadline = Date.now() + 5000;
  for (;;) {
    assert.equal(child.exitCode, null, stderr);
    let ready = false;
    try { ready = (await fetch(`${origin}/health`)).ok; } catch { /* Service is starting. */ }
    if (ready) break;
    assert(Date.now() < deadline, stderr); await new Promise(resolve => setTimeout(resolve, 10));
  }
  const file = join(root, 'a'.repeat(64)); await mkdir(file);
  const url = `${origin}/v1/acquisitions/${'a'.repeat(64)}`;
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
  await access(file);
  const options = { method: 'DELETE', headers: { authorization: 'Bearer local-ingestion-regression' } };
  const failed = await fetch(url, options); assert.equal(failed.status, 503);
  const body = await failed.json(); assert.equal(body.error.code, 'PRISM_INGESTION_IO_FAILED');
  assert.equal(body.error.causeCode, 'EISDIR'); assert.match(body.error.message, /unlink/u);
  assert.equal((await fetch(`${origin}/health`)).status, 200); assert.equal(child.exitCode, null, stderr);
  await rm(file, { recursive: true }); await writeFile(file, 'temporary acquired content');
  assert.equal((await fetch(url, options)).status, 204); await assert.rejects(access(file), { code: 'ENOENT' });
  assert.equal((await fetch(url, options)).status, 204);
  assert.equal((await fetch(`${origin}/ready`)).status, 200);
  const invalid = await fetch(`${origin}/v1/acquisitions`, { method: 'POST', headers: options.headers, body: '{' });
  assert.equal(invalid.status, 422); assert.equal((await fetch(`${origin}/health`)).status, 200);
  assert.match(stderr, /PRISM_INGESTION_REQUEST_FAILED/u); assert.match(stderr, /EISDIR/u);
});
