import type { SuiteVerdict } from '../services/verdict-schema.js';
type AnyRecord = Record<string, any>;
type BuildContext = {
    payload?: AnyRecord;
    logSink?: ((entry: any, message?: string) => void) | null;
    config?: {
        serve?: AnyRecord;
    };
    repoRoot?: string;
    registerRuntimeCleanup?: (cleanup: () => Promise<void> | void) => void;
};
export declare function validateDockerfileFromImages(dockerfilePath: string): string[];
export default function buildSuite(context: BuildContext): Promise<SuiteVerdict>;
export {};
