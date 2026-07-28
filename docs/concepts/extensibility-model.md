# Extensibility Model

Status: current with planned gaps
Audience: developers, maintainers

## Overview

KubeClaw is extended through source-owned seams: Nova pipeline features, plugin registry modules, gates, Buster suites, verification checks, generated docs references, lint tooling, and observability sinks. Each seam has a different contract and verification surface.

The current seams below remain operational authority. The planned replacement is a self-contained plugin model built around generic stages and per-stage capabilities; see [Future Plugin Boundary](#future-plugin-boundary).

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
| Pipeline stage behavior | `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/runners/gate-runner.ts`; `skills/nova/pipeline/runners/waitable-gate-engine.ts` | `.swarm/progress.json`, stage IDs, module/gate config, runtime policy | lifecycle transitions, artifacts, terminal decisions | `node --test tests/verification/e2e/*.test.mjs` |
| Plugin registry modules | `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/*.ts`; `charts/kubeclaw/files/config/swarm.config.json` | `plugins.enabled`, `plugins.modules`, `plugins.stageOwners`, `plugins.extraModulePaths`, hook/gate manifests | startup-frozen registry, stage owners, gate type owners | `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs` |
| Buster suites | `skills/buster/pipeline/suites/*.ts`; `skills/buster/pipeline/runners/suite-runner.ts`; `skills/buster/pipeline/services/capabilities.ts` | task suites, capability flags, app URL/commands, Kubernetes or browser config | suite verdicts and Buster completion payloads | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| Verification areas | `tests/verification/e2e/*.test.mjs`; `tests/verification/contracts/*.mjs`; `tests/verification/deployment/check-deployment-truth.mjs` | source root, claim-specific fixtures, rendered manifests | pass/fail output and checked counts | `npm run docs:check` |
| Generated docs references | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `scripts/docs-check.mjs` | deploy script, secret helper, values files, generated inventory JSON | generated sections in reference pages | `npm run docs:check` |
| Observability sinks | `skills/nova/pipeline/services/telemetry-sink-contract.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `skills/common/plugins/openclaw-agent-observer/src/index.ts` | flat telemetry event envelopes and sink config | Redis streams, Discord artifacts, observer plugin streams | `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` |
| Agent semantic artifacts | `skills/common/pipeline/agent-artifact.ts`; role-local facades | pipeline-created identity context plus agent semantic payload | validated atomic artifact with pipeline-owned immutable envelope | `node --test tests/skills/common/pipeline/agent-artifact.test.mjs` |

## Runtime Boundaries

- `swarm.config.json` controls platform-level extensibility, including plugin registry fields and Buster dispatch. It is sourced from `charts/kubeclaw/files/config/swarm.config.json` and rendered by `charts/kubeclaw/templates/configmap-swarm-config.yaml`.
- `.swarm/progress.json` controls project work: modules, gates, dependencies, defaults, validation, and optional generators.
- `skills/nova/pipeline/core/config.ts` rejects legacy or misplaced config such as top-level `models` in swarm config and gate types that are not registered at startup.
- Buster task execution must cross the typed Redis task boundary. Nova should not bypass `skills/buster/pipeline/services/task-validation.ts`, `task-queue.ts`, or `task-completion.ts`.
- New agent roles that publish watched artifacts must use the common agent-artifact boundary. Agents own semantic conclusions and evidence; orchestration owns identity, schema, timestamps, paths, and atomic publication.

## Future Plugin Boundary

The planned architecture separates four responsibilities:

```text
package            -> provenance, trust, installation, version
stage registration -> type, schemas, configuration, executor, required capabilities
invocation         -> effective grants, timeout, cancellation, failure containment
core               -> scheduling, lifecycle truth, canonical events, recovery
```

This lets developers introduce stage types that KubeClaw core has never anticipated without granting plugins scheduler authority. A package may contain a cohesive family of stages, but every stage receives an independently authorized capability context. All declared capabilities are required; missing authorization or adapter availability fails startup. Package membership never grants sibling-stage permissions.

The same cohesive package may register immutable observers or capability adapters when ownership, trust, dependencies, and release lifecycle are genuinely shared. Those registrations still have independent authority, failure, checkpoint/readiness, and shutdown contracts.

Discovery reads an inert `plugin.json` manifest and validates package provenance, integrity, schemas, ownership, and requested authority before importing executable modules. Activation happens only after the registry is frozen. Plugin-local durable state is append-only and replayable, invocation contexts are revocable, and package installation or capability grants remain operator-controlled rather than project-controlled.

The planned SDK deliberately excludes speculative policy hooks. Cross-cutting behavior should first be represented as core execution policy, an explicit stage, a capability adapter, schema validation, or an immutable lifecycle observer.

This is planned direction, not current configuration syntax. See [Plugin System Vision](../architecture/plugin-system-vision.md) for lifecycle outcomes, capabilities, package rules, migration constraints, and the extraction sequence.

## Commands

```bash
node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"
npm run docs:check
```

## Failure Signals

- `Pipeline plugin registry is missing` or `disabled` means execution reached a decision-bearing stage without the startup registry assembled by `loadConfig()`.
- `No registered plugin owner` or `No registered gate type owner` means `plugins.stageOwners`, `plugins.modules`, or progress gate definitions do not line up.
- `BUSTER_TASK_MALFORMED` means a Buster task failed validation before execution and should be treated as a dispatch/config contract failure, not as a failing app test.
- Generated docs checks fail when inventory or generated reference pages are stale after script, values, or verifier changes.

## Open Documentation Work

Specialized extension recipes can always use more worked examples, but the current seams, owners, and checks above are source-backed. Do not document a new extension point until its source owner and verification path are clear.
