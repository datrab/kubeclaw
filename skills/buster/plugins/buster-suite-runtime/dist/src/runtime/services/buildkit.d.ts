type SuiteLog = (message: string) => void;
type ExecFileAsync = (command: string, args: string[], options?: Record<string, unknown>) => Promise<{
    stdout?: string;
    stderr?: string;
}>;
export interface BuildKitImageResult {
    image: string;
    digest: string;
    immutableImage: string;
}
export declare function buildAndPushImage({ dockerfile, contextDir, image, timeoutMs, log, execFileAsync, }: {
    dockerfile: string;
    contextDir: string;
    image: string;
    timeoutMs: number;
    log?: SuiteLog;
    execFileAsync?: ExecFileAsync;
}): Promise<BuildKitImageResult>;
export declare function copyAndPushImage({ sourceImage, ...options }: {
    sourceImage: string;
    contextDir?: never;
    dockerfile?: never;
    image: string;
    timeoutMs: number;
    log?: SuiteLog;
    execFileAsync?: ExecFileAsync;
}): Promise<BuildKitImageResult>;
export {};
