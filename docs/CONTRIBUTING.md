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
