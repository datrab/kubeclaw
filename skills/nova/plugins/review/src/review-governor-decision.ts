import type { StageResult, WaitRequest } from '@kubeclaw/plugin-sdk';

import type { ReviewGovernorSnapshot } from './review-governor.ts';

function orchestration(wait: WaitRequest | undefined, governor: ReviewGovernorSnapshot): StageResult {
  if (!wait) return {
    schemaVersion: 'stage-result.v2', outcome: 'blocked', artifacts: [],
    reason: { code: 'kubeclaw.review.governor_wait_missing', message: 'Review governor escalation requires an orchestrator wait identity.' },
  };
  return {
    schemaVersion: 'stage-result.v2', outcome: 'orchestrator_required', artifacts: [], wait,
    reason: {
      code: `kubeclaw.review.governor_${governor.decision}`,
      message: `Review repair governor requires orchestration: ${governor.decision}.`,
      details: { baselineId: governor.baselineId, decision: governor.decision },
    },
  };
}

export function applyReviewGovernor(
  result: StageResult, governor: ReviewGovernorSnapshot, wait: WaitRequest | undefined,
): StageResult {
  if (governor.decision === 'within_scope') return result;
  if (governor.decision === 'invalid_state') return result.outcome === 'blocked' ? result : {
    schemaVersion: 'stage-result.v2', outcome: 'blocked', artifacts: [],
    reason: { code: 'kubeclaw.review.governor_invalid_state', message: 'Review governor state could not be certified.' },
  };
  if (governor.decision === 'cycle_exhausted' && result.outcome !== 'request_fix') return result;
  const scopeBreach = ['file_growth', 'non_test_loc_growth', 'ownership_crossing'].includes(governor.decision);
  if (result.outcome === 'request_fix'
    || (scopeBreach && ['passed', 'blocked', 'orchestrator_required'].includes(result.outcome))) {
    return orchestration(wait, governor);
  }
  return result;
}
