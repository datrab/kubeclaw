#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureBusterOutputFile,
  resolveBusterAgentResult,
  resolveBusterOutputFilePath,
  writeBusterOutputFile,
} from '../../../skills/buster/pipeline/services/pipeline-helpers.ts';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

const previousRepoRoot = process.env.REPO_ROOT;
const previousCwd = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-output-artifact-contract-'));
const repo = path.join(root, 'repo');

try {
  fs.mkdirSync(repo, { recursive: true });
  git(['init'], repo);
  git(['config', 'user.email', 'buster-output-contract@example.test'], repo);
  git(['config', 'user.name', 'Buster Output Contract'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# output artifact contract\n');
  git(['add', 'README.md'], repo);
  git(['commit', '-m', 'fixture'], repo);
  process.env.REPO_ROOT = repo;
  process.chdir(repo);

  const payload = {
    task_type: 'module_test',
    project: 'artifact-contract',
    module_id: '01-output',
    run_id: 'run-output',
    attempt: 3,
    dispatch_id: 'dispatch-output',
    output_file: '.swarm/modules/01-output/buster-output.json',
  };

  const outputPath = resolveBusterOutputFilePath(payload);
  assert.equal(outputPath, path.join(repo, payload.output_file));

  assert.throws(
    () => resolveBusterOutputFilePath({ ...payload, output_file: path.join(repo, 'absolute.json') }),
    /repository-relative/,
    'Buster output_file must not be absolute',
  );
  assert.throws(
    () => resolveBusterOutputFilePath({ ...payload, output_file: '../escape.json' }),
    /outside|scope|parent|escape/i,
    'Buster output_file must not escape the repository',
  );

  const writtenPath = writeBusterOutputFile(payload, {
    status: 'PASS',
    summary: 'valid pass',
    completed_at: '2026-06-16T00:00:00.000Z',
  });
  assert.equal(writtenPath, outputPath);
  const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(artifact.artifact_type, 'buster_output');
  assert.equal(artifact.task_type, payload.task_type);
  assert.equal(artifact.module_id, payload.module_id);
  assert.equal(artifact.run_id, payload.run_id);
  assert.equal(artifact.attempt, String(payload.attempt));
  assert.equal(artifact.dispatch_id, payload.dispatch_id);
  assert.equal(artifact.completion_key, `${payload.run_id}:${payload.attempt}:${payload.dispatch_id}`);
  assert.equal(artifact.status, 'PASS');

  const validResult = resolveBusterAgentResult(payload, { terminal: true });
  assert.equal(validResult.outcome, 'PASS');
  assert.equal(validResult.reason, 'output_file_pass');
  assert.equal(validResult.source, 'output_file');

  fs.rmSync(outputPath, { force: true });
  const missingResult = resolveBusterAgentResult(payload, { terminal: true });
  assert.equal(missingResult.outcome, 'FAIL');
  assert.equal(missingResult.reason, 'output_file_missing');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, '{not json');
  const invalidJsonResult = resolveBusterAgentResult(payload, { terminal: true });
  assert.equal(invalidJsonResult.outcome, 'FAIL');
  assert.equal(invalidJsonResult.reason, 'output_file_invalid_json');

  fs.writeFileSync(outputPath, JSON.stringify({
    artifact_type: 'buster_output',
    run_id: 'run-stale',
    attempt: '1',
    dispatch_id: 'dispatch-stale',
    completion_key: 'run-stale:1:dispatch-stale',
    status: 'PASS',
    summary: 'stale pass must not count',
  }, null, 2));
  const staleResult = resolveBusterAgentResult(payload, { terminal: true });
  assert.equal(staleResult.outcome, 'FAIL');
  assert.equal(staleResult.reason, 'output_file_identity_mismatch');
  assert.match(staleResult.summary, /run_id|attempt|dispatch_id/);

  const replacement = ensureBusterOutputFile(payload, {
    outcome: 'FAIL',
    reason: 'terminal_agent_error_without_valid_output',
    summary: 'terminal agent error cannot pass without valid output',
  });
  assert.equal(replacement.source, 'written');
  assert.equal(replacement.replaced_reason, 'output_file_identity_mismatch');
  const replacedArtifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(replacedArtifact.status, 'FAIL');
  assert.equal(replacedArtifact.run_id, payload.run_id);
  assert.equal(replacedArtifact.dispatch_id, payload.dispatch_id);
  assert.match(replacedArtifact.reason, /^output_file_identity_mismatch:/);

  console.log(JSON.stringify({
    ok: true,
    contract: 'buster-output-artifact-authority',
    repo,
    output_file: payload.output_file,
    run_id: payload.run_id,
    attempt: payload.attempt,
    dispatch_id: payload.dispatch_id,
  }, null, 2));
} finally {
  process.chdir(previousCwd);
  if (previousRepoRoot === undefined) delete process.env.REPO_ROOT;
  else process.env.REPO_ROOT = previousRepoRoot;
  fs.rmSync(root, { recursive: true, force: true });
}
