import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { requireStageHandler } from '../core/registry-access.ts';
import { log } from '../core/logger.ts';
import { resolveStatusDispatchId, resolveStatusGatewayLabel, resolveStatusSessionKey } from '../services/correlation.ts';
import { getPipelineDefaultsConfig } from '../services/runtime-defaults.ts';
import { errorMessage } from '../services/text-values.ts';
import {
  isRetryableWorkerStartupReason, typedWorkerMetadata, workerControlMetadata,
  workerControlOutcomeClass, workerControlSummary,
} from '../services/contracts/worker-control-accessors.ts';
import {
  buildWorkerPluginEffects, currentAttemptNumber,
  emitTerminalModuleFailTelemetry, ensureModulePluginLogDirs,
} from './module-runner-shared.ts';
import { buildModuleWorkerPluginInvocation, normalizeModuleForgeWorkerResult } from './module-runner-plugin-contracts.ts';
import { selectTruthyValue } from '../optional-absence.ts';
import { clearModuleActiveAgent } from '../lifecycle-state.ts';
import { STATUS } from '../core/constants.ts';
import { buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';

type AnyRecord = Record<string, any>;
const STAGE_ID = 'worker:module_forge';

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field}: required non-empty string`);
  if (!value.trim()) throw new Error(`${field}: required non-empty string`);
  return value.trim();
}

function clearActiveAgent(context: AnyRecord) {
  try {
    context.status = selectTruthyValue(() => context.deps.loadStatus(context.config, context.dir), () => context.status);
    clearModuleActiveAgent(context.status);
    context.deps.saveStatus(context.config, context.dir, context.status);
  } catch (error: unknown) {
    log('WARN', `Failed to clear Module Forge active agent after worker failure: ${errorMessage(error)}`);
  }
}

function executionFailure(context: AnyRecord, error: unknown) {
  const reason = `Module Forge worker execution failed: ${errorMessage(error)}`;
  log('ERROR', reason);
  const active = selectTruthyValue(() => context.status?.active_agent, () => ({}));
  const dispatchId = requiredText(active.dispatch_id ?? resolveStatusDispatchId(context.status), 'forge.failure.dispatch_id');
  const gatewayLabel = requiredText(active.gateway_label ?? resolveStatusGatewayLabel(context.status), 'forge.failure.gateway_label');
  const sessionKey = requiredText(active.session_key ?? resolveStatusSessionKey(context.status), 'forge.failure.session_key');
  clearActiveAgent(context);
  emitTerminalModuleFailTelemetry({
    config: context.config, moduleId: context.moduleId, status: context.status, mod: context.mod,
    phase: 'forge', model: context.policy.model,
    oldStatus: context.status?.status ?? STATUS.IN_PROGRESS, reason,
    correlation: { dispatchId, gatewayLabel, sessionKey },
  });
  return {
    status: context.status, recalledMemoryIds: context.recalledMemoryIds,
    terminal: buildModuleErrorTerminalResult(context.config, context.moduleId, {
      reason, moduleDir: context.dir, attempt: currentAttemptNumber(context.status), phase: 'forge',
      dispatchId, gatewayLabel, sessionKey,
      ...((error as AnyRecord)?.diagnostics ? { diagnostics: { contract_invalid: true, contract_diagnostic: (error as AnyRecord).diagnostics } } : {}),
    }),
  };
}

async function executeAttempt(context: AnyRecord, pauseCount: number) {
  try {
    const owner = requireStageHandler(context.config, 'worker.execute', STAGE_ID, 'execute');
    ensureModulePluginLogDirs(context.config);
    const invocation = buildModuleWorkerPluginInvocation(context.moduleId, context.status, STAGE_ID, {
      attempt: currentAttemptNumber(context.status),
    });
    const pluginContext = createPluginContext({
      config: context.config, progress: context.progress, hookFamily: 'worker.execute', stageId: STAGE_ID,
      record: owner.record, invocation,
      stateSnapshot: async () => context.execution.stateSnapshot,
      environmentMetadata: {
        moduleId: context.moduleId, phase: 'forge', workerType: 'module_forge',
        model: context.policy.model, thinking: selectTruthyValue(() => context.policy.thinking, () => null),
      },
      effects: buildWorkerPluginEffects(context.config, context.progress, STAGE_ID, context.workerInput, context.deps),
    });
    const raw = await owner.handler(buildPluginInvocationEnvelope(context.execution, pluginContext, {
      workerInput: {
        ...context.workerInput,
        executionContext: { ...context.workerInput.executionContext, startupRateLimitPauseCount: pauseCount },
      },
    }), pluginContext);
    return {
      result: normalizeModuleForgeWorkerResult(context.config, context.execution, raw, {
        stageId: STAGE_ID, moduleId: owner.record.manifest.moduleId, pluginInvocation: invocation,
      }),
    };
  } catch (error: unknown) {
    return { terminal: executionFailure(context, error) };
  }
}

function outcome(result: AnyRecord) {
  const metadata = workerControlMetadata(result);
  const typedMetadata = typedWorkerMetadata(result);
  let reason = selectTruthyValue(() => metadata.reason, () => workerControlOutcomeClass(result));
  if (!reason) reason = selectTruthyValue(() => typedMetadata.outcomeClass, () => null);
  return { result, metadata, typedMetadata, summary: workerControlSummary(result), reason };
}

export async function executeModuleForgeWorker(context: AnyRecord) {
  const retryBudget = getPipelineDefaultsConfig(context.config).agent_startup_retry_budget;
  let pauseCount = 0;
  for (let retry = 0; ; retry++) {
    const attempted = await executeAttempt(context, pauseCount);
    if (attempted.terminal) return attempted;
    const resolved = outcome(attempted.result);
    if (resolved.reason === 'rate_limited') {
      pauseCount = resolved.metadata.rate_limit_pauses !== undefined ? Number(resolved.metadata.rate_limit_pauses) : pauseCount + 1;
      log('WARN', `Module ${context.moduleId}: Forge startup rate limited — retrying after cooldown pause ${pauseCount}`);
      continue;
    }
    if (selectTruthyValue(() => !isRetryableWorkerStartupReason(resolved.reason), () => retry >= retryBudget)) return { outcome: resolved };
    log('WARN', `Module ${context.moduleId}: Forge startup failed (${resolved.reason}) — retrying agent startup ${retry + 1}/${retryBudget}`);
  }
}
