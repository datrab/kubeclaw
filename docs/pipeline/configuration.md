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

The chart-authored file is compact. It declares the `standard` profile, standard feature set, strict tuning intent, and rare structured overrides. Runtime code expands that through `skills/nova/pipeline/core/config-profiles/standard.json` before validation, so pipeline callers still consume a full effective config.

Current authored shape:

```json
{
  "profile": "standard",
  "features": {
    "observability": true,
    "buster": true,
    "discord_alerts": true
  },
  "tuning": {
    "safety_margins": "high",
    "retention": "high",
    "alerts": "rich",
    "logs": "verbose",
    "checks": "strict",
    "determinism": "strict"
  },
  "overrides": {},
  "discord_webhook_url": ""
}
```

`standard` is the canonical safe baseline: longer safety margins, high retention, rich alerts, verbose logs, strict checks, deterministic behavior, and no silent fallbacks.

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

For a local exception, keep the standard profile and add only the specific structured override:

```json
{
  "profile": "standard",
  "features": {
    "observability": true,
    "buster": true,
    "discord_alerts": true
  },
  "tuning": {
    "safety_margins": "high",
    "retention": "high",
    "alerts": "rich",
    "logs": "verbose",
    "checks": "strict",
    "determinism": "strict"
  },
  "overrides": {
    "session": {
      "kill": {
        "subagent_confirm_timeout_ms": 180000
      }
    }
  },
  "discord_webhook_url": ""
}
```

Override paths must already exist in the expanded standard profile. Typos and unknown paths fail validation.

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

`skills/nova/pipeline/core/config.ts` treats missing platform-owned fields as startup errors after profile expansion. `loadConfig()` derives `project`, `repo_root`, `paths.swarm_dir`, `paths.modules_dir`, and `paths.progress_file` from the operator input and repository layout; those derived values do not belong in the chart source file.

| Config area | Required or rejected fields | Owner and behavior | Failure mode |
| --- | --- | --- | --- |
| `agents` | requires `forge`, `buster`, `echo`; every agent needs `dispatch`; ACP/subagent agents need `acp_agent_id`; Redis agents need `redis_js_path`; Buster must be `redis` | `validateConfig()` and `validateBusterConfig()` | startup throws `Config validation failed`; unsafe `redis_js_path` rejected by `validateSafePath()` |
| model defaults | requires `fallback_model`; rejects top-level `models` | platform has only fallback model; role-specific defaults belong in `progress.json defaults.models` | `config.models` error |
| profile expansion | requires `profile: "standard"` plus exact standard `features` and `tuning` declarations | `platform-config.ts` expands the authored file to the full runtime shape | unknown profile, feature, tuning, or override path errors |
| retry and polling | expanded config requires `polling.interval_seconds`, `progress_interval_ms`, `session_end_grace_ms`, and `pipeline_defaults.timeout_minutes`, `max_fails`, `auto_retry_threshold`, `agent_startup_retry_budget`, `session_nudge_threshold` | scheduler and rate-limit handling use these as runtime defaults | missing/non-number errors |
| `rate_limit` | requires object plus `cooldown_hours`, `max_pauses_per_module`, `cooldown_buffer_ms` | rate-limit recovery and pause accounting | missing object or invalid number errors |
| `buster` | requires direct `runtime` fields for heartbeat, task transport, completion wait, stream trimming, suite timeout, and crash retry values | Buster readiness, polling, pending reclaim, completion live-wait blocking, completion recovery, stream trimming, suite timeout, and crash retries | Buster readiness/config startup failure |
| `discord_alerts` | requires booleans for `info`, `warn`, `critical`, `ok` | operator alert filtering | boolean validation errors |
| `pre_check` | requires `enabled`, `lint_report_path`, and `timeout_seconds` | delivery lint/pre-check validator | startup validation error or missing lint tool later |
| `review_defaults` | requires `timeout_minutes`, `max_fix_cycles`, `lint_tier`, `lint_required`; rejects `reviewers` | review gate defaults; reviewer/model defaults stay in project gates | validation error |
| `plugins` | requires booleans `enabled`, `allowCustomModules`, array `extraModulePaths`, objects `modules`, `stageOwners`, `restrictedCapabilityAllowlist` | `buildPluginRegistry()` normalizes built-ins, stage owners, trust tiers, and capability allowlists | registry errors such as unknown owner, conflict, invalid capability |
| `acp_monitor` | requires direct `poll_limit`, `max_transcript_extensions`, `transcript_grace_ms`, `monitor_poll_ms` | ACP transcript/session monitor timing | startup validation error |
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
