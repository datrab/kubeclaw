import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/pipeline-runner-state-machine.ts — explicit pipeline loop state machine

import { resumeDurableCooldownForStep } from '../services/rate-limit.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import {
  PIPELINE_TERMINAL_ACTIONS,
  PIPELINE_TERMINAL_SCOPES,
} from '../services/contracts/terminal-decision.ts';
import {
  completePipeline,
  emitPersistedPipelineHalt,
  haltPipeline,
  normalizeStepResultForPipeline,
} from './pipeline-runner-terminal.ts';
import { getActiveContext, runWithActiveContext } from '../core/logger.ts';
import { runBatch as runSchedulerBatch } from '../scheduler.ts';
import {
  allocateModuleWorktree,
  cleanupModuleWorktree,
  freezeParallelGitBase,
  mergeModuleBranches,
  verifyModuleWorktreeClean,
} from '../integrations/git-worktree.ts';

type AnyRecord = Record<string, any>;
const FIRST_GATE_EVALUATION_ATTEMPT = 1;

export const PIPELINE_RUNNER_ACTIONS = Object.freeze({
  COMPLETE: 'complete',
  HALT_BLOCKED: 'halt_blocked',
  RUN_VALIDATOR: 'run_validator',
  RUN_GATE: 'run_gate',
  RUN_MODULE: 'run_module',
  RUN_MODULE_BATCH: 'run_module_batch',
});

export function planPipelineStep(next: AnyRecord = {}): AnyRecord {
  if (next?.type === 'done') return { action: PIPELINE_RUNNER_ACTIONS.COMPLETE, next };
  if (next?.type === 'blocked') return { action: PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED, next };
  if (next?.type === 'validator') return { action: PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR, next };
  if (next?.type === 'gate') return { action: PIPELINE_RUNNER_ACTIONS.RUN_GATE, next };
  if (next?.type === 'module_batch' && Array.isArray(next.ids) && next.ids.length > 0) return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH, next };
  if (next?.type === 'module' && next?.id) return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE, next };
  throw new Error(`Unknown typed pipeline step: ${JSON.stringify(next)}`);
}

function abortReason(signal: AnyRecord = {}): string {
  return signal?.reason instanceof Error ? signal.reason.message : String(selectDefinedValue(() => (signal?.reason), () => ('pipeline_run_lock_lost')));
}

function pipelineAbortSignals(opts: AnyRecord = {}): AnyRecord[] {
  return [opts.pipelineRunLockSignal, opts.signal].filter((signal, index, signals) => (
    signal && signals.indexOf(signal) === index
  ));
}

function assertPipelineStepActive(opts: AnyRecord = {}): void {
  opts.assertPipelineRunLockActive?.();
  const signal = pipelineAbortSignals(opts).find((candidate) => candidate?.aborted);
  if (signal?.aborted) {
    throw new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`);
  }
}

function plannedGateAttempt(next: AnyRecord = {}): number {
  if (selectTruthyValue(() => (next.attempt === undefined), () => (next.attempt === null))) return FIRST_GATE_EVALUATION_ATTEMPT;
  const attempt = Number(next.attempt);
  if (selectTruthyValue(() => (!Number.isInteger(attempt)), () => (attempt < 1))) {
    throw new Error('planned gate step requires positive integer attempt');
  }
  return attempt;
}

function activeModuleRunSet(config: AnyRecord): Set<string> {
  const owner = config._sharedPipelineConfig || config;
  if (!(owner._activeModuleRuns instanceof Set)) owner._activeModuleRuns = new Set<string>();
  return owner._activeModuleRuns;
}

function remapRepoPath(value: unknown, fromRoot: string, toRoot: string): unknown {
  if (typeof value !== 'string') return value;
  const normalizedFromRoot = fromRoot.replace(/\/+$/, '');
  if (value === normalizedFromRoot) return toRoot;
  if (value.startsWith(`${normalizedFromRoot}/`)) return `${toRoot}${value.slice(normalizedFromRoot.length)}`;
  return value;
}

function remapConfigRepoPaths(value: unknown, fromRoot: string, toRoot: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => remapConfigRepoPaths(entry, fromRoot, toRoot));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapConfigRepoPaths(entry, fromRoot, toRoot)]));
  }
  return remapRepoPath(value, fromRoot, toRoot);
}

function configForModuleWorktree(config: AnyRecord, worktree: AnyRecord): AnyRecord {
  const worktreePath = String(selectDefinedValue(() => (worktree?.worktree_path), () => ('')));
  if (!worktreePath) throw new Error('parallel module worktree requires assigned worktree path');
  const repoRoot = String(selectDefinedValue(() => (config?.repo_root), () => (''))).replace(/\/+$/, '');
  if (!repoRoot) throw new Error('parallel module worktree requires config.repo_root');
  const sharedConfig = config._sharedPipelineConfig || config;
  const remapped = remapConfigRepoPaths(config, repoRoot, worktreePath) as AnyRecord;
  const projectSrcDir = remapped.paths?.project_src_dir;
  if (typeof projectSrcDir !== 'string' || !projectSrcDir.trim()) {
    throw new Error('parallel module worktree requires config.paths.project_src_dir');
  }
  return {
    ...remapped,
    repo_root: worktreePath,
    paths: {
      ...(remapped.paths || {}),
      project_src_dir: projectSrcDir,
      swarm_dir: selectDefinedValue(() => (sharedConfig.paths?.swarm_dir), () => (remapped.paths?.swarm_dir)),
    },
    pluginRegistry: selectDefinedValue(() => (sharedConfig.pluginRegistry), () => (remapped.pluginRegistry)),
    _runStats: selectDefinedValue(() => (sharedConfig._runStats), () => (remapped._runStats)),
    _sharedPipelineConfig: sharedConfig,
    _moduleWorktree: {
      kind: 'module_worktree',
      repo_root: repoRoot,
      base_commit: selectDefinedValue(() => (worktree.base_commit), () => (null)),
      branch: selectDefinedValue(() => (worktree.branch), () => (null)),
      worktree_path: worktreePath,
      module_id: selectDefinedValue(() => (worktree.module_id), () => (null)),
      attempt: selectDefinedValue(() => (worktree.attempt), () => (null)),
    },
  };
}

async function runModuleWithActiveLock(config: AnyRecord, progress: AnyRecord, moduleId: string, opts: AnyRecord, deps: AnyRecord) {
  const active = activeModuleRunSet(config);
  const runId = selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => ('run_unknown'));
  const key = `${runId}:${moduleId}`;
  if (active.has(key)) throw new Error(`Module ${moduleId} is already active in this pipeline run`);
  active.add(key);
  try {
    return await deps.runModule(config, progress, moduleId, opts);
  } finally {
    active.delete(key);
  }
}

async function runModuleWithIsolatedLogContext(config: AnyRecord, progress: AnyRecord, moduleId: string, opts: AnyRecord, deps: AnyRecord) {
  const parentContext = getActiveContext() || { stats: { errors: [] } };
  return runWithActiveContext({
    ...parentContext,
    config,
    pluginRegistry: selectDefinedValue(() => (config.pluginRegistry), () => (parentContext.pluginRegistry)),
    _logModule: null,
    _logPhase: null,
  }, () => runModuleWithActiveLock(config, progress, moduleId, opts, deps));
}

async function abortablePipelineStep<T>(promise: Promise<T>, opts: AnyRecord = {}): Promise<T> {
  const signals = pipelineAbortSignals(opts);
  opts.trackPipelineStep?.(promise);
  const abortedSignal = signals.find((signal) => signal?.aborted);
  if (abortedSignal) throw new Error(`Pipeline runtime lock lost: ${abortReason(abortedSignal)}`);
  const listenableSignals = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenableSignals.length === 0) return promise;

  const removeAbortListeners: Array<() => void> = [];
  const aborted = new Promise<T>((_resolve, reject) => {
    for (const signal of listenableSignals) {
      const onAbort = () => reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListeners.push(() => signal.removeEventListener('abort', onAbort));
    }
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    for (const removeAbortListener of removeAbortListeners) removeAbortListener();
  }
}

async function abortableSleep(ms: number, opts: AnyRecord = {}): Promise<void> {
  const signals = pipelineAbortSignals(opts);
  const abortedSignal = signals.find((signal) => signal?.aborted);
  if (abortedSignal) throw new Error(`Pipeline runtime lock lost: ${abortReason(abortedSignal)}`);
  const listenableSignals = signals.filter((signal) => typeof signal.addEventListener === 'function');
  if (listenableSignals.length === 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const removeAbortListeners: Array<() => void> = [];
    const cleanup = () => {
      for (const removeAbortListener of removeAbortListeners) removeAbortListener();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (signal: AnyRecord) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Pipeline runtime lock lost: ${abortReason(signal)}`));
    };
    const timer = setTimeout(finish, ms);
    for (const signal of listenableSignals) {
      const onAbort = () => {
        fail(signal);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListeners.push(() => signal.removeEventListener('abort', onAbort));
    }
    (timer as AnyRecord).unref?.();
    const signal = listenableSignals.find((candidate) => candidate?.aborted);
    if (signal) fail(signal);
  });
}

async function runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep }: AnyRecord): Promise<any> {
  const next = plan.next;
  assertPipelineStepActive(opts);
  await resumeDurableCooldownForStep(config, progress, next, {
    budget: selectTruthyValue(() => (opts.budget), () => (null)),
    sleepFn: (ms: number) => abortableSleep(ms, opts),
  });
  assertPipelineStepActive(opts);
  const persistedHaltExitCode = emitPersistedPipelineHalt(config, deps);
  if (persistedHaltExitCode !== null) {
    return { kind: 'persisted_terminal_halt_exit', exitCode: persistedHaltExitCode };
  }

  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR) {
    return abortablePipelineStep(runValidatorStep(config, progress, next, deps, opts), opts);
  }
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_GATE) {
    return abortablePipelineStep(deps.runGate(config, progress, next.id, { novaPrompt: opts.novaPrompt, deps: opts.deps, attempt: plannedGateAttempt(next), budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) }), opts);
  }
  if (plan.action === PIPELINE_RUNNER_ACTIONS.RUN_MODULE_BATCH) {
    const moduleIds = [...new Set(next.ids.map((id: unknown) => String(id)).filter(Boolean))];
    const runId = selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => ('run_unknown'));
    const base = freezeParallelGitBase(config);
    const worktrees = new Map<string, AnyRecord>();
    let batchResult: AnyRecord | null = null;
    try {
      for (const moduleId of moduleIds) {
        worktrees.set(moduleId, allocateModuleWorktree(config, {
          runId,
          moduleId,
          attempt: 1,
          baseCommit: base.base_commit,
        }));
      }
      const schedulerBatch = await abortablePipelineStep(runSchedulerBatch({
        batchId: `${runId}:module_batch:${moduleIds.join(',')}`,
        itemIds: moduleIds,
        executor: async (moduleId: string) => ({
          moduleId,
          worktree: worktrees.get(moduleId),
          result: await runModuleWithIsolatedLogContext(
            configForModuleWorktree(config, worktrees.get(moduleId)),
            progress,
            moduleId,
            { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) },
            deps,
          ),
        }),
      }), opts);
      batchResult = {
        kind: 'module_batch_result',
        batch_id: schedulerBatch.batch_id,
        module_ids: moduleIds,
        git: {
          base_commit: base.base_commit,
          worktrees: moduleIds.map((moduleId) => worktrees.get(moduleId)),
          join: null,
        },
        results: schedulerBatch.results.map((entry: AnyRecord, index: number) => {
          const moduleId = moduleIds[index];
          if (entry.status === 'fulfilled') return entry.result;
          return {
            moduleId,
            result: moduleBatchRejectionStepResult(moduleId, entry.reason),
          };
        }),
      };
      const normalizedResults = normalizeBatchResults(batchResult) || [];
      const failed = normalizedResults.filter((entry: AnyRecord) => !entry.normalized?.shouldContinue);
      if (failed.length === 0) {
        for (const moduleId of moduleIds) verifyModuleWorktreeClean(worktrees.get(moduleId)?.worktree_path);
        batchResult.git.join = mergeModuleBranches(config, {
          branches: moduleIds.map((moduleId) => worktrees.get(moduleId)?.branch).filter(Boolean),
        });
      }
      return batchResult;
    } catch (error) {
      if (worktrees.size === 0) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      if (batchResult) {
        return {
          ...batchResult,
          git: {
            ...(batchResult.git || {}),
            join: (error as AnyRecord)?.gitSync || null,
          },
          join_failure: {
            module_id: moduleIds[0],
            reason,
            git: (error as AnyRecord)?.gitSync || null,
          },
        };
      }
      return {
        kind: 'module_batch_result',
        batch_id: `${runId}:module_batch:${moduleIds.join(',')}`,
        module_ids: moduleIds,
        git: {
          base_commit: base.base_commit,
          worktrees: moduleIds.map((moduleId) => worktrees.get(moduleId)).filter(Boolean),
          join: (error as AnyRecord)?.gitSync || null,
        },
        results: [{
          moduleId: moduleIds[0],
          result: buildPipelineStepResult({
            stepType: PIPELINE_STEP_TYPES.MODULE,
            stepId: moduleIds[0],
            nextAction: PIPELINE_STEP_ACTIONS.HALT,
            outcome: PIPELINE_STEP_OUTCOMES.ERROR,
            issueType: 'environment',
            reason,
            diagnostics: {
              summary: reason,
              metadata: {
                module_join_failed: true,
                git: (error as AnyRecord)?.gitSync || null,
              },
            },
            correlation: {
              step_type: PIPELINE_STEP_TYPES.MODULE,
              step_id: moduleIds[0],
              module_id: moduleIds[0],
            },
            terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
            terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
            terminalReasonCode: selectTruthyValue(() => ((error as AnyRecord)?.gitSync?.code), () => ('module_join_failed')),
            terminalHumanReason: reason,
            terminalMetadata: {
              git: (error as AnyRecord)?.gitSync || null,
            },
          }),
        }],
      };
    } finally {
      for (const moduleId of moduleIds) {
        const worktree = worktrees.get(moduleId);
        if (worktree) cleanupModuleWorktree(config, worktree);
      }
    }
  }
  return abortablePipelineStep(runModuleWithActiveLock(config, progress, next.id, { novaPrompt: opts.novaPrompt, deps: opts.deps, budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) }, deps), opts);
}

function passedModuleStepResult(moduleId: string): AnyRecord {
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.CONTINUE,
    outcome: PIPELINE_STEP_OUTCOMES.PASSED,
    reason: 'module completed',
    correlation: {
      step_type: PIPELINE_STEP_TYPES.MODULE,
      step_id: moduleId,
      module_id: moduleId,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.NONE,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
  });
}

function moduleBatchRejectionStepResult(moduleId: string, reasonValue: unknown): AnyRecord {
  const reason = reasonValue instanceof Error
    ? reasonValue.message
    : String(selectDefinedValue(() => (reasonValue), () => ('missing_module_batch_failure_detail')));
  const errorName = reasonValue instanceof Error && reasonValue.name ? reasonValue.name : null;
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        module_batch_rejection: true,
        failure_class: 'module_batch_rejection',
        error_name: errorName,
      },
    },
    correlation: {
      step_type: PIPELINE_STEP_TYPES.MODULE,
      step_id: moduleId,
      module_id: moduleId,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: 'module_batch_rejection',
    terminalHumanReason: reason,
  });
}

function normalizeBatchResults(batchResult: AnyRecord = {}) {
  if (selectTruthyValue(() => (batchResult?.kind !== 'module_batch_result'), () => (!Array.isArray(batchResult.results)))) return null;
  return batchResult.results.map((entry: AnyRecord = {}) => ({
    moduleId: entry.moduleId,
    normalized: normalizeStepResultForPipeline(selectDefinedValue(() => (entry.result), () => (passedModuleStepResult(entry.moduleId))), {
      stepType: 'module',
      stepId: entry.moduleId,
    }),
  }));
}

function batchModuleResults(batchResults: AnyRecord[] = []) {
  return batchResults.map((entry: AnyRecord) => {
    const stepResult = entry?.normalized?.stepResult || {};
    const outcome = selectTruthyValue(() => (stepResult?.outcome), () => ('error'));
    const reason = selectTruthyValue(() => (stepResult?.terminal?.decision?.reasonCode), () => (selectTruthyValue(() => (stepResult?.diagnostics?.summary), () => (stepResult?.reason))));
    return {
      module_id: entry.moduleId,
      outcome,
      status: outcome === PIPELINE_STEP_OUTCOMES.PASSED ? 'PASS' : 'FAIL',
      reason: selectTruthyValue(() => (reason), () => (outcome)),
    };
  });
}

function batchFailureResult(failed: AnyRecord[] = [], batchResults: AnyRecord[] = []) {
  const primary = failed[0];
  const primaryResult = primary?.normalized?.stepResult || {};
  const moduleResults = batchModuleResults(batchResults);
  const failedModules = failed.map((entry: AnyRecord) => {
    const stepResult = entry?.normalized?.stepResult || {};
    return {
      module_id: entry.moduleId,
      reason: selectTruthyValue(() => (stepResult?.terminal?.decision?.reasonCode), () => (selectTruthyValue(() => (stepResult?.diagnostics?.summary), () => (stepResult?.reason)))),
    };
  });
  const reason = `Module batch failed: ${moduleResults.map((entry: AnyRecord) => `${entry.module_id}: ${entry.status}${entry.reason && entry.reason !== entry.status ? ` (${entry.reason})` : ''}`).join('; ')}`;
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: primary.moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: selectTruthyValue(() => (primaryResult?.outcome), () => (PIPELINE_STEP_OUTCOMES.ERROR)),
    issueType: selectTruthyValue(() => (primaryResult?.issueType), () => ('environment')),
    reason,
    diagnostics: {
      findings: Array.isArray(primaryResult?.diagnostics?.findings) ? primaryResult.diagnostics.findings : [],
      metadata: {
        ...(primaryResult?.diagnostics?.metadata || {}),
        module_batch_failed: true,
        module_results: moduleResults,
        failed_modules: failedModules,
      },
    },
    correlation: {
      ...(primaryResult?.correlation || {}),
      step_type: PIPELINE_STEP_TYPES.MODULE,
      step_id: primary.moduleId,
      module_id: primary.moduleId,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: selectTruthyValue(() => (primaryResult?.terminal?.decision?.reasonCode), () => (null)),
    terminalHumanReason: reason,
    terminalSource: selectTruthyValue(() => (primaryResult?.terminal?.source), () => (null)),
    terminalMetadata: {
      ...(primaryResult?.terminal?.metadata || {}),
      module_results: moduleResults,
      failed_modules: failedModules,
    },
  });
}

function batchJoinFailureResult(joinFailure: AnyRecord = {}, batchResults: AnyRecord[] = []) {
  const moduleResults = batchModuleResults(batchResults);
  const failedModules = moduleResults
    .filter((entry: AnyRecord) => entry.status !== 'PASS')
    .map((entry: AnyRecord) => ({ module_id: entry.module_id, reason: entry.reason }));
  const git = selectTruthyValue(() => (joinFailure.git), () => (null));
  const code = selectTruthyValue(() => (git?.code), () => ('module_join_failed'));
  const cause = selectTruthyValue(() => (git?.cause), () => (joinFailure.reason));
  const reason = `Module batch join failed: ${code}${cause ? ` (${cause})` : ''}`;
  const moduleId = selectTruthyValue(() => (joinFailure.module_id), () => (moduleResults[0]?.module_id), () => ('module_batch'));
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE,
    stepId: moduleId,
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR,
    issueType: 'environment',
    reason,
    diagnostics: {
      metadata: {
        module_join_failed: true,
        git,
        module_results: moduleResults,
        failed_modules: failedModules,
      },
    },
    correlation: {
      step_type: PIPELINE_STEP_TYPES.MODULE,
      step_id: moduleId,
      module_id: moduleId,
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: code,
    terminalHumanReason: reason,
    terminalMetadata: {
      git,
      module_results: moduleResults,
      failed_modules: failedModules,
    },
  });
}

export async function runPipelineStateMachine({
  config,
  progress,
  opts = {},
  deps,
  findNextStep,
  runValidatorStep,
}: AnyRecord = {}): Promise<any> {
  while (true) {
    await opts.awaitCommandPermission?.();
    assertPipelineStepActive(opts);
    const persistedHaltExitCode = emitPersistedPipelineHalt(config, deps);
    if (persistedHaltExitCode !== null) return persistedHaltExitCode;
    const plan = planPipelineStep(findNextStep(config, progress, deps));
    assertPipelineStepActive(opts);

    if (plan.action === PIPELINE_RUNNER_ACTIONS.COMPLETE) {
      return completePipeline(config, progress, opts);
    }
    if (plan.action === PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED) {
      return haltPipeline(config, progress, plan.next, null, opts);
    }

    const result = await runPlannedPipelineStep({ config, progress, opts, deps, plan, runValidatorStep });
    if (result?.kind === 'persisted_terminal_halt_exit') return result.exitCode;
    assertPipelineStepActive(opts);
    const batchResults = normalizeBatchResults(result);
    if (batchResults) {
      if (result?.join_failure) {
        return haltPipeline(config, progress, {
          type: 'module',
          id: selectTruthyValue(() => (result.join_failure.module_id), () => (batchResults[0]?.moduleId)),
        }, batchJoinFailureResult(result.join_failure, batchResults), opts);
      }
      const failed = batchResults.filter((entry: AnyRecord) => !entry.normalized.shouldContinue);
      if (failed.length > 0) {
        return haltPipeline(config, progress, {
          type: 'module',
          id: failed[0].moduleId,
        }, batchFailureResult(failed, batchResults), opts);
      }
      continue;
    }
    const stepResult = selectDefinedValue(() => (result), () => (plan.next.type === 'module' ? passedModuleStepResult(plan.next.id) : result));
    const normalized = normalizeStepResultForPipeline(stepResult, {
      stepType: plan.next.type,
      stepId: plan.next.id,
    });
    if (!normalized.shouldContinue) {
      return haltPipeline(config, progress, plan.next, result, opts);
    }
  }
}
