#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  validateGateEvidenceAuthority,
} from '../../../skills/nova/pipeline/services/contracts/gate-control-result.ts';
import {
  buildApprovalGateControlResult,
  buildApprovalGateWaitControlResult,
} from '../../../skills/nova/pipeline/runners/approval-gate-control.ts';
import {
  buildBusterGateControlResult,
  buildBusterRequestFixControlResult,
} from '../../../skills/nova/pipeline/runners/buster-gate-control.ts';
import {
  buildReviewGateControlResult,
} from '../../../skills/nova/pipeline/runners/review-gate-control.ts';

const runId = 'run-gate-evidence';
const gateId = 'release-buster';
const attempt = 2;
const dispatchId = 'dispatch-gate-evidence';
const config = {
  project: 'gate-evidence-contract',
  run_id: runId,
  _runId: runId,
};

function assertAuthority(result, opts = {}) {
  assert.deepEqual(validateGateEvidenceAuthority(result, {
    expectedRunId: runId,
    expectedGateId: opts.gateId || gateId,
    expectedGateType: opts.gateType || result.producerType,
    expectedAttempt: opts.attempt ?? attempt,
    expectedDispatchId: opts.expectedDispatchId,
    requireDispatchId: opts.requireDispatchId === true,
  }), []);
}

const busterGate = { type: 'buster' };
const busterPass = buildBusterGateControlResult(config, gateId, busterGate, {
  status: 'PASS',
  completion_source: 'redis',
  attempt,
  dispatch_id: dispatchId,
  gateway_label: 'gateway-buster',
  session_key: 'session-buster',
});
assertAuthority(busterPass, { expectedDispatchId: dispatchId, requireDispatchId: true });

const reviewGateId = 'review';
const reviewGate = { type: 'review' };
const reviewBlock = buildReviewGateControlResult(config, reviewGateId, reviewGate, {
  outcome_class: 'needs_nova',
  failure_class: 'verdict_fail',
  reason: 'Review returned FAIL',
  attempt,
  dispatch_id: 'dispatch-review',
  gateway_label: 'gateway-review',
  session_key: 'session-review',
  last_review: {
    status: 'FAIL',
    issues: [{ title: 'Fix issue', severity: 'critical' }],
  },
});
assertAuthority(reviewBlock, {
  gateId: reviewGateId,
  gateType: 'review',
  expectedDispatchId: 'dispatch-review',
  requireDispatchId: true,
});

const approvalGateId = 'approval';
const approvalGate = { type: 'approval' };
const approvalWait = buildApprovalGateWaitControlResult(config, approvalGateId, approvalGate, {
  run_id: runId,
  gate_id: approvalGateId,
  gate_type: 'approval',
  status: 'PENDING_APPROVAL',
  attempt,
  dispatch_id: 'dispatch-approval-request',
  wait_ref: `wait:${runId}:gate:${approvalGateId}:${attempt}:approval`,
  requested_at: '2026-06-17T00:00:00.000Z',
  deadline: '2026-06-17T00:10:00.000Z',
  timeout_minutes: 10,
  timeout_policy: 'block',
}, {
  input: {
    refs: { waitRef: `wait:${runId}:gate:${approvalGateId}:${attempt}:approval` },
    ids: { attempt },
  },
});
assertAuthority(approvalWait, {
  gateId: approvalGateId,
  gateType: 'approval',
  expectedDispatchId: 'dispatch-approval-request',
  requireDispatchId: true,
});

const approvalPass = buildApprovalGateControlResult(config, approvalGateId, approvalGate, {
  status: 'APPROVED',
  outcome_class: 'passed',
  decision_by: 'operator',
  decision_via: 'discord',
  attempt,
  dispatch_id: 'dispatch-approval-request',
}, {
  approvalState: {
    run_id: runId,
    gate_id: approvalGateId,
    gate_type: 'approval',
    attempt,
    dispatch_id: 'dispatch-approval-request',
    status: 'APPROVED',
    timeout_policy: 'block',
  },
});
assertAuthority(approvalPass, {
  gateId: approvalGateId,
  gateType: 'approval',
  expectedDispatchId: 'dispatch-approval-request',
  requireDispatchId: true,
});

const busterFix = buildBusterRequestFixControlResult(config, gateId, busterGate, {
  status: 'FAIL',
  summary: 'Buster found issues',
}, [{ title: 'Broken test', severity: 'critical' }], {
  remediationPolicy: {
    maxFixCycles: 3,
    nextFixCycle: attempt,
    rerunStageId: 'gate:buster',
  },
  dispatchId,
  gatewayLabel: 'gateway-buster',
  sessionKey: 'session-buster',
  gateStartedAt: '2026-06-17T00:00:00.000Z',
});
assertAuthority(busterFix, { expectedDispatchId: dispatchId, requireDispatchId: true });

const staleErrors = validateGateEvidenceAuthority(busterPass, {
  expectedRunId: 'run-other',
  expectedGateId: gateId,
  expectedGateType: 'buster',
  expectedAttempt: attempt,
  expectedDispatchId: dispatchId,
  requireDispatchId: true,
});
assert(staleErrors.includes('gate evidence run_id does not match expected run'));

const missingDispatch = buildBusterGateControlResult(config, gateId, busterGate, {
  status: 'PASS',
  completion_source: 'redis',
  attempt,
});
assert(validateGateEvidenceAuthority(missingDispatch, {
  expectedRunId: runId,
  expectedGateId: gateId,
  expectedGateType: 'buster',
  expectedAttempt: attempt,
  requireDispatchId: true,
}).includes('gate evidence must include dispatch_id'));

const pathOnly = {
  schemaVersion: 'v1',
  producerKind: 'gate',
  producerType: 'buster',
  nextAction: 'pass',
  diagnostics: {
    summary: 'path only',
    findings: [],
    metadata: {
      output_file: '.swarm/gates/release-buster/output.json',
    },
    typed: {
      gate: {
        schemaVersion: 'v1',
        gateRunStatus: 'PASS',
        outcomeClass: 'passed',
      },
    },
  },
};
const pathOnlyErrors = validateGateEvidenceAuthority(pathOnly, {
  expectedRunId: runId,
  expectedGateId: gateId,
  expectedGateType: 'buster',
  expectedAttempt: attempt,
  requireDispatchId: true,
});
assert(pathOnlyErrors.includes('gate evidence must include run_id'));
assert(pathOnlyErrors.includes('gate evidence path is diagnostic only without run/gate/attempt identity'));

console.log(JSON.stringify({
  ok: true,
  contract: 'gate-evidence-authority',
  run_id: runId,
  gates_checked: ['buster', 'review', 'approval'],
  stale_rejected: true,
  path_only_rejected: true,
}, null, 2));
