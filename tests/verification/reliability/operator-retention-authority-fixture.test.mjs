import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { runPipelineV2, resumePipelineV2 } from '../../../skills/nova/core/execution/engine.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverWaitCreation } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { FileDurableRecordStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { reserveDelivery, deliveryReceipt, lookupDelivery } from '../../../skills/common/plugins/operator-messaging/src/delivery-records.ts';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const entries = file => new FileJournal(file).records().map(record => record.entry);
const limits = { maximumRecords: 100, maximumBytes: 1024 ** 2, maximumRecordBytes: 2 * 1048576 + 65536 };

// Original installed producers and File journals only. This proves an authority
// prerequisite; no retention implementation or projection acceptance is claimed.
export async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-authority-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const received = [], token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    received.push({ body, headers: request.headers });
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messageId: 'local-receiver-1' }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = `OPERATOR_FIXTURE_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  process.env[env] = token; t.after(() => { delete process.env[env]; });
  const roots = ['common', 'nova'].map(role => path.resolve(`skills/${role}/plugins`));
  const operator = 'kubeclaw.operator-messaging:operator', waits = 'kubeclaw.wait-store:waits';
  const network = 'kubeclaw.network-http:http', secrets = 'kubeclaw.secret-resolver:secrets';
  const deliveryRoot = path.join(root, 'deliveries'), waitRoot = path.join(root, 'waits');
  const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: roots, trustedBuiltinRoots: roots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: { 'operator.request': operator, 'signal.wait': waits, 'network.http': network, 'secrets.read': secrets },
    grants: { 'kubeclaw.human-approval:approval': { 'operator.request': { allowedTargets: ['operators'] },
      'signal.wait': { allowedSignalTypes: ['approval.resolved'], allowedIssuerIds: ['operator:local'] } },
      [operator]: { 'network.http': { allowedOrigins: [origin] }, 'secrets.read': { allowedNames: ['operator.webhook'] } } },
    adapters: { [operator]: { deliveryRoot, maximumDeliveryRecords: options.maximumRecords ?? limits.maximumRecords, maximumDeliveryBytes: options.maximumBytes ?? limits.maximumBytes,
      targets: { operators: { endpoint: `${origin}/messages`, tokenSecret: 'operator.webhook', maxPayloadBytes: 16384 } } },
      [waits]: { root: waitRoot }, [secrets]: { environment: { 'operator.webhook': env } },
      [network]: { allowedOrigins: [origin], allowedMethods: ['POST'],
        allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'], maxRequestBytes: 16384, maxResponseBytes: 16384, timeoutMs: 5000 } },
    activeAdapters: [operator, waits, network, secrets], observers: {}, storageRoot: path.join(root, 'state'),
    shutdownTimeoutMs: 5000, orchestratorIssuerId: 'nova', administrativeDecisionIssuers: [] };
  const definition = { schemaVersion: 'pipeline-definition.v2', id: 'pipeline:operator-authority', maxConcurrency: 1,
    stages: [{ id: 'approval', type: 'kubeclaw.decision.human-approval', dependsOn: [],
      config: { target: 'operators', issuerId: 'operator:local', timeoutMinutes: options.timeoutMinutes ?? 60 }, input: { summary: options.summary ?? 'Disposable local approval. '.repeat(320) },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 10000 } }] };
  const runId = 'run:operator-authority', result = await runPipelineV2(platform, definition, runId);
  assert.equal(result.status, 'waiting'); assert.equal(received.length, 1);
  const run = runRoot(platform.storageRoot, runId), wait = result.stages.get('approval').wait;
  const effects = entries(path.join(run, 'effects.jsonl'));
  const request = effects.find(entry => entry.type === 'requested' && entry.request.capability === 'operator.request').request;
  const waitRequest = effects.find(entry => entry.type === 'requested' && entry.request.capability === 'signal.wait').request;
  assert.equal(request.deliveryId, undefined);
  assert.equal(received[0].body, JSON.stringify(request.payload));
  assert.equal(received[0].headers['idempotency-key'], request.idempotencyKey);
  assert.equal(received[0].headers['x-kubeclaw-signature'], `v1=${crypto.createHmac('sha256', token)
    .update(`${request.idempotencyKey}.${received[0].body}`).digest('hex')}`);
  assert.equal(wait.waitId, `wait:${hash(waitRequest.idempotencyKey)}`);
  assert.equal(request.payload.waitId, wait.waitId);
  const signal = { schemaVersion: 'resume-signal.v2', signalId: 'signal:operator-local', idempotencyKey: 'signal:operator-local',
    waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString(),
    payload: { decision: 'approved', issuer: wait.authorizedIssuer } };
  return { root, run, platform, definition, runId, signal, wait, request, waitRequest, received, deliveryRoot, waitRoot };
}

test('original human approval, real signed HTTP receipt and issuer-authorized Core resume supply distinct causal attempts', { timeout: 60000 }, async t => {
  const f = await fixture(t), deliveryFile = path.join(f.deliveryRoot, 'records/store.json');
  const deliveryBefore = fs.readFileSync(deliveryFile), waitsBefore = fs.readFileSync(path.join(f.waitRoot, 'records/store.json'));
  await assert.rejects(resumePipelineV2(f.platform, f.definition, f.runId, { ...f.signal, issuer: { type: 'operator', id: 'operator:other' } }), /WAIT_ISSUER/);
  assert.equal(fs.existsSync(path.join(f.run, 'signals.jsonl')), false);
  const final = await resumePipelineV2(f.platform, f.definition, f.runId, f.signal);
  assert.equal(final.status, 'succeeded'); assert.equal(final.stages.get('approval').attemptsUsed, 2);
  assert.equal(f.received.length, 1);
  assert.deepEqual(fs.readFileSync(deliveryFile), deliveryBefore);
  assert.deepEqual(fs.readFileSync(path.join(f.waitRoot, 'records/store.json')), waitsBefore);
  const effects = entries(path.join(f.run, 'effects.jsonl'));
  const selected = effects.filter(entry => entry.request?.idempotencyKey === f.request.idempotencyKey || entry.receipt?.idempotencyKey === f.request.idempotencyKey);
  assert.deepEqual(selected.map(entry => entry.type), ['requested', 'accepted', 'completed']);
  assert.deepEqual(selected[0].request, selected[1].request);
  const store = new FileDurableRecordStore(f.deliveryRoot, limits), records = await store.read('notifications/operators');
  const original = records.find(record => record.idempotencyKey === `delivery:request:${hash(f.request.idempotencyKey)}`);
  const terminal = records.find(record => record.payload.schemaVersion === 'notification-delivery-receipt.v1');
  assert.deepEqual(original.payload, { schemaVersion: 'notification-delivery-request.v1', idempotencyKey: f.request.idempotencyKey, target: 'operators', payload: f.request.payload });
  assert.deepEqual(terminal.payload.attempt, f.request.attempt);
  assert.deepEqual(terminal.payload.receipt, selected[2].receipt.result);
  assert.equal(terminal.payload.receipt.accepted, true); assert.equal(terminal.payload.receipt.status, 202);
  assert.deepEqual(await deliveryReceipt(store, f.request), terminal.payload.receipt);
  assert.deepEqual(await reserveDelivery(store, f.request, f.request.payload, false), terminal.payload.receipt);
  await assert.rejects(reserveDelivery(store, f.request, { ...f.request.payload, summary: 'changed' }, false), /DURABLE_RECORD_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(lookupDelivery(store, f.request, f.request.idempotencyKey, 'approval', f.request.payload), /OPERATOR_RECEIPT_REQUEST_UNBOUND/);
  assert.deepEqual(fs.readFileSync(deliveryFile), deliveryBefore);
  assert.deepEqual(entries(path.join(f.run, 'signals.jsonl')), [f.signal]);
  const events = entries(path.join(f.run, 'events.jsonl'));
  const completed = events.filter(event => event.type === 'attempt.completed');
  assert.equal(completed.length, 2);
  assert.equal(completed[0].payload.result.outcome, 'wait'); assert.equal(completed[1].payload.result.outcome, 'passed');
  assert.equal(completed[0].identity.attemptId, f.request.attempt.attemptId);
  assert.notEqual(completed[1].identity.attemptId, f.request.attempt.attemptId);
  const created = recoverWaitCreation(f.definition, new FileJournal(path.join(f.run, 'events.jsonl')).records(), f.runId, 'nova', f.wait.waitId);
  const resolved = events.filter(event => event.type === 'wait.resolved');
  assert.deepEqual(created.entry, completed[0]); assert.equal(resolved.length, 1);
  assert.equal(resolved[0].identity.waitId, f.wait.waitId);
  assert.equal(resolved[0].causationId, f.signal.signalId);
  assert.deepEqual(resolved[0].payload.signal, f.signal);
  assert.ok(completed[0].sequence < resolved[0].sequence);
  assert.ok(resolved[0].sequence < completed[1].sequence);
  await assert.rejects(resumePipelineV2(f.platform, f.definition, f.runId, f.signal), /WAIT_RUN_TERMINAL|WAIT_ALREADY_RESOLVED|WAIT_UNKNOWN_OR_STALE/);
  assert.equal(f.received.length, 1);
  console.log(JSON.stringify({ proof: 'original-human-approval-http-receipt-local-issuer-authorized-resume', httpPosts: f.received.length,
    coreStatus: final.status, attempts: completed.map(event => event.payload.result.outcome), deliveryRecords: records.length,
    deliveryBytes: deliveryBefore.length, projectionImplemented: false, externalAuthenticationProved: false }));
});
