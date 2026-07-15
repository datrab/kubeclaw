import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildSessionSpawnEmbed,
  buildSessionCompleteEmbed,
  buildSuiteResultsEmbed,
  clearBusterOutputFile,
  ensureBusterOutputFile,
  resolveBusterAgentResult,
  resolveBusterOutputFilePath,
  writeBusterOutputFile,
} from '../../../../../skills/buster/pipeline/services/pipeline-helpers.ts';

function payload(overrides = {}) {
  return {
    task_type: 'module_test',
    module_id: 'mod',
    project: 'project',
    run_id: 'run-current',
    attempt: 2,
    dispatch_id: 'dispatch-current',
    output_file: path.join('.swarm', 'test-output', `buster-${Date.now()}-${Math.random()}.json`),
    ...overrides,
  };
}

function cleanup(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_error) {
    // Best-effort test cleanup.
  }
}

test('writeBusterOutputFile records task completion identity', () => {
  const task = payload();
  const outputPath = writeBusterOutputFile(task, { status: 'PASS', summary: 'current' });
  try {
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(artifact.run_id, task.run_id);
    assert.equal(artifact.attempt, String(task.attempt));
    assert.equal(artifact.dispatch_id, task.dispatch_id);
    assert.equal(artifact.completion_key, `${task.run_id}:${task.attempt}:${task.dispatch_id}`);
  } finally {
    cleanup(outputPath);
  }
});

test('resolveBusterAgentResult rejects a stale terminal output_file identity', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    run_id: 'run-old',
    attempt: '1',
    dispatch_id: 'dispatch-old',
    completion_key: 'run-old:1:dispatch-old',
    status: 'PASS',
    summary: 'old pass',
  }));

  try {
    const result = resolveBusterAgentResult(task, { terminal: true });
    assert.equal(result.outcome, 'FAIL');
    assert.equal(result.reason, 'output_file_identity_mismatch');
    assert.match(result.summary, /run_id/);
  } finally {
    cleanup(outputPath);
  }
});

test('clearBusterOutputFile removes stale target artifact before a new task run', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ status: 'PASS', summary: 'old pass' }));

  const result = clearBusterOutputFile(task);

  assert.equal(result.path, outputPath);
  assert.equal(result.removed, true);
  assert.equal(fs.existsSync(outputPath), false);
});

test('resolveBusterAgentResult accepts child-written output_file as agent verdict without pipeline identity', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    status: 'PASS',
    summary: 'fresh child pass',
    findings: [],
    completed_at: '2026-06-19T13:00:00Z',
  }));

  try {
    const result = resolveBusterAgentResult(task, { terminal: true });
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.reason, 'agent_verdict_pass');
    assert.equal(result.source, 'agent_verdict');
    assert.equal(artifact.run_id, undefined);
    assert.deepEqual(artifact.findings, []);
  } finally {
    cleanup(outputPath);
  }
});

test('ensureBusterOutputFile wraps child agent verdict in canonical task output', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    status: 'PASS',
    summary: 'fresh child pass',
    findings: [],
    completed_at: '2026-06-19T13:00:00Z',
  }));

  try {
    const result = ensureBusterOutputFile(task, {
      outcome: 'PASS',
      reason: 'agent_verdict_pass',
      summary: 'fresh child pass',
      source: 'agent_verdict',
      data: {
        agent_verdict: { status: 'PASS', summary: 'fresh child pass' },
      },
    });
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const verdictPath = path.join(path.dirname(outputPath), artifact.agent_verdict_file);
    const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(result.source, 'written');
    assert.equal(artifact.status, 'PASS');
    assert.equal(artifact.run_id, task.run_id);
    assert.equal(artifact.dispatch_id, task.dispatch_id);
    assert.equal(artifact.completion_key, `${task.run_id}:${task.attempt}:${task.dispatch_id}`);
    assert.equal(artifact.agent_verdict_status, 'PASS');
    assert.equal(verdict.artifact_type, 'buster_agent_verdict');
    assert.equal(verdict.verdict.summary, 'fresh child pass');
  } finally {
    cleanup(outputPath);
    cleanup(`${outputPath}.agent-verdict.json`);
  }
});

test('resolveBusterAgentResult keeps current output_file authority over later session cleanup failure', () => {
  const task = payload();
  const outputPath = writeBusterOutputFile(task, {
    status: 'PASS',
    summary: 'agent reviewed and passed deterministic evidence',
  });

  try {
    const result = resolveBusterAgentResult(task, {
      terminal: true,
      reason: 'session_terminal',
      detail: 'session stop reported terminal cleanup error after output',
      state: { sessionState: 'error' },
    });
    assert.deepEqual(result, {
      outcome: 'PASS',
      reason: 'output_file_pass',
      summary: 'agent reviewed and passed deterministic evidence',
      source: 'output_file',
    });
  } finally {
    cleanup(outputPath);
  }
});

test('ensureBusterOutputFile refuses a stale terminal output_file identity', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    run_id: 'run-old',
    attempt: '1',
    dispatch_id: 'dispatch-old',
    completion_key: 'run-old:1:dispatch-old',
    status: 'PASS',
    summary: 'old pass',
  }));

  try {
    const result = ensureBusterOutputFile(task, { outcome: 'FAIL', reason: 'current failure' });
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.source, 'existing');
    assert.match(result.reason, /output_file_identity_mismatch/);
    assert.equal(artifact.status, 'PASS');
    assert.equal(artifact.run_id, 'run-old');
    assert.equal(artifact.dispatch_id, 'dispatch-old');
    assert.equal(artifact.completion_key, 'run-old:1:dispatch-old');
  } finally {
    cleanup(outputPath);
  }
});

test('ensureBusterOutputFile lets supervisor-owned session failures replace stale child output', () => {
  const task = payload();
  const outputPath = resolveBusterOutputFilePath(task);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    run_id: 'run-old',
    attempt: '1',
    dispatch_id: 'dispatch-old',
    completion_key: 'run-old:1:dispatch-old',
    status: 'PASS',
    summary: 'old pass',
  }));

  try {
    const result = ensureBusterOutputFile(task, {
      outcome: 'FAIL',
      reason: 'agent_session_lifecycle_unstable',
      summary: 'Buster child session failed before canonical output',
      source: 'session_monitor',
    });
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.ok, true);
    assert.equal(result.source, 'written');
    assert.match(result.replaced_reason, /^supervisor_owned_failure:/);
    assert.equal(artifact.status, 'FAIL');
    assert.equal(artifact.reason, 'agent_session_lifecycle_unstable');
    assert.equal(artifact.run_id, task.run_id);
    assert.equal(artifact.dispatch_id, task.dispatch_id);
    assert.equal(artifact.completion_key, `${task.run_id}:${task.attempt}:${task.dispatch_id}`);
  } finally {
    cleanup(outputPath);
  }
});

test('suite results embed uses PASS/FAIL operator wording', () => {
  const passEmbed = buildSuiteResultsEmbed('01-foundation', 'project', {
    criticalFailed: false,
    suiteSummary: 'build passed; health passed',
    results: [
      { suite: 'build', status: 'PASS' },
      { suite: 'health', status: 'PASS' },
    ],
  });
  assert.equal(passEmbed.title, '✅ Suite Results: PASS — 01-foundation');
  assert.equal(passEmbed.fields.find((field) => field.name === 'Status')?.value, 'PASS');

  const failEmbed = buildSuiteResultsEmbed('01-foundation', 'project', {
    criticalFailed: true,
    suiteSummary: 'unit failed',
    results: [
      { suite: 'unit', status: 'FAIL', reason: 'expected button text was missing' },
    ],
  });
  assert.equal(failEmbed.title, '🚫 Suite Results: FAIL — 01-foundation');
  assert.equal(failEmbed.fields.find((field) => field.name === 'Status')?.value, 'FAIL');
});

test('suite results embed explains suite-only Buster completion', () => {
  const embed = buildSuiteResultsEmbed('01-foundation', 'project', {
    criticalFailed: false,
    suiteSummary: 'build passed; health passed',
    results: [
      { suite: 'build', status: 'PASS' },
      { suite: 'health', status: 'PASS' },
    ],
  }, {
    recommendation: 'NO_SUBAGENT',
    reason: 'deterministic suites passed; agent judgment not required',
    agent_judgment_required: false,
    agent_judgment_source: 'deterministic_suites_authoritative',
  });

  assert.equal(
    embed.fields.find((field) => field.name === 'Buster Agent')?.value,
    'Agent judgment disabled — deterministic suites are final authority',
  );
  assert.equal(
    embed.fields.find((field) => field.name === 'Decision Reason')?.value,
    'deterministic suites passed; agent judgment not required',
  );
});

test('suite results embed explains Buster agent spawn after deterministic suites', () => {
  const embed = buildSuiteResultsEmbed('01-foundation', 'project', {
    criticalFailed: false,
    suiteSummary: 'build passed; health passed',
    results: [
      { suite: 'build', status: 'PASS' },
      { suite: 'health', status: 'PASS' },
    ],
  }, {
    recommendation: 'SPAWN',
    reason: 'agent_judgment_required',
    agent_judgment_required: true,
    agent_judgment_source: 'agent_judgment_required',
  });

  assert.equal(
    embed.fields.find((field) => field.name === 'Buster Agent')?.value,
    'Agent judgment enabled — spawning after deterministic suites passed',
  );
});

test('session spawn embed names the Buster role', () => {
  const embed = buildSessionSpawnEmbed('01-foundation', 'project', {
    runtime: 'subagent',
    childSessionKey: 'agent:main:subagent:buster-session',
  });
  assert.equal(embed.title, '🚀 Buster Session Spawned: 01-foundation');
  assert.equal(embed.color, 3447003);
});

test('session complete embed names output contract failures', () => {
  const embed = buildSessionCompleteEmbed('01-foundation', 'project', {
    outcome: 'FAIL',
    reason: 'output_file_identity_mismatch:run_id',
    durationSeconds: 12,
    childSessionKey: 'session-1',
    source: 'output_file',
  });
  assert.equal(embed.title, '🚫 Buster Completion Contract Failed — 01-foundation');
  assert.equal(embed.fields.find((field) => field.name === 'Source')?.value, 'output_file');
});
