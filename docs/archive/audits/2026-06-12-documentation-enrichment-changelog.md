# Documentation Enrichment Changelog

Date: 2026-06-12

This changelog records the execution pass for `2026-06-12-documentation-enrichment-plan.md`. The pass did not redo the audit. It executed WP1 through WP6: the P0 NetworkPolicy correction and the first five P1 work packages.

## Documentation Drift Guardrails Pass

This pass added programmatic maintainability checks so the enriched documentation remains source-backed as implementation, workflows, tests, and generated references change.

### Guardrails Added

- Added `scripts/docs-check-refs.mjs` and `npm run docs:check:refs` to fail on broken local Markdown links and missing cited repository paths in active docs plus the current 2026-06-12 audit artifacts. The script intentionally skips external URLs, archived historical docs outside the current audit set, fenced code blocks, globs, placeholders, and generated example data.
- Added `scripts/docs-check-coverage.mjs` and `npm run docs:check:coverage` to verify coverage matrix paths, active docs inventory coverage, valid ratings, accepted adequate rationales, absence of unallowed `shallow`/`stale`/`misleading` rows, topic-map path validity, and vague weakness wording.
- Added `npm run docs:check:generated` as the explicit generated inventory/reference freshness check and folded all guardrails into `npm run docs:check`.
- Hardened `.github/workflows/docs-checks.yaml` so docs CI runs generated freshness, Markdown hygiene, bad-reference checks, coverage/topic-map consistency, and `git diff --check` as separate named steps.
- Expanded docs workflow path filters to include docs, docs scripts, package metadata, workflows, charts, deploy paths, Dockerfiles, tests, skills, plugins, and deployment scripts/values.

### Generated Inventory Added

- Added `docs/generated/inventory/workflows.json`, generated from `.github/workflows/*.yaml`.
- Added `docs/reference/workflows.md`, generated from `workflows.json`, with workflow triggers, path filters, schedules, jobs, command refs, action refs, and a concise guardrail map.
- Updated `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, and `scripts/docs-check.mjs` so the workflow inventory and workflow reference are generated and checked for freshness.

### Maintainer Documentation Updated

- Marked `docs/archive/audits/2026-06-12-documentation-coverage-audit.md` as a pre-enrichment baseline and pointed readers to the current matrix, topic map, changelog, and adequate-depth review.
- Updated `docs/developers/documentation-conventions.md` with maintainer-facing drift-guardrail commands, failure meanings, regeneration steps, and what to update when checks fail.
- Updated `docs/generated/inventory/README.md` and `docs/reference/README.md` to include the workflow inventory/reference in the generated-doc boundary.
- Updated the coverage matrix and topic map so the new generated workflow artifacts are tracked.

### Sources Inspected

- Local workflow and docs guardrails: `.github/workflows/docs-checks.yaml`; `.github/workflows/build-images.yaml`; `package.json`; `scripts/docs-check.mjs`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; current audit artifacts.
- External workflow-design reference: the OpenClaw workflow directory and selected workflow patterns, including docs workflows, workflow sanity checks, scheduled checks, and release validation dispatch/summary patterns from `<https://github.com/openclaw/openclaw/tree/main/.github/workflows>`.

### Remaining Limitations

- The bad-reference guard intentionally does not validate Markdown anchors or semantic truth of cited source files; it proves path existence and local-link integrity.
- The coverage guard verifies matrix/topic-map structure and rating hygiene; it does not prove that every rich doc remains semantically complete after a source behavior change.
- Workflow inventory is concise and source-backed, but it is not a full actionlint/workflow-sanity replacement.
- Generated inventory still does not cover full runtime config schema, Redis/event/status constants, or Buster task schema beyond existing manual references.

### Verification For Drift Guardrails Pass

- `npm run docs:inventory` regenerated `deploy-script.json`, `secret-setup.json`, `helm-values.json`, and `workflows.json`.
- `npm run docs:generate` regenerated generated reference pages including `docs/reference/workflows.md`.
- `npm run docs:check:generated` passed: generated inventory and generated reference docs are current.
- `npm run docs:check:refs` passed: 213 local links and 1,736 repository path references checked.
- `npm run docs:check:coverage` passed: 140 active docs files tracked, with `rich: 107` and `adequate: 33`.
- `npm run docs:check` passed: generated freshness, Markdown hygiene, reference scan, and coverage/topic-map consistency passed; docs check reported 122 active Markdown files.
- `git diff --check` passed.
- `node tests/verification/behavior/verify.mjs --area docs-surface` passed: 10 passed, 0 failed.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed, including Helm render, image workflow, Docker/build-context, deploy script, Secret/config, Buster broker/RBAC, and NetworkPolicy checks.

## Adequate-Depth Execution Pass

This pass executed `docs/archive/audits/2026-06-12-adequate-depth-review.md`. It upgraded the 39 actionable `adequate` docs listed there to `rich` and kept only intentionally limited pages at `adequate` with an explicit rationale in the coverage matrix.

### Docs Upgraded To Rich

- Entry/meta docs: `docs/CONTRIBUTING.md`; `docs/DOCUMENTATION_HANDOFF_PROMPT.md`; `docs/README.md`.
- Architecture/concepts/pipeline: `docs/architecture/data-flow.md`; `docs/architecture/runtime-topology.md`; `docs/concepts/intent-driven-pipeline.md`; `docs/pipeline/architecture.md`.
- Deployment/operator docs: `docs/deployment/ci-and-image-publishing.md`; `docs/deployment/deployment-verification.md`; `docs/deployment/helm-chart.md`; `docs/deployment/litellm.md`; `docs/deployment/model-provider-prerequisites.md`; `docs/deployment/networking.md`; `docs/deployment/rbac-and-sandbox.md`; `docs/deployment/tailscale-operator.md`; `docs/getting-started/first-deployment.md`; `docs/operators/common-failures.md`; `docs/operators/debugging.md`; `docs/operators/install-and-upgrade.md`; `docs/operators/maintenance.md`; `docs/operators/running-the-platform.md`.
- Developer docs: `docs/developers/adding-buster-suites.md`; `docs/developers/adding-gates.md`; `docs/developers/adding-observability-sinks.md`; `docs/developers/adding-verification.md`; `docs/developers/codebase-tour.md`; `docs/developers/linting-rules.md`; `docs/developers/replacing-agent-runtime.md`; `docs/developers/testing-and-ci.md`.
- Examples and references: `docs/examples/progress-json/README.md`; `docs/examples/secrets/placeholder-secrets.md`; `docs/reference/buster-task-config.md`; `docs/reference/cli.md`; `docs/reference/exit-codes.md`; `docs/reference/helm-values.md`; `docs/reference/linting-rules.md`; `docs/reference/redis-streams.md`; `docs/reference/secrets.md`; `docs/reference/status-and-artifacts.md`.

### Docs Intentionally Left Adequate

The remaining `adequate` rows are intentionally limited and now say so in the coverage matrix.

- Historical/planning context: `docs/DOCUMENTATION_AUDIT.md`; `docs/DOCUMENTATION_REBUILD_PLAN.md`; `docs/DOCUMENTATION_TARGET_PAGE_LIST.md`; `docs/ROADMAP.md`; `docs/future-implementation-ideas.md`.
- Index/router pages: `docs/decisions/README.md`; `docs/diagrams/README.md`.
- Narrow reference/template pages: `docs/decisions/architecture-decisions.md`; `docs/developers/templates/architecture-page.md`; `docs/developers/templates/deployment-component.md`; `docs/developers/templates/operator-task.md`; `docs/developers/templates/reference-page.md`; `docs/developers/templates/runbook.md`; `docs/developers/templates/troubleshooting-entry.md`.
- Generated/static artifacts: `docs/diagrams/*.svg`; `docs/examples/progress-json/*.json`; `docs/examples/swarm-config/*.json`; `docs/generated/inventory/*.json`.
- Generated wrapper: `docs/generated/reference/README.md`.

### Source Files, Tests, Configs, Scripts, And Artifacts Inspected

- Audit artifacts: `docs/archive/audits/2026-06-12-adequate-depth-review.md`; `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`; `docs/archive/audits/2026-06-12-documentation-topic-map.md`; `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`.
- Deployment and secrets: `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/service.yaml`; `charts/kubeclaw/templates/service-extra-nodeports.yaml`; `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/rbac.yaml`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `charts/kubeclaw/templates/buster-namespace-*.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `my-values/infra/network-policies.yaml`; `my-values/infra/litellm-config.yaml`; `my-values/infra/litellm-deployment.yaml`; `my-values/infra/tailscale-operator-values.yaml`.
- Images and CI: `.github/workflows/build-images.yaml`; `.github/workflows/docs-checks.yaml`; `docker/Dockerfile.general`; `docker/Dockerfile.sandbox`; `docker/Dockerfile.prism-preview`.
- Pipeline and Buster runtime: `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `skills/nova/pipeline/core/paths.ts`; `skills/nova/pipeline/core/constants.ts`; `skills/nova/pipeline/core/registry*.ts`; `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/status-store-lifecycle/**`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/contracts/terminal-decision.ts`; `skills/nova/pipeline/services/contracts/pipeline-step-result.ts`; `skills/buster/buster-pipeline.ts`; `skills/buster/CONVENTIONS.md`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-validation.ts`; `skills/buster/pipeline/services/task-completion.ts`; `skills/buster/pipeline/services/capabilities.ts`; `skills/buster/pipeline/runners/suite-runner.ts`; `skills/buster/pipeline/suites/*.ts`.
- Lint, docs, and observability tooling: `skills/nova/pipeline/tools/lint-report.ts`; `skills/nova/pipeline/tools/lint-report/*.ts`; `skills/nova/pipeline/services/lint.ts`; `skills/nova/pipeline/services/telemetry*.ts`; `skills/common/pipeline/telemetry.ts`; `skills/common/pipeline/redaction.ts`; `skills/common/pipeline/services/telemetry/payload-schema.ts`; `plugins/openclaw-agent-observer/src/**`; `scripts/docs-check.mjs`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `docs/generated/inventory/*.json`; `docs/examples/progress-json/*.json`.
- Verification sources: `package.json`; `tests/verification/deployment/check-deployment-truth.mjs`; `tests/verification/behavior/verify.mjs`; `tests/verification/behavior/areas/*.mjs`; `tests/verification/contracts/*.mjs`; focused `tests/skills/**` files for config, paths, Buster, lint, security, redaction, CLI, telemetry, and suite behavior.

### Major Details Added

- Entry pages now include source-of-truth maps, contribution closeout checks, generated-doc boundaries, and stale-handoff failure signals.
- Architecture, data-flow, topology, and pipeline pages now include source-owner tables, expected artifacts/state, stream and lifecycle authority, failure breakpoints, and verification maps.
- Deployment/operator pages now include command-to-resource expectations, Secret/value ownership, rendered-manifest checks, live-versus-repo-proven limits, smoke/verify-live boundaries, and recovery evidence.
- Developer pages now include extension contracts for Buster suites, gates, observability sinks, runtime replacement, linting, verification additions, and change-to-check routing.
- Example/reference pages now explain interpretation, placeholder replacement, required fields, terminal status mapping, Redis stream ownership, status/artifact authority, failure signals, and exact checks.
- Generated reference richness was added through `scripts/docs-generate.mjs`, then regenerated, so generated pages remain source-owned.

### Remaining Limitations

- Live clean-cluster install timing, provider credentials, tailnet ACLs, node firewall behavior, and CNI NetworkPolicy enforcement are live/external checks, not repo-proven behavior.
- Generated inventory remains first-slice coverage for deploy script, secret setup, values, env, CLI, secrets, and verification references; full runtime config/schema/event inventory is still future work.
- Backup/restore and secret rotation automation are not implemented as tested scripts.
- Some historical/planning pages remain `adequate` by design and should not duplicate active manuals.

### Verification For Adequate-Depth Execution Pass

- `npm run docs:generate` regenerated `docs/reference/cli.md`, `docs/reference/secrets.md`, `docs/reference/helm-values.md`, `docs/reference/environment-variables.md`, and `docs/reference/verification-commands.md` from `scripts/docs-generate.mjs`.
- `npm run docs:check` passed: docs inventory current, generated reference docs current, docs check passed for 121 active Markdown files.
- `git diff --check` passed.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed, including Helm render, image/build context, smoke-command, Secret/config, Buster broker/RBAC, and 13 NetworkPolicy checks.
- Behavior areas passed:
  - `docs-surface`: 10 passed, 0 failed.
  - `deployment-surface`: 1 passed, 0 failed.
  - `pipeline`: 27 passed, 0 failed.
  - `telemetry-docs`: 10 passed, 0 failed.
  - `gates`: 34 passed, 0 failed.
  - `restart-recovery`: 5 passed, 0 failed.
  - `operator-surface`: first run failed in `Buster Discord webhook failures emit canonical degraded telemetry` with `assert(degraded)` in `tests/verification/behavior/areas/operator-surface.mjs`; immediate rerun passed with 24 passed, 0 failed. No docs were changed between the failed run and the passing rerun.
- Contract checks passed:
  - `check-pipeline-runner-slice-surface.mjs`: `{"ok":true,"checked":118}`.
  - `check-status-store-slice-surface.mjs`: `{"ok":true,"checked":97}`.
  - `check-buster-pipeline-slice-surface.mjs`: `{"ok":true,"checked":144}`.
  - `check-telemetry-contract.mjs`: emitted telemetry event names matched the contract event names.
  - `check-pipeline-terminal-decision-surface.mjs`: `{"ok":true,"checked":"pipeline-terminal-decision"}`.
  - `check-pipeline-step-result-surface.mjs`: `{"ok":true,"checked":"typed-pipeline-step-results-only"}`.
  - `check-artifact-authority-slice-surface.mjs`: `{"ok":true,"checked":83}`.
- Focused unit tests passed: config registry, path segments, Buster task validation/completion, lint-report registry/container YAML tools, lint service, redaction, Nova CLI, and common CLI args. Result: 24 tests passed, 0 failed.
- Bad-reference scan for changed docs and audit artifacts checked 749 repository-path citations and found 0 missing paths.
- Matrix recount after the pass:
  - `rich`: 106
  - `adequate`: 32
  - `shallow`: 0
  - `stale`: 0
  - `misleading`: 0
  - `duplicate`: 0
  - `missing`: 0
  - every remaining `adequate` row has an explicit accepted rationale.

## Completed Work Items

| Work item | Status | Docs changed | Result |
| --- | --- | --- | --- |
| WP1 - Fix misleading NetworkPolicy claims | Complete | `README.md`; `docs/architecture/system-overview.md`; `docs/open-issues.md` | Replaced stale "no NetworkPolicy" claims with the source-backed current model: `my-values/infra/network-policies.yaml` defines 13 policies and `scripts/deploy.sh` applies/removes them during infra deploy/teardown. Remaining NetworkPolicy gap is now limited to FQDN-aware egress tightening. |
| WP2 - Enrich persistent storage and security operations | Complete | `docs/deployment/persistent-storage.md`; `docs/operators/security-operations.md`; `docs/operators/maintenance.md`; `docs/operators/recovery-runbook.md`; `docs/deployment/agent-deployments.md` | Added operator-ready storage/security surfaces, owners, commands, teardown/backup cautions, NetworkPolicy references, NodePort exposure checks, incident evidence, and open questions for untested snapshot/restore. |
| WP3 - Add service/module ownership and config validation map | Complete | `docs/architecture/component-map.md`; `docs/developers/codebase-tour.md`; `docs/pipeline/configuration.md`; `docs/reference/swarm-config.md` | Added ownership and contract maps for Nova, Buster, Forge, status/artifacts, telemetry, observer, Helm, docs tooling, and platform config validation. |
| WP4 - Enrich lifecycle, recovery, and evidence authority docs | Complete | `docs/pipeline/failure-and-recovery.md`; `docs/operators/common-failures.md`; `docs/operators/recovery-runbook.md`; `docs/architecture/lifecycle-and-state.md`; `docs/pipeline/telemetry-and-artifacts.md` | Added state/evidence authority, recovery decision tables, Buster task settlement troubleshooting, malformed task guidance, lifecycle invariants, and verification commands. |
| WP5 - Improve observability and claim-to-test mapping | Complete | `docs/operators/observability.md`; `docs/architecture/observability-model.md`; `docs/reference/telemetry-events.md`; `docs/reference/observability-sinks.md`; `docs/reference/verification-commands.md`; `docs/developers/testing-and-ci.md`; `docs/developers/adding-verification.md` | Added builder-to-sink telemetry flow, observer plugin behavior, flat envelope rule, sink ownership, and claim-to-test evidence commands. |
| WP6 - Reconcile stale meta-docs and tracker surfaces | Complete | `docs/DOCUMENTATION_AUDIT.md`; `docs/DOCUMENTATION_REBUILD_PLAN.md`; `docs/DOCUMENTATION_TARGET_PAGE_LIST.md`; `docs/open-issues.md`; `docs/future-implementation-ideas.md`; `docs/ROADMAP.md` | Marked old audit/rebuild/target-list docs as historical or maintenance context, tied them to the 2026-06-12 audit artifacts, and clarified current limitation/future-idea boundaries. |

## Sources Inspected

The following implementation sources, tests, configs, scripts, and artifacts were inspected before editing the related docs:

- Audit inputs: `docs/archive/audits/2026-06-12-documentation-coverage-audit.md`; `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`; `docs/archive/audits/2026-06-12-documentation-topic-map.md`; `docs/archive/audits/2026-06-12-documentation-enrichment-plan.md`.
- Deployment and security: `scripts/deploy.sh`; `charts/kubeclaw/values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/configmap-workspace.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `my-values/infra/network-policies.yaml`; `tests/verification/deployment/check-deployment-truth.mjs`.
- Config and ownership: `charts/kubeclaw/files/config/swarm.config.json`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/builtins.ts`; `skills/nova/pipeline/core/registry/config-normalization.ts`; `skills/nova/pipeline/core/registry/indexes.ts`; `skills/nova/pipeline/core/registry/validation.ts`; `skills/nova/pipeline/runners/pipeline-runner.ts`; `skills/nova/pipeline/runners/module-runner.ts`; `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-transport-contract.ts`; `plugins/openclaw-agent-observer/src/index.ts`.
- Lifecycle and recovery: `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`; `skills/nova/pipeline/services/session-authority.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts`; `skills/nova/pipeline/services/status-store-lifecycle/projections.ts`; `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts`; `skills/nova/pipeline/services/status-store-lifecycle/storage.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/failures/retry-policy.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-completion.ts`; `skills/buster/pipeline/services/task-validation.ts`; `tests/verification/behavior/areas/restart-recovery.mjs`; `tests/verification/behavior/areas/runtime-monitor.mjs`; `tests/verification/contracts/check-status-store-slice-surface.mjs`; `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`.
- Observability and verification: `skills/common/pipeline/telemetry.ts`; `skills/common/pipeline/redis-transport.ts`; `skills/common/pipeline/services/telemetry/payload-schema.ts`; `skills/common/pipeline/services/task-transport-contract.ts`; `skills/nova/pipeline/services/telemetry.ts`; `skills/nova/pipeline/services/telemetry/builders.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `skills/nova/pipeline/services/telemetry-stream.ts`; `skills/nova/pipeline/services/telemetry-sink-contract.ts`; `skills/nova/pipeline/services/telemetry-sink-dispatch.ts`; `skills/nova/pipeline/services/notification-contract.ts`; `skills/buster/pipeline/services/telemetry.ts`; `tests/verification/behavior/areas/telemetry-docs.mjs`; `tests/verification/behavior/areas/docs-surface.mjs`; `package.json`; `.github/workflows/docs-checks.yaml`.
- Documentation tooling and trackers: `scripts/docs-check.mjs`; `scripts/docs-generate.mjs`; `scripts/docs-inventory.mjs`; `docs/DOCUMENTATION_AUDIT.md`; `docs/DOCUMENTATION_REBUILD_PLAN.md`; `docs/DOCUMENTATION_TARGET_PAGE_LIST.md`; `docs/open-issues.md`; `docs/future-implementation-ideas.md`; `docs/ROADMAP.md`; `docs/developers/documentation-conventions.md`.

## Technical Details Added

- NetworkPolicy ownership now names `my-values/infra/network-policies.yaml`, the deploy/teardown hooks in `scripts/deploy.sh`, the deployment truth verifier, the expected 13-policy baseline, and the remaining non-FQDN egress limitation.
- Persistent storage now distinguishes Helm PVCs, generated config ConfigMaps, runtime config overlay paths, workspace persistence, Prism preview designs, Buster Podman storage, sandbox workspaces, and pipeline artifact/status stores.
- Security operations now connects secrets, RBAC, namespace fence, NetworkPolicies, NodePorts, Buster sandbox privileges, and incident evidence to their owning files and operator commands.
- Component and codebase maps now tie user-facing behavior to Nova CLI/config, runners, registries, Forge, Buster, status store, artifact bundle, telemetry, observer plugin, Helm chart, and docs tooling.
- Config docs now list platform config field owners, rejected legacy top-level keys, swarm config sources, runtime overlay paths, and validation commands.
- Lifecycle/recovery docs now identify session authority, status store lifecycle appenders, artifact bundle, retry policy, Buster task queue/completion/validation, and recovery verification areas.
- Observability docs now describe the telemetry builder-to-sink path, Redis stream inspection, observer plugin scope, flat event envelope rules, sink ownership, and claim-to-test mapping. Because `docs/reference/verification-commands.md` is generated, the claim-to-test map is emitted from `scripts/docs-generate.mjs`.
- Meta docs now say which older docs are historical, which audit artifacts are authoritative for this pass, and which issue/future-idea pages remain active trackers.

## Stale Or Misleading Statements Corrected

- Corrected root `README.md` so NetworkPolicies are no longer listed as a missing Kubernetes-native guardrail.
- Corrected `docs/architecture/system-overview.md` so the remaining gap is FQDN-aware tightening and Kubernetes-native observability resources, not absent NetworkPolicies.
- Corrected `docs/open-issues.md` issue `DEPLOY-2026-06-05-005` title so it no longer claims no NetworkPolicy resources are present.
- Corrected `docs/open-issues.md` issue `DEPLOY-2026-06-05-003` so it points to `charts/kubeclaw/templates/configmap-gateway.yaml` and describes the current secret-free persistent source plus `/runtime-config` overlay behavior.
- Marked old documentation audit/rebuild/target-list pages as historical or maintenance context instead of current authoritative audit state.

## Per-Page Completion Notes

| Doc | What was missing before | Sections added or expanded | Source proof | Remaining gap |
| --- | --- | --- | --- | --- |
| `README.md` | Stale NetworkPolicy gap statement. | Kubernetes-native non-claims corrected. | `my-values/infra/network-policies.yaml`; `scripts/deploy.sh`; `tests/verification/deployment/check-deployment-truth.mjs`. | Prometheus/Loki/OpenTelemetry and FQDN-aware policy remain not implemented. |
| `docs/architecture/system-overview.md` | Misleading NetworkPolicy gap and weak security baseline detail. | Security and networking baseline. | `my-values/infra/network-policies.yaml`; `scripts/deploy.sh`; deployment truth verifier. | FQDN-aware egress and Kubernetes-native observability remain future work. |
| `docs/deployment/persistent-storage.md` | Storage surfaces, teardown risk, and restore limits were too shallow. | Storage surfaces; backup/restore; teardown; operator checks. | Helm chart templates; values files; status/artifact sources. | No tested snapshot/restore script is present. |
| `docs/operators/security-operations.md` | Security checks were too high-level for incident use. | Security surfaces; source checks; cluster checks; incident evidence; open questions. | NetworkPolicies; Helm templates; deployment truth verifier. | No dedicated security smoke test beyond deployment truth/docs checks. |
| `docs/operators/maintenance.md` | Maintenance docs did not call out storage/security evidence before destructive actions. | Storage and security hygiene. | PVC templates; NetworkPolicy source; recovery runbook. | Does not replace a full backup/restore procedure. |
| `docs/operators/recovery-runbook.md` | Recovery commands lacked lifecycle authority and Buster settlement anchors. | Lifecycle authority inspection; Buster task settlement; storage/security evidence. | Recovery runner; session authority; status-store lifecycle; Buster queue/completion/validation tests. | Manual interpretation is still required for some Redis stream histories. |
| `docs/deployment/agent-deployments.md` | Agent deployments did not point operators at storage/security invariants. | Persistent storage/security cross-link. | Helm deployment/PVC/templates; NetworkPolicy source; deployment truth. | Deeper deployment matrix remains in deployment-specific docs. |
| `docs/architecture/component-map.md` | Service ownership and contracts were fragmented. | Ownership and contract matrix. | Nova/Buster/Forge/status/artifact/telemetry/observer/Helm/docs sources. | Generated API-level inventory remains future work. |
| `docs/developers/codebase-tour.md` | Developers needed a faster source ownership map. | Fast ownership map. | Core config, registry, runner, Buster, telemetry, Helm, docs tooling sources. | Page is still a tour, not a full API reference. |
| `docs/pipeline/configuration.md` | Config validation rules and rejected shapes were implicit. | Platform validation table; project boundary. | `core/config.ts`; `core/platform-config.ts`; swarm config ConfigMap. | Does not enumerate every agent-specific value field. |
| `docs/reference/swarm-config.md` | Reference lacked enough validation proof and operator checks. | Validation reference table; verification commands. | Bundled swarm config; ConfigMap template; config parser tests. | No generated schema file exists. |
| `docs/pipeline/failure-and-recovery.md` | Evidence authority and recovery decisions were under-specified. | Strong identity fields; recovery decision table; authority matrix. | Recovery runner; retry policy; terminal decision; status store. | Some Redis histories still need operator judgment. |
| `docs/operators/common-failures.md` | Buster malformed/recovery-blocked cases lacked exact signals. | Expanded failure cases and commands. | Buster validation/completion/queue; recovery tests. | More examples can be added from real incidents. |
| `docs/architecture/lifecycle-and-state.md` | State authority/invariants were scattered. | Authority/evidence matrix; recovery invariants. | Session authority; status store lifecycle; artifact bundle. | No graphical sequence diagram added. |
| `docs/pipeline/telemetry-and-artifacts.md` | Artifact/evidence strength was not explicit. | Evidence strength table. | Artifact bundle; telemetry stream; status store appenders. | Sink durability depends on configured runtime backends. |
| `docs/operators/observability.md` | Runtime flow and observer behavior were not explicit enough. | Telemetry builder-to-sink flow; observer plugin flow; Redis inspection. | Telemetry services; observer plugin; Redis transport. | Kubernetes-native metrics resources remain absent. |
| `docs/architecture/observability-model.md` | Observability model lacked concrete runtime ownership. | Runtime flow table. | Common telemetry; Nova/Buster telemetry; observer plugin. | Does not claim Prometheus/Loki/OpenTelemetry support. |
| `docs/reference/telemetry-events.md` | Event envelope authority was not clear. | Event build path; flat envelope rule; verification commands. | Payload schema; telemetry docs behavior test. | Event catalog still depends on generated docs staying current. |
| `docs/reference/observability-sinks.md` | Sink ownership/failure invariant was under-specified. | Built-in sink ownership table; failure invariant; verification. | Telemetry sink contract; Redis transport; observer plugin. | External sinks are not implemented. |
| `docs/reference/verification-commands.md` | No claim-to-test table for enriched docs. | Docs check command; claim-to-test map. | `package.json`; behavior/contract/deployment verifiers. | Does not replace full CI. |
| `docs/developers/testing-and-ci.md` | Missing quick evidence commands for docs/recovery/contracts. | Docs/telemetry/recovery/status/Buster check commands; CI surface note. | `package.json`; `.github/workflows/docs-checks.yaml`; verifier files. | Broader CI matrix remains outside this page. |
| `docs/developers/adding-verification.md` | Did not explain how to add docs claim tests. | Claim-to-test additions guidance. | Docs check; docs-surface behavior area; verification commands reference. | No new verifier was needed for this pass. |
| `docs/DOCUMENTATION_AUDIT.md` | Appeared authoritative despite being old. | Historical status and pointers to current artifacts. | 2026-06-12 audit artifacts; docs tooling. | Kept for history. |
| `docs/DOCUMENTATION_REBUILD_PLAN.md` | Did not distinguish original rebuild plan from current state. | Current status pointers and maintenance context. | 2026-06-12 audit artifacts; docs checks. | Still a historical planning page. |
| `docs/DOCUMENTATION_TARGET_PAGE_LIST.md` | Looked like a current target list. | Historical notice and reconciliation note. | Current docs inventory and audit artifacts. | Kept as historical reference. |
| `docs/open-issues.md` | Active/resolved state was noisy and two resolved issues had stale source/behavior wording. | Current limitation index; NetworkPolicy issue retitle; OpenClaw runtime-config persistence issue retitle/body update. | NetworkPolicy source; `charts/kubeclaw/templates/configmap-gateway.yaml`; deployment init flow; deployment truth; audit artifacts. | Still intentionally includes historical issue entries. |
| `docs/future-implementation-ideas.md` | Future ideas lacked source-backed candidates from the audit. | FQDN-aware egress and generated inventory candidates. | NetworkPolicy source; docs tooling; observability docs. | Ideas remain non-committed future work. |
| `docs/ROADMAP.md` | Roadmap referenced docs rebuild without the current audit/enrichment state. | Current docs sequence and candidate platform themes. | 2026-06-12 audit artifacts; changelog. | Roadmap remains non-binding. |

## Second Pass - Remaining P1 Shallow Backlog

This pass finished the remaining 20 coverage-matrix rows where `Priority` was `P1` and `Depth rating` was `shallow`. It did not redo WP1-WP6 except for compatible cross-link/source-reference continuity.

### Completed Docs

| Doc | New matrix rating | Technical details added | Source proof | Remaining gap |
| --- | --- | --- | --- | --- |
| `docs/architecture/README.md` | rich | Source authority map for deployment, pipeline, Buster, security, observability, failure/change signals. | Helm templates, Nova/Buster runtime files, NetworkPolicy source, deployment/pipeline/Buster/telemetry checks. | Runtime-topology and pipeline architecture pages can still add deeper cross-links later. |
| `docs/architecture/security-model.md` | rich | Security ownership table, Secret/config materialization, NetworkPolicy verification, Buster sandbox/RBAC checks, troubleshooting signals. | Secret/deployment/RBAC templates, `my-values/setup-secrets.sh`, `my-values/infra/network-policies.yaml`, task validation/security/redaction tests. | Live CNI enforcement and public security contact/license remain open. |
| `docs/concepts/operator-model.md` | rich | Source-backed operator responsibilities, commands, state/artifacts, and limits. | `scripts/deploy.sh`, `my-values/setup-secrets.sh`, Helm templates, Nova/Buster status/recovery sources. | Provider readiness, CNI enforcement, and backup automation remain outside repo-only proof. |
| `docs/concepts/pipeline-model.md` | rich | Runtime flow table for config, scheduling, module execution, Buster tasks, terminal handling, and evidence writing. | Nova config/runners/status/artifact sources and Buster task queue/validation/completion sources. | Detailed examples remain in pipeline pages. |
| `docs/decisions/architecture-decisions.md` | adequate | Source proof and verification for Redis transport, lifecycle authority, and source-backed docs. | Buster queue/completion, status-store lifecycle, artifact bundle, docs tooling. | Still concise decision notes, not full ADRs. |
| `docs/decisions/deployment-decisions.md` | rich | Helm render proof, refined NodePort decision, secret-free persistent config decision, local registry verification decision. | Chart templates, values files, LiteLLM manifest, deploy script, deployment truth. | Image pinning risk remains. |
| `docs/decisions/pipeline-decisions.md` | rich | Source proof and tests for lifecycle authority, typed Buster tasks, typed terminal decisions, startup plugin registry. | Pipeline terminal/status contracts, Buster task validation/queue/completion, core registry sources. | Detailed examples remain in pipeline docs. |
| `docs/deployment/README.md` | rich | Deployment source map, runtime outputs, failure signals, and repository-check boundaries. | Deploy script, secret setup, chart templates, Dockerfiles, image workflow. | Live provider/CNI/backup behavior not proven by repo-only checks. |
| `docs/deployment/ci-and-image-publishing.md` | adequate | Image contract table, workflow/build inputs, failure modes, local image verification commands. | GitHub Actions workflow, Dockerfiles, deploy script, production values. | Base image pinning mismatch remains. |
| `docs/deployment/deployment-overview.md` | rich | Source-verified setup/infra/agents/smoke/verify-live flow, runtime artifacts, verification commands. | Deploy script, secret setup, PVC/deployment templates, values files. | Live cluster/provider readiness remains outside repo-only checks. |
| `docs/deployment/docker-images.md` | rich | Runtime image surface table, build context contract, verification commands. | Dockerfiles, `.dockerignore`, deploy script, deployment truth. | Mutable image tags remain. |
| `docs/deployment/model-provider-prerequisites.md` | adequate | Provider/proxy wiring table, required Secrets, runtime outputs, failure modes. | OpenClaw config template, deployment template, LiteLLM config/deployment, secret setup. | Upstream provider account/model availability is not repo-verifiable. |
| `docs/deployment/values-files.md` | rich | Values ownership table, rendered effects, verification/diff commands, limits. | Chart defaults/templates, Nova/Buster values, docs generator. | Retained PVC config and `latest` image tag risks remain. |
| `docs/developers/adding-pipeline-features.md` | rich | Feature surface checklist, owners, contracts, state/artifacts, failure modes, closeout checks. | CLI/config/registry/context/runners/Buster/telemetry/artifact sources and tests. | No new verifier added; uses existing focused checks. |
| `docs/generated/reference/README.md` | adequate | Generated reference contract, inventory/render/check steps, maintenance rules. | `scripts/docs-inventory.mjs`, `scripts/docs-generate.mjs`, `scripts/docs-check.mjs`, generated inventory JSON. | Generated coverage remains first-slice only. |
| `docs/operators/README.md` | rich | Operator job map and verification set for install, verify, run, inspect, recover, maintain. | Deploy script, deployment truth, Nova pipeline/status/artifact sources, Buster completion services. | Some deep procedures remain distributed across pages. |
| `docs/pipeline/README.md` | rich | Pipeline source map, runtime commands, repo-side verification, invariants. | Nova CLI/config/runners/status/artifact/telemetry and Buster task sources. | Index only; linked pages hold deep detail. |
| `docs/reference/README.md` | rich | Reference authority map and maintenance rules for generated/manual references. | Docs tooling, config templates, status/artifact, Redis/Buster, telemetry sources. | Some references remain manual until future generation. |
| `docs/reference/environment-variables.md` | rich | Generated ownership/runtime boundary, failure modes, checks through the generator. | `scripts/docs-generate.mjs`, deploy/secret inventory JSON, deploy/secret scripts. | Generated env inventory still covers deploy/secret first slice only. |
| `docs/reference/openclaw-config.md` | rich | Source/runtime path table, current behavior keys, render/gateway verification. | `configmap-gateway.yaml`, deployment init flow, secret setup, deployment truth. | Existing PVC config preservation remains a limitation. |

### Source Files, Tests, Configs, And Scripts Inspected

- Audit artifacts: `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`; `docs/archive/audits/2026-06-12-documentation-topic-map.md`; `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`.
- Deployment and values: `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/service.yaml`; `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/rbac.yaml`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `my-values/infra/network-policies.yaml`; `my-values/infra/litellm-config.yaml`; `my-values/infra/litellm-deployment.yaml`.
- Images and CI: `.github/workflows/build-images.yaml`; `docker/Dockerfile.general`; `docker/Dockerfile.sandbox`; `docker/Dockerfile.prism-preview`; `.dockerignore`.
- Pipeline and Buster: `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/cli-args.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/context.ts`; `skills/nova/pipeline/runners/pipeline-runner.ts`; `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/runners/gate-runner.ts`; `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry.ts`; `skills/nova/pipeline/services/telemetry/builders.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-validation.ts`; `skills/buster/pipeline/services/task-completion.ts`; `skills/buster/pipeline/services/runtime-policy.ts`.
- Docs tooling and generated artifacts: `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`; `scripts/docs-check.mjs`; `docs/generated/inventory/deploy-script.json`; `docs/generated/inventory/secret-setup.json`; `docs/generated/inventory/helm-values.json`.
- Verification sources: `tests/verification/deployment/check-deployment-truth.mjs`; `tests/verification/behavior/areas/deployment-surface.mjs`; `tests/verification/behavior/areas/pipeline.mjs`; `tests/verification/behavior/areas/docs-surface.mjs`; `tests/verification/behavior/areas/telemetry-docs.mjs`; `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`; `tests/verification/contracts/check-status-store-slice-surface.mjs`; `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`; `tests/verification/contracts/check-telemetry-contract.mjs`; relevant `tests/skills/**` files for CLI/config/Buster task validation and completion.

### Verification For Second Pass

- `npm run docs:check` passed: inventory current, generated reference docs current, docs check passed for 121 active Markdown files.
- `git diff --check` passed.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed, including Helm render, sandbox/RBAC, Docker/image workflow, config overlay, and 13 NetworkPolicy checks.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface` passed: 1 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline` passed: 27 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface` passed: 10 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` passed: 10 passed, 0 failed.
- `node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":118}`.
- `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":97}`.
- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":144}`.
- `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` passed and reported matching emitted/contract telemetry event names.
- `node tests/verification/contracts/check-pipeline-terminal-decision-surface.mjs --source-root "$PWD"` passed.
- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD"` passed.
- `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs tests/skills/nova/pipeline/core/path-segments.test.mjs tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/buster/pipeline/services/task-completion.test.mjs tests/skills/common/pipeline/security.test.mjs tests/skills/common/pipeline/redaction.test.mjs tests/skills/nova/pipeline/cli.test.mjs tests/skills/common/pipeline/cli-args.test.mjs` passed: 22 tests passed, 0 failed.
- Bad-reference scan for newly cited or previously stale paths passed with no hits for missing paths such as obsolete OpenClaw config, old config test, old registry split, old Buster task stream, or old telemetry buffer references.
- Targeted `test -e`/`rg -q` sanity check for new source paths and keys passed.
- Matrix recount passed: before this pass `P1 + shallow = 20`; after this pass `P1 + shallow = 0`.

## Remaining Gaps

- Final all-shallow cleanup pass is complete: after the prior P1 pass, 18 P2 rows still had `Depth rating` of `shallow`; they are now `adequate` or `rich`, and the coverage matrix recount is `shallow = 0`.
- No tested snapshot/restore script or backup automation was found for persistent volumes; storage docs mark this as an open question.
- NetworkPolicy support is present, but egress remains portable and port-based instead of hostname/FQDN-aware.
- Kubernetes-native metrics resources such as ServiceMonitor/PodMonitor and OpenTelemetry collector manifests were not found and are documented as not implemented.
- Generated inventory/schema references remain a future improvement; no new generation script was added during this pass.
- Some historical tracker docs remain noisy by design. They now advertise their historical status, but they are not rewritten into a single canonical tracker.
- WP1-WP6 and the second-pass P1 shallow backlog cleanup are complete, but deeper optional documentation work remains for generated schemas, live CNI proof, backup/restore automation, and split-out tracker hygiene.

## Final Pass - All Remaining Shallow Rows

This pass raised the remaining 18 `shallow` rows in the coverage matrix after the P1 backlog was complete. It focused on first-reader and contributor surfaces: concepts, decisions, developer onboarding, diagrams, examples, generated inventory, and getting-started.

### Completed Docs

| Doc | New matrix rating | Technical details added | Remaining gap |
| --- | --- | --- | --- |
| `docs/concepts/README.md` | rich | Concept-to-owner map, active source-of-truth order, runtime artifacts, first checks, and failure signals. | Provider readiness, live CNI enforcement, and backup/restore stay outside concept proof. |
| `docs/concepts/extensibility-model.md` | rich | Extension seams for pipeline stages, plugin registry, Buster suites, verification areas, generated references, and observability sinks. | Specialized recipes can add more worked examples during future behavior changes. |
| `docs/concepts/platform-model.md` | rich | Platform surface table for deploy script, secrets, agent chart, NetworkPolicies, runtime config, images, commands, and failure signals. | Repo checks prove rendered manifests/scripts, not provider readiness or live CNI enforcement. |
| `docs/decisions/README.md` | adequate | Decision-area source owners, verification rules, and change process. | Individual decision pages remain the detailed record. |
| `docs/decisions/security-decisions.md` | rich | Buster sandbox proof, custom-skill boundary, runtime config/secret materialization, NetworkPolicy model, commands, and failure signals. | Live CNI enforcement is not repo-proven. |
| `docs/developers/README.md` | rich | Contributor path matrix by change type, source owners, minimum checks, commands, and failure signals. | Specialized guides carry deeper recipes. |
| `docs/developers/contributing.md` | rich | Source ownership table, contributor commands, generated-reference rules, failure signals, and closeout checklist. | Root `CONTRIBUTING.md` remains the repo-level policy. |
| `docs/diagrams/README.md` | adequate | Diagram index with use cases, source owners, related pages, edit checklist, checks, and failure signals. | Content/source agreement still needs manual review beyond SVG metadata checks. |
| `docs/examples/README.md` | rich | Example set map, source-of-truth boundaries, verification commands, and failure signals. | Examples remain starting points, not production defaults. |
| `docs/examples/secrets/README.md` | rich | Secret source owners, required Secret names, apply/verify commands, failure signals, and limits. | Does not validate external provider, Discord, GHCR, or Tailscale accounts. |
| `docs/examples/swarm-config/README.md` | rich | Runtime config owner chain, important keys, comparison commands, verification, and limits. | Not a generated schema or exhaustive field catalog. |
| `docs/examples/values/README.md` | rich | Local/dev and staging-like comparison table, flags, expected shape, verification, and failure signals. | Examples remain non-production defaults. |
| `docs/examples/values/local-dev.md` | rich | Local/dev command shape, expected resources, source proof, checks, and failure signals. | Does not validate provider/proxy/Qdrant/PostgreSQL/Tailscale readiness. |
| `docs/examples/values/staging-like.md` | rich | Staging-like command shape, external inputs, expected resources, source proof, checks, and failure signals. | Provider accounts, live CNI enforcement, backup/restore, and SLOs remain outside repo-only proof. |
| `docs/generated/inventory/README.md` | rich | Inventory files, generated-from sources, downstream references, commands, expected artifacts, and failure signals. | Current generated inventory is first-slice coverage only. |
| `docs/getting-started/README.md` | rich | First commands, source-backed orientation, failure signals, and current live-quickstart limitation. | No fixed-profile, source-verified five-minute live quickstart yet. |
| `docs/getting-started/local-development.md` | rich | Prerequisites, basic checks, generated-reference checks, change-to-check map, expected artifacts, and failure signals. | Does not install the full runtime container toolchain. |
| `docs/getting-started/repository-tour.md` | rich | Top-level owner map, active docs areas, generated/example artifacts, first checks, source-of-truth order, and failure signals. | Tour is not exhaustive; codebase tour remains the deeper map. |

### Source Files, Tests, Configs, Scripts, And Artifacts Inspected

- Audit artifacts: `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`; `docs/archive/audits/2026-06-12-documentation-topic-map.md`; `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`.
- Deployment and values: `scripts/deploy.sh`; `my-values/setup-secrets.sh`; `charts/kubeclaw/values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/service.yaml`; `charts/kubeclaw/templates/pvc.yaml`; `charts/kubeclaw/templates/rbac.yaml`; `charts/kubeclaw/templates/secret.yaml`; `charts/kubeclaw/templates/serviceaccount.yaml`; `charts/kubeclaw/templates/configmap-gateway.yaml`; `charts/kubeclaw/templates/configmap-skills.yaml`; `charts/kubeclaw/templates/configmap-swarm-config.yaml`; `charts/kubeclaw/files/config/swarm.config.json`; `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `my-values/infra/network-policies.yaml`; `my-values/infra/litellm-config.yaml`; `my-values/infra/litellm-deployment.yaml`; `my-values/infra/tailscale-operator-values.yaml`.
- Images and plugins: `docker/Dockerfile.general`; `docker/Dockerfile.sandbox`; `.github/workflows/build-images.yaml`; `.dockerignore`; `plugins/openclaw-agent-observer/src/index.ts`.
- Pipeline and Buster: `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/*.ts`; `skills/nova/pipeline/runners/*.ts`; `skills/nova/pipeline/services/status-store.ts`; `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry*.ts`; `skills/common/pipeline/security.ts`; `skills/common/pipeline/redaction.ts`; `skills/common/pipeline/telemetry.ts`; `skills/buster/buster-pipeline.ts`; `skills/buster/pipeline/services/task-queue.ts`; `skills/buster/pipeline/services/task-validation.ts`; `skills/buster/pipeline/services/task-completion.ts`; `skills/buster/pipeline/runners/suite-runner.ts`; `skills/buster/pipeline/suites/*.ts`.
- Docs and examples: `docs/examples/progress-json/*.json`; `docs/examples/swarm-config/*.json`; `docs/generated/inventory/deploy-script.json`; `docs/generated/inventory/secret-setup.json`; `docs/generated/inventory/helm-values.json`; `scripts/docs-check.mjs`; `scripts/docs-inventory.mjs`; `scripts/docs-generate.mjs`.
- Verification: `package.json`; `tests/verification/deployment/check-deployment-truth.mjs`; `tests/verification/behavior/areas/docs-surface.mjs`; `tests/verification/behavior/areas/deployment-surface.mjs`; `tests/verification/behavior/areas/pipeline.mjs`; `tests/verification/behavior/areas/telemetry-docs.mjs`; `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`; `tests/verification/contracts/check-status-store-slice-surface.mjs`; `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`; `tests/verification/contracts/check-telemetry-contract.mjs`; focused `tests/skills/**` files for config, paths, Buster, security, redaction, and CLI parsing.

### Technical Details Added

- First-reader pages now identify what each page is for, when to use it, source owners, commands, expected artifacts, failure signals, and verification.
- Concepts now route readers to platform, operator, pipeline, and extensibility owners instead of stopping at abstract summaries.
- Decisions now include source proof and verifier expectations, especially for security/runtime config, Buster sandboxing, custom skills, and NetworkPolicy limits.
- Developer pages now map change types to source directories, checks, generated-reference behavior, contract checks, and closeout rules.
- Diagram docs now name the source owner and related page for each SVG, and explain what docs checks do and do not prove.
- Example docs now explain how to apply and verify values, secrets, swarm config, and generated/example artifacts without claiming they are production defaults.
- Generated inventory docs now explain generation inputs/outputs, stale-output failures, generated markers, and current coverage limits.
- Getting-started pages now give actionable first commands, change-to-check maps, expected local artifacts, and a source-of-truth order.

### Matrix And Topic-Map Results

- Before the final pass: 18 coverage-matrix rows still had `Depth rating` of `shallow`.
- After the final pass: `shallow = 0`.
- The topic map no longer contains vague weakness language; each gap is now expressed as a concrete next action or explicit limitation.

### Verification For Final Pass

- `npm run docs:check` passed: inventory current, generated reference docs current, docs check passed for 121 active Markdown files.
- `git diff --check` passed.
- Bad-reference scan for repository-root source/test/config/doc paths cited by the 18 final-pass docs and audit artifacts passed.
- Matrix recount passed: `shallow = 0`.
- Topic-map scan passed: no vague weakness wording remains.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed, including Helm render, source config, image/build-context, smoke-command, and 13 NetworkPolicy checks.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface` passed: 10 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface` passed: 1 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline` passed: 27 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` passed: 10 passed, 0 failed.
- `node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":118}`.
- `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":97}`.
- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":144}`.
- `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` passed with emitted telemetry events matching the contract catalog.
- `node tests/verification/contracts/check-pipeline-terminal-decision-surface.mjs --source-root "$PWD"` passed.
- `node tests/verification/contracts/check-pipeline-step-result-surface.mjs --source-root "$PWD"` passed.
- `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs tests/skills/nova/pipeline/core/path-segments.test.mjs tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/buster/pipeline/services/task-completion.test.mjs tests/skills/common/pipeline/security.test.mjs tests/skills/common/pipeline/redaction.test.mjs tests/skills/nova/pipeline/cli.test.mjs tests/skills/common/pipeline/cli-args.test.mjs` passed: 22 tests passed, 0 failed.


## Verification Commands Run

- `npm run docs:check` initially failed because `docs/reference/verification-commands.md` is generated and had not been regenerated after the claim-to-test enrichment. Ran `npm run docs:generate`, which rewrote the generated references from `scripts/docs-generate.mjs`.
- `npm run docs:check` passed after regeneration: docs inventory current, generated reference docs current, and docs check passed for 121 active Markdown files.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed, including the 13-resource NetworkPolicy validation and rendered Nova/Buster deployment checks.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface` passed: 10 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` passed: 10 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery` passed: 5 passed, 0 failed.
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area runtime-monitor` passed: 4 passed, 0 failed.
- `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":97}`.
- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` passed: `{"ok":true,"checked":144}`.
- `helm template kubeclaw charts/kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml` passed.
- `helm template kubeclaw charts/kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml` passed.
- Referenced path/key sanity checks passed using targeted `test -e` checks for newly cited paths and `rg -q` checks for cited keys/terms such as `NetworkPolicy`, `BUSTER_TASK_MALFORMED`, `fallback_model`, and `Claim-To-Test Map`.
- Final source-reference cleanup replaced stale/nonexistent references for the config test, core registry implementation files, Buster task stream, and telemetry buffer with real source/test paths.
- Unrelated project reference scan passed with no new unrelated references. The scan only returned existing in-repo governance wording in `docs/open-issues.md` and a pre-existing `tdlabs.ch` documentation-site note in `docs/DOCUMENTATION_REBUILD_PLAN.md`.
- `git diff --check` passed.
