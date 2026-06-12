# Documentation And Contribution Guide

Status: current
Audience: contributors, maintainers

## Purpose

Use this page when contributing docs, examples, gates, hooks, plugins, test suites, linting rules, verification, or pipeline features.

Root-level contribution rules live in `../CONTRIBUTING.md`. This page explains how docs and source-backed behavior changes fit into the active documentation tree.

## Contribution Paths

- Change documentation: start with `developers/documentation-conventions.md`.
- Change deployment behavior: update the relevant deployment/operator page and generated inventory.
- Change pipeline behavior: update `pipeline/`, `operators/running-the-pipeline.md`, and affected reference pages.
- Add a gate: use `developers/adding-gates.md`.
- Add a Buster suite: use `developers/adding-buster-suites.md`.
- Add verification: use `developers/adding-verification.md`.
- Add hooks or plugins: use `developers/hooks-and-plugins.md`.
- Add observability sinks: use `developers/adding-observability-sinks.md`.
- Add or change linting rules: use `developers/linting-rules.md`.

## Source-Backed Rule

Current behavior must be backed by code, manifests, scripts, generated inventory, tests, verified commands, or upstream documentation where another project owns the behavior.

If behavior is unclear, update `open-issues.md`. If an idea is useful but not implemented, update `future-implementation-ideas.md` or `ROADMAP.md`.

## Verification

Run the narrow check for the area you touched. Common checks:

```bash
git diff --check
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area <area>
```

When source changes can affect generated docs, regenerate before checking:

```bash
npm run docs:inventory
npm run docs:generate
npm run docs:check
```

## Related Pages

- `developers/README.md`
- `developers/testing-and-ci.md`
- `developers/adding-verification.md`
- `DOCUMENTATION_AUDIT.md`
- `DOCUMENTATION_REBUILD_PLAN.md`

## Source-Backed Closeout Checklist

Use this checklist when a contribution changes docs, runtime behavior, deployment, or generated reference output.

| Change type | Source of truth | Minimum proof | Failure signal |
| --- | --- | --- | --- |
| Docs-only routing or wording | `docs/**`, `scripts/docs-check.mjs` | `npm run docs:check`; `git diff --check` | stale generated reference, broken doc link, or whitespace error |
| Generated reference docs | `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, `docs/generated/inventory/*.json` | `npm run docs:inventory:check`; `npm run docs:generate:check` | generated file differs from generator output |
| Deployment, chart, values, or secrets | `scripts/deploy.sh`, `my-values/setup-secrets.sh`, `charts/kubeclaw/templates/*.yaml`, `my-values/*.yaml` | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` | Helm render drift, invalid manifest, missing Secret wiring, or outdated resource count |
| Pipeline/runtime behavior | `skills/nova/pipeline/**`, `skills/buster/pipeline/**`, `skills/common/pipeline/**` | narrow `node --test tests/skills/...` plus relevant behavior/contract verifier | lifecycle guard, terminal decision, Redis completion, or telemetry contract failure |
| Buster task/suite behavior | `skills/buster/pipeline/services/task-*.ts`, `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/pipeline/suites/*.ts` | Buster service/suite tests and `check-buster-pipeline-slice-surface.mjs` | malformed task, unknown capability, missing completion/dead-letter before ACK |

Do not treat a successful docs check as proof of runtime behavior. It only proves inventory freshness, generated-reference freshness, and doc-surface checks. Runtime claims need the source-specific checks above.
