// runners/buster-gate-terminal.js — Buster gate terminal/result handling
// Owns post-attempt PASS/FAIL/rate-limit presentation and typed-control mapping.
// The runner still owns setup, dispatch, polling loop, and remediation controller wiring.

import { log } from '../core/logger.ts';
import { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_TIMEOUT, EXIT_RATE_LIMITED } from '../core/constants.ts';
import { getRunId } from '../core/runtime.ts';
import { onGatePass, onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { finalizeGateSessionRateLimitExit } from '../services/rate-limit.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../services/correlation.ts';

const NON_VERDICT_COMPLETION_FAILURES = new Set([
  'completion_archive_failed',
  'completion_conflict',
  'completion_event_adapter_failed',
  'completion_event_unresolved',
]);

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
  const dispatchId = resolveStatusDispatchId(result.status) ?? correlation.dispatch_id ?? null;
  const gatewayLabel = resolveStatusGatewayLabel(result.status) ?? correlation.gateway_label ?? null;
  const sessionKey = resolveStatusSessionKey(result.status) ?? correlation.session_key ?? null;

  if (result.ok) {
    log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
    getGateStats(config).gates_completed.push(gateId);

    await onGatePass(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
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
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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

  if (result.reason === 'invalid_contract') {
    const invalid = result.status || {};
    const err = invalid.reason || `Gate '${gateId}' output contract invalid`;
    log('ERROR', `Gate '${gateId}' output contract invalid: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Invalid Output`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: invalid.run_id || getRunId(config),
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
      exit: EXIT_ERROR,
      reason: err,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: 'invalid_contract',
      status: invalid,
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  if (result.reason === 'parse_corrupted') {
    log('ERROR', `Gate '${gateId}' status file permanently corrupted`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: result.status?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: result.status?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
      identity: {
        run_id: getRunId(config),
        attempt,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      maxPauses: maxRateLimitPauses,
      exit: EXIT_RATE_LIMITED,
      reason: exhaustedReason,
      telemetryCtx: telemetryCtx(config),
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
            fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
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

  if (NON_VERDICT_COMPLETION_FAILURES.has(result.reason)) {
    const completionStatus = result.status || {};
    const err = describeNonVerdictCompletionFailure(gateId, result.reason, completionStatus);
    log('ERROR', `Gate '${gateId}' completion failed before verdict: ${err}`);
    getGateStats(config).gates_failed.push(gateId);
    await onGateFail(telemetryCtx(config), gateId, {
      gate_type: gate.type,
      fix_cycle: attempt > 1 ? attempt - 1 : 0,
      duration_seconds: Math.round((Date.now() - gateStartedAt) / 1000),
      reason: err,
      dispatch_id: dispatchId,
      session_key: sessionKey,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: `Gate '${gateId}' Completion Failed`,
          description: err.slice(0, 300),
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
            run_id: completionStatus.run_id || getRunId(config),
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
      exit: EXIT_ERROR,
      reason: err,
      status: completionStatus,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
      failure_class: result.reason,
      attempt,
      dispatch_id: dispatchId,
    }, { ...opts, input: { ids: { attempt } } });
  }

  const failData = result.status || {};
  const issues = extractGateIssues(failData);
  const failReason = issues.map((issue = {}) => issue.title).filter(Boolean).join('; ') || 'unknown (no error detail available)';

  log('WARN', `Gate '${gateId}' FAIL: ${failReason}`);

  if (hasFixLoop) {
    await onGateFail(telemetryCtx(config), gateId, {
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
          fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, {
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
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, { run_id: failData?.run_id || getRunId(config), gate_id: gateId, gate_type: gate.type, attempt: failData?.attempt ?? attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey }),
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
