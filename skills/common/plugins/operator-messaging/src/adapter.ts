import crypto from 'node:crypto';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation } from '@kubeclaw/plugin-sdk';
import { isTargetId, parseConfig, type TargetConfig } from './config.ts';
import { assertRequest, parsePayload, responseMessageId, secretValue } from './payload.ts';

const COLORS = Object.freeze({ info: 0x3498db, success: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c });
const ICONS = Object.freeze({ info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' });

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

async function deliver(context: AdapterActivationContext, invocation: AdapterInvocation, target: TargetConfig): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal } = invocation;
  const payload = parsePayload(request.payload, target.maxPayloadBytes);
  const transportPayload = target.format === 'discord_webhook' ? discordWebhookPayload(payload) : payload;
  const body = JSON.stringify(transportPayload);
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
  return Object.freeze({ accepted: true, target: request.resource.canonicalId, status: Number(response.status), ...(messageId ? { messageId } : {}) });
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const targets = parseConfig(context.config);
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
      return deliver(context, invocation, target);
    },
    async shutdown() { shuttingDown = true; },
  };
}
