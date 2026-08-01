import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';
export declare function telemetryEnvelope(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function observe(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
