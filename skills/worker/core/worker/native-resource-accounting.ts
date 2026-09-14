import { workerNativeResourceMetrics, type WorkerNativeResourceAccounting, type WorkerResourceUseV1 } from '@kubeclaw/pipeline-worker-core-contract';

type NativeUse = Partial<WorkerResourceUseV1> & { maximumTasks?: number };
function validBatch(batch: WorkerNativeResourceAccounting['observations'], previous: NativeUse): boolean {
  for (const metric of workerNativeResourceMetrics) {
    const item = batch[metric];
    if (item?.status === 'observed') {
      if (!Number.isSafeInteger(item.value) || item.value < 0 || item.value < (previous[metric] ?? 0)) return false;
    } else if (item?.status !== 'unavailable' || typeof item.reason !== 'string' || !item.reason || item.reason.length > 4096) return false;
  }
  return true;
}

export function assessNativeWorkerResources(measured: unknown, accounting: WorkerNativeResourceAccounting, previous: NativeUse): {
  resources: NativeUse; error?: { code: string; message: string };
} {
  const invalid = () => {
    for (const metric of workerNativeResourceMetrics) accounting.observations[metric] = {
      status: 'unavailable', reason: 'Native worker observation is missing, invalid or regressed',
    };
    return { resources: {}, error: { code: 'WORKER_RESOURCE_MEASUREMENT_INVALID', message: 'Native worker observation is missing, invalid or regressed' } };
  };
  if (!measured || typeof measured !== 'object' || Array.isArray(measured)) return invalid();
  const batch = measured as WorkerNativeResourceAccounting['observations'];
  if (!validBatch(batch, previous)) return invalid();
  const resources: NativeUse = {};
  let error: { code: string; message: string } | undefined;
  const codes = { cpuTimeMs: 'WORKER_CPU_LIMIT', maximumMemoryBytes: 'WORKER_MEMORY_LIMIT', maximumTasks: 'WORKER_TASK_LIMIT' };
  for (const metric of workerNativeResourceMetrics) {
    const item = batch[metric], budget = accounting.budgets[metric];
    accounting.observations[metric] = structuredClone(item);
    if (item.status === 'observed') resources[metric] = item.value;
    if (budget.state !== 'requested') continue;
    if (item.status === 'unavailable') error ??= { code: 'WORKER_RESOURCE_MEASUREMENT_UNAVAILABLE', message: item.reason };
    else if (item.value > budget.limit) error ??= { code: codes[metric], message: codes[metric] };
  }
  return { resources, ...(error ? { error } : {}) };
}
