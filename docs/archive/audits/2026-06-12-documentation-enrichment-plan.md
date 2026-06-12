# Documentation Enrichment Plan - 2026-06-12

This plan is executable by the next goal. It assumes no main docs have been rewritten by this audit. Each package lists target docs, source to inspect before editing, sections to add/expand, acceptance criteria, verification checks, and expected final quality.

## Ordered work packages

### WP1 - Fix misleading NetworkPolicy claims

Target docs: `README.md`, `docs/architecture/system-overview.md`, cross-check `docs/deployment/networking.md`, `docs/architecture/security-model.md`, `docs/deployment/infrastructure.md`.

Inspect before editing: `my-values/infra/network-policies.yaml`, `scripts/deploy.sh`, `tests/verification/deployment/check-deployment-truth.mjs`, `docs/deployment/networking.md`, `docs/architecture/security-model.md`.

Add or expand: replace NetworkPolicy-missing statements with current baseline facts; list the default-deny plus main allowances at a high level; keep Cilium/FQDN/metrics-stack limitations as future work; link to deployment verification.

Acceptance criteria: no active non-archive doc or root README claims NetworkPolicies are absent; docs distinguish portable NetworkPolicy baseline from missing Kubernetes-native observability and future FQDN policy.

Verification: `rg -n "missing NetworkPolic|does not currently include NetworkPolicy|No Kubernetes NetworkPolicy resources" README.md docs -g '!docs/archive/**'`; `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"`; `npm run docs:check`; `git diff --check`.

Expected final doc quality: adequate-to-rich for architecture/security claims with source-backed deployment verification.

### WP2 - Enrich persistent storage and security operations

Target docs: `docs/deployment/persistent-storage.md`, `docs/operators/security-operations.md`, supporting links from `docs/operators/maintenance.md`, `docs/operators/recovery-runbook.md`, and `docs/deployment/agent-deployments.md`.

Inspect before editing: `charts/kubeclaw/values.yaml`, `charts/kubeclaw/templates/deployment.yaml`, `charts/kubeclaw/templates/pvc.yaml`, `charts/kubeclaw/templates/configmap-workspace.yaml`, `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, `my-values/infra/network-policies.yaml`, `tests/verification/deployment/check-deployment-truth.mjs`.

Add or expand: PVC/mount table for config/workspace, runtime config overlay, Buster `/sandbox`, Podman `/var/lib/containers`, run artifacts under `.swarm/logs/pipeline`, retention and backup notes, secret-placeholder safety, privileged Buster checks, RBAC/NetworkPolicy commands, NodePort exposure risk, and incident evidence collection.

Acceptance criteria: operator can answer what persists, what is ephemeral, which secrets must not persist, and which commands prove storage/security posture without reading chart templates.

Verification: render Nova/Buster Helm templates; run deployment truth; run `npm run docs:check`; run `git diff --check`.

Expected final doc quality: rich for storage and adequate-to-rich for security operations.

### WP3 - Add service/module ownership and config validation map

Target docs: `docs/architecture/component-map.md`, `docs/developers/codebase-tour.md`, `docs/pipeline/configuration.md`, `docs/reference/swarm-config.md`.

Inspect before editing: `skills/nova/pipeline/core/config.ts`, `core/platform-config.ts`, `core/registry/*.ts`, `charts/kubeclaw/files/config/swarm.config.json`, `charts/kubeclaw/templates/configmap-swarm-config.yaml`, `skills/nova/pipeline/runners/*.ts`, `skills/buster/pipeline/services/*.ts`, `plugins/openclaw-agent-observer/src/*.ts`, related config/registry tests.

Add or expand: tables for major service/module owner, runtime role, public contract, source files, config keys, artifacts/events, tests, and extension boundary. Add validation table for required swarm config keys and project progress boundaries.

Acceptance criteria: a developer can find the owning source file and proof test for Nova runner, Buster task queue, status store, telemetry, observer plugin, Helm deployment, docs generation, and verification harness.

Verification: `npm run docs:check`; targeted unit/behavior checks for config/registry if available; `git diff --check`.

Expected final doc quality: rich for component map, adequate-to-rich for config reference.

### WP4 - Enrich lifecycle, recovery, and evidence authority docs

Target docs: `docs/pipeline/failure-and-recovery.md`, `docs/operators/recovery-runbook.md`, `docs/operators/common-failures.md`, `docs/architecture/lifecycle-and-state.md`, `docs/pipeline/telemetry-and-artifacts.md`.

Inspect before editing: `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`, `services/session-authority.ts`, `services/status-store.ts`, `services/status-store-lifecycle/**`, `services/artifact-bundle.ts`, `services/failures/retry-policy.ts`, `skills/buster/pipeline/services/task-queue.ts`, `task-completion.ts`, `task-validation.ts`, `tests/verification/behavior/areas/restart-recovery.mjs`, `runtime-monitor.mjs`, `contracts/check-status-store-slice-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`.

Add or expand: authority/evidence matrix for lifecycle events, read models, latest pointer, run-scoped artifacts, Redis task/completion streams, Discord artifacts, Buster diagnostics, weak evidence, dead-letter before ACK, terminal-before-ACK, stale recovery blocked on unconfirmed identity, and operator next actions.

Acceptance criteria: operator pages tell exactly when to resume, retry, inspect artifacts, stop sessions, or avoid trusting weak evidence; developer pages name the contract tests protecting these behaviors.

Verification: run focused behavior/contract areas if practical: restart-recovery, lifecycle-state-surface, buster-runtime-normalization, status-store slice, buster pipeline slice; run docs check and diff check.

Expected final doc quality: rich for failure/recovery and lifecycle authority.

### WP5 - Improve observability and claim-to-test mapping

Target docs: `docs/operators/observability.md`, `docs/architecture/observability-model.md`, `docs/reference/telemetry-events.md`, `docs/reference/observability-sinks.md`, `docs/reference/verification-commands.md`, `docs/developers/testing-and-ci.md`, `docs/developers/adding-verification.md`.

Inspect before editing: `skills/nova/pipeline/services/telemetry.ts`, `services/telemetry/dispatch.ts`, `services/telemetry/payload-schema.ts`, `services/telemetry-sink-contract.ts`, `services/observability.ts`, `plugins/openclaw-agent-observer/src/**`, `tests/verification/behavior/areas/telemetry-docs.mjs`, `docs-surface.mjs`, `package.json`, `.github/workflows/docs-checks.yaml`.

Add or expand: telemetry flow from event builder to Redis/local fallback/sink/plugin; degradation/restoration evidence; exact Redis and JSONL inspection commands; claim-to-test table linking docs claims to deployment, behavior, contract, runtime, and docs checks.

Acceptance criteria: every P0/P1 docs claim class has at least one named verification command or named test file; docs do not imply Prometheus/Loki/OpenTelemetry support exists.

Verification: `npm run docs:check`; telemetry-docs/docs-surface behavior areas if runtime harness is available; `git diff --check`.

Expected final doc quality: adequate-to-rich for observability, rich for verification reference.

### WP6 - Reconcile stale meta-docs and tracker surfaces

Target docs: `docs/DOCUMENTATION_AUDIT.md`, `docs/DOCUMENTATION_REBUILD_PLAN.md`, `docs/DOCUMENTATION_TARGET_PAGE_LIST.md`, `docs/open-issues.md`, `docs/future-implementation-ideas.md`, `docs/ROADMAP.md`.

Inspect before editing: current docs tree, this audit, `scripts/docs-check.mjs`, `tests/verification/behavior/areas/docs-surface.mjs`, `docs/developers/documentation-conventions.md`.

Add or expand: mark old audit/rebuild artifacts as historical or update them into current maintenance docs; split active limitations from resolved issue history if chosen; add source-backed future ideas for Kubernetes-native observability, FQDN egress, generated inventory expansion, and clean-cluster quickstart.

Acceptance criteria: active meta-docs no longer list existing pages as missing or tell future agents to follow obsolete phase plans; current limitations are short enough to scan and link to detailed history.

Verification: `npm run docs:check`; `rg -n "currently missing|planned targets|Phase [0-9].*missing" docs/DOCUMENTATION_AUDIT.md docs/DOCUMENTATION_REBUILD_PLAN.md docs/DOCUMENTATION_TARGET_PAGE_LIST.md`; `git diff --check`.

Expected final doc quality: adequate for maintenance docs; shallow placeholders removed.

### WP7 - Enrich developer extension workflows

Target docs: `docs/developers/adding-buster-suites.md`, `docs/developers/adding-gates.md`, `docs/developers/hooks-and-plugins.md`, `docs/developers/adding-observability-sinks.md`, `docs/developers/adding-pipeline-features.md`, `docs/developers/replacing-agent-runtime.md`.

Inspect before editing: `skills/buster/pipeline/runners/suite-runner.ts`, `skills/buster/pipeline/services/capabilities.ts`, `skills/nova/pipeline/core/registry/*.ts`, `skills/nova/pipeline/runners/gate-runner.ts`, `remediable-gate-engine.ts`, `telemetry-sink-contract.ts`, `observability.ts`, `agents/runtime.ts`, related unit and verification tests.

Add or expand: minimal file-change recipes, schema examples, capability/trust-tier rules, failure behavior, tests to add, docs to update, and acceptance criteria for each extension path.

Acceptance criteria: a developer can add one suite, one gate, one telemetry sink, or one plugin with exact source files, config snippets, and verification commands.

Verification: relevant unit tests under `tests/skills/**`; docs check; diff check.

Expected final doc quality: adequate-to-rich developer workflows.
