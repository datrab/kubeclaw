# 1. Verified platform inventory

## Purpose

This artifact answers: **what exists now, what is only designed, and where is each claim proved?**

The exhaustive inventory is generated from inert plugin manifests, runtime-role manifests, package ownership, contracts, and source boundaries:

- [Human-readable inventory](generated/platform-inventory.md)
- [Machine-readable inventory](generated/platform-inventory.json)

## Verified platform model

The implemented platform has these layers:

1. **Nova Core** is the orchestration and canonical pipeline-lifecycle authority.
2. **Plugin Foundation and SDK** provide discovery, validation, grants, isolation, activation, execution, effects, and extension contracts shared by runtime roles.
3. **Worker Core** provides a neutral attempt envelope, worker lifecycle, capacity, execution, and result boundary. It does not own specialist meaning.
4. **Worker Engines** add specialist semantics above Worker Core. Buster is the only packaged engine today.
5. **Plugins** add stages, observers, capability adapters, test providers, and report adapters without embedding their behavior in core.
6. **Contracts and telemetry** carry versioned cross-boundary data.
7. **Runtime packaging and Kubernetes deployment** assemble role-specific bundles and deploy Nova and Buster.

## Names that must be documented accurately

| Name | Current status | Documentation rule |
| --- | --- | --- |
| Nova | Implemented orchestrator runtime role | Give Nova Core its own architecture space and distinguish core authority from installed plugins. |
| Worker Core | Implemented neutral shared package | Explain lifecycle, attempt execution, capacity, signing/digests, progress, failure, and telemetry without Buster terminology. |
| Buster | Implemented separate runtime role and Worker Core–based test engine | Document engine, service boundary, suites, providers, evidence, isolation, and deployment. |
| Forge | Implemented as a dispatched implementation specialist behind `kubeclaw.implementation-agent` | Do not present Forge as a Worker Core engine or separate packaged role unless code changes. Document its protocol and Nova-owned dispatch boundary. |
| Echo | Implemented as a dispatched review specialist governed by `kubeclaw.review` | Do not present Echo as lifecycle authority or a Worker Core engine. Document proposals, evidence verification, policy, reduction, and failure-closed behavior. |
| Prism | Designed contract and preview sidecar; no packaged runtime role or engine implementation | Publish in a clearly labeled “Designed” area until source, packaging, and verification prove implementation. Never list it as a current engine. |

## Inventory coverage

The generated inventory covers all of the following:

- Runtime roles and their exact package/plugin composition.
- Core and engine source boundaries.
- Every `plugin.json` package.
- Every stage, observer, adapter, test-provider, and report-adapter registration.
- Required and provided capabilities for every registration.
- The grantable and core-only capability vocabulary.
- Versioned contract families.
- External capability routes.
- Package ownership and dependency direction.
- Implemented, changing, and designed-only specialist boundaries.

## Truth hierarchy

When sources disagree, documentation uses this order:

1. Versioned contracts and schemas.
2. Runtime manifests and package ownership.
3. Executed verification tests.
4. Production implementation.
5. Deployment manifests and rendered configuration.
6. Generated inventories.
7. Existing prose.
8. Plans, roadmaps, and phase documents.

Existing prose is evidence of intended explanation or past reasoning. It is not proof of current behavior.

## Completion test

This artifact is complete when the generator reports:

- all plugin manifests inventoried;
- all registration surfaces counted;
- all runtime roles and contracts found;
- no component status inferred from prose alone; and
- all conflicted source paths disclosed for later reverification.
