import { ACP_MONITOR_REASONS, isStoppedSessionState } from '../../../common/pipeline/agents/acp-monitor.js';

export const FAILURE_LAYERS = Object.freeze({
  LOAD: 'load',
  INVOCATION: 'invocation',
  SEMANTIC: 'semantic',
  CORE: 'core',
});

export const FAILURE_SOURCES = Object.freeze({
  PLUGIN: 'plugin',
  BACKEND: 'backend',
  CORE: 'core',
});

export const NORMALIZED_FAILURE_CODES = Object.freeze({
  LOAD_REJECTED: 'LOAD_REJECTED',
  CONTRACT_INVALID: 'CONTRACT_INVALID',
  CAPABILITY_DENIED: 'CAPABILITY_DENIED',
  OWNERSHIP_CONFLICT: 'OWNERSHIP_CONFLICT',
  PLUGIN_THROWN: 'PLUGIN_THROWN',
  PLUGIN_TIMEOUT: 'PLUGIN_TIMEOUT',
  PLUGIN_CANCELLED: 'PLUGIN_CANCELLED',
  PLUGIN_RESULT_INVALID: 'PLUGIN_RESULT_INVALID',
  BACKEND_DISPATCH_FAILED: 'BACKEND_DISPATCH_FAILED',
  BACKEND_TIMEOUT: 'BACKEND_TIMEOUT',
  BACKEND_RATE_LIMITED: 'BACKEND_RATE_LIMITED',
  BACKEND_PAYLOAD_CORRUPTED: 'BACKEND_PAYLOAD_CORRUPTED',
  SEMANTIC_FAIL: 'SEMANTIC_FAIL',
  SEMANTIC_BLOCK: 'SEMANTIC_BLOCK',
  POLICY_BLOCKED: 'POLICY_BLOCKED',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  STALE_RECOVERY_REQUIRED: 'STALE_RECOVERY_REQUIRED',
  STALE_RECOVERY_FAILED: 'STALE_RECOVERY_FAILED',
  CORE_STORE_FAILED: 'CORE_STORE_FAILED',
  CORE_TRANSITION_REJECTED: 'CORE_TRANSITION_REJECTED',
});

export const NORMALIZED_FAILURE_CLASSES = Object.freeze({
  FORGE_ERROR: 'forge_error',
  VALIDATION_ERROR: 'validation_error',
  TEST_FAILURE: 'test_failure',
  INFRA_ERROR: 'infra_error',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
});

export const STALE_RECOVERY_ACTIONS = Object.freeze({
  OBSERVED_TERMINAL: 'observed_terminal',
  KILLED_ORPHAN: 'killed_orphan',
  RESET_WITHOUT_SESSION: 'reset_without_session',
});

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const TIMEOUT_PATTERNS = [
  /\btimeout\b/i,
  /timed? out/i,
  /unknown[_ -]?stale[_ -]?timeout/i,
];

const VALIDATION_PATTERNS = [
  /\blint\b/i,
  /pre[ _-]?check/i,
  /validation/i,
  /progress\.json/i,
  /test_config/i,
  /test_suites/i,
  /delivery[_ -]?lint/i,
  /output file missing/i,
];

const INFRA_PATTERNS = [
  /\bgateway\b/i,
  /\bsession\b/i,
  /\bredis\b/i,
  /\binfra\b/i,
  /\brate.?limit/i,
  /registry/i,
  /podman/i,
  /docker/i,
  /network/i,
  /image pull/i,
  /image not known/i,
  /address already in use/i,
  /eaddrinuse/i,
  /stale recovery/i,
  /orphan/i,
  /payload/i,
  /parse error/i,
  /invalid json/i,
  /malformed/i,
  /corrupted/i,
  /git sync failed/i,
  /git push failed/i,
  /push rejected/i,
  /non-fast-forward/i,
];

const TEST_PATTERNS = [
  /\btest\b/i,
  /\bsuite\b/i,
  /buster\/pre-test/i,
  /pre-test/i,
];

const FORGE_PATTERNS = [
  /\bforge\b/i,
  /error ts\d+/i,
  /typescript/i,
  /build output/i,
  /artifact/i,
  /expected output/i,
];

export function normalizeFailureClass(phase, reason = '', opts = {}) {
  const text = [
    phase || '',
    reason || '',
    opts.failurePattern || '',
    opts.monitorReason || '',
    opts.preTestKind || '',
  ].join(' ').trim();

  if (opts.isTimeout || opts.monitorReason === ACP_MONITOR_REASONS.UNKNOWN_STALE_TIMEOUT || includesAny(text, TIMEOUT_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.TIMEOUT;
  }

  if (opts.preTestKind === 'infra' || includesAny(text, INFRA_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.INFRA_ERROR;
  }

  if (opts.preTestKind === 'config' || includesAny(text, VALIDATION_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.VALIDATION_ERROR;
  }

  if (includesAny(text, TEST_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.TEST_FAILURE;
  }

  if (includesAny(text, FORGE_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.FORGE_ERROR;
  }

  return NORMALIZED_FAILURE_CLASSES.UNKNOWN;
}

export function buildFailureFact({
  layer,
  code,
  source,
  retryable,
  detail = null,
  ...rest
} = {}) {
  return {
    layer: layer || FAILURE_LAYERS.INVOCATION,
    code: code || NORMALIZED_FAILURE_CODES.BACKEND_DISPATCH_FAILED,
    source: source || FAILURE_SOURCES.BACKEND,
    retryable: retryable === true,
    ...(detail ? { detail } : {}),
    ...rest,
  };
}

export function classifyMonitorFailureFact(monitor = {}, identity = {}) {
  const reason = monitor?.reason || null;
  const detail = {
    monitor_reason: reason,
    session_state: monitor?.sessionState || null,
    gateway_unreachable: monitor?.gatewayUnreachable === true,
    gateway_detail: monitor?.gatewayDetail || null,
    transcript_detail: monitor?.transcript?.lastDetail || monitor?.lastDetail || null,
    transcript_stale_polls: monitor?.transcriptStalePolls ?? null,
    unknown_polls: monitor?.unknownPolls ?? null,
  };

  if (reason === ACP_MONITOR_REASONS.RATE_LIMITED) {
    return buildFailureFact({
      layer: FAILURE_LAYERS.INVOCATION,
      code: NORMALIZED_FAILURE_CODES.BACKEND_RATE_LIMITED,
      source: FAILURE_SOURCES.BACKEND,
      retryable: true,
      detail,
      ...identity,
    });
  }

  if (reason === ACP_MONITOR_REASONS.UNKNOWN_STALE_TIMEOUT) {
    return buildFailureFact({
      layer: FAILURE_LAYERS.INVOCATION,
      code: NORMALIZED_FAILURE_CODES.BACKEND_TIMEOUT,
      source: FAILURE_SOURCES.BACKEND,
      retryable: true,
      detail,
      ...identity,
    });
  }

  if (reason === ACP_MONITOR_REASONS.TRANSCRIPT_ERROR) {
    return buildFailureFact({
      layer: FAILURE_LAYERS.INVOCATION,
      code: NORMALIZED_FAILURE_CODES.BACKEND_DISPATCH_FAILED,
      source: FAILURE_SOURCES.BACKEND,
      retryable: true,
      detail,
      ...identity,
    });
  }

  if (reason === ACP_MONITOR_REASONS.SESSION_TERMINAL) {
    return buildFailureFact({
      layer: FAILURE_LAYERS.INVOCATION,
      code: NORMALIZED_FAILURE_CODES.BACKEND_DISPATCH_FAILED,
      source: FAILURE_SOURCES.BACKEND,
      retryable: false,
      detail,
      ...identity,
    });
  }

  return null;
}

export function isDefinitivelyStoppedMonitorState(monitor = {}) {
  return Boolean(
    monitor?.failed
    || monitor?.terminal
    || monitor?.sessionTerminal
    || isStoppedSessionState(monitor?.sessionState || '')
  );
}

export function buildStaleRecoveryEvidence(monitor = {}, extra = {}) {
  return {
    session_state: monitor?.sessionState || null,
    monitor_reason: monitor?.reason || null,
    detail: monitor?.lastDetail || monitor?.lastSummary || monitor?.detail || null,
    gateway_unreachable: monitor?.gatewayUnreachable === true,
    gateway_detail: monitor?.gatewayDetail || null,
    transcript_stale_polls: monitor?.transcriptStalePolls ?? null,
    unknown_polls: monitor?.unknownPolls ?? null,
    ...extra,
  };
}

export function describeStaleRecovery(previousPhase, action, detail = {}) {
  const phase = previousPhase || 'unknown';
  if (action === STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL) {
    return `Recovered stale ${phase} state after child session ended: ${detail.detail || 'terminal'}`;
  }
  if (action === STALE_RECOVERY_ACTIONS.KILLED_ORPHAN) {
    return `Recovered stale ${phase} state after killing orphaned child session: ${detail.sessionKey || 'unknown-session'}`;
  }
  if (action === STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION) {
    return `Recovered stale ${phase} state with no tracked child session after ${detail.inactivityMinutes ?? 0}m of inactivity`;
  }
  return `Recovered stale ${phase} state`;
}
