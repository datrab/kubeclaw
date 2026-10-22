import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { issueCertificate } from '../src/provision.mjs';
import { reloadTls } from '../src/tls.mjs';

const openssl = process.env.PATH.split(':').map(dir => join(dir, 'openssl')).find(existsSync);
test('live TLS renewal keeps the same private CA and rejects half-observed Secret rotations without restarting the listener', async t => {
  const config = { dnsNames: ['localhost'] }, ca = issueCertificate(config, undefined, openssl);
  const first = issueCertificate(config, ca, openssl), second = issueCertificate(config, ca, openssl);
  const dir = mkdtempSync(join(tmpdir(), 'ops-tls-reload-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cert = join(dir, 'cert'), key = join(dir, 'key');
  writeFileSync(cert, first.cert); writeFileSync(key, first.key);
  const server = createServer(first, (_req, res) => res.end('ready'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const reload = reloadTls(server, cert, key, 60000);
  t.after(() => { reload.close(); server.closeAllConnections(); server.close(); });
  const fingerprint = () => new Promise((resolve, reject) => {
    const req = request(`https://localhost:${server.address().port}`, { ca: ca.cert, agent: false }, res => {
      const value = res.socket.getPeerCertificate().fingerprint256; res.resume(); res.on('end', () => resolve(value));
    }); req.on('error', reject); req.end();
  });
  assert.equal(await fingerprint(), new X509Certificate(first.cert).fingerprint256);
  writeFileSync(cert, second.cert);
  assert.equal(reload.refresh(), false);
  assert.equal(await fingerprint(), new X509Certificate(first.cert).fingerprint256);
  writeFileSync(key, second.key);
  assert.equal(reload.refresh(), true);
  assert.equal(await fingerprint(), new X509Certificate(second.cert).fingerprint256);
  assert.equal(reload.ready(), true);
});
