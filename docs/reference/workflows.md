# Workflow Inventory

Status: generated reference
Audience: maintainer, developer

## Summary

This page lists repository GitHub Actions workflows, their trigger surfaces, path filters, jobs, schedules, and command/action references. Use it when docs, deployment, images, tests, skills, plugins, or CI behavior change.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `.github/workflows/build-images.yaml`, `.github/workflows/docs-checks.yaml`

## Workflows

| Workflow | Triggers | Path filters | Schedules | Jobs | Commands/actions |
| --- | --- | --- | --- | --- | --- |
| `.github/workflows/build-images.yaml` (Build Docker Images) | `push`, `schedule`, `workflow_dispatch` | `docker/**`<br>`skills/**`<br>`scripts/buster-namespace-controller.mjs` | `0 3 * * *` | `check-base-image`, `build` | `uses: actions/checkout@v4`<br>`uses: docker/build-push-action@v5`<br>`uses: docker/login-action@v3`<br>`uses: docker/metadata-action@v5`<br>`uses: docker/setup-buildx-action@v3` |
| `.github/workflows/docs-checks.yaml` (Docs Checks) | `pull_request`, `push`, `workflow_dispatch` | `docs/**`<br>`scripts/docs-*.mjs`<br>`scripts/deploy.sh`<br>`package.json`<br>`package-lock.json`<br>`.github/workflows/**`<br>`my-values/**`<br>`charts/kubeclaw/**`<br>`deploy/**`<br>`docker/**`<br>`tests/**`<br>`skills/**`<br>`plugins/**` |  | `docs` | `git diff --check`<br>`node scripts/docs-check.mjs`<br>`npm run docs:check:coverage`<br>`npm run docs:check:generated`<br>`npm run docs:check:refs`<br>`npm run docs:inventory && npm run docs:generate`<br>`uses: actions/checkout@v4`<br>`uses: actions/setup-node@v4` |


<!-- END GENERATED -->

## Drift Guardrails

| Guardrail | Protected surface | Failure signal |
| --- | --- | --- |
| `npm run docs:check:generated` | generated inventory and generated reference pages | stale `docs/generated/inventory/*.json` or stale generated reference Markdown |
| `npm run docs:check:refs` | local Markdown links and cited repository paths in active docs/current audit artifacts | missing doc, script, workflow, chart, config, test, skill, plugin, or root file path |
| `npm run docs:check:coverage` | coverage matrix and topic-map consistency | untracked active docs, invalid ratings, adequate rows without accepted rationale, weak ratings without explicit allowance, vague topic-map weakness language |
| `git diff --check` | whitespace hygiene in changed files | trailing whitespace or conflict-marker-like whitespace errors |

## Maintenance Notes

- Regenerate this page with `npm run docs:inventory && npm run docs:generate` after workflow files change.
- Keep workflow path filters broad enough to catch documented runtime drift. Prefer catching drift over saving a small amount of CI time.
- If a workflow command changes, update the human docs only when the changed command affects a documented operator/developer procedure.

## Generated from

- `../generated/inventory/workflows.json`
- `../../scripts/docs-generate.mjs`
