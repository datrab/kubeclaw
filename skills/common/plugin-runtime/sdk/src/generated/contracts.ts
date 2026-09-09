// Generated from skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json. Do not edit.

/**
 * Explicit current runtime transport producer profile. Absence in historical contexts preserves the legacy producer; no profile is inferred from another digest version.
 */
export type RuntimeDispatchProfile = {schemaVersion: 'runtime-dispatch-profile.v1'; encoding: 'json-utf16-v1'};
/**
 * Existing opaque keys, plus the exact historical adapter dependency producer grammar. Package/capability names retain their 160-character bounds and registration its 96-character bound. New dependency keys are compact opaque IDs.
 */
export type EffectIdempotencyKey = OpaqueId;
export type OpaqueId = string;
export type NamespacedId = string;
/**
 * The original public adapter dependency delivery token: nonblank and at most 512 characters. Observer delivery contracts remain opaque IDs.
 */
export type EffectDeliveryId = string;
export type EffectAttemptIdentity =
  | AttemptIdentity
  | {
      runId: AdapterActivationId;
      stageId: 'adapter-activation';
      attemptId: AdapterActivationId;
      attemptNumber: 1;
    };
export type LocalId = string;
export type AdapterActivationId = string;
export type TestContractId = string;
export type RelativeModulePath = string;
export type RelativeSchemaPath = string;
export type TestProviderPort =
  | {
      name: LocalId;
      kind: 'value';
      required: boolean;
      schemaId: TestContractId;
    }
  | {
      name: LocalId;
      kind: 'artifact';
      required: boolean;
      schemaId?: TestContractId;
      /**
       * @minItems 1
       * @maxItems 32
       */
      mediaTypes: [string, ...string[]];
    };
export type PluginManifest = PluginManifest1 & {
  id: NamespacedId;
  apiVersion: 'pipeline-plugin-v2';
  packageVersion: string;
  stages: StageRegistration[];
  observers: ObserverRegistration[];
  adapters: AdapterRegistration[];
  testProviders?: TestProviderRegistration[];
  reportAdapters?: ReportAdapterRegistration[];
};
export type PluginManifest1 =
  | {
      /**
       * @minItems 1
       */
      stages: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      observers: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      adapters: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      testProviders: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      reportAdapters: [any, ...any[]];
      [k: string]: any;
    };
export type StageResult =
  | (ResultBase & {
      schemaVersion: 'stage-result.v2';
      outcome: 'passed';
      artifacts: ArtifactRef[];
      facts?: DecisionFacts;
    })
  | (ResultBase & {
      schemaVersion: 'stage-result.v2';
      outcome: 'retry' | 'request_fix' | 'blocked' | 'failed' | 'timed_out' | 'cancelled';
      reason: Reason;
      artifacts: ArtifactRef[];
    })
  | (ResultBase & {
      schemaVersion: 'stage-result.v2';
      outcome: 'wait' | 'orchestrator_required';
      reason: Reason;
      artifacts: ArtifactRef[];
      wait: WaitRequest;
    })
  | (ResultBase & {
      schemaVersion: 'stage-result.v2';
      outcome: 'rate_limited';
      reason: Reason;
      artifacts: ArtifactRef[];
      retryAt: string;
    });
export type EffectReceipt = {
  [k: string]: any;
} & {
  schemaVersion: 'effect-receipt.v2';
  effectId: OpaqueId;
  idempotencyKey: EffectIdempotencyKey;
  adapter: PackageResolution;
  status: 'accepted' | 'completed' | 'failed';
  result?: JsonObject;
  error?: Reason;
  recordedAt: string;
};
export type AdministrativeReopenDecision =
  | {
      schemaVersion: 'administrative-reopen.v2';
      decisionId: OpaqueId;
      idempotencyKey: OpaqueId;
      runId: OpaqueId;
      stageId: LocalId;
      actor: {
        type: 'operator' | 'administrator';
        id: OpaqueId;
      };
      reason: Reason;
      continuation: 'remediation';
      remediationStageId: LocalId;
      decidedAt: string;
    }
  | {
      schemaVersion: 'administrative-reopen.v2';
      decisionId: OpaqueId;
      idempotencyKey: OpaqueId;
      runId: OpaqueId;
      stageId: LocalId;
      actor: {
        type: 'operator' | 'administrator';
        id: OpaqueId;
      };
      reason: Reason;
      continuation: 'retry' | 'cancel';
      /**
       * @minItems 1
       */
      packageUpgrades?: [
        {
          pluginId: NamespacedId;
          from: PackageIdentity;
          to: PackageIdentity;
        },
        ...{
          pluginId: NamespacedId;
          from: PackageIdentity;
          to: PackageIdentity;
        }[]
      ];
      decidedAt: string;
    };
export type InvocationLease = {
  [k: string]: any;
} & {
  schemaVersion: 'invocation-lease.v2';
  leaseId: OpaqueId;
  attempt: AttemptIdentity;
  registration: RegistrationProvenance;
  status: 'active' | 'revoked';
  grants: CapabilityGrant[];
  limits: {
    wallTimeMs: number;
    memoryBytes: number;
    cpuMillis: number;
  };
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revocationReason?: Reason;
};
export type AdapterLifecycle = {
  [k: string]: any;
} & {
  schemaVersion: 'adapter-lifecycle.v2';
  provider: RegistrationProvenance;
  status: 'activating' | 'ready' | 'degraded' | 'stopping' | 'stopped' | 'failed';
  changedAt: string;
  reason?: Reason;
};

export interface PluginSystemV2 {
  runtimeDispatchProfile?: RuntimeDispatchProfile;
  effectIdempotencyKey?: EffectIdempotencyKey;
  resourceIdentity?: ResourceIdentity;
  effectDeliveryId?: EffectDeliveryId;
  effectAttemptIdentity?: EffectAttemptIdentity;
  adapterActivationId?: AdapterActivationId;
  testContractId?: TestContractId;
  packageIdentity?: PackageIdentity;
  packageResolution?: PackageResolution;
  stageRegistration?: StageRegistration;
  observerRegistration?: ObserverRegistration;
  adapterRegistration?: AdapterRegistration;
  testProviderPort?: TestProviderPort;
  testEvidencePolicy?: TestEvidencePolicy;
  testProviderRegistration?: TestProviderRegistration;
  reportAdapterRegistration?: ReportAdapterRegistration;
  pluginManifest?: PluginManifest;
  stageDefinition?: StageDefinition;
  pipelineDefinition?: PipelineDefinition;
  attemptIdentity?: AttemptIdentity;
  stageAttempt?: StageAttempt;
  artifactRef?: ArtifactRef;
  decisionFacts?: DecisionFacts;
  stageResult?: StageResult;
  effectRequest?: EffectRequest;
  effectReceipt?: EffectReceipt;
  waitRequest?: WaitRequest;
  resumeSignal?: ResumeSignal;
  administrativeReopenDecision?: AdministrativeReopenDecision;
  packageProvenance?: PackageProvenance;
  registrationProvenance?: RegistrationProvenance;
  capabilityGrant?: CapabilityGrant;
  invocationLease?: InvocationLease;
  pluginContext?: PluginContext;
  eventIdentity?: EventIdentity;
  lifecycleEvent?: LifecycleEvent;
  pluginDomainEvent?: PluginDomainEvent;
  observerDelivery?: ObserverDelivery;
  observerCheckpoint?: ObserverCheckpoint;
  adapterLifecycle?: AdapterLifecycle;
  resourceLock?: ResourceLock;
  pluginStateEntry?: PluginStateEntry;
}
/**
 * Capability-owned resource names include URLs, absolute paths, dot and catalog keys. Capability implementations retain their own URL, path and authorization constraints.
 */
export interface ResourceIdentity {
  type: NamespacedId;
  canonicalId: string;
}
export interface AttemptIdentity {
  runId: OpaqueId;
  stageId: LocalId;
  attemptId: OpaqueId;
  attemptNumber: number;
}
export interface PackageIdentity {
  pluginId: NamespacedId;
  apiVersion: 'pipeline-plugin-v2';
  packageVersion: string;
  contentDigest: string;
}
export interface PackageResolution {
  pluginId: NamespacedId;
  apiVersion: 'pipeline-plugin-v2';
  packageVersion: string;
  contentDigest: string;
  registrationId: LocalId;
}
export interface StageRegistration {
  id: LocalId;
  type: NamespacedId;
  module: RelativeModulePath;
  export: string;
  requiredCapabilities: NamespacedId[];
  configSchema: RelativeSchemaPath;
  inputSchema: RelativeSchemaPath;
  resultSchema: RelativeSchemaPath;
}
export interface ObserverRegistration {
  id: LocalId;
  module: RelativeModulePath;
  export: string;
  /**
   * @minItems 1
   */
  subscriptions: [NamespacedId, ...NamespacedId[]];
  delivery: 'at_least_once';
  ordering: 'per_run';
  failurePolicy: {
    mode: 'best_effort' | 'required';
    maxAttempts: number;
    backoffMs: number;
    timeoutMs: number;
  };
  requiredCapabilities: NamespacedId[];
  configSchema: RelativeSchemaPath;
  checkpointSchema: RelativeSchemaPath;
}
export interface AdapterRegistration {
  id: LocalId;
  module: RelativeModulePath;
  export: string;
  /**
   * @minItems 1
   */
  providesCapabilities: [NamespacedId, ...NamespacedId[]];
  requiredCapabilities: NamespacedId[];
  configSchema: RelativeSchemaPath;
}
export interface TestEvidencePolicy {
  /**
   * @maxItems 128
   */
  onPass: LocalId[];
  /**
   * @maxItems 128
   */
  onFail: LocalId[];
  /**
   * @maxItems 128
   */
  onError: LocalId[];
}
export interface TestProviderRegistration {
  id: LocalId;
  contractId: TestContractId;
  kind: 'test' | 'fixture';
  module: RelativeModulePath;
  export: string;
  configSchema: RelativeSchemaPath;
  /**
   * @maxItems 128
   */
  inputs: TestProviderPort[];
  /**
   * @maxItems 128
   */
  outputs: TestProviderPort[];
  /**
   * @maxItems 128
   */
  requiredCapabilities: NamespacedId[];
  retrySafe: boolean;
  /**
   * @maxItems 64
   */
  matrixFields: LocalId[];
  /**
   * @maxItems 32
   */
  reportFormats: LocalId[];
  /**
   * @maxItems 128
   */
  evidenceTypes: LocalId[];
  evidenceDefaults: TestEvidencePolicy;
}
export interface ReportAdapterRegistration {
  id: LocalId;
  format: LocalId;
  contractVersion: number;
  module: RelativeModulePath;
  export: string;
  /**
   * @minItems 1
   * @maxItems 32
   */
  mediaTypes: [string, ...string[]];
}
export interface StageDefinition {
  id: LocalId;
  type: NamespacedId;
  dependsOn: LocalId[];
  config: JsonObject;
  input: JsonObject;
  activation?: {
    sourceStage: LocalId;
    fact: NamespacedId;
    equals: string | number | boolean | null;
  };
  execution: {
    maxAttempts: number;
    maxRemediationCycles: number;
    maxTechnicalRetries?: number;
    repairCategory?: LocalId;
    repairBudget?: {
      categories: {
        [k: string]: number;
      };
      maximumOrchestratorOrders: number;
    };
    orchestratorAfterAttempt?: number;
    timeoutMs: number;
  };
  on?: {
    request_fix?: LocalId;
  };
}
export interface JsonObject {
  [k: string]: any;
}
export interface PipelineDefinition {
  schemaVersion: 'pipeline-definition.v2';
  id: OpaqueId;
  maxConcurrency: number;
  /**
   * @minItems 1
   */
  stages: [StageDefinition, ...StageDefinition[]];
}
export interface StageAttempt {
  schemaVersion: 'stage-attempt.v2';
  identity: AttemptIdentity;
  owner: PackageResolution;
  stageType: NamespacedId;
  leaseId: OpaqueId;
  status: 'created' | 'dispatched' | 'completed' | 'timed_out' | 'cancelled';
  retryBudgetUsed: number;
  remediationBudgetUsed: number;
  createdAt: string;
  dispatchedAt?: string;
  finishedAt?: string;
}
export interface ArtifactRef {
  encoding?: 'kubeclaw-json.utf16.v1';
  artifactId: OpaqueId;
  namespace: NamespacedId;
  mediaType: string;
  digest: string;
  sizeBytes: number;
  producer: AttemptIdentity;
}
export interface DecisionFacts {
  [k: string]: string | number | boolean | null;
}
export interface ResultBase {
  schemaVersion: 'stage-result.v2';
  outcome:
    | 'passed'
    | 'retry'
    | 'request_fix'
    | 'wait'
    | 'orchestrator_required'
    | 'blocked'
    | 'failed'
    | 'timed_out'
    | 'rate_limited'
    | 'cancelled';
  reason?: Reason;
  artifacts: ArtifactRef[];
  [k: string]: any;
}
export interface Reason {
  code: NamespacedId;
  message?: string;
  details?: JsonObject;
}
export interface WaitRequest {
  schemaVersion: 'wait-request.v2';
  waitId: OpaqueId;
  kind: 'signal' | 'orchestrator';
  signalType: NamespacedId;
  authorizedIssuer: {
    type: 'orchestrator' | 'operator' | 'adapter';
    id: OpaqueId;
  };
  expiresAt: string | null;
  request?: JsonObject;
}
export interface EffectRequest {
  schemaVersion: 'effect-request.v2';
  effectId: OpaqueId;
  idempotencyKey: EffectIdempotencyKey;
  deliveryId?: EffectDeliveryId;
  attempt: EffectAttemptIdentity;
  capability: NamespacedId;
  operation: LocalId;
  resource: ResourceIdentity;
  payload: JsonObject;
  requestedAt: string;
}
export interface ResumeSignal {
  schemaVersion: 'resume-signal.v2';
  signalId: OpaqueId;
  idempotencyKey: OpaqueId;
  waitId: OpaqueId;
  signalType: NamespacedId;
  issuer: {
    type: 'orchestrator' | 'operator' | 'adapter';
    id: OpaqueId;
  };
  issuedAt: string;
  payload: JsonObject;
}
export interface PackageProvenance {
  schemaVersion: 'package-provenance.v2';
  package: PackageIdentity;
  source: {
    type: 'builtin' | 'local' | 'git' | 'registry';
    canonicalReference: string;
  };
  canonicalPath: string;
  trustScope: 'trusted_first_party' | 'isolated_external';
  trustEvidence: {
    [k: string]: any;
  };
  resolvedAt: string;
}
export interface RegistrationProvenance {
  schemaVersion: 'registration-provenance.v2';
  package: PackageProvenance;
  surface: 'stage' | 'observer' | 'adapter' | 'test_provider' | 'report_adapter';
  registrationId: LocalId;
}
export interface CapabilityGrant {
  capability: NamespacedId;
  provider: PackageResolution;
  constraints: JsonObject;
}
export interface PluginContext {
  schemaVersion: 'plugin-context.v2';
  runtimeDispatchProfile?: RuntimeDispatchProfile;
  lease: InvocationLease;
  config: JsonObject;
  input: JsonObject;
  guidance?: JsonObject;
  stageLifecycle?: {
    attemptsUsed: number;
    remediationCyclesUsed: number;
    maxAttempts: number;
    maxRemediationCycles: number;
  };
  artifacts: ArtifactRef[];
}
export interface EventIdentity {
  runId: OpaqueId;
  stageId?: LocalId;
  attemptId?: OpaqueId;
  effectId?: OpaqueId;
  waitId?: OpaqueId;
  artifactId?: OpaqueId;
}
export interface LifecycleEvent {
  schemaVersion: 'lifecycle-event.v2';
  eventId: OpaqueId;
  sequence: number;
  type:
    | 'run.created'
    | 'run.started'
    | 'run.resumed'
    | 'run.waiting'
    | 'run.paused'
    | 'run.succeeded'
    | 'run.failed'
    | 'run.blocked'
    | 'run.cancelled'
    | 'stage.scheduled'
    | 'stage.started'
    | 'stage.waiting'
    | 'stage.retrying'
    | 'stage.skipped'
    | 'stage.succeeded'
    | 'stage.failed'
    | 'stage.blocked'
    | 'stage.cancelled'
    | 'attempt.created'
    | 'attempt.dispatched'
    | 'attempt.completed'
    | 'attempt.timed_out'
    | 'attempt.cancelled'
    | 'effect.requested'
    | 'effect.accepted'
    | 'effect.completed'
    | 'effect.failed'
    | 'artifact.created'
    | 'wait.created'
    | 'wait.resolved'
    | 'orchestrator.required';
  identity: EventIdentity;
  occurredAt: string;
  causationId: OpaqueId | null;
  payload: JsonObject;
}
export interface PluginDomainEvent {
  schemaVersion: 'plugin-domain-event.v2';
  eventId: OpaqueId;
  sequence: number;
  type: string;
  producer: RegistrationProvenance;
  identity: EventIdentity;
  occurredAt: string;
  causationId: OpaqueId | null;
  payload: JsonObject;
}
export interface ObserverDelivery {
  schemaVersion: 'observer-delivery.v2';
  deliveryId: OpaqueId;
  observer: RegistrationProvenance;
  attemptNumber: number;
  event: LifecycleEvent | PluginDomainEvent;
  deliveredAt: string;
}
export interface ObserverCheckpoint {
  schemaVersion: 'observer-checkpoint.v2';
  observer: RegistrationProvenance;
  runId: OpaqueId;
  sequence: number;
  eventId: OpaqueId | null;
  updatedAt: string;
}
export interface ResourceLock {
  schemaVersion: 'resource-lock.v2';
  lockId: OpaqueId;
  resource: ResourceIdentity;
  ownerLeaseId: OpaqueId | AdapterActivationId;
  fencingToken: number;
  status: 'active' | 'released' | 'expired';
  acquiredAt: string;
  expiresAt: string;
  releasedAt?: string;
}
export interface PluginStateEntry {
  schemaVersion: 'plugin-state-entry.v2';
  entryId: OpaqueId;
  sequence: number;
  namespace: NamespacedId;
  registration: RegistrationProvenance;
  attempt?: AttemptIdentity | null;
  entryType: NamespacedId;
  entrySchemaVersion?: NamespacedId;
  idempotencyKey: OpaqueId;
  occurredAt: string;
  payload: JsonObject;
}

export const CURRENT_RUNTIME_DISPATCH_PROFILE = Object.freeze({"schemaVersion":"runtime-dispatch-profile.v1","encoding":"json-utf16-v1"} as const);
