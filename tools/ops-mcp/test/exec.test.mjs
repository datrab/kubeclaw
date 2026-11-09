import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { WebSocketServer } from 'ws';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPodExec } from '../src/exec.mjs';

// Protocol fixtures over real TLS/WebSocket sockets; these do not simulate or
// establish cluster RBAC acceptance.
test('exec transport verifies TLS, encodes argv, rotates tokens and fails on missing status, timeout or overflow', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-exec-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, 'key'), cert = join(dir, 'cert'), token = join(dir, 'token');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  writeFileSync(token, 'first-token');
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) });
  const wss = new WebSocketServer({ server });
  const requests = [];
  wss.on('connection', (socket, req) => {
    requests.push({ url: new URL(req.url, 'https://localhost'), auth: req.headers.authorization, protocol: socket.protocol });
    const pod = req.url.split('/')[6];
    if (pod === 'timeout') return;
    socket.send(Buffer.concat([Buffer.from([1]), Buffer.from(pod === 'overflow' ? 'x'.repeat(2000) : 'stdout-ü')]));
    socket.send(Buffer.concat([Buffer.from([2]), Buffer.from('stderr')]));
    if (pod !== 'missing') socket.send(Buffer.concat([Buffer.from([3]), Buffer.from(JSON.stringify(pod === 'failed' ? { status: 'Failure', details: { causes: [{ reason: 'ExitCode', message: '7' }] } } : { status: 'Success' }))]));
    socket.close();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const s of wss.clients) s.terminate(); wss.close(); server.close(); });
  const options = { api: `https://localhost:${server.address().port}`, tokenFile: token, caFile: cert };
  const exec = createPodExec(options);
  const args = { namespace: 'kubeclaw', pod: 'success', container: 'runtime', command: ['node', '-e', 'a; $(b) & c'], timeoutSeconds: 2, maxOutputBytes: 1000 };
  const result = await exec(args);
  assert.equal(result.exitCode, 0); assert.equal(result.stdout, 'stdout-ü'); assert.equal(result.stderr, 'stderr');
  assert.deepEqual(requests[0].url.searchParams.getAll('command'), args.command);
  assert.equal(requests[0].url.searchParams.get('stdin'), 'false');
  assert.equal(requests[0].protocol, 'v4.channel.k8s.io');
  assert.equal(requests[0].auth, 'Bearer first-token');
  writeFileSync(token, 'second-token');
  assert.equal((await exec({ ...args, pod: 'failed' })).exitCode, 7);
  assert.equal(requests[1].auth, 'Bearer second-token');
  await assert.rejects(exec({ ...args, pod: 'missing' }), /STATUS_MISSING/);
  await assert.rejects(exec({ ...args, pod: 'overflow' }), /OUTPUT_LIMIT.*UNCONFIRMED/);
  await assert.rejects(exec({ ...args, pod: 'timeout', timeoutSeconds: 0.05 }), /TIMEOUT.*UNCONFIRMED/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(exec(args, abort.signal), /CANCELLED/);
  await assert.rejects(createPodExec({ ...options, api: `https://127.0.0.1:${server.address().port}` })(args), /TRANSPORT_FAILED/);
  assert.throws(() => createPodExec({ ...options, api: 'http://localhost' }), /HTTPS/);
});
