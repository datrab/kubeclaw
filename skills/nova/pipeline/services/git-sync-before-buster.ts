import { STATUS } from '../core/constants.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { projectSrcPath, relPath } from '../core/paths.ts';
import { collectMeaningfulForgeDiffEvidence } from './agent-observability-forge-completion.ts';
import {
  gitCommitAndPush,
  gitExec,
  gitPullBeforePush,
  gitPushWithRetry,
} from '../../../common/pipeline/integrations/git-worktree.ts';
import { FAIL_PATTERNS } from './failures/classification.ts';
import { log } from '../core/logger.ts';

type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeRepoRelativePath(relPathName: unknown): string {
  return String(relPathName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .trim();
}

function normalizeScopedGitPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.map(normalizeRepoRelativePath).filter(Boolean))];
}

/**
 * Commit and push all Forge output before handing off to Buster.
 * Records the commit hash and diff stat in the module status object.
 */
export async function gitSyncBeforeBuster(config: AnyRecord, moduleDir: string, status: AnyRecord, opts: { budget?: any; signal?: any } = {}) {
  const { budget = null, signal = null } = opts;
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    const meaningfulPaths = normalizeScopedGitPaths(status?.meaningful_paths);
    const diffEvidence = meaningfulPaths.length > 0
      ? { ok: true, hasMeaningfulChanges: true, paths: meaningfulPaths }
      : collectMeaningfulForgeDiffEvidence(config, moduleDir, { headBefore: status?.head_before || null });
    const scopedPaths = normalizeScopedGitPaths(diffEvidence?.paths);
    const addPaths = scopedPaths.length > 0
      ? scopedPaths
      : [normalizeRepoRelativePath(relPath(config, projectSrcPath(config)))].filter(Boolean);

    const result = await gitCommitAndPush(
      config,
      `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`,
      { addPaths, conflictPaths: scopedPaths, captureHash: true },
    );

    if (!result.committed) {
      log('INFO', 'No uncommitted changes (Forge already committed) — pushing existing commits');
      gitPullBeforePush(config);
      await gitPushWithRetry(config, { budget, signal });
    }

    const commitHash = result.hash || gitExec(config.repo_root, ['rev-parse', 'HEAD']);
    const shortHash = commitHash.substring(0, 8);

    status.forge_commit_hash = commitHash;

    try {
      status.forge_diff_stat = gitExec(config.repo_root, ['diff', '--stat', 'HEAD~1', 'HEAD']);
    } catch (_error) {
      status.forge_diff_stat = null;
    }

    const gitSyncTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Git sync complete (${shortHash})`,
    });
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return { commitHash, lifecycleMutation: gitSyncTransition.lifecycleMutation };
  } catch (e) {
    throw new Error(`[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git sync failed before Buster handoff: ${errorMessage(e)}`);
  }
}
