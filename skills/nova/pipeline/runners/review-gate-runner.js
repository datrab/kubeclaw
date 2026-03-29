// runners/review-gate-runner.js — Review gate runner
// Transitional runner module for the review gate lifecycle.
//
// Handles the review gate lifecycle:
//   1. Completion check (content-aware: NO-GO files are not complete)
//   2. Lint report generation (deterministic static analysis)
//   3. Echo reviewer spawn → poll output file → parse GO/NO-GO
//   4. Fix-and-rereview loop (Forge fixes issues, Echo re-reviews)
//
// Full implementation still delegates to pipeline-original.js until the body is
// extracted into this runner module.

export { runReviewGate } from '../../pipeline-original.js';
