import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

const sdk = process.argv[2];
const load = relative => import(pathToFileURL(path.join(sdk, relative)).href);
const { EffectCoordinator } = await load('skills/nova/core/effects/coordinator.ts');
const { FileEffectJournal } = await load('skills/nova/core/effects/journal.ts');
const { FileResourceLockManager } = await load('skills/nova/core/effects/locks.ts');
const { activate: dispatch } = await load('skills/common/plugins/runtime-dispatch/src/adapter.ts');
const { activate: network } = await load('skills/common/plugins/network-http/src/adapter.ts');
const records = fs.readFileSync(path.join(sdk, 'tests/verification/reliability/fixtures/legacy-effects/dispatch.jsonl'), 'utf8').trimEnd().split('\n');
const legacy = JSON.parse(records[0]).entry.request;
const owner = JSON.parse(records[2]).entry.receipt.adapter;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-legacy-lock-review-'));
let calls = 0;
const server = http.createServer(async (request, response) => {
  calls++; for await (const _chunk of request) { /* drain the actual request */ }
  response.setHeader('content-type', 'application/json'); response.end('{"accepted":true}');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const signal = new AbortController().signal;
const httpAdapter = network({ config: { allowedOrigins: [origin], allowedMethods: ['POST'], allowedHeaders: ['content-type', 'idempotency-key'] } });
const adapter = dispatch({ config: { targets: { forge: { endpoint: origin + '/dispatch', authentication: 'spiffe-proxy' } } },
  invokeConfidential: (capability, request) => httpAdapter.invoke({ confidential: true, signal,
    request: { ...request, capability, attempt: legacy.attempt, idempotencyKey: 'independent:inner-http' } }) });
const locks = new FileResourceLockManager(path.join(root, 'locks'));
let held;
try {
  const file = path.join(root, 'effects.jsonl');
  const prefix = records[0] + '\n'; fs.writeFileSync(file, prefix);
  held = locks.acquire({ type: 'runtime.invocation', canonicalId: legacy.effectId }, 'independent:other-attempt', 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('independent held-lock cancellation')), 80);
  try {
    await assert.rejects(new EffectCoordinator(new FileEffectJournal(file), undefined, undefined, locks)
      .invoke(adapter, owner, legacy, controller.signal), /EFFECT_RESOURCE_WAIT_CANCELLED/u);
  } finally { clearTimeout(timer); }
  assert.equal(calls, 0, 'legacy lock prevents actual HTTP dispatch');
  assert.equal(fs.readFileSync(file, 'utf8'), prefix, 'lock contention does not accept or rewrite the legacy request');
  locks.release(held.lockId, 'independent:other-attempt'); held = undefined;
  const receipt = await new EffectCoordinator(new FileEffectJournal(file), undefined, undefined, locks).invoke(adapter, owner, legacy, signal);
  assert.equal(receipt.effectId, legacy.effectId);
  assert.equal(receipt.status, 'completed'); assert.equal(calls, 1);
  const written = fs.readFileSync(file, 'utf8');
  const replay = await new EffectCoordinator(new FileEffectJournal(file), undefined, undefined, locks).invoke(adapter, owner, legacy, signal);
  assert.deepEqual(replay, receipt); assert.equal(calls, 1); assert.equal(fs.readFileSync(file, 'utf8'), written);
  console.log(JSON.stringify({ review: 'independent-held-legacy-lock', httpCallsWhileHeld: 0,
    httpCallsAfterReleaseAndReplay: calls, legacyEffectIdPreserved: true, journalPrefixPreserved: true }));
} finally {
  if (held) locks.release(held.lockId, 'independent:other-attempt');
  await adapter.shutdown(signal); await httpAdapter.shutdown(signal);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
