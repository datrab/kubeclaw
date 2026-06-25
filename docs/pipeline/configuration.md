# Pipeline Configuration

Status: current
Audience: operator, developer

## Overview

Pipeline behavior is split between platform config and project config. Platform config controls runtime defaults and integration surfaces. Project config controls a specific project's module/gate workflow.

Do not put project modules, gates, or model lists into `swarm.config.json`. The config loader rejects platform-owned fields that belong elsewhere and rejects hidden `_testOverrides`.

## Platform Config

Source:

```text
charts/kubeclaw/files/config/swarm.config.json
```

Runtime path:

```text
/home/node/.openclaw/swarm.config.json
```

Secondary candidate:

```text
SWARM_CONFIG
```

Important defaults:

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
- `pre_check.enabled`: `true`
- `pre_check.timeout_seconds`: `60`
- `agents.buster.dispatch`: `redis`
- `fallback_model`: `gpt-5.5`
- `plugins.enabled`: `true`
- `plugins.allowCustomModules`: `false`

## Project Config

Project config path:

```text
<repo>/Projects/<project>/src/.swarm/progress.json
```

Project selected by:

- `--project <name>`
- `CURRENT_PROJECT`

Repository selected by:

- `--repo <path>`
- `REPO_ROOT`
- Git auto-detection

Project config owns:

- `execution_order`
- `modules`
- `gates`
- project model defaults
- suite selections and suite config
- architecture validation options
- pipeline review/case-study generator options
- project telemetry enablement

## Example Platform Override

For a slower local test cluster:

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

Keep only intentional overrides in runtime config; use the chart source as the default reference.

## Example Project Shape

```json
{
  "project": "my-project",
  "version": 1,
  "defaults": {
    "models": {
      "forge": "gpt-5.5",
      "buster": "gpt-5.5",
      "echo": "gpt-5.5"
    }
  },
  "execution_order": ["01-scaffold", "02-api", "gate:final-buster"],
  "modules": {
    "01-scaffold": {
      "title": "Scaffold",
      "dir": "01-scaffold",
      "depends_on": [],
      "stages": ["forge"],
      "test_suites": []
    },
    "02-api": {
      "title": "API",
      "dir": "02-api",
      "depends_on": ["01-scaffold"],
      "stages": ["forge", "buster"],
      "test_suites": ["build", "health", "unit"]
    }
  },
  "gates": {
    "final-buster": {
      "type": "buster",
      "title": "Final system test",
      "test_suites": ["build", "health", "unit"],
      "test_config": {}
    }
  }
}
```

## Validation Behavior

The loader validates:

- required platform-owned fields exist
- Buster dispatch is Redis-backed
- platform config does not define `models`
- plugin registry shape is valid
- project paths are inside allowed directories
- module/gate artifact paths stay inside `.swarm`

Path helpers reject absolute paths, parent traversal, null bytes, and repository escapes for source and artifact paths.

### Platform Validation Table

`skills/nova/pipeline/core/config.ts` treats missing platform-owned fields as startup errors. `loadConfig()` derives `project`, `repo_root`, `paths.swarm_dir`, `paths.modules_dir`, and `paths.progress_file` from the operator input and repository layout; those derived values do not belong in the chart source file.

| Config area | Required or rejected fields | Owner and behavior | Failure mode |
| --- | --- | --- | --- |
| `agents` | requires `forge`, `buster`, `echo`; every agent needs `dispatch`; ACP/subagent agents need `acp_agent_id`; Redis agents need `redis_js_path`; Buster must be `redis` | `validateConfig()` and `validateBusterConfig()` | startup throws `Config validation failed`; unsafe `redis_js_path` rejected by `validateSafePath()` |
| model defaults | requires `fallback_model`; rejects top-level `models` | platform has only fallback model; role-specific defaults belong in `progress.json defaults.models` | `config.models` error |
| retry and polling | requires numeric `poll_interval_seconds`, `default_timeout_minutes`, `default_max_fails`, `auto_retry_threshold`, `session_nudge_threshold` in range `0..1` | scheduler and rate-limit handling use these as runtime defaults | missing/non-number errors |
| `rate_limit` | requires object plus `cooldown_hours`, `max_pauses_per_module`, `cooldown_buffer_ms` | rate-limit recovery and pause accounting | missing object or invalid number errors |
| `buster` | requires object, `suite_timeout_ms`, `max_crash_retries`, and `runtime.heartbeat_path`, `heartbeat_interval_ms`, `task_poll_interval_ms`, `task_pending_reclaim_idle_ms`, `completion_event_block_ms`, `completion_recovery_scan_interval_ms`, `task_stream_max_len` | Buster readiness, polling, pending reclaim, completion live-wait blocking, completion recovery, and stream trimming | Buster readiness/config startup failure |
| `discord_alerts` | requires booleans for `info`, `warn`, `critical`, `ok` | operator alert filtering | boolean validation errors |
| `pre_check` | requires `enabled`, `lint_report_path`, `timeout_seconds` | delivery lint/pre-check validator | startup validation error or missing lint tool later |
| `review_defaults` | requires `timeout_minutes`, `max_fix_cycles`, `lint_tier`, `lint_required`; rejects `reviewers` | review gate defaults; reviewer/model defaults stay in project gates | validation error |
| `plugins` | requires booleans `enabled`, `allowCustomModules`, array `extraModulePaths`, objects `modules`, `stageOwners`, `restrictedCapabilityAllowlist` | `buildPluginRegistry()` normalizes built-ins, stage owners, trust tiers, and capability allowlists | registry errors such as unknown owner, conflict, invalid capability |
| `acp_monitor` | requires `unknown_poll_limit`, `stale_poll_limit`, `max_transcript_extensions`, `transcript_grace_ms`, `monitor_poll_ms` | ACP transcript/session monitor timing | startup validation error |
| unknown fields | rejects top-level fields not in the known allowlist | prevents silent runtime drift | `config.<key>: unknown top-level config field` |

### Project Boundary

`progress.json` must provide `project`, `execution_order`, and `modules`. Optional `gates` must be an object. Gate types must be registered by the startup plugin registry, so `review`, `buster`, and `approval` are accepted only because built-in registry definitions claim the matching `gate:<type>` stage IDs.

Project-only fields include module `depends_on`, `stages`, `test_suites`, gate `type`, review gate `review_name` and `instructions_file`, Buster gate `on_fail`, approval gate `title`, `on_timeout`, and `timeout_minutes`. Module dependencies that reference `gate:<id>` must point to an existing `progress.gates.<id>` entry.

Verification commands:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --area pipeline
```

## Relationship To OpenClaw

KubeClaw config selects dispatch mode, model IDs, agent IDs, and observability/plugin behavior. Pipeline model policy canonicalizes older Codex/OpenAI aliases before logging policy or dispatching work, so `openai-codex/gpt-5.4` is sent to workers and subagents as `openai/gpt-5.4`, and `codex-5.4` is sent as `gpt-5.4`. Provider credentials, model availability, and gateway behavior are OpenClaw-owned concerns. Use KubeClaw docs to understand which model IDs and secrets are referenced; use OpenClaw docs to configure provider credentials and gateway behavior.

## Sources

- `charts/kubeclaw/files/config/swarm.config.json`
- `charts/kubeclaw/templates/configmap-swarm-config.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/project_setup/progress-json.md`
