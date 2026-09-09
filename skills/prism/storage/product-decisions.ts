import { isDeepStrictEqual } from 'node:util';
import type { Queryable } from './index.ts';
import { productDigest, signProductIntent, type ProductConfig, type ProductEnvelope, type ProductIntent } from '../control/product-decisions.ts';
export type StoredProductDecision = {decision_id: string; actor_id: string; intent_digest: string;
  intent: ProductIntent; payload_digest: string; envelope: ProductEnvelope; receipt: Record<string, unknown> | null};
export async function storedProductDecision(db: Queryable, id: string): Promise<StoredProductDecision | undefined> {
  return (await db.query<StoredProductDecision>('SELECT d.*,r.receipt FROM prism.product_decision d LEFT JOIN prism.product_decision_receipt r USING(decision_id) WHERE decision_id=$1', [id])).rows[0];
}
export async function recordProductIntent(db: Queryable, intent: ProductIntent, actor: {user: string; expiresAt: number}, config: ProductConfig): Promise<StoredProductDecision> {
  // A fixed property order makes semantic retries independent of caller JSON order.
  const normalized = {decisionId: intent.decisionId, action: intent.action, reason: intent.reason,
    subject: Object.fromEntries(Object.entries(intent.subject).sort(([a], [b]) => a.localeCompare(b))),
    ...(intent.action === 'extend' ? {extensionSeconds: intent.extensionSeconds} : {})};
  const digest = productDigest(JSON.stringify(normalized));
  let stored = await storedProductDecision(db, intent.decisionId);
  if (!stored) {
    const signed = signProductIntent(intent, actor, config);
    await db.query('INSERT INTO prism.product_decision(decision_id,actor_id,intent_digest,intent,payload_digest,envelope) VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb) ON CONFLICT DO NOTHING', [intent.decisionId, actor.user, digest, JSON.stringify(intent), signed.payloadDigest, JSON.stringify(signed.envelope)]);
    stored = await storedProductDecision(db, intent.decisionId);
  }
  if (!stored || stored.actor_id !== actor.user || stored.intent_digest !== digest) throw new Error('product decision ID conflicts with recorded intent');
  return stored;
}
export async function recordProductReceipt(db: Queryable, id: string, receipt: Record<string, unknown>): Promise<void> {
  await db.query('INSERT INTO prism.product_decision_receipt(decision_id,receipt) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING', [id, JSON.stringify(receipt)]);
  const stored = await storedProductDecision(db, id);
  // JSONB key ordering is deliberately irrelevant; every receipt field must agree.
  if (!stored?.receipt || !isDeepStrictEqual(receipt, stored.receipt)) throw new Error('product receipt conflicts with durable audit');
}
