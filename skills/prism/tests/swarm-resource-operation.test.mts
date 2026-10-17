import { publishedControlConfig } from './fixtures/published-config.mjs';
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
import type { WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
test('CP03 original Control persists and dispatches startup budgets and preserves admitted retry identity', { timeout: 60000 }, async t => {
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
    const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
    const profiles = [{ cpuTimeMs: 123, memoryBytes: 4096, tasks: 7 }, { cpuTimeMs: 456, memoryBytes: 8192, tasks: 11 }];
    for (const [index, policy] of profiles.entries()) {
      const f = await publishedControlConfig(t, { workerUrl: `http://127.0.0.1:${address.port}` }, undefined, undefined, author => {
        const authorFile=path.join(author,'components/prism-execution.config.json');
        const value=JSON.parse(fs.readFileSync(authorFile,'utf8'));value.profiles.standard.settings.resourcePolicy=policy;
        fs.writeFileSync(authorFile,JSON.stringify(value));
      });
      const config = f.loadControlServerConfig(f.capture, { PRISM_SESSION_SECRET: 'test', PRISM_INGRESS_SECRET: 'test', PRISM_INGESTION_SECRET: 'test', PRISM_DISPATCH_SECRET: 'test', PRISM_WORKER_SECRET: 'test' });
      const authorFile=path.join(f.author,'components/prism-execution.config.json');
      const value=JSON.parse(fs.readFileSync(authorFile,'utf8'));value.profiles.standard.settings.resourcePolicy={cpuTimeMs:1,memoryBytes:1,tasks:1};
      fs.writeFileSync(authorFile,JSON.stringify(value));
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
