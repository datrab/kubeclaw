export const ACP_MONITOR_REASONS = Object.freeze({
  RATE_LIMITED: 'rate_limited',
  TRANSCRIPT_ERROR: 'transcript_error',
  SESSION_TERMINAL: 'session_terminal',
  UNKNOWN_STALE_TIMEOUT: 'unknown_stale_timeout',
});

export function isSessionTerminalState(state) {
  return /^(closed|error|done|completed|finished|stopped)$/i.test(String(state || ''));
}

export function isStoppedSessionState(state) {
  return /^(closed|error|idle|done|completed|finished|stopped|no_session_key)$/i.test(String(state || ''));
}

export function isUnreachableSessionState(state) {
  return /^(unknown|unreachable|no_session_key)$/i.test(String(state || ''));
}
