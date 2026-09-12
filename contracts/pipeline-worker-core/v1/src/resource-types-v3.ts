import type { WorkerAttemptEnvelopeV1, WorkerAttemptResultV1, WorkerProfileV1, WorkerResourceUseV1 } from './types.ts';
import type { WorkerAttemptLimitsV2, WorkerResourceBudget, WorkerResourceObservation } from './resource-types-v2.ts';

/** Explicit migration: Linux tasks include process main threads and all additional threads. */
export type WorkerNativeResourceMetric = 'cpuTimeMs' | 'maximumMemoryBytes' | 'maximumTasks';
export interface WorkerNativeResourceCapabilities {
  schemaVersion: 'worker-resource-capabilities.v2';
  cpuTimeMs: { scope: 'native-attempt-tree'; unit: 'milliseconds'; measurement: 'measured' };
  maximumMemoryBytes: { scope: 'native-attempt-tree'; unit: 'bytes'; measurement: 'measured' };
  maximumTasks: { scope: 'native-attempt-tree'; unit: 'linux-tasks'; measurement: 'measured' };
}
export type WorkerNativeResourceBudgets = { schemaVersion: 'worker-resource-budgets.v2' }
  & Record<WorkerNativeResourceMetric, WorkerResourceBudget>;
export type WorkerNativeResourceObservations = Record<WorkerNativeResourceMetric, WorkerResourceObservation>;
export type WorkerProfileV3 = Omit<WorkerProfileV1, 'schemaVersion'> & {
  schemaVersion: 'worker-profile.v3'; resourceCapabilities: WorkerNativeResourceCapabilities;
};
export type WorkerAttemptEnvelopeV3 = Omit<WorkerAttemptEnvelopeV1, 'schemaVersion' | 'profile' | 'limits'> & {
  schemaVersion: 'worker-attempt-envelope.v3'; profile: WorkerProfileV3;
  limits: WorkerAttemptLimitsV2; resourceBudgets: WorkerNativeResourceBudgets;
};
export interface WorkerNativeResourceAccounting {
  schemaVersion: 'worker-resource-accounting.v2';
  capabilities: WorkerNativeResourceCapabilities;
  budgets: WorkerNativeResourceBudgets;
  observations: WorkerNativeResourceObservations;
}
export type WorkerAttemptResultV3 = Omit<WorkerAttemptResultV1, 'schemaVersion' | 'resources'> & {
  schemaVersion: 'worker-attempt-result.v3'; profileDigest: string; attemptSpecDigest: string;
  resourceAccounting: WorkerNativeResourceAccounting;
  resources: Omit<WorkerResourceUseV1, 'maximumProcesses'> & { maximumTasks?: number };
};
