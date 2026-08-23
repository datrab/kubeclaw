import crypto from 'node:crypto';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation } from '@kubeclaw/plugin-sdk';
import { FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { isTargetId, parseConfig, type TargetConfig } from './config.ts';
import { assertRequest, parsePayload, responseMessageId, secretValue } from './payload.ts';

const COLORS = Object.freeze({ info: 0x3498db, success: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c });
const ICONS = Object.freeze({ info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' });
const TERMINAL_RESERVATION_BYTES = 8_192;
const DELIVERY_RECORD_MAX_BYTES = 1_048_576 + 65_536;

function discordWebhookPayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const severity = typeof payload.severity === 'string' ? payload.severity : 'info';
  const title = typeof payload.title === 'string' ? payload.title : String(payload.type);
  const summary = typeof payload.summary === 'string' ? payload.summary
    : typeof payload.message === 'string' ? payload.message : title;
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const reason = typeof payload.reasonCode === 'string' ? [{ name: 'Reason', value: payload.reasonCode, inline: false }] : [];
  return Object.freeze({ allowed_mentions: Object.freeze({ parse: Object.freeze([]) }), embeds: Object.freeze([Object.freeze({
    title: `${ICONS[severity as keyof typeof ICONS] ?? 'ℹ️'} ${title}`.slice(0, 256),
    description: summary.slice(0, 4_096), color: COLORS[severity as keyof typeof COLORS] ?? COLORS.info,
    fields: Object.freeze([...fields, ...reason].slice(0, 25)),
    ...(typeof payload.footer === 'string' ? { footer: Object.freeze({ text: payload.footer.slice(0, 2_048) }) } : {}),
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

function deliveryRecordKey(idempotencyKey: string, kind: string): string {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
  return `delivery:${kind}:${digest}`;
}

function terminalRecordKey(idempotencyKey: string, attemptId: string, attemptNumber: number): string {
  const attempt = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 16);
  return deliveryRecordKey(idempotencyKey, `attempt-${attemptNumber}-${attempt}`);
}

function completedReceipt(
  records: ReadonlyArray<{
    readonly idempotencyKey: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }>,
  idempotencyKey: string,
): Readonly<Record<string, unknown>> | undefined {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
  const completed = records.find((entry) =>
    entry.idempotencyKey.endsWith(`:${digest}`)
    && entry.payload.schemaVersion === 'notification-delivery-receipt.v1');
  return completed?.payload.receipt as Readonly<Record<string, unknown>> | undefined;
}

async function deliver(
  context: AdapterActivationContext,
  invocation: AdapterInvocation,
  target: TargetConfig,
  records: FileDurableRecordStore,
): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal } = invocation;
  const payload = parsePayload(request.payload, target.maxPayloadBytes);
  const transportPayload = target.format === 'discord_webhook' ? discordWebhookPayload(payload) : payload;
  const body = JSON.stringify(transportPayload);
  const stream = `notifications/${request.resource.canonicalId}`;
  const requestKey = deliveryRecordKey(request.idempotencyKey, 'request');
  await records.append(stream, requestKey, {
    schemaVersion: 'notification-delivery-request.v1',
    idempotencyKey: request.idempotencyKey,
    target: request.resource.canonicalId,
    payload: transportPayload,
  });
  const prior = await records.read<Readonly<Record<string, unknown>>>(stream);
  const completed = completedReceipt(prior, request.idempotencyKey);
  if (completed) return completed;
  const terminalKey = terminalRecordKey(
    request.idempotencyKey,
    request.attempt.attemptId,
    request.attempt.attemptNumber,
  );
  const existingTerminal = prior.find((entry) => entry.idempotencyKey === terminalKey);
  const reservation = existingTerminal
    ? { appended: false, record: existingTerminal }
    : await records.append<Readonly<Record<string, unknown>>>(stream, terminalKey, {
      schemaVersion: 'notification-delivery-reservation.v1',
      attempt: request.attempt,
      reserved: ' '.repeat(TERMINAL_RESERVATION_BYTES),
    });
  if (!reservation.appended) {
    if (reservation.record.payload.schemaVersion === 'notification-delivery-receipt.v1') {
      return reservation.record.payload.receipt as Readonly<Record<string, unknown>>;
    }
    if (reservation.record.payload.schemaVersion === 'notification-delivery-failure.v1') {
      throw new Error(String(reservation.record.payload.error));
    }
  }
  try {
    const secretName = target.endpointSecret ?? target.tokenSecret;
    if (!secretName) throw new Error('OPERATOR_SECRET_UNAVAILABLE');
    const resolved = await context.invoke('secrets.read', { operation: 'resolve', resource: { type: 'secret.name', canonicalId: secretName }, payload: {} });
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const secret = secretValue(resolved);
    const endpoint = resolveSecretEndpoint(secret, target);
    const signature = crypto.createHmac('sha256', secret).update(`${request.idempotencyKey}.${body}`, 'utf8').digest('hex');
    const networkRequest = { operation: 'request', resource: { type: 'network.url', canonicalId: endpoint }, payload: {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': request.idempotencyKey, 'x-kubeclaw-signature': `v1=${signature}` }, body: transportPayload,
    } };
    const response = target.endpointSecret
      ? await context.invokeConfidential('network.http', networkRequest)
      : await context.invoke('network.http', networkRequest);
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) throw new Error('OPERATOR_DELIVERY_INVALID_RESPONSE');
    const messageId = responseMessageId(response);
    const receipt = Object.freeze({ accepted: true, target: request.resource.canonicalId, status: Number(response.status), ...(messageId ? { messageId } : {}) });
    try {
      const committed = await records.transition(stream, terminalKey, reservation.record.payloadDigest, {
        schemaVersion: 'notification-delivery-receipt.v1',
        attempt: request.attempt,
        receipt,
      });
      return committed.payload.receipt as Readonly<Record<string, unknown>>;
    } catch (error) {
      if (error instanceof Error && error.message === 'DURABLE_RECORD_TRANSITION_CONFLICT') {
        const current = await records.read<Readonly<Record<string, unknown>>>(stream);
        const accepted = completedReceipt(current, request.idempotencyKey);
        if (accepted) return accepted;
        const terminal = current.find((entry) => entry.idempotencyKey === terminalKey);
        if (terminal) {
          const reconciled = await records.transition(stream, terminalKey, terminal.payloadDigest, {
            schemaVersion: 'notification-delivery-receipt.v1',
            attempt: request.attempt,
            receipt,
          });
          return reconciled.payload.receipt as Readonly<Record<string, unknown>>;
        }
      }
      throw error;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const reasonId = crypto.createHash('sha256').update(reason).digest('hex').slice(0, 16);
    const boundedReason = reason.slice(0, 2_048);
    try {
      await records.transition(stream, terminalKey, reservation.record.payloadDigest, {
        schemaVersion: 'notification-delivery-failure.v1',
        idempotencyKey: request.idempotencyKey,
        target: request.resource.canonicalId,
        attempt: request.attempt,
        reasonId,
        error: boundedReason,
      });
    } catch (transitionError) {
      if (transitionError instanceof Error && transitionError.message === 'DURABLE_RECORD_TRANSITION_CONFLICT') {
        const accepted = completedReceipt(
          await records.read<Readonly<Record<string, unknown>>>(stream),
          request.idempotencyKey,
        );
        if (accepted) return accepted;
      }
      throw transitionError;
    }
    throw error;
  }
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
    async shutdown() { shuttingDown = true; },
  };
}
