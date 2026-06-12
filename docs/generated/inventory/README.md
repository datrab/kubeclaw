# Generated Inventory

Status: generated-support
Audience: maintainers, documentation agents

## Purpose

This directory contains stable JSON inventory extracted from source files. Reference and operator docs use these files to avoid copying drift-prone facts by hand.

Use this directory when updating generated reference docs, auditing whether a script/values claim is source-backed, or checking why a reference page changed after `npm run docs:generate`.

## Inventory Files

| File | Generated from | Contains | Used by |
| --- | --- | --- | --- |
| `deploy-script.json` | `scripts/deploy.sh` | deployment commands, command cases, environment variables/defaults, function names, source anchors, component flags | `docs/reference/cli.md`, `docs/reference/environment-variables.md`, `docs/reference/verification-commands.md`, deployment/operator docs |
| `secret-setup.json` | `my-values/setup-secrets.sh` | secret setup environment variables, defaults, required Secrets, copied/prompted/generated keys | `docs/reference/secrets.md`, `docs/reference/environment-variables.md`, secret examples |
| `helm-values.json` | `charts/kubeclaw/values.yaml`, `my-values/*.yaml`, and infra values/manifests | chart/value inventory for agent and infrastructure docs | `docs/reference/helm-values.md`, values/deployment pages |
| `workflows.json` | `.github/workflows/*.yaml` | workflow names, triggers, path filters, schedules, jobs, command refs, and action refs | `docs/reference/workflows.md`, testing/CI docs |

## Regenerate

From the repository root:

```bash
npm run docs:inventory
npm run docs:generate
```

## Check

```bash
npm run docs:inventory:check
npm run docs:generate:check
npm run docs:check:generated
npm run docs:check:refs
npm run docs:check:coverage
npm run docs:check
```

The inventory check fails when generated inventory files do not match the current source-derived output. The generate check fails when generated reference pages do not match the current inventory and `scripts/docs-generate.mjs`.

## Expected Artifacts

- `docs/generated/inventory/deploy-script.json`
- `docs/generated/inventory/secret-setup.json`
- `docs/generated/inventory/helm-values.json`
- `docs/generated/inventory/workflows.json`
- generated sections in `docs/reference/cli.md`
- generated sections in `docs/reference/environment-variables.md`
- generated sections in `docs/reference/helm-values.md`
- generated sections in `docs/reference/secrets.md`
- generated sections in `docs/reference/verification-commands.md`
- generated sections in `docs/reference/workflows.md`

## Failure Signals

- `docs:inventory:check` prints stale JSON when a source script or values file changed without regenerating inventory.
- `docs:generate:check` prints stale reference pages when inventory changed or generated rendering changed.
- `docs:check` fails if a generated reference page loses the required `BEGIN GENERATED` or `END GENERATED` marker.
- A generated reference page that needs manual prose should keep that prose outside the generated markers.

## Current Coverage

- `deploy-script.json` from `scripts/deploy.sh`
- `secret-setup.json` from `my-values/setup-secrets.sh`
- `helm-values.json` from chart defaults, Nova/Buster values, and infrastructure values/manifests
- `workflows.json` from `.github/workflows/*.yaml`

## Limits And Next Targets

This inventory is intentionally first-slice coverage, not a complete schema catalog. Future generated inventory candidates:

- rendered Nova and Buster manifests
- pipeline CLI flags
- environment variables from config loaders and templates
- OpenClaw and swarm config fields
- progress JSON fields and examples
- Redis streams, status keys, and artifact paths
- telemetry events and observability sinks
- Buster suites, task config, and linting rules
- deeper workflow sanity metadata beyond the concise workflow inventory
- verification commands and smoke checks
