export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type WorkerLifecycleState = 'starting' | 'ready' | 'draining' | 'stopped' | 'unhealthy';
export type WorkerAttemptState = 'completed' | 'errored' | 'cancelled' | 'timed_out' | 'interrupted';
export type WorkerProgressState = 'accepted' | 'started' | 'running' | 'cleanup_started' | 'cleanup_completed';
export type WorkerCleanupState = 'not_required' | 'completed' | 'failed';
export type WorkerProtocolV1 = 'worker-protocol.v1';
export type WorkerProtocolVersion = `worker-protocol.v${number}`;

export interface FrozenPackageRefV1 {
  packageId: string;
  packageVersion: string;
  contentDigest: string;
}

export interface WorkerEngineRefV1 {
  engineId: string;
  contractId: string;
  engineVersion: string;
  contentDigest: string;
}

export interface WorkerProfileV1 {
  schemaVersion: 'worker-profile.v1';
  profileId: string;
  profileDigest: string;
  workerType: string;
  coreContractId: string;
  engine: WorkerEngineRefV1;
  capabilities: string[];
}

export interface WorkerCapacityV1 {
  total: number;
  available: number;
  active: number;
}

export interface WorkerRegistrationV1 {
  schemaVersion: 'worker-registration.v1';
  workerId: string;
  workerType: string;
  coreVersion: string;
  protocolVersions: WorkerProtocolVersion[];
  profiles: WorkerProfileV1[];
  capacity: WorkerCapacityV1;
  lifecycleState: WorkerLifecycleState;
  startedAt: string;
  sentAt: string;
}

export interface WorkerHealthV1 {
  schemaVersion: 'worker-health.v1';
  workerId: string;
  sequence: number;
  lifecycleState: WorkerLifecycleState;
  capacity: WorkerCapacityV1;
  activeAttemptIds: string[];
  sentAt: string;
}

export interface AttemptClaimV1 {
  schemaVersion: 'attempt-claim.v1';
  claimId: string;
  attemptId: string;
  generation: number;
  workerId: string;
  claimedAt: string;
  expiresAt: string;
}

export interface WorkerArtifactRefV1 {
  artifactId: string;
  type: string;
  mediaType: string;
  contentDigest: string;
  sizeBytes: number;
  storageUrl: string;
}

export type WorkerInputV1 =
  | {
      name: string;
      kind: 'value';
      schemaId: string;
      schemaDigest: string;
      value: JsonValue;
    }
  | {
      name: string;
      kind: 'artifact';
      artifact: WorkerArtifactRefV1;
    };

export interface WorkerAttemptLimitsV1 {
  timeoutMs: number;
  cleanupTimeoutMs: number;
  cpuMillis: number;
  memoryBytes: number;
  processes: number;
  logBytes: number;
  resultBytes: number;
  evidenceBytes: number;
  evidenceFiles: number;
}

export interface SpecialistOperationV1 {
  contractId: string;
  inputSchemaId: string;
  inputSchemaDigest: string;
  values: Record<string, JsonValue>;
}

export interface WorkerAttemptEnvelopeV1 {
  schemaVersion: 'worker-attempt-envelope.v1';
  protocolVersion: WorkerProtocolV1;
  pipelineRunId: string;
  moduleId: string | null;
  gateId: string | null;
  planId: string;
  nodeId: string;
  executionId: string;
  attemptId: string;
  attemptNumber: number;
  attemptSpecDigest: string;
  claim: AttemptClaimV1;
  profile: WorkerProfileV1;
  packages: FrozenPackageRefV1[];
  grantedCapabilities: string[];
  limits: WorkerAttemptLimitsV1;
  inputs: WorkerInputV1[];
  operation: SpecialistOperationV1;
  cancellationId: string;
  issuedAt: string;
  queueDeadline: string;
}

export interface AttemptProgressEventV1 {
  schemaVersion: 'attempt-progress-event.v1';
  protocolVersion: WorkerProtocolV1;
  attemptId: string;
  claimId: string;
  claimGeneration: number;
  workerId: string;
  sequence: number;
  state: WorkerProgressState;
  message: string;
  progressPercent: number | null;
  details: Record<string, JsonValue>;
  sentAt: string;
}

export interface WorkerLogPartV1 {
  schemaVersion: 'worker-log-part.v1';
  protocolVersion: WorkerProtocolV1;
  attemptId: string;
  claimId: string;
  claimGeneration: number;
  workerId: string;
  sequence: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  contentDigest: string;
  final: boolean;
  sentAt: string;
}

export interface WorkerCancellationRequestV1 {
  schemaVersion: 'worker-cancellation-request.v1';
  protocolVersion: WorkerProtocolV1;
  cancellationId: string;
  attemptId: string;
  requestedAt: string;
  reason: string;
  forceAfterMs: number;
}

export interface WorkerSpecialistResultV1 {
  schemaId: string;
  schemaDigest: string;
  values: Record<string, JsonValue>;
}

export interface WorkerEvidenceRefV1 {
  evidenceId: string;
  type: string;
  artifact: WorkerArtifactRefV1;
}

export interface WorkerResourceUseV1 {
  cpuTimeMs?: number;
  maximumMemoryBytes?: number;
  maximumProcesses?: number;
  logBytes: number;
  resultBytes: number;
  evidenceBytes: number;
}

export interface WorkerCleanupResultV1 {
  state: WorkerCleanupState;
  summary: string | null;
}

export interface WorkerErrorV1 {
  code: string;
  message: string;
}

export interface WorkerReceiptRefV1 {
  receiptId: string;
  receiptDigest: string;
}

export interface WorkerAttemptResultV1 {
  schemaVersion: 'worker-attempt-result.v1';
  protocolVersion: WorkerProtocolV1;
  attemptId: string;
  claimId: string;
  claimGeneration: number;
  workerId: string;
  state: WorkerAttemptState;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  specialistResult: WorkerSpecialistResultV1 | null;
  error: WorkerErrorV1 | null;
  evidence: WorkerEvidenceRefV1[];
  resources: WorkerResourceUseV1;
  cleanup: WorkerCleanupResultV1;
  exitCode: number | null;
  signal: string | null;
  resultDigest: string;
  receipt: WorkerReceiptRefV1;
}

export type WorkerAttemptMessageV1 = AttemptProgressEventV1 | WorkerLogPartV1 | WorkerAttemptResultV1;

export interface ContractValidationResult {
  ok: boolean;
  errors: string[];
}

export type PipelineWorkerCoreDefinition =
  | 'workerLifecycleState'
  | 'workerProfile'
  | 'workerRegistration'
  | 'workerHealth'
  | 'attemptClaim'
  | 'workerAttemptEnvelope'
  | 'attemptProgressEvent'
  | 'workerLogPart'
  | 'workerCancellationRequest'
  | 'workerEvidenceRef'
  | 'workerAttemptResult';
