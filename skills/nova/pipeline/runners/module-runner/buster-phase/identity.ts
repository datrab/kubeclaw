import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../../services/correlation.ts';

type AnyRecord = Record<string, any>;

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function requireText(value: unknown, field: string): string {
  const normalized = textValue(value);
  if (!normalized) throw new Error(`${field}: required non-empty string`);
  return normalized;
}

export function resolveCompletionGatewayLabel(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, redisEntry: AnyRecord | null = null) {
  const redisGatewayLabel = resolveResultGatewayLabel(redisEntry);
  if (redisGatewayLabel !== null) return requireText(redisGatewayLabel, 'redisEntry.gateway_label');
  return requireText(completionIdentity.gateway_label, 'completionIdentity.gateway_label');
}

export function resolveCompletionDispatchId(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, redisEntry: AnyRecord | null = null) {
  const redisDispatchId = resolveResultDispatchId(redisEntry);
  if (redisDispatchId !== null) return requireText(redisDispatchId, 'redisEntry.dispatch_id');
  return requireText(completionIdentity.dispatchId, 'completionIdentity.dispatchId');
}

export function resolveCompletionSessionKey(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, fallbackSessionKey: string | null = null, redisEntry: AnyRecord | null = null) {
  const redisSessionKey = resolveResultSessionKey(redisEntry);
  if (redisSessionKey !== null) return requireText(redisSessionKey, 'redisEntry.session_key');
  if (fallbackSessionKey !== null) return requireText(fallbackSessionKey, 'fallbackSessionKey');
  return textValue(completionIdentity.sessionKey);
}

export function resolveExpectedCompletionSessionKey(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, fallbackSessionKey: string | null = null) {
  if (completionIdentity.sessionKey !== undefined) return requireText(completionIdentity.sessionKey, 'completionIdentity.sessionKey');
  if (fallbackSessionKey !== null) return requireText(fallbackSessionKey, 'fallbackSessionKey');
  return textValue(resolveStatusSessionKey(statusValue));
}
