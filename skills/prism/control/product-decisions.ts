import { createHash, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verifySession } from './session.ts';
import type { IncomingHttpHeaders } from 'node:http';

export const PRODUCT_DOMAIN = 'kubeclaw.demo-product-decision.v1\0';
export type ProductSubject = {
  leaseName: string; leaseUID: string; sourceRevision: string; candidateDigest: string;
  resultDigest: string; readyDigest: string; generation: number; expectedExpiry: string;
  expectedRevision: string; url: string; runId: string;
};
export type ProductIntent = { decisionId: string; action: 'accept' | 'extend'; reason: string;
  subject: ProductSubject; extensionSeconds?: number };
export type ProductEnvelope = {schemaVersion: 'demo-product-decision-envelope.v1'; payload: string; signature: string};
export type ProductPayload = Omit<ProductSubject, 'url' | 'runId'> & {
  schemaVersion: 'demo-product-decision.v1'; issuer: string; actorId: string;
  decisionId: string; action: 'accept' | 'extend'; reason: string; issuedAt: string;
  expiresAt: string; extensionSeconds?: number;
};
export type ProductConfig = { issuer: string; operators: ReadonlySet<string>; origin: string;
  privateKey: KeyObject; controller: URL; caFile: string; tokenFile: string };
export const productDigest = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export async function loadProductConfig(env: NodeJS.ProcessEnv): Promise<ProductConfig | undefined> {
  if (env.PRISM_PRODUCT_DECISIONS_ENABLED !== 'true') return undefined;
  const required = (name: string): string => { const value = env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
  const origin = new URL(required('PRISM_PRODUCT_ORIGIN'));
  const controller = new URL(required('PRISM_PRODUCT_CONTROLLER_URL'));
  if ([origin, controller].some(url => url.protocol !== 'https:' || url.pathname !== '/' || [url.username, url.password, url.search, url.hash].some(Boolean))) throw new Error('product authority requires HTTPS origins');
  const operators: unknown = JSON.parse(required('PRISM_PRODUCT_OPERATORS'));
  if (!Array.isArray(operators) || !operators.length || operators.some(item => typeof item !== 'string' || !item.trim() || item !== item.trim()) || new Set(operators).size !== operators.length) throw new Error('explicit product operator allowlist is required');
  const privateKey = createPrivateKey(await readFile(required('PRISM_PRODUCT_PRIVATE_KEY_FILE')));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('product issuer requires a dedicated Ed25519 key');
  return { issuer: required('PRISM_PRODUCT_ISSUER'), operators: new Set(operators), origin: origin.origin,
    privateKey, controller, caFile: required('PRISM_PRODUCT_CONTROLLER_CA_FILE'), tokenFile: required('PRISM_PRODUCT_CONTROLLER_TOKEN_FILE') };
}
export function productActor(headers: IncomingHttpHeaders, config: ProductConfig, sessionSecret: string, mutate: boolean, now = Date.now()): {user: string; expiresAt: number} {
  const cookies = new Map((headers.cookie ?? '').split(';').map(part => { const index = part.indexOf('='); return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]; }));
  const token = cookies.get('prism_session') ?? '';
  if (token.split('.').length !== 2) throw new Error('invalid product operator session');
  const session = verifySession(token, sessionSecret, now);
  if (typeof session.user !== 'string' || !Number.isSafeInteger(session.expiresAt) || !config.operators.has(session.user)) throw new Error('product operator is not authorized');
  if (mutate && (headers.origin !== config.origin || !cookies.get('prism_csrf') || headers['x-prism-csrf'] !== cookies.get('prism_csrf'))) throw new Error('product decision origin or CSRF rejected');
  return { user: session.user, expiresAt: session.expiresAt };
}
function closed(value: unknown, required: string[], optional: string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('invalid product decision fields');
}
function validateSubject(subject: unknown): void {
  closed(subject, ['leaseName', 'leaseUID', 'sourceRevision', 'candidateDigest', 'resultDigest', 'readyDigest', 'generation', 'expectedExpiry', 'expectedRevision', 'url', 'runId']);
  for (const [key, field] of Object.entries(subject)) if (key !== 'generation' && (typeof field !== 'string' || !field || field.length > 2048)) throw new Error('invalid product subject');
  if (!Number.isSafeInteger(subject.generation) || Number(subject.generation) < 1) throw new Error('invalid product generation');
}
export function parseProductIntent(value: unknown): ProductIntent {
  closed(value, ['decisionId', 'action', 'reason', 'subject'], ['extensionSeconds']);
  if (typeof value.decisionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value.decisionId) || !['accept', 'extend'].includes(String(value.action)) || typeof value.reason !== 'string' || !value.reason.trim() || Buffer.byteLength(value.reason, 'utf8') > 2000) throw new Error('invalid product decision intent');
  validateSubject(value.subject);
  if (value.action === 'extend' ? !Number.isSafeInteger(value.extensionSeconds) || Number(value.extensionSeconds) < 1 || Number(value.extensionSeconds) > 9223372036 : Object.hasOwn(value, 'extensionSeconds')) throw new Error('invalid product extension');
  return value as unknown as ProductIntent;
}
export function signProductIntent(intent: ProductIntent, actor: {user: string; expiresAt: number}, config: ProductConfig, now = Date.now()): {envelope: ProductEnvelope; payload: ProductPayload; payloadDigest: string} {
  const expiry = Math.floor(Math.min(now + 300_000, actor.expiresAt) / 1000) * 1000;
  if (expiry <= now) throw new Error('operator session expires before decision issuance');
  const {url: _url, runId: _runId, ...subject} = intent.subject;
  const payload: ProductPayload = {schemaVersion: 'demo-product-decision.v1', issuer: config.issuer,
    actorId: actor.user, decisionId: intent.decisionId, action: intent.action, reason: intent.reason,
    ...subject, issuedAt: new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z'),
    expiresAt: new Date(expiry).toISOString().replace('.000Z', 'Z'),
    ...(intent.action === 'extend' ? {extensionSeconds: intent.extensionSeconds} : {})};
  const bytes = Buffer.from(JSON.stringify(payload));
  return {payload, payloadDigest: productDigest(bytes), envelope: {schemaVersion: 'demo-product-decision-envelope.v1',
    payload: bytes.toString('base64'), signature: sign(null, Buffer.concat([Buffer.from(PRODUCT_DOMAIN), bytes]), config.privateKey).toString('base64')}};
}
