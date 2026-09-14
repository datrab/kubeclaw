import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { bootstrapPrismDatabaseRoles } from '../../server/database-roles.ts';
import { migrate } from '../../storage/index.ts';
import { prismNativeAttempt, prismRequestDigest } from '../../engine/worker-envelope.ts';
import { reserveNativePrismOperation, recordNativePrismResult, completeNativePrismOperation } from '../../control/native-operation-store.ts';
import { NativeAttemptJournal } from '../../../worker/core/worker/native-attempt-journal.ts';
import { interruptedNativeWorkerResult } from '../../../worker/core/worker/native-result.ts';
import { sha256Digest } from '../../../worker/core/worker/digest.ts';

const source = process.env.PRISM_NATIVE_OPERATION_TEST_ADMIN_URL;
assert(source, 'PRISM_NATIVE_OPERATION_TEST_ADMIN_URL must select a disposable empty native PostgreSQL server');
const url = new URL(source);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'A dedicated loopback PostgreSQL server is required');
const databaseUrl = (role?: string) => {
  const selected = new URL(url); selected.pathname = '/prism';
  if (role) { selected.username = `prism_${role}`; selected.password = `native-operation-${role}`; }
  return selected.toString();
};
const artifact = { artifactId: 'input:native-operation-test', type: 'prism-engine-input', mediaType: 'application/json',
  contentDigest: `sha256:${'a'.repeat(64)}`, sizeBytes: 2, storageUrl: 'https://control.example.test/input' };

test('real PostgreSQL commit, concurrent retries, writer death and original worker journal preserve one native attempt', { timeout: 300000 }, async t => {
  const admin = new Pool({ connectionString: source, connectionTimeoutMillis: 10000 });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-native-operation-'));
  try {
    assert.deepEqual((await admin.query("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'")).rows, [], 'Refusing a server with user databases');
    assert.deepEqual((await admin.query("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname <> current_user")).rows, [], 'Refusing a server with user roles');
    await admin.query('CREATE DATABASE prism');
    const owner = new Pool({ connectionString: databaseUrl(), connectionTimeoutMillis: 10000 });
    const migrator = new Pool({ connectionString: databaseUrl('migrator'), connectionTimeoutMillis: 10000 });
    const runtime = new Pool({ connectionString: databaseUrl('runtime'), connectionTimeoutMillis: 10000, max: 6 });
    try {
      await bootstrapPrismDatabaseRoles(owner, databaseUrl(), { migrator: 'native-operation-migrator', runtime: 'native-operation-runtime', readonly: 'native-operation-readonly' });
      await migrate(migrator, { infrastructure: 'preprovisioned' });
      t.diagnostic(`Original PostgreSQL ${(await owner.query('SHOW server_version')).rows[0].server_version}; original schema migration 017`);
      const key = `concurrent-${randomUUID()}`;
      const proposed = Array.from({ length: 8 }, () => prismNativeAttempt('render', artifact, key));
      assert.equal(prismRequestDigest(proposed[0]!.operation, artifact.contentDigest),
        sha256Digest(JSON.stringify({ operation: proposed[0]!.operation, inputDigest: artifact.contentDigest })), 'Preserve the actual historical producer digest');
      const reserved = await Promise.all(proposed.map(attempt => reserveNativePrismOperation(runtime, key, attempt)));
      for (const selected of reserved) assert.deepEqual(selected, reserved[0]);
      const row = (await runtime.query('SELECT * FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
      assert.deepEqual(row.attempt, reserved[0]!.attempt); assert.equal(row.result, null); assert.equal(row.completed_at, null);
      await assert.rejects(reserveNativePrismOperation(runtime, key, prismNativeAttempt('render', { ...artifact, contentDigest: `sha256:${'b'.repeat(64)}` }, key)), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(runtime.query("UPDATE prism.engine_operation SET attempt_id='legacy-replacement' WHERE idempotency_key=$1", [key]), { code: '23000' });
      await assert.rejects(runtime.query('UPDATE prism.engine_operation SET attempt=NULL WHERE idempotency_key=$1', [key]), { code: '23000' });
      await assert.rejects(runtime.query("UPDATE prism.engine_operation SET idempotency_key='renamed' WHERE idempotency_key=$1", [key]), { code: '23000' });
      await writerDeath(runtime, directory);
      await receiptReplay(runtime, directory, key, reserved[0]!.attempt);
      await legacyPending(runtime);
    } finally { await Promise.all([runtime.end(), migrator.end(), owner.end()]); }
  } finally { await admin.end(); await fs.rm(directory, { recursive: true, force: true }); }
});

async function writerDeath(runtime: Pool, directory: string): Promise<void> {
  const key = `writer-death-${randomUUID()}`;
  const proposed = prismNativeAttempt('render', artifact, key);
  const file = path.join(directory, 'original-attempt.json'); await fs.writeFile(file, JSON.stringify(proposed));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../../../tests/fixtures/prism-native-operation-writer.mts', import.meta.url)), file, key], {
    env: { ...process.env, PRISM_NATIVE_OPERATION_TEST_DATABASE_URL: databaseUrl('runtime') }, stdio: 'pipe',
  });
  const exited = once(child, 'exit'); let errors = '';
  child.stderr.on('data', bytes => { errors += String(bytes); });
  try {
    const ready = await Promise.race([once(child.stdout, 'data').then(([bytes]) => String(bytes)),
      exited.then(() => { throw new Error(`writer exited before commit: ${errors}`); })]);
    assert.equal(ready, 'durable\n');
    const before = await reserveNativePrismOperation(runtime, key, prismNativeAttempt('render', artifact, key));
    assert.deepEqual(before.attempt, proposed, 'Another actual SQL connection sees the commit before writer death');
    child.kill('SIGKILL'); assert.deepEqual(await exited, [null, 'SIGKILL']);
    const reopened = await reserveNativePrismOperation(runtime, key, prismNativeAttempt('render', artifact, key));
    assert.deepEqual(reopened.attempt, proposed); assert.equal(reopened.result, null);
  } finally { child.kill('SIGKILL'); await exited; }
}

async function receiptReplay(runtime: Pool, directory: string, key: string, attempt: ReturnType<typeof prismNativeAttempt>): Promise<void> {
  const journal = new NativeAttemptJournal(path.join(directory, 'worker-journal'), { maximumRecords: 8, maximumStateBytes: 262144,
    maximumTotalBytes: 8388608, maximumInputBytes: 65536, maximumOutputBytes: 65536, maximumResultBytes: 65536 });
  // This is a real never-launched failure receipt; no kernel observations are invented.
  const receipt = await journal.withAttempt(attempt, async context => journal.seal(attempt,
    interruptedNativeWorkerResult(attempt, new Date(context.acceptedAt), 'NATIVE_TEST_NOT_LAUNCHED', null, true)));
  const retry = await reserveNativePrismOperation(runtime, key, prismNativeAttempt('render', artifact, key));
  assert.deepEqual(retry.attempt, attempt); assert.equal(retry.result, null);
  const replay = await journal.readResult(retry.attempt); assert.deepEqual(replay, receipt);
  assert.deepEqual(await recordNativePrismResult(runtime, key, retry.attempt, replay), receipt);
  assert.deepEqual(await recordNativePrismResult(runtime, key, retry.attempt, replay), receipt);
  const retained = (await runtime.query('SELECT result,completed_at FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
  assert.deepEqual(retained.result, { attempt, workerResult: receipt }); assert.equal(retained.completed_at, null);
  const changed = interruptedNativeWorkerResult(attempt, new Date(receipt.startedAt), 'OTHER_RECEIPT', null, true);
  await assert.rejects(recordNativePrismResult(runtime, key, attempt, changed), /RESULT_CONFLICT/);
  await assert.rejects(runtime.query("UPDATE prism.engine_operation SET result='{}'::jsonb WHERE idempotency_key=$1", [key]), { code: '23000' });
  await assert.rejects(completeNativePrismOperation(runtime, key, attempt.executionId), /COMPLETION_CONFLICT/);
  await assert.rejects(reserveNativePrismOperation(runtime, key, prismNativeAttempt('render', artifact, key)),
    error => error instanceof Error && (error.cause as { code?: string })?.code === 'NATIVE_TEST_NOT_LAUNCHED');
}

async function legacyPending(runtime: Pool): Promise<void> {
  const key = `legacy-${randomUUID()}`; const proposed = prismNativeAttempt('render', artifact, key);
  const digest = prismRequestDigest(proposed.operation, artifact.contentDigest);
  await runtime.query("INSERT INTO prism.engine_operation(idempotency_key,attempt_id,operation,request_digest) VALUES($1,'legacy-unknown','render',$2)", [key, digest]);
  await assert.rejects(reserveNativePrismOperation(runtime, key, proposed), /LEGACY_PENDING_RECONCILIATION_REQUIRED/);
  await runtime.query("UPDATE prism.engine_operation SET attempt_id='legacy-compatible' WHERE idempotency_key=$1", [key]);
  assert.equal((await runtime.query('SELECT attempt FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0].attempt, null);
}
