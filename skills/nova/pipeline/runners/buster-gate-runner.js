// runners/buster-gate-runner.js — Buster gate runner
// Handles the buster gate lifecycle:
//   1. Completion check (output_file is canonical; gate-status.json is diagnostic)
//   2. Stale file cleanup
//   3. Main loop: run Buster → optional fix-and-retest (Forge fixes, Buster retests)
//
// The fix-and-retest loop tracks fix history to prevent repeated failed approaches
// via anti-pattern framing in subsequent Forge prompts.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.js';
import { getRunId, getRunStats } from '../core/runtime.js';
import { resolveModel, validateBusterConfig, resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { swarmRoot, relPath, gateLogDir, gateStatusPath } from '../core/paths.js';
import { headHash } from '../core/git.js';
import { discord } from '../integrations/discord.js';
import { gitCommitAndPush } from '../integrations/git.js';
import { archiveGateOutputIfPresent, readBusterGateCompletion } from '../services/status-store.js';
import { pollResult, pollGeneric, sleep, archiveModuleCompletions, readCompletionFromRedis, pollForSessionEnd, mapRedisStatus, isRedisTimeoutOutcome, isRedisRateLimitedOutcome, isTerminalOwnedRateLimitedOutcome } from '../services/polling.js';
import {
  buildGateSessionRateLimitStatus,
  buildGateTerminalOwnedRedisRateLimitExitResult,
  createRateLimitPauseState,
  createTrackedGateSessionRateLimitRecoveryOptions,
  emitGateRetryExhausted,
  finalizeGateSessionRateLimitExit,
  withSessionRateLimitRecovery,
} from '../services/rate-limit.js';
import { readGateInstructions, buildBusterGatePrompt } from '../prompts/buster-gate.js';
import { buildGateFixPrompt } from '../prompts/gate-fix.js';
import { acpLabel, spawnAgent, killAgent, verifyAgentAlive } from '../agents/orchestration.js';
import { transcriptShowsProgress } from '../../../common/pipeline/agents/acp-monitor.js';
import { getTrackedAgent } from '../../../common/pipeline/agents/lifecycle.js';
import { getActiveContext } from '../core/logger.js';
import { onGateStarted, onGatePass, onGateFail } from '../services/telemetry.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../services/correlation.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { copyRedactedTranscriptArtifact, writeRedactedPromptArtifact } from '../../../common/pipeline/redaction.js';
import {
  buildGateRemediationRequestControlResult,
  readGateRemediationSpec,
} from '../services/remediation-handoff.js';
import { persistGateActiveSession, clearGateActiveSession } from '../services/gate-active-session.js';
import { finishGateForgeFixCycleScaffold, startGateForgeFixCycleScaffold } from '../services/gate-fix-scaffold.js';
import { runRemediableGateControlLoop } from './remediable-gate-engine.js';
import {
  buildTypedGateControlResult,
  cloneSerializable,
  coerceTypedGateControlResult,
  extractTypedGateLegacyResult,
  isTypedGateControlResult,
} from '../services/gate-control-result.js';

function _telemetryCtx(config) {
  return getActiveContext() || { config, runId: config?.run_id || config?._runId || '' };
}

async function emitBusterGateFixCycleFail(config, gateId, gateType, cycle, gateStartedAt, reason, extra = {}) {
  await onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gateType,
    fix_cycle: cycle,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason,
    ...extra,
  });
}

function buildBusterGateDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
    DISCORD_FIELD_SPECS.ATTEMPT,
    DISCORD_FIELD_SPECS.DISPATCH_ID,
    DISCORD_FIELD_SPECS.GATEWAY_LABEL,
    DISCORD_FIELD_SPECS.SESSION_KEY,
  ], extra);
}

const DEFAULT_DEPS = {
  resolveModel,
  resolvePolicy,
  logEffectivePolicy,
  validateBusterConfig,
  headHash,
  discord,
  gitCommitAndPush,
  archiveGateOutputIfPresent,
  readBusterGateCompletion,
  pollResult,
  pollGeneric,
  sleep,
  archiveModuleCompletions,
  readCompletionFromRedis,
  pollForSessionEnd,
  readGateInstructions,
  buildBusterGatePrompt,
  buildGateFixPrompt,
  acpLabel,
  spawnAgent,
  killAgent,
  verifyAgentAlive,
  getTrackedAgent,
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.busterGate || {}) };
}

function getGateStats(config) {
  return getRunStats(config);
}

function inferBusterFailureClass(result = {}, gateId = '') {
  if (result?.failure_class) return result.failure_class;
  if (result?.exit === EXIT_RATE_LIMITED) return 'rate_limit_exhausted';
  if (result?.exit === EXIT_TIMEOUT) return 'timeout';

  const reason = String(result?.reason || '').trim();
  const reasonLower = reason.toLowerCase();
  const gatePrefix = `gate '${String(gateId || '').toLowerCase()}'`;

  if (result?.polling_git || reasonLower.includes('polling git unsafe')) return 'git_error';
  if (reasonLower.includes('spawn failed')) return 'spawn_failed';
  if (reasonLower.includes('permanently corrupted')) return 'parse_corrupted';
  if (reasonLower.includes('ended unexpectedly')) return 'unexpected_exit';
  if (result?.fix_attempts != null || reasonLower.includes('failed after')) return 'fix_loop_exhausted';
  if (reasonLower.includes('failed:')) return 'verdict_fail';
  if (result?.exit === EXIT_NEEDS_NOVA && reasonLower && !reasonLower.startsWith(gatePrefix)) return 'config_invalid';
  if (result?.exit === EXIT_ERROR) return 'error';
  return 'unknown';
}

function mapBusterLegacyExitToControl(result = {}, gateId) {
  if (result?.exit === EXIT_OK) {
    return { nextAction: 'pass', issueType: undefined, outcomeClass: 'pass' };
  }

  const failureClass = inferBusterFailureClass(result, gateId);
  if (failureClass === 'verdict_fail' || failureClass === 'fix_loop_exhausted') {
    return { nextAction: 'block', issueType: 'code', outcomeClass: failureClass };
  }
  if (failureClass === 'rate_limit_exhausted' || failureClass === 'timeout' || failureClass === 'spawn_failed') {
    return { nextAction: 'block', issueType: 'environment', outcomeClass: failureClass };
  }
  return { nextAction: 'block', issueType: 'unknown', outcomeClass: failureClass };
}

function buildBusterGateControlSummary(gateId, result = {}) {
  if (result?.exit === EXIT_OK) {
    const source = result?.completion_source ? ` via ${result.completion_source}` : '';
    return `Buster gate '${gateId}' passed${source}`;
  }
  return result?.reason || `Buster gate '${gateId}' failed`;
}

function buildBusterGateFindings(result = {}, gateId) {
  if (result?.exit === EXIT_OK) return [];
  const failureClass = inferBusterFailureClass(result, gateId);
  return [{
    code: `BUSTER_GATE_${String(failureClass || 'FAILED').toUpperCase()}`,
    severity: failureClass === 'parse_corrupted' ? 'critical' : 'error',
    message: result?.reason || `Buster gate '${gateId}' failed`,
    category: 'buster_gate',
    target: gateId || null,
    retryable: false,
    environmentIssue: ['rate_limit_exhausted', 'timeout', 'spawn_failed'].includes(failureClass),
  }];
}

function buildBusterIssueFindings(issues = []) {
  return (issues || []).map((issue = {}, index) => ({
    code: `BUSTER_ISSUE_${index + 1}`,
    severity: issue.severity === 'critical' ? 'critical' : 'error',
    message: issue.title || issue.description || 'Buster gate issue',
    category: 'buster_gate',
    target: Array.isArray(issue.affected_files) && issue.affected_files.length > 0
      ? issue.affected_files[0]
      : issue.affected_module || null,
    retryable: false,
    environmentIssue: false,
    metadata: {
      description: issue.description || null,
      severity: issue.severity || null,
      reproduction: issue.reproduction || null,
      affected_files: cloneSerializable(issue.affected_files || []),
    },
  }));
}

export function buildBusterGateControlResult(config, gateId, gate, result = {}, opts = {}) {
  const mapped = mapBusterLegacyExitToControl(result, gateId);
  const runId = config?._runId || config?.run_id || null;
  const failureClass = inferBusterFailureClass(result, gateId);
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'buster',
    run_id: runId,
    legacy_exit: result?.exit ?? EXIT_ERROR,
    reason: result?.reason || null,
    failure_class: failureClass,
    completion_source: result?.completion_source || null,
    fix_attempts: result?.fix_attempts ?? null,
    attempt: result?.attempt ?? opts?.input?.ids?.attempt ?? null,
    gateway_label: result?.gateway_label || null,
    session_key: result?.session_key || null,
    dispatch_id: result?.dispatch_id || null,
    polling_git: cloneSerializable(result?.polling_git || null),
    remaining_issues: cloneSerializable(result?.remaining_issues || null),
    legacy_result: cloneSerializable(result),
  };

  return buildTypedGateControlResult({
    producerType: 'buster',
    nextAction: mapped.nextAction,
    issueType: mapped.issueType,
    summary: buildBusterGateControlSummary(gateId, result),
    findings: buildBusterGateFindings(result, gateId),
    metadata,
    gateRunStatus: result?.exit === EXIT_OK ? STATUS.PASS : STATUS.FAIL,
    outcomeClass: mapped.outcomeClass,
    recommendation: mapped.nextAction === 'pass' ? 'proceed' : 'stop',
    metrics: {
      fix_attempts: result?.fix_attempts ?? 0,
      completion_source: result?.completion_source || null,
    },
  });
}

export function isBusterGateControlResult(result) {
  return isTypedGateControlResult(result, 'buster');
}

export function coerceBusterGateControlResult(config, gateId, gate, result, opts = {}) {
  return coerceTypedGateControlResult(result, {
    producerType: 'buster',
    build: () => buildBusterGateControlResult(config, gateId, gate, result, opts),
  });
}

export function extractBusterGateLegacyResult(result, gateId, gate) {
  return extractTypedGateLegacyResult(result, gateId, gate, {
    producerType: 'buster',
    buildFallbackLegacyResult: ({ metadata, result: controlResult }) => ({
      exit: metadata?.legacy_exit ?? (controlResult?.nextAction === 'pass' ? EXIT_OK : EXIT_NEEDS_NOVA),
      status: controlResult?.nextAction === 'pass' ? STATUS.PASS : STATUS.FAIL,
      reason: metadata?.reason || controlResult?.diagnostics?.summary || null,
      failure_class: metadata?.failure_class || null,
      fix_attempts: metadata?.fix_attempts ?? null,
      completion_source: metadata?.completion_source || null,
      attempt: metadata?.attempt ?? null,
      gateway_label: metadata?.gateway_label || null,
      session_key: metadata?.session_key || null,
      dispatch_id: metadata?.dispatch_id || null,
      polling_git: metadata?.polling_git || null,
      remaining_issues: metadata?.remaining_issues || null,
      gate_id: gateId,
      gate_type: gate?.type || 'buster',
    }),
  });
}

/**
 * Extract actionable issues from a Buster gate result for Forge to fix.
 *
 * Input shapes (depending on poll source):
 *   Redis:       { gate, status: 'FAIL', reason: '...', source: 'buster-pipeline', verdict: {...} }
 *   Output file: { status: 'FAIL', issues: [...] }
 *   gate-status: { status: 'FAIL', reason: '...' }
 */
function extractGateIssues(gateResult) {
  if (!gateResult) return [];

  const data = (typeof gateResult.status === 'object' && gateResult.status !== null)
    ? gateResult.status
    : gateResult;

  if (Array.isArray(data.issues)) {
    return data.issues
      .filter(i => i.severity === 'critical' || i.severity === 'moderate' || !i.severity)
      .map(i => ({
        title: i.title || 'Unknown issue',
        description: i.description || '',
        affected_module: i.affected_module || null,
        affected_files: i.affected_files || [],
        severity: i.severity || 'unknown',
        reproduction: i.reproduction || null,
      }));
  }

  // Verdict JSON from the Buster Pipeline (enriched Redis FAIL) — extract per-suite failures
  const verdict = data.verdict || data._verdict;
  if (verdict?.suites) {
    const issues = [];
    for (const [suiteName, suite] of Object.entries(verdict.suites)) {
      if (suite.status !== 'FAIL' && suite.status !== 'ERROR') continue;
      if (suite.findings?.length > 0) {
        for (const f of suite.findings.slice(0, 5)) {
          issues.push({
            title: `${suiteName}: ${f.message || 'test failure'}`,
            description: f.rule ? `Rule: ${f.rule}` : '',
            severity: f.severity || 'critical',
            affected_files: f.file ? [f.file] : [],
          });
        }
      } else {
        issues.push({
          title: `${suiteName}: ${suite.error || suite.reason || 'failed'}`,
          description: `Suite ${suiteName} ${suite.status} with ${suite.checks_failed || 0} check(s) failed`,
          severity: suite.critical ? 'critical' : 'moderate',
          affected_files: [],
        });
      }
    }
    if (issues.length > 0) return issues;
  }

  const reason = data.reason || data.summary || 'Gate test failed without details';
  return [{ title: 'Gate test failure', description: reason, severity: 'unknown', affected_files: [] }];
}

/**
 * Run a single Buster gate attempt: spawn -> poll -> kill -> interpret.
 * Returns the poll result for the caller to handle.
 * @private
 */
async function _runBusterGateOnce(deps, config, progress, gateId, gate, model, timeout, instructions, attempt) {
  getGateStats(config).total_buster_attempts++;
  const commitHash = deps.headHash();
  const completionIdentity = {
    runId: getRunId(config),
    attempt,
    dispatchId: `buster-gate-${gateId}-${Date.now()}-${attempt}`,
    sessionKey: null,
  };
  completionIdentity.gateway_label = completionIdentity.dispatchId;
  const gateRateLimitStatusOptions = {
    gateId,
    gateType: gate.type,
    agentTypeFallback: gate.type || 'buster',
    runIdFallback: completionIdentity.runId,
    attemptFallback: completionIdentity.attempt,
    dispatchIdFallback: completionIdentity.dispatchId,
    gatewayLabelFallback: completionIdentity.gateway_label,
    sessionKeyFallback: completionIdentity.sessionKey,
  };
  const busterPromptResult = deps.buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt, completionIdentity);
  const busterPrompt = busterPromptResult.prompt;

  try {
    const logDir = gateLogDir(config, gateId);
    fs.mkdirSync(logDir, { recursive: true });
    writeRedactedPromptArtifact(path.join(logDir, `buster-prompt-attempt-${attempt}.md`), busterPrompt, { gate_id: gateId, attempt, agent_type: 'buster' });
  } catch { /* non-critical */ }

  // Pre-dispatch config validation (gate) — only on first attempt
  if (attempt === 1) {
    try {
      deps.validateBusterConfig(config);
    } catch (e) {
      const reason = `Gate '${gateId}' config validation failed: ${e.message}`;
      log('ERROR', reason);
      await deps.discord(config, 'CRITICAL', `Gate '${gateId}' — Config Invalid`,
        `Pre-dispatch validation caught config issues. Fix before retrying.`,
        buildBusterGateDiscordFields({ run_id: completionIdentity.runId, gate_id: gateId, gate_type: gate.type, attempt, dispatch_id: completionIdentity.dispatchId, gateway_label: completionIdentity.gateway_label }, [
          { name: 'Issue', value: e.message.slice(0, 200) },
        ])
      );
      return deps.pollResult(false, 'config_invalid', {
        error: reason,
        errors: [e.message],
        run_id: completionIdentity.runId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: completionIdentity.gateway_label,
      });
    }
  }

  // Archive stale Redis completions for this gate before dispatching
  await deps.archiveModuleCompletions(config, gateId);

  try {
    await deps.spawnAgent(config, progress, 'buster', gateId, model, busterPrompt, {
      taskType: 'gate_test',
      gate,
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
    });
    const gateLabel = deps.acpLabel('buster', gateId);
    const trackedGate = deps.getTrackedAgent(gateLabel);
    completionIdentity.dispatchId = trackedGate?.telemetry_dispatch_id || trackedGate?.dispatch_id || completionIdentity.dispatchId;
    completionIdentity.gateway_label = trackedGate?.gatewayLabel || completionIdentity.gateway_label;
    completionIdentity.sessionKey = trackedGate?.sessionKey || null;
    gateRateLimitStatusOptions.dispatchIdFallback = completionIdentity.dispatchId;
    gateRateLimitStatusOptions.gatewayLabelFallback = completionIdentity.gateway_label;
    gateRateLimitStatusOptions.sessionKeyFallback = completionIdentity.sessionKey;
    persistGateActiveSession(config, gateId, gateLabel, trackedGate, {
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
    });
  } catch (e) {
    return deps.pollResult(false, 'spawn_failed', {
      error: e.message,
      run_id: completionIdentity.runId,
      attempt: completionIdentity.attempt,
      dispatch_id: completionIdentity.dispatchId,
      gateway_label: completionIdentity.gateway_label,
    });
  }

  let result;
  try {
    const redisObservabilityState = { active: false, degradedAt: null };
    result = await deps.pollGeneric(config, async () => {
      // Channel 0: Redis Completion Stream (fast path)
      const redisEntry = await deps.readCompletionFromRedis(config, gateId, {
        run_id: completionIdentity.runId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
      }, {
        observabilityState: redisObservabilityState,
        gate_id: gateId,
        gate_type: gate.type,
        agent_type: 'buster',
      });
      if (redisEntry && redisEntry.status) {
        const mappedStatus = mapRedisStatus(redisEntry.status);
        log('OK', `Gate '${gateId}' Redis completion: status=${redisEntry.status} mapped=${mappedStatus} source=${redisEntry.source || 'unknown'} run=${redisEntry.run_id || '—'} attempt=${redisEntry.attempt || '—'} dispatch=${redisEntry.dispatch_id || '—'}`);

        if (isTerminalOwnedRateLimitedOutcome(redisEntry)) {
          return { done: true, result: buildGateTerminalOwnedRedisRateLimitExitResult(redisEntry, {
            expectedIdentity: {
              run_id: completionIdentity.runId,
              attempt: completionIdentity.attempt,
              dispatch_id: completionIdentity.dispatchId,
              gateway_label: completionIdentity.gateway_label,
            },
            gateId,
            gateType: gate.type,
            statusOptions: gateRateLimitStatusOptions,
            exit: EXIT_RATE_LIMITED,
          })};
        }

        if (isRedisRateLimitedOutcome(redisEntry)) {
          return { rate_limited: true, status: buildGateSessionRateLimitStatus(redisEntry, gateRateLimitStatusOptions) };
        }

        if (isRedisTimeoutOutcome(redisEntry)) {
          return { done: true, result: deps.pollResult(false, 'timeout', {
            gate: gateId,
            status: STATUS.FAIL,
            reason: redisEntry.reason || redisEntry.summary || 'timeout',
            source: redisEntry.source || 'unknown',
            run_id: completionIdentity.runId,
            attempt: completionIdentity.attempt,
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
            session_key: redisEntry.session_key || null,
            _source: 'redis',
          })};
        }

        if (mappedStatus === STATUS.PASS) {
          return { done: true, result: deps.pollResult(true, 'target_reached', {
            gate: gateId,
            status: mappedStatus,
            summary: redisEntry.summary || null,
            run_id: completionIdentity.runId,
            attempt: completionIdentity.attempt,
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
            session_key: redisEntry.session_key || null,
            _source: 'redis',
          })};
        }
        if (mappedStatus === STATUS.FAIL) {
          let verdict = null;
          if (redisEntry.verdict) {
            try { verdict = JSON.parse(redisEntry.verdict); } catch { /* malformed */ }
          }
          return { done: true, result: deps.pollResult(false, 'gate_fail', {
            gate: gateId,
            status: mappedStatus,
            reason: redisEntry.reason || redisEntry.summary || 'unknown',
            source: redisEntry.source || 'unknown',
            verdict,
            run_id: completionIdentity.runId,
            attempt: completionIdentity.attempt,
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
            session_key: redisEntry.session_key || null,
            _source: 'redis',
          })};
        }
        if (mappedStatus === STATUS.RATE_LIMITED) {
          return { rate_limited: true, status: buildGateSessionRateLimitStatus(redisEntry, gateRateLimitStatusOptions) };
        }
      }

    // Channel 1: Output file (primary file signal)
    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      if (fs.existsSync(outPath)) {
        let data = { gate: gateId };
        try { data = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* raw file */ }

        const resultStatus = (data.status || '').toUpperCase();
        if (resultStatus === 'FAIL' || resultStatus === 'ISSUES_FOUND') {
          return { done: true, result: deps.pollResult(false, 'gate_fail', {
            ...data,
            run_id: completionIdentity.runId,
            attempt: completionIdentity.attempt,
            dispatch_id: completionIdentity.dispatchId,
            gateway_label: data.gateway_label || completionIdentity.gateway_label,
            session_key: data.session_key || null,
          }) };
        }
        return { done: true, result: deps.pollResult(true, 'target_reached', {
          ...data,
          run_id: completionIdentity.runId,
          attempt: completionIdentity.attempt,
          dispatch_id: completionIdentity.dispatchId,
          gateway_label: data.gateway_label || completionIdentity.gateway_label,
          session_key: data.session_key || null,
        }) };
      }
    }

    // Channel 2: gate-status.json (FAIL/RATE_LIMITED/crash detection)
    const gateStatusFile = gateStatusPath(config, gateId);
    if (!fs.existsSync(gateStatusFile)) {
      return { done: false, logMsg: 'waiting for output' };
    }

    let gateStatus;
    try {
      gateStatus = JSON.parse(fs.readFileSync(gateStatusFile, 'utf8'));
    } catch {
      return { parse_error: true };
    }

    if (gateStatus?.status === STATUS.FAIL || gateStatus?.status === 'ISSUES_FOUND') {
      return { done: true, result: deps.pollResult(false, 'gate_fail', {
        ...gateStatus,
        run_id: completionIdentity.runId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
        gateway_label: gateStatus.gateway_label || completionIdentity.gateway_label,
        session_key: gateStatus.session_key || null,
      }) };
    }
    if (gateStatus?.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status: buildGateSessionRateLimitStatus(gateStatus, gateRateLimitStatusOptions) };
    }
    const gsUpper = (gateStatus?.status || '').toUpperCase();
    if (gsUpper === 'PASS' || gsUpper === 'OK') {
      return { done: false, logMsg: 'gate-status PASS observed, waiting for canonical output_file' };
    }

    return { done: false, logMsg: `status=${gateStatus?.status || 'unknown'}` };
  }, timeout, `Gate '${gateId}'`);
  } finally {
    const killed = await deps.killAgent(config, 'buster', gateId, result?.ok || false);
    if (killed) clearGateActiveSession(config, gateId);
  }
  return result;
}

/**
 * Run a type:"buster" gate with optional fix-and-retest loop.
 *
 * If gate.on_fail === 'fix_and_retest':
 *   FAIL -> extract issues -> Forge fix -> cleanup old output -> retest (max N cycles)
 * Otherwise: FAIL -> EXIT_NEEDS_NOVA
 */

function buildBusterRequestFixControlResult(config, gateId, gate, result = {}, issues = [], opts = {}) {
  const attempt = Number(opts.attempt || result?.status?.attempt || 1);
  const failData = result?.status || {};
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';
  const dispatchId = resolveStatusDispatchId(failData, opts.dispatchId || null);
  const gatewayLabel = resolveStatusGatewayLabel(failData, opts.gatewayLabel || null);
  const sessionKey = resolveStatusSessionKey(failData, opts.sessionKey || null);

  return buildGateRemediationRequestControlResult({
    producerType: 'buster',
    gateId,
    gateType: gate?.type || 'buster',
    runId: getRunId(config) || config?._runId || config?.run_id || null,
    attempt,
    summary: failReason,
    findings: buildBusterIssueFindings(issues),
    metadata: {
      gate_id: gateId,
      gate_type: gate?.type || 'buster',
      run_id: getRunId(config) || config?._runId || config?.run_id || null,
      attempt,
      reason: failReason,
      failure_class: 'verdict_fail',
      issues_count: issues.length,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      status: cloneSerializable(failData),
      legacy_result: cloneSerializable(result),
    },
    remediation: {
      policy: {
        maxFixCycles: opts.maxFixCycles ?? config.default_max_fails ?? null,
        nextFixCycle: attempt,
        rerunStageId: 'gate:buster',
      },
      targetRef: `gate:${gateId}`,
      startedAt: opts.gateStartedAt ? new Date(opts.gateStartedAt).toISOString() : null,
      correlation: {
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      diagnostics: {
        issues: cloneSerializable(issues),
        status: cloneSerializable(failData),
        fail_reason: failReason,
      },
    },
  });
}

function patchBusterRemediationControlResult(controlResult, updates = {}) {
  const cloned = cloneSerializable(controlResult);
  if (!cloned?.diagnostics?.typed?.remediation) return cloned;

  const remediation = cloned.diagnostics.typed.remediation;
  remediation.correlation = {
    ...(remediation.correlation || {}),
    ...cloneSerializable(updates.correlation || {}),
  };
  remediation.diagnostics = {
    ...(remediation.diagnostics || {}),
    ...cloneSerializable(updates.diagnostics || {}),
  };
  cloned.diagnostics.metadata = {
    ...(cloned.diagnostics.metadata || {}),
    ...cloneSerializable(updates.metadata || {}),
  };
  return cloned;
}

export async function buildBusterRemediationExhaustedLegacyResult(config, gateId, gate, controlResult, opts = {}) {
  const remediation = readGateRemediationSpec(controlResult) || {};
  const metadata = controlResult?.diagnostics?.metadata || {};
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || metadata?.fix_attempts || config.default_max_fails || 1);
  const issues = remediation?.diagnostics?.issues || metadata?.remaining_issues || [];
  const latestGateDispatchId = remediation?.correlation?.dispatch_id || metadata?.dispatch_id || null;
  const latestGateGatewayLabel = remediation?.correlation?.gateway_label || metadata?.gateway_label || null;
  const latestGateSessionKey = remediation?.correlation?.session_key || metadata?.session_key || null;
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';

  log('ERROR', `Gate '${gateId}' fix loop exhausted (${maxFixCycles} attempts)`);
  getGateStats(config).gates_failed.push(gateId);
  await onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gate.type,
    issues_count: issues.length,
    fix_cycle: maxFixCycles,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: `Fix loop exhausted after ${maxFixCycles} attempts`,
    dispatch_id: latestGateDispatchId,
    session_key: latestGateSessionKey,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate '${gateId}' BLOCKED`,
        description: `Fix loop exhausted after ${maxFixCycles} attempts. Issues: ${failReason}`,
        fields: buildBusterGateDiscordFields({
          run_id: getRunId(config),
          gate_id: gateId,
          gate_type: gate.type,
          attempt: maxFixCycles,
          dispatch_id: latestGateDispatchId,
          gateway_label: latestGateGatewayLabel,
          session_key: latestGateSessionKey,
        }),
      },
    },
  });
  emitGateRetryExhausted(_telemetryCtx(config), gateId, {
    gateType: gate.type,
    phase: 'buster_gate_fix',
    attempt: maxFixCycles,
    maxAttempts: maxFixCycles,
    reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
    sessionKey: latestGateSessionKey,
    dispatchId: latestGateDispatchId,
    gatewayLabel: latestGateGatewayLabel,
  });
  return {
    exit: EXIT_NEEDS_NOVA,
    reason: `Gate '${gateId}' failed after ${maxFixCycles} fix attempts`,
    gate: gateId,
    fix_attempts: maxFixCycles,
    remaining_issues: issues,
    gateway_label: latestGateGatewayLabel,
    session_key: latestGateSessionKey,
    failure_class: 'fix_loop_exhausted',
  };
}

export async function runBusterGateEvaluation(config, progress, gateId, opts = {}) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  const attempt = Number(opts.attempt || 1);
  const gateStartedAt = opts.gateStartedAt ?? Date.now();
  const remediation = opts.remediation || readGateRemediationSpec(opts.controlResult) || {};
  const correlation = remediation?.correlation || {};

  if (!opts.skipStartedTelemetry) {
    log('STEP', `═══════════════════════════════════════════════════════`);
    log('STEP', `  GATE: ${gate.title}`);
    log('STEP', `═══════════════════════════════════════════════════════`);
  }

  if (attempt === 1) {
    const existingCompletion = deps.readBusterGateCompletion(config, gateId, gate);
    if (existingCompletion.isPass) {
      log('OK', `Gate '${gateId}' already completed via output_file — skipping`);
      return buildBusterGateControlResult(config, gateId, gate, {
        exit: EXIT_OK,
        status: STATUS.PASS,
        completion_source: existingCompletion.source || null,
        attempt,
      }, { ...opts, input: { ids: { attempt } } });
    }
    const compatibilityGateStatus = String(existingCompletion.gateStatus?.data?.status || '').toUpperCase();
    if ((compatibilityGateStatus === 'PASS' || compatibilityGateStatus === 'OK') && !existingCompletion.output.isPass) {
      log('INFO', `Gate '${gateId}' gate-status.json reports ${compatibilityGateStatus}, but canonical output_file completion is missing — re-running`);
    }
    if (existingCompletion.output.exists && !existingCompletion.output.isPass) {
      const staleStatus = existingCompletion.output?.data?.status;
      if (staleStatus) {
        log('INFO', `Gate '${gateId}' output file exists but status is '${staleStatus}' — re-running`);
      }
    }

    if (gate.output_file) {
      const outPath = path.join(swarmRoot(config), gate.output_file);
      try {
        const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath);
        if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch { /* ok */ }
    }
    try {
      const gsp = gateStatusPath(config, gateId);
      const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gsp, { label: 'gate-status' });
      if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
      if (fs.existsSync(gsp)) fs.unlinkSync(gsp);
    } catch { /* ok */ }
  }

  let instructions;
  try {
    instructions = deps.readGateInstructions(config, gate);
  } catch (e) {
    log('ERROR', `Gate '${gateId}' instructions read failed: ${e.message}`);
    if (!opts.skipStartedTelemetry) {
      await onGateStarted(_telemetryCtx(config), gateId, gate);
    }
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      reason: `Gate '${gateId}' instructions read failed: ${e.message}`,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Buster Gate Setup Failed: ${gate.title}`,
          description: `Gate instructions could not be read: ${e.message}`,
          fields: buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_ERROR,
      reason: e.message,
      attempt,
    }, { ...opts, input: { ids: { attempt } } });
  }

  const busterGatePolicy = deps.resolvePolicy(config, progress, 'buster', {
    scopeModel: gate.model || null,
    dispatchPath: 'redis',
  });
  const model = busterGatePolicy.model;
  deps.logEffectivePolicy(config, { scope: 'gate_buster', agent: 'buster', gateId, ...busterGatePolicy });
  log('INFO', `Gate '${gateId}' model: ${model ?? '(none)'} [${busterGatePolicy.model_source}] thinking: not_supported_on_redis`);
  const timeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  const maxFixCycles = gate.max_fix_cycles ?? config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';

  if (!opts.skipStartedTelemetry) {
    await onGateStarted(_telemetryCtx(config), gateId, gate, {
      presentation: {
        discord: {
          level: 'INFO',
          title: `Gate: ${gate.title}`,
          description: `Starting buster gate${hasFixLoop ? ` (fix loop: max ${maxFixCycles})` : ''}`,
          fields: buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt }),
        },
      },
    });
  }

  const maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
  const gateRateLimitPauseState = createRateLimitPauseState();

  const result = await withSessionRateLimitRecovery(
    config,
    () => (deps.runOnce || _runBusterGateOnce)(deps, config, progress, gateId, gate, model, timeout, instructions, attempt),
    createTrackedGateSessionRateLimitRecoveryOptions(config, {
      sleepFn: deps.sleep,
      discordFn: deps.discord,
      gateId,
      gateType: gate.type,
      agentTypeFallback: gate.type || 'buster',
      runIdFallback: () => getRunId(config),
      attemptFallback: () => attempt,
      dispatchIdFallback: () => correlation.dispatch_id || null,
      gatewayLabelFallback: () => correlation.gateway_label || null,
      sessionKeyFallback: () => correlation.session_key || null,
      maxPauses: maxRateLimitPauses,
      pauseState: gateRateLimitPauseState,
      resumeDescription: `Resuming gate ${gateId}`,
      pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `Gate '${gateId}' rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
      resumeLogMessage: () => `Gate '${gateId}' rate limit cooldown complete — retrying (attempt stays at ${attempt} due to rate limit)`,
      exhaustedResultConfig: {
        exit: EXIT_RATE_LIMITED,
      },
    }),
  );

  const dispatchId = resolveStatusDispatchId(result.status, correlation.dispatch_id || null);
  const gatewayLabel = resolveStatusGatewayLabel(result.status, correlation.gateway_label || null);
  const sessionKey = resolveStatusSessionKey(result.status, correlation.session_key || null);

  if (result.ok) {
    log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
    getGateStats(config).gates_completed.push(gateId);

    try {
      const gsp = gateStatusPath(config, gateId);
      const gsDir = path.dirname(gsp);
      if (!fs.existsSync(gsDir)) fs.mkdirSync(gsDir, { recursive: true });
      fs.writeFileSync(gsp, JSON.stringify({
        status: 'PASS',
        gate: gateId,
        source: result.status?._source || 'unknown',
        completed_at: new Date().toISOString(),
        fix_cycles: attempt > 1 ? attempt - 1 : 0,
      }, null, 2) + '\n');
      await deps.gitCommitAndPush(config, `[pipeline] Gate '${gateId}' PASS (persisted)`, { softFail: true });
    } catch (e) {
      log('WARN', `Failed to persist gate-status.json for '${gateId}': ${e.message} (non-critical)`);
    }

    if (gate.output_file) {
      try {
        const outPath = path.join(swarmRoot(config), gate.output_file);
        if (!fs.existsSync(outPath)) {
          const outDir = path.dirname(outPath);
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(outPath, JSON.stringify({
            status: 'PASS',
            gate: gateId,
            source: result.status?._source || 'unknown',
            completed_at: new Date().toISOString(),
            fix_cycles: attempt > 1 ? attempt - 1 : 0,
          }, null, 2) + '\n');
          log('OK', `Gate '${gateId}' output_file written: ${relPath(config, outPath)}`);
        }
      } catch (e) {
        log('WARN', `Failed to write output_file for gate '${gateId}': ${e.message} (non-critical)`);
      }
    }

    onGatePass(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'OK',
          title: `Gate: ${gate.title} PASS`,
          description: attempt > 1 ? `Passed after ${attempt - 1} fix cycle(s)` : 'Passed on first run',
          fields: buildBusterGateDiscordFields({
            run_id: result.status?.run_id || getRunId(config),
            gate_id: gateId,
            gate_type: gate.type,
            attempt: result.status?.attempt ?? attempt,
            dispatch_id: dispatchId,
            gateway_label: gatewayLabel,
            session_key: sessionKey,
          }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_OK,
      status: STATUS.PASS,
      completion_source: result.status?._source || result.status?.source || null,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'config_invalid') {
    const err = result.status?.error || 'unknown (no error detail available)';
    log('ERROR', `Gate '${gateId}' config invalid: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' config invalid: ${err}`,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Config Invalid`,
          description: `Gate '${gateId}' config invalid: ${err}`,
          fields: buildBusterGateDiscordFields({ run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_NEEDS_NOVA,
      reason: err,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'config_invalid',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'spawn_failed') {
    const err = result.status?.error || 'unknown (no error detail available)';
    log('ERROR', `Gate '${gateId}' agent spawn failed: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' spawn failed: ${err}`,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Spawn Failed`,
          description: `Buster agent could not be spawned: ${err}`,
          fields: buildBusterGateDiscordFields({ run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_ERROR,
      reason: `Gate '${gateId}' spawn failed: ${err}`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'spawn_failed',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'parse_corrupted') {
    log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
    getGateStats(config).gates_failed.push(gateId);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' status file permanently corrupted`,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Parse Corrupted`,
          description: 'Gate status file is permanently unparseable after multiple attempts.',
          fields: buildBusterGateDiscordFields({ run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_NEEDS_NOVA,
      reason: `Gate '${gateId}' status file permanently corrupted`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'parse_corrupted',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'timeout') {
    log('ERROR', `Gate '${gateId}' timed out after ${timeout}min`);
    getGateStats(config).gates_failed.push(gateId);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' timed out`,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' TIMEOUT`,
          description: `Buster did not complete within ${timeout}min`,
          fields: buildBusterGateDiscordFields({ run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_TIMEOUT,
      reason: `Gate '${gateId}' timed out`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'timeout',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'git_error') {
    const err = result.status?.message || 'Polling git sync failed closed during gate execution';
    log('ERROR', `Gate '${gateId}' polling git sync failed closed: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Polling Git Unsafe`,
          description: err.slice(0, 300),
          fields: buildBusterGateDiscordFields({ run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      exit: EXIT_ERROR,
      reason: err,
      polling_git: result.status?.details || result.status || null,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'git_error',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'rate_limit_exhausted') {
    const exhaustedReason = `Gate '${gateId}' exceeded max rate limit pauses`;
    const gateRateLimitExit = await finalizeGateSessionRateLimitExit(result, {
      config,
      gateId,
      gateType: gate.type,
      phase: 'buster_gate',
      exhaustedReason,
      runIdFallback: getRunId(config),
      attemptFallback: attempt,
      dispatchIdFallback: dispatchId,
      gatewayLabelFallback: gatewayLabel,
      sessionKeyFallback: sessionKey,
      maxPausesFallback: maxRateLimitPauses,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: _telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: `Gate '${gateId}' Rate Limit Exhausted`,
      discordDescription: (exitResult) => `Gate attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        fix_cycle: attempt > 1 ? attempt - 1 : 0,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Gate '${gateId}' Rate Limit Exhausted`,
            description: `Gate attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
            fields: buildBusterGateDiscordFields({
              run_id: getRunId(config),
              gate_id: gateId,
              gate_type: gate.type,
              attempt: exitResult.attempt,
              dispatch_id: exitResult.dispatch_id,
              gateway_label: exitResult.gateway_label,
              session_key: exitResult.session_key,
            }),
          },
        },
      }),
      logMessage: `Gate '${gateId}' rate limit pauses exhausted`,
      logLevel: 'ERROR',
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      ...gateRateLimitExit,
      failure_class: 'rate_limit_exhausted',
      attempt: gateRateLimitExit.attempt ?? attempt,
      dispatch_id: gateRateLimitExit.dispatch_id ?? dispatchId,
      gateway_label: gateRateLimitExit.gateway_label ?? gatewayLabel,
      session_key: gateRateLimitExit.session_key ?? sessionKey,
    }, { ...opts, input: { ids: { attempt } } });
  }

  const failData = result.status || {};
  const issues = extractGateIssues(failData);
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';

  log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

  if (hasFixLoop) {
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      issues_count: issues.length,
      fix_cycle: attempt - 1,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: failReason,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'WARN',
          title: `Gate '${gateId}' FAIL`,
          description: `Buster found ${issues.length} issue(s). Entering the shared request_fix remediation handoff.`,
          fields: buildBusterGateDiscordFields({
            run_id: getRunId(config),
            gate_id: gateId,
            gate_type: gate.type,
            attempt,
            dispatch_id: dispatchId,
            gateway_label: gatewayLabel,
            session_key: sessionKey,
          }),
        },
      },
    });
    return buildBusterRequestFixControlResult(config, gateId, gate, result, issues, {
      attempt,
      maxFixCycles,
      gateStartedAt,
      dispatchId,
      gatewayLabel,
      sessionKey,
    });
  }

  getGateStats(config).gates_failed.push(gateId);
  onGateFail(_telemetryCtx(config), gateId, {
    gate_type: gate.type,
    issues_count: issues.length,
    fix_cycle: 0,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: failReason,
    dispatch_id: dispatchId,
    session_key: sessionKey,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate '${gateId}' FAIL`,
        description: `Agent reported failure: ${failReason}`,
        fields: buildBusterGateDiscordFields({ run_id: failData?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: failData?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
      },
    },
  });
  return buildBusterGateControlResult(config, gateId, gate, {
    exit: EXIT_NEEDS_NOVA,
    reason: `Gate '${gateId}' failed: ${failReason}`,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    failure_class: 'verdict_fail',
    remaining_issues: issues,
    attempt,
    dispatch_id: dispatchId,
  }, { ...opts, input: { ids: { attempt } } });
}

export async function runBusterGateFixAttempt(config, progress, gateId, controlResult, opts = {}) {
  const deps = getDeps(config);
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  const remediation = readGateRemediationSpec(controlResult) || {};
  const cycle = Number(opts.cycle || remediation?.policy?.nextFixCycle || 1);
  const maxFixCycles = Number(remediation?.policy?.maxFixCycles || gate.max_fix_cycles || config.default_max_fails || 1);
  const gateStartedAt = opts.gateStartedAt ?? (remediation?.startedAt ? new Date(remediation.startedAt).getTime() : Date.now());
  const issues = remediation?.diagnostics?.issues || [];
  const fixHistory = opts.fixHistory || [];

  const gateDispatchId = remediation?.correlation?.dispatch_id || null;
  const gateGatewayLabel = remediation?.correlation?.gateway_label || null;
  const gateSessionKey = remediation?.correlation?.session_key || null;

  log('STEP', `Gate '${gateId}' fix cycle ${cycle}/${maxFixCycles}`);
  await deps.discord(config, 'WARN', `Gate '${gateId}' FAIL — Auto-Fix`,
    `Attempt ${cycle}/${maxFixCycles}. Spawning Forge to fix ${issues.length} issue(s).

**Issues:**
${issues.slice(0, 5).map(i => `• ${i.title}`).join('\n') || 'No details available'}`,
    buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: gateGatewayLabel, session_key: gateSessionKey, dispatch_id: gateDispatchId })
  );

  const fixPromptResult = deps.buildGateFixPrompt(config, gate, issues, cycle, maxFixCycles, fixHistory);
  const fixPrompt = fixPromptResult.prompt;
  let fixSessionKey = null;
  let fixGatewayLabel = null;
  let fixDispatchId = null;
  const resolveFixCycleSessionKey = () => fixSessionKey || gateSessionKey || null;
  const resolveFixCycleGatewayLabel = () => fixGatewayLabel || gateGatewayLabel || null;
  const resolveFixCycleDispatchId = () => fixDispatchId || gateDispatchId || null;

  const fixStart = await startGateForgeFixCycleScaffold({
    config,
    progress,
    deps,
    gateId,
    gate,
    cycle,
    fixPrompt,
    fixLabelPrefix: 'gatefix',
    policyScope: 'gate_forge_fix',
    initialCorrelation: {
      sessionKey: gateSessionKey,
      gatewayLabel: gateGatewayLabel,
      dispatchId: gateDispatchId,
    },
    clearActiveSessionBeforeSpawn: true,
    buildActiveSessionExtra: ({ correlation }) => ({
      phase: 'buster_gate_fix',
      gate_type: gate.type,
      attempt: cycle,
      dispatch_id: correlation.dispatchId || null,
    }),
  });
  const fixLabel = fixStart.fixLabel;
  fixSessionKey = fixStart.correlation.sessionKey;
  fixGatewayLabel = fixStart.correlation.gatewayLabel;
  fixDispatchId = fixStart.correlation.dispatchId;

  if (!fixStart.ok && fixStart.stage === 'spawn') {
    const e = fixStart.error;
    log('ERROR', `Forge spawn for gate fix failed: ${e.message}`);
    await deps.discord(config, 'CRITICAL', 'Gate Fix: Forge Spawn Failed',
      `Attempt ${cycle}/${maxFixCycles}. Error: ${e.message}`,
      buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: e.gateway_label || resolveFixCycleGatewayLabel(), session_key: resolveFixCycleSessionKey(), dispatch_id: resolveFixCycleDispatchId() })
    );
    await emitBusterGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, `Gate fix Forge spawn failed: ${e.message}`, {
      issues_count: issues.length,
      session_key: resolveFixCycleSessionKey(),
    });
    return { mode: 'retry_request_fix', controlResult };
  }

  if (!fixStart.ok && fixStart.stage === 'health_check') {
    log('WARN', 'Forge health check failed for gate fix — skipping to next attempt');
    await deps.discord(config, 'WARN', 'Gate Fix: Forge Not Responding',
      `Attempt ${cycle}/${maxFixCycles}. Forge spawned but health check failed. Retrying.`,
      buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: resolveFixCycleGatewayLabel(), session_key: resolveFixCycleSessionKey(), dispatch_id: resolveFixCycleDispatchId() })
    );
    await emitBusterGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, 'Gate fix Forge health check failed', {
      issues_count: issues.length,
      session_key: resolveFixCycleSessionKey(),
    });
    return { mode: 'retry_request_fix', controlResult };
  }

  await deps.discord(config, 'INFO', 'Gate Fix: Forge Working',
    `Attempt ${cycle}/${maxFixCycles}. Forge is fixing ${issues.length} issue(s).

**Fixing:**
${issues.slice(0, 5).map(i => `• ${i.title}`).join('\n') || 'No details available'}`,
    buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: resolveFixCycleGatewayLabel(), session_key: resolveFixCycleSessionKey(), dispatch_id: resolveFixCycleDispatchId() })
  );

  const forgeTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
  const { sessionResult } = await finishGateForgeFixCycleScaffold({
    config,
    deps,
    gateId,
    gate,
    cycle,
    fixLabel,
    fixAcpLabel: fixStart.fixAcpLabel,
    timeoutMinutes: forgeTimeout,
    artifactLogLabel: 'Gate fix',
  });

  const nextControlResult = patchBusterRemediationControlResult(controlResult, {
    diagnostics: {
      last_fix_cycle: {
        dispatch_id: resolveFixCycleDispatchId(),
        gateway_label: resolveFixCycleGatewayLabel(),
        session_key: resolveFixCycleSessionKey(),
      },
    },
    metadata: {
      last_fix_cycle: {
        dispatch_id: resolveFixCycleDispatchId(),
        gateway_label: resolveFixCycleGatewayLabel(),
        session_key: resolveFixCycleSessionKey(),
      },
    },
  });

  if (sessionResult.reason === 'rate_limit_exhausted') {
    const exhaustedReason = `Gate fix '${fixLabel}' exceeded max rate limit pauses`;
    const gateFixRateLimitExit = await finalizeGateSessionRateLimitExit(sessionResult, {
      config,
      gateId,
      gateType: gate.type,
      phase: 'buster_gate_fix',
      exhaustedReason,
      runIdFallback: getRunId(config),
      attemptFallback: cycle,
      dispatchIdFallback: resolveFixCycleDispatchId(),
      gatewayLabelFallback: resolveFixCycleGatewayLabel(),
      sessionKeyFallback: resolveFixCycleSessionKey(),
      maxPausesFallback: config.rate_limit?.max_pauses_per_module ?? 5,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: _telemetryCtx(config),
      runId: getRunId(config),
      discordFn: deps.discord,
      discordTitle: `Gate Fix Rate Limit Exhausted: ${gateId}`,
      discordDescription: (exitResult) => `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
      beforeReturn: () => {
        getGateStats(config).gates_failed.push(gateId);
      },
      gateFailureData: (exitResult) => ({
        issues_count: issues.length,
        fix_cycle: cycle,
        duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Gate Fix Rate Limit Exhausted: ${gateId}`,
            description: `Fix attempt ${exitResult.attempt} exceeded max ACP rate limit pauses (${exitResult.max_rate_limit_pauses}).`,
            fields: buildBusterGateDiscordFields({
              run_id: getRunId(config),
              gate_id: gateId,
              gate_type: gate.type,
              attempt: exitResult.attempt,
              dispatch_id: exitResult.dispatch_id,
              gateway_label: exitResult.gateway_label,
              session_key: exitResult.session_key,
            }),
          },
        },
      }),
      logMessage: `Gate fix '${fixLabel}' rate limit pauses exhausted`,
      logLevel: 'ERROR',
    });
    return {
      mode: 'terminal',
      result: {
        ...gateFixRateLimitExit,
        failure_class: 'rate_limit_exhausted',
      },
    };
  }

  fixHistory.push({ attempt: cycle, hasChanges: sessionResult.hasChanges, issues });

  if (!sessionResult.hasChanges) {
    const transcript = sessionResult.transcript;
    const transcriptActive = transcriptShowsProgress(transcript);
    const reason = sessionResult.completed ? (transcriptActive ? 'no file changes' : 'no changes (crashed?)') : 'timeout';
    const transcriptField = transcript
      ? (transcriptActive ? `active (${transcript.eventCount} events)` : `stale (no activity for ${transcript.lastActivityPoll} polls)`)
      : 'unknown';
    log('WARN', `Gate fix '${fixLabel}' ${reason}. Skipping retest.`);
    await deps.discord(config, 'WARN', `Gate Fix ${reason}: ${gateId}`,
      `Fix attempt ${cycle}/${maxFixCycles} produced no usable output.`, [
        ...buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: resolveFixCycleGatewayLabel(), session_key: resolveFixCycleSessionKey(), dispatch_id: resolveFixCycleDispatchId() }),
        { name: 'Transcript', value: transcriptField },
      ]);
    await emitBusterGateFixCycleFail(config, gateId, gate.type, cycle, gateStartedAt, `Gate fix produced no usable output (${reason})`, {
      issues_count: issues.length,
      session_key: resolveFixCycleSessionKey(),
    });
    return { mode: 'retry_request_fix', controlResult: nextControlResult };
  }

  await deps.gitCommitAndPush(config, `[pipeline] Gate fix: ${gateId} attempt ${cycle}`, { softFail: true });

  if (gate.output_file) {
    const outPath = path.join(swarmRoot(config), gate.output_file);
    try {
      const archived = deps.archiveGateOutputIfPresent(config, gateId, outPath, { attempt: cycle });
      if (archived) log('INFO', `Archived previous gate output: ${relPath(config, archived)}`);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch { /* ok */ }
  }
  const gateStatusFile = gateStatusPath(config, gateId);
  try {
    const archivedStatus = deps.archiveGateOutputIfPresent(config, gateId, gateStatusFile, { attempt: cycle, label: 'gate-status' });
    if (archivedStatus) log('INFO', `Archived previous gate status: ${relPath(config, archivedStatus)}`);
    if (fs.existsSync(gateStatusFile)) fs.unlinkSync(gateStatusFile);
  } catch { /* ok */ }

  await deps.discord(config, 'INFO', 'Gate Fix: Retesting with Buster',
    `Forge fix attempt ${cycle}/${maxFixCycles} committed. Running Buster gate again...

**Previous failures:**
${issues.slice(0, 3).map(i => `• ${i.title}`).join('\n') || 'unknown'}`,
    buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: cycle, gateway_label: resolveFixCycleGatewayLabel(), session_key: resolveFixCycleSessionKey(), dispatch_id: resolveFixCycleDispatchId() })
  );

  return { mode: 're_evaluate', controlResult: nextControlResult };
}

export async function runBusterGate(config, progress, gateId) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found`);

  const gateStartedAt = Date.now();
  const maxFixCycles = gate.max_fix_cycles ?? config.default_max_fails;
  const hasFixLoop = gate.on_fail === 'fix_and_retest';
  const fixHistory = [];

  if (hasFixLoop && maxFixCycles < 1) {
    const reason = `Gate '${gateId}' ended unexpectedly`;
    log('ERROR', reason);
    getGateStats(config).gates_failed.push(gateId);
    await onGateStarted(_telemetryCtx(config), gateId, gate);
    onGateFail(_telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Ended Unexpectedly`,
          description: 'Buster gate loop exited without a terminal outcome. Manual review required.',
          fields: buildBusterGateDiscordFields({ run_id: getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: 1 }),
        },
      },
    });
    return {
      exit: EXIT_NEEDS_NOVA,
      reason,
      gate: gateId,
      gate_id: gateId,
      gate_type: gate.type,
      failure_class: 'unexpected_exit',
    };
  }

  const initialControlResult = await runBusterGateEvaluation(config, progress, gateId, {
    attempt: 1,
    gateStartedAt,
    skipStartedTelemetry: false,
  });

  return runRemediableGateControlLoop({
    initialControlResult,
    evaluateGate: ({ attempt, controlResult: remediationControlResult, remediation }) => runBusterGateEvaluation(config, progress, gateId, {
      attempt,
      gateStartedAt,
      skipStartedTelemetry: true,
      remediation,
      controlResult: remediationControlResult,
    }),
    performFix: ({ controlResult: remediationControlResult, cycle }) => runBusterGateFixAttempt(config, progress, gateId, remediationControlResult, {
      cycle,
      gateStartedAt,
      fixHistory,
    }),
    extractLegacyResult: extractBusterGateLegacyResult,
    buildExhaustedLegacyResult: ({ controlResult: remediationControlResult }) =>
      buildBusterRemediationExhaustedLegacyResult(config, gateId, gate, remediationControlResult, { gateStartedAt }),
    gateId,
    gate,
  });
}

export async function runBusterGateStage(config, progress, gateId, opts = {}) {
  return runBusterGateEvaluation(config, progress, gateId, opts);
}
