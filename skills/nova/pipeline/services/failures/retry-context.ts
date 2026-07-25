import { getRunId } from '../../core/runtime.ts';
import {
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from '../correlation.ts';
import { normalizeFailureClass } from '../failure-semantics.ts';
import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
import { classifyFailPattern } from './classification.ts';
import {
  buildFailureDiscordFields,
  buildModuleFailureTelemetry,
} from './presentation.ts';

function failureTimeoutFlag(value: any) {
  return value === true;
}

function discordFields(opts: any) {
  return Array.isArray(opts.discordFields)
    ? opts.discordFields.filter(Boolean)
    : [];
}

export function resolveFailureCorrelation(status: any, opts: any) {
  return {
    dispatchId: selectDefinedValue(
      () => selectDefinedValue(
        () => opts.dispatch_id,
        () => resolveStatusDispatchId(status)
      ),
      () => null
    ),
    gatewayLabel: selectDefinedValue(
      () => selectDefinedValue(
        () => opts.gateway_label,
        () => resolveStatusGatewayLabel(status)
      ),
      () => null
    ),
    sessionKey: selectDefinedValue(
      () => selectDefinedValue(
        () => opts.session_key,
        () => resolveStatusSessionKey(status)
      ),
      () => null
    ),
  };
}

function appendFailureSummary(status: any, phase: any, reason: any, isTimeout: boolean) {
  if (!reason) return;
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
    files_changed: selectTruthyValue(() => status.forge_diff_stat, () => null),
  });
}

function buildFailureContextFields(input: any, correlation: any) {
  const { config, moduleId, maxFails, phase, opts, status, isTimeout } = input;
  return [
    ...buildFailureDiscordFields({
      run_id: getRunId(config),
      module_id: moduleId,
      phase,
      attempt: status.fail_count,
      dispatch_id: correlation.dispatchId,
      gateway_label: correlation.gatewayLabel,
      session_key: correlation.sessionKey,
    }),
    { name: 'Fail Count', value: `${status.fail_count}/${maxFails}` },
    ...(isTimeout ? [{ name: 'Timeout', value: 'yes', inline: true }] : []),
    ...discordFields(opts),
  ];
}

export function createFailureContext(input: any) {
  const {
    config,
    status,
    moduleDir,
    moduleId,
    maxFails,
    phase,
    reason,
    opts = {},
  } = input;
  const isTimeout = failureTimeoutFlag(opts.isTimeout);
  const previousStatus = selectTruthyValue(() => status.status, () => null);

  status.fail_count++;
  appendFailureSummary(status, phase, reason, isTimeout);
  if (opts.dispatch_id && !status.dispatch_id) {
    status.dispatch_id = opts.dispatch_id;
  }

  const correlation = resolveFailureCorrelation(status, opts);
  const contextFields = buildFailureContextFields({
    config,
    moduleId,
    maxFails,
    phase,
    opts,
    status,
    isTimeout,
  }, correlation);
  const failEvent = buildModuleFailureTelemetry(
    status,
    phase,
    reason,
    previousStatus,
    opts
  );

  return {
    config,
    status,
    moduleDir,
    moduleId,
    maxFails,
    phase,
    reason,
    opts,
    isTimeout,
    previousStatus,
    correlation,
    contextFields,
    failEvent,
  };
}
