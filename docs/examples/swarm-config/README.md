# Swarm Config Examples

Status: examples
Audience: operators, developers

## Purpose

Show safe compact platform config shapes derived from the current `standard` profile. These examples are not alternate product profiles; they show how to keep the standard baseline and override a few known effective paths.

Authored source of truth is `charts/kubeclaw/files/config/swarm.config.json`. It is rendered by `charts/kubeclaw/templates/configmap-swarm-config.yaml`, expanded through `skills/nova/pipeline/core/config-profiles/standard.json` by `skills/nova/pipeline/core/platform-config.ts`, and validated by `skills/nova/pipeline/core/config.ts`.

## Files

- `local-dev.json`: compact standard-profile example with shorter module/review/suite limits.
- `staging-like.json`: compact standard-profile example with longer module/review/suite limits.

## Use

Validate example JSON:

```bash
jq . docs/examples/swarm-config/local-dev.json
jq . docs/examples/swarm-config/staging-like.json
```

Compare authored compact config fields:

```bash
jq '{profile, features, tuning, override_paths: (.overrides | keys)}' \
  charts/kubeclaw/files/config/swarm.config.json
```

Compare live pod config:

```bash
kubectl -n kubeclaw exec deploy/agent-nova -- \
  node -e 'const c=require("/home/node/.openclaw/swarm.config.json"); console.log(JSON.stringify({profile:c.profile, features:c.features, tuning:c.tuning, override_paths:Object.keys(c.overrides||{})}, null, 2))'
```

## Important Keys

| Key area | Meaning | Failure signal |
| --- | --- | --- |
| `profile` | Selects the product baseline; currently only `standard` is supported | unknown profile validation error |
| `features` | Declares the standard feature set explicitly | non-standard feature declaration validation error |
| `tuning` | Declares the standard safety/retention/alert/log/check/determinism intent | non-standard tuning declaration validation error |
| `overrides` | Structured exceptions applied after standard profile expansion | unknown override path validation error |
| `discord_webhook_url` | Runtime-secret injection target; usually empty in committed files | non-string validation error |

## Verify

```bash
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node --test tests/skills/nova/pipeline/core/path-segments.test.mjs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
```

## Limits

These examples are not generated schemas. They do not enumerate every valid field. Use `../../reference/swarm-config.md` for the reference page and keep future generated schema work tracked in `../../open-issues.md` or `../../future-implementation-ideas.md`.
