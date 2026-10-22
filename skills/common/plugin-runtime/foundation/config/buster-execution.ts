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
export interface BusterLegacyReportExecutionSettings {
  readonly runtimeMemoryReserveBytes: number;
  readonly minimumOpenFiles: number;
  readonly minimumHeapMiB: number;
  readonly heapFraction: number;
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
export interface BusterReportPackageSnapshotSettings {
  readonly maximumFiles: number;
  readonly maximumBytes: number;
  readonly timeoutMs: number;
}
export interface BusterReportExecutionSettingsV2 extends BusterLegacyReportExecutionSettings {
  readonly schemaVersion: 'buster-reports.v2';
  readonly packageSnapshot: BusterReportPackageSnapshotSettings;
}
export type BusterReportExecutionSettings = BusterLegacyReportExecutionSettings | BusterReportExecutionSettingsV2;
export function validateBusterReportPackageSnapshot(value: unknown): BusterReportPackageSnapshotSettings {
  validateComponentSettings('buster-report-package-snapshot', value, 'SWARM_CONFIG_BUSTER_PACKAGE_POLICY_INVALID');
  return Object.freeze({ ...value as BusterReportPackageSnapshotSettings });
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
export interface BusterProcessInputSettings {
  readonly cleanupTimeoutMs: number;
  readonly terminationGraceMs: number;
  readonly acknowledgementPollMs: number;
}

export interface BusterLegacyExecutionSettings {
  readonly processInput: BusterProcessInputSettings;
  readonly provider: BusterProviderExecutionSettings;
  readonly reports: BusterReportExecutionSettings;
  readonly observation: BusterObservationSettings;
  readonly stores: Readonly<{ attempts: BusterAttemptStoreSettings; admission: BusterAdmissionStoreSettings }>;
}

export interface BusterExecutionSettingsV2 extends BusterLegacyExecutionSettings {
  readonly schemaVersion: 'buster-execution.v2';
  readonly stores: Readonly<{
    attempts: BusterAttemptStoreSettings & { readonly lockWaitSeconds: number };
    admission: BusterAdmissionStoreSettings & { readonly lockWaitSeconds: number };
  }>;
}
export interface BusterExecutionSettingsV3 extends Omit<BusterExecutionSettingsV2, 'schemaVersion' | 'reports'> {
  readonly schemaVersion: 'buster-execution.v3';
  readonly reports: BusterReportExecutionSettingsV2;
}
export type BusterExecutionSettings = BusterLegacyExecutionSettings | BusterExecutionSettingsV2 | BusterExecutionSettingsV3;

export function validateBusterExecutionSettings(value: unknown): BusterExecutionSettings {
  const versioned = !!value && typeof value === 'object' && Object.hasOwn(value, 'schemaVersion');
  const version = (value as {schemaVersion?: unknown} | null)?.schemaVersion;
  validateComponentSettings(version === 'buster-execution.v3' ? 'buster-execution-v3' : versioned ? 'buster-execution-v2' : 'buster-execution', value, 'SWARM_CONFIG_BUSTER_EXECUTION_INVALID');
  const policy = value as BusterExecutionSettings;
  const processInput = validateBusterProcessInputSettings(policy.processInput);
  validateProviderTiming(policy.provider);
  if (policy.provider.maximumResultBytes > Number.MAX_SAFE_INTEGER - policy.reports.maximumAggregateResultBytes - policy.provider.workerResultWrapperBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_RESULT_SUM_INVALID');
  }
  validateReportCoherence(policy.reports);
  if (policy.stores.attempts.maximumEvidenceObjectBytes > policy.stores.attempts.maximumEvidenceBytes) {
    throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_EVIDENCE_POOL_INVALID');
  }
  return Object.freeze({ ...(versioned ? { schemaVersion: version } : {}), processInput, provider: Object.freeze({ ...policy.provider }), reports: validateBusterReportSettings(policy.reports),
    observation: Object.freeze({ ...policy.observation }), stores: Object.freeze({
      attempts: Object.freeze({ ...policy.stores.attempts }), admission: Object.freeze({ ...policy.stores.admission }),
    }) }) as BusterExecutionSettings;
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

function validateReportCoherence(policy: BusterReportExecutionSettings): void {
  const requiredMemory = policy.runtimeMemoryReserveBytes + 3 * policy.maximumSourceBytes
    + 2 * policy.maximumAggregateResultBytes;
  if (policy.memoryBytes < requiredMemory) throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_REPORT_MEMORY_INVALID');
  if (policy.minimumOpenFiles > policy.maximumOpenFiles) throw new Error('SWARM_CONFIG_BUSTER_REPORT_DESCRIPTOR_RANGE_INVALID');
}
export function validateBusterReportSettings(value: unknown): BusterReportExecutionSettings {
  const versioned = !!value && typeof value === 'object' && Object.hasOwn(value, 'schemaVersion');
  validateComponentSettings(versioned ? 'buster-execution-reports-v2' : 'buster-execution-reports', value, 'SWARM_CONFIG_BUSTER_REPORT_POLICY_INVALID');
  const policy = value as BusterReportExecutionSettings;
  validateReportCoherence(policy);
  return Object.freeze({ ...policy, ...('schemaVersion' in policy ? {packageSnapshot: validateBusterReportPackageSnapshot(policy.packageSnapshot)} : {}) });
}

export function validateBusterProcessInputSettings(value: unknown): BusterProcessInputSettings {
  validateComponentSettings('buster-execution-processInput', value, 'SWARM_CONFIG_BUSTER_PROCESS_INPUT_INVALID');
  const policy = value as BusterProcessInputSettings;
  if (policy.terminationGraceMs >= policy.cleanupTimeoutMs || policy.acknowledgementPollMs > policy.cleanupTimeoutMs) {
    throw new Error('SWARM_CONFIG_BUSTER_PROCESS_INPUT_TIMING_INVALID');
  }
  return Object.freeze({ ...policy });
}
