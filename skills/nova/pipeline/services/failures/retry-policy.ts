import { log } from '../../core/logger.ts';
import { getRunId, getRunStats } from '../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { applyModuleCompletion } from '../status-store.ts';
import { onModuleBlocked, onModuleFail, onRetryExhausted } from '../telemetry.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../contracts/terminal-decision.ts';
import { classifyFailPattern } from './classification.ts';
import {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
  telemetryCtx,
  truncateForDiscord,
} from './presentation.ts';
import { getPipelineDefaultsConfig } from '../runtime-defaults.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const MAX_FAILS_REACHED_REASON = 'max_fails_reached';

function shellQuoteArg(value) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) {
    throw new Error('shellQuoteArg requires a command argument value');
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function discordFields(opts) {
  return Array.isArray(opts.discordFields) ? opts.discordFields.filter(Boolean) : [];
}

function failureTimeoutFlag(value) {
  return value === true;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function buildFullPipelineResumeCommand(config, promptPlaceholder = null) {
  const base = `node pipeline.ts --project ${shellQuoteArg(config.project)} --resume`;
  return promptPlaceholder ? `${base} --prompt ${shellQuoteArg(promptPlaceholder)}` : base;
}

/**
 * Resolve the auto-retry threshold for a module or gate.
 * Priority: module/gate config > project config > required platform config.
 */
export function resolveAutoRetryThreshold(config, progress, moduleIdOrGateId) {
  const moduleConf = progress?.modules?.[moduleIdOrGateId];
  const gateConf = progress?.gates?.[moduleIdOrGateId];
  return firstDefined(
    moduleConf?.auto_retry_threshold,
    gateConf?.auto_retry_threshold,
    progress?.auto_retry_threshold,
    getPipelineDefaultsConfig(config).auto_retry_threshold
  );
}

function autoRetryThresholdAuthority(config, opts, moduleId) {
  return firstDefined(opts.autoRetryThreshold, resolveAutoRetryThreshold(config, opts.progress, moduleId));
}

function failureClassForSummary(f) {
  return firstDefined(f.failure_class, normalizeFailureClass(f.phase, f.summary, {
    isTimeout: failureTimeoutFlag(f.is_timeout),
    failurePattern: f.failPattern,
  }));
}

export async function handleFail(config, status, moduleDir, moduleId, maxFails, phase, reason, opts = {}) {
  const isTimeout = failureTimeoutFlag(opts.isTimeout);
  const previousStatus = selectTruthyValue(() => (status.status), () => (null));

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
      files_changed: selectTruthyValue(() => (status.forge_diff_stat), () => (null)),
    });
  }

  if (opts.dispatch_id && !status.dispatch_id) {
    status.dispatch_id = opts.dispatch_id;
  }

  const contextFields = [
    ...buildFailureDiscordFields({
      run_id: getRunId(config),
      module_id: moduleId,
      phase,
      attempt: status.fail_count,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null))),
    }),
    { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
    ...(isTimeout ? [{ name: 'Timeout', value: 'yes', inline: true }] : []),
    ...discordFields(opts),
  ];

  const blockedTitle = `Module ${moduleId} BLOCKED`;
  const autoRetryTitle = `Module ${moduleId} FAIL (${phase}) — Auto-Retry`;
  const autoRetryDescription = `Attempt ${status.fail_count}/${maxFails}. Pipeline will retry automatically.`;
  const escalationTitle = `Module ${moduleId} ${isTimeout ? 'TIMEOUT' : 'NEEDS_NOVA'} (${phase})`;
  const failEvent = buildModuleFailureTelemetry(status, phase, reason, previousStatus, opts);

  if (status.fail_count >= maxFails) {
    const terminalFailureClass = selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]?.failure_class), () => (null));
    const blockedAt = new Date().toISOString();
    applyModuleCompletion(config, moduleDir, status, {
      target_kind: 'module',
      target_id: moduleId,
      phase,
      attempt: status.fail_count,
      status: 'BLOCKED',
      authority: { kind: 'worker' },
      reason_code: terminalFailureClass,
      summary: `Max retries (${maxFails}) exceeded`,
      occurred_at: blockedAt,
      observed: {
        dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null)),
        gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null)),
        session_key: selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null)),
      },
      metadata: {
        fail_count: status.fail_count,
        max_fails: maxFails,
        reason: selectDefinedValue(() => (reason), () => (MAX_FAILS_REACHED_REASON)),
      },
    });

    const ctx = telemetryCtx(config);
    await onModuleFail(ctx, moduleId, failEvent);
    await onRetryExhausted(ctx, moduleId, {
      attempt: status.fail_count,
      phase,
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null))),
      reason: selectTruthyValue(() => (reason), () => (null)),
      max_attempts: maxFails,
      max_fails: maxFails,
    });
    await onModuleBlocked(ctx, moduleId, {
      ...failEvent,
      old_status: 'FAIL',
      reason: `Max retries (${maxFails}) exceeded${phase ? ` in ${phase}` : ''}`,
      presentation: {
        discord: {
          level: 'CRITICAL',
          title: blockedTitle,
          description: `Failed ${maxFails} times in ${phase} phase. Human intervention needed.`,
          fields: [
            ...contextFields,
            { name: 'Status', value: 'BLOCKED' },
            { name: 'Action', value: 'Inspect module failure evidence and resume after fixing' },
            ...(reason ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }] : []),
          ],
        },
      },
    });

    log('ERROR', `Module ${moduleId} BLOCKED — failed ${maxFails}x in ${phase} phase`);
    const stats = getRunStats(config);
    if (stats) stats.modules_blocked.push(moduleId);
    const dispatchId = selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null));
    const gatewayLabel = selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null));
    const sessionKey = selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null));
    return buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.MODULE,
      stepId: moduleId,
      nextAction: PIPELINE_STEP_ACTIONS.HALT,
      outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
      issueType: 'policy',
      reason: `Max retries exceeded (${phase})`,
      diagnostics: {
        metadata: {
          module: moduleId,
          attempt: status.fail_count,
          status,
          dispatch_id: dispatchId,
          gateway_label: gatewayLabel,
          session_key: sessionKey,
        },
      },
      correlation: {
        module_id: moduleId,
        attempt: status.fail_count,
        dispatch_id: dispatchId,
        gateway_label: gatewayLabel,
        session_key: sessionKey,
      },
      terminalAction: PIPELINE_TERMINAL_ACTIONS.NOTIFY_OPERATOR,
      terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
      terminalReasonCode: terminalFailureClass,
    });
  }

  const autoRetryThreshold = autoRetryThresholdAuthority(config, opts, moduleId);
  const canAutoRetry = !isTimeout && status.fail_count <= autoRetryThreshold;

  if (canAutoRetry) {
    const retryFailureClass = selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]?.failure_class), () => (null));
    applyModuleCompletion(config, moduleDir, status, {
      target_kind: 'module',
      target_id: moduleId,
      phase,
      attempt: status.fail_count,
      status: 'FAIL',
      authority: { kind: 'worker' },
      reason_code: retryFailureClass,
      summary: selectTruthyValue(() => (reason), () => (`${phase} failed (attempt ${status.fail_count}/${maxFails})`)),
      observed: {
        dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null)),
        gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null)),
        session_key: selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null)),
      },
      metadata: {
        fail_count: status.fail_count,
        max_fails: maxFails,
        auto_retry: true,
      },
    });

    await onModuleFail(telemetryCtx(config), moduleId, {
      ...failEvent,
      presentation: {
        discord: {
          level: 'WARN',
          title: autoRetryTitle,
          description: autoRetryDescription,
          fields: [
            { name: 'Status', value: 'FAIL' },
            { name: 'Action', value: 'Pipeline will retry automatically' },
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
      dispatch_id: (selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null))),
      gateway_label: (selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null))),
      session_key: (selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null))),
      max_fails: maxFails,
      last_fail: selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]), () => (null)),
    };
  }

  const escalationReason = isTimeout
    ? 'Agent timed out.'
    : `Auto-retry exhausted (${autoRetryThreshold}x). Nova must analyze and provide new prompt.`;
  const stats = getRunStats(config);
  if (stats) stats.modules_failed.push(moduleId);
  const terminalFailureClass = selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]?.failure_class), () => (null));
  applyModuleCompletion(config, moduleDir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase,
    attempt: status.fail_count,
    status: 'ERROR',
    authority: { kind: 'worker' },
    reason_code: terminalFailureClass,
    summary: selectTruthyValue(() => (reason), () => (`${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`)),
    observed: {
      dispatch_id: selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null)),
      gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null)),
      session_key: selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null)),
    },
    metadata: {
      fail_count: status.fail_count,
      max_fails: maxFails,
      auto_retry_threshold: autoRetryThreshold,
      is_timeout: isTimeout,
    },
  });

  await onModuleFail(telemetryCtx(config), moduleId, {
    ...failEvent,
    presentation: {
      discord: {
        level: 'WARN',
        title: escalationTitle,
        description: `Attempt ${status.fail_count}/${maxFails}. ${escalationReason}`,
        fields: [
          { name: 'Status', value: 'FAIL' },
          { name: 'Action', value: isTimeout ? 'Inspect timeout evidence and rerun the module' : 'Resume with --prompt' },
          ...(isTimeout ? [{ name: 'Type', value: 'TIMEOUT' }] : []),
          ...contextFields,
          ...(reason ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }] : []),
        ],
      },
    },
  });

  return buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold, opts);
}

export function buildNovaEscalation(config, status, moduleId, moduleDir, maxFails, phase, isTimeout, autoRetryThreshold, opts = {}) {
  const dispatchId = selectDefinedValue(() => (selectDefinedValue(() => (opts.dispatch_id), () => (resolveStatusDispatchId(status)))), () => (null));
  const gatewayLabel = selectDefinedValue(() => (selectDefinedValue(() => (opts.gateway_label), () => (resolveStatusGatewayLabel(status)))), () => (null));
  const sessionKey = selectDefinedValue(() => (selectDefinedValue(() => (opts.session_key), () => (resolveStatusSessionKey(status)))), () => (null));
  const runId = getRunId(config);
  const reason = isTimeout
    ? `${phase} timed out — agent did not respond within time limit`
    : `${phase} failed ${status.fail_count}x — auto-retry exhausted, Nova must intervene`;
  const terminalFailureClass = selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]?.failure_class), () => (null));
  const failHistory = status.fail_summaries.map(f => ({
    attempt: f.attempt,
    phase: f.phase,
    summary: f.summary,
    failPattern: f.failPattern,
    failure_class: failureClassForSummary(f),
      is_timeout: failureTimeoutFlag(f.is_timeout),
    files_changed: selectTruthyValue(() => (f.files_changed), () => (null)),
    timestamp: f.timestamp,
  }));
  const moduleStatus = {
    status: status.status,
    current_phase: status.current_phase,
    started_at: status.started_at,
    attempt: status.fail_count,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
    session_key: sessionKey,
    forge_commit_hash: selectTruthyValue(() => (status.forge_commit_hash), () => (null)),
    cost: status.cost,
  };
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: isTimeout ? PIPELINE_STEP_OUTCOMES.TIMEOUT : PIPELINE_STEP_OUTCOMES.NEEDS_NOVA,
    issueType: isTimeout ? 'environment' : 'code',
    reason,
    diagnostics: {
      metadata: {
        module: moduleId,
        module_dir: moduleDir,
        is_timeout: isTimeout,
        fail_count: status.fail_count,
        max_fails: maxFails,
        auto_retry_threshold: autoRetryThreshold,
        remaining_attempts: maxFails - status.fail_count,
        fail_history: failHistory,
        last_fail: selectTruthyValue(() => (status.fail_summaries[status.fail_summaries.length - 1]), () => (null)),
        module_status: moduleStatus,
        resume_command: buildFullPipelineResumeCommand(config, 'YOUR_NEW_APPROACH_HERE'),
      },
    },
    correlation: {
      run_id: runId,
      module_id: moduleId,
      module_dir: moduleDir,
      attempt: status.fail_count,
      phase,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionKey,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: isTimeout ? terminalFailureClass : 'needs_nova',
  });
}
