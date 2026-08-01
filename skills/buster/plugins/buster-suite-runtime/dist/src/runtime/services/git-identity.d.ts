import type { GitLogger } from './git-workflow-contracts.js';
export declare function ensureGitIdentity(repoRoot: string, logger: GitLogger | null): void;
export declare function hasScopedStagedChanges(repoRoot: string, addPaths: string[]): boolean;
