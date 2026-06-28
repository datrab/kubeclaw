# Local Development

Status: current
Audience: developer, maintainer

## Purpose

Set up enough local confidence to edit docs, chart files, values, pipeline code, examples, or verification scripts.

## Prerequisites

The repository verification scripts are Node-based. Deployment checks also require Helm. Some image and runtime paths use tools installed into the runtime containers, but local documentation, generated reference, and chart checks do not require the full container toolchain.

Useful local tools:

- `node` and `npm`
- `helm`
- `jq`
- `git`
- `kubectl` for live namespace inspection
- `docker` only if you are editing Dockerfiles or reproducing image build issues outside the normal deploy path

## Basic Checks

From the repository root:

```bash
npm run docs:check
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

For real E2E scenarios:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node --test tests/verification/e2e/*.test.mjs
```

For generated references:

```bash
npm run docs:inventory:check
npm run docs:generate:check
```

## Change-To-Check Map

| Change | Inspect | Run |
| --- | --- | --- |
| Docs links, diagrams, examples, conventions | `docs/**`; `scripts/docs-check.mjs`; `scripts/docs-check.mjs` | `npm run docs:check`; docs check |
| Generated reference output | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `docs/generated/inventory/*.json` | `npm run docs:inventory:check`; `npm run docs:generate:check` |
| Deployment script, values, chart, images | `scripts/deploy.sh`; `my-values/**`; `charts/kubeclaw/**`; `docker/**`; `.github/workflows/build-images.yaml` | Helm render; deployment truth; deployment-surface behavior area |
| Nova pipeline | `skills/nova/pipeline/cli.ts`; `core/**`; `runners/**`; `services/**` | pipeline E2E behavior area; pipeline/status-store contract checks |
| Buster worker | `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/**`; `skills/buster/pipeline/suites/**` | Buster contract check; focused Buster unit tests |
| Telemetry and observer | `skills/nova/pipeline/services/telemetry*.ts`; `skills/common/pipeline/telemetry.ts`; `plugins/openclaw-agent-observer/src/**` | telemetry-docs behavior area; telemetry contract check |

## Expected Artifacts

- Helm render output in `/tmp/kubeclaw-nova-render.yaml` and `/tmp/kubeclaw-buster-render.yaml` when you run the commands above.
- Generated inventory JSON under `docs/generated/inventory/` when inventory is regenerated.
- Generated reference sections in `docs/reference/*.md` when `scripts/docs-generate.mjs` changes.
- Verification output with pass/fail counts or `{"ok":true,...}` contract summaries.

## Failure Signals

- `docs:inventory:check` or `docs:generate:check` failure means generated files are stale; regenerate or update the generator.
- Deployment truth failure means rendered source behavior and docs/examples are out of sync.
- A real E2E verifier failure should be treated as source or test drift, not a documentation-only problem, until the failing assertion is understood.
- `git diff --check` failure means whitespace errors need cleanup before handoff.

## Working Rules

- If you change Helm templates or production values, render Nova and Buster.
- If you change deployment documentation, run the deployment truth check.
- If you change docs layout, run `docs-surface`.
- If you change pipeline E2E behavior, choose the narrow behavior area that covers the modified surface and add coverage when needed.
- If behavior cannot be verified from local source or tests, document it as an open question instead of a fact.
