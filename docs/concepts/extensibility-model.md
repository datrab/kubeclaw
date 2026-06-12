# Extensibility Model

Status: current with planned gaps
Audience: developers, maintainers

## Overview

KubeClaw is extended through source-owned seams: Nova pipeline features, plugin registry modules, gates, Buster suites, verification checks, generated docs references, lint tooling, and observability sinks. Each seam has a different contract and verification surface.

## Current Extension Areas

- Pipeline features: `../developers/adding-pipeline-features.md`
- Gates: `../developers/adding-gates.md`
- Buster suites: `../developers/adding-buster-suites.md`
- Verification: `../developers/adding-verification.md`
- Hooks and plugins: `../developers/hooks-and-plugins.md`
- Observability sinks: `../developers/adding-observability-sinks.md`
- Linting rules: `../developers/linting-rules.md`

## Extension Seams

| Extension | Source owner | Inputs | Outputs | Verification |
| --- | --- | --- | --- | --- |
| Pipeline stage behavior | `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/runners/gate-runner.ts`; `skills/nova/pipeline/runners/waitable-gate-engine.ts` | `.swarm/progress.json`, stage IDs, module/gate config, runtime policy | lifecycle transitions, artifacts, terminal decisions | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline` |
| Plugin registry modules | `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/*.ts`; `charts/kubeclaw/files/config/swarm.config.json` | `plugins.enabled`, `plugins.modules`, `plugins.stageOwners`, `plugins.extraModulePaths`, hook/gate manifests | startup-frozen registry, stage owners, gate type owners | `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs` |
| Buster suites | `skills/buster/pipeline/suites/*.ts`; `skills/buster/pipeline/runners/suite-runner.ts`; `skills/buster/pipeline/services/capabilities.ts` | task suites, capability flags, app URL/commands, Kubernetes or browser config | suite verdicts and Buster completion payloads | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| Verification areas | `tests/verification/behavior/areas/*.mjs`; `tests/verification/contracts/*.mjs`; `tests/verification/deployment/check-deployment-truth.mjs` | source root, claim-specific fixtures, rendered manifests | pass/fail output and checked counts | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface` |
| Generated docs references | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `scripts/docs-check.mjs` | deploy script, secret helper, values files, generated inventory JSON | generated sections in reference pages | `npm run docs:check` |
| Observability sinks | `skills/nova/pipeline/services/telemetry-sink-contract.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `plugins/openclaw-agent-observer/src/index.ts` | flat telemetry event envelopes and sink config | Redis streams, Discord artifacts, observer plugin streams | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` |

## Runtime Boundaries

- `swarm.config.json` controls platform-level extensibility, including plugin registry fields and Buster dispatch. It is sourced from `charts/kubeclaw/files/config/swarm.config.json` and rendered by `charts/kubeclaw/templates/configmap-swarm-config.yaml`.
- `.swarm/progress.json` controls project work: modules, gates, dependencies, defaults, validation, and optional generators.
- `skills/nova/pipeline/core/config.ts` rejects legacy or misplaced config such as top-level `models` in swarm config and gate types that are not registered at startup.
- Buster task execution must cross the typed Redis task boundary. Nova should not bypass `skills/buster/pipeline/services/task-validation.ts`, `task-queue.ts`, or `task-completion.ts`.

## Commands

```bash
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs
npm run docs:check
```

## Failure Signals

- `Pipeline plugin registry is missing` or `disabled` means execution reached a decision-bearing stage without the startup registry assembled by `loadConfig()`.
- `No registered plugin owner` or `No registered gate type owner` means `plugins.stageOwners`, `plugins.modules`, or progress gate definitions do not line up.
- `BUSTER_TASK_MALFORMED` means a Buster task failed validation before execution and should be treated as a dispatch/config contract failure, not as a failing app test.
- Generated docs checks fail when inventory or generated reference pages are stale after script, values, or verifier changes.

## Open Documentation Work

Specialized extension recipes can always use more worked examples, but the current seams, owners, and checks above are source-backed. Do not document a new extension point until its source owner and verification path are clear.
