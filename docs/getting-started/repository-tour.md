# Repository Tour

Status: current
Audience: new contributor

## Purpose

Orient new readers to the repository before they edit docs, deployment files, pipeline code, or verification. This page is a tour, not an exhaustive implementation map; use `../developers/codebase-tour.md` and the linked reference pages for deeper ownership detail.

## Top-Level Directories

| Path | What it owns | Start here when |
| --- | --- | --- |
| `charts/kubeclaw/` | shared Helm chart for Nova and Buster agents, ConfigMaps, Services, PVCs, RBAC, Secrets, and runtime config rendering | changing rendered Kubernetes resources |
| `my-values/` | production values and infrastructure manifests for Nova, Buster, Redis, Qdrant, LiteLLM, PostgreSQL, registries, Tailscale, and NetworkPolicies | changing deployment shape or optional components |
| `scripts/` | deployment helper, docs inventory/generation/check tooling, setup helpers, and pipeline-light scripts | changing operator commands or generated references |
| `docker/` | general, sandbox, and Prism preview image definitions | changing runtime image contents or build context |
| `skills/nova/` | Nova pipeline orchestrator entrypoint, CLI, config loading, plugin registry, runners, gates, telemetry, status store, and helpers | changing orchestration behavior |
| `skills/buster/` | Buster Redis worker, task validation/completion, deterministic suites, browser tooling, sandbox runtime support | changing test execution behavior |
| `skills/common/` | shared pipeline contracts, transports, lifecycle, egress, telemetry, security, and service helpers | changing code shared by Nova and Buster |
| `plugins/openclaw-agent-observer/` | OpenClaw observer plugin packaged into images and gateway config | changing observer plugin routing or ingestion |
| `tests/verification/` | local behavior, contract, runtime, and deployment checks | proving source-backed documentation claims or behavior changes |
| `tests/skills/` | focused Node tests for Nova, Buster, common pipeline helpers, and docs-related helpers | validating implementation units |
| `docs/` | active docs, examples, generated reference, and archived historical material | changing user-facing documentation |

## Important Active Docs Areas

- `docs/getting-started/`: reader orientation and first checks.
- `docs/concepts/`: mental models and ownership boundaries.
- `docs/architecture/`: source-backed system, component, security, lifecycle, and observability structure.
- `docs/deployment/`: setup, values, secrets, infrastructure, images, networking, and verification.
- `docs/operators/`: live operating, troubleshooting, recovery, maintenance, security, and observability.
- `docs/developers/`: contributor guides, codebase tour, extension workflows, testing, and docs conventions.
- `docs/pipeline/`: Nova/Buster runtime architecture, flow, modules/gates, recovery, telemetry, and artifacts.
- `docs/reference/`: generated and manual references.
- `docs/examples/`: safe examples for values, secrets, swarm config, and progress JSON.
- `docs/archive/`: historical material only. Do not treat archived plans as current behavior until source-verified.

## Generated And Example Artifacts

| Artifact | Owner | How to verify |
| --- | --- | --- |
| `docs/generated/inventory/deploy-script.json` | `scripts/docs-inventory.mjs` reading `scripts/deploy.sh` | `npm run docs:inventory:check` |
| `docs/generated/inventory/secret-setup.json` | `scripts/docs-inventory.mjs` reading `my-values/setup-secrets.sh` | `npm run docs:inventory:check` |
| `docs/generated/inventory/helm-values.json` | `scripts/docs-inventory.mjs` reading chart and values files | `npm run docs:inventory:check` |
| generated sections in `docs/reference/*.md` | `scripts/docs-generate.mjs` | `npm run docs:generate:check` |
| `docs/examples/swarm-config/*.json` | docs examples compared to config validation docs | `jq . docs/examples/swarm-config/*.json` |
| `docs/examples/progress-json/*.json` | docs examples compared to pipeline config/status docs | `jq . docs/examples/progress-json/*.json` |

## First Checks

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
npm run docs:check
```

## Source Of Truth Order

For documentation and review work, prefer current source files and rendered manifests over archived plans. If a behavior is unclear, inspect the owning code and verification script before writing a doc claim.

Suggested order:

1. current source, scripts, templates, values, generated inventory, and tests
2. rendered manifests or command output from this repo
3. active docs that cite those sources
4. archived plans only as historical context

## Failure Signals

- A path in docs that does not exist should be corrected or removed before handoff.
- A page under `docs/archive/` should not be used as current authority unless an active doc also cites current source.
- A generated reference mismatch means the source, inventory, and generated output need to be reconciled.
- A new top-level runtime owner should be added here, in `../developers/codebase-tour.md`, and in relevant architecture/developer docs.
