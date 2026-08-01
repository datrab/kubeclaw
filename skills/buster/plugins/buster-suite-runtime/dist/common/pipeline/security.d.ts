type EnvSource = Record<string, unknown>;
type BuildEnvOptions = {
    sourceEnv?: EnvSource;
    allowlist?: readonly string[];
};
type ScopedPathOptions = {
    baseDir?: string;
    scopeDir?: string;
    field?: string;
    scopeDescription?: string;
};
type AllowedPathOptions = {
    allowedPrefixes?: readonly string[];
};
export declare function isDeniedSubprocessEnvKey(key: unknown): boolean;
export declare function buildSubprocessEnv(overrides?: Record<string, unknown>, options?: BuildEnvOptions): Record<string, string>;
export declare function isPathInside(candidate: string, root: string): boolean;
export declare function resolveScopedPath(p: unknown, options?: ScopedPathOptions): string | null;
export declare function validateAllowedPath(filePath: unknown, label: string, opts?: AllowedPathOptions): string;
export declare function tokenizeCommandString(command: unknown, label?: string): any[];
export {};
