import crypto from 'node:crypto';
import type { EffectRequest } from '@kubeclaw/plugin-sdk';
import { deliveryIdentity } from './delivery-records.ts';

type Payload = Readonly<Record<string, unknown>>;
export interface DiscordDeliveryReceipt extends Readonly<Record<string, unknown>> {
  readonly schemaVersion: 'discord-delivery-receipt.v1';
  readonly accepted: true;
  readonly target: string;
  readonly status: number;
  readonly messageId: string;
  readonly deliveryId: string;
  readonly payloadDigest: string;
}

export function discordEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  url.searchParams.set('wait', 'true');
  return url.href;
}

function messageId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
}

function payloadDigest(payload: Payload): string {
  // The original network.http adapter transmits this exact JSON serialization.
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')}`;
}

export function discordReceipt(request: EffectRequest, payload: Payload, response: Payload): DiscordDeliveryReceipt {
  const body = response.body;
  const id = body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Payload).id : undefined;
  if (!messageId(id)) throw new Error('OPERATOR_DISCORD_RECEIPT_INVALID');
  return { schemaVersion: 'discord-delivery-receipt.v1', accepted: true, target: request.resource.canonicalId,
    status: Number(response.status), messageId: id, deliveryId: deliveryIdentity(request), payloadDigest: payloadDigest(payload) };
}

export function validateDiscordReceipt(receipt: Payload, request: EffectRequest, payload: Payload): Payload {
  if (receipt.schemaVersion !== 'discord-delivery-receipt.v1' || receipt.accepted !== true ||
      receipt.target !== request.resource.canonicalId || receipt.deliveryId !== deliveryIdentity(request) ||
      receipt.payloadDigest !== payloadDigest(payload) || !messageId(receipt.messageId) ||
      !Number.isSafeInteger(receipt.status) || Number(receipt.status) < 200 || Number(receipt.status) > 299) {
    throw new Error('OPERATOR_DISCORD_RECEIPT_UNBOUND:reconciliation_required');
  }
  return receipt;
}
