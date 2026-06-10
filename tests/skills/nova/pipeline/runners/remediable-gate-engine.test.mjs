import assert from 'node:assert/strict';
import test from 'node:test';

import { runRemediableGateControlLoopResult } from '../../../../../skills/nova/pipeline/runners/remediable-gate-engine.ts';
import { buildGateRemediationRequestControlResult } from '../../../../../skills/nova/pipeline/services/remediation-handoff.ts';

function buildRequest(nextFixCycle = 1, maxFixCycles = 2) {
  return buildGateRemediationRequestControlResult({
    producerType: 'review',
    gateId: 'review-gate',
    gateType: 'review',
    runId: 'run-1',
    attempt: 1,
    summary: 'needs fix',
    remediation: {
      policy: {
        maxFixCycles,
        nextFixCycle,
        rerunStageId: 'review',
      },
      targetRef: 'gate:review-gate',
      startedAt: '2026-06-03T00:00:00.000Z',
    },
  });
}

test('runRemediableGateControlLoopResult advances stale re-evaluation fix cycles', async () => {
  const initialControlResult = buildRequest(1, 2);
  let performFixCount = 0;
  let exhaustedControlResult = null;

  const result = await runRemediableGateControlLoopResult({
    initialControlResult,
    normalizeControlResult: (value) => value,
    remediationController: {
      async performFix({ cycle }) {
        performFixCount += 1;
        assert.equal(cycle, performFixCount);
        return { mode: 're_evaluate' };
      },
      async evaluateGate() {
        return buildRequest(1, 2);
      },
      async buildExhaustedControlResult({ controlResult }) {
        exhaustedControlResult = controlResult;
        return {
          schemaVersion: 'v1',
          producerKind: 'gate',
          producerType: 'review',
          nextAction: 'halt',
        };
      },
    },
    gateId: 'review-gate',
    gate: { type: 'review' },
  });

  assert.equal(performFixCount, 2);
  assert.equal(exhaustedControlResult.diagnostics.typed.remediation.policy.nextFixCycle, 1);
  assert.equal(result.controlResult.nextAction, 'halt');
});
