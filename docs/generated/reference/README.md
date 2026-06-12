# Generated Reference Support

Status: generated-support
Audience: maintainers, documentation agents

## Purpose

Generated reference pages are written into `docs/reference/` from inventory files. This directory documents the generation support path and is reserved for future generated-only fragments if direct reference-page generation becomes too large.

## Regenerate

```bash
npm run docs:inventory
npm run docs:generate
```

## Check

```bash
npm run docs:inventory:check
npm run docs:generate:check
```

## Current Generated Reference Pages

- `../../reference/cli.md`
- `../../reference/secrets.md`
- `../../reference/helm-values.md`
- `../../reference/environment-variables.md`
- `../../reference/verification-commands.md`
- `../../reference/workflows.md`

## Generation Contract

| Step | Owner | Inputs | Outputs | Verification |
| --- | --- | --- | --- | --- |
| Inventory extraction | `scripts/docs-inventory.mjs` | `scripts/deploy.sh`, `my-values/setup-secrets.sh`, Helm values/manifests, `.github/workflows/*.yaml` | `../inventory/deploy-script.json`, `../inventory/secret-setup.json`, `../inventory/helm-values.json`, `../inventory/workflows.json` | `npm run docs:inventory:check` |
| Reference rendering | `scripts/docs-generate.mjs` | generated inventory JSON files | `../../reference/cli.md`, `../../reference/secrets.md`, `../../reference/helm-values.md`, `../../reference/environment-variables.md`, `../../reference/verification-commands.md`, `../../reference/workflows.md` | `npm run docs:generate:check` |
| Active docs validation | `scripts/docs-check.mjs` | active Markdown under `../../`, excluding `../../archive/` | local links, generated markers, required operator sections, diagram metadata | `npm run docs:check` |

## Maintenance Rules

- Do not hand-edit generated sections between `<!-- BEGIN GENERATED: source-backed reference -->` and `<!-- END GENERATED -->`; change `scripts/docs-inventory.mjs` or `scripts/docs-generate.mjs` instead.
- When `scripts/deploy.sh`, `my-values/setup-secrets.sh`, values files, or workflow files change, run `npm run docs:inventory` and `npm run docs:generate`.
- Generated pages currently cover the first reference slice only: deployment CLI, secrets, Helm values, environment variables, verification commands, and workflow inventory. Deeper generated schemas for OpenClaw config, swarm config, telemetry events, and artifacts remain future work.
- If generation fails, inspect the JSON in `../inventory/` before editing reference pages; stale generated output should be fixed at the source or renderer.
