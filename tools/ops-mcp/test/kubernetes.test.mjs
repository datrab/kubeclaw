import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createKubeRequest, createKubeList } from '../src/kubernetes.mjs';

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
  const listRequests = [];
  const server = createServer(credentials, (req, res) => {
    authorizations.push(req.headers.authorization);
    const url = new URL(req.url, 'https://localhost');
    if (url.pathname === '/list' || url.pathname === '/huge-list') {
      // A transport fixture, not a simulated successful Kubernetes/RBAC test.
      const limit = Number(url.searchParams.get('limit'));
      const start = Number(url.searchParams.get('continue') || 0);
      listRequests.push({ limit, start, selector: url.searchParams.get('labelSelector') });
      const end = Math.min(start + limit, 5);
      res.end(JSON.stringify({ metadata: { continue: end < 5 ? String(end) : '' },
        items: Array.from({ length: end - start }, (_, i) => ({ id: start + i,
          data: 'x'.repeat(url.pathname === '/huge-list' ? 2048 : 400) })) }));
      return;
    }
    if (req.url === '/redirect') { res.writeHead(302, { location: '/leak' }); res.end(); return; }
    if (req.url === '/leak') redirectFollowed = true;
    if (req.url === '/timeout') return;
    if (req.url === '/large') { res.end('x'.repeat(2048)); return; }
    if (url.pathname === '/denied') { res.writeHead(403); res.end('do-not-echo-body'); return; }
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
  const list = createKubeList(get);
  const listed = await list('/list', { pageSize: 4, params: { labelSelector: 'app=ops' }, mapItem: item => item.id });
  assert.deepEqual(listed, { items: [0, 1, 2, 3, 4], pages: 3, continuation: null, partial: false });
  assert.deepEqual(listRequests, [
    { limit: 4, start: 0, selector: 'app=ops' },
    { limit: 2, start: 0, selector: 'app=ops' },
    { limit: 2, start: 2, selector: 'app=ops' },
    { limit: 2, start: 4, selector: 'app=ops' },
  ]);
  const partial = await list('/list', { pageSize: 4, maxPages: 1, continueToken: '1', mapItem: item => item.id });
  assert.deepEqual(partial, { items: [1, 2], pages: 1, continuation: '3', partial: true });
  await assert.rejects(list('/huge-list', { pageSize: 4 }), { code: 'KUBERNETES_RESPONSE_TOO_LARGE' });
  assert.deepEqual(listRequests.slice(-3).map(x => x.limit), [4, 2, 1]);
  const attempts = authorizations.length;
  await assert.rejects(list('/denied'), /403/);
  assert.equal(authorizations.length, attempts + 1, 'authorization errors must not be retried');
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
