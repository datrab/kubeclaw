import { selectTruthyValue } from '../optional-absence.ts';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { onGatePass } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

export async function handleBusterGatePass(ctx: any) {
  const { config, gateId, gate, attempt, resultStatus, runId, dispatchId, gatewayLabel, sessionKey, gateStartedAt, callbacks } = ctx;
  log('OK', `Gate '${gateId}' PASS${attempt > 1 ? ` (after ${attempt - 1} fix cycle(s))` : ''}`);
  callbacks.getGateStats(config).gates_completed.push(gateId);
  await onGatePass(callbacks.telemetryCtx(config), gateId, {
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
        fields: buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.GATE_SESSION, ctx.identity),
      },
    },
  });
  return ctx.control({
    status: STATUS.PASS,
    passed: true,
    outcome_class: 'passed',
    completion_source: selectTruthyValue(() => resultStatus?._source, () => resultStatus?.source) || null,
  });
}
