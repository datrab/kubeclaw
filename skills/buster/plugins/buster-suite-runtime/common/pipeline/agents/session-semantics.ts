import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
export const ACP_MONITOR_REASONS = Object.freeze({
  RATE_LIMITED: 'rate_limited',
  TRANSCRIPT_ERROR: 'transcript_error',
  SESSION_TERMINAL: 'session_terminal',
  STALE_STATUS_TIMEOUT: 'stale_status_timeout',
});

function normalizeSessionState(state: any) {
  const normalized = String(selectDefinedValue(() => (state), () => (''))).toLowerCase();
  if (/^(failed|failure|errored|aborted|cancelled|canceled)$/.test(normalized)) return 'error';
  if (/^(succeeded|success)$/.test(normalized)) return 'completed';
  return normalized;
}

function firstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function textLooksRateLimited(text: any) {
  if (!text) return false;
  return /rate limit|rate-limit|429|too many requests|retry after|quota exceeded|usage limit|usage-limit|usage cap|usage quota|quota limit/i.test(String(text));
}

function statusRateLimited(statusResult: any) {
  const reason = firstString(
    statusResult?.data?.fallbackStepFromFailureReason,
    statusResult?.fallbackStepFromFailureReason,
    statusResult?.failureReason,
    statusResult?.reason,
  );
  if (reason === 'rate_limit') return true;
  return textLooksRateLimited(statusDetail(statusResult));
}

function isErrorSessionState(state: any) {
  return normalizeSessionState(state) === 'error';
}

function statusDetail(statusResult: any) {
  return firstString(
    statusResult?.data?.promptError,
    statusResult?.promptError,
    statusResult?.data?.fallbackStepFromFailureDetail,
    statusResult?.fallbackStepFromFailureDetail,
    statusResult?.error?.message,
    statusResult?.message,
    statusResult?.detail,
    statusResult?.reason,
    statusResult?.statusText,
    statusResult?.raw,
  );
}

function parsedSessionState(active: boolean, state: string, detail: string | null, statusResult: any) {
  return {
    active,
    state,
    detail,
    rateLimited: !active && isErrorSessionState(state) && statusRateLimited(statusResult),
  };
}

function parseStatusText(statusText: string, detail: string | null, statusResult: any) {
  const failure = statusText.match(/\b(error|failed|failure|errored|aborted|cancelled|canceled)\b/i);
  if (failure) return parsedSessionState(false, normalizeSessionState(failure[1]), detail, statusResult);
  if (/\bclosed\b/i.test(statusText)) return parsedSessionState(false, 'closed', detail, statusResult);
  if (/Tasks:\s*\d+\s+active\b/i.test(statusText)) return parsedSessionState(true, 'running', detail, statusResult);
  if (/Tasks:\s*(?:\d+\s+)?(?:latest\s+)?(?:succeeded|completed|finished)\b/i.test(statusText)) {
    return parsedSessionState(false, 'completed', detail, statusResult);
  }
  if (/Tasks:\s*(?:\d+\s+)?(?:(?:latest|recent)\s+)?(?:failed|failure|errored|aborted|cancelled|canceled)\b/i.test(statusText)) {
    return parsedSessionState(false, 'error', detail, statusResult);
  }
  if (/Queue:\s*running/i.test(statusText)) return parsedSessionState(true, 'running', detail, statusResult);
  if (/Queue:\s*(?:collect|steer)\b/i.test(statusText)) return parsedSessionState(false, 'idle', detail, statusResult);
  return parsedSessionState(false, `status_unparsed (${statusText.slice(0, 80)})`, detail, statusResult);
}

export function parseSessionState(statusResult: any): { active: boolean; state: string; detail: string | null; rateLimited: boolean } {
  if (!statusResult) return { active: false, state: 'status_missing', detail: null, rateLimited: false };

  const detail = statusDetail(statusResult);
  const acpState = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (statusResult?.acp?.state), () => (statusResult?.state))), () => (statusResult?.status))), () => (null));
  if (acpState) {
    const active = /^(running|creating|cancelling)$/i.test(acpState);
    const state = normalizeSessionState(acpState);
    return parsedSessionState(active, state, detail, statusResult);
  }

  const statusText = selectDefinedValue(() => (selectDefinedValue(() => (statusResult?.statusText), () => (statusResult?.raw))), () => (''));
  if (statusText) return parseStatusText(String(statusText), detail, statusResult);

  return { active: false, state: 'status_missing', detail, rateLimited: false };
}

export function isSessionTerminalState(state: any) {
  return /^(closed|error|done|completed|finished|stopped)$/i.test(String(selectDefinedValue(() => (state), () => (''))));
}

export function isStoppedSessionState(state: any) {
  return /^(closed|error|idle|done|completed|finished|stopped|no_session_key)$/i.test(String(selectDefinedValue(() => (state), () => (''))));
}

export function isUnreachableSessionState(state: any) {
  return /^(status_missing|status_unparsed(?:\s*\(.*\))?|unreachable|no_session_key)$/i.test(String(selectTruthyValue(() => (state), () => (''))));
}
