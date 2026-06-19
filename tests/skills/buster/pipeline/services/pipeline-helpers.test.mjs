import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildSessionSpawnEmbed,
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

test('resolveBusterAgentResult can stamp current identity onto child-written output_file', () => {
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
    const result = resolveBusterAgentResult(task, { terminal: true }, { repairOutputFileIdentity: true });
    const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.reason, 'output_file_pass');
    assert.equal(result.repaired_identity, true);
    assert.equal(artifact.run_id, task.run_id);
    assert.equal(artifact.attempt, String(task.attempt));
    assert.equal(artifact.dispatch_id, task.dispatch_id);
    assert.equal(artifact.completion_key, `${task.run_id}:${task.attempt}:${task.dispatch_id}`);
    assert.deepEqual(artifact.findings, []);
  } finally {
    cleanup(outputPath);
  }
});

test('ensureBusterOutputFile replaces a stale terminal output_file identity', () => {
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
    assert.equal(result.source, 'written');
    assert.equal(result.replaced_reason, 'output_file_identity_mismatch');
    assert.equal(artifact.status, 'FAIL');
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

test('session spawn embed names the Buster role', () => {
  const embed = buildSessionSpawnEmbed('01-foundation', 'project', {
    runtime: 'subagent',
    childSessionKey: 'agent:main:subagent:buster-session',
  });
  assert.equal(embed.title, '🚀 Buster Session Spawned: 01-foundation');
});
