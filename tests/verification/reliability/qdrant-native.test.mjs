import { unusedPort, certificates, startQdrant } from './qdrant-native-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { qdrantClient } from '../../../scripts/qdrant-client.mjs';
import { exportQdrantSnapshot, verifyQdrantSnapshot } from '../../../scripts/qdrant-snapshot.mjs';
import { validateQdrantCredentials, validateQdrantCertificate } from '../../../scripts/qdrant-secrets.mjs';
import { startQdrantSnapshotRestore } from '../../../scripts/qdrant-restore.mjs';


function unauthenticatedStatus(url, ca) {
  return new Promise((resolve, reject) => {
    https.get(url + '/collections', { ca }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
}

test('real Qdrant enforces TLS/auth and restores a verified snapshot into a fresh store', { timeout: 90000 }, async t => {
  const binary = process.env.QDRANT_TEST_BINARY;
  assert.ok(binary, 'QDRANT_TEST_BINARY must name the real pinned native Qdrant binary');
  const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
  const version = versions.infrastructure.qdrant.match(/:v([^@]+)@/)[1];
  assert.equal(execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(), `qdrant ${version}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const tls = certificates(directory);
  const keyFile = path.join(directory, 'api-key');
  fs.writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  fs.writeFileSync(keyFile + '.readonly', randomBytes(32).toString('hex'), { mode: 0o600 });
  validateQdrantCredentials({ 'api-key': fs.readFileSync(keyFile, 'utf8'), 'read-only-api-key': fs.readFileSync(keyFile + '.readonly', 'utf8') });
  const certificate = { 'tls.crt': fs.readFileSync(tls.cert, 'utf8'), 'tls.key': fs.readFileSync(tls.key, 'utf8'), 'ca.crt': fs.readFileSync(tls.cert, 'utf8') };
  validateQdrantCertificate(certificate, 'localhost');
  assert.throws(() => validateQdrantCertificate(certificate, 'wrong-host.example'), /TLS_IDENTITY_INVALID/);
  const first = await startQdrant(t, binary, path.join(directory, 'first'), tls, keyFile);
  assert.ok([401, 403].includes(await unauthenticatedStatus(first.options.url, fs.readFileSync(tls.cert))));
  const wrongKey = path.join(directory, 'wrong-key'); fs.writeFileSync(wrongKey, 'x'.repeat(64));
  await assert.rejects(() => qdrantClient({ ...first.options, keyFile: wrongKey }).json('/collections'), /QDRANT_HTTP_40[13]/);
  const wrongCa = path.join(directory, 'wrong-ca'); fs.mkdirSync(wrongCa);
  await assert.rejects(() => qdrantClient({ ...first.options, caFile: certificates(wrongCa).cert }).json('/collections'), /self-signed|certificate/i);
  assert.throws(() => qdrantClient({ ...first.options, url: first.options.url.replace('https:', 'http:') }), /HTTPS_ORIGIN_REQUIRED/);
  await first.client.json('/collections/native_proof', 'PUT', { vectors: { size: 3, distance: 'Cosine' } });
  const reader = qdrantClient({ ...first.options, keyFile: keyFile + '.readonly' });
  await reader.json('/collections');
  await assert.rejects(() => reader.json('/collections/reader_must_not_write', 'PUT', { vectors: { size: 3, distance: 'Cosine' } }), /QDRANT_HTTP_403/);
  const deployment = fs.readFileSync('charts/kubeclaw/templates/deployment.yaml', 'utf8');
  const healthFunction = deployment.slice(deployment.indexOf('async function checkQdrant()'), deployment.indexOf('async function checkRegistries()'))
    .replace("'/var/run/qdrant-client-auth/api-key'", JSON.stringify(keyFile + '.readonly'))
    .replace("'/var/run/qdrant-client-ca/ca.crt'", JSON.stringify(tls.cert));
  const probe = path.join(directory, 'probe.cjs');
  fs.writeFileSync(probe, `const fs = require('node:fs'); const timeoutMs = 10000; const baseUrl = value => value;\n${healthFunction}\ncheckQdrant().catch(error => { console.error(error.message); process.exitCode = 1; });`);
  execFileSync(process.execPath, [probe], { env: { ...process.env, QDRANT_URL: first.options.url }, stdio: 'pipe' });
  execFileSync(process.execPath, ['scripts/verify-qdrant-live.mjs', first.options.url, tls.cert, keyFile, keyFile + '.readonly'], { stdio: 'pipe' });
  await first.client.json('/collections/native_proof/points?wait=true', 'PUT', { points: [
    { id: 1, vector: [1, 0, 0], payload: { proof: 'survives-real-restore' } },
    { id: 2, vector: [0, 1, 0], payload: { proof: 'second-vector' } },
  ] });
  const backup = path.join(directory, 'backup');
  const manifest = await exportQdrantSnapshot({ ...first.options, collection: 'native_proof', directory: backup });
  assert.equal(manifest.version, version);
  assert.deepEqual(await verifyQdrantSnapshot(backup), manifest);
  const query = { query: [1, 0, 0], limit: 2, with_payload: true, with_vector: true };
  const expected = (await first.client.json('/collections/native_proof/points/query', 'POST', query)).result.points;
  // Kill the original database: restore cannot accidentally query its live data.
  const exited = once(first.child, 'exit'); first.child.kill('SIGKILL'); await exited;
  const httpPort = await unusedPort();
  const restoreOptions = { backup, binary, directory: path.join(directory, 'restored'), httpPort,
    grpcPort: await unusedPort(), tls, keyFile, readOnlyKeyFile: keyFile + '.readonly' };
  const restoredChild = await startQdrantSnapshotRestore(restoreOptions);
  let restoreOutput = ''; restoredChild.stdout.on('data', bytes => { restoreOutput = (restoreOutput + bytes).slice(-16000); });
  restoredChild.stderr.on('data', bytes => { restoreOutput = (restoreOutput + bytes).slice(-16000); });
  const stopRestored = async () => {
    if (restoredChild.exitCode !== null || restoredChild.signalCode !== null) return;
    const exited = once(restoredChild, 'exit'); restoredChild.kill('SIGTERM');
    const timer = setTimeout(() => restoredChild.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  };
  t.after(stopRestored);
  const restored = { client: qdrantClient({ ...first.options, url: `https://127.0.0.1:${httpPort}` }), stop: stopRestored };
  const deadline = performance.now() + 15000;
  while (true) {
    try { await restored.client.json('/collections'); break; } catch (error) {
      if (restoredChild.exitCode !== null || performance.now() > deadline) throw new Error(error.message + '\n' + restoreOutput);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  await assert.rejects(() => startQdrantSnapshotRestore(restoreOptions), /EEXIST/);
  assert.deepEqual((await restored.client.json('/collections/native_proof/points/query', 'POST', query)).result.points, expected);
  assert.equal(expected[0].payload.proof, 'survives-real-restore');
  assert.equal((await restored.client.json('/collections')).result.collections.some(value => value.name === 'reader_must_not_write'), false);
  const file = path.join(backup, 'collection.snapshot');
  const fd = fs.openSync(file, 'r+'); const byte = Buffer.alloc(1);
  fs.readSync(fd, byte, 0, 1, 32); byte[0] ^= 1; fs.writeSync(fd, byte, 0, 1, 32); fs.closeSync(fd);
  await assert.rejects(() => verifyQdrantSnapshot(backup), /DIGEST_MISMATCH/);
  await restored.stop();
  // Rotate the key and restart the same real data store. The old credential must
  // fail, while retained vectors and the new credential remain usable.
  const previousKey = path.join(directory, 'previous-key'); fs.copyFileSync(keyFile, previousKey);
  fs.writeFileSync(keyFile, randomBytes(32).toString('hex'));
  const rotated = await startQdrant(t, binary, path.join(directory, 'restored'), tls, keyFile);
  await assert.rejects(() => qdrantClient({ ...rotated.options, keyFile: previousKey }).json('/collections'), /QDRANT_HTTP_40[13]/);
  assert.deepEqual((await rotated.client.json('/collections/native_proof/points/query', 'POST', query)).result.points, expected);
  await rotated.stop();
});
