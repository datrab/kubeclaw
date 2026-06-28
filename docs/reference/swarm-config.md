# Swarm Config

Status: current
Audience: reference reader, developer

## Summary

`swarm.config.json` is the compact platform-level pipeline config rendered into `/home/node/.openclaw/swarm.config.json`. Project workflow belongs in `progress.json`, not in this file.

The authored chart file is intentionally small. Runtime code expands it through a versioned profile before validation, so callers still receive the complete effective config shape for dispatch, observability, rate limiting, Buster defaults, lint pre-checks, and plugin registry settings.

## Source And Runtime Paths

- authored source: `charts/kubeclaw/files/config/swarm.config.json`
- standard profile source: `skills/nova/pipeline/core/config-profiles/standard.json`
- runtime path: `/home/node/.openclaw/swarm.config.json`
- secondary runtime candidate: `SWARM_CONFIG`

## Authored Shape

The chart-authored config currently supports one profile only:

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

`standard` is the canonical safe baseline: longer safety margins, high retention, rich alerts, verbose logs, strict checks, and deterministic behavior. Unknown profiles are rejected.

## Expansion Contract

`skills/nova/pipeline/core/platform-config.ts` expands compact config before runtime validation. `skills/nova/pipeline/core/config.ts` also normalizes compact configs in place when tests or tools call `validateConfig()` directly.

Rules:

- `profile` must be `standard`.
- `features` must match the standard feature declaration exactly.
- `tuning` must match the standard tuning declaration exactly.
- `overrides` must be a structured object, not string paths.
- every override path must already exist in the expanded standard profile.
- unknown compact top-level fields fail validation.
- runtime-derived `project`, `repo_root`, and `paths` are preserved when `loadConfig()` adds them.

The runtime config consumed by pipeline code is the expanded effective shape, not the compact shape.

## Effective Defaults

The effective default values live in:

```text
skills/nova/pipeline/core/config-profiles/standard.json
```

That profile owns platform behavior such as:

- `pipeline_defaults.*`
- `rate_limit.*`
- `polling.*`
- `locks.*`
- `gateway.*`
- `session.*`
- `buster.runtime.*`
- `telemetry.*`
- `agent_observability.*`
- `agents.*`
- `plugins.*`

Change behavior by editing the profile when the value should change for everyone, or by adding a structured override when a deployment needs a rare local exception.

## Validation Behavior

`core/config.ts` validates the expanded config. Current checks include:

- rejects hidden `_testOverrides`
- requires platform-owned fields after profile expansion
- requires Buster dispatch to be `redis`
- rejects `config.models` in swarm config
- builds the plugin registry during startup
- rejects unknown top-level fields in the expanded runtime shape

## Example Override

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

## Used By

- Nova pipeline config loading
- module/gate timeout and retry defaults
- rate-limit handling
- Buster suite timeout
- OpenClaw agent observability
- pre-check linting
- plugin registry construction

## Verification

```bash
node --test tests/skills/nova/pipeline/core/config-profiles.test.mjs
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area foundations
```
