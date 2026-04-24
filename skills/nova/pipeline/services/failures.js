import fs from 'fs';
import path from 'path';
import { log, getActiveContext } from '../core/logger.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { formatRateLimitEmbed as formatSharedRateLimitEmbed } from '../../../common/pipeline/services/rate-limit-contract.js';
import { saveStatus } from './status-store.js';
import { discord } from '../integrations/discord.js';
import { gatewayInvoke } from '../../../common/pipeline/integrations/gateway.js';
import { onModuleBlocked, onModuleFail, onRetryExhausted } from './telemetry.js';
import { markModuleBlocked, transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from './discord-fields.js';
import { getPipelineArtifactBundle } from './artifact-bundle.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultAttempt,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
  resolveResultGateType,
} from './correlation.js';
import {
  FAILURE_LAYERS,
  FAILURE_SOURCES,
  NORMALIZED_FAILURE_CODES,
  NORMALIZED_FAILURE_CLASSES,
  STALE_RECOVERY_ACTIONS,
  normalizeFailureClass,
  buildFailureFact,
  classifyMonitorFailureFact,
  isDefinitivelyStoppedMonitorState,
  buildStaleRecoveryEvidence,
  describeStaleRecovery,
} from './failure-semantics.js';

const EXIT_NEEDS_NOVA = 10;
const EXIT_BLOCKED = 20;
const EXIT_TIMEOUT = 30;

const STATUS = {
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
};

function telemetryCtx(config) {
  return getActiveContext() || { config, runId: getRunId(config) || config?.run_id || config?._runId || '' };
}

function reportFailureSurfaceIncident(config, classification, error, message, options = {}) {
  const resolvedConfig = config || {};
  reportClassifiedNonBlockingError({
    log,
    reporter: 'failures',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'failures',
      resolvedConfig?.project || 'unknown',
      getRunId(resolvedConfig) || resolvedConfig?.run_id || resolvedConfig?._runId || 'unknown',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    level: options.level || 'DEBUG',
  });
}

function computeElapsedSeconds(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return null;
  const delta = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Number.isFinite(delta) ? Math.max(0, Math.round(delta / 1000)) : null;
}

function buildFailureDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.MODULE_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.PHASE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
    DISCORD_FIELD_SPECS.STEP_TYPE,
    DISCORD_FIELD_SPECS.STEP_ID,
  ], extra);
}

function buildModuleFailureTelemetry(status, phase, reason, oldStatus, opts = {}) {
  const startedAt = status?.phase_started_at || status?.attempt_started_at || status?.started_at || null;
  return {
    title: status?.title || opts.moduleTitle || null,
    old_status: oldStatus || null,
    attempt: status?.fail_count ?? null,
    dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
    gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
    phase: phase || status?.current_phase || null,
    model: opts.model ?? status?.active_agent?.model ?? null,
    duration_seconds: computeElapsedSeconds(startedAt),
    cost_estimate_usd: null,
    session_key: resolveStatusSessionKey(status, opts.session_key),
    commit_hash: status?.commit_hash || status?.forge_commit_hash || status?.buster_commit_hash || status?.forge_commit || status?.buster_commit || null,
    failure_class: normalizeFailureClass(phase || status?.current_phase || null, reason, {
      isTimeout: opts.isTimeout === true,
      monitorReason: opts.monitorReason || null,
    }),
    reason: reason || null,
  };
}

function buildFullPipelineResumeCommand(config, promptPlaceholder = null) {
  const base = `node pipeline.js --project ${config.project} --resume`;
  return promptPlaceholder ? `${base} --prompt ${promptPlaceholder}` : base;
}

export const FAIL_PATTERNS = {
  BUSTER_IMAGE_UNAVAILABLE: 'BUSTER_IMAGE_UNAVAILABLE',
  BUSTER_PORT_CONFLICT: 'BUSTER_PORT_CONFLICT',
  BLUEPRINT_ALREADY_RELEASED: 'BLUEPRINT_ALREADY_RELEASED',
  FORGE_TS_COMPILE_ERROR: 'FORGE_TS_COMPILE_ERROR',
  GIT_REBASE_CONFLICT: 'GIT_REBASE_CONFLICT',
  GIT_SYNC_FAILED: 'GIT_SYNC_FAILED',
  GIT_PUSH_REJECTED: 'GIT_PUSH_REJECTED',
  GIT_PUSH_FAILED: 'GIT_PUSH_FAILED',
  BUILD_OUTPUT_EMPTY: 'BUILD_OUTPUT_EMPTY',
  HEALTH_CHECK_TIMEOUT: 'HEALTH_CHECK_TIMEOUT',
  SESSION_NO_CHANGES: 'SESSION_NO_CHANGES',
  PAYLOAD_CORRUPTED: 'PAYLOAD_CORRUPTED',
  RATE_LIMIT_EXHAUSTED: 'RATE_LIMIT_EXHAUSTED',
  OUTPUT_FILE_MISSING: 'OUTPUT_FILE_MISSING',
  MODULE_ORPHANED: 'MODULE_ORPHANED',
  UNKNOWN: 'unknown',
};

export {
  FAILURE_LAYERS,
  FAILURE_SOURCES,
  NORMALIZED_FAILURE_CODES,
  NORMALIZED_FAILURE_CLASSES,
  STALE_RECOVERY_ACTIONS,
  normalizeFailureClass,
  buildFailureFact,
  classifyMonitorFailureFact,
  isDefinitivelyStoppedMonitorState,
  buildStaleRecoveryEvidence,
  describeStaleRecovery,
};

/**
 * Structured metadata for each failure pattern.
 * class: broad grouping (build, health, session, git, infra, payload)
 * recoverability: 'retry' | 'needs_nova' | 'blocked'
 * escalation: pipeline action when retry budget is exhausted
 * guidance: operator-facing action to take
 */
export const FAILURE_CLASS_MAP = {
  BUSTER_IMAGE_UNAVAILABLE: {
    class: 'infra', recoverability: 'blocked',
    escalation: 'BLOCKED',
    summary: 'Buster container image unavailable',
    guidance: 'Verify the Buster image name and registry. The image must be present on the Docker host before the pipeline can run.',
  },
  BUSTER_PORT_CONFLICT: {
    class: 'infra', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Port already in use when starting Buster',
    guidance: 'A previous container may still be running. Check for lingering processes on the expected port and stop them before retrying.',
  },
  BLUEPRINT_ALREADY_RELEASED: {
    class: 'git', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Blueprint already committed — nothing to release',
    guidance: 'The module blueprint was already committed. Either the module ran twice or state is out of sync. Check git log and status.json before resuming.',
  },
  FORGE_TS_COMPILE_ERROR: {
    class: 'build', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'TypeScript compile error in Forge output',
    guidance: 'Fix the TypeScript errors identified in the failure summary before retrying. Check type annotations and exported member names.',
  },
  GIT_REBASE_CONFLICT: {
    class: 'git', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Git rebase conflict on non-runtime files',
    guidance: 'Rebase conflicts on source files cannot be auto-resolved. Run `git rebase --abort` then resolve conflicts manually and resume the pipeline.',
  },
  GIT_SYNC_FAILED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git sync failed before Buster handoff',
    guidance: 'Check network connectivity and remote repository access. If the repo is in a bad state, inspect `git status` and `git log` before resuming.',
  },
  GIT_PUSH_REJECTED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git push rejected by remote (non-fast-forward)',
    guidance: 'A concurrent push created divergence. Pull and rebase local commits, then retry. Do not force-push — diverged commits may contain other pipeline work.',
  },
  GIT_PUSH_FAILED: {
    class: 'git', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Git push failed (network or auth)',
    guidance: 'Check SSH key configuration, network connectivity, and remote availability. Transient failures will auto-retry; persistent failures require operator intervention.',
  },
  BUILD_OUTPUT_EMPTY: {
    class: 'build', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Build output empty or expected artifact missing',
    guidance: 'The build ran but produced no output at the expected artifact path. Verify the build command, output directory configuration, and that Forge committed the artifact.',
  },
  HEALTH_CHECK_TIMEOUT: {
    class: 'health', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Health check timed out — service never became healthy',
    guidance: 'The container started but the health endpoint did not respond within the timeout. Check container logs for startup errors and increase the health check timeout if the service is legitimately slow to start.',
  },
  SESSION_NO_CHANGES: {
    class: 'session', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Session ended without producing changes',
    guidance: 'The agent session terminated with no file output. This may indicate the agent misread its instructions or hit a silent error. Review transcript and provide a clearer prompt before retrying.',
  },
  PAYLOAD_CORRUPTED: {
    class: 'payload', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Corrupted or unparseable status/completion payload',
    guidance: 'A status.json or completion payload could not be parsed. Check the raw file for truncation or encoding issues. The pipeline will retry; repeated occurrences indicate a systemic serialization bug.',
  },
  RATE_LIMIT_EXHAUSTED: {
    class: 'infra', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Rate limit exhausted — recovery attempts failed',
    guidance: 'The pipeline exhausted its rate-limit recovery budget. Wait for quota to reset before resuming, or switch to a different API key / model tier.',
  },
  OUTPUT_FILE_MISSING: {
    class: 'artifact', recoverability: 'retry',
    escalation: 'NEEDS_NOVA',
    summary: 'Expected output file missing after gate or review',
    guidance: 'A required output file was not produced after the gate or review step. Verify the gate configuration and that the agent wrote the output to the declared path.',
  },
  MODULE_ORPHANED: {
    class: 'pipeline', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Module blocked with no reason — likely orphaned',
    guidance: 'The module was marked BLOCKED but no failure reason was recorded. Inspect status.json and pipeline logs to determine the root cause before resuming.',
  },
  unknown: {
    class: 'unknown', recoverability: 'needs_nova',
    escalation: 'NEEDS_NOVA',
    summary: 'Unclassified failure',
    guidance: 'The failure could not be classified. Review the full failure summary and pipeline logs to identify the root cause.',
  },
};

/**
 * Return structured metadata for a failure pattern code.
 * Always returns a record — falls back to the 'unknown' entry if code not found.
 * @param {string} code - A FAIL_PATTERNS value
 * @returns {{ class: string, recoverability: string, escalation: string, summary: string, guidance: string }}
 */
export function describeFailure(code) {
  return FAILURE_CLASS_MAP[code] || FAILURE_CLASS_MAP[FAIL_PATTERNS.UNKNOWN];
}

export function classifyFailPattern(text) {
  const value = String(text || '');
  if (!value.trim()) return undefined;

  if (/image not known|image pull|no such image/i.test(value)) return FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE;
  if (/address already in use|eaddrinuse|errno 98/i.test(value)) return FAIL_PATTERNS.BUSTER_PORT_CONFLICT;
  if (/nothing to commit|nothing added to commit/i.test(value)) return FAIL_PATTERNS.BLUEPRINT_ALREADY_RELEASED;
  if (/error TS\d+|is not assignable|has no exported member|declared but never read/i.test(value)) return FAIL_PATTERNS.FORGE_TS_COMPILE_ERROR;
  if (/rebase conflict|\bCONFLICT\b|rebase --abort/i.test(value)) return FAIL_PATTERNS.GIT_REBASE_CONFLICT;
  if (/git sync failed|failed before buster handoff/i.test(value)) return FAIL_PATTERNS.GIT_SYNC_FAILED;
  if (/\[rejected\]|non-fast-forward|push.*rejected|updates were rejected/i.test(value)) return FAIL_PATTERNS.GIT_PUSH_REJECTED;
  if (/git push (failed|error)|push.*failed.*after.*retr/i.test(value)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/build output (is )?empty|expected (artifact|output) (missing|not found)|no artifact produced|artifact (missing|not found)/i.test(value)) return FAIL_PATTERNS.BUILD_OUTPUT_EMPTY;
  if (/health check (timed? out|timeout|failed)|startup (timeout|never healthy|failed to become healthy)|container (never started|not healthy)/i.test(value)) return FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT;
  if (/session ended without (changes|output)|transcript terminal with no output|agent made no changes|no (changes|output) (detected|produced)/i.test(value)) return FAIL_PATTERNS.SESSION_NO_CHANGES;
  if (/parse (error|failed)|invalid json|corrupted (status|payload)|malformed (completion|payload|status)|unexpected token in json/i.test(value)) return FAIL_PATTERNS.PAYLOAD_CORRUPTED;
  if (/rate.?limit.*exhaust|rate.?limit.*recover.*fail|max.*rate.*limit.*attempt|repeated rate.?limit/i.test(value)) return FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED;
  if (/output file (missing|not found)|expected output file|gate output.*missing|review.*output.*missing/i.test(value)) return FAIL_PATTERNS.OUTPUT_FILE_MISSING;
  if (/\bBLOCKED\b/i.test(value) && (/no reason field/i.test(value) || /empty reason/i.test(value) || /\[.*\]\s*BLOCKED\s*$/i.test(value) || /^BLOCKED$/i.test(value.trim()))) return FAIL_PATTERNS.MODULE_ORPHANED;

  return FAIL_PATTERNS.UNKNOWN;
}

/**
 * Classify a git push error message into a FAIL_PATTERNS code.
 * Used to enrich pipeline failure records with structured git failure context.
 * @param {string} errorMessage
 * @returns {string} A FAIL_PATTERNS value
 */
export function classifyGitPushError(errorMessage) {
  const msg = String(errorMessage || '');
  if (/\[rejected\]|non-fast-forward|updates were rejected/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_REJECTED;
  if (/authentication failed|publickey|permission denied \(publickey\)|could not read.*passphrase/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/timeout|timed out|connection (refused|reset)|network (error|unreachable)/i.test(msg)) return FAIL_PATTERNS.GIT_PUSH_FAILED;
  if (/git sync failed|failed before buster handoff/i.test(msg)) return FAIL_PATTERNS.GIT_SYNC_FAILED;
  return FAIL_PATTERNS.GIT_PUSH_FAILED;
}

/**
 * Used by callers of handleFail to always provide informative anti-pattern data.
 */
export function extractAgentFailReason(status, phase) {
  const phaseHistory = [...(status.history || [])].reverse()
    .find(h => h.agent === phase && h.note);
  const reason = phaseHistory?.note
    ? `[${phase}] ${phaseHistory.note}`
    : phase === 'buster' && status.completion_summary
      ? `[${phase}] ${status.completion_summary}`
      : `${phase} reported FAIL (no details from agent)`;
  return reason;
}

/**
 * Extract a Forge-actionable fail reason from a Buster Pipeline pre-test failure.
 */
export function extractPreTestFailReason(redisEntry) {
  const reason = redisEntry?.reason || 'Pre-test failure (no details)';
  let verdictDetails = '';

  if (redisEntry?.verdict) {
    try {
      const failedSuites = Object.entries(parsePreTestVerdict(redisEntry).suites || {})
        .filter(([_, s]) => s.status === 'FAIL' || s.status === 'ERROR')
        .map(([name, s]) => `${name}: ${getSuiteFailureDetail(s) || 'failed'}`);
      if (failedSuites.length > 0) {
        verdictDetails = ` | Failed suites: ${failedSuites.join(' | ')}`;
      }
    } catch (error) {
      reportFailureSurfaceIncident(null, 'pretest_failed_suite_summary_failed', error, 'Failed to summarize Buster pre-test suite failures', {
        scope: 'extractPreTestFailReason',
      });
    }
  }

  return `[buster/pre-test] ${reason}${verdictDetails}`;
}

function parsePreTestVerdict(redisEntry) {
  if (!redisEntry?.verdict) return { suites: {} };
  try {
    return typeof redisEntry.verdict === 'string'
      ? JSON.parse(redisEntry.verdict)
      : redisEntry.verdict;
  } catch (error) {
    reportFailureSurfaceIncident(null, 'pretest_verdict_parse_failed', error, 'Failed to parse Buster pre-test verdict; using empty suite summary', {
      scope: 'parsePreTestVerdict',
    });
    return { suites: {} };
  }
}

function getSuiteFailureDetail(suite) {
  if (!suite || typeof suite !== 'object') return '';
  if (suite.error) return String(suite.error);
  if (suite.top_finding) return String(suite.top_finding);
  const topFindings = (suite.findings || [])
    .slice(0, 3)
    .map(f => f?.description || f?.message || f?.title || 'unknown')
    .filter(Boolean)
    .join('; ');
  return topFindings || String(suite.reason || '');
}

const PRETEST_INFRA_PATTERNS = [
  {
    code: 'REGISTRY_PROTOCOL_MISMATCH',
    summary: 'Registry mirror protocol mismatch (HTTP registry accessed as HTTPS)',
    re: /http:\s*server gave HTTP response to HTTPS client/i,
  },
  {
    code: 'REGISTRY_ACCESS_FAILED',
    summary: 'Registry access failed during pre-test',
    re: /(x509|certificate signed by unknown authority|tls|authentication required|unauthorized|denied|no route to host|connection refused|network is unreachable|i\/o timeout|temporary failure in name resolution|no such host).*(registry|podman|docker)|(?:registry|podman|docker).*(x509|certificate|unauthorized|denied|connection refused|timeout)/i,
  },
  {
    code: 'SANDBOX_RUNTIME_FAILURE',
    summary: 'Sandbox or Podman runtime failed before tests could run',
    re: /(sandbox-build|sandbox-run|podman) .*?(failed|error|cannot|unable)|error: pinging container registry/i,
  },
];

const PRETEST_CONFIG_PATTERNS = [
  {
    code: 'PROGRESS_CONFIG_INVALID',
    summary: 'progress.json / test configuration looks invalid',
    re: /(progress\.json|test_config|test_suites|serve\.|suite file not found|manifest path|dockerfile .*not found|image_name.*required|secret yaml .*not found)/i,
  },
];

export function classifyPreTestFailure(redisEntry) {
  const verdict = parsePreTestVerdict(redisEntry);
  const suiteEntries = Object.entries(verdict.suites || {});
  const failed = suiteEntries
    .filter(([_, suite]) => suite?.status === 'FAIL' || suite?.status === 'ERROR')
    .map(([name, suite]) => ({ name, detail: getSuiteFailureDetail(suite) || 'failed' }));

  const reasonText = [
    redisEntry?.reason || '',
    ...failed.map(({ name, detail }) => `${name}: ${detail}`),
  ].filter(Boolean).join(' | ');

  for (const pattern of PRETEST_INFRA_PATTERNS) {
    if (pattern.re.test(reasonText)) {
      return {
        kind: 'infra',
        code: pattern.code,
        summary: pattern.summary,
        failureClass: normalizeFailureClass('buster', reasonText, { preTestKind: 'infra' }),
        detail: failed[0]?.detail || reasonText || 'Infrastructure issue during pre-test',
      };
    }
  }

  for (const pattern of PRETEST_CONFIG_PATTERNS) {
    if (pattern.re.test(reasonText)) {
      return {
        kind: 'config',
        code: pattern.code,
        summary: pattern.summary,
        failureClass: normalizeFailureClass('pre_check', reasonText, { preTestKind: 'config' }),
        detail: failed[0]?.detail || reasonText || 'Configuration issue during pre-test',
      };
    }
  }

  return {
    kind: 'code',
    code: 'PRETEST_SUITE_FAILURE',
    summary: 'Pre-test suite failure before Buster subagent spawn',
    failureClass: normalizeFailureClass('buster', reasonText, { preTestKind: 'code' }),
    detail: failed[0]?.detail || reasonText || 'Pre-test failure',
  };
}

export function getPassedSuiteNames(redisEntry) {
  return Object.entries(parsePreTestVerdict(redisEntry).suites || {})
    .filter(([_, s]) => s?.status === 'PASS')
    .map(([name]) => name);
}

export function buildPreTestDiscordFields(redisEntry) {
  const suites = parsePreTestVerdict(redisEntry).suites || {};
  const passed = [];
  const failed = [];
  const skipped = [];

  for (const [name, suite] of Object.entries(suites)) {
    const status = String(suite?.status || '').toUpperCase();
    if (status === 'PASS') passed.push(name);
    else if (status === 'SKIP') skipped.push(name);
    else if (status === 'FAIL' || status === 'ERROR') failed.push({ name, detail: getSuiteFailureDetail(suite) || 'failed' });
  }

  const fields = [
    { name: 'Passed Suites', value: passed.length ? truncateForDiscord(passed.join(', '), 1024) : '—', inline: true },
    { name: 'Failed Suites', value: failed.length ? truncateForDiscord(failed.map(s => s.name).join(', '), 1024) : '—', inline: true },
  ];

  if (skipped.length) {
    fields.push({ name: 'Skipped Suites', value: truncateForDiscord(skipped.join(', '), 1024), inline: true });
  }

  if (failed.length) {
    fields.push({
      name: 'Issue',
      value: truncateForDiscord(
        failed.slice(0, 3).map(({ name, detail }) => `${name}: ${detail}`).join('\n'),
        1024,
      ),
      inline: false,
    });
  }

  return fields;
}

/**
 * Extract the names of failed suites from a Redis completion entry's verdict.
 */
export function getFailedSuiteNames(redisEntry) {
  return Object.entries(parsePreTestVerdict(redisEntry).suites || {})
    .filter(([_, s]) => s?.status === 'FAIL' || s?.status === 'ERROR')
    .map(([name]) => name);
}

/**
 * Resolve the auto-retry threshold for a module or gate.
 * Priority: module/gate config > project config > platform config > default (2)
 */
export function resolveAutoRetryThreshold(config, progress, moduleIdOrGateId) {
  const moduleConf = progress?.modules?.[moduleIdOrGateId];
  const gateConf = progress?.gates?.[moduleIdOrGateId];
  return (
    moduleConf?.auto_retry_threshold ??
    gateConf?.auto_retry_threshold ??
    progress?.auto_retry_threshold ??
    config?.auto_retry_threshold ??
    2
  );
}

export async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = opts.isTimeout || false;
  const previousStatus = status.status || null;

  status.fail_count++;

  if (reason) {
    const failPattern = classifyFailPattern(reason);
    status.fail_summaries.push({
      attempt: status.fail_count,
      timestamp: new Date().toISOString(),
      summary: reason,
      phase,
      failPattern,
      failure_class: normalizeFailureClass(phase, reason, {
        isTimeout,
        failurePattern: failPattern,
      }),
      is_timeout: isTimeout,
      files_changed: status.forge_diff_stat || null,
    });
  }

  const contextFields = [
    ...buildFailureDiscordFields({
      run_id: getRunId(config),
      module_id: moduleId,
      phase,
      attempt: status.fail_count,
      dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
      gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
      session_key: resolveStatusSessionKey(status, opts.session_key),
    }),
    { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
    ...(isTimeout ? [{ name: 'Timeout', value: 'yes', inline: true }] : []),
    ...((opts.discordFields || []).filter(Boolean)),
  ];

  if (resolveStatusDispatchId(status, opts.dispatch_id) && !status.dispatch_id) {
    status.dispatch_id = resolveStatusDispatchId(status, opts.dispatch_id);
  }

  const blockedTitle = `Module ${moduleId} BLOCKED`;
  const autoRetryTitle = `Module ${moduleId} FAIL (${phase}) — Auto-Retry`;
  const autoRetryDescription = `Attempt ${status.fail_count}/${maxFails}. Pipeline will retry automatically.`;
  const escalationTitle = `Module ${moduleId} ${isTimeout ? 'TIMEOUT' : 'NEEDS_NOVA'} (${phase})`;
  const failEvent = buildModuleFailureTelemetry(status, phase, reason, previousStatus, opts);

  if (status.fail_count >= maxFails) {
    const blockedAt = new Date().toISOString();
    transitionModuleStatus(status, STATUS.FAIL, {
      note: `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`,
      now: blockedAt,
    });
    markModuleBlocked(status, phase, `Max retries (${maxFails}) exceeded`, {
      reason: reason || 'max_fails_reached',
      failCount: status.fail_count,
      now: blockedAt,
    });
    saveStatus(config, moduleDir, status);

    const ctx = telemetryCtx(config);
    await onModuleFail(ctx, moduleId, failEvent);
    await onRetryExhausted(ctx, moduleId, {
      attempt: status.fail_count,
      phase,
      dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
      gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
      session_key: resolveStatusSessionKey(status, opts.session_key),
      reason: reason || null,
      max_attempts: maxFails,
      max_fails: maxFails,
    });
    await onModuleBlocked(ctx, moduleId, {
      ...failEvent,
      old_status: STATUS.FAIL,
      reason: `Max retries (${maxFails}) exceeded${phase ? ` in ${phase}` : ''}`,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: blockedTitle,
          description: `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`,
          fields: [
            ...contextFields,
            ...(reason ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }] : []),
          ],
        },
      },
    });

    log('ERROR', `Module ${moduleId} BLOCKED — failed ${maxFails}x in ${phase} phase`);
    const stats = getRunStats(config);
    if (stats) stats.modules_blocked.push(moduleId);
    return {
      exit: EXIT_BLOCKED,
      reason: `Max retries exceeded (${phase})`,
      module: moduleId,
      attempt: status.fail_count,
      status,
      dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
      gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
      session_key: resolveStatusSessionKey(status, opts.session_key),
    };
  }

  transitionModuleStatus(status, STATUS.FAIL, {
    note: `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`,
  });
  saveStatus(config, moduleDir, status);

  const autoRetryThreshold = opts.autoRetryThreshold ?? resolveAutoRetryThreshold(config, opts.progress, moduleId);
  const canAutoRetry = !isTimeout && status.fail_count <= autoRetryThreshold;

  if (canAutoRetry) {
    await onModuleFail(telemetryCtx(config), moduleId, {
      ...failEvent,
      presentation: {
        discord: {
          level: 'WARN',
          title: autoRetryTitle,
          description: autoRetryDescription,
          fields: [
            { name: 'Auto-Retry', value: `${status.fail_count}/${autoRetryThreshold}` },
            ...contextFields,
            ...(reason ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }] : []),
          ],
        },
      },
    });
    log('INFO', `Auto-retry ${status.fail_count}/${autoRetryThreshold} — pipeline will retry internally`);

    return {
      _retry: true,
      module: moduleId,
      module_dir: moduleDir,
      attempt: status.fail_count,
      fail_count: status.fail_count,
      dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
      gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
      session_key: resolveStatusSessionKey(status, opts.session_key),
      max_fails: maxFails,
      last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,
    };
  }

  const escalationReason = isTimeout
    ? 'Agent timed out.'
    : `Auto-retry exhausted (${autoRetryThreshold}x). Nova must analyze and provide new prompt.`;
  const stats = getRunStats(config);
  if (stats) stats.modules_failed.push(moduleId);

  await onModuleFail(telemetryCtx(config), moduleId, {
    ...failEvent,
    presentation: {
      discord: {
        level: 'WARN',
        title: escalationTitle,
        description: `Attempt ${status.fail_count}/${maxFails}. ${escalationReason}`,
        fields: [
          ...(isTimeout ? [{ name: 'Type', value: 'TIMEOUT' }] : []),
          ...(!isTimeout ? [{ name: 'Action', value: 'Resume with --prompt' }] : []),
          ...contextFields,
          ...(reason ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }] : []),
        ],
      },
    },
  });

  return buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold, opts);
}

export function buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold, opts = {}) {
  const exitCode = isTimeout ? EXIT_TIMEOUT : EXIT_NEEDS_NOVA;

  return {
    exit: exitCode,
    run_id: getRunId(config),
    module: moduleId,
    module_dir: moduleDir,
    is_timeout: isTimeout,
    attempt: status.fail_count,
    dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
    gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
    session_key: resolveStatusSessionKey(status, opts.session_key),
    reason: isTimeout
      ? `${phase} timed out — agent did not respond within time limit`
      : `${phase} failed ${status.fail_count}x — auto-retry exhausted, Nova must intervene`,
    fail_count: status.fail_count,
    max_fails: maxFails,
    auto_retry_threshold: autoRetryThreshold,
    remaining_attempts: maxFails - status.fail_count,
    fail_history: status.fail_summaries.map(f => ({
      attempt: f.attempt,
      phase: f.phase,
      summary: f.summary,
      failPattern: f.failPattern,
      failure_class: f.failure_class || normalizeFailureClass(f.phase, f.summary, {
        isTimeout: f.is_timeout === true,
        failurePattern: f.failPattern,
      }),
      is_timeout: f.is_timeout || false,
      files_changed: f.files_changed || null,
      timestamp: f.timestamp,
    })),
    last_fail: status.fail_summaries[status.fail_summaries.length - 1] || null,
    module_status: {
      status: status.status,
      current_phase: status.current_phase,
      started_at: status.started_at,
      attempt: status.fail_count,
      dispatch_id: resolveStatusDispatchId(status, opts.dispatch_id),
      gateway_label: resolveStatusGatewayLabel(status, opts.gateway_label),
      session_key: resolveStatusSessionKey(status, opts.session_key),
      forge_commit_hash: status.forge_commit_hash || null,
      cost: status.cost,
    },
    resume_command: buildFullPipelineResumeCommand(config, '"YOUR_NEW_APPROACH_HERE"'),
  };
}

/**
 * Truncate text safely for Discord, appending "…" if truncated.
 * Discord limits: field value ≤ 1024 chars, description ≤ 4096 chars.
 */
export function truncateForDiscord(text, maxLength = 1024) {
  const s = String(text || '');
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - 1) + '…';
}

/**
 * Format fields for a rate-limit Discord embed.
 * Returns { title, description, fields } to spread into a discord() call.
 *
 * @param {object} config - Pipeline config (for rate_limit settings)
 * @param {object} context - { detail?: string } — transcript detail from classifier
 * @param {number} pauseCount - current pause number (1-based)
 * @param {number} maxPauses - max allowed pauses
 * @param {number} cooldownMs - cooldown duration in milliseconds
 */
export function formatRateLimitEmbed(config, context, pauseCount, maxPauses, cooldownMs) {
  return formatSharedRateLimitEmbed(context, pauseCount, maxPauses, cooldownMs);
}

export async function injectNeedsNova(config, result, novaChannel, stepType = 'module', stepId = null) {
  const channelId = novaChannel || process.env.NOVA_CHANNEL || null;
  const targetId = stepId || result?.module || 'unknown';
  const exitCode = result?.exit;
  const exitLabel = exitCode === EXIT_TIMEOUT ? 'TIMEOUT' : 'NEEDS_NOVA';
  const runId = config?._runId || config?.run_id || getRunId(config);
  const attempt = resolveResultAttempt(result);
  const dispatchId = resolveResultDispatchId(result);
  const gatewayLabel = resolveResultGatewayLabel(result);
  const childSessionKey = resolveResultSessionKey(result);
  const gateId = stepType === 'gate' ? result?.gate_id || targetId : null;
  const gateType = stepType === 'gate' ? resolveResultGateType(result) : null;
  const artifactBundle = getPipelineArtifactBundle(config);
  const injectionLogPaths = [
    artifactBundle.global_nova_injections_jsonl_path,
    artifactBundle.run_nova_injections_jsonl_path,
  ].filter(Boolean);

  const entry = {
    ts: new Date().toISOString(),
    run_id: runId,
    status: 'skipped',
    channel: channelId,
    step_type: stepType,
    step_id: targetId,
    module: result?.module || null,
    gate_id: stepType === 'gate' ? gateId : undefined,
    gate_type: stepType === 'gate' ? gateType : undefined,
    exit: exitCode,
    exit_label: exitLabel,
    reason: (result?.reason || '').slice(0, 500),
    attempt,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: childSessionKey,
    fail_count: result?.fail_count ?? null,
    max_fails: result?.max_fails ?? null,
    remaining_attempts: result?.remaining_attempts ?? null,
  };

  const appendInjectionLog = () => {
    for (const injectionLogPath of injectionLogPaths) {
      try {
        fs.mkdirSync(path.dirname(injectionLogPath), { recursive: true });
        fs.appendFileSync(injectionLogPath, JSON.stringify(entry) + '\n');
      } catch (error) {
        reportFailureSurfaceIncident(config, 'nova_injection_log_write_failed', error, 'Nova injection log write failed', {
          scope: injectionLogPath,
        });
      }
    }
  };

  if (!channelId) {
    log('INFO', 'EXIT 10/TIMEOUT — no --nova-channel set, skipping Nova session injection');
    entry.status = 'skipped_no_channel';
    appendInjectionLog();
    return;
  }

  const targetSessionKey = `agent:main:discord:channel:${channelId}`;
  const messageLines = [
    '⚠️ Cronjob injected — Nova working on resolution.',
    `Project: ${config.project}`,
    `${stepType === 'gate' ? 'Gate' : 'Module'}: ${targetId}`,
    `Exit: ${exitLabel}`,
  ];
  if (runId) messageLines.push(`Run ID: ${runId}`);
  if (stepType === 'gate' && gateType) messageLines.push(`Gate Type: ${gateType}`);
  if (dispatchId) messageLines.push(`Dispatch: ${dispatchId}`);
  if (gatewayLabel && gatewayLabel !== dispatchId) messageLines.push(`Label: ${gatewayLabel}`);
  if (childSessionKey) messageLines.push(`Session: ${childSessionKey}`);
  if (result?.reason) messageLines.push(`Reason: ${String(result.reason).slice(0, 300)}`);
  if (attempt != null && result?.max_fails != null) {
    messageLines.push(`Attempts: ${attempt}/${result.max_fails}`);
  } else if (attempt != null) {
    messageLines.push(`Attempt: ${attempt}`);
  } else if (result?.fail_count != null && result?.max_fails != null) {
    messageLines.push(`Attempts: ${result.fail_count}/${result.max_fails}`);
  } else if (result?.fail_count != null) {
    messageLines.push(`Attempt: ${result.fail_count}`);
  }
  if (result?.resume_command) {
    messageLines.push(`Resume: ${String(result.resume_command).slice(0, 400)}`);
  }
  const message = messageLines.join('\n');

  try {
    await gatewayInvoke('sessions_send', { sessionKey: targetSessionKey, message }, 15000);
    entry.status = 'ok';
    log('OK', `${exitLabel} injected into Nova channel ${channelId} for ${stepType} ${targetId}`);
    await discord(config, 'WARN', `Nova injection sent: ${targetId}`, `Cronjob injected Nova into Discord channel for ${stepType} ${targetId}.`, [
      ...buildFailureDiscordFields({ run_id: runId, step_type: stepType, step_id: targetId, gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey }),
      { name: 'Exit', value: exitLabel },
      { name: 'Channel', value: channelId },
      { name: 'Target', value: `${stepType}:${targetId}` },
    ]);
  } catch (e) {
    const errMsg = e?.message?.split('\n')[0] || 'unknown error';
    const isAbort = /aborted|abort/i.test(errMsg);
    if (isAbort) {
      entry.status = 'ok_aborted';
      log('OK', `${exitLabel} injected into Nova channel ${channelId} for ${stepType} ${targetId} (response aborted during shutdown — message delivered)`);
    } else {
      entry.status = 'failed';
      entry.error = errMsg;
      log('WARN', `Failed to inject ${exitLabel} into Nova channel ${channelId}: ${errMsg}`);
      await discord(config, 'CRITICAL', `Nova injection FAILED: ${targetId}`, `Cronjob could not inject Nova into Discord for ${stepType} ${targetId}. Manual intervention required.`, [
        ...buildFailureDiscordFields({ run_id: runId, step_type: stepType, step_id: targetId, gate_id: gateId, gate_type: gateType, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: childSessionKey }),
        { name: 'Exit', value: exitLabel },
        { name: 'Channel', value: channelId },
        { name: 'Target', value: `${stepType}:${targetId}` },
        { name: 'Error', value: errMsg.slice(0, 200) },
      ]);
    }
  } finally {
    appendInjectionLog();
  }
}
