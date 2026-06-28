import fs from 'fs';
import assert from 'assert';

import { importRuntimeModule } from '../../lib/lifecycle-audit-lib.mjs';

export async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

export function gateRuntimeEvents(xaddEvents, streamKey) {
  return xaddEvents(streamKey)
    .filter((event) => event.type !== 'plugin.event' || !String(event.details?.bridge_event_type || '').startsWith('plugin.gate.'))
    .map((event, index) => ({ ...event, seq: index + 1 }));
}

export function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function stepExit(result) {
  const status = result?.terminal?.status ?? result?.terminal_status ?? null;
  return status === 'succeeded' ? 0 : (status ? 1 : null);
}

export function stepGateStatus(result) {
  return result?.diagnostics?.typed?.controlResult?.diagnostics?.typed?.gate?.gateRunStatus;
}

export function stepMetadata(result) {
  return result?.diagnostics?.metadata || {};
}

export function stepRateLimit(result) {
  return result?.rateLimit || {};
}

export function stepSummary(result) {
  return result?.diagnostics?.summary;
}

export function platformTestDefaults() {
  return {
    fallback_model: 'fallback-model',
    pipeline_defaults: {
      timeout_minutes: 30,
      max_fails: 3,
      auto_retry_threshold: 2,
      agent_startup_retry_budget: 2,
      session_nudge_threshold: 0.75,
    },
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0, cooldown_buffer_ms: 0 },
    review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
    arch_validation: { enabled: true, agent_enabled: false, timeout_minutes: 15 },
    telemetry: {
      enabled: true,
      sink_timeout_ms: 5000,
      stream_max_len: 10000,
    },
    redis_completion: {
      archive_max_len: 1000,
      tail_scan_batch_size: 100,
      tail_scan_limit: 1000,
    },
    event_adapters: {
      local_evidence_debounce_ms: 100,
      approval_signal_debounce_ms: 25,
    },
    polling: {
      interval_seconds: 30,
      progress_interval_ms: 30000,
      session_end_grace_ms: 15000,
    },
    discord: {
      webhook_timeout_ms: 10000,
    },
    gateway: {
      invoke: {
        retry: { max_attempts: 3, retry_delay_ms: 0 },
        session_status: { timeout_ms: 1000 },
        session_spawn: { timeout_ms: 30000 },
        session_send: { timeout_ms: 15000 },
        subagent_kill: { timeout_ms: 30000 },
        subagent_list: { timeout_ms: 30000 },
        health: { timeout_ms: 1000 },
      },
      health: {
        timeout_ms: 120000,
        interval_ms: 3000,
        monitor_interval_ms: 60000,
        max_failures: 3,
      },
    },
    session: {
      health_check_timeout_ms: 10000,
      spawn: { thread: false, mode: 'run', cleanup: 'keep', stream_to: 'parent' },
      kill: {
        acp_confirm_timeout_ms: 15000,
        subagent_confirm_timeout_ms: 120000,
        confirm_poll_ms: 2000,
        cleanup_confirm_timeout_ms: 'match_confirm_timeout',
        acpx_timeout_ms: 10000,
        stop_message: '/stop',
      },
      termination: {
        grace_ms: 5000,
        max_grace_ms: 10000,
        poll_ms: 500,
        gateway_request_max_ms: 1000,
        cleanup_confirm_timeout_ms: 0,
        gateway_operation_timeout_ms: 1000,
        acpx_timeout_ms: 1000,
      },
    },
    acp_monitor: {
      poll_limit: 10,
      max_transcript_extensions: 3,
      transcript_grace_ms: 300000,
      monitor_poll_ms: 10000,
    },
    agents: {
      forge: { dispatch: 'subagent', acp_agent_id: 'codex', cwd: null },
      buster: { dispatch: 'redis', redis_js_path: '/app/skills/pipeline/tools/redis.ts' },
      echo: { dispatch: 'subagent', acp_agent_id: 'codex', cwd: null },
    },
    buster: {
      runtime: {
        task_stream: 'swarm:buster:tasks',
        heartbeat_path: '/tmp/kubeclaw-buster-heartbeat',
        heartbeat_interval_ms: 1000,
        task_poll_interval_ms: 2000,
        task_pending_reclaim_idle_ms: 60000,
        completion_event_block_ms: 0,
        completion_recovery_scan_interval_ms: 5000,
        task_stream_max_len: 250,
        suite_timeout_ms: 300000,
        max_crash_retries: 2,
      },
    },
    agent_observability: {
      required: true,
      payload: { max_event_bytes: 3145728 },
      startup_evidence: { timeout_ms: 15000, block_ms: 250 },
      forge_completion: { xread_block_ms: 1, settle_ms: 15000 },
      streams: { stream_max_len: 10000, dead_letter_max_len: 1000 },
      plugin: {
        enabled: false,
        max_queue_per_stream: 100,
        control_write: { max_attempts: 3, retry_base_ms: 100, retry_max_ms: 1000 },
        hook: { priority: -100, timeout_ms: 1000 },
      },
      plugin_control: {
        enabled: false,
        pluginId: 'kubeclaw-agent-observer',
        command: 'openclaw',
        disableOnStop: true,
        timeout_ms: 10000,
      },
      ingester: {
        enabled: false,
        redisNetworkIsolation: 'isolated',
        groupName: 'kubeclaw-agent-observability-ingester',
        consumerName: 'kubeclaw-agent-observability-ingester-1',
        read_block_ms: 1000,
        reclaim_idle_ms: 60000,
        redis_command_timeout_ms: 5000,
        loop: { delay_ms: 250, health_check_every: 10, stop_timeout_ms: 2000 },
        trim: { interval_ms: 5000, payload_stream_max_len: 5000 },
        pressure: { control_lag_degraded_threshold: 1000, payload_pressure_degraded_threshold: 10000 },
      },
    },
    locks: {
      pipeline_run: { lease_ms: 120000, heartbeat_ms: 30000, mutation_stale_ms: 5000, abort_settle_ms: 5000 },
      lifecycle_append: { stale_ms: 300000, timeout_ms: 30000 },
      gate_active_session: { stale_ms: 300000, timeout_ms: 30000 },
    },
  };
}

export function stepOutcomeForClass(outcomeClass = 'passed') {
  switch (outcomeClass) {
    case 'passed': return ['continue', 'passed', 'succeeded', 'none'];
    case 'needs_nova': return ['halt', 'needs_nova', 'action_required', 'request_handoff'];
    case 'blocked': return ['halt', 'blocked', 'blocked', 'notify_operator'];
    case 'timeout': return ['halt', 'timeout', 'timed_out', 'request_handoff'];
    case 'rate_limited': return ['halt', 'rate_limited', 'rate_limited', 'retry_later'];
    default: return ['halt', 'error', 'failed', 'stop'];
  }
}

export function makeStepResult({
  stepType = 'module',
  stepId = '01',
  outcomeClass = 'passed',
  reason = null,
  status = null,
  projection = {},
  correlation = {},
  issueType = null,
  rateLimit = null,
} = {}) {
  const [nextAction, outcome, terminalStatus, terminalAction] = stepOutcomeForClass(outcomeClass);
  return {
    schemaVersion: 'v1',
    kind: 'pipeline_step_result',
    stepType,
    stepId,
    nextAction,
    outcome,
    ...(issueType ? { issueType } : {}),
    diagnostics: {
      summary: reason,
      findings: [],
      metadata: {
        ...projection,
        ...(reason != null ? { reason } : {}),
        ...(status != null ? { status } : {}),
      },
      typed: {},
    },
    correlation,
    ...(rateLimit == null ? {} : { rateLimit }),
    terminal: {
      status: terminalStatus,
      decision: {
        schemaVersion: 'v1',
        kind: 'pipeline_terminal_decision',
        status: terminalStatus,
        action: terminalAction,
        reasonCode: outcome,
        humanReason: reason,
        scope: stepType,
        correlation: {},
        source: null,
        metadata: {},
      },
    },
  };
}

export function assertTypedTerminalEvent(event, status, reasonCode = undefined) {
  assert.equal(event.terminal_status, status);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exit_code'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exit_reason'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exitCode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exitLabel'), false);
  if (reasonCode !== undefined) assert.equal(event.reason_code, reasonCode);
}
