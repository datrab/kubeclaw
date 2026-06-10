# Swarm Config Examples

Status: examples
Audience: operators, developers

## Purpose

Show safe platform config shapes derived from the current default `swarm.config.json`. These examples are not drop-in production defaults; they show which knobs commonly change.

## Files

- `local-dev.json`: smaller local/dev shape with custom modules disabled and shorter observability expectations.
- `staging-like.json`: staging-like shape that keeps Redis Buster dispatch, agent observability, linting, review defaults, and plugin registry enabled.

## Use

Validate example JSON:

```bash
jq . docs/examples/swarm-config/local-dev.json
jq . docs/examples/swarm-config/staging-like.json
```

Compare runtime config:

```bash
kubectl -n kubeclaw exec deploy/agent-nova -- \
  node -e 'const c=require("/home/node/.openclaw/swarm.config.json"); console.log(JSON.stringify({timeout:c.default_timeout_minutes, buster:c.agents?.buster?.dispatch, plugins:c.plugins?.enabled}, null, 2))'
```
