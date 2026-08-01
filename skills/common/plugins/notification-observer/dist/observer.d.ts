import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';
interface PresentationOptions {
    readonly pipelineLabel?: string;
    readonly modelLabel?: string;
    readonly stageLabels?: Readonly<Record<string, unknown>>;
}
export declare function lifecycleNotification(delivery: ObserverDelivery, maximum?: number, options?: PresentationOptions): Readonly<Record<string, unknown>>;
export declare function previewNotification(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function observe(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
export declare function deliverPreview(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
export declare function auditRecord(delivery: ObserverDelivery): Readonly<Record<string, unknown>>;
export declare function recordAudit(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void>;
export {};
