import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import * as core from '../../../skills/nova/core/src/index.ts';

const operatorId = 'kubeclaw.operator-messaging:operator';
const observerId = 'kubeclaw.notification-observer:notifications';

async function scenario(mode: 'success' | 'lost' | 'invalid'): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-receipt-'));
  const received: string[] = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    assert.equal(url.pathname, '/webhook/private-token');
    assert.deepEqual(url.searchParams.getAll('wait'), ['true']);
    assert.equal(url.searchParams.get('thread_id'), '987654321012345678');
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8'); received.push(body);
      fs.writeFileSync(path.join(root, 'received.json'), body);
      if (mode === 'lost') { request.socket.destroy(); return; }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(mode === 'invalid' ? { id: '0', messageId: '123456789012345678' } : { id: '123456789012345678' }));
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const environment = `DISCORD_RECEIPT_${mode.toUpperCase()}_${process.pid}`;
  process.env[environment] = `${origin}/webhook/private-token?wait=false&wait=false&thread_id=987654321012345678`;
  const roots = ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins'].map(value => path.resolve(value));
  const snapshot = core.buildRegistry(core.discoverPackages({ installationRoots: roots,
    trustPolicy: { trustedBuiltinRoots: roots, allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:discord-receipt' } }));
  const granted = core.resolveCapabilityGrants(snapshot, { enabledRegistrations: new Set([observerId]),
    providers: new Map([['operator.request', operatorId], ['network.http', 'kubeclaw.network-http:http'], ['secrets.read', 'kubeclaw.secret-resolver:secrets']]),
    grants: new Map([[observerId, new Map([['operator.request', { allowedTargets: ['operators'] }]])], [operatorId, new Map([
      ['network.http', { allowedOrigins: [origin] }], ['secrets.read', { allowedNames: ['discord.webhook'] }],
    ])]]) });
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const configs = new Map<string, Record<string, unknown>>([
    [operatorId, { deliveryRoot: path.join(root, 'sender'), targets: { operators: {
      endpointOrigin: origin, endpointSecret: 'discord.webhook', format: 'discord_webhook',
    } } }],
    ['kubeclaw.network-http:http', { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature'] }],
    ['kubeclaw.secret-resolver:secrets', { environment: { 'discord.webhook': environment } }],
  ]);
  const create = () => new core.AdapterRuntime({ granted, activated, configs,
    effects: new core.EffectCoordinator(new core.FileEffectJournal(path.join(root, 'effects.jsonl')), undefined, undefined, new core.FileResourceLockManager(path.join(root, 'locks'))),
    shutdownTimeoutMs: 1000, async emitDomainEvent() {} });
  let runtime = create();
  const payload = { type: 'demo.credentials', summary: 'Demo username: preview\nDemo password: pipeline-generated-test-value' };
  const publish = (number: number, message = payload) => runtime.invoke('operator.request', {
    runId: 'run:demo', stageId: 'demo-handoff', attemptId: `attempt:${number}`, attemptNumber: number,
  }, `execution:${number}`, { operation: 'publish', resource: { type: 'operator.target', canonicalId: 'operators' }, payload: message }, new AbortController().signal, 'delivery:demo:stable');
  try {
    await runtime.start();
    if (mode === 'success') {
      const receipt = await publish(1);
      assert.deepEqual(receipt, { schemaVersion: 'discord-delivery-receipt.v1', accepted: true, target: 'operators', status: 200,
        messageId: '123456789012345678', deliveryId: 'delivery:demo:stable',
        payloadDigest: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'received.json'))).digest('hex')}` });
      await runtime.shutdown(); runtime = create(); await runtime.start();
      assert.deepEqual(await publish(2), receipt);
      await assert.rejects(publish(3, { ...payload, summary: 'changed credentials' }));
    } else {
      await assert.rejects(publish(1), mode === 'invalid' ? /OPERATOR_DISCORD_RECEIPT_INVALID/ : undefined);
      await runtime.shutdown(); runtime = create(); await runtime.start();
      await assert.rejects(publish(2), /OPERATOR_DELIVERY_UNRESOLVED/);
    }
    assert.equal(received.length, 1, 'reconstruction cannot resend a delivered or uncertain message');
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'effects.jsonl'), 'utf8'), /private-token/);
  } finally {
    await runtime.shutdown(); delete process.env[environment];
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Discord original HTTP and durable store bind wire bytes and replay after reopen', () => scenario('success'));
test('Discord dropped response remains uncertain after reopen without another POST', () => scenario('lost'));
test('Discord invalid actual ID cannot be replaced by generic messageId or blindly retried', () => scenario('invalid'));

test('explicit Discord receipt contract vectors reject legacy acknowledgments and invalid IDs', async () => {
  const { discordReceipt, validateDiscordReceipt } = await import('../../../skills/common/plugins/operator-messaging/src/discord-receipt.ts');
  const request = { resource: { type: 'operator.target', canonicalId: 'operators' }, deliveryId: 'delivery:contract', idempotencyKey: 'execution:contract' } as import('@kubeclaw/plugin-sdk').EffectRequest;
  const payload = { embeds: [{ description: 'contract vector' }] };
  for (const id of ['', '0', '-1', '01', '1.0', 123, '18446744073709551616', '1'.repeat(512)]) {
    assert.throws(() => discordReceipt(request, payload, { status: 200, body: { id } }), /OPERATOR_DISCORD_RECEIPT_INVALID/);
  }
  assert.throws(() => validateDiscordReceipt({ accepted: true, target: 'operators', status: 204 }, request, payload), /reconciliation_required/);
  const receipt = discordReceipt(request, payload, { status: 200, body: { id: '123456789012345678' } });
  assert.throws(() => validateDiscordReceipt(receipt, { ...request, deliveryId: 'delivery:other' }, payload), /reconciliation_required/);
  assert.throws(() => validateDiscordReceipt(receipt, request, { embeds: [] }), /reconciliation_required/);
});
