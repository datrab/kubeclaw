import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { requireStageHandler } from '../core/registry-access.ts';
import { clearModuleActiveAgent } from '../lifecycle-state.ts';
import {
  buildModuleBusterRunInput,
  normalizeModuleBusterWorkerResult,
} from './module-runner-buster-input.ts';
import {
  buildWorkerPluginEffects,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
} from './module-runner-shared.ts';
import { buildModuleWorkerPluginInvocation } from './module-runner-plugin-contracts.ts';
import { buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';
import { buildBusterWorkerInput } from './module-runner-buster-worker-input.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function clearActiveAgent(ctx: any, state: any) {
  try {
    state.status = ctx.deps.loadStatus(ctx.config, ctx.dir) ?? state.status;
    clearModuleActiveAgent(state.status);
    ctx.deps.saveStatus(ctx.config, ctx.dir, state.status);
  } catch (error: any) {
    log('WARN', `Failed to clear Module Buster active agent after worker failure: ${errorMessage(error)}`);
  }
}

function firstPresent(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function terminalTelemetryIdentity(ctx: any, state: any) {
  const status = state.status;
  return Boolean(ctx.completionIdentity.dispatchId
    && firstPresent(ctx.completionIdentity.gateway_label, status?.gateway_label, status?.active_agent?.gateway_label)
    && firstPresent(state.busterSessionKey, status?.session_key, status?.active_agent?.session_key));
}

function emitFailureTelemetry(ctx: any, state: any, reason: string) {
  if (!terminalTelemetryIdentity(ctx, state)) {
    log('WARN', `Module ${ctx.moduleId}: Buster worker failed before session identity was available; terminal telemetry omitted for pre-session failure`);
    return;
  }
  emitTerminalModuleFailTelemetry({
    config: ctx.config, moduleId: ctx.moduleId, status: state.status, mod: ctx.mod, phase: 'buster', model: ctx.busterModel,
    oldStatus: typeof state.status?.status === 'string' && state.status.status.trim() ? state.status.status.trim() : STATUS.READY_FOR_TESTING,
    reason,
    correlation: { dispatchId: ctx.completionIdentity.dispatchId, gatewayLabel: ctx.completionIdentity.gateway_label, sessionKey: state.busterSessionKey },
  });
}

function failureResult(ctx: any, state: any, error: any) {
  const reason = `Module Buster worker execution failed: ${errorMessage(error)}`;
  log('ERROR', reason);
  clearActiveAgent(ctx, state);
  emitFailureTelemetry(ctx, state, reason);
  return {
    status: state.status,
    terminal: buildModuleErrorTerminalResult(ctx.config, ctx.moduleId, {
      reason, runId: ctx.completionIdentity.runId, moduleDir: ctx.dir, attempt: ctx.completionIdentity.attempt,
      phase: 'buster', dispatchId: ctx.completionIdentity.dispatchId, gatewayLabel: ctx.completionIdentity.gateway_label,
      sessionKey: state.busterSessionKey,
      ...(error?.diagnostics ? { diagnostics: { contract_invalid: true, contract_diagnostic: error.diagnostics } } : {}),
    }),
  };
}

function buildExecutionInput(ctx: any, state: any) {
  return buildModuleBusterRunInput(ctx.config, ctx.moduleId, ctx.mod, ctx.dir, state.status, {
    attempt: ctx.completionIdentity.attempt, runId: ctx.completionIdentity.runId, dispatchId: ctx.completionIdentity.dispatchId,
    gatewayLabel: ctx.completionIdentity.gateway_label, model: ctx.busterModel, modelSource: ctx.busterPolicy.model_source ?? null,
    thinking: ctx.busterPolicy.thinking ?? null, thinkingSource: ctx.busterPolicy.thinking_source ?? null,
    thinkingSupported: ctx.busterPolicy.thinking_supported ?? null, timeoutMinutes: ctx.timeout, maxFails: ctx.maxFails,
    maxCrashRetries: ctx.maxBusterCrashRetries, busterAttempt: ctx.busterAttempt,
  });
}

async function invokeWorker(ctx: any, state: any, executionInput: any, workerInput: any) {
  const stageId = 'worker:module_buster';
  const { handler, record } = requireStageHandler(ctx.config, 'worker.execute', stageId, 'execute');
  ensureModulePluginLogDirs(ctx.config);
  const invocation = buildModuleWorkerPluginInvocation(ctx.moduleId, state.status, stageId, { attempt: ctx.completionIdentity.attempt, dispatchId: ctx.completionIdentity.dispatchId });
  const pluginContext = createPluginContext({
    config: ctx.config, progress: ctx.progress, hookFamily: 'worker.execute', stageId, record, invocation,
    stateSnapshot: async () => executionInput.stateSnapshot,
    environmentMetadata: {
      moduleId: ctx.moduleId, phase: 'buster', workerType: 'module_buster', model: ctx.busterModel,
      modelSource: ctx.busterPolicy.model_source ?? null, thinking: ctx.busterPolicy.thinking ?? null,
      thinkingSource: ctx.busterPolicy.thinking_source ?? null, thinkingSupported: ctx.busterPolicy.thinking_supported ?? null,
      dispatchId: ctx.completionIdentity.dispatchId,
    },
    effects: buildWorkerPluginEffects(ctx.config, ctx.progress, stageId, workerInput, ctx.deps),
  });
  const raw = await handler(buildPluginInvocationEnvelope({ ...executionInput, executionContext: workerInput.executionContext }, pluginContext, { workerInput }), pluginContext);
  return normalizeModuleBusterWorkerResult(ctx.config, executionInput, raw, { stageId, moduleId: record.manifest.moduleId, pluginInvocation: invocation });
}

export async function executeBusterWorkerAttempt(input: AnyRecord = {}) {
  const ctx: AnyRecord = { ...input, busterPolicy: input.busterPolicy ?? {}, startupRateLimitPauseCount: input.startupRateLimitPauseCount ?? 0 };
  const state = { status: ctx.status, busterSessionKey: null };
  const executionInput = buildExecutionInput(ctx, state);
  const workerInput = buildBusterWorkerInput(ctx, executionInput, state);
  try {
    const busterWorkerControlResult = await invokeWorker(ctx, state, executionInput, workerInput);
    return { status: state.status, busterWorkerControlResult, busterSessionKey: state.busterSessionKey };
  } catch (error: any) {
    return failureResult(ctx, state, error);
  }
}
