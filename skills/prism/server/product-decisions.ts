import { isDeepStrictEqual } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Queryable } from '../storage/index.ts';
import { parseProductIntent, productActor, type ProductConfig } from '../control/product-decisions.ts';
import { recordProductIntent, recordProductReceipt, storedProductDecision, type StoredProductDecision } from '../storage/product-decisions.ts';
import { productController, ProductControllerError } from './product-controller.ts';
import { productOperatorPage } from './product-operator-page.ts';

export function receiptFor(stored: StoredProductDecision, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid product receipt');
  const receipt = value as Record<string, unknown>;
  const payload = JSON.parse(Buffer.from(stored.envelope.payload, 'base64').toString('utf8')) as Record<string, unknown>;
  const expected = {schemaVersion: 'demo-product-decision-receipt.v1', decisionId: stored.decision_id,
    payloadDigest: stored.payload_digest, action: stored.intent.action, leaseName: payload.leaseName,
    leaseUID: payload.leaseUID, readyDigest: payload.readyDigest, generation: payload.generation,
    actorId: stored.actor_id, issuer: payload.issuer, previousExpiry: payload.expectedExpiry,
    state: stored.intent.action === 'accept' ? 'accepted' : 'extended'};
  const oldExpiry = String(payload.expectedExpiry);
  const fraction = /(?:\.([0-9]+))?Z$/u.exec(oldExpiry)?.[1];
  const wholeSeconds = oldExpiry.replace(/\.[0-9]+Z$/u, 'Z');
  const extended = new Date(Date.parse(wholeSeconds) + Number(payload.extensionSeconds ?? 0) * 1000).toISOString().replace('.000Z', fraction ? `.${fraction}Z` : 'Z');
  const expiresAt = stored.intent.action === 'accept' ? oldExpiry : extended;
  if (Object.keys(receipt).length !== Object.keys(expected).length + 3 || Object.entries(expected).some(([key, field]) => receipt[key] !== field) || !isDeepStrictEqual(receipt.envelope, stored.envelope) || receipt.expiresAt !== expiresAt || typeof receipt.appliedAt !== 'string' || !Number.isFinite(Date.parse(receipt.appliedAt))) throw new Error('product receipt does not bind the recorded decision');
  return receipt;
}
async function reconcile(db: Queryable, config: ProductConfig, stored: StoredProductDecision): Promise<Record<string, unknown>> {
  if (stored.receipt) return {state: 'applied', decisionId: stored.decision_id, receipt: receiptFor(stored, stored.receipt)};
  // The immutable status key remains usable after signature expiration. A failed status
  // request is ambiguous: retry only the identical envelope; never issue another one.
  const status = {schemaVersion: 'demo-product-status-request.v1', decisionId: stored.decision_id,
    leaseName: stored.intent.subject.leaseName, leaseUID: stored.intent.subject.leaseUID, payloadDigest: stored.payload_digest};
  try {
    let receipt: Record<string, unknown>;
    try { receipt = receiptFor(stored, await productController(config, '/v1/demo-product/status', status)); }
    catch { receipt = receiptFor(stored, await productController(config, '/v1/demo-product/decisions', stored.envelope)); }
    await recordProductReceipt(db, stored.decision_id, receipt);
    return {state: 'applied', decisionId: stored.decision_id, receipt};
  } catch (error) {
    return {state: 'pending', decisionId: stored.decision_id, ...(error instanceof ProductControllerError && error.code ? {controllerCode: error.code} : {}), message: 'Outcome is unconfirmed. Recover this decision; do not create a replacement.'};
  }
}
async function input(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('application/json required');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 32_000) throw new Error('product input too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function authorizedProductRoute(request: IncomingMessage, url: URL, options: {db: Queryable; config: ProductConfig}, actor: {user: string; expiresAt: number}, json: (code: number, value: unknown) => void): Promise<void> {
    if (url.pathname === '/v1/product-decisions/subjects' && request.method === 'GET') {
      json(200, await productController(options.config, '/v1/demo-product/subjects', {schemaVersion: 'demo-product-subject-request.v1'})); return;
    }
    if (url.pathname === '/v1/product-decisions' && request.method === 'GET') {
      const rows = await options.db.query('SELECT d.decision_id,d.intent,d.created_at,r.receipt FROM prism.product_decision d LEFT JOIN prism.product_decision_receipt r USING(decision_id) WHERE actor_id=$1 ORDER BY created_at DESC LIMIT 100', [actor.user]);
      json(200, {decisions: rows.rows}); return;
    }
    if (url.pathname === '/v1/product-decisions' && request.method === 'POST') {
      let intent;
      try { intent = parseProductIntent(await input(request)); }
      catch { json(400, {state: 'rejected-before-recording', error: 'Invalid decision input; no decision was recorded by this request.'}); return; }
      const stored = await recordProductIntent(options.db, intent, actor, options.config);
      const result = await reconcile(options.db, options.config, stored);
      json(result.state === 'applied' ? 200 : 202, result); return;
    }
    const recovery = /^\/v1\/product-decisions\/([0-9a-f-]{36})\/recover$/u.exec(url.pathname);
    if (recovery && request.method === 'POST') {
      const stored = await storedProductDecision(options.db, recovery[1]!);
      if (!stored || stored.actor_id !== actor.user) throw new Error('product decision is not owned by this operator');
      const result = await reconcile(options.db, options.config, stored);
      json(result.state === 'applied' ? 200 : 202, result); return;
    }
    json(404, {error: 'unknown product decision route'});
}
export async function handleProductDecisions(request: IncomingMessage, response: ServerResponse, url: URL,
  options: {db: Queryable; config?: ProductConfig; sessionSecret: string}): Promise<boolean> {
  if (!url.pathname.startsWith('/v1/product-decisions')) return false;
  response.setHeader('cache-control', 'no-store');
  const json = (code: number, value: unknown): void => {response.writeHead(code, {'content-type': 'application/json'}); response.end(JSON.stringify(value));};
  if (!options.config) { json(404, {error: 'product decisions are disabled'}); return true; }
  // The page is static and grants no authority. All data/actions authenticate below.
  if (url.pathname === '/v1/product-decisions/operator' && request.method === 'GET') {
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}); response.end(productOperatorPage); return true;
  }
  try {
    const actor = productActor(request.headers, options.config, options.sessionSecret, request.method !== 'GET');
    await authorizedProductRoute(request, url, {db: options.db, config: options.config}, actor, json);
  } catch (error) { json(403, {error: error instanceof Error ? error.message : 'product decision rejected'}); }
  return true;
}

export function productAuthorityHandler(next: (request: IncomingMessage, response: ServerResponse) => Promise<unknown>,
  options: {db: Queryable; config?: ProductConfig; sessionSecret: string}): (request: IncomingMessage, response: ServerResponse) => void {
  const dispatch = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://prism-control');
    if (url.pathname === '/v1/session' && request.method === 'POST' && options.config && request.headers.origin !== options.config.origin) {
      response.writeHead(403, {'content-type': 'application/json'}); response.end(JSON.stringify({error: 'Prism session origin rejected'})); return;
    }
    if (await handleProductDecisions(request, response, url, options)) return;
    await next(request, response);
  };
  return (request, response) => { void dispatch(request, response).catch(() => {
    if (response.headersSent) {response.destroy(); return;}
    response.writeHead(500, {'content-type': 'application/json'}); response.end(JSON.stringify({error: 'Product authority request failed'}));
  }); };
}
