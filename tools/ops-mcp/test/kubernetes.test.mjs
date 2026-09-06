import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createKubeRequest } from '../src/kubernetes.mjs';

// Real TLS sockets and certificates test the HTTP transport, not Kubernetes.
// No successful cluster or RBAC behavior is simulated here.
test('HTTPS verifies CA/hostname, rotates credentials, bounds requests and refuses redirects', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-tls-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const credentials = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
  const authorizations = [];
  let redirectFollowed = false;
  const server = createServer(credentials, (req, res) => {
    authorizations.push(req.headers.authorization);
    if (req.url === '/redirect') { res.writeHead(302, { location: '/leak' }); res.end(); return; }
    if (req.url === '/leak') redirectFollowed = true;
    if (req.url === '/timeout') return;
    if (req.url === '/large') { res.end('x'.repeat(2048)); return; }
    if (req.url === '/denied') { res.writeHead(403); res.end('do-not-echo-body'); return; }
    res.end(JSON.stringify({ received: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const tokenFile = join(dir, 'token');
  writeFileSync(tokenFile, 'first-token');
  const options = { api: `https://localhost:${server.address().port}`, tokenFile,
    caFile: join(dir, 'cert.pem'), timeoutMs: 300, maxBytes: 1024 };
  const get = createKubeRequest(options);
  assert.deepEqual(await get('/read'), { received: true });
  writeFileSync(tokenFile, 'second-token');
  await get('/read');
  assert.deepEqual(authorizations.slice(0, 2), ['Bearer first-token', 'Bearer second-token']);
  await assert.rejects(get('/redirect'), /302/);
  assert.equal(redirectFollowed, false);
  await assert.rejects(get('/large'), /byte limit/);
  await assert.rejects(get('/timeout'), /timed out/);
  await assert.rejects(get('/denied'), error => /403/.test(error.message) && !error.message.includes('do-not-echo'));
  const wrongHost = createKubeRequest({ ...options, api: `https://127.0.0.1:${server.address().port}` });
  await assert.rejects(wrongHost('/read'), /Hostname\/IP does not match/);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', join(dir, 'other-key.pem'), '-out', join(dir, 'other-cert.pem'), '-subj', '/CN=other'], { stdio: 'ignore' });
  const wrongCA = createKubeRequest({ ...options, caFile: join(dir, 'other-cert.pem') });
  await assert.rejects(wrongCA('/read'), /self-signed certificate/);
  for (const api of ['http://localhost', 'https://a:b@localhost', 'https://localhost/path']) {
    assert.throws(() => createKubeRequest({ ...options, api }), /HTTPS origin/);
  }
});
