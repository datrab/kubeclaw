export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type TestMode = 'blocking' | 'advisory';
export type PlanNodeKind = 'test' | 'fixture';
export type LinkKind = 'value' | 'artifact';
export type ExecutionState = 'completed' | 'errored' | 'cancelled' | 'timed_out';
export type TestOutcome = 'passed' | 'failed' | 'skipped' | null;
export type TerminalNodeState = ExecutionState | 'skipped';

export interface PackageRefV1 {
  packageId: string;
  packageVersion: string;
  contentDigest: string;
}

export interface ProviderRefV1 extends PackageRefV1 {
  registrationId: string;
  contractId: string;
}

export interface ReceiptRefV1 {
  receiptId: string;
  receiptDigest: string;
}

export type PortDeclarationV1 =
  | { name: string; kind: 'value'; required: boolean; schemaId: string }
  | { name: string; kind: 'artifact'; required: boolean; schemaId?: string; mediaTypes: string[] };

export interface EvidencePolicyV1 {
  onPass: string[];
  onFail: string[];
  onError: string[];
}

export interface ExecutionLimitsV1 {
  cpuMillis: number;
  memoryBytes: number;
  logBytes: number;
  artifactBytes: number;
  artifactFiles: number;
  processes: number;
}

export interface ProviderDetailsV1 {
  schemaId: string;
  schemaDigest: string;
  values: Record<string, JsonValue>;
}

export interface ProviderRegistrationV1 {
  schemaVersion: 'provider-registration.v1';
  registrationId: string;
  contractId: string;
  kind: PlanNodeKind;
  package: PackageRefV1;
  entrypoint: { module: string; export: string };
  configSchema: string;
  inputs: PortDeclarationV1[];
  outputs: PortDeclarationV1[];
  capabilities: string[];
  retrySafe: boolean;
  matrixFields: string[];
  reportFormats: string[];
  evidenceTypes: string[];
  evidenceDefaults: EvidencePolicyV1;
}

export interface ProviderConfigurationV1 {
  schemaVersion: 'provider-configuration.v1';
  contractId: string;
  schemaDigest: string;
  values: Record<string, JsonValue>;
}

export interface ProviderInvocationV1 {
  schemaVersion: 'provider-invocation.v1';
  planId: string;
  runId: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  executionId: string;
  testIdentity: string;
  nodeKind: PlanNodeKind;
  attemptId: string;
  attemptNumber: number;
  provider: ProviderRefV1;
  configuration: ProviderConfigurationV1;
  inputs: ResolvedInputV1[];
  evidence: EvidencePolicyV1;
  grantedCapabilities: string[];
  timeoutMs: number;
  limits: ExecutionLimitsV1;
  workspace: {
    repository: string;
    scratch: string;
    evidence: string;
  };
}

export interface ArtifactRefV1 {
  artifactId: string;
  type: string;
  mediaType: string;
  contentDigest: string;
  sizeBytes: number;
  storageUrl: string;
}

export type ResolvedInputV1 =
  | { name: string; kind: 'value'; schemaId: string; value: JsonValue }
  | { name: string; kind: 'artifact'; artifact: ArtifactRefV1 };

export type ProducedOutputV1 =
  | { name: string; kind: 'value'; schemaId: string; value: JsonValue }
  | { name: string; kind: 'artifact'; artifact: ArtifactRefV1 };

export type ProviderOutputV1 =
  | { name: string; kind: 'value'; schemaId: string; value: JsonValue }
  | { name: string; kind: 'artifact'; evidenceId: string };

export type TypedLinkV1 =
  | {
      schemaVersion: 'typed-link.v1';
      kind: 'value';
      from: { nodeId: string; output: string };
      to: { nodeId: string; input: string };
      schemaId: string;
    }
  | {
      schemaVersion: 'typed-link.v1';
      kind: 'artifact';
      from: { nodeId: string; output: string };
      to: { nodeId: string; input: string };
      schemaId?: string;
      mediaType: string;
    };

export interface DependencyV1 {
  nodeId: string;
  acceptedResults: Array<'passed' | 'failed' | 'skipped' | 'errored' | 'cancelled' | 'timed_out'>;
}

export interface ResolvedPlanNodeV1 {
  id: string;
  executionId: string;
  testIdentity: string;
  suiteInstanceId: string | null;
  kind: PlanNodeKind;
  provider: ProviderRefV1;
  reportAdapters: ReportAdapterRefV1[];
  mode: TestMode | null;
  reviewAgent?: string | null;
  configuration: ProviderConfigurationV1;
  dependencies: DependencyV1[];
  timeoutMs: number;
  limits: ExecutionLimitsV1;
  retryCount: number;
  concurrencyGroup: string | null;
  parentNodeId: string | null;
  variation: Record<string, JsonValue>;
  evidence: EvidencePolicyV1;
  skipReason: string | null;
}

export interface ResolvedSuiteRefV1 {
  instanceId: string;
  contractId: string;
  templateDigest: string;
}

export interface ResolvedTestPlanV1 {
  schemaVersion: 'resolved-test-plan.v1';
  planId: string;
  planDigest: string;
  runId: string;
  project: string;
  scope: { moduleId: string | null; gateId: string | null };
  registrySnapshotDigest: string;
  createdAt: string;
  suites: ResolvedSuiteRefV1[];
  nodes: ResolvedPlanNodeV1[];
  links: TypedLinkV1[];
  concurrencyLimits: Record<string, number>;
}

export interface EvidenceRefV1 {
  evidenceId: string;
  type: string;
  artifact: ArtifactRefV1;
}

export interface DeclaredEvidenceV1 {
  evidenceId: string;
  type: string;
  file: string;
  mediaType: string;
  artifact?: ArtifactRefV1;
}

export interface EvidenceManifestV1 {
  schemaVersion: 'evidence-manifest.v1';
  planId: string;
  runId: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  executionId: string;
  attemptId: string;
  files: DeclaredEvidenceV1[];
}

export interface TestCountsV1 {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface FindingV1 {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  rule?: string;
  file?: string;
  line?: number;
}

export interface MetricV1 {
  name: string;
  value: number;
  unit?: string;
}

export interface ResourceUseV1 {
  cpuTimeMs?: number;
  maximumMemoryBytes?: number;
  logBytes: number;
  artifactBytes: number;
}

export interface ProviderResultV1 {
  schemaVersion: 'provider-result.v1';
  outcome: Exclude<TestOutcome, null>;
  summary: string;
  counts: TestCountsV1;
  findings: FindingV1[];
  metrics: MetricV1[];
  evidenceFiles: DeclaredEvidenceV1[];
  reports: ProviderReportV1[];
  outputs: ProviderOutputV1[];
  exitCode: number | null;
  signal: string | null;
  providerDetails: ProviderDetailsV1 | null;
}

export interface ProviderReportV1 {
  evidenceId: string;
  format: string;
}

export interface AttemptResultV1 {
  schemaVersion: 'attempt-result.v1';
  planId: string;
  runId: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  executionId: string;
  testIdentity: string;
  nodeKind: PlanNodeKind;
  attemptId: string;
  attemptNumber: number;
  provider: ProviderRefV1;
  mode: TestMode | null;
  executionState: ExecutionState;
  outcome: TestOutcome;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  counts: TestCountsV1;
  findings: FindingV1[];
  metrics: MetricV1[];
  reports: ReportAdapterResultV1[];
  evidence: EvidenceRefV1[];
  outputs: ProducedOutputV1[];
  resources: ResourceUseV1;
  exitCode: number | null;
  signal: string | null;
  providerDetails: ProviderDetailsV1 | null;
  resultDigest: string;
  receipt: ReceiptRefV1;
}

export interface NodeResultV1 {
  schemaVersion: 'node-result.v1';
  planId: string;
  runId: string;
  moduleId: string | null;
  gateId: string | null;
  suiteInstanceId: string | null;
  nodeId: string;
  executionId: string;
  testIdentity: string;
  nodeKind: PlanNodeKind;
  mode: TestMode | null;
  state: TerminalNodeState;
  outcome: TestOutcome;
  attemptIds: string[];
  finalAttemptId: string | null;
  unstable: boolean;
  skipReason: string | null;
  resultDigest: string;
  receipt: ReceiptRefV1;
}

export interface ReportAdapterRegistrationV1 {
  schemaVersion: 'report-adapter-registration.v1';
  adapterId: string;
  format: string;
  contractVersion: number;
  package: PackageRefV1;
  entrypoint: { module: string; export: string };
  mediaTypes: string[];
}

export interface ReportAdapterRefV1 {
  adapterId: string;
  format: string;
  contractVersion: number;
  package: PackageRefV1;
}

export type ReportCaseOutcome = 'passed' | 'failed' | 'errored' | 'skipped';

export interface ReportCountsV1 {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
}

export interface ReportCaseV1 {
  id: string;
  name: string;
  suitePath: string[];
  className: string | null;
  outcome: ReportCaseOutcome;
  durationMs: number;
  findings: FindingV1[];
  findingsTruncated: boolean;
  omittedFindingCount: number;
}

export interface ReportAdapterResultV1 {
  schemaVersion: 'report-adapter-result.v1';
  adapter: ReportAdapterRefV1;
  sourceArtifact: ArtifactRefV1;
  counts: ReportCountsV1;
  durationMs: number;
  cases: ReportCaseV1[];
  casesTruncated: boolean;
  omittedCaseCount: number;
  findings: FindingV1[];
  findingsTruncated: boolean;
  omittedFindingCount: number;
}

export interface RepositoryArchiveV1 {
  schemaVersion: 'repository-archive.v1';
  encoding: 'base64';
  contentDigest: string;
  sizeBytes: number;
  data: string;
}

export interface SourceSnapshotV1 {
  schemaVersion: 'source-snapshot.v1';
  sourceType: 'git-commit';
  pipelineStageId: string;
  repositoryId: string;
  revision: string;
  tree: string;
  archiveContentDigest: string;
  archiveSizeBytes: number;
  creatorAuthority: string;
  attestation: {
    schemaVersion: 'source-snapshot-attestation.v1';
    algorithm: 'ed25519';
    authority: string;
    signature: string;
  };
}

export interface RemotePlanJobV1 {
  schemaVersion: 'buster-plan-job.v1';
  jobId: string;
  idempotencyKey: string;
  requestDigest: string;
  pipelineStageId: string;
  plan: ResolvedTestPlanV1;
  sourceSnapshot: SourceSnapshotV1;
  repositoryArchive: RepositoryArchiveV1;
  grants: Record<string, string[]>;
  maximumConcurrency: number;
  submittedAt: string;
}

export interface RemotePlanResultV1 {
  schemaVersion: 'buster-plan-result.v1';
  jobId: string;
  planId: string;
  planDigest: string;
  runId: string;
  attempts: AttemptResultV1[];
  nodes: NodeResultV1[];
  cleanupErrors: Array<{ nodeId: string; message: string }>;
  completedAt: string;
  resultDigest: string;
  receipt: ReceiptRefV1;
}

export interface RemotePlanResultRefV1 {
  schemaVersion: 'buster-plan-result-ref.v1';
  resultDigest: string;
  contentDigest: string;
  sizeBytes: number;
}

export type RemotePlanJobState = 'accepted' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';

export interface RemotePlanStatusV1 {
  schemaVersion: 'buster-plan-status.v1';
  jobId: string;
  requestDigest: string;
  state: RemotePlanJobState;
  submittedAt: string;
  updatedAt: string;
  result: RemotePlanResultRefV1 | null;
  error: string | null;
}

export interface ContractValidationResult {
  ok: boolean;
  errors: string[];
}

export type PipelineTestGateDefinition =
  | 'providerRegistration'
  | 'providerConfiguration'
  | 'resolvedTestPlan'
  | 'providerInvocation'
  | 'providerResult'
  | 'attemptResult'
  | 'nodeResult'
  | 'evidenceManifest'
  | 'typedLink'
  | 'reportAdapterRegistration'
  | 'reportAdapterResult'
  | 'remotePlanJob'
  | 'remotePlanResult'
  | 'remotePlanStatus';
