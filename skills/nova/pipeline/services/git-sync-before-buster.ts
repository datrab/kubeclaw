import { STATUS } from '../core/constants.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { projectSrcPath, relPath } from '../core/paths.ts';
import { collectMeaningfulForgeDiffEvidence } from './agent-observability-forge-completion.ts';
import {
  commitModuleWorktreeChanges,
  gitCommitAndPush,
  gitExec,
  gitPullBeforePush,
  gitPushWithRetry,
} from '../integrations/git-worktree.ts';
import { FAIL_PATTERNS } from './failures/classification.ts';
import { log } from '../core/logger.ts';
import { appendEvaluationFact, publishArtifact } from './evidence-plane.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeRepoRelativePath(relPathName: unknown): string {
  return String(selectDefinedValue(() => (relPathName), () => ('')))
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '')
    .trim();
}

function normalizeScopedGitPaths(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return [...new Set(paths.map(normalizeRepoRelativePath).filter(Boolean))];
}

function isIsolatedModuleWorktree(config: AnyRecord): boolean {
  return config?._moduleWorktree?.kind === 'module_worktree';
}

/**
 * Commit Forge output before handing off to Buster.
 * Shared worktrees publish immediately; isolated module worktrees publish at
 * the module-join authority after Buster passes.
 * Records the commit hash and diff stat in the module status object.
 */
export async function gitSyncBeforeBuster(config: AnyRecord, moduleDir: string, status: AnyRecord, opts: { budget?: any; signal?: any } = {}) {
  const { budget = null, signal = null } = opts;
  log('STEP', 'Git sync: committing and pushing Forge output before Buster');

  try {
    const diffEvidence = collectMeaningfulForgeDiffEvidence(config, moduleDir, { headBefore: selectTruthyValue(() => (status?.head_before), () => (null)) });
    const scopedPaths = normalizeScopedGitPaths(diffEvidence?.paths);
    const addPaths = scopedPaths.length > 0
      ? scopedPaths
      : [normalizeRepoRelativePath(relPath(config, projectSrcPath(config)))].filter(Boolean);

    const message = `[pipeline] Module ${status.module_id}: Forge output — ready for Buster`;
    const result = isIsolatedModuleWorktree(config)
      ? commitModuleWorktreeChanges(config, message, { addPaths, captureHash: true })
      : await gitCommitAndPush(
        config,
        message,
        { addPaths, conflictPaths: scopedPaths, captureHash: true, budget, signal },
      );

    if (!result.committed && !isIsolatedModuleWorktree(config)) {
      log('INFO', 'No uncommitted changes (Forge already committed) — pushing existing commits');
      gitPullBeforePush(config);
      await gitPushWithRetry(config, { budget, signal });
    }

    const commitHash = commitHashAuthority(result, config);
    const shortHash = commitHash.substring(0, 8);

    status.forge_commit_hash = commitHash;

    try {
      status.forge_diff_stat = gitExec(config.repo_root, ['diff', '--stat', 'HEAD~1', 'HEAD']);
    } catch (_error: any) {
      status.forge_diff_stat = null;
    }
    const diff = gitExec(config.repo_root, ['diff', '--binary', `${status?.head_before || `${commitHash}^`}`, commitHash, '--', ...addPaths]);
    const diffArtifact = publishArtifact({ ...config, pipeline_dir: config?.paths?.swarm_dir ? `${config.paths.swarm_dir}/logs/pipeline` : null }, {
      logical_id: `git-diff/${status.module_id}/${commitHash}`,
      kind: 'git-diff', media_type: 'text/x-diff', bytes: diff, producer: 'nova/git-sync', content_class: 'artifact',
      correlation: { project: config.project, run_id: config._runId ?? config.run_id, work_id: status.module_id, work_type: 'module', attempt: status.attempt ?? status.fail_count + 1, source: 'pipeline', producer: 'nova/git-sync' },
    });
    appendEvaluationFact(config, { dimension:'git.workspace', work_id:status.module_id, attempt:status.attempt??status.fail_count+1, starting_commit:status?.head_before??null, final_commit:commitHash, files_touched:addPaths, diff_stat:status.forge_diff_stat, diff_reference:diffArtifact.reference, branch:gitExec(config.repo_root,['branch','--show-current']) });

    const gitSyncTransition = transitionModuleStatus(status, STATUS.READY_FOR_TESTING, {
      note: `Git sync complete (${shortHash})`,
    });
    log('OK', `Forge commit hash recorded: ${shortHash}`);

    return { commitHash, lifecycleMutation: gitSyncTransition.lifecycleMutation };
  } catch (e: any) {
    throw new Error(`[${FAIL_PATTERNS.GIT_SYNC_FAILED}] Git sync failed before Buster handoff: ${errorMessage(e)}`);
  }
}

function commitHashAuthority(result: any, config: any) {
  if (typeof result.hash === 'string' && result.hash.trim()) return result.hash;
  return gitExec(config.repo_root, ['rev-parse', 'HEAD']);
}
