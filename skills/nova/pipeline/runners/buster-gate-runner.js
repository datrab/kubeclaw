// runners/buster-gate-runner.js — Buster gate runner
// Transitional runner module for the buster gate lifecycle.
//
// Handles the buster gate lifecycle:
//   1. Completion check (output_file + gate-status.json fallback)
//   2. Stale file cleanup
//   3. Main loop: run Buster → optional fix-and-retest (Forge fixes, Buster retests)
//
// The fix-and-retest loop tracks fix history to prevent repeated failed approaches
// via anti-pattern framing in subsequent Forge prompts.
//
// Full implementation still delegates to pipeline-original.js until the body is
// extracted into this runner module.

export { runBusterGate } from '../../pipeline-original.js';
