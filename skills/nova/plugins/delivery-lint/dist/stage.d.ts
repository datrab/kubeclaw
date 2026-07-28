import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
interface DeliveryLintInput {
    readonly moduleId: string;
    readonly dockerfile: string | null;
    readonly staticPath: string | null;
}
export declare function execute(input: DeliveryLintInput, context: PluginInvocationContext): Promise<StageResult>;
export {};
