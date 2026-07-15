import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { pollForgeCompletion, pollGeneric } from '../../../../../skills/nova/pipeline/services/polling.ts';
import { archiveForgeCompletionArtifact } from '../../../../../skills/nova/pipeline/services/forge-completion.ts';
import { waitForModuleBusterCompletion } from '../../../../../skills/nova/pipeline/services/polling-dual.ts';
import { createRedisCompletionEventAdapter } from '../../../../../skills/nova/pipeline/services/completion-event-adapters.ts';
import { loadLifecycleReadModels, saveLifecycleReadModels } from '../../../../../skills/nova/pipeline/services/status-store-lifecycle.ts';
import { trackAgent, untrackAgent } from '../../../../../skills/nova/pipeline/agents/lifecycle.ts';

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
      project_src_dir: root,
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
    },
    buster: {
      runtime: {
        heartbeat_interval_ms: 1,
        task_poll_interval_ms: 1,
        task_pending_reclaim_idle_ms: 1,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 1,
        task_stream_max_len: 1,
      },
    },
    redis_completion: { archive_max_len: 1000, tail_scan_batch_size: 100, tail_scan_limit: 1000 },
    event_adapters: {
      local_evidence_debounce_ms: 1,
      approval_signal_debounce_ms: 1,
    },
    gateway: {
      invoke: {
        session_status: { timeout_ms: 1 },
        retry: { max_attempts: 1, retry_delay_ms: 1 },
      },
    },
    agent_observability: {
      forge_completion: { xread_block_ms: 1, settle_ms: 0 },
    },
    acp_monitor: {
      poll_limit: 1,
      max_transcript_extensions: 0,
      transcript_grace_ms: 0,
      monitor_poll_ms: 1,
    },
    polling: {
      interval_seconds: 1,
      progress_interval_ms: 1,
      session_end_grace_ms: 0,
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

function createNoopLocalEvidenceEventAdapter() {
  return {
    start() { return { watching: 0, paths: [] }; },
    stop() {},
  };
}

function forgeCompletionArtifact(overrides = {}) {
  return {
    artifact_type: 'forge_completion',
    run_id: 'run-test',
    module_id: 'module-a-dir',
    attempt: 1,
    status: 'READY_FOR_TESTING',
    summary: 'ready now',
    evidence: {
      inspected_files: ['Dockerfile'],
      consulted_contracts: ['.swarm/contracts/module-outputs/module-a.json'],
      implementation_notes: 'owned files already satisfy the module contract',
    },
    completed_at: '2026-06-20T12:05:24Z',
    ...overrides,
  };
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
    polling: {
      interval_seconds: 1,
      progress_interval_ms: 1,
      session_end_grace_ms: 0,
    },
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

test('pollForgeCompletion normalizes missing Forge completion envelope identity fields', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify({
    status: 'READY_FOR_TESTING',
    summary: 'ready with repairable envelope',
    evidence: {
      inspected_files: ['Dockerfile'],
      consulted_contracts: ['.swarm/contracts/module-outputs/module-a.json'],
      implementation_notes: 'the completion omitted only canonical envelope identity fields',
    },
    completed_at: '2026-07-15T00:00:00Z',
  }, null, 2));

  const result = await pollForgeCompletion(config, moduleDir, 1, { runId: 'run-test', moduleId: moduleDir, attempt: 2 });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'forge_completion');
  assert.equal(result.status?.normalized, true);
  assert.deepEqual(result.status?.normalized_fields, ['artifact_type', 'run_id', 'module_id', 'attempt']);
  const normalized = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'forge-completion.json'), 'utf8'));
  assert.equal(normalized.artifact_type, 'forge_completion');
  assert.equal(normalized.run_id, 'run-test');
  assert.equal(normalized.module_id, moduleDir);
  assert.equal(normalized.attempt, 2);
});

test('pollForgeCompletion does not normalize wrong Forge completion identity values', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({
    run_id: 'wrong-run',
    module_id: moduleDir,
    attempt: 2,
  }), null, 2));

  const result = await pollForgeCompletion(config, moduleDir, 1, { runId: 'run-test', moduleId: moduleDir, attempt: 2 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_forge_completion');
  assert.deepEqual(result.status?.status_errors, ["run_id must be 'run-test' (got 'wrong-run')"]);
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

    async xrevrange() {
      return [];
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
        completionEventAdapters: {
          RedisCtor: FakeRedis,
          redisOptions: { host: '127.0.0.1', port: '6379', enforceSecureMode: false },
          createRedisCompletionEventAdapter,
          createLocalEvidenceEventAdapter: createNoopLocalEvidenceEventAdapter,
        },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.status, null);
});

test('module completion wait does not require gateway label in Redis completion events', async (t) => {
  class FakeRedis {
    constructor() {
      this.calls = 0;
      this.waiting = null;
    }

    on() {}

    async xread() {
      this.calls += 1;
      if (this.calls === 1) {
        return completionXreadResult('2-0', {
          _id: '2-0',
          schema_version: 'v1',
          type: 'completion',
          stream_role: 'completion',
          project: 'module-completion-test',
          target_kind: 'module',
          target_id: 'module-a',
          module: 'module-a',
          status: 'FAIL',
          outcome: 'FAIL',
          failure_class: 'verdict_fail',
          source: 'buster-pipeline',
          run_id: 'run-test',
          attempt: '1',
          dispatch_id: 'dispatch-test',
          timestamp: '2026-06-03T00:00:00.000Z',
        });
      }
      return new Promise((resolve) => {
        this.waiting = resolve;
      });
    }

    async xrevrange() {
      return [];
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
  saveModuleStatus(config, moduleId, moduleDir, 'FAIL');

  const result = await waitForModuleBusterCompletion(
    config,
    moduleDir,
    moduleId,
    ['PASS', 'FAIL', 'BLOCKED'],
    0.01,
    {
      run_id: 'run-test',
      attempt: 1,
      dispatch_id: 'dispatch-test',
      gateway_label: 'buster-module-a-dispatch-test',
    },
    (ok, reason, status = null, extra = {}) => ({ ok, reason, status, ...extra }),
    {
      deps: {
        completionEventAdapters: {
          RedisCtor: FakeRedis,
          redisOptions: { host: '127.0.0.1', port: '6379', enforceSecureMode: false },
          createRedisCompletionEventAdapter,
          createLocalEvidenceEventAdapter: createNoopLocalEvidenceEventAdapter,
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.failure_class, 'verdict_fail');
  assert.equal(result.status?.failure_class, 'verdict_fail');
  assert.equal(result.status?._redis_entry?._id, '2-0');
});

test('module completion wait recovers canonical Redis completion from tail scan when live stream delivery is missed', async (t) => {
  class FakeRedis {
    constructor() {
      this.waiting = null;
    }
    on() {}
    async xread() {
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
  saveModuleStatus(config, moduleId, moduleDir, 'TESTING');

  const result = await waitForModuleBusterCompletion(
    config,
    moduleDir,
    moduleId,
    ['PASS', 'FAIL', 'BLOCKED'],
    0.01,
    {
      run_id: 'run-test',
      attempt: 1,
      dispatch_id: 'dispatch-test',
      session_key: 'session-test',
    },
    (ok, reason, status = null, extra = {}) => ({ ok, reason, status, ...extra }),
    {
      deps: {
        completionEventAdapters: {
          RedisCtor: FakeRedis,
          redisOptions: { host: '127.0.0.1', port: '6379', enforceSecureMode: false },
        },
        createDedicatedRedisCompletionClient: () => ({
          on() {},
          disconnect() {},
        }),
        scanLatestCompletionFromTail: async () => ({
          match: {
            _id: '5-0',
            schema_version: 'v1',
            type: 'completion',
            stream_role: 'completion',
            project: 'module-completion-test',
            target_kind: 'module',
            target_id: 'module-a',
            module: 'module-a',
            status: 'PASS',
            outcome: 'PASS',
            source: 'buster-pipeline',
            run_id: 'run-test',
            attempt: '1',
            dispatch_id: 'dispatch-test',
            session_key: 'session-test',
            timestamp: '2026-06-24T00:00:00.000Z',
          },
          scanned: 1,
          batches: 1,
          truncated: false,
        }),
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'target_reached');
  assert.equal(result.status?.status, 'PASS');
  assert.equal(result.status?._source, 'redis');
  assert.equal(result.status?._redis_entry?._id, '5-0');
});

test('pollForgeCompletion accepts a valid forge completion artifact without waiting for session end', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({ module_id: moduleDir }), null, 2));

  const result = await pollForgeCompletion(config, moduleDir, 1, { runId: 'run-test', moduleId: moduleDir, attempt: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'forge_completion');
  assert.equal(result.status?.status, 'READY_FOR_TESTING');
  assert.equal(result.status?.source, 'forge_completion_artifact');
  assert.equal(result.status?.summary, 'ready now');
});

test('pollForgeCompletion returns typed rate limit status from monitored Forge transcript', async (t) => {
  const config = makeModuleCompletionConfig();
  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  const streamLogPath = path.join(config.repo_root, 'forge-rate-limit.jsonl');
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(streamLogPath, `${JSON.stringify({
    kind: 'lifecycle',
    phase: 'error',
    ts: '2026-06-20T12:05:24Z',
    text: 'Codex usage limit reached; retry after cooldown',
  })}\n`);
  trackAgent(config, 'forge-module-a', 'agent:forge:rate-limit', 'agent-id', 'gateway-forge-rate', streamLogPath, {
    module_id: moduleDir,
    run_id: 'run-test',
    attempt: 1,
    dispatch_id: 'forge-dispatch-1',
  });
  t.after(() => {
    untrackAgent('forge-module-a');
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const result = await pollForgeCompletion(config, moduleDir, 1, {
    runId: 'run-test',
    moduleId: moduleDir,
    attempt: 1,
    dispatchId: 'forge-dispatch-1',
    sessionLabel: 'forge-module-a',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.status?.status, 'RATE_LIMITED');
  assert.equal(result.status?.module_id, moduleDir);
  assert.equal(result.status?.dispatch_id, 'forge-dispatch-1');
  assert.equal(result.status?.session_key, 'agent:forge:rate-limit');
});

test('pollForgeCompletion accepts a valid artifact written at the timeout edge', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });

  const timer = setTimeout(() => {
    fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({
      module_id: moduleDir,
      summary: 'ready at timeout edge',
    }), null, 2));
  }, 25);
  t.after(() => clearTimeout(timer));

  const result = await pollForgeCompletion(config, moduleDir, 0.001, { runId: 'run-test', moduleId: moduleDir, attempt: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'forge_completion');
  assert.equal(result.status?.status, 'READY_FOR_TESTING');
  assert.equal(result.status?.summary, 'ready at timeout edge');
});

test('pollForgeCompletion rejects stale forge completion identity', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({
    run_id: 'old-run',
    module_id: moduleDir,
    summary: 'stale success',
  }), null, 2));

  const result = await pollForgeCompletion(config, moduleDir, 1, { runId: 'run-test', moduleId: moduleDir, attempt: 2 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_forge_completion');
  assert.equal(result.status?.status, 'FAIL');
  assert.deepEqual(result.status?.status_errors, [
    "run_id must be 'run-test' (got 'old-run')",
    "attempt must be '2' (got '1')",
  ]);
});

test('archived stale forge completion cannot satisfy a fresh attempt', async (t) => {
  const config = makeModuleCompletionConfig();
  t.after(() => {
    fs.rmSync(config.repo_root, { recursive: true, force: true });
  });

  const moduleDir = 'module-a-dir';
  const moduleRoot = path.join(config.paths.modules_dir, moduleDir);
  fs.mkdirSync(moduleRoot, { recursive: true });
  fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({
    module_id: moduleDir,
    summary: 'stale success',
  }), null, 2));

  const archivePath = archiveForgeCompletionArtifact(config, moduleDir, 2);
  assert.equal(path.basename(archivePath), 'forge-completion.stale-before-attempt-2.json');
  assert.equal(fs.existsSync(path.join(moduleRoot, 'forge-completion.json')), false);

  const timer = setTimeout(() => {
    fs.writeFileSync(path.join(moduleRoot, 'forge-completion.json'), JSON.stringify(forgeCompletionArtifact({
      module_id: moduleDir,
      attempt: 2,
      summary: 'fresh success',
      completed_at: '2026-06-20T12:05:25Z',
    }), null, 2));
  }, 25);
  t.after(() => clearTimeout(timer));

  const result = await pollForgeCompletion(config, moduleDir, 0.001, { runId: 'run-test', moduleId: moduleDir, attempt: 2 });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'forge_completion');
  assert.equal(result.status?.attempt, 2);
  assert.equal(result.status?.summary, 'fresh success');
});
