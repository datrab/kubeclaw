import type { AdapterActivationContext, AdapterInstance, EventIdentity } from '@kubeclaw/plugin-sdk';
export declare const SUPPORTED_HOOKS: readonly string[];
interface Subscription {
    unsubscribe?: () => void;
    dispose?: () => void;
    off?: () => void;
}
interface OpenClawSdk {
    on?: (hook: string, handler: (event: unknown) => void) => Subscription | (() => void);
}
export declare function normalizeAgentEvent(raw: unknown): {
    readonly identity: EventIdentity;
    readonly payload: Readonly<Record<string, unknown>>;
} | undefined;
export declare function activateWithSdk(context: AdapterActivationContext, sdk: OpenClawSdk): AdapterInstance;
export declare function activate(context: AdapterActivationContext): AdapterInstance;
export {};
