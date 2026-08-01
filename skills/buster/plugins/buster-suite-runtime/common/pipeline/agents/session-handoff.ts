import { sendGatewaySessionMessage } from '../integrations/gateway.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
type SessionMessageSender = (sessionKey: string, message: string, timeoutMs: number, opts?: AnyRecord) => Promise<any>;
type ReceiptLayers = {
  deliveryResult: AnyRecord;
  result: AnyRecord;
  details: AnyRecord;
  delivery: AnyRecord;
  response: AnyRecord;
};

export const AGENT_SESSION_HANDOFF_SURFACE = 'gateway_sessions_send';

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstString(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function recordValue(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

function receiptLayers(value: unknown): ReceiptLayers {
  const deliveryResult = recordValue(value);
  const result = recordValue(firstDefined(deliveryResult.result, deliveryResult));
  const details = recordValue(firstDefined(result.details, deliveryResult.details));
  const delivery = recordValue(firstDefined(details.delivery, result.delivery, deliveryResult.delivery));
  const response = recordValue(firstDefined(details.response, result.response, deliveryResult.response));
  return { deliveryResult, result, details, delivery, response };
}

function receiptStatus({ deliveryResult, result, details, delivery }: ReceiptLayers): string {
  return normalizeDeliveryStatus(firstDefined(
    delivery.status,
    recordValue(details.deliveryStatus).status,
    recordValue(result.deliveryStatus).status,
    details.status,
    result.status,
    deliveryResult.status,
  ));
}

function normalizeDeliveryStatus(value: any) {
  return String(selectDefinedValue(() => (value), () => ('unknown'))).trim().toLowerCase();
}

function deliveryAcknowledged(status: string) {
  return /^(sent|delivered|accepted|queued|enqueued|pending|completed|ok)$/.test(status);
}

export function normalizeAgentSessionTarget(target: any, {
  defaultAgent = 'main',
  defaultChannel = 'discord',
}: AnyRecord = {}) {
  const text = String(firstDefined(target, '')).trim();
  if (!text) return null;
  if (text.startsWith('agent:')) return text;
  const channelId = text.startsWith('channel:') ? text.slice('channel:'.length) : text;
  if (!channelId.trim()) return null;
  return `agent:${defaultAgent}:${defaultChannel}:channel:${channelId.trim()}`;
}

export function normalizeAgentSessionHandoffReceipt(deliveryResult: any) {
  const layers = receiptLayers(deliveryResult);
  const { result, details, delivery, response } = layers;
  const status = receiptStatus(layers);
  const sessionKey = firstString(
    details.sessionKey,
    details.session_key,
    result.sessionKey,
    result.session_key,
    delivery.sessionKey,
    delivery.session_key,
    layers.deliveryResult.sessionKey,
    layers.deliveryResult.session_key,
  );
  const turnId = firstString(
    details.turnId,
    details.turn_id,
    result.turnId,
    result.turn_id,
    delivery.turnId,
    delivery.turn_id,
    response.turnId,
    response.turn_id,
  );
  const responseStatus = firstString(
    response.status,
    details.responseStatus,
    details.response_status,
    result.responseStatus,
    result.response_status,
  );
  const runId = firstString(
    details.runId,
    details.run_id,
    result.runId,
    result.run_id,
    layers.deliveryResult.runId,
    layers.deliveryResult.run_id,
  );
  const acknowledged = deliveryAcknowledged(status);
  return {
    acknowledged,
    delivery_status: acknowledged ? 'gateway_sessions_send_delivered' : 'gateway_sessions_send_receipt_missing',
    raw_delivery_status: status,
    gateway_run_id: runId,
    session_key: sessionKey,
    turn_id: turnId,
    response_status: responseStatus,
  };
}

export async function sendAgentSessionHandoff({
  sessionKey,
  message,
  timeoutMs,
  policy = {},
  sendSessionMessage = sendGatewaySessionMessage,
}: {
  sessionKey: string;
  message: string;
  timeoutMs: number;
  policy?: AnyRecord;
  sendSessionMessage?: SessionMessageSender;
}) {
  if (!sessionKey) {
    throw new Error('Agent session handoff requires a target session key');
  }
  if (!String(sessionKey).trim()) {
    throw new Error('Agent session handoff requires a target session key');
  }
  if (!message) {
    throw new Error('Agent session handoff requires a message');
  }
  if (!String(message).trim()) {
    throw new Error('Agent session handoff requires a message');
  }
  const result = await sendSessionMessage(String(sessionKey), String(message), timeoutMs, {
    ...policy,
    sessionSendArgs: {
      ...(policy?.sessionSendArgs && typeof policy.sessionSendArgs === 'object' ? policy.sessionSendArgs : {}),
      timeoutSeconds: selectTruthyValue(() => (policy?.timeoutSeconds), () => (0)),
    },
  });
  return {
    delivery_surface: AGENT_SESSION_HANDOFF_SURFACE,
    ...normalizeAgentSessionHandoffReceipt(result),
  };
}
