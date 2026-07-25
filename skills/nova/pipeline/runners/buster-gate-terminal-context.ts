import { selectDefinedValue } from '../optional-absence.ts';
import { getRunId } from '../core/runtime.ts';
import { onGateFail } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import {
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveStatusSessionKey,
} from '../services/correlation.ts';

function createFailureReporter(ctx: any) {
  return async function reportFailure(details: any) {
    const {
      reason,
      title,
      description,
      level = 'CRITICAL',
      identityAttempt = ctx.attempt,
      extraFields = [],
      issuesCount,
      fixCycle = ctx.attempt > 1 ? ctx.attempt - 1 : 0,
      markFailed = true,
    } = details;
    if (markFailed) ctx.callbacks.getGateStats(ctx.config).gates_failed.push(ctx.gateId);
    await onGateFail(ctx.callbacks.telemetryCtx(ctx.config), ctx.gateId, {
      run_id: ctx.runId,
      gate_type: ctx.gate.type,
      ...(issuesCount === undefined ? {} : { issues_count: issuesCount }),
      fix_cycle: fixCycle,
      duration_seconds: Math.round((Date.now() - ctx.gateStartedAt) / 1000),
      reason,
      dispatch_id: ctx.dispatchId,
      gateway_label: ctx.gatewayLabel,
      session_key: ctx.sessionKey,
      presentation: {
        discord: {
          level,
          title,
          description,
          fields: buildDiscordIdentitySurfaceFields(
            DISCORD_IDENTITY_SURFACES.GATE_SESSION,
            { ...ctx.identity, attempt: identityAttempt },
            extraFields,
          ),
        },
      },
    });
  };
}

export function createBusterGateTerminalContext(input: any, evaluation: any) {
  const { config, gateId, gate, attempt, opts = {}, callbacks = {} } = input;
  const resultStatus = evaluation.status;
  const runId = getRunId(config);
  const dispatchId = selectDefinedValue(() => resolveStatusDispatchId(resultStatus), () => null);
  const gatewayLabel = selectDefinedValue(() => resolveStatusGatewayLabel(resultStatus), () => null);
  const sessionKey = selectDefinedValue(() => resolveStatusSessionKey(resultStatus), () => null);
  const identity = { run_id: runId, gate_id: gateId, gate_type: gate.type, attempt, dispatch_id: dispatchId, gateway_label: gatewayLabel, session_key: sessionKey };
  const control = (values: any) => callbacks.buildBusterGateControlResult(config, gateId, gate, {
    gateway_label: gatewayLabel, session_key: sessionKey, attempt, dispatch_id: dispatchId, ...values,
  }, { ...opts, input: { ids: { attempt } } });

  const context = {
    ...input,
    evaluation,
    resultStatus,
    resultReason: evaluation.reason,
    runId,
    dispatchId,
    gatewayLabel,
    sessionKey,
    identity,
    callbacks,
    control,
  };
  return { ...context, reportFailure: createFailureReporter(context) };
}
