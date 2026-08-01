import { getRepoRoot, gitExec, getCurrentBranch } from '../git-primitives.js';
import type { GitPushOptions, GitWorkflowOptions } from './git-workflow-contracts.js';
export { getRepoRoot, gitExec, getCurrentBranch };
interface GitSyncSuccess {
    ok: true;
    target_hash: string;
    actual_hash: string;
    error: null;
    detail: null;
}
interface GitSyncFailure {
    ok: false;
    target_hash: string | null;
    actual_hash: null;
    error: 'missing_target_hash' | 'git_sync_failed';
    detail: string;
}
export type GitSyncResult = GitSyncSuccess | GitSyncFailure;
export interface GitPushResult {
    pushed: boolean;
    hash: string;
}
/**
 * Sync the repo to a deterministic task commit: fetch + reset-hard.
 *
 * DELETE_LEGACY: task repo sync must be tied to an explicit typed commit
 * identity; branch-derived sync is not accepted.
 *
 * STRICTIFY_TS_SLICE: Git failures stay nonthrowing for task lifecycle cleanup,
 * but return typed failure metadata instead of a magic null sentinel.
 */
export declare function gitSync(repoRoot: string, expectedHash: string, opts?: GitWorkflowOptions): Promise<GitSyncResult>;
/**
 * Push to origin with rebase-before-push strategy and bounded retry.
 *
 * If opts.commitMessage is provided, opts.addPaths must contain explicit
 * pathspecs. Commit mode performs `git add -- <addPaths...>` + `git commit`
 * before pushing. Each attempt: pull --rebase → push. On rebase failure with
 * attempts remaining, aborts and retries with exponential backoff.
 *
 * STRICTIFY_TS_SLICE: after the final rebase failure, fail closed. Do not push
 * over unresolved upstream/rebase state.
 */
export declare function gitPushWithRetry(repoRoot: string, branch: string, opts?: GitPushOptions): Promise<GitPushResult>;
