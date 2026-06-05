export const ACP_MONITOR_REASONS = Object.freeze({
  RATE_LIMITED: 'rate_limited',
  TRANSCRIPT_ERROR: 'transcript_error',
  SESSION_TERMINAL: 'session_terminal',
  UNKNOWN_STALE_TIMEOUT: 'unknown_stale_timeout',
});

function normalizeSessionState(state: any) {
  const normalized = String(state || '').toLowerCase();
  if (/^(failed|failure|errored|aborted|cancelled|canceled)$/.test(normalized)) return 'error';
  if (/^(succeeded|success)$/.test(normalized)) return 'completed';
  return normalized;
}

export function parseSessionState(statusResult: any) {
  if (!statusResult) return { active: false, state: 'unknown' };

  const acpState = statusResult?.acp?.state || statusResult?.state || statusResult?.status || null;
  if (acpState) {
    const active = /^(running|creating|cancelling)$/i.test(acpState);
    return { active, state: normalizeSessionState(acpState) };
  }

  const statusText = statusResult?.statusText || statusResult?.raw || '';
  if (statusText) {
    if (/\b(closed|error)\b/i.test(statusText)) {
      const m = statusText.match(/\b(closed|error)\b/i);
      return { active: false, state: m?.[1]?.toLowerCase() || 'unknown' };
    }
    if (/Tasks:\s*\d+\s+active\b/i.test(statusText)) return { active: true, state: 'running' };
    if (/Tasks:\s*(?:\d+\s+)?(?:latest\s+)?(?:succeeded|completed|finished)\b/i.test(statusText)) return { active: false, state: 'completed' };
    if (/Tasks:\s*(?:\d+\s+)?(?:(?:latest|recent)\s+)?(?:failed|failure|errored|aborted|cancelled|canceled)\b/i.test(statusText)) return { active: false, state: 'error' };
    if (/Queue:\s*running/i.test(statusText)) return { active: true, state: 'running' };
    if (/Queue:\s*(?:collect|steer)\b/i.test(statusText)) return { active: false, state: 'idle' };
    return { active: false, state: `unknown (${statusText.slice(0, 80)})` };
  }

  return { active: false, state: 'unknown' };
}

export function isSessionTerminalState(state: any) {
  return /^(closed|error|done|completed|finished|stopped)$/i.test(String(state || ''));
}

export function isStoppedSessionState(state: any) {
  return /^(closed|error|idle|done|completed|finished|stopped|no_session_key)$/i.test(String(state || ''));
}

export function isUnreachableSessionState(state: any) {
  return /^(unknown(?:\s*\(.*\))?|unreachable|no_session_key)$/i.test(String(state || ''));
}
