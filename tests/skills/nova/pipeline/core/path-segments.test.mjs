import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadConfig, validateConfig } from '../../../../../skills/nova/pipeline/core/config.ts';
import {
  gateStatusPath,
  moduleBusterOutputPathRef,
  moduleBusterTestWorkspacePathRef,
  moduleLogDir,
} from '../../../../../skills/nova/pipeline/core/paths.ts';
import { createTempManager } from '../../../../../skills/nova/pipeline/core/temp.ts';

const removedReviewFailField = `on_${'n' + 'ogo'}`;

function observabilityConfig() {
  return {
    required: true,
    payload: { max_event_bytes: 3145728 },
    startup_evidence: { timeout_ms: 0, block_ms: 1 },
    forge_completion: { xread_block_ms: 1, settle_ms: 0 },
    streams: { stream_max_len: 1, dead_letter_max_len: 1 },
    plugin: {
      enabled: true,
      max_queue_per_stream: 1,
      control_write: { max_attempts: 1, retry_base_ms: 1, retry_max_ms: 1 },
      hook: { priority: 0, timeout_ms: 1 },
    },
    plugin_control: {
      enabled: true,
      pluginId: 'kubeclaw-agent-observer',
      command: 'openclaw',
      disableOnStop: true,
      timeout_ms: 1,
    },
    ingester: {
      enabled: true,
      groupName: 'kubeclaw-agent-observability-ingester',
      consumerName: 'kubeclaw-agent-observability-ingester-1',
      read_block_ms: 1,
      reclaim_idle_ms: 1,
      redis_command_timeout_ms: 1,
      loop: { delay_ms: 1, health_check_every: 0, stop_timeout_ms: 1 },
      trim: { interval_ms: 1, payload_stream_max_len: 1 },
      pressure: { control_lag_degraded_threshold: 0, payload_pressure_degraded_threshold: 0 },
    },
  };
}

function makeConfig() {
  const repoRoot = '/home/path-segment-test';
  const swarmDir = path.join(repoRoot, 'Projects/demo/src/.swarm');
  return {
    project: 'demo',
    repo_root: repoRoot,
    paths: {
      project_src_dir: path.join(repoRoot, 'Projects/demo/src'),
      swarm_dir: swarmDir,
      progress_file: path.join(swarmDir, 'progress.json'),
      modules_dir: path.join(swarmDir, 'modules'),
    },
    agents: {
      forge: { dispatch: 'acp', acp_agent_id: 'forge' },
      buster: { dispatch: 'acp', acp_agent_id: 'buster' },
      echo: { dispatch: 'acp', acp_agent_id: 'echo' },
    },
    fallback_model: 'model',
    pipeline_defaults: {
      timeout_minutes: 1,
      max_fails: 0,
      auto_retry_threshold: 0,
      agent_startup_retry_budget: 0,
      session_nudge_threshold: 0,
    },
    rate_limit: { cooldown_hours: 0, max_pauses_per_module: 0, cooldown_buffer_ms: 0 },
    polling: { interval_seconds: 1, progress_interval_ms: 1, session_end_grace_ms: 0 },
    locks: {
      lifecycle_append: { stale_ms: 1, timeout_ms: 1 },
      gate_active_session: { stale_ms: 1, timeout_ms: 1 },
      pipeline_run: { lease_ms: 1, heartbeat_ms: 1, mutation_stale_ms: 1, abort_settle_ms: 1 },
    },
    buster: {
      runtime: {
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1,
        task_poll_interval_ms: 1,
        task_pending_reclaim_idle_ms: 1,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 1,
        task_stream_max_len: 1,
        suite_timeout_ms: 1,
        max_crash_retries: 0,
      },
    },
    discord_alerts: { info: false, warn: false, critical: false, ok: false },
    pre_check: { enabled: false, lint_report_path: '/home/node/lint.js', timeout_seconds: 1 },
    review_defaults: { timeout_minutes: 1, max_fix_cycles: 0, lint_tier: 'pre-check', lint_required: false },
    case_study: { timeout_minutes: 1 },
    arch_validation: { enabled: true, agent_enabled: false, timeout_minutes: 1 },
    plugins: {
      enabled: true,
      allowCustomModules: false,
      extraModulePaths: [],
      modules: {},
      stageOwners: {},
      restrictedCapabilityAllowlist: {},
    },
    acp_monitor: { poll_limit: 0, max_transcript_extensions: 0, transcript_grace_ms: 0, monitor_poll_ms: 0 },
  };
}

test('identifier based path helpers reject traversal-shaped segments', () => {
  const config = makeConfig();

  assert.throws(
    () => gateStatusPath(config, '../owned'),
    /gate id: identifier must be a single safe path segment/,
  );
  assert.throws(
    () => moduleLogDir(config, 'module/escaped'),
    /project log segment 2: identifier must be a single safe path segment/,
  );
});

test('module Buster artifact refs follow module source authority when runtime swarm is shared', () => {
  const parentRepo = '/home/path-segment-parent';
  const moduleRepo = '/home/path-segment-module-worktree';
  const config = {
    ...makeConfig(),
    repo_root: moduleRepo,
    paths: {
      ...makeConfig().paths,
      project_src_dir: path.join(moduleRepo, 'Projects/demo/src'),
      swarm_dir: path.join(parentRepo, 'Projects/demo/src/.swarm'),
      modules_dir: path.join(moduleRepo, 'Projects/demo/src/.swarm/modules'),
    },
  };

  assert.equal(
    moduleBusterOutputPathRef(config, '02-nginx'),
    'Projects/demo/src/.swarm/modules/02-nginx/buster-output.json',
  );
  assert.equal(
    moduleBusterTestWorkspacePathRef(config, '02-nginx', 1),
    'Projects/demo/src/.swarm/modules/02-nginx/tests/attempt-1',
  );
});

test('loadConfig rejects traversal-shaped project names before filesystem probing', () => {
  assert.throws(
    () => loadConfig('../outside', {
      repoRoot: '/not-a-git-repo',
      swarmConfigPath: '/missing/swarm.config.json',
    }),
    /project name: identifier must be a single safe path segment/,
  );
});

test('validateConfig rejects duplicate case study config in progress', () => {
  const config = makeConfig();
  const progress = {
    project: 'demo',
    execution_order: [],
    modules: {},
    gates: {},
    case_study: { enabled: true },
  };

  assert.throws(
    () => validateConfig(config, progress),
    /progress\.case_study: case study generator config belongs in swarm\.config\.json config\.case_study/,
  );
});

test('temp manager rejects path separators in file components', () => {
  const manager = createTempManager();

  assert.throws(
    () => manager.file('../prefix', 'module', '.tmp'),
    /temp file prefix: identifier must be a single safe path segment/,
  );
  assert.throws(
    () => manager.file('prefix', 'module/escaped', '.tmp'),
    /temp file module id: identifier must be a single safe path segment/,
  );
  assert.throws(
    () => manager.file('prefix', 'module', '../tmp'),
    /temp file extension: identifier must be a single safe path segment/,
  );

  manager.cleanup();
});

test('validateConfig rejects serialized gate keys that are unsafe path segments', () => {
  const config = makeConfig();
  const progress = {
    project: 'demo',
    execution_order: [],
    modules: {},
    gates: {
      '../owned': {
        type: 'approval',
        title: 'Approval',
        on_timeout: 'block',
      },
    },
  };

  assert.throws(
    () => validateConfig(config, progress),
    /progress\.gates\.\.\.\/owned: identifier must be a single safe path segment/,
  );
});

test('validateConfig rejects gate dependencies when progress.gates is omitted', () => {
  const config = makeConfig();
  const progress = {
    project: 'demo',
    execution_order: ['m1'],
    modules: {
      m1: { depends_on: ['gate:approval'] },
    },
  };

  assert.throws(
    () => validateConfig(config, progress),
    /progress\.modules\.m1\.depends_on: gate 'approval' is not defined in progress\.gates/,
  );
});

test('validateConfig rejects removed review-failure gate field', () => {
  const config = makeConfig();
  const progress = {
    project: 'demo',
    execution_order: ['gate:review'],
    modules: {},
    gates: {
      review: {
        type: 'review',
        title: 'Review',
        review_name: 'REVIEW',
        [removedReviewFailField]: 'stop',
        instructions_file: 'echo-review/REVIEW-INSTRUCTIONS.md',
        output_file: 'logs/echo-review/REVIEW.json',
      },
    },
  };

  assert.throws(
    () => validateConfig(config, progress),
    new RegExp(`progress\\.gates\\.review\\.${removedReviewFailField}: removed field; use on_fail`),
  );
});

test('validateConfig requires telemetry when agent observability is required', () => {
  const config = makeConfig();
  config.agent_observability = observabilityConfig();
  const progress = {
    project: 'demo',
    execution_order: [],
    modules: {},
    gates: {},
  };

  assert.throws(
    () => validateConfig(config, progress),
    /config\.telemetry\.enabled: must be true when config\.agent_observability\.required is true/,
  );
});
