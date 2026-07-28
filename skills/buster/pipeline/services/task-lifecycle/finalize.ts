import { emitPluginEvent, closeTelemetry } from '../telemetry.ts';
import { publishTaskCompletionWithArtifact } from '../task-completion.ts';
import { getRedisClient } from '../task-queue.ts';
import { runResourceCleanupStage } from './cleanup.ts';
import { publishTaskCompletionSignal } from './completion-signal.ts';
import { safeErrorMessage } from '../runtime-diagnostics.ts';
import { notifyTaskFailure, type TaskRuntime } from './context.ts';

type AnyRecord = Record<string, any>;

function errorIdentity(error: unknown): AnyRecord {
  if (!error || typeof error !== 'object') return { error_name: null, error_code: null };
  return {
    error_name: 'name' in error ? error.name : null,
    error_code: 'code' in error ? error.code : null,
  };
}

function cleanupFailureReason(cleanup: AnyRecord | null): string {
  if (!cleanup) return 'cleanup returned no result';
  if (Array.isArray(cleanup.errors) && cleanup.errors.length > 0) return cleanup.errors.map(error => safeErrorMessage(error)).join('; ');
  if (Array.isArray(cleanup.failures) && cleanup.failures.length > 0) return cleanup.failures.map(error => safeErrorMessage(error)).join('; ');
  if (cleanup.reason) return String(cleanup.reason);
  return String(cleanup.error ?? 'cleanup returned ok=false');
}

function applyCleanupFailure(runtime: TaskRuntime, detail: string): void {
  runtime.outcome = 'FAIL';
  runtime.reason = runtime.reason !== 'missing_task_lifecycle_reason'
    ? `${runtime.reason}; final_cleanup_failed: ${detail}`
    : `final_cleanup_failed: ${detail}`;
  runtime.logger.error('RESOURCE', `Final cleanup failed: ${detail}`);
  notifyTaskFailure(runtime, {
    reason: runtime.reason, stage: runtime.stage, attempt: runtime.attempt,
    taskType: runtime.taskType, commitHash: runtime.commitHash,
  });
}

async function cleanup(runtime: TaskRuntime): Promise<void> {
  runtime.stage = 'final-cleanup';
  runtime.logger.step(runtime.stage);
  try {
    const result = await runResourceCleanupStage({
      payload: runtime.payload, moduleId: runtime.moduleId,
      tctx: runtime.tctx, logger: runtime.logger, stage: 'final',
    });
    if (result?.ok === false) applyCleanupFailure(runtime, cleanupFailureReason(result));
  } catch (error) {
    applyCleanupFailure(runtime, safeErrorMessage(error));
    runtime.logger.error('RESOURCE', `Final cleanup failed: ${safeErrorMessage(error)}`, errorIdentity(error));
  }
}

function suiteCounts(results: AnyRecord[]) {
  return {
    suites_passed: results.filter(result => result.status === 'PASS').length,
    suites_failed: results.filter(result => result.status === 'FAIL').length,
    suites_errored: results.filter(result => result.status === 'ERROR').length,
    suites_skipped: results.filter(result => result.status === 'SKIP').length,
  };
}

async function emitCompletionTelemetry(runtime: TaskRuntime, duration: number): Promise<void> {
  try {
    await emitPluginEvent(runtime.tctx, 'task_completed', runtime.telemetryIdentity({
      task_type: runtime.taskType, stage_id: runtime.stageId, worker_type: runtime.workerType,
      outcome: runtime.outcome, reason: runtime.reason, duration_seconds: duration,
      ...suiteCounts(runtime.suitesInfo.results), suite_summary: runtime.suitesInfo.suiteSummary,
      spawned_subagent: runtime.spawnedSubagent,
    }));
  } catch (error) {
    runtime.logger.error('TELEMETRY', `Task completion telemetry failed: ${safeErrorMessage(error)}`, errorIdentity(error));
  }
}

async function emitCompletionSignal(runtime: TaskRuntime): Promise<void> {
  await publishTaskCompletionSignal({
    payload: runtime.payload, completionState: runtime.completionState,
    spawnedSubagent: runtime.spawnedSubagent, suitesInfo: runtime.suitesInfo,
    agentResultForCompletion: runtime.agentResultForCompletion,
    sessionResultForCompletion: runtime.sessionResultForCompletion,
    moduleId: runtime.moduleId, project: runtime.project, outcome: runtime.outcome,
    reason: runtime.reason, runId: runtime.runId, attempt: runtime.attempt,
    dispatchIdForCompletion: runtime.dispatchIdForCompletion,
    sessionKeyForCompletion: runtime.sessionKeyForCompletion, logger: runtime.logger,
    deps: { getRedisClient, publishTaskCompletionWithArtifact },
  });
}

async function closeRuntime(runtime: TaskRuntime): Promise<void> {
  try {
    runtime.logger.flush();
  } catch (error) {
    runtime.logger.error('TASK', `Logger flush failed: ${safeErrorMessage(error)}`, errorIdentity(error));
  }
  try {
    await closeTelemetry(runtime.tctx);
  } catch (error) {
    runtime.logger.error('TELEMETRY', `Telemetry close failed: ${safeErrorMessage(error)}`, errorIdentity(error));
  }
}

export async function finalizeTask(runtime: TaskRuntime): Promise<void> {
  await cleanup(runtime);
  const duration = Math.round((Date.now() - runtime.taskStartMs) / 1000);
  await emitCompletionTelemetry(runtime, duration);
  runtime.logger.info('TASK', `Task completed: outcome=${runtime.outcome} reason=${runtime.reason} duration=${duration}s`);
  await emitCompletionSignal(runtime);
  await closeRuntime(runtime);
}
