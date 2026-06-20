import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { pollForgeCompletion, pollGeneric } from '../../../../../skills/nova/pipeline/services/polling.ts';
import { waitForModuleBusterCompletion } from '../../../../../skills/nova/pipeline/services/polling-dual.ts';
import { loadLifecycleReadModels, saveLifecycleReadModels } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle.ts';

function completionXreadResult(id, fields) {
  return [['completion-stream', [[id, Object.entries(fields).flatMap(([key, value]) => [key, value])]]]];
}

function makeModuleCompletionConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-completion-test-'));
  const swarmDir = path.join(root, '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(modulesDir, { recursive: true });
  return {
    project: 'module-completion-test',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    _runId: 'run-test',
    run_id: 'run-test',
  };
}

function saveModuleStatus(config, moduleId, moduleDir, status) {
  const readModels = loadLifecycleReadModels(config);
  readModels.modules[moduleId] = {
    module_id: moduleId,
    module_dir: moduleDir,
    status,
    current_phase: 'buster',
    latest_event_at: '2026-06-03T00:00:00.000Z',
    latest_event_type: 'module.status_changed',
  };
  saveLifecycleReadModels(config, readModels);
}

test('pollGeneric preserves rate-limit lifecycle mutation metadata', async () => {
  const lifecycleMutation = {
    eventType: 'module.status_changed',
    lifecycleIntent: 'transition',
  };
  const status = {
    module_id: 'module-a',
    status: 'RATE_LIMITED',
  };

  const result = await pollGeneric({
    poll_interval_seconds: 1,
  }, async () => ({
    rate_limited: true,
    status,
    lifecycleMutation,
  }), 1, 'rate-limit-test');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.status, status);
  assert.equal(result.lifecycleMutation, lifecycleMutation);
});

test('module completion wait preserves attempt zero in event identity', async (t) => {
  class FakeRedis {
    constructor() {
      this.calls = 0;
      this.waiting = null;
    }

    on() {}

    async xread() {
      this.calls += 1;
      if (this.calls === 1) {
        return completionXreadResult('1-0', {
          _id: '1-0',
          schema_version: 'v1',
          type: 'completion',
          stream_role: 'completion',
          project: 'module-completion-test',
          target_kind: 'module',
          target_id: 'module-a',
          module: 'module-a',
          status: 'FAIL',
          outcome: 'FAIL',
          source: 'buster-pipeline',
          run_id: 'run-test',
          attempt: '1',
          dispatch_id: 'dispatch-test',
          session_key: 'session-test',
          timestamp: '2026-06-03T00:00:00.000Z',
        });
      }
      return new Promise((resolve) => {
        this.waiting = resolve;
      });
    }

    disconnect() {
      this.waiting?.(null);
    }
  }

  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });
  const moduleId = 'module-a';
  const moduleDir = 'module-a-dir';
  fs.mkdirSync(path.join(config.paths.modules_dir, moduleDir), { recursive: true });
  saveModuleStatus(config, moduleId, moduleDir, 'PASS');

  const result = await waitForModuleBusterCompletion(
    config,
    moduleDir,
    moduleId,
    ['PASS', 'FAIL', 'BLOCKED'],
    0.001,
    {
      run_id: 'run-test',
      attempt: 0,
      dispatch_id: 'dispatch-test',
      session_key: 'session-test',
    },
    (ok, reason, status = null, extra = {}) => ({ ok, reason, status, ...extra }),
    {
      deps: {
        completionEventAdapters: { RedisCtor: FakeRedis },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.status, null);
});

test('pollForgeCompletion accepts a valid forge completion artifact without waiting for session end', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  config.poll_interval_seconds = 1;
  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify({
    artifact_type: 'forge_completion',
    status: 'READY_FOR_TESTING',
    summary: 'ready now',
    completed_at: '2026-06-20T12:05:24Z',
  }, null, 2));

  const result = await pollForgeCompletion(config, moduleDir, 1);

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'forge_completion');
  assert.equal(result.status?.status, 'READY_FOR_TESTING');
  assert.equal(result.status?.source, 'forge_completion_artifact');
  assert.equal(result.status?.summary, 'ready now');
});
