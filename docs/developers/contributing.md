# Contributing To KubeClaw

Status: current
Audience: developers, maintainers

## Purpose

Give contributors a docs-local path for code, docs, examples, and verification changes.

## Start Here

1. Read root `CONTRIBUTING.md` for repository-level expectations.
2. Read `documentation-conventions.md` before changing docs or examples.
3. Read `testing-and-ci.md` before changing source, verification, generated docs, or deployment behavior.
4. Use the focused guide for the behavior you are changing.

## Focused Guides

- Pipeline features: `adding-pipeline-features.md`
- Gates: `adding-gates.md`
- Buster suites: `adding-buster-suites.md`
- Verification: `adding-verification.md`
- Hooks and plugins: `hooks-and-plugins.md`
- Agent runtime adaptation: `replacing-agent-runtime.md`
- Observability sinks: `adding-observability-sinks.md`
- Linting rules: `linting-rules.md`

## Source Ownership

| Work type | Main paths to inspect | Common outputs | Checks |
| --- | --- | --- | --- |
| Documentation | `docs/**`; `scripts/docs-check.mjs`; `docs/developers/documentation-conventions.md` | active Markdown, diagrams, examples, audit artifacts | `npm run docs:check`; `npm run docs:check` |
| Generated reference | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `docs/generated/inventory/*.json`; `docs/reference/*.md` | generated inventory JSON and generated reference sections | `npm run docs:inventory:check`; `npm run docs:generate:check` |
| Deployment | `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/templates/*.yaml`; `my-values/*.yaml`; `my-values/infra/*.yaml` | rendered manifests, Secrets, PVCs, NetworkPolicies, Services | deployment truth and Helm render |
| Nova pipeline | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/*.ts`; `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/*.ts` | lifecycle state, artifacts, terminal decisions, telemetry | pipeline E2E behavior and contract checks |
| Buster pipeline | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/*.ts`; `skills/buster/pipeline/suites/*.ts` | Redis task/completion/dead-letter streams, suite verdicts | Buster contract check and focused unit tests |

## Commands

Run the narrowest checks that match the change. For broad docs/deployment work, use:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

For pipeline or worker changes, add:

```bash
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
```

## Failure Signals

- Missing source paths in docs mean the claim should be removed, corrected, or marked as an open question.
- Generated reference drift means the generator or inventory changed without regenerating.
- A contract check failure means a public surface changed and the matching reference/developer doc probably needs an update.
- Deployment truth failure means rendered Kubernetes behavior no longer matches docs, values, templates, scripts, or expected security posture.

## Before Closing A Change

- Make sure new doc links resolve.
- Make sure new source/test/config paths exist.
- Keep historical docs labeled as historical.
- Update `../open-issues.md` for behavior that cannot be verified from source.
- Update generated docs through `scripts/docs-inventory.mjs` or `scripts/docs-generate.mjs` instead of editing generated sections by hand.
