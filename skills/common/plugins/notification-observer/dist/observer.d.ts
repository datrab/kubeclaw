import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';
export declare function lifecycleNotification(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function previewNotification(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function observe(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
export declare function deliverPreview(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
