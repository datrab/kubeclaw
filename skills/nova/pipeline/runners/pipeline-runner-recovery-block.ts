import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { appendLifecycleEvent } from '../services/status-store.ts';
import { discord } from '../integrations/discord.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

function refs(config: AnyRecord, scope: string, id: string, sessionKey: string | null) {
  const runId = selectTruthyValue(() => getRunId(config), () => null);
  return {
    primary_ref: { kind: 'recovery_blocked', id: `recovery_blocked:${selectTruthyValue(() => runId, () => 'no-run-id')}:${scope}:${id}:${selectTruthyValue(() => sessionKey, () => 'no-session')}` },
    run_id: runId, run_ref: runId ? `run:${runId}` : null,
  };
}

function appendBlocked(config: AnyRecord, context: AnyRecord) {
  try {
    const stop = context.stopResult;
    appendLifecycleEvent(config, {
      type: 'recovery.stale_blocked', refs: refs(config, context.scope, context.id, context.sessionKey),
      data: {
        scope: context.scope, module_id: context.moduleId, gate_id: context.gateId, gate_type: context.gateType,
        previous_phase: context.previousPhase, attempt: context.attempt, dispatch_id: context.dispatchId,
        gateway_label: context.gatewayLabel, session_key: context.sessionKey, diagnostic_label: context.diagnosticLabel,
        status_before_reset: context.statusBeforeReset, active_session_path: context.activeSessionPath,
        recovery_action: context.recoveryAction, recovery_target_status: 'unchanged',
        stop_requested: stop?.requested === true, stop_confirmed: stop?.confirmed === true,
        stop_state: selectTruthyValue(() => stop?.state, () => null), session_authority: context.sessionAuthority,
        cleanup_attempted: stop?.cleanupAttempted === true, reason: context.reason,
      },
    });
  } catch (error: unknown) {
    log('WARN', `[stale-reconcile] failed to append recovery blocked event for ${context.scope} ${context.id}: ${message(error)}`);
  }
}

async function notifyBlocked(config: AnyRecord, context: AnyRecord) {
  try {
    const title = context.scope === 'gate'
      ? `Gate ${context.gateId} — Stale ${context.previousPhase} recovery blocked`
      : `Module ${context.moduleId} — Stale ${context.previousPhase} recovery blocked`;
    const identity = {
      run_id: selectTruthyValue(() => getRunId(config), () => null), module_id: context.moduleId, gate_id: context.gateId,
      gate_type: context.gateType, attempt: context.attempt, dispatch_id: context.dispatchId,
      gateway_label: context.gatewayLabel, session_key: context.sessionKey,
    };
    await discord(config, 'CRITICAL', title, `${context.reason}. Recovery state was left intact; manual intervention is required before retry.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, identity),
      ...(context.diagnosticLabel ? [{ name: 'Diagnostic Label', value: context.diagnosticLabel, inline: true }] : []),
      { name: 'Previous Phase', value: context.previousPhase, inline: true },
      { name: 'Recovery Action', value: context.recoveryAction, inline: true },
      { name: 'Status Reset To', value: 'unchanged', inline: true },
      { name: 'Action', value: 'Manually stop or verify the stale child session, then resume.', inline: false },
    ], { correlation: identity });
  } catch (error: unknown) {
    log('WARN', `[stale-reconcile] failed to emit recovery blocked Discord for ${context.scope} ${context.id}: ${message(error)}`);
  }
}

export async function recordUnconfirmedRecoveryBlock(config: AnyRecord, input: AnyRecord = {}) {
  const context: AnyRecord = Object.assign({
    moduleId: null, gateId: null, gateType: null, previousPhase: 'missing_previous_phase', attempt: null,
    dispatchId: null, gatewayLabel: null, sessionKey: null, diagnosticLabel: null,
    statusBeforeReset: null, activeSessionPath: null, stopResult: null,
    recoveryAction: 'kill_unconfirmed', sessionAuthority: null,
  }, input);
  context.id = selectTruthyValue(() => context.moduleId, () => context.gateId);
  if (!context.id) context.id = 'missing_recovery_target_id';
  const stopState = selectTruthyValue(() => context.stopResult?.state, () => 'stop_confirmation_state_missing');
  context.reason = selectTruthyValue(() => input.reason, () => `Recovery blocked: stale ${context.scope} session stop was not confirmed (${stopState})`);
  appendBlocked(config, context);
  await notifyBlocked(config, context);
}
