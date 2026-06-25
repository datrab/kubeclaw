# Swarm Config

Status: current
Audience: reference reader, developer

## Summary

`swarm.config.json` is the platform-level pipeline config rendered into `/home/node/.openclaw/swarm.config.json`. It controls runtime defaults, dispatch behavior, observability, rate limiting, Buster defaults, lint pre-checks, and plugin registry settings. Project workflow belongs in `progress.json`, not in this file.

## Source And Runtime Paths

- source: `charts/kubeclaw/files/config/swarm.config.json`
- runtime: `/home/node/.openclaw/swarm.config.json`
- secondary runtime candidate: removed uppercase swarm-config environment override

## Fields And Defaults

- `discord_webhook_url`: empty string by default.
- `discord_alerts.info`: `true`
- `discord_alerts.warn`: `true`
- `discord_alerts.critical`: `true`
- `discord_alerts.ok`: `true`
- `poll_interval_seconds`: `30`
- `default_timeout_minutes`: `300`
- `default_max_fails`: `8`
- `auto_retry_threshold`: `7`
- `session_nudge_threshold`: `0.75`
- `rate_limit.cooldown_hours`: `2`
- `rate_limit.max_pauses_per_module`: `5`
- `rate_limit.cooldown_buffer_ms`: `5000`
- `buster.suite_timeout_ms`: `300000`
- `buster.max_crash_retries`: `2`
- `buster.runtime.heartbeat_path`: `/tmp/kubeclaw-buster-heartbeat`
- `buster.runtime.heartbeat_interval_ms`: `1000`
- `buster.runtime.task_poll_interval_ms`: `2000`
- `buster.runtime.task_pending_reclaim_idle_ms`: `60000`
- `buster.runtime.completion_event_block_ms`: `0`
- `buster.runtime.completion_recovery_scan_interval_ms`: `5000`
- `buster.runtime.task_stream_max_len`: `250`
- `acp_monitor.unknown_poll_limit`: `10`
- `acp_monitor.stale_poll_limit`: `10`
- `acp_monitor.max_transcript_extensions`: `3`
- `acp_monitor.transcript_grace_ms`: `300000`
- `acp_monitor.monitor_poll_ms`: `10000`
- `agent_observability.required`: `true`
- `agent_observability.profile`: `standard`
- `agent_observability.profiles.standard.payload.max_event_bytes`: `3145728`
- `agent_observability.profiles.standard.startup_evidence.timeout_ms`: `15000`
- `agent_observability.profiles.standard.startup_evidence.block_ms`: `250`
- `agent_observability.profiles.standard.forge_completion.xread_block_ms`: `1`
- `agent_observability.profiles.standard.forge_completion.settle_ms`: `15000`
- `agent_observability.profiles.standard.redis.command_timeout_ms`: `5000`
- `agent_observability.profiles.standard.streams.stream_max_len`: `10000`
- `agent_observability.profiles.standard.streams.dead_letter_max_len`: `1000`
- `agent_observability.profiles.standard.plugin.max_queue_per_stream`: `100`
- `agent_observability.profiles.standard.plugin.control_write.max_attempts`: `3`
- `agent_observability.profiles.standard.plugin.hook.timeout_ms`: `1000`
- `agent_observability.profiles.standard.plugin_control.timeout_ms`: `10000`
- `agent_observability.profiles.standard.ingester.read.block_ms`: `1000`
- `agent_observability.profiles.standard.ingester.loop.delay_ms`: `250`
- `agent_observability.profiles.standard.ingester.trim.interval_ms`: `5000`
- `agent_observability.profiles.standard.ingester.pressure.control_lag_degraded_threshold`: `1000`
- `agent_observability.plugin.enabled`: `true`
- `agent_observability.plugin_control.enabled`: `true`
- `agent_observability.plugin_control.pluginId`: `kubeclaw-agent-observer`
- `agent_observability.plugin_control.command`: `openclaw`
- `agent_observability.plugin_control.disableOnStop`: `true`
- `agent_observability.ingester.enabled`: `true`
- `agent_observability.ingester.redisNetworkIsolation`: `isolated`
- `agent_observability.ingester.groupName`: `kubeclaw-agent-observability-ingester`
- `agent_observability.ingester.consumerName`: `kubeclaw-agent-observability-ingester-1`
- `pre_check.enabled`: `true`
- `pre_check.lint_report_path`: `/app/skills/pipeline/tools/lint-report.ts`
- `pre_check.timeout_seconds`: `60`
- `agents.forge.dispatch`: `subagent`
- `agents.forge.acp_agent_id`: `codex`
- `agents.buster.dispatch`: `redis`
- `agents.buster.redis_js_path`: `/app/skills/pipeline/tools/redis.ts`
- `agents.echo.dispatch`: `subagent`
- `agents.echo.acp_agent_id`: `codex`
- `fallback_model`: `gpt-5.5`
- `review_defaults.timeout_minutes`: `30`
- `review_defaults.max_fix_cycles`: `3`
- `review_defaults.lint_tier`: `full`
- `review_defaults.lint_required`: `true`
- `plugins.enabled`: `true`
- `plugins.allowCustomModules`: `false`
- `plugins.extraModulePaths`: `[]`
- `plugins.modules`: `{}`
- `plugins.stageOwners`: `{}`
- `plugins.restrictedCapabilityAllowlist`: `{}`

## Validation Behavior

`core/config.ts` validates this config. Current checks include:

- rejects hidden `_testOverrides`
- requires platform-owned fields
- requires Buster dispatch to be `redis`
- rejects `config.models` in swarm config
- builds the plugin registry during startup
- rejects unknown top-level fields

## Example

```json
{
  "poll_interval_seconds": 30,
  "default_timeout_minutes": 300,
  "default_max_fails": 8,
  "auto_retry_threshold": 7,
  "buster": {
    "suite_timeout_ms": 300000,
    "max_crash_retries": 2,
    "runtime": {
      "heartbeat_path": "/tmp/kubeclaw-buster-heartbeat",
      "heartbeat_interval_ms": 1000,
      "task_poll_interval_ms": 2000,
      "task_pending_reclaim_idle_ms": 60000,
      "completion_event_block_ms": 0,
      "completion_recovery_scan_interval_ms": 5000,
      "task_stream_max_len": 250
    }
  },
  "agents": {
    "forge": { "dispatch": "subagent", "acp_agent_id": "codex", "cwd": null },
    "buster": { "dispatch": "redis", "redis_js_path": "/app/skills/pipeline/tools/redis.ts" },
    "echo": { "dispatch": "subagent", "acp_agent_id": "codex", "cwd": null }
  },
  "plugins": {
    "enabled": true,
    "allowCustomModules": false,
    "extraModulePaths": [],
    "modules": {},
    "stageOwners": {},
    "restrictedCapabilityAllowlist": {}
  }
}
```

## Used By

- Nova pipeline config loading
- module/gate timeout and retry defaults
- rate-limit handling
- Buster suite timeout
- OpenClaw agent observability
- pre-check linting
- plugin registry construction

## Validation Reference

| Field | Required shape | Notes |
| --- | --- | --- |
| `agents.forge.dispatch`, `agents.echo.dispatch` | `acp`, `subagent`, or `redis`; current chart uses `subagent` | ACP/subagent entries require `acp_agent_id`. |
| `agents.buster.dispatch` | exactly `redis` | Buster also requires `agents.buster.redis_js_path`; the default is `/app/skills/pipeline/tools/redis.ts`. |
| `fallback_model` | non-empty string | Role-specific model defaults belong in project `progress.json`, not here. |
| `poll_interval_seconds`, `default_timeout_minutes` | positive numbers | Scheduler timing defaults. |
| `default_max_fails`, `auto_retry_threshold` | numbers `>= 0` | Retry escalation thresholds. |
| `session_nudge_threshold` | number `0..1` | Session monitor nudge threshold. |
| `rate_limit.cooldown_hours`, `rate_limit.max_pauses_per_module`, `rate_limit.cooldown_buffer_ms` | numbers `>= 0` | Rate-limit recovery budget. |
| `buster.suite_timeout_ms` | positive number | Deterministic suite timeout. |
| `buster.max_crash_retries` | number `>= 0` | Buster crash retry budget. |
| `buster.runtime.heartbeat_path` | non-empty string | Buster readiness uses this path; deployment truth rejects the old `BUSTER_HEARTBEAT_PATH` env fallback. |
| `buster.runtime.heartbeat_interval_ms`, `task_poll_interval_ms`, `task_pending_reclaim_idle_ms`, `completion_event_block_ms`, `completion_recovery_scan_interval_ms`, `task_stream_max_len` | non-negative/positive numbers | Worker heartbeat, polling, pending reclaim, completion live-wait blocking, completion recovery, and stream trimming. |
| `discord_alerts.info`, `warn`, `critical`, `ok` | booleans | Operator alert filtering. |
| `pre_check.enabled`, `pre_check.lint_report_path`, `pre_check.timeout_seconds` | boolean, non-empty string, positive number | Delivery lint/pre-check validator. |
| `review_defaults.timeout_minutes`, `max_fix_cycles`, `lint_tier`, `lint_required` | positive number, number `>= 0`, non-empty string, boolean | Review gate defaults; `review_defaults.reviewers` is rejected. |
| `plugins.enabled`, `allowCustomModules`, `extraModulePaths`, `modules`, `stageOwners`, `restrictedCapabilityAllowlist` | boolean, boolean, array, object, object, object | Registry startup validates stage ownership, trust overrides, and capabilities in `skills/nova/pipeline/core/registry/**`. |
| `acp_monitor.*` | non-negative numbers | ACP transcript/session monitor timing. |

Rejected here: `_testOverrides`, top-level `models`, removed telemetry stream-key config, unknown top-level fields, reviewer/model defaults, and project workflow fields. Put workflow in `<repo>/Projects/<project>/src/.swarm/progress.json`.

## Verification

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --area pipeline
npm run docs:check
```

## Generated From

This page is manually maintained from:

- `charts/kubeclaw/files/config/swarm.config.json`
- `charts/kubeclaw/templates/configmap-swarm-config.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `skills/nova/pipeline/core/config.ts`
