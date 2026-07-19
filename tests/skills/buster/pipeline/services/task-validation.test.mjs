import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { MalformedBusterTaskError, validateBusterTaskPayload } from '../../../../../skills/buster/pipeline/services/task-validation.ts';
import { BUSTER_CAPABILITIES } from '../../../../../skills/buster/pipeline/services/capabilities.ts';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Buster Test',
      GIT_AUTHOR_EMAIL: 'buster@example.test',
      GIT_COMMITTER_NAME: 'Buster Test',
      GIT_COMMITTER_EMAIL: 'buster@example.test',
    },
  }).trim();
}

function validPayload(overrides = {}) {
  return {
    task_type: 'module_test',
    module_id: 'mod',
    project: 'project',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
    completion_stream: 'swarm:pipeline:project:completions',
    commit_hash: 'abc123',
    output_file: 'logs/buster-output.json',
    stage_id: 'worker:module_buster',
    worker_type: 'module_buster',
    timeout_seconds: 60,
    session: {
      runtime: 'acp',
      model: 'model',
      agentId: 'agent',
      cwd: process.cwd(),
      label: 'dispatch',
    },
    suites: ['unit'],
    test_config: { suite_timeout_ms: 5000 },
    capabilities: [],
    ...overrides,
  };
}

test('validateBusterTaskPayload accepts session.cwd in the current repository', () => {
  assert.equal(validateBusterTaskPayload(validPayload()).moduleId, 'mod');
});

test('validateBusterTaskPayload accepts session.cwd in a linked module worktree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-linked-worktree-'));
  const repoRoot = path.join(root, 'repo');
  const moduleWorktree = path.join(root, 'worktrees', 'module-02');
  fs.mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ['init', '-b', 'main']);
  git(repoRoot, ['config', 'user.name', 'Buster Test']);
  git(repoRoot, ['config', 'user.email', 'buster@example.test']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'seed\n');
  git(repoRoot, ['add', 'README.md']);
  git(repoRoot, ['commit', '-m', 'seed']);
  fs.mkdirSync(path.dirname(moduleWorktree), { recursive: true });
  git(repoRoot, ['worktree', 'add', '-b', 'module-02', moduleWorktree, 'HEAD']);

  const priorRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoRoot;
  try {
    assert.equal(validateBusterTaskPayload(validPayload({
      session: { ...validPayload().session, cwd: moduleWorktree },
    })).moduleId, 'mod');
  } finally {
    if (priorRepoRoot === undefined) delete process.env.REPO_ROOT;
    else process.env.REPO_ROOT = priorRepoRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateBusterTaskPayload accepts canonical kubernetes capability', () => {
  const identity = validateBusterTaskPayload(validPayload({
    task_type: 'gate_test',
    module_id: 'final-buster',
    gate_id: 'final-buster',
    stage_id: 'gate:buster',
    worker_type: undefined,
    suites: ['k8s'],
    capabilities: [
      BUSTER_CAPABILITIES.IMAGE_BUILD,
      BUSTER_CAPABILITIES.KUBERNETES,
    ],
  }));
  assert.equal(identity.taskType, 'gate_test');
  assert.deepEqual(identity.capabilities, ['image_build', 'kubernetes']);
});

test('validateBusterTaskPayload rejects unsupported capability names', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ capabilities: ['image_build', 'magic_cluster'] })),
    (error) => error instanceof MalformedBusterTaskError
      && error.details.reason === 'unsupported_capabilities'
      && error.details.unsupported_capabilities.includes('magic_cluster'),
  );
});

test('validateBusterTaskPayload rejects absolute session.cwd outside the current repository', () => {
  const outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-cwd-outside-'));
  execFileSync('git', ['init'], { cwd: outsideRepo, stdio: 'ignore' });

  assert.throws(
    () => validateBusterTaskPayload(validPayload({ session: { ...validPayload().session, cwd: outsideRepo } })),
    (error) => error instanceof MalformedBusterTaskError
      && error.unsafe_fields.some(entry => entry.field === 'session.cwd'),
  );
});

test('validateBusterTaskPayload rejects parent-traversing session.cwd', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ session: { ...validPayload().session, cwd: '../other-repo' } })),
    (error) => error instanceof MalformedBusterTaskError
      && error.unsafe_fields.some(entry => entry.field === 'session.cwd'),
  );
});

test('validateBusterTaskPayload requires typed test_config suite timeout policy', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ test_config: undefined })),
    (error) => error instanceof MalformedBusterTaskError
      && error.missing_fields.includes('test_config'),
  );
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ test_config: { suite_timeout_ms: 0 } })),
    (error) => error instanceof MalformedBusterTaskError
      && error.missing_fields.includes('test_config.suite_timeout_ms'),
  );
});

test('validateBusterTaskPayload rejects shorthand serve image references', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({
      test_config: {
        suite_timeout_ms: 5000,
        serve: { image: 'node:20-slim' },
      },
    })),
    (error) => error instanceof MalformedBusterTaskError
      && error.details.reason === 'invalid_serve_image_reference'
      && error.details.invalid_fields[0].field === 'test_config.serve.image',
  );
  assert.equal(validateBusterTaskPayload(validPayload({
    test_config: {
      suite_timeout_ms: 5000,
      serve: { image: 'docker.io/library/node:20-slim' },
    },
  })).moduleId, 'mod');
});

test('validateBusterTaskPayload requires completion_stream identity', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ completion_stream: undefined })),
    (error) => error instanceof MalformedBusterTaskError
      && error.missing_fields.includes('completion_stream'),
  );
});

test('validateBusterTaskPayload accepts the canonical agent_judgment policy shape', () => {
  assert.equal(validateBusterTaskPayload(validPayload({
    agent_judgment: {
      required: false,
      reason: 'deterministic_suites_authoritative',
    },
  })).moduleId, 'mod');
});

test('validateBusterTaskPayload rejects malformed agent_judgment policy', () => {
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ agent_judgment: true })),
    (error) => error instanceof MalformedBusterTaskError
      && error.details.reason === 'invalid_agent_judgment_shape',
  );
  assert.throws(
    () => validateBusterTaskPayload(validPayload({ agent_judgment: { required: 'yes' } })),
    (error) => error instanceof MalformedBusterTaskError
      && error.details.reason === 'invalid_agent_judgment_required',
  );
});
