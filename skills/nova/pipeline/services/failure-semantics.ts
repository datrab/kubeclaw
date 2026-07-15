import { ACP_MONITOR_REASONS, isStoppedSessionState } from '../agents/acp-monitor.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
  CLASSIFICATION_MISSING: 'classification_missing',
});

export const STALE_RECOVERY_ACTIONS = Object.freeze({
  OBSERVED_TERMINAL: 'observed_terminal',
  KILLED_ORPHAN: 'killed_orphan',
  RESET_WITHOUT_SESSION: 'reset_without_session',
});
const TERMINAL_MONITOR_DETAIL = 'terminal';
const ZERO_INACTIVITY_MINUTES = 0;

function textValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function textForMatching(...values) {
  return values.map((value) => selectDefinedValue(() => (textValue(value)), () => (''))).join(' ').trim();
}

function firstTextValue(...values) {
  for (const value of values) {
    const normalized = textValue(value);
    if (normalized) return normalized;
  }
  return null;
}

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

export function normalizeGitFailureClass(reason = '') {
  const value = selectDefinedValue(() => (textValue(reason)), () => (''));
  if (/authentication failed|publickey|permission denied \(publickey\)|could not read.*passphrase/i.test(value)) return 'git_credential_failed';
  if (/\[rejected\]|non-fast-forward|updates were rejected/i.test(value)) return 'git_non_fast_forward';
  if (/GIT_REBASE_CONFLICT|rebase conflict|\bCONFLICT\b|rebase --abort/i.test(value)) return 'git_rebase_conflict';
  if (/git commit failed|pre-commit|commit hook|commit failed/i.test(value)) return 'git_commit_failed';
  if (/network is unreachable|connection (refused|reset)|could not resolve hostname|name or service not known|temporary failure in name resolution|no route to host|timed out/i.test(value)) return 'git_push_unreachable';
  if (/git push (failed|error)|push.*failed.*after.*retr|git sync failed|failed before buster handoff/i.test(value)) return 'git_sync_failed';
  return null;
}

export function normalizeFailureClass(phase, reason = '', opts = {}) {
  const text = textForMatching(
    phase,
    reason,
    opts.failurePattern,
    opts.monitorReason,
    opts.preTestKind,
  );

  const gitFailureClass = normalizeGitFailureClass(text);
  if (gitFailureClass) return gitFailureClass;

  if (opts.isTimeout) {
    return NORMALIZED_FAILURE_CLASSES.TIMEOUT;
  }

  if (opts.monitorReason === ACP_MONITOR_REASONS.STALE_STATUS_TIMEOUT) {
    return NORMALIZED_FAILURE_CLASSES.TIMEOUT;
  }

  if (includesAny(text, TIMEOUT_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.TIMEOUT;
  }

  if (selectTruthyValue(() => (opts.preTestKind === 'infra'), () => (includesAny(text, INFRA_PATTERNS)))) {
    return NORMALIZED_FAILURE_CLASSES.INFRA_ERROR;
  }

  if (selectTruthyValue(() => (opts.preTestKind === 'config'), () => (includesAny(text, VALIDATION_PATTERNS)))) {
    return NORMALIZED_FAILURE_CLASSES.VALIDATION_ERROR;
  }

  if (includesAny(text, TEST_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.TEST_FAILURE;
  }

  if (includesAny(text, FORGE_PATTERNS)) {
    return NORMALIZED_FAILURE_CLASSES.FORGE_ERROR;
  }

  return NORMALIZED_FAILURE_CLASSES.CLASSIFICATION_MISSING;
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
    layer: firstTextValue(layer, FAILURE_LAYERS.INVOCATION),
    code: firstTextValue(code, NORMALIZED_FAILURE_CODES.BACKEND_DISPATCH_FAILED),
    source: firstTextValue(source, FAILURE_SOURCES.BACKEND),
    retryable: retryable === true,
    ...(detail ? { detail } : {}),
    ...rest,
  };
}

export function classifyMonitorFailureFact(monitor = {}, identity = {}) {
  const reason = selectTruthyValue(() => (monitor?.reason), () => (null));
  const detail = {
    monitor_reason: reason,
    session_state: selectTruthyValue(() => (monitor?.sessionState), () => (null)),
    gateway_unreachable: monitor?.gatewayUnreachable === true,
    gateway_detail: selectTruthyValue(() => (monitor?.gatewayDetail), () => (null)),
    transcript_detail: selectTruthyValue(() => (selectTruthyValue(() => (monitor?.transcript?.lastDetail), () => (monitor?.lastDetail))), () => (null)),
    transcript_stale_polls: selectDefinedValue(() => (monitor?.transcriptStalePolls), () => (null)),
    unknown_polls: selectDefinedValue(() => (monitor?.unknownPolls), () => (null)),
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

  if (reason === ACP_MONITOR_REASONS.STALE_STATUS_TIMEOUT) {
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

function monitorStateDefinitivelyStopped(monitor = {}) {
  return ['failed', 'terminal', 'sessionTerminal'].some((field) => monitor?.[field]);
}

export function isDefinitivelyStoppedMonitorState(monitor = {}) {
  return Boolean(
    selectTruthyValue(() => (monitorStateDefinitivelyStopped(monitor)), () => (isStoppedSessionState(selectDefinedValue(() => (textValue(monitor?.sessionState)), () => ('')))))
  );
}

export function buildStaleRecoveryEvidence(monitor = {}, extra = {}) {
  return {
    session_state: selectTruthyValue(() => (monitor?.sessionState), () => (null)),
    monitor_reason: selectTruthyValue(() => (monitor?.reason), () => (null)),
    detail: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (monitor?.lastDetail), () => (monitor?.lastSummary))), () => (monitor?.detail))), () => (null)),
    gateway_unreachable: monitor?.gatewayUnreachable === true,
    gateway_detail: selectTruthyValue(() => (monitor?.gatewayDetail), () => (null)),
    transcript_stale_polls: selectDefinedValue(() => (monitor?.transcriptStalePolls), () => (null)),
    unknown_polls: selectDefinedValue(() => (monitor?.unknownPolls), () => (null)),
    ...extra,
  };
}

export function describeStaleRecovery(previousPhase, action, detail = {}) {
  const phase = selectTruthyValue(() => (previousPhase), () => ('missing_previous_phase'));
  if (action === STALE_RECOVERY_ACTIONS.OBSERVED_TERMINAL) {
    return `Recovered stale ${phase} state after child session ended: ${selectDefinedValue(() => (textValue(detail.detail)), () => (TERMINAL_MONITOR_DETAIL))}`;
  }
  if (action === STALE_RECOVERY_ACTIONS.KILLED_ORPHAN) {
    return `Recovered stale ${phase} state after killing orphaned child session: ${selectTruthyValue(() => (detail.sessionKey), () => ('missing-session'))}`;
  }
  if (action === STALE_RECOVERY_ACTIONS.RESET_WITHOUT_SESSION) {
    return `Recovered stale ${phase} state with no tracked child session after ${selectDefinedValue(() => (detail.inactivityMinutes), () => (ZERO_INACTIVITY_MINUTES))}m of inactivity`;
  }
  return `Recovered stale ${phase} state`;
}
