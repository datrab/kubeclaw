import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig, validateConfig } from '../../../../../skills/nova/pipeline/core/config.ts';
import { buildPluginRegistry, requirePluginRegistry, requireStageOwner } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { PLUGIN_CONFIG_SCHEMA_ANY_OBJECT, PLUGIN_CONTRACT_VERSION } from '../../../../../skills/nova/pipeline/core/constants.ts';

function makeSwarmConfig() {
  return {
    agents: {
      forge: { dispatch: 'acp', acp_agent_id: 'forge' },
      buster: { dispatch: 'redis', redis_js_path: '/home/node/pipeline/tools/redis.ts' },
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
    git: {
      command: { timeout_ms: 1, max_buffer_bytes: 1 },
      push: { timeout_ms: 1, max_attempts: 1, retry_delay_ms: 0 },
    },
    redis_completion: { archive_max_len: 1, tail_scan_batch_size: 1, tail_scan_limit: 1 },
    event_adapters: { local_evidence_debounce_ms: 0, approval_signal_debounce_ms: 0 },
    discord: { webhook_timeout_ms: 1 },
    gateway: {
      invoke: {
        retry: { max_attempts: 1, retry_delay_ms: 0 },
        session_status: { timeout_ms: 1 },
        session_spawn: { timeout_ms: 1 },
        session_send: { timeout_ms: 1 },
        subagent_kill: { timeout_ms: 1 },
        subagent_list: { timeout_ms: 1 },
        health: { timeout_ms: 1 },
      },
      health: { timeout_ms: 1, interval_ms: 1, monitor_interval_ms: 1, max_failures: 1 },
    },
    session: {
      health_check_timeout_ms: 1,
      spawn: { thread: false, mode: 'run', cleanup: 'keep', stream_to: 'parent' },
      kill: {
        acp_confirm_timeout_ms: 1,
        subagent_confirm_timeout_ms: 1,
        confirm_poll_ms: 1,
        cleanup_confirm_timeout_ms: 'match_confirm_timeout',
        acpx_timeout_ms: 1,
        stop_message: '/stop',
      },
      termination: {
        grace_ms: 1,
        max_grace_ms: 1,
        poll_ms: 1,
        gateway_request_max_ms: 1,
        cleanup_confirm_timeout_ms: 0,
        gateway_operation_timeout_ms: 1,
        acpx_timeout_ms: 1,
      },
    },
    buster: {
      runtime: {
        task_stream: 'swarm:buster:tasks',
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
    telemetry: { enabled: false, stream_max_len: 1, sink_timeout_ms: 1 },
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

test('loadConfig binds the startup plugin registry onto loaded config', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-config-registry-'));
  fs.mkdirSync(path.join(repoRoot, '.git'));
  const swarmDir = path.join(repoRoot, 'Projects', 'demo', 'src', '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  fs.mkdirSync(path.join(swarmDir, 'modules'));

  const progress = {
    project: 'demo',
    execution_order: [],
    modules: {},
    gates: {},
  };
  fs.writeFileSync(path.join(swarmDir, 'progress.json'), JSON.stringify(progress));

  const swarmConfigPath = path.join(repoRoot, 'swarm.config.json');
  fs.writeFileSync(swarmConfigPath, JSON.stringify(makeSwarmConfig()));

  try {
    const loaded = loadConfig('demo', { repoRoot, swarmConfigPath });

    assert.equal(loaded.config.pluginRegistry, loaded.pluginRegistry);
    assert.equal(requirePluginRegistry(loaded.config), loaded.pluginRegistry);
    assert.equal(
      requireStageOwner(loaded.config, 'gate.execute', 'gate:review').manifest.moduleId,
      'builtin.gate.review',
    );
    assert.doesNotThrow(() => validateConfig(loaded.config, loaded.progress));
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

function makeGateDefinition(moduleId, gateType) {
  return {
    manifest: {
      moduleId,
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: [gateType],
      stageIds: [`gate:${gateType}`],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      defaultEnabled: true,
    },
    implementation: {
      execute: async () => ({}),
    },
  };
}

test('plugin registry reports reserved identifier keys without prototype-key crashes', () => {
  const pluginConfig = {
    ...makeSwarmConfig().plugins,
    stageOwners: JSON.parse('{"__proto__":"builtin.gate.review","constructor":"builtin.gate.review","toString":"builtin.gate.review"}'),
    modules: JSON.parse('{"__proto__":{},"constructor":{},"toString":{}}'),
    restrictedCapabilityAllowlist: JSON.parse('{"__proto__":[],"constructor":[],"toString":[]}'),
  };

  for (const reservedKey of ['__proto__', 'constructor', 'toString']) {
    assert.doesNotThrow(() => {
      const result = buildPluginRegistry(pluginConfig, {
        builtinModules: [makeGateDefinition(reservedKey, reservedKey)],
        throwOnError: false,
      });
      assert.ok(result.errors.some((error) => error.message.includes('reserved')));
    });
  }
});
