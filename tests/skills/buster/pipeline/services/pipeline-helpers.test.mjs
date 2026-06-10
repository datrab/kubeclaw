import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
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
