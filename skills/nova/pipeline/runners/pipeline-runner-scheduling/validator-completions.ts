// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

import { getRunId } from '../../core/runtime.ts';
import { resolvePipelineRunLogDir } from '../../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;

type ValidatorRunState = {
  path: string | null;
  completed: Set<string>;
  durableLoaded: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function scheduledValidatorCompletionPath(config: AnyRecord): string | null {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(config)), () => (config?._runId))), () => (config?.run_id))), () => (null));
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  return runLogDir ? path.join(runLogDir, 'scheduled-validator-completions.json') : null;
}

function validatorRunState(config: AnyRecord): ValidatorRunState {
  const filePath = scheduledValidatorCompletionPath(config);
  if (selectTruthyValue(() => (selectTruthyValue(() => (!config._validatorRunState), () => (typeof config._validatorRunState !== 'object'))), () => (config._validatorRunState.path !== filePath))) {
    config._validatorRunState = { path: filePath, completed: new Set<string>(), durableLoaded: false };
  }
  if (!(config._validatorRunState.completed instanceof Set)) {
    config._validatorRunState.completed = new Set(Array.isArray(config._validatorRunState.completed) ? config._validatorRunState.completed : []);
  }
  return config._validatorRunState as ValidatorRunState;
}

function loadScheduledValidatorCompletions(config: AnyRecord): ValidatorRunState {
  const state = validatorRunState(config);
  if (state.durableLoaded === true) return state;
  state.durableLoaded = true;
  const filePath = scheduledValidatorCompletionPath(config);
  if (selectTruthyValue(() => (!filePath), () => (!fs.existsSync(filePath)))) return state;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(parsed?.completed) ? parsed.completed : [];
    for (const entry of entries) {
      const key = typeof entry === 'string' ? entry : entry?.key;
      if (key) state.completed.add(String(key));
    }
  } catch (error) {
    throw new Error(`Scheduled validator completion state is unreadable and requires repair: ${errorMessage(error)}`);
  }
  return state;
}

function saveScheduledValidatorCompletions(config: AnyRecord, state: ValidatorRunState = validatorRunState(config)): void {
  const filePath = scheduledValidatorCompletionPath(config);
  if (!filePath) return;
  const completedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 'v1',
    project: selectTruthyValue(() => (config?.project), () => (null)),
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (getRunId(config)), () => (config?._runId))), () => (config?.run_id))), () => (null)),
    completed: [...state.completed].sort().map((key: string) => ({ key, completed_at: completedAt })),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

export function markScheduledValidatorComplete(config: AnyRecord, key: string): void {
  if (!key) return;
  const state = loadScheduledValidatorCompletions(config);
  state.completed.add(key);
  saveScheduledValidatorCompletions(config, state);
}

export function isScheduledValidatorComplete(config: AnyRecord, key: string): boolean {
  if (!key) return false;
  return loadScheduledValidatorCompletions(config).completed.has(key);
}
