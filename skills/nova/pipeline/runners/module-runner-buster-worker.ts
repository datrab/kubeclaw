import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/module-runner-buster-worker.ts — registry-backed Buster worker dispatch

import { buildPluginInvocationEnvelope, createPluginContext } from '../core/context.ts';
import { STATUS } from '../core/constants.ts';
import { log } from '../core/logger.ts';
import { requireStageHandler } from '../core/registry.ts';
import { setModuleActiveAgent, clearModuleActiveAgent, startModulePhase } from '../lifecycle-state.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
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
    ...(selectDefinedValue(() => (latestStatus), () => ({}))),
    ...finalizedStatus,
    validation: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.validation), () => (latestStatus?.validation))), () => (null)),
    cost: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.cost), () => (latestStatus?.cost))), () => (null)),
    active_agent: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.active_agent), () => (latestStatus?.active_agent))), () => (null)),
    session_key: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.session_key), () => (latestStatus?.session_key))), () => (null)),
    dispatch_id: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.dispatch_id), () => (latestStatus?.dispatch_id))), () => (null)),
    gateway_label: selectTruthyValue(() => (selectTruthyValue(() => (finalizedStatus.gateway_label), () => (latestStatus?.gateway_label))), () => (null)),
  };
}

function dispatchIdentityValue(dispatch: AnyRecord, completionIdentity: AnyRecord, field: 'dispatch_id' | 'run_id'): string {
  const dispatchValue = typeof dispatch?.[field] === 'string' && dispatch[field].trim() ? dispatch[field].trim() : null;
  const identityField = field === 'dispatch_id' ? 'dispatchId' : 'runId';
  const identityValue = typeof completionIdentity?.[identityField] === 'string' && completionIdentity[identityField].trim()
    ? completionIdentity[identityField].trim()
    : null;
  if (dispatchValue) return dispatchValue;
  if (identityValue) return identityValue;
  throw new Error(`Buster worker dispatch requires ${field}`);
}

function statusForBusterWorkerExecutionFailure(status: AnyRecord | null): string {
  if (typeof status?.status === 'string' && status.status.trim()) return status.status.trim();
  return STATUS.READY_FOR_TESTING;
}

function hasBusterTerminalTelemetryIdentity(status: AnyRecord | null, completionIdentity: AnyRecord, sessionKey: string | null): boolean {
  return Boolean(
    completionIdentity?.dispatchId
    && (selectTruthyValue(() => (selectTruthyValue(() => (completionIdentity?.gateway_label), () => (status?.gateway_label))), () => (status?.active_agent?.gateway_label)))
    && (selectTruthyValue(() => (selectTruthyValue(() => (sessionKey), () => (status?.session_key))), () => (status?.active_agent?.session_key)))
  );
}

function clearBusterActiveAgentAfterWorkerFailure({ config, dir, status, deps }: AnyRecord = {}) {
  try {
    const latestStatus = selectTruthyValue(() => (deps.loadStatus(config, dir)), () => (status));
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
  startupRateLimitPauseCount = 0,
}: AnyRecord = {}) {
  const busterStageId = 'worker:module_buster';
  const busterExecutionInput = buildModuleBusterRunInput(config, moduleId, mod, dir, status, {
    attempt: completionIdentity.attempt,
    runId: completionIdentity.runId,
    dispatchId: completionIdentity.dispatchId,
    gatewayLabel: completionIdentity.gateway_label,
    model: busterModel,
    modelSource: selectTruthyValue(() => (busterPolicy.model_source), () => (null)),
    thinking: selectTruthyValue(() => (busterPolicy.thinking), () => (null)),
    thinkingSource: selectTruthyValue(() => (busterPolicy.thinking_source), () => (null)),
    thinkingSupported: selectDefinedValue(() => (busterPolicy.thinking_supported), () => (null)),
    timeoutMinutes: timeout,
    maxFails,
    maxCrashRetries: maxBusterCrashRetries,
    busterAttempt,
  });
  const busterWorkerInput = {
    ...busterExecutionInput,
    executionContext: {
      ...busterExecutionInput.executionContext,
      startupRateLimitPauseCount,
    },
    prompt: busterPrompt,
    status,
    onDispatched: async (dispatch: AnyRecord = {}) => {
      const dispatchId = dispatchIdentityValue(dispatch, completionIdentity, 'dispatch_id');
      const dispatchRunId = dispatchIdentityValue(dispatch, completionIdentity, 'run_id');
      completionIdentity.dispatchId = dispatchId;
      completionIdentity.gateway_label = selectTruthyValue(() => (dispatch.gateway_label), () => (null));
      const busterPhaseStartedAt = new Date().toISOString();
      const busterStartTransition = startModulePhase(status, 'buster',
        `Buster started (subagent attempt ${busterAttempt}/${maxBusterCrashRetries + 1})`,
        { now: busterPhaseStartedAt, clearCompletionSummary: true });
      const activeAgentTransition = setModuleActiveAgent(status, {
        session_key: selectTruthyValue(() => (dispatch.session_key), () => (null)),
        stream_log_path: selectTruthyValue(() => (dispatch.stream_log_path), () => (null)),
        label: dispatchId,
        gateway_label: selectTruthyValue(() => (dispatch.gateway_label), () => (null)),
        dispatch_id: dispatchId,
        run_id: dispatchRunId,
        attempt: completionIdentity.attempt,
        runtime: selectTruthyValue(() => (dispatch.runtime), () => (null)),
        model: busterModel,
        model_source: selectTruthyValue(() => (busterPolicy.model_source), () => (null)),
        reasoning_level: busterPolicy.thinking_supported === false ? 'not supported' : (selectDefinedValue(() => (busterPolicy.thinking), () => ('default'))),
        thinking_source: selectTruthyValue(() => (busterPolicy.thinking_source), () => (null)),
        agent_id: selectTruthyValue(() => (dispatch.agent_id), () => (null)),
        phase: 'buster',
        started_at: new Date().toISOString(),
      }, { lifecycleMutation: busterStartTransition.lifecycleMutation });
      status.session_key = selectTruthyValue(() => (dispatch.session_key), () => (null));
      status.dispatch_id = dispatchId;
      status.gateway_label = selectTruthyValue(() => (dispatch.gateway_label), () => (null));
      busterSessionKey = selectTruthyValue(() => (dispatch.session_key), () => (null));
      deps.saveStatus(config, dir, status, activeAgentTransition);
      const crashDetails = {
        step_type: 'module',
        step_id: moduleId,
        module_id: moduleId,
        attempt: completionIdentity.attempt,
        dispatch_id: completionIdentity.dispatchId,
      };
      emitPipelineCheckpoint(config, 'after_buster_task_enqueue', crashDetails);
      emitPipelineCheckpoint(config, 'during_buster_wait', crashDetails);
    },
    onFinalized: async ({ status: finalizedStatus = null, session_key: finalizedSessionKey = null }: AnyRecord = {}) => {
      status = mergeFinalizedStatus(selectTruthyValue(() => (deps.loadStatus(config, dir)), () => (status)), finalizedStatus);
      busterSessionKey = selectTruthyValue(() => (selectTruthyValue(() => (finalizedSessionKey), () => (busterSessionKey))), () => (null));
      status.session_key = selectTruthyValue(() => (selectTruthyValue(() => (status.session_key), () => (busterSessionKey))), () => (null));
      status.dispatch_id = selectTruthyValue(() => (selectTruthyValue(() => (status.dispatch_id), () => (completionIdentity.dispatchId))), () => (null));
      status.gateway_label = selectTruthyValue(() => (selectTruthyValue(() => (status.gateway_label), () => (completionIdentity.gateway_label))), () => (null));
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
        modelSource: selectTruthyValue(() => (busterPolicy.model_source), () => (null)),
        thinking: selectTruthyValue(() => (busterPolicy.thinking), () => (null)),
        thinkingSource: selectTruthyValue(() => (busterPolicy.thinking_source), () => (null)),
        thinkingSupported: selectDefinedValue(() => (busterPolicy.thinking_supported), () => (null)),
        dispatchId: completionIdentity.dispatchId,
      },
      effects: buildWorkerPluginEffects(config, progress, busterStageId, busterWorkerInput, deps),
    });

    const rawBusterWorkerResult: unknown = await executeBusterWorker(
      buildPluginInvocationEnvelope({
        ...busterExecutionInput,
        executionContext: busterWorkerInput.executionContext,
      }, pluginContext, { workerInput: busterWorkerInput }),
      pluginContext,
    );
    const controlResult = normalizeModuleBusterWorkerResult(config, busterExecutionInput, rawBusterWorkerResult, { stageId: busterStageId, moduleId: busterOwnerRecord.manifest.moduleId, pluginInvocation });
    busterWorkerControlResult = controlResult;
  } catch (error) {
    const reason = `Module Buster worker execution failed: ${errorMessage(error)}`;
    log('ERROR', reason);
    status = clearBusterActiveAgentAfterWorkerFailure({ config, dir, status, deps });
    if (hasBusterTerminalTelemetryIdentity(status, completionIdentity, busterSessionKey)) {
      emitTerminalModuleFailTelemetry(
        config,
        moduleId,
        status,
        mod,
        'buster',
        busterModel,
        statusForBusterWorkerExecutionFailure(status),
        reason,
        {
          dispatchId: completionIdentity.dispatchId,
          gatewayLabel: completionIdentity.gateway_label,
          sessionKey: busterSessionKey,
        },
      );
    } else {
      log('WARN', `Module ${moduleId}: Buster worker failed before session identity was available; terminal telemetry omitted for pre-session failure`);
    }
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
