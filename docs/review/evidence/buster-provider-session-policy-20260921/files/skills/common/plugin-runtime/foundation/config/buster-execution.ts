import { validateComponentSettings } from './swarm-bundle.ts';

export interface BusterProviderExecutionSettings {
  readonly maximumProtocolBytes: number;
  readonly terminationGraceMs: number;
  readonly terminationTimeoutMs: number;
  readonly capabilityDrainTimeoutMs: number;
  readonly minimumHeapMiB: number;
  readonly heapFraction: number;
  readonly maximumPendingCapabilities: number;
  readonly minimumOpenFiles: number;
  readonly artifactFileDescriptorReserve: number;

  readonly workerResultWrapperBytes: number;
  readonly cleanupTimeoutMs: number;
  readonly maximumResultBytes: number;
  readonly claimGraceMs: number;
  readonly queueTimeoutMs: number;
}
export interface BusterReportExecutionSettings {
  readonly maximumAggregateResultBytes: number;
  readonly maximumSourceBytes: number;
  readonly maximumCases: number;
  readonly maximumFindings: number;
  readonly maximumCaseFindings: number;
  readonly maximumTimeoutMs: number;
  readonly memoryBytes: number;
  readonly minimumCpuTimeMs: number;
  readonly maximumOpenFiles: number;
}
export interface BusterObservationSettings {
  readonly resourceSampleIntervalMs: number;
  readonly processSampleIntervalMs: number;
}
export interface BusterAttemptStoreSettings {
  readonly maximumEvidenceObjects: number;
  readonly maximumEvidenceBytes: number;
  readonly maximumEvidenceObjectBytes: number;
  readonly maximumResults: number;
  readonly maximumClosures: number;
  readonly maximumMetadataBytes: number;
  readonly maximumPendingEvidenceAgeMs: number;
}
export interface BusterAdmissionStoreSettings {
  readonly maximumIngressBytes: number;
  readonly maximumRecords: number;
  readonly maximumBytes: number;
  readonly maximumQuarantineRecords: number;
  readonly maximumQuarantineBytes: number;
}
export interface BusterExecutionSettings {
  readonly provider: BusterProviderExecutionSettings;
  readonly reports: BusterReportExecutionSettings;
  readonly observation: BusterObservationSettings;
  readonly stores: Readonly<{ attempts: BusterAttemptStoreSettings; admission: BusterAdmissionStoreSettings }>;
}

export function validateBusterExecutionSettings(value: unknown): BusterExecutionSettings {
  validateComponentSettings('buster-execution', value, 'SWARM_CONFIG_BUSTER_EXECUTION_INVALID');
  const policy = value as BusterExecutionSettings;
  validateProviderTiming(policy.provider);
  if (policy.provider.maximumResultBytes > Number.MAX_SAFE_INTEGER - policy.reports.maximumAggregateResultBytes - policy.provider.workerResultWrapperBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_RESULT_SUM_INVALID');
  }
  const requiredReportMemory = 64 * 1024 * 1024 + 3 * policy.reports.maximumSourceBytes
    + 2 * policy.reports.maximumAggregateResultBytes;
  if (policy.reports.memoryBytes < requiredReportMemory) throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_REPORT_MEMORY_INVALID');
  if (policy.stores.attempts.maximumEvidenceObjectBytes > policy.stores.attempts.maximumEvidenceBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_EVIDENCE_POOL_INVALID');
  }
  return Object.freeze({ provider: Object.freeze({ ...policy.provider }), reports: Object.freeze({ ...policy.reports }),
    observation: Object.freeze({ ...policy.observation }), stores: Object.freeze({
      attempts: Object.freeze({ ...policy.stores.attempts }), admission: Object.freeze({ ...policy.stores.admission }),
    }) });
}

export function validateBusterObservationSettings(value: unknown): BusterObservationSettings {
  validateComponentSettings('buster-execution-observation', value, 'SWARM_CONFIG_BUSTER_OBSERVATION_INVALID');
  return Object.freeze({ ...value as BusterObservationSettings });
}

export interface BusterProviderRuntimeSettings {
  readonly provider: BusterProviderExecutionSettings;
  readonly observation: BusterObservationSettings;
}
function validateProviderTiming(provider: BusterProviderExecutionSettings): void {
  if (provider.terminationGraceMs >= provider.terminationTimeoutMs) {
    throw new Error('SWARM_CONFIG_BUSTER_PROVIDER_TERMINATION_ORDER_INVALID');
  }
}
export function validateBusterProviderRuntimeSettings(value: unknown): BusterProviderRuntimeSettings {
  validateComponentSettings('buster-provider-runtime', value, 'SWARM_CONFIG_BUSTER_PROVIDER_RUNTIME_INVALID');
  const policy = value as BusterProviderRuntimeSettings;
  validateProviderTiming(policy.provider);
  return Object.freeze({ provider: Object.freeze({ ...policy.provider }),
    observation: Object.freeze({ ...policy.observation }) });
}
