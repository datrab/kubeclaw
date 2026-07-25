import { log } from '../../core/logger.ts';
import { applyModuleCompletion } from '../status-store.ts';
import { onModuleFail } from '../telemetry.ts';
import { selectTruthyValue } from '../../optional-absence.ts';
import { telemetryCtx, truncateForDiscord } from './presentation.ts';

function applyRetryCompletion(context: any) {
  const {
    config,
    status,
    moduleDir,
    moduleId,
    maxFails,
    phase,
    reason,
    correlation,
  } = context;
  const retryFailureClass = selectTruthyValue(
    () => status.fail_summaries[status.fail_summaries.length - 1]?.failure_class,
    () => null
  );
  applyModuleCompletion(config, moduleDir, status, {
    target_kind: 'module',
    target_id: moduleId,
    phase,
    attempt: status.fail_count,
    status: 'FAIL',
    authority: { kind: 'worker' },
    reason_code: retryFailureClass,
    summary: selectTruthyValue(
      () => reason,
      () => `${phase} failed (attempt ${status.fail_count}/${maxFails})`
    ),
    observed: {
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    },
    metadata: {
      fail_count: status.fail_count,
      max_fails: maxFails,
      auto_retry: true,
    },
  });
}

async function emitRetryTelemetry(context: any, autoRetryThreshold: number) {
  const {
    config,
    status,
    moduleId,
    maxFails,
    phase,
    reason,
    contextFields,
    failEvent,
  } = context;
  await onModuleFail(telemetryCtx(config), moduleId, {
    ...failEvent,
    presentation: {
      discord: {
        level: 'WARN',
        title: `Module ${moduleId} FAIL (${phase}) — Auto-Retry`,
        description: `Attempt ${status.fail_count}/${maxFails}. Pipeline will retry automatically.`,
        fields: [
          { name: 'Status', value: 'FAIL' },
          { name: 'Action', value: 'Pipeline will retry automatically' },
          { name: 'Auto-Retry', value: `${status.fail_count}/${autoRetryThreshold}` },
          ...contextFields,
          ...(reason
            ? [{ name: 'Reason', value: truncateForDiscord(reason, 1024), inline: false }]
            : []),
        ],
      },
    },
  });
}

function buildRetryResult(context: any) {
  const {
    status,
    moduleId,
    moduleDir,
    maxFails,
    correlation,
  } = context;
  return {
    _retry: true,
    module: moduleId,
    module_dir: moduleDir,
    attempt: status.fail_count,
    fail_count: status.fail_count,
    dispatch_id: correlation.dispatchId,
    gateway_label: correlation.gatewayLabel,
    session_key: correlation.sessionKey,
    max_fails: maxFails,
    last_fail: selectTruthyValue(
      () => status.fail_summaries[status.fail_summaries.length - 1],
      () => null
    ),
  };
}

export async function handleAutomaticRetry(
  context: any,
  autoRetryThreshold: number
) {
  applyRetryCompletion(context);
  await emitRetryTelemetry(context, autoRetryThreshold);
  log(
    'INFO',
    `Auto-retry ${context.status.fail_count}/${autoRetryThreshold} — pipeline will retry internally`
  );
  return buildRetryResult(context);
}
