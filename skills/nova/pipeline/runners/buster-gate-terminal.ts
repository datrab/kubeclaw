import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/buster-gate-terminal.js — Buster gate terminal/result handling
// Owns post-attempt PASS/FAIL/rate-limit presentation and typed-control mapping.
// The runner still owns setup, dispatch, polling loop, and remediation controller wiring.

import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { onGatePass, onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { finalizeGateSessionRateLimitExit } from '../services/rate-limit.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../services/correlation.ts';

export const BUSTER_GATE_EVALUATION_RESULT_TYPES = Object.freeze({
  PASS: 'pass',
  CONFIG_INVALID: 'config_invalid',
  COMMIT_HASH_MISSING: 'commit_hash_missing',
  SPAWN_FAILED: 'spawn_failed',
  INVALID_CONTRACT: 'invalid_contract',
  PARSE_CORRUPTED: 'parse_corrupted',
  TIMEOUT: 'timeout',
  GIT_ERROR: 'git_error',
  RATE_LIMIT_EXHAUSTED: 'rate_limit_exhausted',
  COMPLETION_ARCHIVE_FAILED: 'completion_archive_failed',
  COMPLETION_CONFLICT: 'completion_conflict',
  COMPLETION_EVENT_ADAPTER_FAILED: 'completion_event_adapter_failed',
  COMPLETION_EVENT_UNRESOLVED: 'completion_event_unresolved',
  VERDICT_FAIL: 'verdict_fail',
});

const BUSTER_GATE_REASON_TO_EVALUATION_TYPE = Object.freeze({
  config_invalid: BUSTER_GATE_EVALUATION_RESULT_TYPES.CONFIG_INVALID,
  commit_hash_missing: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMMIT_HASH_MISSING,
  spawn_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.SPAWN_FAILED,
  invalid_contract: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
  parse_corrupted: BUSTER_GATE_EVALUATION_RESULT_TYPES.PARSE_CORRUPTED,
  timeout: BUSTER_GATE_EVALUATION_RESULT_TYPES.TIMEOUT,
  git_error: BUSTER_GATE_EVALUATION_RESULT_TYPES.GIT_ERROR,
  rate_limit_exhausted: BUSTER_GATE_EVALUATION_RESULT_TYPES.RATE_LIMIT_EXHAUSTED,
  completion_archive_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_ARCHIVE_FAILED,
  completion_conflict: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_CONFLICT,
  completion_event_adapter_failed: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_ADAPTER_FAILED,
  completion_event_unresolved: BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_UNRESOLVED,
  verdict_fail: BUSTER_GATE_EVALUATION_RESULT_TYPES.VERDICT_FAIL,
});

const NON_VERDICT_COMPLETION_EVALUATION_TYPES = new Set([
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_ARCHIVE_FAILED,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_CONFLICT,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_ADAPTER_FAILED,
  BUSTER_GATE_EVALUATION_RESULT_TYPES.COMPLETION_EVENT_UNRESOLVED,
]);

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function gateEvaluationAttempt(statusRecord, requestAttempt) {
  return selectPresentValue(statusRecord?.attempt, requestAttempt);
}

function gateRateLimitExitIdentity(exitResult, requestIdentity) {
  return {
    attempt: selectPresentValue(exitResult?.attempt, requestIdentity.attempt),
    dispatch_id: selectPresentValue(exitResult?.dispatch_id, requestIdentity.dispatch_id),
    gateway_label: selectPresentValue(exitResult?.gateway_label, requestIdentity.gateway_label),
    session_key: selectPresentValue(exitResult?.session_key, requestIdentity.session_key),
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function issueTitles(issues) {
  const titles = arrayValue(issues)
    .map((issue) => objectRecord(issue)?.title)
    .filter(Boolean);
  return selectTruthyValue(() => (titles.join('; ')), () => ('missing_error_detail'));
}

export function assertBusterGateEvaluationResult(result = {}) {
  const status = selectDefinedValue(() => (objectRecord(result?.status)), () => ({}));
  if (result?.ok === true) {
    const passReason = selectDefinedValue(() => (nonEmptyString(result?.reason)), () => (''));
    const statusValue = (selectDefinedValue(() => (nonEmptyString(status?.status)), () => (''))).toUpperCase();
    if (selectTruthyValue(() => (passReason !== 'target_reached'), () => (statusValue !== STATUS.PASS))) {
      const passReasonDisplay = selectTruthyValue(() => (passReason), () => ('(missing)'));
      const statusValueDisplay = selectTruthyValue(() => (statusValue), () => ('(missing)'));
      return Object.freeze({
        type: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
        result,
        status: {
          ...status,
          reason: selectDefinedValue(() => (status?.reason), () => (`Buster gate pass payload invalid: reason=${passReasonDisplay} status=${statusValueDisplay}`)),
          invalid_reason: 'invalid_pass_payload',
          raw_reason: selectTruthyValue(() => (passReason), () => (null)),
        },
        reason: selectTruthyValue(() => (passReason), () => (null)),
      });
    }
    return Object.freeze({
      type: BUSTER_GATE_EVALUATION_RESULT_TYPES.PASS,
      result,
      status,
      reason: null,
    });
  }
  const rawReason = selectDefinedValue(() => (nonEmptyString(result?.reason)), () => (''));
  const type = BUSTER_GATE_REASON_TO_EVALUATION_TYPE[rawReason];
  if (!type) {
    const invalidReason = rawReason ? 'unsupported_reason' : 'missing_reason';
    const rawReasonDisplay = selectTruthyValue(() => (rawReason), () => ('(missing)'));
    return Object.freeze({
      type: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
      result,
      status: {
        ...status,
        reason: selectDefinedValue(() => (status?.reason), () => (`Buster gate result has ${invalidReason}: ${rawReasonDisplay}`)),
        invalid_reason: invalidReason,
        raw_reason: selectTruthyValue(() => (rawReason), () => (null)),
      },
      reason: selectTruthyValue(() => (rawReason), () => (null)),
    });
  }
  return Object.freeze({
    type,
    result,
    status,
    reason: selectTruthyValue(() => (rawReason), () => (null)),
  });
}

function describeNonVerdictCompletionFailure(gateId, reason, status = {}) {
  if (reason === 'completion_conflict') {
    return selectPresentValue(status.reason, status.summary, `Gate '${gateId}' completion conflict`);
  }
  if (reason === 'completion_archive_failed') {
    return selectPresentValue(status.reason, status.error, `Gate '${gateId}' completion archive failed`);
  }
  if (reason === 'completion_event_adapter_failed') {
    return selectDefinedValue(() => (selectDefinedValue(() => (status.reason), () => (status.error))), () => (`Gate '${gateId}' completion event adapter failed`));
  }
  return selectPresentValue(status.reason, status.error, `Gate '${gateId}' completion event unresolved`);
}

function busterGateHasK8sInfraFailure(status = {}) {
  const suites = selectDefinedValue(() => (selectDefinedValue(() => (objectRecord(status?.verdict?.suites)), () => (objectRecord(status?.suites)))), () => ({}));
  const k8sSuite = suites?.k8s;
  const k8sResult = Array.isArray(status?.results) ? status.results.find((entry) => entry?.suite === 'k8s') : null;
  const suiteFindings = [
    ...(Array.isArray(k8sSuite?.findings) ? k8sSuite.findings : []),
    ...arrayValue(k8sResult?.findings),
  ];
  return suiteFindings.some((finding) => {
    const record = selectDefinedValue(() => (objectRecord(finding)), () => ({}));
    const rule = selectDefinedValue(() => (nonEmptyString(record.rule)), () => (''));
    const message = selectDefinedValue(() => (nonEmptyString(record.message)), () => (''));
    return selectTruthyValue(() => (selectTruthyValue(() => (rule === 'k8s-capability-preflight'), () => (message.includes('k8s-capability-preflight failed')))), () => (message.includes('returned HTML instead of Kubernetes API data')));
  });
}

export async function handleBusterGateEvaluationResult({
  config,
  deps,
  gateId,
  gate,
  result,
  attempt,
  opts = {},
  correlation = {},
  timeout,
  maxRateLimitPauses,
  maxFixCycles,
  hasFixLoop,
  gateStartedAt,
  callbacks = {},
}) {
  const {
    getGateStats,
    buildBusterGateControlResult,
    buildBusterRequestFixControlResult,
    extractGateIssues,
    telemetryCtx,
  } = callbacks;
  const evaluation = assertBusterGateEvaluationResult(result);
  const resultStatus = evaluation.status;
  const resultReason = evaluation.reason;
  const runId = getRunId(config);
  const dispatchId = selectDefinedValue(() => (resolveStatusDispatchId(resultStatus)), () => (null));
  const gatewayLabel = selectDefinedValue(() => (resolveStatusGatewayLabel(resultStatus)), () => (null));
  const sessionKey = selectDefinedValue(() => (resolveStatusSessionKey(resultStatus)), () => (null));

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.PASS) {
    log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
    getGateStats(config).gates_completed.push(gateId);

    await onGatePass(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'OK',
          title: `Gate: ${gate.title} PASS`,
          description: attempt > 1 ? `Passed after ${attempt - 1} fix cycle(s)` : 'Passed on first run',
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: runId,
            gate_id: gateId,
            gate_type: gate.type,
            attempt: attempt,
            dispatch_id: dispatchId,
            gateway_label: gatewayLabel,
            session_key: sessionKey,
          }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      status: STATUS.PASS,
      passed: true,
      outcome_class: 'passed',
      completion_source: selectTruthyValue(() => (selectTruthyValue(() => (resultStatus?._source), () => (resultStatus?.source))), () => (null)),
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.CONFIG_INVALID) {
    const err = selectDefinedValue(() => (resultStatus?.error), () => ('missing_error_detail'));
    log('ERROR', `Gate '${gateId}' config invalid: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' config invalid: ${err}`,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Config Invalid`,
          description: `Gate '${gateId}' config invalid: ${err}`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'config_invalid',
      outcome_class: 'needs_nova',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.COMMIT_HASH_MISSING) {
    const err = selectDefinedValue(() => (resultStatus?.error), () => (`Gate '${gateId}' Buster dispatch requires commit_hash`));
    log('ERROR', `Gate '${gateId}' commit identity missing: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Commit Identity Missing`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'commit_hash_missing',
      outcome_class: 'needs_nova',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.SPAWN_FAILED) {
    const err = selectDefinedValue(() => (resultStatus?.error), () => ('missing_error_detail'));
    log('ERROR', `Gate '${gateId}' agent spawn failed: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' spawn failed: ${err}`,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Spawn Failed`,
          description: `Buster agent could not be spawned: ${err}`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: `Gate '${gateId}' spawn failed: ${err}`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'spawn_failed',
      outcome_class: 'error',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT) {
    const invalid = selectDefinedValue(() => (objectRecord(resultStatus)), () => ({}));
    const err = selectDefinedValue(() => (invalid.reason), () => (`Gate '${gateId}' output contract invalid`));
    log('ERROR', `Gate '${gateId}' output contract invalid: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Invalid Output`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: runId,
            gate_id: gateId,
            gate_type: gate.type,
            attempt: gateEvaluationAttempt(invalid, attempt),
            dispatch_id: dispatchId,
            gateway_label: gatewayLabel,
            session_key: sessionKey,
          }, [
            ...(invalid.invalid_reason ? [{ name: 'Invalid Reason', value: String(invalid.invalid_reason).slice(0, 200), inline: true }] : []),
          ]),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'invalid_contract',
      outcome_class: 'error',
      status: invalid,
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.PARSE_CORRUPTED) {
    log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' status file permanently corrupted`,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Parse Corrupted`,
          description: 'Gate status file is permanently unparseable after multiple attempts.',
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: `Gate '${gateId}' status file permanently corrupted`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'parse_corrupted',
      outcome_class: 'needs_nova',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.TIMEOUT) {
    log('ERROR', `Gate '${gateId}' timed out after ${timeout}min`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: `Gate '${gateId}' timed out`,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' TIMEOUT`,
          description: `Buster did not complete within ${timeout}min`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: `Gate '${gateId}' timed out`,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'timeout',
      outcome_class: 'timeout',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.GIT_ERROR) {
    const err = selectDefinedValue(() => (resultStatus?.message), () => ('Polling git sync failed closed during gate execution'));
    log('ERROR', `Gate '${gateId}' polling git sync failed closed: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Polling Git Unsafe`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      polling_git: selectTruthyValue(() => (selectTruthyValue(() => (resultStatus?.details), () => (resultStatus))), () => (null)),
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'git_error',
      outcome_class: 'error',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.RATE_LIMIT_EXHAUSTED) {
    const exhaustedReason = `Gate '${gateId}' exceeded max rate limit pauses`;
    const gateRateLimitExit = await finalizeGateSessionRateLimitExit(result, {
      config,
      gateId,
      gateType: gate.type,
      phase: 'buster_gate',
      exhaustedReason,
      identity: {
        run_id: runId,
        attempt,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      maxPauses: maxRateLimitPauses,
      reason: exhaustedReason,
      resultOverrides: { outcome_class: 'rate_limited' },
      telemetryCtx: telemetryCtx(config),
      runId,
      discordFn: (discordConfig, level, title, description, fields, discordOpts) => deps.discord(discordConfig, level, title, description, fields, discordOpts),
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
            fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
              run_id: runId,
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
    const gateRateLimitExitIdentityValues = gateRateLimitExitIdentity(gateRateLimitExit, {
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      ...gateRateLimitExit,
      failure_class: 'rate_limit_exhausted',
      outcome_class: 'rate_limited',
      ...gateRateLimitExitIdentityValues,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (NON_VERDICT_COMPLETION_EVALUATION_TYPES.has(evaluation.type)) {
    const completionStatus = selectDefinedValue(() => (objectRecord(resultStatus)), () => ({}));
    const err = describeNonVerdictCompletionFailure(gateId, resultReason, completionStatus);
    log('ERROR', `Gate '${gateId}' completion failed before verdict: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Completion Failed`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: runId,
            gate_id: gateId,
            gate_type: gate.type,
            attempt: gateEvaluationAttempt(completionStatus, attempt),
            dispatch_id: dispatchId,
            gateway_label: gatewayLabel,
            session_key: sessionKey,
          }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      status: completionStatus,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: resultReason,
      outcome_class: 'error',
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  const failData = selectDefinedValue(() => (objectRecord(resultStatus)), () => ({}));
  const issues = extractGateIssues(failData);
  const failReason = issueTitles(issues);

  log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

  if (busterGateHasK8sInfraFailure(failData)) {
    const reason = `Gate '${gateId}' blocked by Kubernetes infrastructure preflight: ${failReason}`;
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      issues_count: issues.length,
      fix_cycle: attempt - 1,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason,
      gateway_label: gatewayLabel,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Kubernetes Infra Unavailable`,
          description: reason.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: runId,
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
    return buildBusterGateControlResult(config, gateId, gate, {
      reason,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'k8s_infra_unavailable',
      outcome_class: 'error',
      remaining_issues: issues,
      status: failData,
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (hasFixLoop) {
    await onGateFail(telemetryCtx(config), gateId, {
      run_id: runId,
      gate_type: gate.type,
      issues_count: issues.length,
      fix_cycle: attempt - 1,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: failReason,
      gateway_label: gatewayLabel,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'WARN',
          title: `Gate '${gateId}' FAIL`,
          description: `Buster found ${issues.length} issue(s). Entering the shared request_fix remediation handoff.`,
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: runId,
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
    return buildBusterRequestFixControlResult(config, gateId, gate, failData, issues, {
      remediationPolicy: {
        maxFixCycles,
        nextFixCycle: attempt,
        rerunStageId: 'gate:buster',
      },
      gateStartedAt,
      dispatchId,
      gatewayLabel,
      sessionKey,
    });
  }

  getGateStats(config).gates_failed.push(gateId);
  await onGateFail(telemetryCtx(config), gateId, {
    run_id: runId,
    gate_type: gate.type,
    issues_count: issues.length,
    fix_cycle: 0,
    duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
    reason: failReason,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: `Gate '${gateId}' FAIL`,
        description: `Agent reported failure: ${failReason}`,
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
      },
    },
  });
  return buildBusterGateControlResult(config, gateId, gate, {
    reason: `Gate '${gateId}' failed: ${failReason}`,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    failure_class: 'verdict_fail',
    outcome_class: 'needs_nova',
    remaining_issues: issues,
    attempt,
    dispatch_id: dispatchId,
  }, { ...opts, input: { ids: { attempt } } });
}
