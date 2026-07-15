import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;

const WORKER_STAGE_IDS = Object.freeze({
  module_forge: 'worker:module_forge',
  module_buster: 'worker:module_buster',
});

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return selectTruthyValue(() => (normalized), () => (null));
}

function normalizeAttempt(value: unknown, fallback = 1): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function stageIdForWorker(workerType: 'module_forge' | 'module_buster') {
  return WORKER_STAGE_IDS[workerType];
}

export function normalizeModuleWorkerInput(workerType: 'module_forge' | 'module_buster', workerInput: AnyRecord = {}) {
  const ids = workerInput?.ids && typeof workerInput.ids === 'object' ? { ...workerInput.ids } : {};
  const refs = workerInput?.refs && typeof workerInput.refs === 'object' ? { ...workerInput.refs } : {};
  const executionContext = workerInput?.executionContext && typeof workerInput.executionContext === 'object'
    ? { ...workerInput.executionContext }
    : {};
  const worker = workerInput?.worker && typeof workerInput.worker === 'object'
    ? { ...workerInput.worker }
    : {};

  ids.moduleId = normalizeString(ids.moduleId);
  ids.runId = normalizeString(ids.runId);
  ids.attempt = normalizeAttempt(ids.attempt);
  ids.stageId = selectDefinedValue(() => (normalizeString(ids.stageId)), () => (stageIdForWorker(workerType)));
  if (workerType === 'module_buster') {
    ids.dispatchId = normalizeString(ids.dispatchId);
  }

  executionContext.moduleDir = normalizeString(executionContext.moduleDir);
  executionContext.timeoutMinutes = selectDefinedValue(() => (executionContext.timeoutMinutes), () => (null));

  if (selectTruthyValue(() => (worker.workerType === undefined), () => (worker.workerType === null))) {
    worker.workerType = workerType;
  }

  if (!ids.moduleId) throw new Error(`${workerType} worker input requires ids.moduleId`);
  if (!ids.runId) throw new Error(`${workerType} worker input requires ids.runId`);
  if (!executionContext.moduleDir) throw new Error(`${workerType} worker input requires executionContext.moduleDir`);

  return {
    ...workerInput,
    ids,
    refs,
    executionContext,
    worker,
  };
}
