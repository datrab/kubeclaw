import { log } from '../core/logger.ts';
import { resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { errorMessage } from '../services/text-values.ts';
import {
  computeElapsedSeconds, currentAttemptNumber, getAttemptStartedAt, getModuleStats, setLogScope,
} from './module-runner-shared.ts';
import { applyForgeOnlyPassCompletion } from './module-runner/forge-completions.ts';
import { buildModuleErrorTerminalResult, buildModulePassTerminalResult } from './module-runner/terminal-results.ts';
import { prepareModuleForge } from './module-runner-forge-setup.ts';
import { executeModuleForgeWorker } from './module-runner-forge-worker.ts';
import { resolveForgeFailure } from './module-runner-forge-failures.ts';
import { resolveForgeSuccess } from './module-runner-forge-success.ts';

type AnyRecord = Record<string, any>;

function workerContext(context: AnyRecord, prepared: AnyRecord, worker: AnyRecord): AnyRecord {
  const metadata = worker.metadata;
  const sessionKey = metadata.session_key ?? resolveStatusSessionKey(context.status);
  const terminalDetail = typeof metadata.status_detail === 'string' && metadata.status_detail.trim() ? metadata.status_detail.trim() : null;
  const terminalMessage = typeof metadata.status_message === 'string' && metadata.status_message.trim() ? metadata.status_message.trim() : null;
  return {
    ...context, ...prepared, worker, sessionKey,
    terminalDetail, terminalMessage,
    terminalErrors: Array.isArray(metadata.status_errors) ? metadata.status_errors : [],
  };
}

export async function runModuleForgePhase(input: AnyRecord = {}) {
  const context: AnyRecord = {
    ...input,
    handleFail: (status: AnyRecord, phase: string, reason: string, options: AnyRecord = {}) => (
      input.deps.handleFail({
        config: input.config, status, moduleDir: input.dir, moduleId: input.moduleId,
        maxFails: input.maxFails, phase, reason, opts: { progress: input.progress, ...options },
      })
    ),
  };
  const prepared = await prepareModuleForge(context);
  if (prepared.terminalResult) return prepared.terminalResult;
  Object.assign(context, prepared, { recalledMemoryIds: prepared.recalledMemoryIds });
  const executed: AnyRecord = await executeModuleForgeWorker(context);
  if (executed.terminal) return executed.terminal;
  const resolved = workerContext(context, prepared, executed.outcome);
  if (executed.outcome.result?.nextAction !== 'pass') {
    context.status = executed.outcome.metadata.final_status || input.deps.loadStatus(input.config, input.dir);
    if (!context.status) context.status = input.status;
    resolved.status = context.status;
    return resolveForgeFailure(resolved);
  }
  return resolveForgeSuccess(resolved);
}

export async function finalizeForgeOnlyPass({
  config, moduleId, mod, dir, status, deps,
}: AnyRecord = {}) {
  log('INFO', 'No buster in stages — promoting READY_FOR_TESTING → PASS');
  let gitResult: AnyRecord;
  try {
    gitResult = await deps.gitCommitAndPush(config, `[pipeline] Module ${moduleId}: Forge output (no buster)`);
  } catch (error: unknown) {
    return forgeOnlyPersistenceFailure(config, moduleId, dir, status,
      `Forge-only module cannot PASS without durable Git persistence: ${errorMessage(error)}`);
  }
  if (gitResult?.committed !== true) {
    return forgeOnlyPersistenceFailure(config, moduleId, dir, status,
      `Forge-only module cannot PASS without a durable Git commit: ${gitResult?.error || 'no commit was created'}`);
  }
  const completedAt = new Date().toISOString();
  applyForgeOnlyPassCompletion({
    deps, config, dir, status, moduleId, attempt: currentAttemptNumber(status),
    occurredAt: completedAt, sessionKey: resolveStatusSessionKey(status),
    gatewayLabel: resolveStatusGatewayLabel(status),
  });
  if (!status.cost) status.cost = {};
  if (status.started_at) status.cost.total_duration_seconds = computeElapsedSeconds(status.started_at, status.completed_at);
  status.cost.attempt_duration_seconds = computeElapsedSeconds(getAttemptStartedAt(status), status.completed_at);
  log('OK', `Module ${moduleId} PASS (forge-only)`);
  setLogScope(null, null);
  getModuleStats(config).modules_completed.push(moduleId);
  return {
    status,
    terminal: buildModulePassTerminalResult(config, moduleId, {
      moduleDir: dir, attempt: currentAttemptNumber(status), phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(status), sessionKey: resolveStatusSessionKey(status),
    }),
  };
}

function forgeOnlyPersistenceFailure(config: AnyRecord, moduleId: string, dir: string, status: AnyRecord, reason: string) {
  log('ERROR', reason);
  return {
    terminal: buildModuleErrorTerminalResult(config, moduleId, {
      reason, moduleDir: dir, attempt: currentAttemptNumber(status), phase: 'forge',
      gatewayLabel: resolveStatusGatewayLabel(status), sessionKey: resolveStatusSessionKey(status),
    }),
  };
}
