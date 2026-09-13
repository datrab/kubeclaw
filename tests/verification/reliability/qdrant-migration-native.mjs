import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { unusedPort, certificates, startQdrant } from './qdrant-native-support.mjs';
import { exportQdrantStorageSnapshot, verifyQdrantSnapshot } from '../../../scripts/qdrant-snapshot.mjs';
import { startQdrantSnapshotRestore, requireQdrantRestoreVersion } from '../../../scripts/qdrant-restore.mjs';
import { qdrantClient } from '../../../scripts/qdrant-client.mjs';

test('real consecutive Qdrant upgrade restores every collection and alias into fresh storage', { timeout: 120000 }, async t => {
  const source = process.env.QDRANT_MIGRATION_SOURCE_BINARY;
  const binary = process.env.QDRANT_TEST_BINARY;
  assert(source && binary, 'Both original native Qdrant binaries are required');
  const version = JSON.parse(fs.readFileSync('versions.json', 'utf8')).infrastructure.qdrant.match(/:v([^@]+)@/)[1];
  assert.equal(execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(), `qdrant ${version}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant-full-migration-'));
  const tls = certificates(directory), keyFile = path.join(directory, 'admin-key');
  fs.writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  fs.writeFileSync(keyFile + '.readonly', randomBytes(32).toString('hex'), { mode: 0o600 });
  const original = await startQdrant(t, source, path.join(directory, 'original'), tls, keyFile, undefined, keyFile + '.readonly', true);
  const query = { query: [1, 0, 0], limit: 10, with_payload: true, with_vector: true };
  const expected = {};
  for (const collection of ['first_original', 'second_original']) {
    await original.client.json(`/collections/${collection}`, 'PUT', { vectors: { size: 3, distance: 'Cosine' } });
    await original.client.json(`/collections/${collection}/points?wait=true`, 'PUT', {
      points: [{ id: 1, vector: [1, 0, 0], payload: { collection, unicode: 'ä ✓' } },
        { id: 2, vector: [0, 1, 0], payload: { collection, retained: true } }],
    });
    expected[collection] = (await original.client.json(`/collections/${collection}/points/query`, 'POST', query)).result.points;
  }
  await original.client.json('/collections/aliases', 'POST', { actions: [{ create_alias: {
    collection_name: 'second_original', alias_name: 'original_alias',
  } }] });
  const backup = path.join(directory, 'backup');
  const manifest = await exportQdrantStorageSnapshot({ ...original.options, directory: backup });
  assert.equal(manifest.collections.length, 2); assert.equal(manifest.aliases.length, 1);
  assert.deepEqual(await verifyQdrantSnapshot(backup), manifest);
  await original.stop();
  for (const target of ['1.17.9', '1.18.2', '1.20.0', '2.0.0']) {
    assert.throws(() => requireQdrantRestoreVersion(manifest, target, target), /CONSECUTIVE_FORWARD_UPGRADE_REQUIRED/);
  }
  const corrupt = path.join(directory, 'corrupt');
  fs.cpSync(backup, corrupt, { recursive: true });
  const bytes = fs.readFileSync(path.join(corrupt, 'storage.snapshot')); bytes[0] ^= 255;
  fs.writeFileSync(path.join(corrupt, 'storage.snapshot'), bytes);
  await assert.rejects(verifyQdrantSnapshot(corrupt), /DIGEST_MISMATCH/);
  const options = { backup, binary, directory: path.join(directory, 'restored'), httpPort: await unusedPort(),
    grpcPort: await unusedPort(), tls, keyFile, readOnlyKeyFile: keyFile + '.readonly' };
  await assert.rejects(startQdrantSnapshotRestore(options), /VERSION_MISMATCH/);
  await assert.rejects(startQdrantSnapshotRestore({ ...options, migrateToVersion: '9.99.0' }), /MIGRATION_REQUIRED/);
  const child = await startQdrantSnapshotRestore({ ...options, migrateToVersion: version });
  let output = '';
  child.stdout.on('data', data => { output = (output + data).slice(-16000); });
  child.stderr.on('data', data => { output = (output + data).slice(-16000); });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, 'exit'); child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await stopped; } finally { clearTimeout(timeout); }
  });
  const client = qdrantClient({ ...original.options, url: `https://127.0.0.1:${options.httpPort}` });
  const deadline = performance.now() + 30000;
  while (true) {
    try { await client.json('/collections'); break; }
    catch (error) {
      if (child.exitCode !== null || performance.now() > deadline) throw new Error(`${error.message}\n${output}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  assert.equal((await client.json('/')).version, version);
  assert.deepEqual((await client.json('/aliases')).result.aliases, manifest.aliases);
  for (const collection of Object.keys(expected)) {
    assert.deepEqual((await client.json(`/collections/${collection}/points/query`, 'POST', query)).result.points, expected[collection]);
  }
  assert.deepEqual((await client.json('/collections/original_alias/points/query', 'POST', query)).result.points, expected.second_original);
  await assert.rejects(startQdrantSnapshotRestore({ ...options, migrateToVersion: version }), /EEXIST/);
  const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped;
  const moved = path.join(directory, 'fresh-pvc-equivalent');
  fs.mkdirSync(moved);
  for (const name of ['storage', 'snapshots']) fs.cpSync(path.join(options.directory, name), path.join(moved, name), { recursive: true, errorOnExist: true, force: false });
  const restarted = await startQdrant(t, binary, moved, tls, keyFile, undefined, keyFile + '.readonly', true);
  assert.equal((await restarted.client.json('/cluster')).result.status, 'enabled');
  assert.deepEqual((await restarted.client.json('/aliases')).result.aliases, manifest.aliases);
  for (const collection of Object.keys(expected)) {
    assert.deepEqual((await restarted.client.json(`/collections/${collection}/points/query`, 'POST', query)).result.points, expected[collection]);
  }
  await restarted.stop();
  const preserved = await startQdrant(t, source, path.join(directory, 'original'), tls, keyFile, undefined, keyFile + '.readonly', true);
  for (const collection of Object.keys(expected)) {
    assert.deepEqual((await preserved.client.json(`/collections/${collection}/points/query`, 'POST', query)).result.points, expected[collection]);
  }
  await preserved.stop();
  t.diagnostic(`Original Qdrant ${manifest.version} to ${version}; two complete collections, original alias, vectors, payloads and query order preserved; copied storage restarts in cluster mode; unchanged old source remains readable`);
});
