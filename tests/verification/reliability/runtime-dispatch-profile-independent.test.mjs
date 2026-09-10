import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {CURRENT_RUNTIME_DISPATCH_PROFILE as profile} from '@kubeclaw/plugin-sdk';
import {activate as dispatch} from '../../../skills/common/plugins/runtime-dispatch/src/adapter.ts';
import {activate as network} from '../../../skills/common/plugins/network-http/src/adapter.ts';
import {activate as secrets} from '../../../skills/common/plugins/secret-resolver/src/adapter.ts';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';
import {stableEffectId, validEffectIdentity} from '../../../skills/nova/core/effects/identity.ts';

// Actual generic HTTP/HMAC and Core persistence, not an OpenClaw/Gateway or
// end-to-end pipeline acceptance claim. Secret and network dependencies use
// their original implementations and the original confidential coordinator.
test('independent closed profile never consumes historical model keys on actual HMAC wire or replay', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-profile-independent-'));
  const captured = fs.readFileSync(new URL('./fixtures/legacy-effects/dispatch.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
  const legacy = captured[0].entry.request, owner = captured[2].entry.receipt.adapter;
  const token = crypto.randomBytes(32).toString('hex');
  const env = `KUBECLAW_PROFILE_REVIEW_${crypto.randomUUID().replaceAll('-', '_')}`;
  process.env[env] = token;
  const signal = new AbortController().signal, received = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const key = request.headers['idempotency-key'];
    const signature = `v1=${crypto.createHmac('sha256', token).update(`${key}.${body}`, 'utf8').digest('hex')}`;
    received.push({body, signature: request.headers['x-kubeclaw-signature'], key});
    const accepted = signature === request.headers['x-kubeclaw-signature'];
    response.writeHead(accepted ? 200 : 401, {'content-type': 'application/json'});
    response.end(JSON.stringify({signatureVerified: accepted}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const secret = secrets({config: {environment: {'review.secret': env}}});
  const httpAdapter = network({config: {allowedOrigins: [origin], allowedMethods: ['POST'],
    allowedHeaders: ['content-type', 'idempotency-key', 'x-kubeclaw-signature']}});
  const journalFile = path.join(root, 'effects.jsonl');
  const coordinator = () => new EffectCoordinator(new FileEffectJournal(journalFile), undefined, undefined,
    new FileResourceLockManager(path.join(root, 'locks')));
  const adapter = dispatch({config: {targets: {forge: {endpoint: `${origin}/dispatch`, authentication: 'hmac', tokenSecret: 'review.secret'}}},
    invokeConfidential: async (capability, request) => {
      assert.ok(['network.http', 'secrets.read'].includes(capability));
      return coordinator().invokeConfidential(capability === 'network.http' ? httpAdapter : secret, owner,
        {...request, capability, attempt: legacy.attempt, idempotencyKey: 'review:confidential-dependency'}, signal);
    }});
  try {
    let ordinal = 0;
    for (const modelValue of ['historical model property', profile]) for (const current of [false, true]) {
      const payload = {task: 'Preserve user model data.', runtimeDispatchProfile: modelValue, architecture: {ä: 1, z: 2}};
      const invocation = {...legacy, idempotencyKey: `review:profile:${++ordinal}`, payload,
        ...(current ? {runtimeDispatchProfile: profile} : {})};
      const before = received.length;
      const receipt = await coordinator().invoke(adapter, owner, invocation, signal);
      assert.equal(receipt.status, 'completed');
      assert.equal(received.length, before + 1);
      assert.equal(received.at(-1).body, JSON.stringify(payload));
      const journal = new FileEffectJournal(journalFile), recorded = await journal.request(invocation.idempotencyKey);
      assert.equal(Object.hasOwn(recorded, 'runtimeDispatchProfile'), current);
      if (current) assert.deepEqual(recorded.runtimeDispatchProfile, profile);
      assert.deepEqual(recorded.payload, payload);
      assert.equal(validEffectIdentity(recorded), true);
      assert.equal(recorded.effectId, stableEffectId(invocation));
      const persisted = fs.readFileSync(journalFile);
      assert.deepEqual(await coordinator().invoke(adapter, owner, invocation, signal), receipt);
      assert.deepEqual(fs.readFileSync(journalFile), persisted);
      assert.equal(received.length, before + 1);
      const {runtimeDispatchProfile: omitted, ...untagged} = invocation;
      const changed = current ? untagged : {...invocation, runtimeDispatchProfile: profile};
      await assert.rejects(coordinator().invoke(adapter, owner, changed, signal), /EFFECT_IDEMPOTENCY_CONFLICT/);
      assert.deepEqual(fs.readFileSync(journalFile), persisted);
      assert.equal(received.length, before + 1);
      assert.equal(persisted.includes(token), false);
    }
    const before = fs.readFileSync(journalFile), calls = received.length;
    for (const invalid of [undefined, null, {...profile, encoding: 'future'}, {...profile, extra: true}]) {
      await assert.rejects(coordinator().invoke(adapter, owner,
        {...legacy, idempotencyKey: 'review:invalid', runtimeDispatchProfile: invalid}, signal));
      assert.deepEqual(fs.readFileSync(journalFile), before);
      assert.equal(received.length, calls);
    }
  } finally {
    await adapter.shutdown(); await httpAdapter.shutdown(); await secret.shutdown();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    delete process.env[env]; fs.rmSync(root, {recursive: true, force: true});
  }
});
