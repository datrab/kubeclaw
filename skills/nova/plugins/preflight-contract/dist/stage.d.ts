import type { PluginInvocationContext, StageResult } from '@kubeclaw/plugin-sdk';
interface Input {
    readonly moduleId: string;
    readonly modulePath: string;
    readonly substeps?: readonly string[];
    readonly ownedPaths: readonly string[];
    readonly serveDockerfile: string | null;
    readonly apiSpecFile: string | null;
}
interface Failure {
    readonly code: string;
    readonly message: string;
    readonly nextStep: string;
}
export declare function validateDeclarations(input: Input, content: string): readonly Failure[];
export declare function execute(input: Input, context: PluginInvocationContext): Promise<StageResult>;
export {};
