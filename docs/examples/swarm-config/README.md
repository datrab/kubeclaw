# Swarm Config Examples

Status: examples
Audience: operators, developers

## Purpose

Show safe platform config shapes derived from the current default `swarm.config.json`. These examples are not drop-in production defaults; they show which knobs commonly change.

Runtime source of truth is `charts/kubeclaw/files/config/swarm.config.json`, rendered by `charts/kubeclaw/templates/configmap-swarm-config.yaml`, loaded by `skills/nova/pipeline/core/platform-config.ts`, and validated by `skills/nova/pipeline/core/config.ts`.

## Files

- `local-dev.json`: smaller local/dev shape with custom modules disabled and shorter observability expectations.
- `staging-like.json`: staging-like shape that keeps Redis Buster dispatch, agent observability, linting, review defaults, and plugin registry enabled.

## Use

Validate example JSON:

```bash
jq . docs/examples/swarm-config/local-dev.json
jq . docs/examples/swarm-config/staging-like.json
```

Compare runtime config fields:

```bash
jq '{timeout: .default_timeout_minutes, buster: .agents.buster.dispatch, plugins: .plugins.enabled}' \
  charts/kubeclaw/files/config/swarm.config.json
```

Compare live pod config:

```bash
kubectl -n kubeclaw exec deploy/agent-nova -- \
  node -e 'const c=require("/home/node/.openclaw/swarm.config.json"); console.log(JSON.stringify({timeout:c.default_timeout_minutes, buster:c.agents?.buster?.dispatch, plugins:c.plugins?.enabled}, null, 2))'
```

## Important Keys

| Key area | Meaning | Failure signal |
| --- | --- | --- |
| `agents.*.dispatch` | Chooses `acp`, `subagent`, or `redis`; Buster must use `redis` | config validation error for invalid dispatch or missing `redis_js_path` |
| `fallback_model` | Platform fallback model when project/default overrides are absent | missing or empty value fails config validation |
| `plugins.enabled` and `plugins.*` | Controls startup plugin registry and stage/gate owners | missing registry, unregistered gate type, or missing stage owner errors |
| `buster.runtime.*` | Controls Buster heartbeat, polling, pending reclaim, and stream limits | Buster runtime timing or reclaim behavior drifts |
| `telemetry.enabled` | Enables canonical run-scoped telemetry flow | telemetry docs/contract failures if event shape changes |

## Verify

```bash
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node --test tests/skills/nova/pipeline/core/path-segments.test.mjs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
```

## Limits

These examples are not generated schemas. They do not enumerate every valid field. Use `../../reference/swarm-config.md` for the reference page and keep future generated schema work tracked in `../../open-issues.md` or `../../future-implementation-ideas.md`.
