import { gitSync, getRepoRoot } from '../git-workflows.ts';
import type { GitSyncResult } from '../git-workflows.ts';
import { emitPluginEvent } from '../telemetry.ts';

declare const process: {
  cwd(): string;
};

interface Logger {
  info: (tag: string, msg: string, data?: Record<string, unknown>) => void;
}

interface TelemetryContext {
  [key: string]: unknown;
}

interface BusterTaskPayload {
  session?: {
    cwd?: string;
  };
}

export interface TaskRepoSyncResult {
  ok: boolean;
  mode: 'deterministic';
  target_commit_hash: string | null;
  commit_hash: string | null;
  error: string | null;
  detail: string | null;
}

function normalizeCommitHash(commitHash: unknown): string | null {
  if (typeof commitHash !== 'string') return null;
  const trimmed = commitHash.trim();
  return trimmed ? trimmed : null;
}

function buildTaskRepoSyncResult(syncResult: GitSyncResult): TaskRepoSyncResult {
  if (syncResult.ok) {
    return {
      ok: true,
      mode: 'deterministic',
      target_commit_hash: syncResult.target_hash,
      commit_hash: syncResult.actual_hash,
      error: null,
      detail: null,
    };
  }

  return {
    ok: false,
    mode: 'deterministic',
    target_commit_hash: syncResult.target_hash,
    commit_hash: null,
    error: syncResult.error,
    detail: syncResult.detail,
  };
}

function taskSessionCwdAuthority(payload: BusterTaskPayload): string {
  if (typeof payload?.session?.cwd === 'string' && payload.session.cwd.trim()) return payload.session.cwd;
  return process.cwd();
}

export async function syncTaskRepo({
  payload,
  commitHash,
  moduleId,
  tctx,
  logger,
}: {
  payload: BusterTaskPayload;
  commitHash: string;
  moduleId: string;
  tctx: TelemetryContext;
  logger: Logger;
}): Promise<{ repoRoot: string; syncResult: TaskRepoSyncResult }> {
  const repoRoot = getRepoRoot(taskSessionCwdAuthority(payload));
  logger.info('GIT', `Resolved repo root: ${repoRoot}`);

  const targetCommitHash = normalizeCommitHash(commitHash);
  const syncResult = buildTaskRepoSyncResult(
    targetCommitHash
      ? await gitSync(repoRoot, targetCommitHash, { logger })
      : {
          ok: false,
          target_hash: null,
          actual_hash: null,
          error: 'missing_target_hash',
          detail: 'Buster task repo sync requires explicit commit_hash',
        },
  );

  await emitPluginEvent(tctx, 'git_sync', {
    module_id:          moduleId,
    mode:               syncResult.mode,
    target_commit_hash: syncResult.target_commit_hash,
    commit_hash:        syncResult.commit_hash,
    ok:                 syncResult.ok,
    error:              syncResult.error,
    detail:             syncResult.detail,
  });

  logger.info('GIT', 'Git sync complete', {
    ok: syncResult.ok,
    mode: syncResult.mode,
    target_commit_hash: syncResult.target_commit_hash,
    commit_hash: syncResult.commit_hash,
    error: syncResult.error,
  });

  return { repoRoot, syncResult };
}
