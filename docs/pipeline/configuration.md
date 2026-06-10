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
- `pre_check.enabled`: `true`
- `pre_check.timeout_seconds`: `60`
- `agents.buster.dispatch`: `redis`
- `fallback_model`: `codex-5.4`
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
    "suite_timeout_ms": 300000
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
      "forge": "codex-5.4",
      "buster": "codex-5.4",
      "echo": "codex-5.4"
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

## Relationship To OpenClaw

KubeClaw config selects dispatch mode, model IDs, agent IDs, and observability/plugin behavior. Provider credentials, model availability, and gateway behavior are OpenClaw-owned concerns. Use KubeClaw docs to understand which model IDs and secrets are referenced; use OpenClaw docs to configure provider credentials and gateway behavior.

## Sources

- `charts/kubeclaw/files/config/swarm.config.json`
- `charts/kubeclaw/templates/configmap-swarm-config.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/project_setup/progress-json.md`
