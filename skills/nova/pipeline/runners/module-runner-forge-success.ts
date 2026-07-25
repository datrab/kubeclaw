import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { resolveStatusGatewayLabel } from '../services/correlation.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { applyForgeBlockedCompletion, applyForgeReadyCompletion } from './module-runner/forge-completions.ts';
import { selectTruthyValue } from '../optional-absence.ts';
import { buildModuleBlockedTerminalResult, buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';
import {
  computeElapsedSeconds, currentAttemptNumber, emitTerminalModuleFailTelemetry,
  ensureValidationState, formatDurationCompact, getPhaseStartedAt,
} from './module-runner-shared.ts';

type AnyRecord = Record<string, any>;

function completion(context: AnyRecord) {
  const reason = context.worker.reason;
  if (reason === 'passed') return { status: STATUS.READY_FOR_TESTING, summary: selectTruthyValue(() => context.worker.summary, () => 'Forge worker passed') };
  if (new Set(['forge_completion', 'agent_ended_meaningful_diff', 'session_ended_meaningful_diff']).has(reason)) {
    return context.worker.metadata.final_status;
  }
  return null;
}

function blocked(context: AnyRecord, result: AnyRecord) {
  applyForgeBlockedCompletion({
    deps: context.deps, config: context.config, dir: context.dir, status: context.status,
    moduleId: context.moduleId, attempt: currentAttemptNumber(context.status), summary: result.summary,
    sessionKey: context.sessionKey, gatewayLabel: resolveStatusGatewayLabel(context.status),
  });
  emitTerminalModuleFailTelemetry({
    config: context.config, moduleId: context.moduleId, status: context.status, mod: context.mod,
    phase: 'forge', model: context.policy.model, oldStatus: STATUS.BLOCKED, reason: result.summary,
  });
  return {
    status: context.status, recalledMemoryIds: context.recalledMemoryIds,
    terminal: buildModuleBlockedTerminalResult(context.config, context.moduleId, {
      reason: result.summary, moduleDir: context.dir, attempt: currentAttemptNumber(context.status),
      phase: 'forge', gatewayLabel: resolveStatusGatewayLabel(context.status), sessionKey: context.sessionKey,
    }),
  };
}

function unexpected(context: AnyRecord) {
  const reason = `Unexpected Forge completion result: ${selectTruthyValue(() => context.worker.reason, () => 'missing_worker_reason')}`;
  log('ERROR', reason);
  return {
    status: context.status, recalledMemoryIds: context.recalledMemoryIds,
    terminal: buildModuleErrorTerminalResult(context.config, context.moduleId, {
      reason, moduleDir: context.dir, attempt: currentAttemptNumber(context.status), phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(context.status), sessionKey: context.sessionKey,
    }),
  };
}

async function ready(context: AnyRecord, result: AnyRecord) {
  ensureValidationState(context.status);
  applyForgeReadyCompletion({
    deps: context.deps, config: context.config, dir: context.dir, status: context.status,
    moduleId: context.moduleId, attempt: currentAttemptNumber(context.status), summary: result.summary,
    sessionKey: context.sessionKey, gatewayLabel: resolveStatusGatewayLabel(context.status),
  });
  log('OK', 'Forge completion evidence accepted → READY_FOR_TESTING');
  const next = context.stages.includes('buster') ? 'Buster' : 'done (no Buster)';
  const correlation = {
    run_id: getRunId(context.config), module_id: context.moduleId,
    attempt: currentAttemptNumber(context.status), gateway_label: resolveStatusGatewayLabel(context.status),
    session_key: context.sessionKey, model: context.policy.model,
    reasoning_level: selectTruthyValue(() => context.policy.thinking, () => 'default'), thinking_source: context.policy.thinking_source, runtime: 'session',
  };
  await context.deps.discord(context.config, 'OK', `Module ${context.moduleId} Forge complete → ${next}`, context.mod.title, [
    ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
    { name: 'Forge Duration', value: formatDurationCompact(computeElapsedSeconds(getPhaseStartedAt(context.status))) },
    { name: 'Retry Budget', value: `${context.status.fail_count + 1}/${context.maxFails}` },
  ], { correlation });
  return { status: context.status, recalledMemoryIds: context.recalledMemoryIds, terminal: null };
}

export async function resolveForgeSuccess(context: AnyRecord) {
  const result = completion(context);
  if (result?.status === STATUS.BLOCKED) return blocked(context, result);
  if (result?.status !== STATUS.READY_FOR_TESTING) return unexpected(context);
  return ready(context, result);
}
