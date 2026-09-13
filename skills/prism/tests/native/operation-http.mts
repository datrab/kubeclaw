import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { ContentAddressedArtifactStore } from '../../storage/artifacts.ts';
import { loadControlServerConfig } from '../../server/control-config.ts';
import { runNativePrismOperation } from '../../control/native-operation.ts';
import historical from '../fixtures/historical-worker-v1.json' with { type: 'json' };

const source = process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL;
assert(source, 'An isolated, migrated native PostgreSQL runtime URL is required');
const selected = new URL(source);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(selected.hostname));
assert.equal(selected.username, 'prism_runtime'); assert.equal(selected.pathname, '/prism');

test('actual transport refusal preserves one durable V3 identity; SQL rejects replacement with a historical attempt', { timeout: 60000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-native-http-'));
  const database = new Pool({ connectionString: source, connectionTimeoutMillis: 10000 });
  // Reserve and close an actual loopback listener: the original fetch sees a real
  // connection refusal. There is no replacement worker or successful receipt.
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const address = listener.address(); assert(address && typeof address !== 'string');
  await new Promise<void>(resolve => listener.close(() => resolve()));
  try {
    assert.equal((await database.query('SELECT current_user AS role')).rows[0].role, 'prism_runtime');
    const artifacts = new ContentAddressedArtifactStore(directory);
    const config = loadControlServerConfig({ PRISM_WORKER_SECRET: 'local-native-dispatch-http',
      PRISM_WORKER_URL: `http://127.0.0.1:${address.port}`, PRISM_CONTROL_INTERNAL_URL: 'http://127.0.0.1:1',
      PRISM_SESSION_SECRET: 'local-session', PRISM_INGRESS_SECRET: 'local-ingress',
      PRISM_INGESTION_SECRET: 'local-ingestion', PRISM_DISPATCH_SECRET: 'local-dispatch' });
    const key = `native-http-${randomUUID()}`;
    await assert.rejects(runNativePrismOperation(database, artifacts, config, 'render', {}, key), /fetch failed/);
    const read = async () => (await database.query('SELECT attempt,result FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
    const original = await read();
    assert.equal(original.attempt.schemaVersion, 'worker-attempt-envelope.v3'); assert.equal(original.result, null);
    await assert.rejects(runNativePrismOperation(database, artifacts, config, 'render', {}, key), /fetch failed/);
    assert.deepEqual(await read(), original);
    await assert.rejects(database.query('UPDATE prism.engine_operation SET attempt=$2 WHERE idempotency_key=$1',
      [key, historical.receipts[0]!.attempt]), { code: '23000' });
    assert.deepEqual(await read(), original);
  } finally { await database.end(); await fs.rm(directory, { recursive: true, force: true }); }
});
