import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { exchangeTailscaleIdentity } from '../control/session.ts';
import { PRODUCT_DOMAIN, parseProductIntent, productActor, loadProductConfig, signProductIntent, type ProductConfig } from '../control/product-decisions.ts';
import { recordProductIntent, storedProductDecision, recordProductReceipt } from '../storage/product-decisions.ts';
import { handleStudioRequest } from '../server/studio-request.ts';
import { productAuthorityHandler, receiptFor } from '../server/product-decisions.ts';
const keys = generateKeyPairSync('ed25519');
const config: ProductConfig = {issuer: 'test-product-authority', operators: new Set(['operator@example.test']),
  origin: 'https://studio.example.test', privateKey: keys.privateKey, controller: new URL('https://127.0.0.1:1'),
  caFile: '/definitely-absent-product-ca', tokenFile: '/definitely-absent-product-token'};
const secret = 'local-session-test-secret';
const token = exchangeTailscaleIdentity({'x-prism-ingress-secret': 'local-ingress-secret', 'tailscale-user-login': 'operator@example.test'}, 'local-ingress-secret', secret);
const headers = {cookie: `prism_session=${token}; prism_csrf=csrf`, origin: config.origin, 'x-prism-csrf': 'csrf'};
const intent = parseProductIntent({decisionId: '00000000-0000-4000-8000-000000000001', action: 'extend', reason: 'Review needs another hour', extensionSeconds: 3600,
  subject: {leaseName: 'demo-test', leaseUID: 'lease-uid', sourceRevision: 'abc', candidateDigest: `sha256:${'a'.repeat(64)}`, resultDigest: `sha256:${'b'.repeat(64)}`, readyDigest: `sha256:${'c'.repeat(64)}`, generation: 3, expectedExpiry: '2026-09-09T10:20:30.123456789Z', expectedRevision: '12345', url: 'https://demo.example.test', runId: 'test-run'}});
async function database(path?: string) {
  const db = new PGlite(path);
  await db.exec("CREATE SCHEMA IF NOT EXISTS prism; DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='prism_runtime') THEN CREATE ROLE prism_runtime; CREATE ROLE prism_readonly; END IF; END $$;");
  await db.exec(await readFile(new URL('../storage/migrations/015_product_decisions.sql', import.meta.url), 'utf8'));
  return db;
}
test('real session issuer, explicit operator policy, origin and CSRF bind the signer', async () => {
  const actor = productActor(headers, config, secret, true);
  assert.equal(actor.user, 'operator@example.test');
  for (const denied of [{...headers, origin: 'https://attacker.test'}, {...headers, 'x-prism-csrf': 'wrong'}, {...headers, cookie: headers.cookie.replace(token, `${token}x`)}]) assert.throws(() => productActor(denied, config, secret, true));
  assert.throws(() => productActor(headers, {...config, operators: new Set()}, secret, true));
  assert.throws(() => productActor(headers, config, secret, true, actor.expiresAt));
  assert.equal(await loadProductConfig({}), undefined);
  await assert.rejects(loadProductConfig({PRISM_PRODUCT_DECISIONS_ENABLED: 'true'}));
  const signed = signProductIntent(intent, actor, config);
  const bytes = Buffer.from(signed.envelope.payload, 'base64');
  assert.equal(verify(null, Buffer.concat([Buffer.from(PRODUCT_DOMAIN), bytes]), keys.publicKey, Buffer.from(signed.envelope.signature, 'base64')), true);
  assert.equal(verify(null, bytes, keys.publicKey, Buffer.from(signed.envelope.signature, 'base64')), false);
  assert.equal(signed.payload.actorId, actor.user);
  assert(signed.payload.expiresAt.endsWith('Z') && !signed.payload.expiresAt.includes('.'));
  assert.throws(() => parseProductIntent({...intent, actorId: 'attacker'}));
  assert.throws(() => parseProductIntent({...intent, action: 'accept'}));
  assert.throws(() => parseProductIntent({...intent, reason: 'é'.repeat(1001)}));
});
test('real HTTP authorization persists signed intent before failed transport and recovers identical bytes after durable database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prism-product-'));
  let db = await database(directory);
  const server = createServer((request, response) => productAuthorityHandler(async (_request, nextResponse) => {nextResponse.writeHead(404); nextResponse.end();}, {db, config, sessionSecret: secret})(request, response));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const studio = createServer((request, response) => { void handleStudioRequest(request, response, {root: directory, control: new URL(`http://127.0.0.1:${address.port}`), ingressSecret: 'local-ingress-secret', controlTimeoutMs: 10_000}); });
  studio.listen(0, '127.0.0.1'); await once(studio, 'listening');
  const studioAddress = studio.address(); assert(studioAddress && typeof studioAddress !== 'string');
  const post = (path: string, value: unknown, extra = {}) => fetch(`http://127.0.0.1:${studioAddress.port}${path}`, {method: 'POST', headers: {...headers, 'content-type': 'application/json', ...extra}, body: JSON.stringify(value)});
  try {
    assert.equal((await post('/v1/session', {}, {origin: 'https://attacker.test'})).status, 403);
    const rejected = await post('/v1/product-decisions', intent, {origin: 'https://attacker.test'});
    assert.equal(rejected.status, 403); assert.equal(await storedProductDecision(db, intent.decisionId), undefined);
    const pending = await post('/v1/product-decisions', intent); assert.equal(pending.status, 202); assert.equal((await pending.json()).state, 'pending');
    const before = await storedProductDecision(db, intent.decisionId); assert(before); assert.equal(before.receipt, null);
    await db.close(); db = new PGlite(directory);
    const recovered = await post(`/v1/product-decisions/${intent.decisionId}/recover`, {}); assert.equal(recovered.status, 202);
    const retried = await post('/v1/product-decisions', intent); assert.equal(retried.status, 202);
    assert.deepEqual((await storedProductDecision(db, intent.decisionId))?.envelope, before.envelope);
    assert.equal((await post('/v1/product-decisions', {...intent, reason: 'changed'})).status, 403);
    await db.exec('SET ROLE prism_runtime');
    await assert.rejects(db.query('UPDATE prism.product_decision SET actor_id=$1', ['attacker']));
    await assert.rejects(db.query('DELETE FROM prism.product_decision'));
    await db.exec('RESET ROLE');
  } finally {studio.close(); studio.closeAllConnections(); await once(studio, 'close'); server.close(); server.closeAllConnections(); await once(server, 'close'); await db.close(); await rm(directory, {recursive: true, force: true});}
});
test('SQL receipt replay compares nested signature bytes and preserves append-only history', async () => {
  const db = await database();
  try {
    const stored = await recordProductIntent(db, intent, productActor(headers, config, secret, true), config);
    const receipt = {schemaVersion: 'sql-receipt-test', envelope: stored.envelope};
    await recordProductReceipt(db, intent.decisionId, receipt);
    await recordProductReceipt(db, intent.decisionId, structuredClone(receipt));
    await assert.rejects(recordProductReceipt(db, intent.decisionId, {...receipt, envelope: {...receipt.envelope, signature: 'changed'}}));
  } finally {await db.close();}
});

test('receipt contract preserves Go nanosecond expiry and rejects changed nested envelope', async () => {
  const db = await database();
  try {
    const stored = await recordProductIntent(db, intent, productActor(headers, config, secret, true), config);
    const receipt = {schemaVersion: 'demo-product-decision-receipt.v1', decisionId: intent.decisionId,
      payloadDigest: stored.payload_digest, action: 'extend', leaseName: intent.subject.leaseName,
      leaseUID: intent.subject.leaseUID, readyDigest: intent.subject.readyDigest, generation: intent.subject.generation,
      actorId: 'operator@example.test', issuer: config.issuer, previousExpiry: intent.subject.expectedExpiry,
      state: 'extended', expiresAt: '2026-09-09T11:20:30.123456789Z', appliedAt: '2026-09-09T10:00:00Z', envelope: stored.envelope};
    assert.deepEqual(receiptFor(stored, receipt), receipt);
    assert.throws(() => receiptFor(stored, {...receipt, expiresAt: '2026-09-09T11:20:30.123Z'}));
    assert.throws(() => receiptFor(stored, {...receipt, envelope: {...receipt.envelope, signature: 'changed'}}));
  } finally {await db.close();}
});
