import { join } from 'node:path';
import { createTelemetryContext, emitEvent } from '../telemetry.ts';
import { requireTelemetryStreamMaxLenFromConfig } from '../../telemetry.ts';
import { createLogger } from '../logger.ts';
import { sendDiscord } from '../discord.ts';
import { loadBusterSessionPolicies } from '../runtime-policy.ts';
import { createTaskCompletionState } from '../task-completion.ts';
import { buildTaskFailureEmbed } from '../pipeline-helpers.ts';
import { firstDefinedValue } from '../../value-boundary.ts';
import type { BusterTaskIdentity } from '../task-contracts.ts';

type AnyRecord = Record<string, any>;

export type TaskRuntime = {
  payload: AnyRecord;
  opts: AnyRecord;
  identity: BusterTaskIdentity;
  moduleId: string;
  taskType: string;
  gateId: string | null;
  gateType: string | null;
  attempt: number;
  suites: string[];
  serveType: string | null;
  commitHash: string;
  project: string;
  runId: string;
  stageId: string;
  workerType: string | null;
  timeoutSeconds: number;
  logBaseDir: string;
  capabilities: string[];
  tctx: any;
  logger: any;
  taskStartMs: number;
  outcome: string;
  reason: string;
  stage: string;
  spawnedSubagent: boolean;
  suitesInfo: any;
  sessionKeyForCompletion: string | null;
  sessionResultForCompletion: any;
  agentResultForCompletion: any;
  dispatchIdForCompletion: string;
  completionState: AnyRecord;
  sessionPolicies: AnyRecord;
  discordContext(extra?: AnyRecord): AnyRecord;
  telemetryIdentity(extra?: AnyRecord): AnyRecord;
};

const state: { lastRunLogDir: string | null } = { lastRunLogDir: null };

export function getLastRunLogDir(): string | null {
  return state.lastRunLogDir;
}

function taskLogBaseDir(payload: AnyRecord, moduleId: string, attempt: number): string {
  if (typeof payload.log_dir === 'string' && payload.log_dir.trim()) return payload.log_dir;
  return join('.swarm', 'logs', 'buster', moduleId, `attempt-${attempt}`);
}

function gateType(payload: AnyRecord): string | null {
  return typeof payload.gate_type === 'string' ? payload.gate_type : null;
}

function correlation(runtime: TaskRuntime, extra: AnyRecord): AnyRecord {
  return {
    gate_id: firstDefinedValue(extra.gate_id, runtime.gateId),
    gate_type: firstDefinedValue(extra.gate_type, runtime.gateType),
    dispatch_id: firstDefinedValue(extra.dispatch_id, runtime.dispatchIdForCompletion),
    session_key: firstDefinedValue(extra.session_key, runtime.sessionKeyForCompletion),
  };
}

function createRuntimeLogger(runtime: TaskRuntime): AnyRecord {
  return createLogger({
    logPath: join(runtime.logBaseDir, 'buster-pipeline.jsonl'), module: runtime.moduleId,
    taskType: runtime.taskType, attempt: runtime.attempt, dispatchId: runtime.dispatchIdForCompletion,
    emitTelemetry: (type: string, data: unknown) => emitEvent(runtime.tctx, type, data as AnyRecord),
  });
}

export function createTaskRuntime(payload: AnyRecord, opts: AnyRecord, identity: BusterTaskIdentity): TaskRuntime {
  const logBaseDir = taskLogBaseDir(payload, identity.moduleId, identity.attempt);
  state.lastRunLogDir = logBaseDir;
  const runtime = {
    payload, opts, identity, moduleId: identity.moduleId, taskType: identity.taskType,
    gateId: identity.gateId, gateType: gateType(payload), attempt: identity.attempt,
    suites: identity.suites, serveType: payload.serve_type ?? null, commitHash: identity.commitHash,
    project: identity.project, runId: identity.runId, stageId: identity.stageId,
    workerType: identity.workerType, timeoutSeconds: identity.timeoutSeconds, logBaseDir,
    capabilities: identity.capabilities, tctx: null, logger: null,
    taskStartMs: Date.now(), outcome: 'FAIL', reason: 'missing_task_lifecycle_reason', stage: 'task-started',
    spawnedSubagent: false, suitesInfo: { results: [], suiteSummary: '', suiteDetailSummary: '', criticalFailed: false },
    sessionKeyForCompletion: null, sessionResultForCompletion: null, agentResultForCompletion: null,
    dispatchIdForCompletion: identity.dispatchId, completionState: createTaskCompletionState(),
    sessionPolicies: opts.sessionPolicies === undefined ? loadBusterSessionPolicies() : opts.sessionPolicies,
    discordContext: (_extra: AnyRecord = {}) => ({}), telemetryIdentity: (_extra: AnyRecord = {}) => ({}),
  } as TaskRuntime;
  runtime.tctx = createTelemetryContext({
    project: runtime.project, module_id: runtime.moduleId, run_id: runtime.runId,
    enabled: opts.telemetryEnabled, log_dir: logBaseDir,
    pipeline_log_path: payload.pipeline_log_path ?? null, pipeline_run_log_path: payload.pipeline_run_log_path ?? null,
    attempt: runtime.attempt, dispatch_id: runtime.dispatchIdForCompletion,
    gate_id: runtime.gateId, gate_type: runtime.gateType,
    ...(opts.platformConfig ? { streamMaxLen: requireTelemetryStreamMaxLenFromConfig(opts.platformConfig) } : {}),
  });
  runtime.logger = createRuntimeLogger(runtime);
  runtime.discordContext = (extra = {}) => ({
    ...correlation(runtime, extra), module_id: runtime.moduleId, project: runtime.project,
    run_id: runtime.runId, attempt: runtime.attempt, log_dir: runtime.logBaseDir,
    pipeline_log_path: payload.pipeline_log_path ?? null, pipeline_run_log_path: payload.pipeline_run_log_path ?? null,
    telemetry_context: runtime.tctx, webhook_url: payload.discord_webhook_url ?? null,
  });
  runtime.telemetryIdentity = (extra = {}) => ({
    module_id: runtime.gateId ? null : runtime.moduleId,
    ...(runtime.gateId ? { gate_id: runtime.gateId, gate_type: runtime.gateType } : {}),
    attempt: runtime.attempt, ...extra,
  });
  return runtime;
}

export function notifyTaskFailure(runtime: TaskRuntime, result: AnyRecord): void {
  sendDiscord(buildTaskFailureEmbed(runtime.moduleId, runtime.project, result as any), runtime.discordContext());
}
