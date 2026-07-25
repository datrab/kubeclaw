import { validateBusterTaskPayload } from './task-validation.ts';
import { safeErrorMessage } from './runtime-diagnostics.ts';
import { createTaskRuntime, getLastRunLogDir as lastRunLogDir, notifyTaskFailure } from './task-lifecycle/context.ts';
import { announceTaskStart, executeTask } from './task-lifecycle/execution.ts';
import { finalizeTask } from './task-lifecycle/finalize.ts';
import { appendAppTestCredentialsToPrompt, appendPreTestResultsToPrompt } from './task-lifecycle/prompt.ts';

type AnyRecord = Record<string, any>;

export function getLastRunLogDir(): string | null {
  return lastRunLogDir();
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function resolveAgentJudgmentPolicy(payload: AnyRecord = {}) {
  const policy = payload.agent_judgment;
  if (policy === undefined || policy === null) {
    return { required: false, source: 'default', reason: 'deterministic_suites_authoritative' };
  }
  if (!isPlainObject(policy)) throw new Error('Buster payload agent_judgment must be an object');
  if (typeof policy.required !== 'boolean') throw new Error('Buster payload agent_judgment.required must be a boolean');
  const explicitReason = typeof policy.reason === 'string' ? policy.reason.trim() : '';
  const reason = explicitReason || (policy.required ? 'agent_judgment_required' : 'deterministic_suites_authoritative');
  return { required: policy.required, source: 'payload', reason };
}

function reportUnhandledFailure(runtime: ReturnType<typeof createTaskRuntime>, error: unknown): void {
  runtime.outcome = 'FAIL';
  runtime.reason = `internal_error: ${safeErrorMessage(error)}`;
  runtime.logger.error('TASK', `Unhandled task failure at ${runtime.stage}: ${safeErrorMessage(error)}`, {
    error_name: error && typeof error === 'object' && 'name' in error ? error.name : null,
    error_code: error && typeof error === 'object' && 'code' in error ? error.code : null,
  });
  notifyTaskFailure(runtime, {
    reason: runtime.reason, stage: runtime.stage, attempt: runtime.attempt,
    taskType: runtime.taskType, commitHash: runtime.commitHash,
  });
}

export async function processTask(payload: AnyRecord, opts: AnyRecord = {}) {
  const identity = validateBusterTaskPayload(payload);
  const runtime = createTaskRuntime(payload, { ...opts, resolveAgentJudgmentPolicy }, identity);
  try {
    await announceTaskStart(runtime);
    await executeTask(runtime);
  } catch (error) {
    reportUnhandledFailure(runtime, error);
  } finally {
    await finalizeTask(runtime);
  }
  return { outcome: runtime.outcome, reason: runtime.reason, completion: runtime.completionState };
}

export const __taskLifecycleTest = {
  appendAppTestCredentialsToPrompt,
  appendPreTestResultsToPrompt,
  resolveAgentJudgmentPolicy,
};
