import { log } from '../../core/logger.ts';
import { getRunId, getRunStats } from '../../core/runtime.ts';
import { markModuleBlocked, transitionModuleStatus } from '../../lifecycle-state.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from '../correlation.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { saveStatus } from '../status-store.ts';
import { onModuleBlocked, onModuleFail, onRetryExhausted } from '../telemetry.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../contracts/pipeline-step-result.ts';
import { classifyFailPattern } from './classification.ts';
import {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
  telemetryCtx,
  truncateForDiscord,
} from './presentation.ts';

const STATUS = {
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
};

function shellQuoteArg(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
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
  return (
    moduleConf?.auto_retry_threshold ??
    gateConf?.auto_retry_threshold ??
    progress?.auto_retry_threshold ??
    config.auto_retry_threshold
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

  if (opts.dispatch_id && !status.dispatch_id) {
    status.dispatch_id = opts.dispatch_id;
  }

  const contextFields = [
    ...buildFailureDiscordFields({
      run_id: getRunId(config),
      module_id: moduleId,
      phase,
      attempt: status.fail_count,
      dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
      gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
      session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
    }),
    { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
    ...(isTimeout ? [{ name: 'Timeout', value: 'yes', inline: true }] : []),
    ...((opts.discordFields || []).filter(Boolean)),
  ];

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
    const blockedTransition = markModuleBlocked(status, phase, `Max retries (${maxFails}) exceeded`, {
      reason: reason || 'max_fails_reached',
      failCount: status.fail_count,
      now: blockedAt,
    });
    saveStatus(config, moduleDir, status, blockedTransition);

    const ctx = telemetryCtx(config);
    await onModuleFail(ctx, moduleId, failEvent);
    await onRetryExhausted(ctx, moduleId, {
      attempt: status.fail_count,
      phase,
      dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
      gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
      session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
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
    const dispatchId = opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null;
    const gatewayLabel = opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null;
    const sessionKey = opts.session_key ?? resolveStatusSessionKey(status) ?? null;
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
    });
  }

  const failTransition = transitionModuleStatus(status, STATUS.FAIL, {
    note: `${phase} ${isTimeout ? 'timed out' : 'failed'} (attempt ${status.fail_count}/${maxFails})`,
  });
  saveStatus(config, moduleDir, status, failTransition);

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
      dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
      gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
      session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
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
  return {
    outcome_class: isTimeout ? 'timeout' : 'needs_nova',
    run_id: getRunId(config),
    module: moduleId,
    module_dir: moduleDir,
    is_timeout: isTimeout,
    attempt: status.fail_count,
    dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
    gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
    session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
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
      dispatch_id: (opts.dispatch_id ?? resolveStatusDispatchId(status) ?? null),
      gateway_label: (opts.gateway_label ?? resolveStatusGatewayLabel(status) ?? null),
      session_key: (opts.session_key ?? resolveStatusSessionKey(status) ?? null),
      forge_commit_hash: status.forge_commit_hash || null,
      cost: status.cost,
    },
    resume_command: buildFullPipelineResumeCommand(config, 'YOUR_NEW_APPROACH_HERE'),
  };
}
