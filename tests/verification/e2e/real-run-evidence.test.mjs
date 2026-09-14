import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { registryTestContract } from './registry-test-contract.mjs';

import {
  expectedFailureContractForScenario,
  verifyExpectedFailureEvidence,
  verifyNativeSubagentToolPairs,
  verifyRealRunEvidence,
} from './real-run-evidence.mjs';
import {
  listRealE2EScenarioIds,
  resolveRealE2EScenario,
} from './failure-scenarios.mjs';

function pairedToolEvents(overrides = {}) {
  const identity = {
    tool_call_id: 'tool-1',
    session_key: 'session-1',
    model_call_id: 'model-1',
    module_id: '01-nginx',
    attempt: 1,
    dispatch_id: 'dispatch-1',
  };
  return [
    {
      type: 'agent.tool.started',
      event_id: 'tool-start',
      occurred_at: '2026-07-21T00:00:00.000Z',
      tool_name: 'read',
      content_completeness: 'full',
      ...identity,
      ...overrides.start,
    },
    {
      type: 'agent.tool.finished',
      event_id: 'tool-finish',
      occurred_at: '2026-07-21T00:00:01.000Z',
      tool_name: 'read',
      content_completeness: 'full',
      outcome: 'success',
      result_bytes: 1,
      error: null,
      ...identity,
      ...overrides.finish,
    },
  ];
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function workspaceWithV2Result({
  status = 'blocked',
  terminal = 'run.blocked',
  scenarioId = 'architecture-validator-block',
  expectedEvidence = 'architecture_validator_block',
  stageId = 'architecture',
  stageTerminal = 'stage.blocked',
  reason = 'ARCH_VALIDATION_BLOCKED',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-evidence-'));
  const swarmDir = path.join(root, '.swarm');
  const stateRoot = path.join(swarmDir, 'v2-runtime');
  const artifactRoot = path.join(swarmDir, 'artifacts', 'v2');
  const runId = 'run:v2-evidence';
  const runRoot = path.join(stateRoot, 'runs', runId.replaceAll(':', '_'));
  writeJson(path.join(swarmDir, 'real-production-result.json'), {
    schemaVersion: 'real-production-pipeline-result.v2',
    runId,
    status,
    model: 'openai/gpt-5.3-codex-spark',
    scenario: { id: scenarioId, expectedEvidence },
    stateRoot,
    artifactRoot,
    stages: {},
  });
  writeJson(path.join(swarmDir, 'progress.json'), {
    execution_order: ['REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE'],
    real_e2e: {
      scenario_id: scenarioId,
      expected_pipeline_exit: 'nonzero',
      expected_evidence: expectedEvidence,
    },
  });
  const runConfigPath = path.join(swarmDir, 'run-config.json');
  writeJson(runConfigPath, {});
  if (stageId) {
    writeJson(path.join(runRoot, 'events.jsonl'), {
      entry: {
        type: 'attempt.completed',
        identity: { stageId, attemptId: 'attempt:test' },
        payload: { outcome: 'blocked', reason },
      },
    });
    fs.appendFileSync(path.join(runRoot, 'events.jsonl'), `${JSON.stringify({
      entry: {
        type: stageTerminal,
        identity: { stageId },
        payload: { reason },
      },
    })}\n`);
  }
  fs.appendFileSync(path.join(runRoot, 'events.jsonl'), `${JSON.stringify({
    entry: { type: terminal, payload: { reason } },
  })}\n`);
  return {
    root,
    workspace: {
      swarmDir,
      worktreePath: root,
      projectSrc: root,
      runConfigPath,
    },
  };
}

test('native subagent tool evidence requires exact causal pairing', () => {
  assert.equal(verifyNativeSubagentToolPairs(pairedToolEvents()).ok, true);
  assert.equal(
    verifyNativeSubagentToolPairs(pairedToolEvents({ finish: { session_key: 'other' } })).ok,
    false,
  );
  assert.equal(verifyNativeSubagentToolPairs([pairedToolEvents()[0]]).ok, false);
});

test('every expected nonzero scenario retains an explicit typed failure contract', t => {
  const previous = process.env.KUBECLAW_REGISTRY_CONFIG;
  process.env.KUBECLAW_REGISTRY_CONFIG = registryTestContract;
  t.after(() => {
    if (previous === undefined) delete process.env.KUBECLAW_REGISTRY_CONFIG;
    else process.env.KUBECLAW_REGISTRY_CONFIG = previous;
  });
  for (const id of listRealE2EScenarioIds()) {
    const scenario = resolveRealE2EScenario(id);
    if (scenario.expectedPipelineExit !== 'nonzero') continue;
    const contract = expectedFailureContractForScenario(scenario);
    assert.equal(contract.schemaVersion, 'real-e2e-failure-expectation.v2', id);
    assert.equal(Object.hasOwn(contract, 'expectedStageId'), true, id);
    assert.equal(Array.isArray(contract.allowedRunEventTypes), true, id);
    assert.equal(Array.isArray(contract.allowedStageEventTypes), true, id);
  }
});

test('success evidence fails closed when the canonical v2 result is absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-evidence-missing-'));
  try {
    const evidence = await verifyRealRunEvidence({ swarmDir: path.join(root, '.swarm') });
    assert.equal(evidence.ok, false);
    assert.equal(evidence.failures[0].reason, 'REAL_E2E_V2_RESULT_MISSING');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure evidence accepts only canonical v2 terminal evidence on Spark', async () => {
  const fixture = workspaceWithV2Result();
  try {
    const evidence = await verifyExpectedFailureEvidence(
      fixture.workspace,
      resolveRealE2EScenario('architecture-validator-block'),
    );
    assert.equal(evidence.ok, true, JSON.stringify(evidence.failures));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('failure evidence rejects a v2 result that claims success', async () => {
  const fixture = workspaceWithV2Result({ status: 'succeeded', terminal: 'run.succeeded' });
  try {
    const evidence = await verifyExpectedFailureEvidence(
      fixture.workspace,
      resolveRealE2EScenario('architecture-validator-block'),
    );
    assert.equal(evidence.ok, false);
    assert.equal(evidence.failures.some((failure) => failure.reason === 'REAL_E2E_UNEXPECTED_SUCCESS'), true);
    assert.equal(
      evidence.failures.some((failure) => failure.reason === 'REAL_E2E_V2_TERMINAL_FAILURE_EVENT_MISMATCH'),
      true,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('failure evidence rejects an unrelated v2 scenario or stage failure', async () => {
  const fixture = workspaceWithV2Result({
    scenarioId: 'buster-module-failure',
    expectedEvidence: 'buster_module_failure',
    stageId: 'buster-01-nginx',
    stageTerminal: 'stage.failed',
    reason: 'test_failure',
  });
  try {
    const evidence = await verifyExpectedFailureEvidence(
      fixture.workspace,
      resolveRealE2EScenario('architecture-validator-block'),
    );
    assert.equal(evidence.ok, false);
    assert.equal(
      evidence.failures.some((failure) => failure.reason === 'REAL_E2E_V2_FAILURE_SCENARIO_MISMATCH'),
      true,
    );
    assert.equal(
      evidence.failures.some((failure) => failure.reason === 'REAL_E2E_V2_FAILURE_STAGE_MISMATCH'),
      true,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('failure evidence rejects a later unrelated terminal cause', async () => {
  const fixture = workspaceWithV2Result();
  const runRoot = path.join(
    fixture.workspace.swarmDir,
    'v2-runtime',
    'runs',
    'run_v2-evidence',
  );
  const eventPath = path.join(runRoot, 'events.jsonl');
  const records = fs.readFileSync(eventPath, 'utf8').trim().split('\n').map(JSON.parse);
  records.splice(records.length - 1, 0, {
    entry: {
      type: 'stage.failed',
      identity: { stageId: 'forge-01-nginx' },
      payload: { reason: 'unrelated failure' },
    },
  });
  fs.writeFileSync(eventPath, `${records.map(JSON.stringify).join('\n')}\n`);
  try {
    const evidence = await verifyExpectedFailureEvidence(
      fixture.workspace,
      resolveRealE2EScenario('architecture-validator-block'),
    );
    assert.equal(evidence.ok, false);
    assert.equal(
      evidence.failures.some((failure) => failure.reason === 'REAL_E2E_V2_TERMINAL_CAUSE_MISMATCH'),
      true,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
