import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { PrismEngine, DeterministicDesignProvider } from '../../engine/index.ts';
import { ContentAddressedArtifactStore } from '../../storage/artifacts.ts';
import { WorkerArtifactClient } from '../../server/worker-artifacts.ts';
import { WorkerNonceDatabase } from '../../server/worker-readiness.ts';
import { createWorkerServer } from '../../server/worker-service.ts';
import { loadControlServerConfig } from '../../server/control-config.ts';
import { runNativePrismOperation } from '../../control/native-operation.ts';
import { runLegacyPrismOperation } from '../../control/legacy-operation.ts';

const source = process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL;
assert(source, 'An isolated, migrated native PostgreSQL runtime URL is required');
const selected = new URL(source);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(selected.hostname));
assert.equal(selected.username, 'prism_runtime'); assert.equal(selected.pathname, '/prism');

test('actual HMAC/SQL/HTTP rejection keeps one V3 identity and SQL blocks legacy fallback before another request', { timeout: 60000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-native-http-'));
  const database = new Pool({ connectionString: source, connectionTimeoutMillis: 10000 });
  const secret = 'local-native-dispatch-http';
  const artifacts = new ContentAddressedArtifactStore(directory);
  const engine = new PrismEngine(new DeterministicDesignProvider());
  const service = createWorkerServer({ mode: 'hmac', secret, database: new WorkerNonceDatabase(source!, 10000) },
    engine, new WorkerArtifactClient(new URL('http://127.0.0.1:1'), secret, false));
  try {
    assert.equal((await database.query("SELECT current_user AS role")).rows[0].role, 'prism_runtime');
    service.listen(0, '127.0.0.1'); await once(service, 'listening');
    const address = service.address(); assert(address && typeof address !== 'string');
    const config = loadControlServerConfig({ PRISM_WORKER_EXECUTION_MODE: 'native', PRISM_WORKER_SECRET: secret,
      PRISM_WORKER_URL: `http://127.0.0.1:${address.port}`, PRISM_CONTROL_INTERNAL_URL: 'http://127.0.0.1:1',
      PRISM_SESSION_SECRET: 'local-session', PRISM_INGRESS_SECRET: 'local-ingress',
      PRISM_INGESTION_SECRET: 'local-ingestion', PRISM_DISPATCH_SECRET: 'local-dispatch' });
    const key = `native-http-${randomUUID()}`;
    const nonceCount = async () => Number((await database.query('SELECT count(*) AS count FROM prism.worker_request_nonce')).rows[0].count);
    const before = await nonceCount();
    await assert.rejects(runNativePrismOperation(database, artifacts, config, 'render', {}, key), /Prism worker failed: 422/);
    const original = (await database.query('SELECT attempt,result FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0];
    assert.equal(original.attempt.schemaVersion, 'worker-attempt-envelope.v3'); assert.equal(original.result, null);
    assert.equal(await nonceCount(), before + 1, 'The original PostgreSQL-backed HMAC authenticator accepted the real request');
    await assert.rejects(runNativePrismOperation(database, artifacts, config, 'render', {}, key), /Prism worker failed: 422/);
    assert.deepEqual((await database.query('SELECT attempt,result FROM prism.engine_operation WHERE idempotency_key=$1', [key])).rows[0], original);
    const authenticated = await nonceCount(); assert.equal(authenticated, before + 2);
    await assert.rejects(runLegacyPrismOperation(database, artifacts, config, 'render', {}, key), { code: '23000' });
    assert.equal(await nonceCount(), authenticated, 'No legacy request was sent after the native attempt was durably accepted');
  } finally {
    await service.shutdown(10000); await database.end(); await fs.rm(directory, { recursive: true, force: true });
  }
});
