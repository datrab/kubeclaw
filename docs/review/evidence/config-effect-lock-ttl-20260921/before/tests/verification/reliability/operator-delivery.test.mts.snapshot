import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import * as core from '../../../skills/nova/core/src/index.ts';

const observerId = 'kubeclaw.notification-observer:notifications';
const operatorId = 'kubeclaw.operator-messaging:operator';
const secretName = `OPERATOR_DELIVERY_${process.pid}`;

async function scenario(mode: 'transient' | 'lost_ack' | 'permanent' | 'unresolved' | 'invalid_contract'): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-retry-'));
  const ledger = path.join(root, 'receiver'); fs.mkdirSync(ledger);
  const received: string[] = []; let effects = 0;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    if (request.method === 'GET') {
      const deliveryId = url.searchParams.get('deliveryId')!, payloadDigest = url.searchParams.get('payloadDigest')!;
      assert.equal(request.headers['x-kubeclaw-signature'], `v1=${crypto.createHmac('sha256', 'local-operator-secret').update(`${deliveryId}.${payloadDigest}`).digest('hex')}`);
      const file = path.join(ledger, crypto.createHash('sha256').update(deliveryId).digest('hex'));
      const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (prior) assert.equal(prior.payloadDigest, payloadDigest);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ protocol: mode === 'invalid_contract' ? 'unsupported' : 'kubeclaw.operator-delivery.v1', deliveryId, payloadDigest,
        status: prior ? 'accepted' : 'absent', ...(prior ? { messageId: prior.messageId } : {}) })); return;
    }
    const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const deliveryId = String(request.headers['idempotency-key']); received.push(deliveryId);
      if (mode === 'permanent' || (mode === 'transient' && received.length === 1)) {
        response.writeHead(503); response.end('temporarily unavailable'); return;
      }
      const body = Buffer.concat(chunks);
      assert.equal(request.headers['x-kubeclaw-signature'], `v1=${crypto.createHmac('sha256', 'local-operator-secret').update(`${deliveryId}.${body.toString('utf8')}`).digest('hex')}`);
      const payloadDigest = crypto.createHash('sha256').update(body).digest('hex');
      const file = path.join(ledger, crypto.createHash('sha256').update(deliveryId).digest('hex'));
      if (!fs.existsSync(file)) {
        // Original local receiver commits its actual delivery ledger before ACK.
        const fd = fs.openSync(file, 'wx');
        try { fs.writeSync(fd, JSON.stringify({ payloadDigest, messageId: `message:${++effects}` })); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
      }
      if (mode === 'lost_ack' || mode === 'unresolved') { request.socket.destroy(); return; }
      response.writeHead(202, { 'content-type': 'application/json' }); response.end(JSON.stringify({ messageId: `message:${effects}` }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  process.env[secretName] = 'local-operator-secret';
  const roots = ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'].map(value => path.resolve(value));
  const snapshot = core.buildRegistry(core.discoverPackages({ installationRoots: roots,
    trustPolicy: { trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:operator-retry' } }));
  const granted = core.resolveCapabilityGrants(snapshot, { enabledRegistrations: new Set([observerId]),
    providers: new Map([['operator.request', operatorId], ['network.http', 'kubeclaw.network-http:http'], ['secrets.read', 'kubeclaw.secret-resolver:secrets']]),
    grants: new Map([[observerId, new Map([['operator.request', { allowedTargets: ['operators'] }]])], [operatorId, new Map([
      ['network.http', { allowedOrigins: [origin] }], ['secrets.read', { allowedNames: ['notification.webhook'] }],
    ])]]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const configs = new Map<string, Record<string, unknown>>([[observerId, { target: 'operators' }],
    [operatorId, { deliveryRoot: path.join(root, 'sender'), targets: { operators: { endpoint: `${origin}/messages`, tokenSecret: 'notification.webhook',
      ...(mode === 'unresolved' ? {} : { receiptEndpoint: `${origin}/receipts` }) } } }],
    ['kubeclaw.network-http:http', { allowedOrigins: [origin], allowedMethods: ['GET', 'POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'notification.webhook': secretName } }]]);
  const events = new core.FileJournal<any>(path.join(root, 'events.jsonl'));
  events.append({ schemaVersion: 'lifecycle-event.v2', eventId: 'event:delivery', sequence: 1, type: 'run.failed', identity: { runId: 'run:retry' },
    occurredAt: new Date().toISOString(), causationId: null, payload: { summary: 'Actual diagnostic\nnext line' } });
  const create = (interrupt = false) => {
    const adapters = new core.AdapterRuntime({ granted, activated, configs,
      effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(root, 'effects.jsonl')), undefined, undefined, new core.FileResourceLockManager(path.join(root, 'locks'))),
      shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
    const checkpoints = new core.FileJournal<any>(path.join(root, 'checkpoints.jsonl'));
    const deliveries = new core.FileJournal<any>(path.join(root, 'deliveries.jsonl'));
    const observers = new core.ObserverRuntime({ registry: granted, activated, adapters, configs, events, checkpoints, deliveries,
      wait: async () => { if (interrupt) throw new Error('TEST_PROCESS_STOP_BETWEEN_ATTEMPTS'); } });
    return { adapters, observers, checkpoints, deliveries };
  };
  let runtime = create(mode === 'transient');
  try {
    await runtime.adapters.start();
    if (mode === 'transient') {
      await assert.rejects(runtime.observers.drain(), /TEST_PROCESS_STOP_BETWEEN_ATTEMPTS/);
      assert.equal(received.length, 1); await runtime.adapters.shutdown(); runtime = create(); await runtime.adapters.start();
    }
    const result = await runtime.observers.drain();
    const success = mode === 'transient' || mode === 'lost_ack';
    assert.equal(result.delivered, success ? 1 : 0, JSON.stringify(result));
    assert.equal(received.length, mode === 'transient' ? 2 : mode === 'permanent' ? 5 : mode === 'invalid_contract' ? 0 : 1);
    assert.equal(new Set(received).size, mode === 'invalid_contract' ? 0 : 1, 'external delivery identity survives all execution attempts');
    assert.equal(effects, mode === 'permanent' || mode === 'invalid_contract' ? 0 : 1);
    assert.equal(runtime.checkpoints.records().length, success ? 1 : 0);
    const starts = runtime.deliveries.records().filter(record => record.entry.status === 'started');
    assert.deepEqual(starts.map(record => record.entry.attemptNumber), success ? [1, 2] : [1, 2, 3, 4, 5]);
    if (mode === 'unresolved') assert.match(result.failures[0]!.error, /OPERATOR_DELIVERY_UNRESOLVED/);
    const journal = new core.FileEffectJournal(path.join(root, 'effects.jsonl'));
    const stableId = `delivery:${observerId}:event:delivery:1`;
    const first = await journal.request(`${stableId}:execution:1`), second = await journal.request(`${stableId}:execution:2`);
    assert.equal(first?.deliveryId, stableId); assert.equal(second?.deliveryId, stableId);
    assert.equal(first?.attempt.attemptNumber, 1); assert.equal(second?.attempt.attemptNumber, 2);
    assert.notEqual(first?.effectId, second?.effectId, 'durable receipts are owned by distinct execution attempts');
    const requests = fs.readFileSync(path.join(root, 'effects.jsonl'), 'utf8');
    assert.doesNotMatch(requests, /local-operator-secret/);
    const count = received.length;
    await runtime.adapters.shutdown(); runtime = create(); await runtime.adapters.start();
    const restarted = await runtime.observers.drain();
    assert.equal(restarted.delivered, 0); assert.equal(received.length, count);
    if (!success) assert.equal(restarted.failures[0]!.error, 'OBSERVER_DELIVERY_ATTEMPTS_EXHAUSTED');
  } finally {
    await runtime.adapters.shutdown(); delete process.env[secretName]; await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('original observer, effect journal and operator resume a rejected send after reconstruction', () => scenario('transient'));
test('durable receiver receipt reconciles lost HTTP ACK without a duplicate external delivery', () => scenario('lost_ack'));
test('permanent rejection remains bounded across adapter and observer reconstruction', () => scenario('permanent'));
test('uncertain delivery without receiver contract is never blindly resent', () => scenario('unresolved'));

test('configured receipt endpoint without the actual protocol cannot authorize a send', () => scenario('invalid_contract'));
