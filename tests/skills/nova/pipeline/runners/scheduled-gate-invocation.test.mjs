import assert from 'node:assert/strict';
import test from 'node:test';

import { assertScheduledGateInvocationIdentity } from '../../../../../skills/nova/pipeline/runners/scheduled-gate-invocation.ts';

function gateInput(overrides = {}) {
  return {
    ids: {
      runId: 'run-1',
      stageId: 'gate:review',
      gateId: 'review-a',
      gateType: 'review',
      attempt: 1,
      ...overrides,
    },
  };
}

test('scheduled gate invocation rejects mismatched plugin gate id', () => {
  assert.throws(
    () => assertScheduledGateInvocationIdentity({
      stageId: 'gate:review',
      gateId: 'review-a',
      gateInput: gateInput(),
      pluginInvocation: {
        stageId: 'gate:review',
        gateId: 'review-b',
      },
    }),
    /plugin gateId must match explicit gateId/,
  );
});

test('scheduled gate invocation accepts matching plugin identity metadata', () => {
  const identity = assertScheduledGateInvocationIdentity({
    stageId: 'gate:review',
    gateId: 'review-a',
    gateInput: gateInput(),
    pluginInvocation: {
      stageId: 'gate:review',
      gateId: 'review-a',
      runId: 'run-1',
      gateType: 'review',
      attempt: '1',
    },
  });

  assert.deepEqual(identity, {
    stageId: 'gate:review',
    gateId: 'review-a',
    runId: 'run-1',
    gateType: 'review',
    attempt: 1,
  });
});
