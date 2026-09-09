import crypto from 'node:crypto';
import type { AdapterActivationContext } from '@kubeclaw/plugin-sdk';

/** The receiver contract requires atomic durable deduplication of POST delivery IDs. */
export async function receiverReceipt(context: AdapterActivationContext, endpoint: string, deliveryId: string, body: string, secret: string): Promise<Readonly<Record<string, unknown>> | undefined> {
  const payloadDigest = crypto.createHash('sha256').update(body).digest('hex');
  const url = new URL(endpoint); url.searchParams.set('deliveryId', deliveryId); url.searchParams.set('payloadDigest', payloadDigest);
  const signature = crypto.createHmac('sha256', secret).update(`${deliveryId}.${payloadDigest}`).digest('hex');
  // Receipt reads are fresh, confidential, authorized GETs, never cached effects.
  const response = await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: url.href },
    payload: { method: 'GET', headers: { 'x-kubeclaw-signature': `v1=${signature}` } } });
  const receipt = response.body as Readonly<Record<string, unknown>> | null;
  if (Number(response.status) !== 200 || !receipt || receipt.protocol !== 'kubeclaw.operator-delivery.v1'
    || receipt.deliveryId !== deliveryId || receipt.payloadDigest !== payloadDigest) throw new Error('OPERATOR_RECEIVER_CONTRACT_INVALID');
  if (receipt.status === 'absent') return undefined;
  if (receipt.status !== 'accepted' || typeof receipt.messageId !== 'string' || !receipt.messageId || receipt.messageId.length > 512) {
    throw new Error('OPERATOR_RECEIVER_RECEIPT_INVALID');
  }
  return { messageId: receipt.messageId };
}
