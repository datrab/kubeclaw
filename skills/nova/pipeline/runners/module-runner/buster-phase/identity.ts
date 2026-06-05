import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../../services/correlation.ts';

type AnyRecord = Record<string, any>;

export function resolveCompletionGatewayLabel(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, redisEntry: AnyRecord | null = null) {
  return resolveResultGatewayLabel(redisEntry)
    ?? completionIdentity.gateway_label
    ?? resolveStatusGatewayLabel(statusValue)
    ?? null;
}

export function resolveCompletionDispatchId(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, redisEntry: AnyRecord | null = null) {
  return resolveResultDispatchId(redisEntry)
    ?? completionIdentity.dispatchId
    ?? completionIdentity.dispatch_id
    ?? resolveStatusDispatchId(statusValue)
    ?? null;
}

export function resolveCompletionSessionKey(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, fallbackSessionKey: string | null = null, redisEntry: AnyRecord | null = null) {
  return resolveResultSessionKey(redisEntry)
    ?? fallbackSessionKey
    ?? completionIdentity.sessionKey
    ?? completionIdentity.session_key
    ?? resolveStatusSessionKey(statusValue)
    ?? null;
}

export function resolveExpectedCompletionSessionKey(statusValue: AnyRecord, completionIdentity: AnyRecord = {}, fallbackSessionKey: string | null = null) {
  return resolveStatusSessionKey(statusValue)
    ?? completionIdentity.sessionKey
    ?? completionIdentity.session_key
    ?? fallbackSessionKey
    ?? null;
}
