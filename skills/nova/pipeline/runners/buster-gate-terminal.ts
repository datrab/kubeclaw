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

export function assertBusterGateEvaluationResult(result = {}) {
  const status = result?.status || {};
  if (result?.ok === true) {
    const passReason = String(result?.reason || '').trim();
    const statusValue = String(status?.status || '').trim().toUpperCase();
    if (passReason !== 'target_reached' || statusValue !== STATUS.PASS) {
      return Object.freeze({
        type: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
        result,
        status: {
          ...status,
          reason: status?.reason || `Buster gate pass payload invalid: reason=${passReason || '(missing)'} status=${statusValue || '(missing)'}`,
          invalid_reason: 'invalid_pass_payload',
          raw_reason: passReason || null,
        },
        reason: passReason || null,
      });
    }
    return Object.freeze({
      type: BUSTER_GATE_EVALUATION_RESULT_TYPES.PASS,
      result,
      status,
      reason: null,
    });
  }
  const rawReason = String(result?.reason || '').trim();
  const type = BUSTER_GATE_REASON_TO_EVALUATION_TYPE[rawReason];
  if (!type) {
    const invalidReason = rawReason ? 'unknown_reason' : 'missing_reason';
    return Object.freeze({
      type: BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT,
      result,
      status: {
        ...status,
        reason: status?.reason || `Buster gate result has ${invalidReason}: ${rawReason || '(missing)'}`,
        invalid_reason: invalidReason,
        raw_reason: rawReason || null,
      },
      reason: rawReason || null,
    });
  }
  return Object.freeze({
    type,
    result,
    status,
    reason: rawReason || null,
  });
}

function describeNonVerdictCompletionFailure(gateId, reason, status = {}) {
  if (reason === 'completion_conflict') {
    return status.reason || status.summary || `Gate '${gateId}' completion conflict`;
  }
  if (reason === 'completion_archive_failed') {
    return status.reason || status.error || `Gate '${gateId}' completion archive failed`;
  }
  if (reason === 'completion_event_adapter_failed') {
    return status.reason || status.error || `Gate '${gateId}' completion event adapter failed`;
  }
  return status.reason || status.error || `Gate '${gateId}' completion event unresolved`;
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
  const dispatchId = resolveStatusDispatchId(resultStatus) ?? correlation.dispatch_id ?? null;
  const gatewayLabel = resolveStatusGatewayLabel(resultStatus) ?? correlation.gateway_label ?? null;
  const sessionKey = resolveStatusSessionKey(resultStatus) ?? correlation.session_key ?? null;

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
            attempt: resultStatus?.attempt ?? attempt,
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
      completion_source: resultStatus?._source || resultStatus?.source || null,
      attempt,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.CONFIG_INVALID) {
    const err = resultStatus?.error || 'unknown (no error detail available)';
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: resultStatus?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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

  if (evaluation.type === BUSTER_GATE_EVALUATION_RESULT_TYPES.SPAWN_FAILED) {
    const err = resultStatus?.error || 'unknown (no error detail available)';
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: resultStatus?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
    const invalid = resultStatus || {};
    const err = invalid.reason || `Gate '${gateId}' output contract invalid`;
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
            attempt: invalid.attempt ?? attempt,
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: resultStatus?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: resultStatus?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
    const err = resultStatus?.message || 'Polling git sync failed closed during gate execution';
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: resultStatus?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
        },
      },
    });
    return buildBusterGateControlResult(config, gateId, gate, {
      reason: err,
      polling_git: resultStatus?.details || resultStatus || null,
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
    return buildBusterGateControlResult(config, gateId, gate, {
      ...gateRateLimitExit,
      failure_class: 'rate_limit_exhausted',
      outcome_class: 'rate_limited',
      attempt: gateRateLimitExit.attempt ?? attempt,
      dispatch_id: gateRateLimitExit.dispatch_id ?? dispatchId,
      gateway_label: gateRateLimitExit.gateway_label ?? gatewayLabel,
      session_key: gateRateLimitExit.session_key ?? sessionKey,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (NON_VERDICT_COMPLETION_EVALUATION_TYPES.has(evaluation.type)) {
    const completionStatus = resultStatus || {};
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
            attempt: completionStatus.attempt ?? attempt,
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

  const failData = resultStatus || {};
  const issues = extractGateIssues(failData);
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';

  log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

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
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt: failData?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
