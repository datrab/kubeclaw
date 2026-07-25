import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/module-runner.ts — public module runner façade
//
// Thin surface: resolve module context, run retry loop, and delegate each
// forge/preflight/buster lifecycle attempt to module-runner/attempt.ts.

import { log } from '../core/logger.ts';
import { onRetryScheduled } from '../services/telemetry.ts';
import { emitPipelineCheckpoint } from '../services/pipeline-checkpoint.ts';
import {
  _telemetryCtx,
  setLogScope,
} from './module-runner-shared.ts';
import {
  executeModuleAttempt,
  getModuleRunnerDeps,
  resolveModuleRunContext,
} from './module-runner/attempt.ts';

type AnyRecord = Record<string, any>;

function moduleStages(mod: AnyRecord): string[] {
  return Array.isArray(mod.stages) ? mod.stages : ['forge', 'buster'];
}

function retryMaxFails(attempt: AnyRecord, configuredMaxFails: number): number {
  return selectDefinedValue(() => (attempt.max_fails), () => (configuredMaxFails));
}

function logModuleBanner(moduleId: string, mod: AnyRecord) {
  setLogScope(moduleId, null);
  log('STEP', `═══════════════════════════════════════════════════`);
  log('STEP', `  MODULE ${moduleId}: ${mod.title}`);
  log('STEP', `  Stages: ${moduleStages(mod).join(' → ')}`);
  log('STEP', `═══════════════════════════════════════════════════`);
}

/**
 * Run a module through its full lifecycle.
 *
 * Public wrapper only owns the retry loop. Each iteration re-reads module state
 * inside executeModuleAttempt so fail_count, fail_summaries, and retry context
 * are always fresh after handleFail persists them.
 *
 * @param {object} config    - Pipeline config
 * @param {object} progress  - Project progress
 * @param {string} moduleId  - Module identifier
 * @param {object} opts      - Options: { novaPrompt }
 * @returns {Promise<{ schemaVersion: string, kind: string, [key: string]: any }>}
 */
export async function runModule(config: AnyRecord, progress: AnyRecord, moduleId: string, opts: AnyRecord = {}) {
  const deps = getModuleRunnerDeps(config, opts.deps);
  const { mod, maxFails } = resolveModuleRunContext(config, progress, moduleId);
  const novaPrompt = selectTruthyValue(() => (opts.novaPrompt), () => (null));

  logModuleBanner(moduleId, mod);

  while (true) {
    const attempt: AnyRecord = await executeModuleAttempt({
      config,
      progress,
      moduleId,
      novaPrompt,
      deps,
    });

    if (!attempt.retry) return attempt.result;

    const maxFailAuthority = retryMaxFails(attempt, maxFails);
    log('INFO', `Retry loop continuing — attempt ${attempt.fail_count}/${maxFailAuthority}`);
    onRetryScheduled(_telemetryCtx(config), moduleId, {
      attempt: attempt.fail_count,
      max_attempts: maxFailAuthority,
      max_fails: maxFailAuthority,
      dispatch_id: selectDefinedValue(() => (attempt.dispatch_id), () => (null)),
      gateway_label: selectDefinedValue(() => (attempt.gateway_label), () => (null)),
      session_key: selectDefinedValue(() => (attempt.session_key), () => (null)),
      reason: selectTruthyValue(() => (attempt.last_fail?.summary), () => (null)),
    });
    emitPipelineCheckpoint(config, 'during_retry_cycle', {
      step_type: 'module',
      step_id: moduleId,
      module_id: moduleId,
      failed_attempt: attempt.fail_count,
      next_attempt: attempt.fail_count + 1,
      dispatch_id: selectDefinedValue(() => (attempt.dispatch_id), () => (null)),
    });
    await deps.sleep(5000, { budget: selectTruthyValue(() => (opts.budget), () => (null)), signal: selectTruthyValue(() => (opts.signal), () => (null)) }); // Allow gateway to release session labels before retry
  }
}
