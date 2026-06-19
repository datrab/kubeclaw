// runners/module-runner-buster-worker.ts — registry-backed Buster worker dispatch

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { requireStageHandler } from '../core/registry.ts';
import { setModuleActiveAgent, clearModuleActiveAgent } from '../lifecycle-state.ts';
import {
  buildModuleBusterRunInput,
  buildModuleWorkerPluginInvocation,
  buildWorkerPluginEffects,
  emitTerminalModuleFailTelemetry,
  ensureModulePluginLogDirs,
  normalizeModuleBusterWorkerResult,
} from './module-runner-shared.ts';
import { buildModuleErrorTerminalResult } from './module-runner/terminal-results.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mergeFinalizedStatus(latestStatus: AnyRecord | null, finalizedStatus: AnyRecord | null): AnyRecord | null {
  if (!finalizedStatus) return latestStatus;
  return {
    ...(latestStatus || {}),
    ...finalizedStatus,
    validation: finalizedStatus.validation || latestStatus?.validation || null,
    cost: finalizedStatus.cost || latestStatus?.cost || null,
    active_agent: finalizedStatus.active_agent || latestStatus?.active_agent || null,
    session_key: finalizedStatus.session_key || latestStatus?.session_key || null,
    dispatch_id: finalizedStatus.dispatch_id || latestStatus?.dispatch_id || null,
    gateway_label: finalizedStatus.gateway_label || latestStatus?.gateway_label || null,
  };
}

function clearBusterActiveAgentAfterWorkerFailure({ config, dir, status, deps }: AnyRecord = {}) {
  try {
    const latestStatus = deps.loadStatus(config, dir) || status;
    clearModuleActiveAgent(latestStatus);
    deps.saveStatus(config, dir, latestStatus);
    return latestStatus;
  } catch (cleanupError) {
    log('WARN', `Failed to clear Module Buster active agent after worker failure: ${errorMessage(cleanupError)}`);
    return status;
  }
}

export async function executeBusterWorkerAttempt({
  config,
  progress,
  moduleId,
  mod,
  dir,
  status,
  timeout,
  maxFails,
  deps,
  busterPrompt,
  completionIdentity,
  busterModel,
  busterPolicy = {},
  maxBusterCrashRetries,
  busterAttempt,
}: AnyRecord = {}) {
  const busterStageId = 'worker:module_buster';
  const busterExecutionInput = buildModuleBusterRunInput(config, moduleId, mod, dir, status, {
    attempt: completionIdentity.attempt,
    runId: completionIdentity.runId,
    dispatchId: completionIdentity.dispatchId,
    gatewayLabel: completionIdentity.gateway_label,
    model: busterModel,
    modelSource: busterPolicy.model_source || null,
    thinking: busterPolicy.thinking || null,
    thinkingSource: busterPolicy.thinking_source || null,
    thinkingSupported: busterPolicy.thinking_supported ?? null,
    timeoutMinutes: timeout,
    maxFails,
    maxCrashRetries: maxBusterCrashRetries,
    busterAttempt,
  });
  const busterWorkerInput = {
    ...busterExecutionInput,
    prompt: busterPrompt,
    status,
    onDispatched: async (dispatch: AnyRecord = {}) => {
      completionIdentity.dispatchId = dispatch.dispatch_id || completionIdentity.dispatchId;
      completionIdentity.gateway_label = dispatch.gateway_label || null;
      setModuleActiveAgent(status, {
        session_key: dispatch.session_key || null,
        stream_log_path: dispatch.stream_log_path || null,
        label: dispatch.dispatch_id || completionIdentity.dispatchId,
        gateway_label: dispatch.gateway_label || null,
        dispatch_id: dispatch.dispatch_id || completionIdentity.dispatchId,
        run_id: dispatch.run_id || completionIdentity.runId,
        attempt: completionIdentity.attempt,
        runtime: dispatch.runtime || null,
        model: busterModel,
        model_source: busterPolicy.model_source || null,
        reasoning_level: busterPolicy.thinking_supported === false ? 'not supported' : (busterPolicy.thinking || 'default'),
        thinking_source: busterPolicy.thinking_source || null,
        agent_id: dispatch.agent_id || null,
        phase: 'buster',
        started_at: new Date().toISOString(),
      });
      status.session_key = dispatch.session_key || null;
      status.dispatch_id = dispatch.dispatch_id || completionIdentity.dispatchId;
      status.gateway_label = dispatch.gateway_label || null;
      busterSessionKey = dispatch.session_key || null;
      deps.saveStatus(config, dir, status);
    },
    onFinalized: async ({ status: finalizedStatus = null, session_key: finalizedSessionKey = null }: AnyRecord = {}) => {
      status = mergeFinalizedStatus(deps.loadStatus(config, dir) || status, finalizedStatus);
      busterSessionKey = finalizedSessionKey || busterSessionKey || null;
      clearModuleActiveAgent(status);
      deps.saveStatus(config, dir, status);
    },
  };

  let executeBusterWorker;
  let busterOwnerRecord;
  let busterSessionKey: string | null = null;
  let busterWorkerControlResult: AnyRecord | null = null;
  try {
    ({ handler: executeBusterWorker, record: busterOwnerRecord } = requireStageHandler(config, 'worker.execute', busterStageId, 'execute'));
    ensureModulePluginLogDirs(config);
    const pluginInvocation = buildModuleWorkerPluginInvocation(moduleId, status, busterStageId, {
      attempt: completionIdentity.attempt,
      dispatchId: completionIdentity.dispatchId,
    });
    const pluginContext = createPluginContext({
      config,
      progress,
      hookFamily: 'worker.execute',
      stageId: busterStageId,
      record: busterOwnerRecord,
      invocation: pluginInvocation,
      stateSnapshot: async () => busterExecutionInput.stateSnapshot,
      environmentMetadata: {
        moduleId,
        phase: 'buster',
        workerType: 'module_buster',
        model: busterModel,
        modelSource: busterPolicy.model_source || null,
        thinking: busterPolicy.thinking || null,
        thinkingSource: busterPolicy.thinking_source || null,
        thinkingSupported: busterPolicy.thinking_supported ?? null,
        dispatchId: completionIdentity.dispatchId,
      },
      effects: buildWorkerPluginEffects(config, progress, busterStageId, busterWorkerInput, deps),
    });

    const rawBusterWorkerResult: unknown = await executeBusterWorker(
      buildPluginInvocationEnvelope(busterExecutionInput, pluginContext, { workerInput: busterWorkerInput }),
      pluginContext,
    );
    const controlResult = normalizeModuleBusterWorkerResult(config, busterExecutionInput, rawBusterWorkerResult, { stageId: busterStageId, moduleId: busterOwnerRecord.manifest.moduleId, pluginInvocation });
    busterWorkerControlResult = controlResult;
  } catch (error) {
    const reason = `Module Buster worker execution failed: ${errorMessage(error)}`;
    log('ERROR', reason);
    status = clearBusterActiveAgentAfterWorkerFailure({ config, dir, status, deps });
    emitTerminalModuleFailTelemetry(
      config,
      moduleId,
      status,
      mod,
      'buster',
      busterModel,
      status?.status ?? STATUS.READY_FOR_TESTING,
      reason,
      {
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: completionIdentity.gateway_label,
        sessionKey: busterSessionKey,
      },
    );
    return {
      status,
      terminal: buildModuleErrorTerminalResult(config, moduleId, {
        reason,
        runId: completionIdentity.runId,
        moduleDir: dir,
        attempt: completionIdentity.attempt,
        phase: 'buster',
        dispatchId: completionIdentity.dispatchId,
        gatewayLabel: completionIdentity.gateway_label,
        sessionKey: busterSessionKey,
        ...((error as AnyRecord)?.diagnostics ? { diagnostics: { contract_invalid: true, contract_diagnostic: (error as AnyRecord).diagnostics } } : {}),
      }),
    };
  }

  return { status, busterWorkerControlResult, busterSessionKey };
}

export default executeBusterWorkerAttempt;
