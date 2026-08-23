# 4. Documentation-to-code evidence matrix

## Evidence contract

Every published technical page declares:

- `status`: implemented, experimental, designed, deprecated, or historical;
- `owner`: component or documentation owner;
- `evidence`: repository paths and symbols;
- `verification`: automated checks or reproducible commands;
- `applies_to`: contract/runtime/release versions; and
- `last_verified`: release commit, generated during publication.

Website source links resolve to a release tag or commit SHA. A build-time resolver turns repository paths and optional symbols into GitHub permalinks. Moving `main` links are not accepted as evidence for versioned documentation.

## Matrix

| Documentation domain | Canonical source evidence | Behavioral proof | Published destination |
| --- | --- | --- | --- |
| Platform composition and runtime roles | `packaging/runtime/roles/nova.json`; `packaging/runtime/roles/buster.json`; `packaging/runtime/package-ownership.json` | `scripts/check-runtime-role-manifests.mjs`; `scripts/check-runtime-package-ownership.mjs` | `/understand/architecture/interactive-platform-map`; `/reference/runtime-roles` |
| Nova Core public boundary | `skills/nova/core/src/index.ts`; `skills/nova/core/package.json` | `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts` | `/understand/architecture/nova-core/responsibilities-and-non-responsibilities` |
| Nova graph execution and lifecycle authority | `skills/nova/core/execution/`; `skills/nova/core/lifecycle/`; `skills/nova/core/state/`; `skills/nova/core/effects/` | `tests/verification/contracts/check-plugin-system-v2-engine.mjs`; `tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs`; `tests/verification/contracts/check-plugin-system-v2-resume.mjs` | `/understand/architecture/nova-core/pipeline-graph-and-run-lifecycle` |
| Plugin v2 normative contract | `skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`; `skills/common/plugin-runtime/sdk/src/` | `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`; `tests/verification/contracts/check-plugin-agent-output-contracts.mts` | `/extend/plugins/mental-model-and-package-anatomy`; `/reference/plugin-api/v2` |
| Plugin discovery, registry, provenance, and freeze | `skills/common/plugin-runtime/foundation/registry/`; `skills/common/plugin-runtime/foundation/packages/` | `tests/verification/contracts/check-plugin-system-v2-registry.mjs`; `tests/verification/contracts/check-plugin-system-v2-installation.mjs`; `tests/verification/contracts/check-plugin-system-v2-import-safety.mjs` | `/understand/architecture/plugin-foundation/discovery-registration-and-freeze`; `/extend/plugins/install-replace-remove-and-version` |
| Capability vocabulary and grants | `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts`; `skills/common/plugin-runtime/foundation/registry/capabilities.ts` | `tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs`; `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs` | `/extend/plugins/capabilities-and-grants`; `/reference/capabilities` |
| Plugin isolation and package boundaries | `skills/common/plugin-runtime/foundation/isolation/`; `scripts/build-plugin-sandbox.mjs` | `tests/verification/contracts/check-plugin-system-v2-isolation.mjs`; `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs` | `/understand/architecture/security/package-and-process-isolation`; `/extend/plugins/test-package-and-publish` |
| Stage extension point | manifest `stages` in every `skills/**/plugin.json`; SDK stage types | package tests and `tests/verification/contracts/check-plugin-system-v2-e2e.mjs` | `/extend/extension-points/stage` |
| Observer extension point | manifest `observers` in every `skills/**/plugin.json`; observer contracts in the v2 schema | `tests/verification/contracts/check-plugin-system-v2-phase11.mts`; observer package tests | `/extend/extension-points/observer` |
| Capability-adapter extension point | manifest `adapters` in every `skills/**/plugin.json`; capability invocation SDK types | capability runtime/security checks and adapter live-function tests | `/extend/extension-points/capability-adapter` |
| Test-provider extension point | `skills/common/plugin-runtime/foundation/registry/build.ts`; `skills/common/plugin-runtime/foundation/registry/types.ts`; plugin v2 `testProviderRegistration` schema | `tests/verification/contracts/check-pipeline-test-provider-registry.mts`; `tests/verification/e2e/provider-catalog.test.mjs` | `/extend/extension-points/test-provider` |
| Report-adapter extension point | `skills/common/plugin-runtime/foundation/registry/build.ts`; `skills/common/plugin-runtime/foundation/registry/types.ts`; plugin v2 `reportAdapterRegistration` schema | `tests/verification/contracts/check-pipeline-report-adapter-registry.mts`; `tests/verification/contracts/check-pipeline-report-adapter-runtime.mts` | `/extend/extension-points/report-adapter` |
| All installed plugins | every `skills/**/plugin.json`; adjacent schemas, `src/`, tests, and README when present | `scripts/plugin-system-inventory.mjs`; `scripts/verify-plugin-packages.mjs`; `scripts/verify-plugin-live-capabilities.mjs` | `/extend/plugin-catalogue/*` |
| Worker Core wire contract | `contracts/pipeline-worker-core/v1`; specifically `contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v1.schema.json` | `tests/verification/contracts/check-pipeline-worker-core-contracts.mts` | `/understand/architecture/worker-core/boundary-and-contract`; `/reference/contracts/pipeline-worker-core/v1` |
| Worker attempt execution and local lifecycle | `skills/worker/core/worker/attempt-executor.ts`; `skills/worker/core/worker/local-runtime.ts`; `skills/worker/core/src/index.ts` | `tests/verification/contracts/check-pipeline-worker-attempt-executor.mts`; `tests/verification/contracts/check-pipeline-worker-local-runtime.mts` | `/understand/architecture/worker-core/attempt-lifecycle`; `/extend/engines/worker-core-contract` |
| Buster engine and runtime service | `skills/buster/engine/`; `skills/buster/runtime.ts`; `docker/buster-runtime-entrypoint.sh` | worker-core checks; remote runtime/process restart checks; Buster package tests | `/understand/architecture/worker-engines/buster`; `/use/operate/buster-jobs`; `/extend/engines/buster-reference` |
| Pipeline test-gate contract | `contracts/pipeline-test-gate/v1`; `skills/nova/core/test-gates/`; `skills/buster/engine/test-gates/` | all `verify:test-gate:*` package scripts and `tests/verification/contracts/check-pipeline-test-gate-traceability.mjs` | `/understand/architecture/worker-engines/buster`; `/reference/contracts/pipeline-test-gate/v1` |
| Remote Nova-to-Buster dispatch, recovery, and import | `skills/nova/core/test-gates/remote-dispatch.ts`; `skills/buster/engine/test-gates/remote-plan-service.ts`; `skills/nova/core/test-gates/remote-result-import.ts` | `tests/verification/contracts/check-pipeline-remote-plan-runtime.mts`; `check-pipeline-remote-process-restart.mts`; `check-pipeline-remote-result-import.mts` | `/understand/architecture/request-to-result`; `/use/recover/failed-dispatch-and-import` |
| Forge specialist boundary | `skills/nova/plugins/implementation-agent/`; Forge target configuration in `my-values/nova-values.yaml` | implementation-agent protocol and live-function tests | `/understand/architecture/specialists/forge`; `/use/operate/forge-and-echo-sessions`; `/extend/plugin-catalogue/kubeclaw.implementation-agent` |
| Echo specialist and review governance | `skills/nova/plugins/review/`; Echo target configuration in `my-values/nova-values.yaml` | review package unit/live/boundary tests after current conflicts resolve | `/understand/architecture/specialists/echo`; `/use/operate/forge-and-echo-sessions`; `/extend/plugin-catalogue/kubeclaw.review` |
| Prism current boundary | design sources under `docs/architecture/prism-*`; preview sidecar in `my-values/nova-values.yaml`; absence from `packaging/runtime/roles/` | runtime role/package inventory proves no Prism engine package | `/understand/architecture/worker-engines/prism-designed`; `/status/current` |
| Prism contract family | `contracts/prism` | `npm run verify:prism:contracts` | `/reference/contracts/prism/v1` |
| Agent observability contract | `contracts/agent-observability/v1`; `skills/common/plugins/agent-observability/`; `skills/common/plugins/openclaw-agent-events/` | contract compilation and plugin package tests | `/understand/architecture/communication-and-telemetry/event-and-evidence-flow`; `/reference/contracts/agent-observability/v1` |
| Pipeline observability and durable delivery | `contracts/pipeline-observability/v1`; `skills/common/plugin-runtime/foundation/observability/`; `skills/nova/core/observability/` | all `check-pipeline-observability-*` contract checks | `/understand/architecture/communication-and-telemetry/durable-delivery`; `/reference/contracts/pipeline-observability/v1` |
| Telemetry event catalogue | `contracts/telemetry/v1`; its manifest, catalogue, event, payload, and bundle schemas | `scripts/generate-telemetry-contracts.mjs`; telemetry contract checks in the verification suites | `/understand/architecture/communication-and-telemetry/event-and-evidence-flow`; `/reference/contracts/telemetry/v1` |
| Capability-provider routing | `packaging/runtime/external-capabilities.json`; chart capability provider templates; runtime adapter manifests | `tests/verification/contracts/check-pipeline-remote-runtime-config.mts`; rendered deployment verification | `/understand/architecture/communication-and-telemetry/capability-routing`; `/use/configure/capability-providers` |
| Kubernetes deployment | `charts/kubeclaw/`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `scripts/deploy.sh` | `tests/verification/deployment/check-deployment-truth.mjs`; chart rendering in documentation inventory generation | `/use/deploy/*`; `/understand/architecture/deployment-topologies/nova-and-buster-on-kubernetes` |
| Buster namespace isolation | `charts/kubeclaw/templates/buster-namespace-*`; `my-values/infra/buster-namespace-fence.yaml`; Buster security context | deployment verification and real E2E failure matrix | `/understand/architecture/security/secrets-network-and-workspaces`; `/use/configure/runtime-roles` |
| CLI and commands | `skills/nova/core/cli.ts`; root `package.json`; `scripts/deploy.sh`; package scripts | generated command inventory plus command smoke checks | `/reference/cli`; task pages under `/use` and `/extend` |
| Configuration, Helm values, environment, and secrets | `charts/kubeclaw/values.yaml`; `my-values/`; schema/config readers; `scripts/setup.sh` | `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; deployment truth check | `/reference/configuration`; `/reference/helm`; `/reference/environment`; `/reference/secrets` |
| Project setup and customization | `skills/nova/project_setup/`; graph/config schemas in plugin foundation; examples under `docs/examples/` | `tests/skills/nova/project_setup/`; example schema checks | `/use/configure/pipeline-and-projects`; `/extend/customize/pipeline-graph` |
| Runtime bundle composition | `packaging/runtime/package-ownership.json`; role manifests; `scripts/build-runtime-role-bundle.mjs`; `scripts/package-agent-skill-bundle.sh` | all `verify:runtime-packaging:*` scripts | `/understand/architecture/deployment-topologies/local-composition`; `/extend/customize/runtime-role-bundle` |
| Security model | capability vocabulary, isolation foundation, installer, role boundaries, deployment security contexts | plugin capability/security/isolation checks; runtime bundle isolation; deployment truth checks | `/understand/architecture/security/*`; relevant safety blocks in `/use` and `/extend` |

## Evidence-link behavior

- Narrative pages show compact “Source” and “Verified by” links, not raw path dumps in every paragraph.
- Generated reference rows link directly to manifest, schema, implementation export, and test.
- Architecture diagrams expose evidence in the selected node’s details panel.
- A release build fails if a local evidence path or requested symbol does not exist.
- A source link to a conflicted file is rejected for publication until the conflict is resolved and verification reruns.
- Proposed pages link to design records and explicitly say that no implementation proof exists.

## Completeness rule

Every inventory component, runtime role, plugin registration, capability, contract family, configuration family, and deployment component must resolve to at least one row in this matrix or a generated child row. Generated child rows are the mechanism for exhaustive plugin/capability/schema coverage; the human matrix owns the explanatory domains.
