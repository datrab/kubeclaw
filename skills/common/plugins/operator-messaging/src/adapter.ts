import crypto from 'node:crypto';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { completeDelivery, deliveryIdentity, deliveryReceipt, failDelivery, reserveDelivery, type Reservation } from './delivery-records.ts';
import { discordEndpoint, discordReceipt, validateDiscordReceipt } from './discord-receipt.ts';
import { receiverReceipt } from './receiver.ts';
import { isTargetId, parseConfig, type TargetConfig } from './config.ts';
import { assertRequest, parsePayload, responseMessageId, secretValue } from './payload.ts';

const COLORS = Object.freeze({ info: 0x3498db, success: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c });
const ICONS = Object.freeze({ info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' });
const DELIVERY_RECORD_MAX_BYTES = 1_048_576 + 65_536;

function displayText(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function discordWebhookPayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const severity = typeof payload.severity === 'string' ? payload.severity : 'info';
  const title = typeof payload.title === 'string' ? payload.title : String(payload.type);
  const summary = typeof payload.summary === 'string' ? payload.summary
    : typeof payload.message === 'string' ? payload.message : title;
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const reason = typeof payload.reasonCode === 'string' ? [{ name: 'Reason', value: payload.reasonCode, inline: false }] : [];
  return Object.freeze({ allowed_mentions: Object.freeze({ parse: Object.freeze([]) }), embeds: Object.freeze([Object.freeze({
    title: displayText(`${ICONS[severity as keyof typeof ICONS] ?? 'ℹ️'} ${title}`, 256),
    description: displayText(summary, 4_096), color: COLORS[severity as keyof typeof COLORS] ?? COLORS.info,
    fields: Object.freeze([...fields, ...reason].slice(0, 25)),
    ...(typeof payload.footer === 'string' ? { footer: Object.freeze({ text: displayText(payload.footer, 2_048) }) } : {}),
    ...(typeof payload.occurredAt === 'string' ? { timestamp: payload.occurredAt } : {}),
  })]) });
}

function resolveSecretEndpoint(secret: string, target: TargetConfig): string {
  if (!target.endpointSecret) {
    if (!target.endpoint) throw new Error('OPERATOR_ENDPOINT_UNAVAILABLE');
    return target.endpoint;
  }
  let endpoint: URL;
  try { endpoint = new URL(secret); } catch { throw new Error('OPERATOR_SECRET_ENDPOINT_INVALID'); }
  if (endpoint.origin !== target.endpointOrigin || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('OPERATOR_SECRET_ENDPOINT_DENIED');
  }
  return endpoint.href;
}

function transportReceipt(invocation: AdapterInvocation, target: TargetConfig, payload: Readonly<Record<string, unknown>>, response: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) throw new Error('OPERATOR_DELIVERY_INVALID_RESPONSE');
  if (target.format === 'discord_webhook') return discordReceipt(invocation.request, payload, response);
  const messageId = responseMessageId(response);
  return { accepted: true, target: invocation.request.resource.canonicalId, status: Number(response.status), ...(messageId ? { messageId } : {}) };
}

async function deliver(context: AdapterActivationContext, invocation: AdapterInvocation, target: TargetConfig, records: FileDurableRecordStore): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal } = invocation;
  const payload = parsePayload(request.payload, target.maxPayloadBytes);
  const transportPayload = target.format === 'discord_webhook' ? discordWebhookPayload(payload) : payload;
  const reserved = await reserveDelivery(records, request, transportPayload, target.format === 'json' && Boolean(target.receiptEndpoint));
  if ('accepted' in reserved) return target.format === 'discord_webhook' ? validateDiscordReceipt(reserved, request, transportPayload) : reserved;
  const reservation = reserved as Reservation;
  let sent = false;
  try {
    const secretName = target.endpointSecret ?? target.tokenSecret;
    if (!secretName) throw new Error('OPERATOR_SECRET_UNAVAILABLE');
    const resolved = await context.invoke('secrets.read', { operation: 'resolve', resource: { type: 'secret.name', canonicalId: secretName }, payload: {} });
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const secret = secretValue(resolved), deliveryId = deliveryIdentity(request), body = JSON.stringify(transportPayload);
    const resolvedEndpoint = resolveSecretEndpoint(secret, target);
    const endpoint = target.format === 'discord_webhook' ? discordEndpoint(resolvedEndpoint) : resolvedEndpoint;
    if (target.format === 'json' && target.receiptEndpoint) {
      const accepted = await receiverReceipt(context, target.receiptEndpoint, deliveryId, body, secret);
      if (accepted) return completeDelivery(records, request, reservation, { accepted: true, target: request.resource.canonicalId, status: 200, ...accepted });
    }
    const signature = crypto.createHmac('sha256', secret).update(`${deliveryId}.${body}`, 'utf8').digest('hex');
    const networkRequest = { operation: 'request', resource: { type: 'network.url', canonicalId: endpoint }, payload: {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': deliveryId, 'x-kubeclaw-signature': `v1=${signature}` }, body: transportPayload,
    } };
    sent = true;
    const response = target.endpointSecret ? await context.invokeConfidential('network.http', networkRequest) : await context.invoke('network.http', networkRequest);
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    return await completeDelivery(records, request, reservation, transportReceipt(invocation, target, transportPayload, response));
  } catch (error) { return failDelivery(records, request, reservation, sent, error); }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const config = parseConfig(context.config);
  const targets = config.targets;
  const records = new FileDurableRecordStore(config.deliveryRoot, {
    maximumRecords: config.maximumDeliveryRecords,
    maximumBytes: config.maximumDeliveryBytes,
    maximumRecordBytes: DELIVERY_RECORD_MAX_BYTES,
  });
  let shuttingDown = false;
  return {
    async ready() { if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN'); },
    async invoke(invocation) {
      const { request, signal, confidential, fence } = invocation;
      if (!confidential) fence.assertCurrent();
      if (shuttingDown) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      assertRequest(request, isTargetId);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`OPERATOR_TARGET_DENIED:${request.resource.canonicalId}`);
      return deliver(context, invocation, target, records);
    },
    async receipt(request) {
      assertRequest(request, isTargetId);
      const receipt = await deliveryReceipt(records, request);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`OPERATOR_TARGET_DENIED:${request.resource.canonicalId}`);
      return receipt && target.format === 'discord_webhook'
        ? validateDiscordReceipt(receipt, request, discordWebhookPayload(parsePayload(request.payload, target.maxPayloadBytes))) : receipt;
    },
    async shutdown() { shuttingDown = true; },
  };
}
