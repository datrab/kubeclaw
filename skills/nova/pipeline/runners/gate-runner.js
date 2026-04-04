// runners/gate-runner.js — Gate dispatch layer
//
// Provides a GATE_RUNNERS strategy map keyed by gate type, enabling
// new gate types to be added without modifying the monolith or pipeline-runner.
//
// Dispatch table:
//   buster  → runBusterGate  (spawn Buster agent, optional fix-and-retest loop)
//   review  → runReviewGate  (lint report + Echo reviewer, optional fix-and-rereview loop)

import { log } from '../core/logger.js';
import { EXIT_ERROR } from '../core/constants.js';
import { runBusterGate } from './buster-gate-runner.js';
import { runReviewGate } from './review-gate-runner.js';
import { runApprovalGate } from './approval-gate-runner.js';

/**
 * Gate runner strategy map. Keyed by gate.type from progress.json.
 * Add new gate types here — no changes needed in pipeline-runner.js.
 */
export const GATE_RUNNERS = {
  buster:   runBusterGate,
  review:   runReviewGate,
  approval: runApprovalGate,
};

function getGateRunners(config) {
  return { ...GATE_RUNNERS, ...(config?._testOverrides?.gateRunner?.runners || {}) };
}

/**
 * Dispatch gate execution to the appropriate runner based on gate.type.
 *
 * @param {object} config   - Pipeline config
 * @param {object} progress - Project progress
 * @param {string} gateId   - Gate identifier
 * @param {object} opts     - Options (novaPrompt, etc.)
 * @returns {Promise<{ exit: number, [key: string]: any }>}
 */
export async function runGate(config, progress, gateId, { novaPrompt } = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Gate '${gateId}' not found in progress.json`);

  const runner = getGateRunners(config)[gate.type];
  if (!runner) {
    log('ERROR', `Unknown gate type '${gate.type}' for gate '${gateId}'`);
    return { exit: EXIT_ERROR, reason: `Unknown gate type '${gate.type}' for gate '${gateId}'` };
  }

  return runner(config, progress, gateId, { novaPrompt });
}

export default runGate;
