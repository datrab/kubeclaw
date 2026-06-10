import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { GATE_CONTROL_ACTIONS } from '../../../../../skills/nova/pipeline/services/contracts/gate-control-result.ts';
import { getPipelineArtifactBundle } from '../../../../../skills/nova/pipeline/services/artifact-bundle.ts';
import { createPipelineEventBus } from '../../../../../skills/nova/pipeline/services/pipeline-event-contract.ts';
import { APPROVAL_STATUS, runApprovalGateEvaluation, waitForApprovalGateSignal } from '../../../../../skills/nova/pipeline/runners/approval-gate-runner.ts';

function testConfig(runId = 'run-invalid-timeout-policy') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-gate-runner-test-'));
  return {
    project: 'approval-gate-test',
    _runId: runId,
    run_id: runId,
    default_timeout_minutes: 5,
    paths: { swarm_dir: dir },
  };
}

function testProgress(onTimeout = 'BLOCK') {
  return {
    gates: {
      deploy: {
        type: 'approval',
        title: 'Deploy',
        timeout_minutes: 5,
        on_timeout: onTimeout,
      },
    },
    execution_order: ['gate:deploy'],
  };
}

test('approval gate resume fails closed for invalid persisted timeout_policy', async () => {
  const alerts = [];
  const result = await runApprovalGateEvaluation(testConfig(), testProgress(), 'deploy', {
    deps: {
      approvalGate: {
        loadGateState: () => ({
          gate_id: 'deploy',
          gate_type: 'approval',
          status: APPROVAL_STATUS.PENDING_APPROVAL,
          requested_at: new Date().toISOString(),
          timeout_minutes: 5,
          timeout_policy: 'continue_on_timeout',
        }),
        discord: async (...args) => alerts.push(args),
        saveGateState: () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
      },
    },
  });

  assert.equal(result.producerType, 'approval');
  assert.equal(result.nextAction, GATE_CONTROL_ACTIONS.BLOCK);
  assert.equal(result.diagnostics.metadata.invalid_state, true);
  assert.equal(result.diagnostics.metadata.timeout_policy, null);
  assert.equal(alerts.length, 1);
});

test('approval gate timeout with CONTINUE emits passing verdict telemetry', async () => {
  const config = testConfig('run-timeout-continue');
  const result = await runApprovalGateEvaluation(config, testProgress('CONTINUE'), 'deploy', {
    deps: {
      approvalGate: {
        loadGateState: () => ({
          gate_id: 'deploy',
          gate_type: 'approval',
          status: APPROVAL_STATUS.TIMED_OUT,
          run_id: config.run_id,
          project: config.project,
          timeout_minutes: 5,
          timeout_policy: 'CONTINUE',
          decision_via: 'timeout',
          continued: true,
        }),
        saveGateState: () => {},
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
      },
    },
  });

  assert.equal(result.nextAction, GATE_CONTROL_ACTIONS.PASS);
  assert.equal(result.diagnostics.metadata.continued, true);

  const artifactBundle = getPipelineArtifactBundle(config);
  const events = fs.readFileSync(artifactBundle.run_pipeline_jsonl_path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const verdicts = events.filter((event) => event.type === 'gate.verdict' && event.gate_id === 'deploy');

  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].verdict, 'GO');
});

test('approval gate wait resolves persisted TIMED_OUT CONTINUE signal as pass', async () => {
  const config = testConfig('run-timeout-continue-signal');
  const eventBus = createPipelineEventBus();
  let state = {
    gate_id: 'deploy',
    gate_type: 'approval',
    status: APPROVAL_STATUS.PENDING_APPROVAL,
    run_id: config.run_id,
    project: config.project,
    requested_at: new Date().toISOString(),
    deadline: new Date(Date.now() + 60_000).toISOString(),
    timeout_minutes: 5,
    timeout_policy: 'CONTINUE',
  };

  const result = await waitForApprovalGateSignal(config, testProgress('CONTINUE'), 'deploy', null, {
    eventBus,
    deps: {
      approvalGate: {
        loadGateState: () => state,
        saveGateState: (_config, _gateId, nextState) => { state = nextState; },
        appendTransition: () => {},
        writeApprovalRequest: () => {},
        writeApprovalDecision: () => {},
        createSignalAdapter: () => ({
          start: () => {
            state = {
              ...state,
              status: APPROVAL_STATUS.TIMED_OUT,
              resolved_at: new Date().toISOString(),
              decision_via: 'timeout',
              continued: true,
              reason: 'No decision received within 5 minutes',
            };
            setImmediate(() => eventBus.emit({
              type: 'approval.signal',
              source: 'local_fs',
              identity: { gate_id: 'deploy', run_id: config.run_id },
              payload: {
                gate_id: 'deploy',
                gate_type: 'approval',
                run_id: config.run_id,
                project: config.project,
                wait_ref: null,
                status: APPROVAL_STATUS.TIMED_OUT,
                signal_kind: 'timeout_continue',
                requested_at: state.requested_at,
                deadline: state.deadline,
                timeout_minutes: state.timeout_minutes,
                timeout_policy: 'CONTINUE',
                resolved_at: state.resolved_at,
                decision_by: null,
                decision_via: 'timeout',
                continued: true,
                reason: state.reason,
                state_path: path.join(config.paths.swarm_dir, 'deploy-gate-status.json'),
                updated_at: null,
              },
            }));
            return { watching: 0, path: null };
          },
          stop: () => {},
        }),
      },
    },
  });

  assert.equal(result.nextAction, GATE_CONTROL_ACTIONS.PASS);
  assert.equal(result.diagnostics.metadata.domain_status, APPROVAL_STATUS.TIMED_OUT);
  assert.equal(result.diagnostics.metadata.continued, true);
  assert.equal(result.diagnostics.metadata.invalid_state, false);
});
