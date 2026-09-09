// This is a native TLS transport test against a diagnostic HTTP server, not a
// substitute Kubernetes API, controller application, or successful product apply.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { productController } from '../server/product-controller.ts';
import type { ProductConfig } from '../control/product-decisions.ts';
test('original HTTPS client validates actual TLS, rereads rotated token, and rejects HTTP errors and oversized responses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'product-tls-'));
  const file = (name: string) => join(dir, name);
  const openssl = (...args: string[]) => execFileSync('openssl', args, {cwd: dir, stdio: 'pipe'});
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-subj', '/CN=local-product-test-ca', '-days', '1');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost');
  await writeFile(file('extensions'), 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.pem', '-days', '1', '-extfile', 'extensions');
  await writeFile(file('token'), 'first-token');
  const seen: string[] = [];
  const server = createServer({key: await readFile(file('server.key')), cert: await readFile(file('server.pem'))}, async (request, response) => {
    seen.push(request.headers.authorization ?? '');
    for await (const _chunk of request) { /* consume actual request before response */ }
    if (request.url === '/conflict') {response.writeHead(409); response.end('DEMO_PRODUCT_SUBJECT_CHANGED\n'); return;}
    if (request.url === '/deny') {response.writeHead(403); response.end('{}'); return;}
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(request.url === '/large' ? 'x'.repeat(1_000_001) : JSON.stringify({diagnostic: 'native-tls-roundtrip'}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const config: ProductConfig = {issuer: 'unused-transport-test', operators: new Set(), origin: 'https://localhost',
    privateKey: generateKeyPairSync('ed25519').privateKey, controller: new URL(`https://127.0.0.1:${address.port}`), caFile: file('ca.pem'), tokenFile: file('token')};
  try {
    assert.deepEqual(await productController(config, '/diagnostic', {native: true}), {diagnostic: 'native-tls-roundtrip'});
    await writeFile(file('token'), 'rotated-token');
    await productController(config, '/diagnostic', {});
    assert.deepEqual(seen, ['Bearer first-token', 'Bearer rotated-token']);
    await assert.rejects(productController(config, '/conflict', {}), /DEMO_PRODUCT_SUBJECT_CHANGED/u);
    await assert.rejects(productController(config, '/deny', {}), /response 403/u);
    await assert.rejects(productController(config, '/large', {}), /too large/u);
    await writeFile(file('wrong-ca.pem'), '');
    await assert.rejects(productController({...config, caFile: file('wrong-ca.pem')}, '/diagnostic', {}));
    const prior = seen.length;
    await writeFile(file('token'), 'injected\r\nHeader: value');
    await assert.rejects(productController(config, '/diagnostic', {}), /invalid.*token/u);
    assert.equal(seen.length, prior);
  } finally {server.close(); server.closeAllConnections(); await once(server, 'close'); await rm(dir, {recursive: true, force: true});}
});
