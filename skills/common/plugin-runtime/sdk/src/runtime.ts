import type {
  ArtifactRef,
  EffectRequest,
  EffectReceipt,
  EventIdentity,
  ObserverDelivery,
  PluginContext,
  RegistrationProvenance,
  ResourceLock,
  RuntimeDispatchProfile,
} from './generated/contracts.ts';
import type {
  ProviderInvocationV1,
  ProviderResultV1,
  ReportAdapterResultV1,
  ReportCaseV1,
  ReportCountsV1,
  FindingV1,
} from '@kubeclaw/pipeline-test-gate-contract';

export interface CapabilityInvocation {
  readonly runtimeDispatchProfile?: RuntimeDispatchProfile;
  readonly operation: string;
  readonly resource: {
    readonly type: string;
    readonly canonicalId: string;
  };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface PluginInvocationContext {
  readonly contract: PluginContext;
  invoke(
    capability: string,
    request: CapabilityInvocation,
  ): Promise<Readonly<Record<string, unknown>>>;
  emit(
    type: string,
    identity: EventIdentity,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  artifact(id: string): ArtifactRef | undefined;
}

export interface AdapterResourceFence {
  readonly contract: ResourceLock;
  assertCurrent(): ResourceLock;
}

export interface FencedAdapterInvocation {
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
  readonly confidential?: false;
  readonly lock: ResourceLock;
  readonly fence: AdapterResourceFence;
}

export interface ConfidentialAdapterInvocation {
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
  readonly confidential: true;
  readonly lock?: never;
  readonly fence?: never;
}

export type AdapterInvocation = FencedAdapterInvocation | ConfidentialAdapterInvocation;

export interface AdapterInstance {
  ready(): Promise<void>;
  invoke(invocation: AdapterInvocation): Promise<Readonly<Record<string, unknown>>>;
  receipt?(request: EffectRequest): Promise<Readonly<Record<string, unknown>> | undefined>;
  shutdown(signal: AbortSignal): Promise<void>;
}

export interface AdapterDependencyOptions { readonly signal?: AbortSignal; readonly deliveryId?: string }
export interface AdapterCleanupContext {
  readonly signal: AbortSignal;
  invoke(capability: string, request: CapabilityInvocation, options?: AdapterDependencyOptions): Promise<Readonly<Record<string, unknown>>>;
  invokeConfidential(capability: string, request: CapabilityInvocation, options?: AdapterDependencyOptions): Promise<Readonly<Record<string, unknown>>>;
}

export interface AdapterActivationContext {
  readonly registration: RegistrationProvenance;
  readonly config: Readonly<Record<string, unknown>>;
  invoke(
    capability: string,
    request: CapabilityInvocation,
    options?: AdapterDependencyOptions,
  ): Promise<Readonly<Record<string, unknown>>>;
  invokeConfidential(
    capability: string,
    request: CapabilityInvocation,
    options?: AdapterDependencyOptions,
  ): Promise<Readonly<Record<string, unknown>>>;
  /** Core bounds one cleanup phase; this never grants additional capabilities. */
  withCleanup?<T>(operation: (context: AdapterCleanupContext) => Promise<T>): Promise<T>;
  emit(
    type: string,
    identity: EventIdentity,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void>;
}

export type AdapterFactory = (
  context: AdapterActivationContext,
) => Promise<AdapterInstance> | AdapterInstance;

export type ObserverHandler = (
  delivery: ObserverDelivery,
  context: PluginInvocationContext,
) => Promise<void>;

export interface EffectJournal {
  requested(request: EffectRequest): Promise<void>;
  accepted(request: EffectRequest): Promise<boolean>;
  completed(receipt: EffectReceipt): Promise<void>;
  request(idempotencyKey: string): Promise<EffectRequest | undefined>;
  receipt(idempotencyKey: string): Promise<EffectReceipt | undefined>;
}

export interface TestProviderCapabilityRequest {
  readonly operation: string;
  readonly resource: {
    readonly type: string;
    readonly canonicalId: string;
  };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TestProviderExecutionContext {
  readonly signal: AbortSignal;
  readonly workspaceRoot: string;
  log(stream: 'stdout' | 'stderr', value: string | Uint8Array): void;
  invoke(
    capability: string,
    request: TestProviderCapabilityRequest,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface TestProviderInstance {
  execute(
    invocation: ProviderInvocationV1,
    context: TestProviderExecutionContext,
  ): Promise<ProviderResultV1>;
  cleanup?(
    invocation: ProviderInvocationV1,
    context: TestProviderExecutionContext,
  ): Promise<void>;
}

export type TestProviderFactory = (
  invocation: ProviderInvocationV1,
) => Promise<TestProviderInstance> | TestProviderInstance;

export interface ReportAdapterLimits {
  readonly maximumCases: number;
  readonly maximumFindings: number;
  readonly maximumCaseFindings: number;
}

export interface ReportAdapterInput {
  readonly schemaVersion: 'report-adapter-input.v1';
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly limits: ReportAdapterLimits;
}

export type ReportAdapterOutput = Pick<
  ReportAdapterResultV1,
  | 'durationMs'
  | 'casesTruncated'
  | 'omittedCaseCount'
  | 'findingsTruncated'
  | 'omittedFindingCount'
> & {
  readonly counts: ReportCountsV1;
  readonly cases: ReportCaseV1[];
  readonly findings: FindingV1[];
};

export type ReportAdapterFunction = (
  input: ReportAdapterInput,
) => Promise<ReportAdapterOutput> | ReportAdapterOutput;
