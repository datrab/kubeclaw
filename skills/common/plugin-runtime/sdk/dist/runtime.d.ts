import type { ArtifactRef, EffectRequest, EffectReceipt, EventIdentity, ObserverDelivery, PluginContext, RegistrationProvenance, ResourceLock } from './generated/contracts.ts';
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
    invoke(capability: string, request: CapabilityInvocation): Promise<Readonly<Record<string, unknown>>>;
    emit(type: string, identity: EventIdentity, payload: Readonly<Record<string, unknown>>): Promise<void>;
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
export interface AdapterActivationContext {
    readonly registration: RegistrationProvenance;
    readonly config: Readonly<Record<string, unknown>>;
    invoke(capability: string, request: CapabilityInvocation): Promise<Readonly<Record<string, unknown>>>;
    emit(type: string, identity: EventIdentity, payload: Readonly<Record<string, unknown>>): Promise<void>;
}
export type AdapterFactory = (context: AdapterActivationContext) => Promise<AdapterInstance> | AdapterInstance;
export type ObserverHandler = (delivery: ObserverDelivery, context: PluginInvocationContext) => Promise<void>;
export interface EffectJournal {
    requested(request: EffectRequest): Promise<void>;
    accepted(request: EffectRequest): Promise<boolean>;
    completed(receipt: EffectReceipt): Promise<void>;
    request(idempotencyKey: string): Promise<EffectRequest | undefined>;
    receipt(idempotencyKey: string): Promise<EffectReceipt | undefined>;
}
//# sourceMappingURL=runtime.d.ts.map