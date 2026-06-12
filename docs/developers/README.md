# Developer Guides

Status: current
Audience: developer, maintainer

## Purpose

Use this section when changing KubeClaw source code, verification, generated docs, examples, or documentation. It is the routing page for contributor work; the source owner and verifier should be clear before a change lands.

## Guides

- [Contributing to KubeClaw](contributing.md)
- [Codebase tour](codebase-tour.md)
- [Adding pipeline features](adding-pipeline-features.md)
- [Adding gates](adding-gates.md)
- [Hooks and plugins](hooks-and-plugins.md)
- [Replacing or adapting the agent runtime](replacing-agent-runtime.md)
- [Adding Buster suites](adding-buster-suites.md)
- [Adding observability sinks](adding-observability-sinks.md)
- [Linting rules](linting-rules.md)
- [Adding verification](adding-verification.md)
- [Testing and CI](testing-and-ci.md)
- [Documentation conventions](documentation-conventions.md)

## Contributor Paths

| Change | Start with | Source owner | Minimum verification |
| --- | --- | --- | --- |
| Docs or examples | `contributing.md`; `documentation-conventions.md`; `../examples/README.md` | `docs/**`; `scripts/docs-check.mjs`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs` | `npm run docs:check`; docs-surface behavior area for layout/check changes |
| Pipeline orchestration | `adding-pipeline-features.md`; `adding-gates.md`; `../pipeline/README.md` | `skills/nova/pipeline/cli.ts`; `core/config.ts`; `runners/*.ts`; `services/status-store.ts` | pipeline behavior area and affected contract checks |
| Plugin or hook behavior | `hooks-and-plugins.md`; `../concepts/extensibility-model.md` | `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/*.ts`; `charts/kubeclaw/files/config/swarm.config.json` | config plugin registry test |
| Buster suites or worker tasks | `adding-buster-suites.md`; `../pipeline/workers-and-buster.md` | `skills/buster/pipeline/suites/*.ts`; `services/task-queue.ts`; `services/task-validation.ts`; `services/task-completion.ts` | Buster contract check and focused Buster unit tests |
| Observability | `adding-observability-sinks.md`; `../reference/observability-sinks.md` | `skills/nova/pipeline/services/telemetry*.ts`; `skills/common/pipeline/telemetry.ts`; `plugins/openclaw-agent-observer/src/index.ts` | telemetry-docs behavior area and telemetry contract check |
| Deployment or values | `../deployment/README.md`; `../deployment/values-files.md` | `scripts/deploy.sh`; `my-values/*.yaml`; `charts/kubeclaw/templates/*.yaml` | deployment truth and Helm render for Nova/Buster |

## Development Commands

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
git diff --check
```

## Failure Signals

- A source change without a focused verifier is not ready unless the gap is documented in `../open-issues.md`.
- A docs change that edits generated sections directly will be overwritten by `scripts/docs-generate.mjs`; update the generator or inventory instead.
- A deployment change that passes Markdown checks but fails deployment truth has drifted from rendered manifests or script behavior.
- A Buster task shape change that bypasses validation can break ACK/dead-letter guarantees.

## Development Principle

The current behavior authority is source code plus verification. Archived plans and historical docs can explain why a surface exists, but they do not override current code.
