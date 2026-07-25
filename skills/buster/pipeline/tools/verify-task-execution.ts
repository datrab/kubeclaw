import { gitExec, getCurrentBranch, gitPushWithRetry } from '../services/git-workflows.ts';
import { loadBusterGitPushPolicy } from '../services/runtime-policy.ts';
import { errorMessage } from '../value-boundary.ts';
import {
  cleanupForbiddenFile,
  findScopeViolations,
  isGitPathInside,
  listChangedFiles,
} from './verify-task-scope.ts';
import type { CleanupAction } from './verify-task-scope.ts';

type AnyRecord = Record<string, any>;
type Log = (message: string) => void;

export interface VerifyResult {
  status: 'success' | 'error';
  action: 'none' | 'reverted_all_bad_files' | 'pushed' | 'cleanup_failed';
  logs: string[];
  error?: string;
  cleanup_proof?: Record<string, unknown>;
  files_pushed?: number;
  commit_hash?: string;
}

export interface VerifyExecution {
  repoRoot: string;
  projectRoot: string;
  swarmRoot: string;
  commitMessage: string;
  explicitAddPaths: string[];
  logs: string[];
  log: Log;
}

interface CleanupResult {
  actions: CleanupAction[];
  badFiles: string[];
  failure?: VerifyResult;
}

function cleanupProof(badFiles: string[], actions: CleanupAction[], remaining: string[]): Record<string, unknown> {
  return { intended_cleanup_count: badFiles.length, actions, remaining_forbidden_files: remaining };
}

export function cleanScopeViolations(
  execution: VerifyExecution,
  projectChangedFiles: string[],
): CleanupResult {
  const { repoRoot, projectRoot, swarmRoot, logs, log } = execution;
  const { violations, badFiles } = findScopeViolations(projectChangedFiles, projectRoot, swarmRoot);
  const actions: CleanupAction[] = [];
  if (badFiles.length === 0) {
    log('✅ [Verify] Stage 1 Passed (Scope Check).');
    return { actions, badFiles };
  }
  log('⚠️ STAGE 1 WARNING: OUT OF SCOPE MODIFICATIONS DETECTED.');
  violations.forEach((violation) => log(`  - ${violation}`));
  for (const file of badFiles) {
    try {
      actions.push(cleanupForbiddenFile(repoRoot, file));
      log(`  -> ⏪ Reverted/Deleted: ${file}`);
    } catch (error) {
      const message = errorMessage(error);
      actions.push({ file, cleaned: false, error: message });
      log(`  -> ❌ Could not clean up ${file}: ${message}`);
    }
  }
  const remainingChanges = listChangedFiles(repoRoot).filter((file) => isGitPathInside(file, projectRoot));
  const remaining = badFiles.filter((file) => remainingChanges.includes(file));
  if (actions.some((action) => !action.cleaned) || remaining.length > 0) {
    const error = 'Forbidden file cleanup failed; refusing commit/push.';
    log(`❌ [Verify] ${error}`);
    return { actions, badFiles, failure: { status: 'error', action: 'cleanup_failed', error, logs, cleanup_proof: cleanupProof(badFiles, actions, remaining) } };
  }
  log('✅ [Verify] Forbidden file cleanup completed with proof.');
  return { actions, badFiles };
}

function finalScopeFailure(execution: VerifyExecution, cleanup: CleanupResult): VerifyResult | undefined {
  const { repoRoot, projectRoot, swarmRoot, logs, log } = execution;
  const files = listChangedFiles(repoRoot).filter((file) => isGitPathInside(file, projectRoot));
  const scope = findScopeViolations(files, projectRoot, swarmRoot);
  if (scope.badFiles.length === 0) return undefined;
  const error = 'Out-of-scope changes remain after cleanup; refusing commit/push.';
  scope.violations.forEach((violation) => log(`  - ${violation}`));
  return { status: 'error', action: 'cleanup_failed', error, logs, cleanup_proof: cleanupProof(cleanup.badFiles, cleanup.actions, scope.badFiles) };
}

export async function commitVerifiedScope(execution: VerifyExecution, cleanup: CleanupResult): Promise<VerifyResult> {
  const { repoRoot, commitMessage, explicitAddPaths, logs, log } = execution;
  const remainingChanges = gitExec(repoRoot, ['status', '--porcelain']);
  if (!remainingChanges) return { status: 'success', action: 'reverted_all_bad_files', logs, cleanup_proof: cleanupProof(cleanup.badFiles, cleanup.actions, []) };
  const scopeFailure = finalScopeFailure(execution, cleanup);
  if (scopeFailure) return scopeFailure;
  const currentBranch = getCurrentBranch(repoRoot);
  const policy = loadBusterGitPushPolicy();
  gitExec(repoRoot, ['reset'], { stdio: 'ignore' } as AnyRecord);
  const { hash, pushed } = await gitPushWithRetry(repoRoot, currentBranch, {
    logger: { warn: (_scope: unknown, message: string) => log(`⚠️ [Verify] ${message}`), info: (_scope: unknown, message: string) => log(message) },
    maxAttempts: policy.maxAttempts,
    retryDelayMs: policy.retryDelayMs,
    commitMessage,
    addPaths: explicitAddPaths,
  });
  const proof = cleanup.badFiles.length > 0 ? { cleanup_proof: cleanupProof(cleanup.badFiles, cleanup.actions, []) } : {};
  if (!pushed) return { status: 'success', action: cleanup.badFiles.length > 0 ? 'reverted_all_bad_files' : 'none', logs, commit_hash: hash, ...proof };
  return { status: 'success', action: 'pushed', files_pushed: remainingChanges.split('\n').filter((line) => line.trim()).length, commit_hash: hash, logs, ...proof };
}
