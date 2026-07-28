type AnyRecord = Record<string, any>;

const WORKER_STAGE_IDS = Object.freeze({
  module_forge: 'worker:module_forge',
  module_buster: 'worker:module_buster',
});

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeAttempt(value: unknown, fallback: any = 1): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function stageIdForWorker(workerType: 'module_forge' | 'module_buster') {
  return WORKER_STAGE_IDS[workerType];
}

function recordCopy(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value as AnyRecord } : {};
}

function normalizeWorkerIds(workerType: 'module_forge' | 'module_buster', value: unknown): AnyRecord {
  const ids = recordCopy(value);
  ids.moduleId = normalizeString(ids.moduleId);
  ids.runId = normalizeString(ids.runId);
  ids.attempt = normalizeAttempt(ids.attempt);
  ids.stageId = normalizeString(ids.stageId) ?? stageIdForWorker(workerType);
  if (workerType === 'module_buster') ids.dispatchId = normalizeString(ids.dispatchId);
  return ids;
}

function normalizeExecutionContext(value: unknown): AnyRecord {
  const executionContext = recordCopy(value);
  executionContext.moduleDir = normalizeString(executionContext.moduleDir);
  executionContext.timeoutMinutes ??= null;
  return executionContext;
}

export function normalizeModuleWorkerInput(workerType: 'module_forge' | 'module_buster', workerInput: AnyRecord = {}) {
  const ids = normalizeWorkerIds(workerType, workerInput.ids);
  const refs = recordCopy(workerInput.refs);
  const executionContext = normalizeExecutionContext(workerInput.executionContext);
  const worker = recordCopy(workerInput.worker);
  worker.workerType ??= workerType;

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
