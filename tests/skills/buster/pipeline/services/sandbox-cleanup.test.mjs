import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { cleanupSandboxResources, getCleanupStatePath } from '../../../../../skills/buster/pipeline/services/sandbox-cleanup.ts';

const execFileAsync = promisify(execFile);

function scopedPayload() {
  return {
    project: 'project',
    module_id: 'module',
    run_id: 'run',
    attempt: 1,
    dispatch_id: 'dispatch',
  };
}

function createSandboxRoot(t) {
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-cleanup-'));
  fs.mkdirSync(path.join(sandboxRoot, 'www'), { recursive: true });
  fs.mkdirSync(path.join(sandboxRoot, 'results'), { recursive: true });
  fs.writeFileSync(path.join(sandboxRoot, 'www', 'other-task.txt'), 'served');
  fs.writeFileSync(path.join(sandboxRoot, 'results', 'other-task.txt'), 'result');
  t.after(() => fs.rmSync(sandboxRoot, { recursive: true, force: true }));
  return sandboxRoot;
}

test('task-scoped pre cleanup leaves shared outputs and nginx alone', async (t) => {
  const sandboxRoot = createSandboxRoot(t);
  const execCalls = [];

  const result = await cleanupSandboxResources('pre', scopedPayload(), {
    sandboxRoot,
    async execFileAsync(command, args) {
      execCalls.push([command, args]);
      return { stdout: '' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cleanup_policy.name, 'task_scoped');
  assert.equal(result.cleanup_policy.sandbox_outputs, false);
  assert.equal(result.cleanup_policy.process_cleanup, false);
  assert.deepEqual(result.cleaned.sandbox_paths, []);
  assert.equal(result.cleaned.nginx_stopped, false);
  assert.equal(fs.existsSync(path.join(sandboxRoot, 'www', 'other-task.txt')), true);
  assert.equal(fs.existsSync(path.join(sandboxRoot, 'results', 'other-task.txt')), true);
  assert.equal(execCalls.some(([command]) => command === 'nginx'), false);
});

test('task-scoped final cleanup leaves global nginx alone', async (t) => {
  const sandboxRoot = createSandboxRoot(t);
  const execCalls = [];

  const result = await cleanupSandboxResources('final', scopedPayload(), {
    sandboxRoot,
    async execFileAsync(command, args) {
      execCalls.push([command, args]);
      return { stdout: '' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cleanup_policy.name, 'task_scoped');
  assert.equal(result.cleanup_policy.process_cleanup, false);
  assert.equal(result.cleaned.nginx_stopped, false);
  assert.equal(execCalls.some(([command]) => command === 'nginx'), false);
});

test('trackSandboxResources preserves resources tracked concurrently for the same scope', async (t) => {
  const sandboxRoot = createSandboxRoot(t);
  const payload = scopedPayload();
  const moduleUrl = new URL('../../../../../skills/buster/pipeline/services/sandbox-cleanup.ts', import.meta.url).href;
  const indexes = Array.from({ length: 16 }, (_value, index) => index);
  const childScript = `
    const { trackSandboxResources } = await import(${JSON.stringify(moduleUrl)});
    const index = process.env.TEST_RESOURCE_INDEX;
    trackSandboxResources(
      JSON.parse(process.env.TEST_PAYLOAD),
      {
        containers: ['container-' + index],
        images: ['image-' + index + ':latest'],
        namespaces: ['test-ns-' + index],
      },
      { sandboxRoot: process.env.TEST_SANDBOX_ROOT },
    );
  `;

  await Promise.all(indexes.map((index) => execFileAsync(process.execPath, ['--input-type=module', '-e', childScript], {
    env: {
      ...process.env,
      TEST_PAYLOAD: JSON.stringify(payload),
      TEST_RESOURCE_INDEX: String(index),
      TEST_SANDBOX_ROOT: sandboxRoot,
    },
  })));

  const state = JSON.parse(fs.readFileSync(getCleanupStatePath(payload, { sandboxRoot }), 'utf8'));
  assert.deepEqual([...state.containers].sort(), indexes.map((index) => `container-${index}`).sort());
  assert.deepEqual([...state.images].sort(), indexes.map((index) => `image-${index}:latest`).sort());
  assert.deepEqual([...state.namespaces].sort(), indexes.map((index) => `test-ns-${index}`).sort());
});
