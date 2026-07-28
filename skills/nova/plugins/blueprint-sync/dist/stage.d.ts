import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
interface Input {
    readonly blueprintId: string;
    readonly repositoryRoot: string;
    readonly branchRef: string;
    readonly controlPaths: readonly string[];
}
export declare function validateInput(input: Input): void;
export declare function execute(input: Input, context: PluginInvocationContext): Promise<StageResult>;
export {};
