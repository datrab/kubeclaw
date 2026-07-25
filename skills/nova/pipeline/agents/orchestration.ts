import { log } from '../core/logger.ts';
import { resolveRegisteredRedisAdapter } from '../services/adapter-registry.ts';
import { selectTruthyValue } from '../optional-absence.ts';
import { reaperAfterKill } from './shutdown.ts';
import { resolveRuntime } from './runtime.ts';
import { getTrackedAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { buildBusterPayload } from './orchestration-buster-payload.ts';
import { spawnAcpAgent } from './orchestration-spawn.ts';
import {
  acpLabel,
  errorMessage,
  requiredCanonicalModelId,
  textValue,
} from './orchestration-values.ts';
import type { AnyRecord } from './orchestration-values.ts';

export {
  buildModuleBusterWorkerControlResult,
  buildModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
  coerceModuleForgeWorkerControlResult,
  isModuleBusterWorkerControlResult,
  isModuleForgeWorkerControlResult,
} from './module-worker-control-results.ts';
export { verifyAgentAlive, verifyAgentHealth } from './orchestration-healthcheck.ts';
export { runModuleBusterWorker, runModuleForgeWorker } from './module-workers.ts';
export { killReviewerAgent, spawnReviewerAgent } from './reviewer-lifecycle.ts';
export { buildBusterAgentJudgmentPolicy, buildBusterPayload, buildBusterTestConfig } from './orchestration-buster-payload.ts';
export { spawnAcpAgent } from './orchestration-spawn.ts';
export { acpLabel, computeFilesChanged } from './orchestration-values.ts';

const redisDispatchModules = new Map<string, any>();
const MODULE_TEST_TASK_TYPE = 'module_test';

async function getRedisDispatchModule(config: AnyRecord, agentType: string) {
  if (!config?.agents?.[agentType]) throw new Error(`Unknown agent type: ${agentType}`);
  const { adapter, key } = resolveRegisteredRedisAdapter(config, {
    agentType,
    source: `agents.${agentType}`,
    requiredMethods: ['publishTask'],
  });
  if (redisDispatchModules.has(key)) return redisDispatchModules.get(key);
  redisDispatchModules.set(key, adapter);
  log('INFO', `Redis dispatch adapter loaded from registry: ${key}`);
  return adapter;
}

function redisTaskPayload(input: AnyRecord) {
  if (['module_test', 'gate_test'].includes(input.taskType)) {
    return buildBusterPayload(
      input.config,
      input.progress,
      input.moduleId,
      input.taskType,
      input.payload,
      input.status,
      input.opts,
    );
  }
  return {
    module: input.moduleId,
    project: input.config.project,
    message: input.payload,
    timestamp: new Date().toISOString(),
  };
}

function redisDispatchResult(result: AnyRecord, taskPayload: AnyRecord) {
  return {
    ...result,
    dispatch_id: selectTruthyValue(() => (taskPayload.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (taskPayload.session?.label), () => (null)),
    session_key: selectTruthyValue(() => (taskPayload.session_key), () => (null)),
    run_id: selectTruthyValue(() => (taskPayload.run_id), () => (null)),
    attempt: selectTruthyValue(() => (taskPayload.attempt), () => (null)),
    runtime: selectTruthyValue(() => (taskPayload.session?.runtime), () => (taskPayload.runtime)),
    model: selectTruthyValue(() => (taskPayload.session?.model), () => (taskPayload.model)),
    model_source: selectTruthyValue(() => (taskPayload.model_source), () => (null)),
    reasoning_level: selectTruthyValue(() => (taskPayload.reasoning_level), () => (taskPayload.session?.reasoning_level)),
    thinking_source: selectTruthyValue(() => (taskPayload.thinking_source), () => (taskPayload.session?.thinking_source)),
  };
}

async function dispatchRedisTask(input: AnyRecord) {
  const { config, agentType, moduleId, taskType } = input;
  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);
  const taskPayload = redisTaskPayload(input);
  try {
    if (config.agents[agentType]?.dispatch !== 'redis') {
      throw new Error(`Agent '${agentType}' is not configured for Redis dispatch`);
    }
    const redisDispatch = await getRedisDispatchModule(config, agentType);
    const result = await redisDispatch.publishTask(agentType, taskType, taskPayload, 1);
    log('OK', `Redis task dispatched to ${agentType}: ${JSON.stringify(result)}`);
    return redisDispatchResult(result, taskPayload);
  } catch (error) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${errorMessage(error)}`);
  }
}

export async function spawnAgent(
  config: AnyRecord,
  progress: AnyRecord,
  agentType: string,
  moduleId: string,
  model: string,
  taskPrompt: string,
  opts: AnyRecord = {},
) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  const resolvedModel = requiredCanonicalModelId(model, `Agent '${agentType}' model`);
  if (agentConfig.dispatch !== 'redis') {
    return spawnAcpAgent(config, agentType, moduleId, resolvedModel, taskPrompt, opts);
  }
  const taskType = textValue(opts.taskType) ?? MODULE_TEST_TASK_TYPE;
  return dispatchRedisTask({
    config,
    progress,
    agentType,
    moduleId,
    taskType,
    payload: taskPrompt,
    status: opts.status,
    opts: { ...opts, model: resolvedModel },
  });
}

async function killAcpAgent(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  graceful: boolean,
  opts: AnyRecord,
) {
  const label = opts.trackingLabel || acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  const entryModel = textValue(entry?.model) || '';
  const isSubagent = resolveRuntime({ runtime: entry?.runtime, model: entryModel }) === 'subagent';
  log('STEP', `Destroying ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (${sessionKey})`);
  const termination = await terminateSession(sessionKey, {
    ...sessionLifecyclePolicies(config),
    ...(graceful && opts.graceMs ? { graceMs: opts.graceMs } : {}),
    graceBounded: graceful,
    runtime: entry?.runtime,
    model: entryModel,
    agentId: entry.agentId,
    label: entry.gatewayLabel,
    cleanup: async () => reaperAfterKill(entry.agentId, sessionKey, entry.gatewayLabel),
  });
  if (termination.confirmed) {
    untrackAgent(label);
    log('OK', `Session destroyed: ${label}`);
  } else {
    log(graceful ? 'DEBUG' : 'WARN', `Session not fully reconciled after stop: ${label} (${termination.state})`);
  }
  return termination.confirmed;
}

function emitKilledEvidence(config: AnyRecord, agentType: string, moduleId: string, graceful: boolean, opts: AnyRecord, startedAt: number) {
  if (typeof config?._emitCanonicalEvidence !== 'function') return;
  void Promise.resolve(config._emitCanonicalEvidence('agent.killed', {
    agent_type: agentType,
    module_id: moduleId,
    label: acpLabel(agentType, moduleId),
    reason: graceful ? 'graceful_cleanup' : 'authoritative_kill',
    duration_seconds: (Date.now() - startedAt) / 1000,
    has_changes: opts?.hasChanges ?? null,
    files_changed: null,
  }, { sourceEventId: `agent-killed/${agentType}/${moduleId}/${startedAt}` }));
}

export async function killAgent(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  graceful: boolean = false,
  opts: AnyRecord = {},
) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  if (agentConfig.dispatch === 'redis') {
    log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
    return;
  }
  const startedAt = Date.now();
  const result = await killAcpAgent(config, agentType, moduleId, graceful, opts);
  emitKilledEvidence(config, agentType, moduleId, graceful, opts, startedAt);
  return result;
}
