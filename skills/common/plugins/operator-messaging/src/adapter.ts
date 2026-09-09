import { discordWebhookPayload } from './discord-payload.ts';
import crypto from 'node:crypto';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation, EffectRequest } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { completeDelivery, lookupDelivery, deliveryIdentity, deliveryReceipt, failDelivery, reserveDelivery, type Reservation } from './delivery-records.ts';
import { discordEndpoint, discordReceipt, validateDiscordReceipt } from './discord-receipt.ts';
import { receiverReceipt } from './receiver.ts';
import { isTargetId, parseConfig, type TargetConfig } from './config.ts';
import { assertRequest, parsePayload, responseMessageId, secretValue } from './payload.ts';

// One exact JSON transport body is stored as a JSON string: escaping can at most
// double its admitted 1 MiB bytes. Metadata allowance and aggregate quotas stay unchanged.
const DELIVERY_RECORD_MAX_BYTES = 2 * 1_048_576 + 65_536;

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
      if (request.capability === 'operator.receipt') {
        const receipt = await lookupReceipt(records, request, targets.get(request.resource.canonicalId));
        signal.throwIfAborted();
        return receipt;
      }
      assertRequest(request, isTargetId);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`OPERATOR_TARGET_DENIED:${request.resource.canonicalId}`);
      return deliver(context, invocation, target, records);
    },
    async receipt(request) {
      if (request.capability === 'operator.receipt') return lookupReceipt(records, request, targets.get(request.resource.canonicalId));
      assertRequest(request, isTargetId);
      const target = targets.get(request.resource.canonicalId);
      if (!target) throw new Error(`OPERATOR_TARGET_DENIED:${request.resource.canonicalId}`);
      const payload = parsePayload(request.payload, target.maxPayloadBytes);
      const transportPayload = target.format === 'discord_webhook' ? discordWebhookPayload(payload) : payload;
      const receipt = await deliveryReceipt(records, request, transportPayload);
      return receipt && target.format === 'discord_webhook'
        ? validateDiscordReceipt(receipt, request, transportPayload) : receipt;
    },
    async shutdown() { shuttingDown = true; },
  };
}

async function lookupReceipt(records:FileDurableRecordStore,request:EffectRequest,target:TargetConfig|undefined) {
  if (request.operation !== 'lookup' || request.resource.type !== 'operator.target' || !isTargetId(request.resource.canonicalId)) throw new Error('OPERATOR_RECEIPT_OPERATION_INVALID');
  if (!target || target.format !== 'discord_webhook') throw new Error('OPERATOR_RECEIPT_TARGET_DENIED');
  const { deliveryId, stageId, payload } = request.payload;
  if (Object.keys(request.payload).some(key => !['deliveryId', 'stageId', 'payload'].includes(key))
    || typeof deliveryId !== 'string' || !deliveryId || deliveryId.length > 512 || typeof stageId !== 'string' || !stageId
    || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('OPERATOR_RECEIPT_QUERY_INVALID');
  const transport = discordWebhookPayload(parsePayload(payload as Readonly<Record<string, unknown>>, target.maxPayloadBytes));
  const receipt = await lookupDelivery(records, request, deliveryId, stageId, transport);
  return validateDiscordReceipt(receipt, { ...request, deliveryId }, transport);
}
