# Swarm Config

Status: current
Audience: reference reader, developer

## Summary

`swarm.config.json` is the platform-level pipeline config rendered into `/home/node/.openclaw/swarm.config.json`. It controls runtime defaults, dispatch behavior, observability, rate limiting, Buster defaults, lint pre-checks, and plugin registry settings. Project workflow belongs in `progress.json`, not in this file.

## Source And Runtime Paths

- source: `charts/kubeclaw/files/config/swarm.config.json`
- runtime: `/home/node/.openclaw/swarm.config.json`
- secondary runtime candidate: `SWARM_CONFIG`

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
- `acp_monitor.unknown_poll_limit`: `10`
- `acp_monitor.stale_poll_limit`: `10`
- `acp_monitor.max_transcript_extensions`: `3`
- `acp_monitor.transcript_grace_ms`: `300000`
- `acp_monitor.monitor_poll_ms`: `10000`
- `agent_observability.plugin_control.enabled`: `true`
- `agent_observability.plugin_control.pluginId`: `kubeclaw-agent-observer`
- `agent_observability.plugin_control.command`: `openclaw`
- `agent_observability.plugin_control.timeoutMs`: `10000`
- `agent_observability.plugin_control.disableOnStop`: `true`
- `agent_observability.ingester.enabled`: `true`
- `agent_observability.ingester.redisNetworkIsolation`: `isolated`
- `agent_observability.ingester.loopDelayMs`: `250`
- `agent_observability.ingester.healthCheckEvery`: `10`
- `agent_observability.ingester.redisCommandTimeoutMs`: `1000`
- `pre_check.enabled`: `true`
- `pre_check.lint_report_path`: `/app/skills/pipeline/tools/lint-report.ts`
- `pre_check.timeout_seconds`: `60`
- `agents.forge.dispatch`: `subagent`
- `agents.forge.acp_agent_id`: `codex`
- `agents.buster.dispatch`: `redis`
- `agents.buster.redis_js_path`: `/app/skills/pipeline/tools/redis.ts`
- `agents.echo.dispatch`: `subagent`
- `agents.echo.acp_agent_id`: `codex`
- `fallback_model`: `codex-5.4`
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

## Example

```json
{
  "poll_interval_seconds": 30,
  "default_timeout_minutes": 300,
  "default_max_fails": 8,
  "auto_retry_threshold": 7,
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

## Generated From

This page is manually maintained from:

- `charts/kubeclaw/files/config/swarm.config.json`
- `charts/kubeclaw/templates/configmap-swarm-config.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `skills/nova/pipeline/core/config.ts`
