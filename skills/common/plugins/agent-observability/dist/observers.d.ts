import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';
export declare function projectAgentEvent(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function ingest(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
export declare function recordEvidence(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
