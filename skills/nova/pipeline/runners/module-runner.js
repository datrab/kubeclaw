// runners/module-runner.js — Module execution runner
// Extracted from pipeline-original.js as the module runner layer.
//
// Module state machine:
//
//   PENDING ──► blueprint release ──► IN_PROGRESS
//                                          │
//                                    [FORGE PHASE]
//                                    spawn Forge agent
//                                    poll READY_FOR_TESTING / FAIL / BLOCKED
//                                          │
//                                  READY_FOR_TESTING
//                                          │
//                                    [PRE-CHECK]  (forge+buster only)
//                                    tsc / ruff / shellcheck
//                                    on fail → handleFail → Forge retry
//                                          │
//                                    [GIT SYNC]
//                                    commit + pull before Buster
//                                          │
//                                   [BUSTER PHASE]
//                                    dispatch Buster subagent
//                                    poll PASS / FAIL / BLOCKED
//                                          │
//                              ┌───────────┴───────────┐
//                            PASS                  FAIL / BLOCKED
//                              │                       │
//                           EXIT_OK              handleFail → retry
//                                                (up to max_fails)
//                                                    │
//                                              BLOCKED → EXIT_BLOCKED
//
// Full implementation delegates to pipeline-original.js until the phase runners
// are extracted for real. Do not export phase-level stubs that throw.

import {
  runModule as _runModule,
  runPreCheck,
} from '../../pipeline-original.js';

/**
 * PRE-CHECK: fast static analysis (tsc/ruff/shellcheck) on Forge output.
 * Runs only when both forge and buster stages are configured.
 * On failure: handleFail with pre_check phase → Forge retry.
 *
 * Full implementation: runPreCheck (pipeline-original.js)
 */
export async function runPrecheck(config, dir, status, moduleId) {
  return runPreCheck(config, dir, status, moduleId);
}

/**
 * Run a module through its full lifecycle.
 *
 * Resolves module config, checks dependencies (once before any attempt), then
 * enters the retry loop which executes the forge → precheck → buster state
 * machine via executeModuleAttempt. Each loop iteration re-reads status from
 * disk so fail_count, fail_summaries, and retry context are always fresh.
 *
 * @param {object} config      - Pipeline config
 * @param {object} progress    - Project progress
 * @param {string} moduleId    - Module identifier
 * @param {object} opts        - Options: { novaPrompt }
 * @returns {Promise<{ exit: number, [key: string]: any }>}
 */
export async function runModule(config, progress, moduleId, opts = {}) {
  return _runModule(config, progress, moduleId, opts);
}

export default runModule;
