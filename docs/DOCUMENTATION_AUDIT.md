# Documentation Audit

Status: historical; superseded by 2026-06-12 audit artifacts
Audience: maintainers, documentation agents

## Purpose

This file is the original rebuild Phase 1 audit. It is retained as historical context, not as the current coverage authority.

Current documentation coverage authority lives in:

- `docs/archive/audits/2026-06-12-documentation-coverage-audit.md`
- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-plan.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`

Those artifacts cover active topic areas, generated/reference pages, JSON/SVG docs artifacts, and the source files/tests/configs inspected for the current enrichment pass. Do not use the page-by-page list below as an active missing-page tracker without checking the current topic map first.

Original scope: this audit classified every active Markdown page under `docs/`, excluding `docs/archive/` and future generated output under `docs/generated/`. It was the Phase 1 gate artifact for `docs/DOCUMENTATION_REBUILD_PLAN.md`.

The audit uses the standards in `docs/developers/documentation-conventions.md`:

- operator pages need prerequisites, commands, expected state, verification, common failures, and recovery
- runbooks need symptoms, impact, fast checks, recovery, verification, escalation, and prevention
- architecture pages need runtime flow, state ownership, failure behavior, and operator implications
- reference pages should be generated or source-backed where practical
- target-state, future work, and unclear behavior must not be presented as current behavior

## Decision Key

- **Keep and expand**: the page belongs in the active tree, but needs richer examples, verification, troubleshooting, or cross-links.
- **Rewrite manually**: keep the topic, but replace the current thin structure with the relevant page template.
- **Split**: divide the page into separate task, concept, or reference pages.
- **Merge**: fold the useful content into another active page.
- **Archive**: remove from the active reader path after any useful current material is migrated.
- **Regenerate from source**: maintain all or part of the page from generated inventory or generated reference output.

## Audit Summary

Historical summary from the rebuild phase: the active tree had useful coverage and source lists, but many pages were skeletal. Several pages listed as missing below now exist or have been enriched. Use this list to understand rebuild intent, not current state. Current strongest/weakest docs are listed in the 2026-06-12 coverage audit.

- first-deployment and setup flow from a clean cluster
- component-specific deployment pages for LiteLLM, Tailscale, Redis, Qdrant, PostgreSQL, and agent deployments
- pipeline runtime, status, resume, failure, telemetry, progress, and artifact interpretation
- contributor guidance for hooks, plugins, agent runtime replacement, linting rules, observability sinks, and verification
- generated inventories for Helm values, scripts, secrets, environment variables, status/artifact paths, telemetry, Redis streams, and verification commands

## Page-By-Page Audit

### Root Documentation Pages

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/README.md` | Keep and expand | Correct active home, but navigation still describes existing sections more than operator jobs. | Add two-click operator/developer paths; link missing target pages after Phase 2. |
| `docs/DOCUMENTATION_HANDOFF_PROMPT.md` | Merge, then archive | Historical handoff prompt duplicates newer rebuild plan/workflow rules and still requires boilerplate source lists everywhere. | Migrate any still-useful session rules into `DOCUMENTATION_WORKFLOW.md`; archive after reconciliation. |
| `docs/DOCUMENTATION_PLAN.md` | Merge, then archive | Large older plan conflicts with the newer rebuild plan on source-reference rules and phase shape. | Extract durable rules not already covered; archive or mark superseded. |
| `docs/DOCUMENTATION_REBUILD_PLAN.md` | Keep during rebuild | Current binding execution plan for this goal. | Keep active until final closeout; later archive or replace with maintenance docs. |
| `docs/DOCUMENTATION_AUDIT.md` | Keep during rebuild | Phase 1 gate artifact created by this audit. | Keep active until it is replaced by generated docs checks or final closeout notes. |
| `docs/DOCUMENTATION_WORKFLOW.md` | Keep and expand | Useful operating guide, but some rules now conflict with optional source-reference standards. | Reconcile with `documentation-conventions.md`; keep as workflow, not page-quality standard. |
| `docs/open-issues.md` | Keep and expand | Correct place for unresolved behavior, but status still says placeholder and old resolved issues make scanning hard. | Normalize active docs backlog entries; consider moving resolved historical issues to archive. |
| `docs/future-implementation-ideas.md` | Keep and expand | Correct future-work home, but roadmap requirements need a reader-facing roadmap page too. | Add `docs/ROADMAP.md`; cross-link ideas from roadmap without claiming current behavior. |

### Getting Started

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/getting-started/README.md` | Keep and expand | Thin landing page; points to current pages but not enough job-based guidance. | Add operator path, contributor path, prerequisites, and known gaps. |
| `docs/getting-started/first-deployment.md` | Rewrite manually | Already admits the clean-cluster path is incomplete; needs a full operator task page. | Requires source verification from `scripts/deploy.sh`, `my-values/setup-secrets.sh`, Helm renders, and deployment checks. |
| `docs/getting-started/local-development.md` | Keep and expand | Useful developer start page, but lacks complete test/check matrix and expected output. | Add exact local commands and link to testing/CI and docs checks. |
| `docs/getting-started/repository-tour.md` | Keep and expand | Correct orientation topic but too brief for new contributors. | Expand with source-of-truth map, active/archive boundaries, and generated docs paths. |

### Architecture

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/architecture/README.md` | Keep and expand | Thin landing page. | Add when-to-read guidance and links to diagrams after Phase 8. |
| `docs/architecture/system-overview.md` | Rewrite manually | Important concept page is only a short summary. | Add components, runtime flow, state ownership, failure behavior, operator implications, and diagrams. |
| `docs/architecture/component-map.md` | Keep and expand | Useful component inventory, but should distinguish deployment components from pipeline/runtime components. | Source-verify against chart, skills, plugins, and infra values; add upstream ownership boundaries. |
| `docs/architecture/runtime-topology.md` | Keep and expand | Useful deployment topology material, but lacks full clean cluster and final-preview topology. | Add diagram; source-verify rendered manifests and service exposure. |
| `docs/architecture/data-flow.md` | Rewrite manually | Too thin for operator understanding. | Add pipeline, Redis, artifact, telemetry, Discord/OpenClaw, and Kubernetes flows. |
| `docs/architecture/lifecycle-and-state.md` | Rewrite manually | Too thin for state authority and restart/recovery behavior. | Source-verify status store, progress, Redis, artifacts, and pipeline runner behavior. |
| `docs/architecture/security-model.md` | Keep and expand | Has current risks and secret behavior, but needs deeper practical model. | Add secret flow, RBAC/sandbox, NodePort exposure, persistence, and upstream security boundaries. |
| `docs/architecture/observability-model.md` | Keep and expand | Good current/non-claim separation; needs operator routing and custom sink explanation. | Link telemetry/reference and future Clawdeck/metrics ideas clearly. |

### Deployment

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/deployment/README.md` | Keep and expand | Thin landing page. | Make setup, secrets, infra, LiteLLM, Tailscale, agents, and verification path reachable. |
| `docs/deployment/agent-deployments.md` | Keep and expand | Useful source-backed details, but not an operator deployment task. | Add prerequisites, install commands, expected pods, probes, logs, and failures. |
| `docs/deployment/ci-and-image-publishing.md` | Keep and expand | Useful but short. | Add image publishing workflow, verification, rollback/pinning notes, and upstream registry references. |
| `docs/deployment/deployment-verification.md` | Keep and expand | Good verification seed, but lacks end-to-end expected states. | Add exact smoke checks, rendered manifest checks, live checks, and limitations. |
| `docs/deployment/docker-images.md` | Merge | Topic overlaps CI/image publishing and reference image values. | Move operator narrative into `ci-and-image-publishing.md`; exact image values to generated reference. |
| `docs/deployment/helm-chart.md` | Regenerate from source | Exact values and templates are drift-prone. | Generate values/template inventory; keep manual chart narrative outside generated blocks. |
| `docs/deployment/infrastructure.md` | Split | Currently covers multiple components in one page. | Split or add component pages for Redis, Qdrant, PostgreSQL, LiteLLM, and Tailscale; link upstream docs. |
| `docs/deployment/networking.md` | Keep and expand | Useful current risk page, but needs operator checks and recovery. | Add services, NodePorts, Tailscale ingress, NetworkPolicy, DNS, checks, and common failures. |
| `docs/deployment/persistent-storage.md` | Keep and expand | Thin and missing expected PVC/state behavior. | Source-verify PVCs, retained config, workspace, Podman, artifacts, and recovery. |
| `docs/deployment/rbac-and-sandbox.md` | Keep and expand | Good security topic, but needs operator-safe verification and risks. | Add RBAC commands, sandbox boundaries, privileged pod risk, and namespace controller behavior. |
| `docs/deployment/secrets.md` | Rewrite manually | Best current deployment page, but needs operator task shape and generated secret inventory. | Add component ownership, creation path, verification, recovery; inventory secret names/keys. |
| `docs/deployment/values-files.md` | Regenerate from source | Values are drift-prone and currently too brief. | Generate values inventory from chart and `my-values/`; keep example-selection narrative manual. |

Missing deployment pages required by the rebuild plan:

- `docs/deployment/deployment-overview.md`
- `docs/deployment/setup-flow.md`
- `docs/deployment/model-provider-prerequisites.md`
- `docs/deployment/litellm.md`
- `docs/deployment/tailscale-operator.md`

### Operators

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/operators/README.md` | Keep and expand | Thin landing page. | Add common operations path, incident path, and final preview path. |
| `docs/operators/install-and-upgrade.md` | Rewrite manually | Current page has useful commands but not full install/upgrade procedure shape. | Add prerequisites, sequencing, verification, rollback, upgrade caveats, and common failures. |
| `docs/operators/running-the-platform.md` | Rewrite manually | Needs normal operating loop, health checks, logs, and escalation. | Source-verify deployments, probes, gateway, Redis, LiteLLM, and Tailscale checks. |
| `docs/operators/running-the-pipeline.md` | Rewrite manually | Lists flags but does not explain full run lifecycle. | Add start/status/resume, expected output, terminal states, artifacts, and escalation. |
| `docs/operators/observability.md` | Add | Required by target tree and plan, currently missing. | Build from architecture observability plus operator checks. |
| `docs/operators/recovery-runbook.md` | Rewrite manually | Example Phase 0 thin page; lacks runbook sections and symptom-driven recovery. | Add symptoms, impact, fast checks, likely causes, recovery, verification, escalation, prevention. |
| `docs/operators/debugging.md` | Rewrite manually | Has useful triage clues but needs structured debugging workflow. | Add deployment, pipeline, Buster, Redis, LiteLLM, Tailscale, and artifact checks. |
| `docs/operators/common-failures.md` | Rewrite manually | Too short for common operator failures. | Turn into symptom/cause/check/recovery entries. |
| `docs/operators/failure-drills.md` | Add | Required by Phase 10, currently missing. | Add drills after operator docs and examples exist. |
| `docs/operators/maintenance.md` | Rewrite manually | Too thin. | Add secret rotation, config updates, generated docs maintenance, storage cleanup, upgrade cadence. |
| `docs/operators/security-operations.md` | Rewrite manually | Too brief for practical security operations. | Add secret handling, RBAC checks, sandbox risks, NodePort/Tailscale exposure, incident evidence. |
| `docs/operators/final-preview-tailscale.md` | Keep and expand | Strong current page, but some deployment setup belongs in deployment/Tailscale guide. | Split deployment prerequisites into `deployment/tailscale-operator.md`; keep operator preview flow here. |

### Pipeline

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/pipeline/README.md` | Keep and expand | Thin landing page. | Add full pipeline reading path and operator/developer split. |
| `docs/pipeline/architecture.md` | Rewrite manually | Too brief for pipeline design. | Add start conditions, modules, gates, status authority, Redis, artifacts, and failure behavior. |
| `docs/pipeline/runtime-flow.md` | Rewrite manually | Needs full run narrative from trigger to terminal state. | Source-verify CLI, runner, module runner, gate runner, approvals, resume, and status. |
| `docs/pipeline/modules-and-gates.md` | Rewrite manually | Lists fields but lacks lifecycle and extension details. | Add custom gate lifecycle, config, examples, failure modes, and operator impact. |
| `docs/pipeline/workers-and-buster.md` | Keep and expand | Better than most pipeline pages, but needs suite-by-suite operational detail. | Source-verify Buster task queue, suites, artifacts, dead-letter, gateway health, and capabilities. |
| `docs/pipeline/failure-and-recovery.md` | Rewrite manually | Too thin for recovery. | Add failure classes, retry/resume decisions, stuck states, evidence collection, and escalation. |
| `docs/pipeline/telemetry-and-artifacts.md` | Rewrite manually | Needs schema-backed telemetry/artifact interpretation. | Generate event/artifact inventory; add custom sink extension points and troubleshooting. |
| `docs/pipeline/progress-json.md` | Add or merge with reference | Target tree expects a pipeline guide; only reference page exists today. | Add interpretation guide; keep field reference generated. |
| `docs/pipeline/configuration.md` | Rewrite manually | Too brief for config operators. | Cover swarm config, module config, environment overrides, validation, and examples. |

### Developers

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/developers/README.md` | Keep and expand | Thin landing page. | Add contributor paths for docs, code, gates, hooks, plugins, runtime, Buster, observability, linting, tests. |
| `docs/developers/codebase-tour.md` | Keep and expand | Useful map, but too shallow. | Expand with ownership, source-of-truth order, generated docs tooling, tests, and plugins. |
| `docs/developers/contributing.md` | Add | Target tree expects docs-specific contributor guidance; root `CONTRIBUTING.md` is not enough. | Link root contributor file and add docs/code workflow. |
| `docs/developers/adding-pipeline-features.md` | Rewrite manually | Needs concrete lifecycle and verification examples. | Source-verify pipeline service boundaries and tests. |
| `docs/developers/adding-gates.md` | Rewrite manually | Needs custom gate contracts, examples, operator impact, and failure modes. | Source-verify registry, runners, gate tests, and configuration. |
| `docs/developers/hooks-and-plugins.md` | Add | Required by target tree, currently missing. | Source-verify OpenClaw plugin and hook extension points. |
| `docs/developers/replacing-agent-runtime.md` | Add | Required by target tree, currently missing. | Distinguish OpenClaw-specific pieces from pipeline-generic contracts. |
| `docs/developers/adding-buster-suites.md` | Rewrite manually | Useful seed, but lacks suite examples and artifacts/failures. | Source-verify Buster suites and test config. |
| `docs/developers/adding-observability-sinks.md` | Add | Required by target tree, currently missing. | Source-verify telemetry dispatch, sinks, plugin observer. |
| `docs/developers/linting-rules.md` | Add | Required by target tree, currently missing. | Inventory lint rules and customization points. |
| `docs/developers/adding-verification.md` | Keep and expand | Useful seed. | Add docs checks, behavior drills, deployment checks, CI integration. |
| `docs/developers/testing-and-ci.md` | Keep and expand | Useful but short. | Add exact commands, expected output, CI workflow links, docs automation. |
| `docs/developers/documentation-conventions.md` | Keep | Phase 0 standard now defines behavior categories, templates, and review checklist. | Revisit after templates move to dedicated files in Phase 4. |

### Reference

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/reference/README.md` | Keep and expand | Thin landing page. | Group generated/manual references and link regeneration commands. |
| `docs/reference/cli.md` | Add and regenerate from source | Target tree expects CLI reference; currently missing. | Generate from Nova/Buster CLI schemas/help where possible. |
| `docs/reference/helm-values.md` | Regenerate from source | Drift-prone values page. | Generate from `charts/kubeclaw/values.yaml` and `my-values/*.yaml`; keep manual notes outside generated block. |
| `docs/reference/environment-variables.md` | Regenerate from source | Drift-prone env var inventory. | Extract from chart templates, values, scripts, and config loaders. |
| `docs/reference/secrets.md` | Add and regenerate from source | Target tree expects exact secret reference; deployment page is narrative only. | Generate secret names, keys, owners, optionality, creation path. |
| `docs/reference/openclaw-config.md` | Keep and partially regenerate | Useful but should separate KubeClaw overlay behavior from OpenClaw upstream docs. | Generate local config fields; link upstream OpenClaw docs for provider behavior. |
| `docs/reference/swarm-config.md` | Keep and partially regenerate | Useful seed, but needs complete fields/defaults/examples. | Generate from `charts/kubeclaw/files/config/swarm.config.json` and runtime config code. |
| `docs/reference/progress-json.md` | Regenerate from source | Needs field-level reference and examples. | Generate schema/fields and add complete success/in-progress/failure examples. |
| `docs/reference/status-and-artifacts.md` | Regenerate from source | Drift-prone status/artifact paths. | Extract statuses, summary paths, logs, evidence, artifacts. |
| `docs/reference/redis-streams.md` | Regenerate from source | Drift-prone stream/key names. | Extract stream names, event envelopes, task queues, completion streams. |
| `docs/reference/telemetry-events.md` | Regenerate from source | Event inventory should be schema-backed. | Generate event names and payload shapes from telemetry schema/tests. |
| `docs/reference/observability-sinks.md` | Add and regenerate from source | Target tree expects sink reference; currently missing. | Source-verify telemetry dispatch and plugin observer routing. |
| `docs/reference/exit-codes.md` | Regenerate from source | Exit codes are exact runtime contract. | Extract from constants, CLI tests, and startup smokes. |
| `docs/reference/test-suites.md` | Add and regenerate from source | Target tree expects exact Buster suite reference; currently missing. | Generate suites, required inputs, outputs, artifacts, failure behavior. |
| `docs/reference/linting-rules.md` | Add and regenerate from source | Target tree expects linting reference; currently missing. | Inventory lint/report rules and config. |
| `docs/reference/buster-task-config.md` | Regenerate from source | Drift-prone task schema. | Extract task types, required payload fields, capabilities, suite config. |
| `docs/reference/verification-commands.md` | Keep and partially regenerate | Good seed for verification, but should track scripts/checks automatically. | Generate command inventory and expected checks. |

### Decisions

| Page | Decision | Reason | Rebuild markers |
| --- | --- | --- | --- |
| `docs/decisions/README.md` | Keep and expand | Thin landing page. | Add decision scope and current/future separation. |
| `docs/decisions/architecture-decisions.md` | Keep and expand | Useful decisions, but too brief. | Add consequences, alternatives, and sources. |
| `docs/decisions/deployment-decisions.md` | Keep and expand | Useful decisions, but needs operator implications. | Include NodePort, Helm, secret, infrastructure, and Tailscale deployment decisions. |
| `docs/decisions/pipeline-decisions.md` | Keep and expand | Useful decisions, but needs runtime and extension rationale. | Include generic gates, Buster boundary, resume/status authority, telemetry choices. |
| `docs/decisions/security-decisions.md` | Keep and expand | Useful but brief. | Add secret persistence, sandbox/RBAC, NodePort/Tailscale, and egress trade-offs. |

## Pages To Archive Or Merge First

The first archive/merge candidates are:

- `docs/DOCUMENTATION_HANDOFF_PROMPT.md`
- `docs/DOCUMENTATION_PLAN.md`
- `docs/deployment/docker-images.md`

Do not delete or archive them until useful current material has been migrated into active workflow, deployment, or reference pages.

## Pages To Generate Or Partially Generate First

The first generated/reference slice should cover:

- `docs/generated/inventory/deploy-script.json`
- `docs/generated/inventory/secret-setup.json`
- `docs/generated/inventory/helm-values.json`
- `docs/reference/helm-values.md`
- `docs/reference/environment-variables.md`
- `docs/reference/secrets.md`
- `docs/reference/verification-commands.md`

These targets give immediate value to deployment/operator docs and satisfy the first automation slice in the rebuild plan.

## First Two Rebuild Work Packages

### Work package 1: Navigation and active-tree normalization

Purpose: make the active docs tree match reader jobs before writing deep content.

Tasks:

- add missing section and target pages required by the rebuild plan
- add `docs/concepts/`
- add `docs/ROADMAP.md`
- add docs/developer contribution pages that are currently missing
- update section landing pages and `docs/README.md`
- mark or move superseded documentation planning files out of the active reader path

Ready criteria:

- active tree has a documented purpose for each major section
- operator and developer paths are reachable from the docs home page
- future/target-state material lives in roadmap or future ideas, not operator procedures

### Work package 2: Deployment/operator source inventory and first operator rewrite

Purpose: establish generated truth for deployment facts and use it to rewrite the highest-value operator pages.

Tasks:

- build the initial inventory command for deploy script, secret setup, and Helm values
- generate stable JSON under `docs/generated/inventory/`
- add a local stale-inventory check
- rewrite setup/secrets/first-deployment pages against the generated inventory
- add or update open issues for any unverified clean-cluster behavior

Ready criteria:

- inventory output can be regenerated and diffed
- deployment operator pages cite source files or generated inventory
- clean-cluster setup gaps are either documented as verified steps or tracked in `docs/open-issues.md`

## Open Issues Added By This Audit

This audit keeps the existing live quickstart issue open and adds a broader docs backlog entry for missing generated inventories and thin active pages:

- `DOCS-2026-06-08-001 — Active docs need generated source inventory before reference pages can be trusted`

## Phase 1 Gate Check

- Every active Markdown page under `docs/` is listed above.
- Every listed page has an audit decision and short reason.
- Pages needing source verification, generated reference output, operator examples, split, merge, archive, or rewrite are marked.
- Archive, split, merge, and generation candidates are explicitly listed.
- The first two rebuild work packages are ordered and ready for Phase 2/3 execution.
- Unclear behavior and verification gaps remain tracked in `docs/open-issues.md`.
