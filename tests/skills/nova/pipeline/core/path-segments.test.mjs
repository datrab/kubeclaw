import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadConfig, validateConfig } from '../../../../../skills/nova/pipeline/core/config.ts';
import {
  gateStatusPath,
  moduleLogDir,
} from '../../../../../skills/nova/pipeline/core/paths.ts';
import { createTempManager } from '../../../../../skills/nova/pipeline/core/temp.ts';

const removedReviewFailField = `on_${'n' + 'ogo'}`;

function makeConfig() {
  const repoRoot = '/home/path-segment-test';
  const swarmDir = path.join(repoRoot, 'Projects/demo/src/.swarm');
  return {
    project: 'demo',
    repo_root: repoRoot,
    paths: {
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
    poll_interval_seconds: 1,
    default_timeout_minutes: 1,
    default_max_fails: 0,
    auto_retry_threshold: 0,
    session_nudge_threshold: 0,
    rate_limit: { cooldown_hours: 0, max_pauses_per_module: 0, cooldown_buffer_ms: 0 },
    buster: {
      suite_timeout_ms: 1,
      max_crash_retries: 0,
      runtime: {
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1,
        task_poll_interval_ms: 1,
        task_pending_reclaim_idle_ms: 1,
        task_stream_max_len: 1,
      },
    },
    discord_alerts: { info: false, warn: false, critical: false, ok: false },
    pre_check: { enabled: false, lint_report_path: '/home/node/lint.js', timeout_seconds: 1 },
    review_defaults: { timeout_minutes: 1, max_fix_cycles: 0, lint_tier: 'pre-check', lint_required: false },
    plugins: {
      enabled: true,
      allowCustomModules: false,
      extraModulePaths: [],
      modules: {},
      stageOwners: {},
      restrictedCapabilityAllowlist: {},
    },
    acp_monitor: {
      unknown_poll_limit: 0,
      stale_poll_limit: 0,
      max_transcript_extensions: 0,
      transcript_grace_ms: 0,
      monitor_poll_ms: 0,
    },
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

test('loadConfig rejects traversal-shaped project names before filesystem probing', () => {
  assert.throws(
    () => loadConfig('../outside', {
      repoRoot: '/not-a-git-repo',
      swarmConfigPath: '/missing/swarm.config.json',
    }),
    /project name: identifier must be a single safe path segment/,
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
        [removedReviewFailField]: 'fix_and_rereview',
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
  config.agent_observability = { required: true, startup_evidence_timeout_ms: 0 };
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
