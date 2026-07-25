import { selectTruthyValue } from '../optional-absence.ts';
import { runBatch as runSchedulerBatch } from '../scheduler.ts';
import {
  allocateModuleWorktree,
  cleanupModuleWorktree,
  freezeParallelGitBase,
  mergeModuleBranches,
  verifyModuleWorktreeClean,
} from '../integrations/git-worktree.ts';
import { buildPipelineStepResult, PIPELINE_STEP_ACTIONS, PIPELINE_STEP_OUTCOMES, PIPELINE_STEP_TYPES } from '../services/contracts/pipeline-step-result.ts';
import { PIPELINE_TERMINAL_ACTIONS, PIPELINE_TERMINAL_SCOPES } from '../services/contracts/terminal-decision.ts';
import { moduleBatchRejectionStepResult, normalizeBatchResults } from './pipeline-runner-batch-results.ts';

type AnyRecord = Record<string, any>;

function firstPresent(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null) return value;
  return null;
}

function remapRepoPath(value: unknown, fromRoot: string, toRoot: string): unknown {
  if (typeof value !== 'string') return value;
  const root = fromRoot.replace(/\/+$/, '');
  if (value === root) return toRoot;
  return value.startsWith(`${root}/`) ? `${toRoot}${value.slice(root.length)}` : value;
}

function remapConfigRepoPaths(value: unknown, fromRoot: string, toRoot: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => remapConfigRepoPaths(entry, fromRoot, toRoot));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapConfigRepoPaths(entry, fromRoot, toRoot)]));
  return remapRepoPath(value, fromRoot, toRoot);
}

function configForWorktree(config: AnyRecord, worktree: AnyRecord): AnyRecord {
  const worktreePath = String(worktree?.worktree_path ?? '');
  const repoRoot = String(config?.repo_root ?? '').replace(/\/+$/, '');
  if (selectTruthyValue(() => !worktreePath, () => !repoRoot)) throw new Error('parallel module worktree requires assigned worktree path and config.repo_root');
  const shared = selectTruthyValue(() => config._sharedPipelineConfig, () => config);
  const remapped = remapConfigRepoPaths(config, repoRoot, worktreePath) as AnyRecord;
  if (selectTruthyValue(() => typeof remapped.paths?.project_src_dir !== 'string', () => !remapped.paths.project_src_dir.trim())) throw new Error('parallel module worktree requires config.paths.project_src_dir');
  return {
    ...remapped, repo_root: worktreePath,
    paths: { ...firstPresent(remapped.paths, {}), swarm_dir: firstPresent(shared.paths?.swarm_dir, remapped.paths?.swarm_dir) },
    pluginRegistry: firstPresent(shared.pluginRegistry, remapped.pluginRegistry),
    _runStats: firstPresent(shared._runStats, remapped._runStats),
    _sharedPipelineConfig: shared,
    _moduleWorktree: { kind: 'module_worktree', repo_root: repoRoot, base_commit: firstPresent(worktree.base_commit), branch: firstPresent(worktree.branch), worktree_path: worktreePath, module_id: firstPresent(worktree.module_id), attempt: firstPresent(worktree.attempt) },
  };
}

function batchResultFromScheduler(moduleIds: string[], base: AnyRecord, worktrees: Map<string, AnyRecord>, scheduler: AnyRecord) {
  return {
    kind: 'module_batch_result', batch_id: scheduler.batch_id, module_ids: moduleIds,
    git: { base_commit: base.base_commit, worktrees: moduleIds.map((id) => worktrees.get(id)), join: null },
    results: scheduler.results.map((entry: AnyRecord, index: number) => {
      const moduleId = moduleIds[index];
      if (!moduleId) throw new Error(`Module batch result ${index} has no matching module identity`);
      return entry.status === 'fulfilled' ? entry.result : { moduleId, result: moduleBatchRejectionStepResult(moduleId, entry.reason) };
    }),
  };
}

function joinSuccessfulBatch(config: AnyRecord, moduleIds: string[], worktrees: Map<string, AnyRecord>, result: AnyRecord) {
  const normalized = normalizeBatchResults(result) ?? [];
  if (normalized.some((entry: AnyRecord) => !entry.normalized?.shouldContinue)) return;
  for (const moduleId of moduleIds) verifyModuleWorktreeClean(worktrees.get(moduleId)?.worktree_path);
  result.git.join = mergeModuleBranches(config, { branches: moduleIds.map((id) => worktrees.get(id)?.branch).filter(Boolean) });
}

function batchExecutionFailure(moduleIds: string[], base: AnyRecord, worktrees: Map<string, AnyRecord>, error: AnyRecord) {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    kind: 'module_batch_result', batch_id: `${base.runId}:module_batch:${moduleIds.join(',')}`, module_ids: moduleIds,
    git: { base_commit: base.base_commit, worktrees: moduleIds.map((id) => worktrees.get(id)).filter(Boolean), join: error?.gitSync ?? null },
    results: [{ moduleId: moduleIds[0], result: buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.MODULE, stepId: moduleIds[0], nextAction: PIPELINE_STEP_ACTIONS.HALT,
      outcome: PIPELINE_STEP_OUTCOMES.ERROR, issueType: 'environment', reason,
      diagnostics: { summary: reason, metadata: { module_join_failed: true, git: error?.gitSync ?? null } },
      correlation: { step_type: PIPELINE_STEP_TYPES.MODULE, step_id: moduleIds[0], module_id: moduleIds[0] },
      terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP, terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
      terminalReasonCode: error?.gitSync?.code ?? 'module_join_failed', terminalHumanReason: reason,
      terminalMetadata: { git: error?.gitSync ?? null },
    }) }],
  };
}

export async function runPipelineModuleBatch(ctx: AnyRecord) {
  const moduleIds = [...new Set<string>(ctx.next.ids.map((id: unknown) => String(id)).filter(Boolean))];
  const runId = firstPresent(ctx.config?._runId, ctx.config?.run_id, 'run_unknown');
  const base: AnyRecord = { ...freezeParallelGitBase(ctx.config), runId };
  const worktrees = new Map<string, AnyRecord>();
  let result: AnyRecord | null = null;
  try {
    for (const moduleId of moduleIds) worktrees.set(moduleId, allocateModuleWorktree(ctx.config, { runId, moduleId, attempt: 1, baseCommit: base.base_commit }));
    const scheduler = await ctx.abortable(runSchedulerBatch({
      batchId: `${runId}:module_batch:${moduleIds.join(',')}`, itemIds: moduleIds,
      executor: async (moduleId: string) => {
        const worktree = worktrees.get(moduleId);
        if (!worktree) throw new Error(`Module batch worktree missing for ${moduleId}`);
        return { moduleId, worktree, result: await ctx.runModule(configForWorktree(ctx.config, worktree), ctx.progress, moduleId, ctx.opts, ctx.deps) };
      },
    }));
    result = batchResultFromScheduler(moduleIds, base, worktrees, scheduler);
    joinSuccessfulBatch(ctx.config, moduleIds, worktrees, result);
    return result;
  } catch (error: any) {
    if (worktrees.size === 0) throw error;
    if (result) return { ...result, git: { ...(result.git ?? {}), join: error?.gitSync ?? null }, join_failure: { module_id: moduleIds[0], reason: error instanceof Error ? error.message : String(error), git: error?.gitSync ?? null } };
    return batchExecutionFailure(moduleIds, base, worktrees, error);
  } finally {
    for (const moduleId of moduleIds) {
      const worktree = worktrees.get(moduleId);
      if (worktree) cleanupModuleWorktree(ctx.config, worktree);
    }
  }
}
