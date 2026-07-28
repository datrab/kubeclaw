import type { ArtifactRef, PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
interface LintInput {
    readonly workingDirectory: string;
    readonly project?: string;
    readonly modulePath?: string;
    readonly changedFiles?: readonly string[];
}
export declare function resultForReport(report: Readonly<Record<string, unknown>>, artifact: ArtifactRef): StageResult;
export declare function executePreCheck(input: LintInput, context: PluginInvocationContext): Promise<StageResult>;
export declare function executeFull(input: LintInput, context: PluginInvocationContext): Promise<StageResult>;
export {};
