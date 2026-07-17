// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { getRunId } from '../core/runtime.ts';
import { resolvePipelineRunLogDir } from '../core/paths.ts';
import { requireStageHandler } from '../core/registry.ts';
import { runScheduledGenerator as runScheduledGeneratorImpl } from './pipeline-runner-scheduling.ts';
import { getPipelineRunnerDeps } from './pipeline-runner-deps.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
type TerminalGeneratorRunState = {
  path: string | null;
  completed: Set<string>;
  durableLoaded: boolean;
};

const TERMINAL_COMPLETION_GENERATORS = Object.freeze([
  {
    stageId: 'generator:project_summary',
    opts: { orderIndex: 1 },
  },
  {
    stageId: 'generator:pipeline_review',
    opts: { orderIndex: 2 },
  },
  {
    stageId: 'generator:case_study',
    opts: { orderIndex: 3 },
  },
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requirePipelineRunId(config: AnyRecord, purpose = 'pipeline terminal operation'): string {
  const runId = getRunId(config);
  if (runId) return runId;
  throw new Error(`${purpose} requires a run id`);
}

export async function runScheduledGenerator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}): Promise<AnyRecord> {
  return runScheduledGeneratorImpl(config, progress, stageId, opts, getPipelineRunnerDeps(config, opts.deps));
}

function terminalGeneratorCompletionPath(config: AnyRecord): string | null {
  const runId = requirePipelineRunId(config, 'Terminal generator completion path');
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  return runLogDir ? path.join(runLogDir, 'terminal-generator-completions.json') : null;
}

function terminalGeneratorRunState(config: AnyRecord): TerminalGeneratorRunState {
  const filePath = terminalGeneratorCompletionPath(config);
  if ([!config._terminalGeneratorRunState, typeof config._terminalGeneratorRunState !== 'object', config._terminalGeneratorRunState?.path !== filePath].some(Boolean)) {
    config._terminalGeneratorRunState = { path: filePath, completed: new Set<string>(), durableLoaded: false };
  }
  if (!(config._terminalGeneratorRunState.completed instanceof Set)) {
    config._terminalGeneratorRunState.completed = new Set(Array.isArray(config._terminalGeneratorRunState.completed) ? config._terminalGeneratorRunState.completed : []);
  }
  return config._terminalGeneratorRunState as TerminalGeneratorRunState;
}

function loadTerminalGeneratorCompletions(config: AnyRecord): TerminalGeneratorRunState {
  const state = terminalGeneratorRunState(config);
  if (state.durableLoaded === true) return state;
  state.durableLoaded = true;
  const filePath = terminalGeneratorCompletionPath(config);
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return state;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(parsed?.completed) ? parsed.completed : [];
    for (const entry of entries) {
      const stageId = typeof entry === 'string' ? entry : entry?.stage_id;
      if (stageId) state.completed.add(String(stageId));
    }
  } catch (error) {
    throw new Error(`Terminal generator completion state is unreadable and requires repair: ${errorMessage(error)}`);
  }
  return state;
}

function saveTerminalGeneratorCompletions(config: AnyRecord, state: TerminalGeneratorRunState = terminalGeneratorRunState(config)): void {
  const filePath = terminalGeneratorCompletionPath(config);
  if (!filePath) return;
  const completedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 'v1',
    project: selectDefinedValue(() => (config?.project), () => (null)),
    run_id: requirePipelineRunId(config, 'Terminal generator completion state'),
    completed: [...state.completed].sort().map((stageId: string) => ({ stage_id: stageId, completed_at: completedAt })),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function isTerminalGeneratorComplete(config: AnyRecord, stageId: string): boolean {
  return loadTerminalGeneratorCompletions(config).completed.has(stageId);
}

function markTerminalGeneratorComplete(config: AnyRecord, stageId: string): void {
  if (!stageId) return;
  const state = loadTerminalGeneratorCompletions(config);
  state.completed.add(stageId);
  saveTerminalGeneratorCompletions(config, state);
}

function didTerminalGeneratorSucceed(result: AnyRecord): boolean {
  if (result?.outputs?.status !== 'ok') return false;
  const artifacts = Array.isArray(result?.artifacts) ? result.artifacts : [];
  return artifacts.every((artifact: AnyRecord) => typeof artifact?.path === 'string' && artifact.path.length > 0 && fs.existsSync(artifact.path));
}

function pipelineReviewConfig(config: AnyRecord, progress: AnyRecord): AnyRecord {
  return selectDefinedValue(() => (selectDefinedValue(() => (config?.pipeline_review), () => (progress?.pipeline_review))), () => ({}));
}

function executionBoundary(progress: AnyRecord): string {
  return String(selectDefinedValue(() => (progress?.real_e2e?.execution_boundary), () => ('full')) || 'full');
}

function terminalCompletionGenerators(config: AnyRecord, progress: AnyRecord): readonly AnyRecord[] {
  const pipelineReview = pipelineReviewConfig(config, progress);
  const boundary = executionBoundary(progress);
  return TERMINAL_COMPLETION_GENERATORS.filter((generator: AnyRecord) => {
    if (boundary !== 'full' && ['generator:case_study', 'generator:pipeline_review'].includes(generator.stageId)) return false;
    if (generator.stageId === 'generator:case_study') return config?.case_study?.enabled !== false;
    if (generator.stageId === 'generator:pipeline_review') return pipelineReview?.enabled !== false;
    return true;
  });
}

async function runTerminalCompletionGenerator(config: AnyRecord, progress: AnyRecord, stageId: string, opts: AnyRecord = {}): Promise<AnyRecord | null> {
  if (isTerminalGeneratorComplete(config, stageId)) return null;
  const result = await runScheduledGenerator(config, progress, stageId, {
    scheduleReason: 'pipeline_complete',
    mode: 'full',
    terminalStatus: 'succeeded',
    reasonCode: 'PIPELINE_COMPLETE',
    causationRef: 'event:pipeline_run.completed',
    ...opts,
  });
  if (didTerminalGeneratorSucceed(result)) {
    markTerminalGeneratorComplete(config, stageId);
    return null;
  }
  return result;
}

export async function runMissingTerminalCompletionGenerators(config: AnyRecord, progress: AnyRecord, opts: AnyRecord = {}): Promise<AnyRecord | null> {
  for (const generator of terminalCompletionGenerators(config, progress)) {
    const failedResult = await runTerminalCompletionGenerator(config, progress, generator.stageId, {
      ...generator.opts,
      deps: opts.deps,
    });
    if (failedResult) return { stageId: generator.stageId, result: failedResult };
  }
  return null;
}

export function validateTerminalCompletionGenerators(config: AnyRecord, progress: AnyRecord = {}): AnyRecord | null {
  for (const generator of terminalCompletionGenerators(config, progress)) {
    if (isTerminalGeneratorComplete(config, generator.stageId)) continue;
    try {
      requireStageHandler(config, 'generator.run', generator.stageId, 'run');
    } catch (error) {
      return {
        stageId: generator.stageId,
        result: {
          schemaVersion: 'v1',
          producerKind: 'generator',
          producerType: generator.stageId.split(':')[1] || 'unknown',
          outputs: {
            status: 'failed',
            reason: errorMessage(error),
          },
          diagnostics: {
            error: errorMessage(error),
          },
        },
      };
    }
  }
  return null;
}
