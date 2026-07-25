import { STATUS } from '../../../core/constants.ts';
import { log } from '../../../core/logger.ts';
import { transitionModuleStatus } from '../../../lifecycle-state.ts';
import { buildTerminalBusterCrashFailEvent, emitTerminalBusterCrashTelemetry } from '../../module-runner-shared.ts';
import { buildModuleBlockedTerminalResult, buildModuleTimedOutTerminalResult } from '../terminal-results.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function crashReason(reasonCode: string, timeout: number) {
  if (reasonCode === 'timeout') return `Buster timed out (${timeout}min)`;
  if (reasonCode === 'parse_corrupted') return 'Buster lifecycle snapshot corrupted';
  return `Buster subagent crash: ${reasonCode}`;
}

export async function retryBusterPollFailure(context: AnyRecord) {
  const { config, moduleId, dir, status, deps, completionIdentity, identity, reasonCode, timeout, busterAttempt, maxBusterCrashRetries } = context;
  const reason = reasonCode === 'parse_corrupted' ? 'local lifecycle snapshot corrupted' : crashReason(reasonCode, timeout);
  log('WARN', `Buster subagent crash (attempt ${busterAttempt}/${maxBusterCrashRetries + 1}): ${reason} — retrying Buster`);
  const correlation = { run_id: identity.runId, module_id: moduleId, attempt: identity.attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey };
  await deps.discord(config, 'WARN', `Buster crash retry: Module ${moduleId}`,
    `${reason}. Retrying Buster (attempt ${busterAttempt + 1}/${maxBusterCrashRetries + 1}). Forge output preserved.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: identity.sessionKey }),
    { correlation });
  const transition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
    note: `Buster subagent crashed — retrying (${busterAttempt}/${maxBusterCrashRetries})`,
  });
  deps.saveStatus(config, dir, status, transition);
  return { retry: true, status: transition.status };
}

function exhaustedCrashTerminal(context: AnyRecord, failEvent: AnyRecord, reason: string, budget: number) {
  const { config, moduleId, dir, identity, maxBusterCrashRetries, reasonCode } = context;
  const builder = reasonCode === 'timeout' ? buildModuleTimedOutTerminalResult : buildModuleBlockedTerminalResult;
  return builder(config, moduleId, {
    reason: reasonCode === 'timeout'
      ? `${reason} after ${budget} attempt${budget === 1 ? '' : 's'} — not sent to Forge`
      : `Buster subagent crashed ${budget} times — infrastructure issue (not sent to Forge)`,
    runId: identity.runId, moduleDir: dir, attempt: failEvent.attempt, phase: 'buster',
    dispatchId: failEvent.dispatch_id, gatewayLabel: failEvent.gateway_label, sessionKey: identity.sessionKey,
    metadata: { buster_crash_retries_exhausted: true, retry_attempts: maxBusterCrashRetries, reason_code: reasonCode },
  });
}

export async function exhaustBusterPollFailure(context: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, busterModel, completionIdentity, identity, reasonCode, timeout, maxBusterCrashRetries } = context;
  const budget = maxBusterCrashRetries + 1;
  const reason = crashReason(reasonCode, timeout);
  log('ERROR', `Module ${moduleId}: buster crash retries exhausted (${maxBusterCrashRetries}) — BLOCKED (infrastructure issue)`);
  const failEvent = buildTerminalBusterCrashFailEvent(status, mod, busterModel, status.status, reason, {
    sessionKey: identity.sessionKey, dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel,
  });
  applyModuleRunnerCompletion({
    deps, config, dir, status, moduleId, phase: 'buster', attempt: identity.attempt,
    completionStatus: 'BLOCKED', authority: { kind: 'worker', dispatch_id: identity.dispatchId },
    reasonCode: 'buster_crash_retries_exhausted',
    summary: `Buster subagent crashed ${budget} times without producing a test result. Infrastructure issue — Forge cannot fix this.`,
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { fail_count: status.fail_count },
  });
  await emitTerminalBusterCrashTelemetry(config, moduleId, failEvent,
    `Buster crash retries exhausted after ${budget} attempt${budget === 1 ? '' : 's'} (${reason})`, budget);
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} BLOCKED — Buster crashes`,
    `Buster subagent crashed ${budget} times. This is an infrastructure issue, not a code problem. Manual intervention required.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, { ...completionIdentity, module_id: moduleId, session_key: identity.sessionKey }),
      { name: 'Last Reason', value: reasonCode }, { name: 'Crash Retries', value: String(maxBusterCrashRetries) },
    ], { correlation: { run_id: identity.runId, module_id: moduleId, attempt: identity.attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey } });
  return { terminal: exhaustedCrashTerminal(context, failEvent, reason, budget) };
}
