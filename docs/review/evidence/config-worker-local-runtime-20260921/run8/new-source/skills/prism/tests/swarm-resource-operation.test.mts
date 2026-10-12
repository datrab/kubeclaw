import { readTestBundle, writeTestBundle } from '../../../tests/fixtures/config/swarm-bundle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate, ContentAddressedArtifactStore } from '../storage/index.ts';
import { runNativePrismOperation } from '../control/native-operation.ts';
import { loadControlServerConfig } from '../server/control-config.ts';
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
const authored = readTestBundle(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));
test('CP03 original Control persists and dispatches startup budgets and preserves admitted retry identity', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-policy-operation-'));
  const db = new PGlite(path.join(root, 'db'), { extensions: { vector } });
  const received: WorkerAttemptEnvelopeV3[] = [];
  // Real HTTP rejection exposes the dispatched envelope without inventing a successful native receipt.
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString())); response.writeHead(503); response.end('not a native worker');
  });
  try {
    await migrate(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const file = path.join(root, 'swarm.config.json'), artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
    const profiles = [{ cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }, { cpuTimeMs: 456, memoryBytes: 8192, tasks: 11 }];
    for (const [index, policy] of profiles.entries()) {
      const value = structuredClone(authored); value['prism-execution'].settings.resourcePolicy = policy; writeTestBundle(file, value);
      const config = loadControlServerConfig({ SWARM_CONFIG: file, PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test', PRISM_INGESTION_SECRET: 'test',
        PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test', PRISM_WORKER_URL: `http://127.0.0.1:${address.port}` });
      value['prism-execution'].settings.resourcePolicy = { cpuTimeMs: 1, memoryBytes: 1, tasks: 1 }; writeTestBundle(file, value);
      await assert.rejects(runNativePrismOperation(db, artifacts, config, 'render', { policy: 'input' }, `policy-${index}`), /Prism worker failed: 503/);
      const envelope = received.at(-1)!;
      assert.deepEqual(envelope.resourceBudgets, { schemaVersion: 'worker-resource-budgets.v2', cpuTimeMs: { state: 'requested', limit: policy.cpuTimeMs },
        maximumMemoryBytes: { state: 'requested', limit: policy.memoryBytes }, maximumTasks: { state: 'requested', limit: policy.tasks } });
      const stored = (await db.query<{ attempt: WorkerAttemptEnvelopeV3 }>('SELECT attempt FROM prism.engine_operation WHERE idempotency_key=$1', [`policy-${index}`])).rows[0]!;
      assert.deepEqual(stored.attempt, envelope);
      if (index === 1) {
        await assert.rejects(runNativePrismOperation(db, artifacts, config, 'render', { policy: 'input' }, 'policy-0'), /Prism worker failed: 503/);
        assert.deepEqual(received.at(-1), received[0], 'new startup policy cannot rewrite already accepted budgets');
      }
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
