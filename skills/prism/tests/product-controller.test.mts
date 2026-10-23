// This is a native TLS transport test against a diagnostic HTTP server, not a
// substitute Kubernetes API, controller application, or successful product apply.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { productController } from '../server/product-controller.ts';
import { captureSwarmSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
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
    if (request.url === '/stall') return;
    if (request.url === '/conflict') {response.writeHead(409); response.end('DEMO_PRODUCT_SUBJECT_CHANGED\n'); return;}
    if (request.url === '/deny') {response.writeHead(403); response.end('{}'); return;}
    response.writeHead(200, {'content-type': 'application/json'});
    if (request.url === '/utf8') { response.write(Buffer.from('{"text":"')); response.write(Buffer.from('€')); response.end(Buffer.from('"}')); return; }
    response.end(request.url === '/large' ? 'x'.repeat(1_000_001) : JSON.stringify({diagnostic: 'native-tls-roundtrip'}));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const config: ProductConfig = {issuer: 'unused-transport-test', operators: new Set(), origin: 'https://localhost',
    privateKey: generateKeyPairSync('ed25519').privateKey, controller: new URL(`https://127.0.0.1:${address.port}`), caFile: file('ca.pem'), tokenFile: file('token')};
  try {
    assert.deepEqual(await productController(config, '/diagnostic', {native: true}, 15000, 1000000, 64000), {diagnostic: 'native-tls-roundtrip'});
    await writeFile(file('token'), 'rotated-token');
    await productController(config, '/diagnostic', {}, 15000, 1000000, 64000);
    assert.deepEqual(seen, ['Bearer first-token', 'Bearer rotated-token']);
    await assert.rejects(productController(config, '/conflict', {}, 15000, 1000000, 64000), /DEMO_PRODUCT_SUBJECT_CHANGED/u);
    await assert.rejects(productController(config, '/deny', {}, 15000, 1000000, 64000), /response 403/u);
    await assert.rejects(productController(config, '/large', {}, 15000, 1000000, 64000), /too large/u);
    const exact = Buffer.byteLength(JSON.stringify({diagnostic: 'native-tls-roundtrip'}));
    await assert.rejects(productController(config, '/diagnostic', {}, 15000, exact - 1, 64000), /too large/u);
    assert.deepEqual(await productController(config, '/diagnostic', {}, 15000, exact, 64000), {diagnostic: 'native-tls-roundtrip'});
    for (const value of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(productController(config, '/diagnostic', {}, 15000, value as number, 64000), /valid product controller response limit/);
    await assert.rejects(productController(config, '/stall', {}, 50, 1000000, 64000), /abort/i);
    for (const value of [undefined, 0, -1, 1.5, 2147483648]) await assert.rejects(productController(config, '/diagnostic', {}, value as number, 1000000, 64000), /valid product controller timeout/);
    const tokenLength = 'rotated-token'.length;
    const beforeLimit = seen.length;
    await assert.rejects(productController(config, '/diagnostic', {}, 15000, 1000000, tokenLength - 1), /invalid.*token/u);
    assert.equal(seen.length, beforeLimit);
    assert.deepEqual(await productController(config, '/diagnostic', {}, 15000, 1000000, tokenLength), {diagnostic: 'native-tls-roundtrip'});
    for (const value of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(productController(config, '/diagnostic', {}, 15000, 1000000, value as number), /valid product controller token limit/);
    // Real author capture -> original TLS client: selected B budgets and retained A.
    const configRoot = new URL('../../../config/', import.meta.url);
    await cp(configRoot, file('config'), {recursive: true});
    const entry = JSON.parse(await readFile(file('config/pipeline.config.json'), 'utf8'));
    const selection = {role: 'prism' as const, callerId: 'prism-control' as const,
      serviceInstanceId: 'kubeclaw/prism/prism-control',
      bindings: entry.bindings.filter((binding: any) => binding.instanceId === 'kubeclaw/prism/prism-control').map(({role: _role, ...binding}: any) => binding)};
    const capturePolicy = () => captureSwarmSettings(file('config/pipeline.config.json'), selection).components['prism-control']!.settings;
    const original = capturePolicy();
    const authorFile = file('config/components/prism-control.config.json');
    const author = JSON.parse(await readFile(authorFile, 'utf8'));
    const policy = author.profiles.standard.settings;
    const utf8Bytes = Buffer.byteLength(JSON.stringify({text: '€'}));
    Object.assign(policy, {productControllerTimeoutMs: 100, maximumProductControllerResponseBytes: utf8Bytes, maximumProductControllerTokenCharacters: tokenLength});
    await writeFile(authorFile, JSON.stringify(author));
    const selected = capturePolicy();
    const invoke = (settings: typeof selected, route: string) => productController(config, route, {}, settings.productControllerTimeoutMs as number, settings.maximumProductControllerResponseBytes as number, settings.maximumProductControllerTokenCharacters as number);
    assert.deepEqual(await invoke(selected, '/utf8'), {text: '€'});
    policy.maximumProductControllerResponseBytes = utf8Bytes - 1;
    await writeFile(authorFile, JSON.stringify(author));
    await assert.rejects(invoke(capturePolicy(), '/utf8'), /too large/u);
    // A remains a retained snapshot after B publication, not a reload of B.
    assert.deepEqual(await invoke(original, '/utf8'), {text: '€'});
    assert.equal(original.productControllerTimeoutMs, 15000);
    assert.equal(original.maximumProductControllerResponseBytes, 1000000);
    assert.equal(original.maximumProductControllerTokenCharacters, 64000);
    await assert.rejects(invoke(selected, '/stall'), /abort/i);
    policy.maximumProductControllerTokenCharacters = tokenLength - 1;
    await writeFile(authorFile, JSON.stringify(author));
    const beforeSelectedTokenRejection = seen.length;
    await assert.rejects(invoke(capturePolicy(), '/utf8'), /invalid.*token/u);
    assert.equal(seen.length, beforeSelectedTokenRejection);
    assert.deepEqual(await invoke(selected, '/utf8'), {text: '€'});
    await writeFile(file('wrong-ca.pem'), '');
    await assert.rejects(productController({...config, caFile: file('wrong-ca.pem')}, '/diagnostic', {}, 15000, 1000000, 64000));
    const prior = seen.length;
    await writeFile(file('token'), 'injected\r\nHeader: value');
    await assert.rejects(productController(config, '/diagnostic', {}, 15000, 1000000, 64000), /invalid.*token/u);
    assert.equal(seen.length, prior);
  } finally {server.close(); server.closeAllConnections(); await once(server, 'close'); await rm(dir, {recursive: true, force: true});}
});
