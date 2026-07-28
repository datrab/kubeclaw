import type {
  ArtifactRef,
  EffectRequest,
  EffectReceipt,
  EventIdentity,
  ObserverDelivery,
  PluginContext,
  RegistrationProvenance,
} from './generated/contracts.ts';

export interface CapabilityInvocation {
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

export interface AdapterInvocation {
  readonly request: EffectRequest;
  readonly signal: AbortSignal;
}

export interface AdapterInstance {
  ready(): Promise<void>;
  invoke(invocation: AdapterInvocation): Promise<Readonly<Record<string, unknown>>>;
  shutdown(signal: AbortSignal): Promise<void>;
}

export interface AdapterActivationContext {
  readonly registration: RegistrationProvenance;
  readonly config: Readonly<Record<string, unknown>>;
  invoke(
    capability: string,
    request: CapabilityInvocation,
  ): Promise<Readonly<Record<string, unknown>>>;
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
