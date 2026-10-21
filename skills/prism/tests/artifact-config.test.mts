import { WorkerAttemptExecutor, workerAttemptSpecDigest } from '@kubeclaw/worker-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publishedControlConfig } from './fixtures/published-config.mjs';

test('published acknowledgment limits reach real HTTP client, assigned child and accepted agent attempt without rereading B', async t => {
  const credentials = { PRISM_SESSION_SECRET: 'local', PRISM_INGRESS_SECRET: 'local', PRISM_INGESTION_SECRET: 'local', PRISM_DISPATCH_SECRET: 'local', PRISM_WORKER_SECRET: 'local', DATABASE_URL: 'postgresql://not-used' };
  const content = Buffer.from('artifact-config');
  const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const acknowledgment = JSON.stringify({ artifactId: `artifact:${digest}`, digest, sizeBytes: content.byteLength });
  let responseSize = 0, chunked = false;
  const upstream = createServer(async (request, response) => {
    for await (const _ of request) { /* Consume actual upload. */ }
    const bytes = Buffer.from(acknowledgment + ' '.repeat(responseSize - Buffer.byteLength(acknowledgment)));
    if (!chunked) response.setHeader('content-length', bytes.byteLength);
    else response.setHeader('transfer-encoding', 'chunked');
    response.write(bytes.subarray(0, 100)); response.end(bytes.subarray(100));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(async () => { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); });
  const address = upstream.address(); assert(address && typeof address !== 'string');
  const origin = new URL(`http://127.0.0.1:${address.port}`);
  let retained: any;
  for (const maximumArtifactAcknowledgmentBytes of [256, 512]) {
    const original = JSON.parse((await import('node:fs')).readFileSync(new URL('../../../config/components/prism-control.config.json', import.meta.url), 'utf8')).profiles.standard.settings.agentLauncher;
    const agentLauncher = { ...original, terminationGraceMs: maximumArtifactAcknowledgmentBytes / 8, limits: { ...original.limits, logBytes: maximumArtifactAcknowledgmentBytes * 32 } };
    const f = await publishedControlConfig(t, { maximumArtifactAcknowledgmentBytes, agentLauncher }, {});
    const engine = join(f.root, 'role/skills/packages/prism-engine');
    const { WorkerArtifactClient } = await import(pathToFileURL(join(engine, 'server/worker-artifacts.ts')).href);
    const { nativePrismCommand } = await import(pathToFileURL(join(engine, 'server/native-worker-execution.ts')).href);
    const { nativePrismHostConfig } = await import(pathToFileURL(join(engine, 'config/native-worker.ts')).href);
    const { agentAttempt } = await import(pathToFileURL(join(engine, 'server/agent-attempt.ts')).href);
    const { AgentProcess } = await import(pathToFileURL(join(engine, 'server/agent-process.ts')).href);
    const config = f.loadWorkerConfig(f.workerCapture, credentials);
    assert.throws(() => f.loadWorkerConfig(f.workerCapture, { ...credentials, PRISM_NATIVE_ASSIGNED_ARTIFACT_ACKNOWLEDGMENT_BYTES: '1' }), /LEGACY_OVERRIDE/);
    assert.equal(config.maximumArtifactAcknowledgmentBytes, maximumArtifactAcknowledgmentBytes);
    const command = nativePrismCommand({ maximumInputBytes: 64 }, config);
    const child = nativePrismHostConfig({ ...command.environment, KUBECLAW_NATIVE_SCOPE: '/assigned-child-parser-only' });
    assert.equal(child.maximumArtifactAcknowledgmentBytes, maximumArtifactAcknowledgmentBytes);
    for (const value of [undefined, '', '0', '1.5', '2147483648']) {
      assert.throws(() => nativePrismHostConfig({ ...command.environment, KUBECLAW_NATIVE_SCOPE: '/assigned-child-parser-only', PRISM_NATIVE_ASSIGNED_ARTIFACT_ACKNOWLEDGMENT_BYTES: value }), /ACKNOWLEDGMENT_LIMIT_REQUIRED/);
    }
    const control = f.loadControlServerConfig(f.capture, credentials);
    const envelope = await agentAttempt({ id: randomUUID(), fence: randomUUID(), expires_at: new Date(Date.now() + control.agentLauncher.attemptLifetimeMs), request_digest: digest, request: {} }, 'assigned-agent', control);
    // This published generation carries the selected WorkerCore policy; v3 is the original no-policy arm.
    assert.ok(control.workerCore);
    assert.equal(envelope.operation.inputSchemaId, 'prism-agent-job.v4');
    assert.deepEqual(envelope.operation.values.workerCore, JSON.parse(JSON.stringify(control.workerCore)));
    const originalEnvelope = await agentAttempt({ id: randomUUID(), fence: randomUUID(), expires_at: new Date(Date.now() + control.agentLauncher.attemptLifetimeMs), request_digest: digest, request: {} }, 'assigned-agent', { ...control, workerCore: undefined });
    assert.equal(originalEnvelope.operation.inputSchemaId, 'prism-agent-job.v3');
    assert.equal(Object.hasOwn(originalEnvelope.operation.values, 'workerCore'), false);
    assert.equal(envelope.operation.values.maximumArtifactAcknowledgmentBytes, maximumArtifactAcknowledgmentBytes);
    assert.equal(envelope.operation.values.terminationGraceMs, maximumArtifactAcknowledgmentBytes / 8);
    assert.deepEqual(envelope.limits, control.agentLauncher.limits);
    assert.equal(envelope.limits.logBytes, maximumArtifactAcknowledgmentBytes * 32);
    const termination = structuredClone(envelope);
    termination.limits = { ...termination.limits, timeoutMs: 200, cleanupTimeoutMs: 2000 };
    termination.attemptSpecDigest = workerAttemptSpecDigest(termination);
    const started = Date.now();
    const terminated = await new WorkerAttemptExecutor({ envelope: termination, retainLogs: false,
      operation: new AgentProcess(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], termination.operation.values.terminationGraceMs) }).execute();
    assert.notEqual(terminated.state, 'completed');
    assert(Date.now() - started >= 200 + maximumArtifactAcknowledgmentBytes / 8 - 5, 'accepted grace controls escalation of a real SIGTERM-resistant child');
    assert(Date.now() - started < 2000);
    const client = new WorkerArtifactClient(origin, 'local', false, child.maximumArtifactAcknowledgmentBytes);
    for (const useChunks of [false, true]) {
      chunked = useChunks; responseSize = maximumArtifactAcknowledgmentBytes;
      assert.equal((await client.upload('evidence', 'log', 'text/plain', content, AbortSignal.timeout(5000))).artifact.contentDigest, digest);
      responseSize++;
      await assert.rejects(client.upload('evidence', 'log', 'text/plain', content, AbortSignal.timeout(5000)), /exceeds its byte limit/);
    }
    if (!retained) retained = { config, envelope, client };
    else {
      assert.equal(retained.config.maximumArtifactAcknowledgmentBytes, 256);
      assert.equal(retained.envelope.operation.values.maximumArtifactAcknowledgmentBytes, 256);
      assert.equal(retained.envelope.operation.values.terminationGraceMs, 32);
      responseSize = 257;
      await assert.rejects(retained.client.upload('evidence', 'log', 'text/plain', content, AbortSignal.timeout(5000)), /exceeds its byte limit/);
    }
    for (const invalid of [undefined, 0, 1.5, 2147483648]) assert.throws(() => new WorkerArtifactClient(origin, 'local', false, invalid), /ACKNOWLEDGMENT_LIMIT_REQUIRED/);
  }
});
