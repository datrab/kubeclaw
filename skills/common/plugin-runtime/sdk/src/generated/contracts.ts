// Generated from skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json. Do not edit.

export type NamespacedId = string;
export type LocalId = string;
export type RelativeModulePath = string;
export type RelativeSchemaPath = string;
export type PluginManifest = PluginManifest1 & {
  id: NamespacedId;
  apiVersion: 'pipeline-plugin-v2';
  packageVersion: string;
  stages: StageRegistration[];
  observers: ObserverRegistration[];
  adapters: AdapterRegistration[];
};
export type PluginManifest1 =
  | {
      /**
       * @minItems 1
       */
      stages?: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      observers?: [any, ...any[]];
      [k: string]: any;
    }
  | {
      /**
       * @minItems 1
       */
      adapters?: [any, ...any[]];
      [k: string]: any;
    };
export type OpaqueId = string;
export type StageResult =
  | (ResultBase & {
      schemaVersion: 'stage-result.v2';
      outcome: 'passed';
      artifacts: ArtifactRef[];
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
  idempotencyKey: OpaqueId;
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
  packageIdentity?: PackageIdentity;
  packageResolution?: PackageResolution;
  stageRegistration?: StageRegistration;
  observerRegistration?: ObserverRegistration;
  adapterRegistration?: AdapterRegistration;
  pluginManifest?: PluginManifest;
  stageDefinition?: StageDefinition;
  pipelineDefinition?: PipelineDefinition;
  attemptIdentity?: AttemptIdentity;
  stageAttempt?: StageAttempt;
  artifactRef?: ArtifactRef;
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
export interface StageDefinition {
  id: LocalId;
  type: NamespacedId;
  dependsOn: LocalId[];
  config: JsonObject;
  input: JsonObject;
  execution: {
    maxAttempts: number;
    maxRemediationCycles: number;
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
export interface AttemptIdentity {
  runId: OpaqueId;
  stageId: LocalId;
  attemptId: OpaqueId;
  attemptNumber: number;
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
  artifactId: OpaqueId;
  namespace: NamespacedId;
  mediaType: string;
  digest: string;
  sizeBytes: number;
  producer: AttemptIdentity;
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
  idempotencyKey: OpaqueId;
  attempt: AttemptIdentity;
  capability: NamespacedId;
  operation: LocalId;
  resource: {
    type: NamespacedId;
    canonicalId: OpaqueId;
  };
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
  surface: 'stage' | 'observer' | 'adapter';
  registrationId: LocalId;
}
export interface CapabilityGrant {
  capability: NamespacedId;
  provider: PackageResolution;
  constraints: JsonObject;
}
export interface PluginContext {
  schemaVersion: 'plugin-context.v2';
  lease: InvocationLease;
  config: JsonObject;
  input: JsonObject;
  guidance?: JsonObject;
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
  resource: {
    type: NamespacedId;
    canonicalId: OpaqueId;
  };
  ownerLeaseId: OpaqueId;
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
