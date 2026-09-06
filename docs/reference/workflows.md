# Workflow Inventory

Status: generated reference
Audience: maintainer, developer

## Summary

This page lists repository GitHub Actions workflows, their trigger surfaces, path filters, jobs, schedules, and command/action references. Use it when docs, deployment, images, tests, skills, plugins, or CI behavior change.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `.github/workflows/build-images.yaml`, `.github/workflows/build-ops-mcp.yaml`, `.github/workflows/dependency-updates.yaml`, `.github/workflows/docs-checks.yaml`, `.github/workflows/pipeline-reliability.yaml`, `.github/workflows/promote-runtime.yaml`, `.github/workflows/publish-image-receipts.yaml`, `.github/workflows/release-security.yaml`, `.github/workflows/role-images.yaml`, `.github/workflows/update-checks.yaml`

## Workflows

| Workflow | Triggers | Path filters | Schedules | Jobs | Commands/actions |
| --- | --- | --- | --- | --- | --- |
| `.github/workflows/build-images.yaml` (Build Runtime Images And Skill Bundles) | `push`, `workflow_dispatch` |  |  | `update-policy`, `reliability`, `role-images`, `detect-build-inputs`, `build`, `bundle-skills`, `prism-live-acceptance`, `preserve-receipts` | `bash scripts/deploy.sh prism-e2e`<br>`bash scripts/prepare-image-build-runner.sh`<br>`npm ci --ignore-scripts`<br>`npm run plugin-system:sandbox:build`<br>`uses: ./.github/workflows/pipeline-reliability.yaml`<br>`uses: ./.github/workflows/publish-image-receipts.yaml`<br>`uses: ./.github/workflows/role-images.yaml`<br>`uses: ./.github/workflows/update-checks.yaml`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v5`<br>`uses: actions/upload-artifact@v4`<br>`uses: azure/setup-helm@v4`<br>`uses: azure/setup-kubectl@v4`<br>`uses: docker/build-push-action@v7`<br>`uses: docker/login-action@v4`<br>`uses: docker/metadata-action@v6`<br>`uses: docker/setup-buildx-action@v4`<br>`uses: dorny/paths-filter@v3` |
| `.github/workflows/build-ops-mcp.yaml` (Build Ops Images) | `pull_request`, `push`, `workflow_dispatch` | `versions.json`<br>`scripts/versions.mjs`<br>`tools/ops-mcp/**`<br>`ops/pod/**`<br>`charts/ops-pod/**`<br>`scripts/deploy-ops-pod.sh`<br>`.github/workflows/build-ops-mcp.yaml` |  | `build`, `preserve-receipts` | `bash ops/pod/test-image.sh "$TEST_IMAGE`<br>`bash tools/ops-mcp/test-image.sh "$TEST_IMAGE`<br>`node scripts/versions.mjs --check`<br>`uses: ./.github/workflows/publish-image-receipts.yaml`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v6`<br>`uses: actions/upload-artifact@v4`<br>`uses: azure/setup-helm@v4.3.1`<br>`uses: docker/build-push-action@v7`<br>`uses: docker/login-action@v4`<br>`uses: docker/metadata-action@v6`<br>`uses: docker/setup-buildx-action@v4` |
| `.github/workflows/dependency-updates.yaml` (Dependency updates) | `schedule`, `workflow_dispatch` |  | `15 4 * * *` | `renovate` | `test -n "$APP_ID" && test -n "$APP_KEY`<br>`uses: actions/checkout@v6`<br>`uses: actions/create-github-app-token@v2` |
| `.github/workflows/docs-checks.yaml` (Docs Checks) | `pull_request`, `push`, `workflow_dispatch` | `docs/**`<br>`scripts/docs-*.mjs`<br>`scripts/deploy.sh`<br>`package.json`<br>`package-lock.json`<br>`.github/workflows/**`<br>`my-values/**`<br>`charts/kubeclaw/**`<br>`deploy/**`<br>`docker/**`<br>`tests/**`<br>`skills/**` |  | `docs` | `git diff --check`<br>`node scripts/docs-check.mjs`<br>`npm ci --ignore-scripts`<br>`npm run docs:check:coverage`<br>`npm run docs:check:generated`<br>`npm run docs:check:refs`<br>`npm run docs:inventory && npm run docs:generate`<br>`uses: actions/checkout@v4`<br>`uses: actions/setup-node@v4` |
| `.github/workflows/pipeline-reliability.yaml` (Pipeline reliability) | `pull_request`, `push`, `workflow_call` |  |  | `core-reliability`, `browser-reliability`, `security-reliability`, `prism-postgres-reliability` | `node --test tests/verification/e2e/production-graph-validation.test.mts tests/verification/e2e/real-run-evidence.test.mjs tests/verification/e2e/durable-evidence.test.mjs`<br>`node node_modules/playwright/cli.js install --with-deps chromium`<br>`node tests/verification/contracts/check-pipeline-remote-real-provider.mts`<br>`node tests/verification/contracts/check-prism-postgres-transactions.mts`<br>`node tests/verification/contracts/check-project-compiler.mts`<br>`npm ci --ignore-scripts`<br>`npm run plugin-system:sandbox:build`<br>`npm run typecheck:skills`<br>`npm run verify:reliability`<br>`npm run versions:check`<br>`npm test --prefix skills/buster/plugins/${{ matrix.provider }}`<br>`npm test --workspace @kubeclaw/plugin-security-providers`<br>`sudo apt-get update && sudo apt-get install -y shellcheck shfmt`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v5`<br>`uses: azure/setup-helm@v4` |
| `.github/workflows/promote-runtime.yaml` (Promote image release) | `workflow_dispatch` |  |  | `prepare` | `npm ci --ignore-scripts --no-audit --no-fund`<br>`uses: actions/checkout@v6`<br>`uses: actions/create-github-app-token@v2`<br>`uses: actions/setup-node@v5`<br>`uses: actions/upload-artifact@v4` |
| `.github/workflows/publish-image-receipts.yaml` (Preserve image release receipts) | `workflow_call` |  |  | `preserve` | `uses: actions/checkout@v6`<br>`uses: actions/download-artifact@v4`<br>`uses: actions/setup-node@v5` |
| `.github/workflows/release-security.yaml` (Release security rescan) | `schedule`, `workflow_dispatch` |  | `45 5 * * *` | `scan` | `node scripts/updates/scan-releases.mjs`<br>`node scripts/versions.mjs --check`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v5`<br>`uses: actions/upload-artifact@v4` |
| `.github/workflows/role-images.yaml` (Role image acceptance) | `pull_request`, `workflow_dispatch`, `workflow_call` | `package.json`<br>`package-lock.json`<br>`skills/**`<br>`docker/**`<br>`versions.json`<br>`.dockerignore`<br>`tsconfig.base.json`<br>`scripts/versions.mjs`<br>`scripts/check-role-image.sh`<br>`scripts/prepare-image-build-runner.sh`<br>`.github/workflows/role-images.yaml`<br>`skills/common/plugins/openclaw-agent-observer/**`<br>`contracts/agent-observability/v1/**`<br>`skills/prism/openclaw-plugin/**`<br>`skills/prism/server/agent-bridge.mjs`<br>`charts/kubeclaw/**` |  | `image`, `buster-build`, `application-builds` | `bash scripts/prepare-image-build-runner.sh`<br>`node scripts/versions.mjs --check`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v5`<br>`uses: docker/build-push-action@v7`<br>`uses: docker/setup-buildx-action@v4` |
| `.github/workflows/update-checks.yaml` (Update policy acceptance) | `pull_request`, `workflow_call` |  |  | `policy`, `envoy`, `upstream-checksums` | `bash tests/verification/deployment/check-envoy-image.sh "$(node -p 'require("./versions.json").infrastructure.envoy')`<br>`node scripts/updates/check-upstream-refresh.mjs`<br>`node scripts/updates/verify-release-source.mjs`<br>`npm ci --ignore-scripts --no-audit --no-fund`<br>`uses: actions/checkout@v6`<br>`uses: actions/setup-node@v5`<br>`uses: azure/setup-helm@v4` |


<!-- END GENERATED -->

## Drift Guardrails

| Guardrail | Protected surface | Failure signal |
| --- | --- | --- |
| `npm run docs:check:generated` | generated inventory and generated reference pages | stale `docs/generated/inventory/*.json` or stale generated reference Markdown |
| `npm run docs:check:refs` | local Markdown links and cited repository paths in active docs/current audit artifacts | missing doc, script, workflow, chart, config, test, skill, plugin, or root file path |
| `npm run docs:check:coverage` | documentation topic-map consistency | missing active docs referenced by the topic map or vague topic-map weakness language |
| `git diff --check` | whitespace hygiene in changed files | trailing whitespace or conflict-marker-like whitespace errors |

## Maintenance Notes

- Regenerate this page with `npm run docs:inventory && npm run docs:generate` after workflow files change.
- Keep workflow path filters broad enough to catch documented runtime drift. Prefer catching drift over saving a small amount of CI time.
- If a workflow command changes, update the human docs only when the changed command affects a documented operator/developer procedure.

## Generated from

- `../generated/inventory/workflows.json`
- `../../scripts/docs-generate.mjs`
