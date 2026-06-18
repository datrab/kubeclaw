import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { MalformedBusterTaskError, validateBusterTaskPayload } from '../../../../../skills/buster/pipeline/services/task-validation.ts';

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
