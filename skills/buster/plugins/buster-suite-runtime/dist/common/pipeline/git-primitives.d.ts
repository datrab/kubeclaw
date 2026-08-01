type AnyRecord = Record<string, any>;
export declare function setGitRuntimePolicy(policy?: AnyRecord | null): void;
export declare function getRepoRoot(startDir?: any): any;
export declare function gitExec(repoRoot: any, args: any[], opts?: AnyRecord): string;
export declare function getCurrentBranch(repoRoot: any): string;
export declare function setRepoRoot(repoRoot: any): void;
export declare function headHash(repoRootOrConfig?: any): any;
export declare function invalidateHeadHash(repoRootOrConfig?: any): void;
export {};
