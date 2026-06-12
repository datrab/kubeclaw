# Documentation plan

Status: superseded by `DOCUMENTATION_REBUILD_PLAN.md`
Owner: Nova / maintainers
Goal: produce open-source-ready, code-grounded KubeClaw documentation for the full platform.

## Purpose

This file is historical planning context from an earlier documentation pass. It is no longer the active phase plan. Use `DOCUMENTATION_REBUILD_PLAN.md` for the active goal, `DOCUMENTATION_AUDIT.md` for page-by-page decisions, and `DOCUMENTATION_TARGET_PAGE_LIST.md` for the first rebuild pass target tree.

This document is the execution plan for a Codex documentation session. It should be detailed enough that the session can mechanically inspect the repository, create the documentation tree, migrate useful existing material, and avoid inventing behavior that is not present in code.

The finished documentation must let a new reader understand:

- what KubeClaw is
- how the full system is deployed
- how Nova, Buster, Prism, Redis, Qdrant, LiteLLM, Git, Discord, OpenClaw Gateway, and Kubernetes fit together
- how the pipeline works
- how to operate and recover the deployment
- how to configure it
- how to extend it
- what is current behavior, what is target state, and what still needs work

## Required bootstrap for every docs session

Before writing or moving docs, run:

```bash
git status --short
sed -n '1,220p' docs/DOCUMENTATION_WORKFLOW.md
sed -n '1,260p' docs/DOCUMENTATION_PLAN.md
```

Then inspect source files before writing. Code and rendered manifests are truth for current behavior.

Use OpenClaw documentation as a style reference when useful:

```bash
openclaw docs query "configuration reference"
openclaw docs query "operator guide"
openclaw docs query "architecture"
```

Observed style cues from OpenClaw docs:

- split concepts, tasks, and references
- keep references exact and dry
- make configuration pages navigable with examples
- avoid one giant document as the only entry point
- prefer clear pages with links to deeper details

## Non-negotiable documentation rules

1. **Code-grounded only**
   Every claim about current behavior must be proven from source files, rendered Helm output, tests, scripts, or Dockerfiles.

2. **Whole-platform scope**
   Do not document only the pipeline. Cover deployment, infrastructure, secrets, network/RBAC/security, verification, images, CI, operator workflows, and local development.

3. **No hidden target state**
   If a behavior is planned but not implemented, label it `Target state` or add it to `docs/future-implementation-ideas.md`.

4. **Capture issues**
   If code and docs disagree, or if deployment/security/reliability behavior is unclear, add an entry to `docs/open-issues.md`.

5. **Cross-link instead of copying**
   Architecture explains. Operator guides teach tasks. Reference docs specify exact values. Decision docs explain why.

6. **Source references**
   Do not add source lists by default. Add source references only when they materially help verify implementation-specific claims.

7. **Rendered manifests count**
   For Helm behavior, inspect both templates and rendered Nova/Buster manifests.

## Target documentation tree

Create or normalize this tree under `docs/`:

```text
docs/
  README.md
  DOCUMENTATION_PLAN.md
  DOCUMENTATION_HANDOFF_PROMPT.md
  DOCUMENTATION_WORKFLOW.md
  open-issues.md
  future-implementation-ideas.md

  getting-started/
    README.md
    local-development.md
    first-deployment.md
    repository-tour.md

  architecture/
    README.md
    system-overview.md
    component-map.md
    runtime-topology.md
    data-flow.md
    lifecycle-and-state.md
    security-model.md
    observability-model.md

  deployment/
    README.md
    helm-chart.md
    values-files.md
    agent-deployments.md
    infrastructure.md
    docker-images.md
    secrets.md
    networking.md
    rbac-and-sandbox.md
    persistent-storage.md
    ci-and-image-publishing.md
    deployment-verification.md

  pipeline/
    README.md
    architecture.md
    runtime-flow.md
    modules-and-gates.md
    workers-and-buster.md
    failure-and-recovery.md
    telemetry-and-artifacts.md
    configuration.md

  operators/
    README.md
    install-and-upgrade.md
    running-the-platform.md
    running-the-pipeline.md
    recovery-runbook.md
    debugging.md
    common-failures.md
    maintenance.md
    security-operations.md

  developers/
    README.md
    codebase-tour.md
    adding-pipeline-features.md
    adding-gates.md
    adding-buster-suites.md
    adding-verification.md
    testing-and-ci.md
    documentation-conventions.md

  reference/
    README.md
    helm-values.md
    environment-variables.md
    openclaw-config.md
    swarm-config.md
    progress-json.md
    status-and-artifacts.md
    redis-streams.md
    telemetry-events.md
    exit-codes.md
    buster-task-config.md
    verification-commands.md

  decisions/
    README.md
    architecture-decisions.md
    deployment-decisions.md
    pipeline-decisions.md
    security-decisions.md

  archive/
    README.md
```

The exact file names may be adjusted if the source code proves a better split, but do not collapse the tree into one large document.

Also create or verify the standard open-source repository root files when the project is prepared for public release:

```text
README.md
CONTRIBUTING.md
LICENSE
CODE_OF_CONDUCT.md
SECURITY.md
```

These files live at the repository root, not under `docs/`, because GitHub and GitLab surface them natively. Keep them short and link into `docs/**` for deeper details. Existing versions of these files are still subject to the same source-verification rule as all other documentation.

## Current docs archive layout

The old mixed documentation tree has already been moved out of the public reader path. The public `docs/` root should stay small while the new documentation set is written.

Current root files:

- `docs/DOCUMENTATION_PLAN.md`
- `docs/DOCUMENTATION_HANDOFF_PROMPT.md`
- `docs/DOCUMENTATION_WORKFLOW.md`
- `docs/open-issues.md`
- `docs/future-implementation-ideas.md`

Historical source material now lives under `docs/archive/`:

- `legacy-root-docs/` - old broad references and config docs
- `legacy-pipeline-implementation-map/` - stale implementation maps; use only as historical evidence
- `implementation-map-batches/` - previous batch notes
- `pipeline-plans/` - completed or superseded pipeline plans
- `reviews/` and `reviews2/` - historical review artifacts
- `ts-migration/` - TypeScript migration ledgers and audits
- `clawpatch/` - tool/review outputs
- `lifecycle-unification/` - old lifecycle and telemetry contract docs
- `static-artifacts/` - generated or prototype HTML artifacts

Do not move archived files back into the public docs tree. Extract only code-verified facts into the new target pages, and cite the archive only when a page is explicitly discussing historical context.

Implementation maps are not required for the open-source docs set. Rebuild a small, current implementation map only if source inspection shows it will materially help maintainers; otherwise prefer normal architecture, operator, developer, and reference pages.

### Public docs root rule

After the documentation project is complete, the top level of `docs/` should contain only:

- `README.md`
- `DOCUMENTATION_PLAN.md` if the docs project is still active
- `DOCUMENTATION_HANDOFF_PROMPT.md`
- `DOCUMENTATION_WORKFLOW.md`
- `open-issues.md`
- `future-implementation-ideas.md`
- the target public directories
- `archive/`

Old reference files, reviews, migration ledgers, generated HTML, and one-off plans should not remain as loose root-level docs.

### Repository root community files rule

The repository root may contain standard open-source community files:

- `README.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`

Requirements:

- `README.md` must include a tightly scoped `5-Minute Quickstart` if source-verified commands can provide one. If a true five-minute local path is not currently supported, document the closest verified path and add the gap to `docs/open-issues.md`.
- `CONTRIBUTING.md` should link to `docs/developers/**` and verification docs instead of duplicating long developer guidance.
- `SECURITY.md` must define responsible disclosure for vulnerabilities and separate normal bug reports from sensitive reports such as zero-day, privilege escalation, credential exposure, sandbox escape, or Buster privileged sandbox issues.
- `LICENSE` must be present before public release. Do not invent licensing terms; use the license selected by maintainers.
- `CODE_OF_CONDUCT.md` should be present or explicitly tracked as an open-source readiness gap.

## Standard page template

Use this shape for most pages:

```md
# Page title

Status: current | partial | target-state | needs verification
Audience: operator | developer | maintainer | reference reader

## Purpose

One short paragraph.

## Current behavior

Code-grounded behavior. Use paths, config names, commands, and ownership language.

For complex runtime components, split this section into source-proven subsections instead of writing one long block:

### Initialization

Startup inputs, config loading, environment variables, mounted files, and dependency checks.

### Execution path

Main runtime flow, commands, workers, queues, subprocesses, and external calls.

### State changes

Files written, Redis keys/streams, status/progress mutations, artifacts, cleanup, and terminal states.

## How it fits

Relationships to other components. Link to neighboring docs.

## Operator notes

Omit this entire heading if no actionable code-grounded tasks or diagnostics are found in the sources.

## Developer notes

Omit this entire heading if no actionable code-grounded extension or implementation guidance is found in the sources.

## Open issues

Link to entries in `docs/open-issues.md`, or say `None recorded in this pass`.
```

Reference pages may use a stricter schema/table format:

```md
## Field name

Type:
Default:
Required:
Used by:
Source:
Example:
Notes:
```

Avoid Markdown tables for very wide schemas if they become unreadable. Use repeated field blocks instead.

## Source inventory

The documentation session must inspect these areas.

### Core repository and public entry points

Source files:

- `README.md` if present
- `CONTRIBUTING.md` if present
- `LICENSE` if present
- `CODE_OF_CONDUCT.md` if present
- `SECURITY.md` if present
- `docs/**`
- `skills/nova/pipeline/README.md`
- `skills/buster/README.md`
- `skills/buster/CONVENTIONS.md`
- `skills/nova/pipeline/SKILL.md`
- `skills/nova/project_setup/**`

Reliability note:

- Treat every currently available documentation file as potentially outdated source material to inspect, not as authoritative proof of current behavior.
- This includes all READMEs, archived docs, skill description files, conventions files, and existing public docs.
- Prove current behavior from implementation files, rendered Helm output, tests, scripts, and Dockerfiles before copying any existing documentation claim into new public docs.
- Overhaul or replace existing documentation pages when source-verified behavior disagrees with them.

Docs to produce:

- `README.md`
- `CONTRIBUTING.md`
- `LICENSE` if maintainers have selected license terms
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `docs/README.md`
- `docs/getting-started/repository-tour.md`
- `docs/developers/codebase-tour.md`

Required content:

- what KubeClaw is
- repository layout
- root `README.md` and/or `docs/README.md` `5-Minute Quickstart` with only source-verified commands
- where runtime skills live
- where deployment files live
- where verification lives
- how docs are organized

### Helm chart and agent deployments

Source files:

- `charts/kubeclaw/Chart.yaml`
- `charts/kubeclaw/values.yaml`
- `charts/kubeclaw/templates/*.yaml`
- `charts/kubeclaw/templates/NOTES.txt`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- rendered output from:
  - `helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml`
  - `helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml`

Docs to produce:

- `docs/deployment/helm-chart.md`
- `docs/deployment/values-files.md`
- `docs/deployment/agent-deployments.md`
- `docs/reference/helm-values.md`

Required content:

- chart resources
- template ownership
- Nova values
- Buster values
- gateway command behavior
- Buster split gateway/pipeline containers
- `OPENCLAW_GATEWAY_URL`
- config maps
- secrets
- PVCs
- service account/RBAC
- sandbox mode
- extra containers such as Prism preview
- removed legacy processor sidecar
- rendered resource counts and key rendered fields

Acceptance checks:

- docs explain current Nova and Buster differences
- docs do not mention `processor.enabled` as an active option
- docs include commands to render manifests
- docs link to deployment verifier

### Infrastructure deployment

Source files:

- `my-values/infra/redis-values.yaml`
- `my-values/infra/qdrant-values.yaml`
- `my-values/infra/litellm-values.yaml`
- `my-values/infra/litellm-config.yaml`
- `my-values/infra/litellm-deployment.yaml`
- `my-values/infra/postgresql-values.yaml`
- `my-values/infra/registry-local.yaml`
- `my-values/infra/registry-mirror.yaml`
- `my-values/infra/k3s-registries.yaml`
- `my-values/infra/buster-namespace-fence.yaml`

Docs to produce:

- `docs/deployment/infrastructure.md`
- `docs/deployment/networking.md`
- `docs/deployment/secrets.md`
- `docs/deployment/rbac-and-sandbox.md`
- `docs/reference/environment-variables.md`

Required content:

- Redis role and auth
- Qdrant role
- LiteLLM role and model routing
- PostgreSQL role if used by LiteLLM
- dependency compatibility matrix covering Redis, Qdrant, LiteLLM, PostgreSQL, Helm, Kubernetes/K3s, and supported LLM API/model assumptions
- local registry and mirror
- K3s registry config
- Buster namespace fence
- missing or present NetworkPolicies
- service types and exposure model
- required secrets and keys
- dependency readiness assumptions

Acceptance checks:

- docs identify which infra is deployed by Helm values versus raw manifests
- dependency compatibility matrix distinguishes source-proven tested versions from unknown or target-state support
- docs identify missing NetworkPolicy support if still absent
- docs distinguish required production secrets from example placeholders

### Docker images and supply chain

Source files:

- `docker/Dockerfile.general`
- `docker/Dockerfile.sandbox`
- `docker/Dockerfile.prism-preview`
- `.github/workflows/build-images.yaml`
- `scripts/deploy.sh`
- `tests/verification/deployment/check-deployment-truth.mjs`

Docs to produce:

- `docs/deployment/docker-images.md`
- `docs/deployment/ci-and-image-publishing.md`
- `docs/developers/testing-and-ci.md`

Required content:

- image purposes
- what gets copied into each image
- sandbox capabilities and installed tools
- build/publish workflow
- registry assumptions
- image tags and pinning risks
- local image build command
- live deployment verification command

Acceptance checks:

- docs identify `latest` tag usage if current
- docs identify build workflow inputs and outputs
- docs identify Buster sandbox image capabilities

### OpenClaw Gateway and runtime config

Source files:

- `charts/kubeclaw/templates/configmap-gateway.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `skills/common/pipeline/integrations/gateway.ts`
- `skills/buster/pipeline/services/gateway-health.ts`
- `tests/skills/buster/pipeline/services/gateway-health.test.mjs`
- `tests/verification/contracts/check-acp-gateway-contract-surface.mjs`
- OpenClaw docs query results for gateway/configuration when helpful

Docs to produce:

- `docs/architecture/runtime-topology.md`
- `docs/deployment/agent-deployments.md`
- `docs/reference/openclaw-config.md`
- `docs/operators/debugging.md`

Required content:

- gateway bind/port behavior
- gateway URL and token environment variables
- config persistence at `/home/node/.openclaw`
- init container config initialization and migration
- ACP/session interaction
- gateway health and failure behavior
- how Buster startup depends on gateway URL

Acceptance checks:

- docs explain why Buster uses colocated gateway URL by default
- docs show where OpenClaw config is rendered and mounted
- docs list the migration behavior for persistent `openclaw.json`

### Pipeline and Nova runtime

Source files:

- `skills/nova/pipeline.ts`
- `skills/nova/pipeline/**`
- `skills/common/pipeline/**`
- `tests/skills/nova/pipeline/**`
- `tests/verification/behavior/**`
- `tests/verification/contracts/**`

Docs to produce:

- `docs/pipeline/architecture.md`
- `docs/pipeline/runtime-flow.md`
- `docs/pipeline/modules-and-gates.md`
- `docs/pipeline/failure-and-recovery.md`
- `docs/pipeline/telemetry-and-artifacts.md`
- `docs/reference/progress-json.md`
- `docs/reference/status-and-artifacts.md`
- `docs/reference/exit-codes.md`
- `docs/developers/adding-pipeline-features.md`
- `docs/developers/adding-gates.md`

Required content:

- CLI flow
- progress config
- module lifecycle
- gate lifecycle
- approval gates
- Forge/Buster/Echo responsibilities
- status-store authority
- Redis completion handling
- telemetry and artifacts
- retry/escalation behavior
- terminal exit codes
- verification coverage

Acceptance checks:

- every status/progress/artifact claim cites source files
- docs separate operator flow from developer extension contracts
- docs identify where tests verify lifecycle and contract behavior

### Buster worker and sandbox testing

Source files:

- `skills/buster/buster-pipeline.ts`
- `skills/buster/pipeline/**`
- `skills/buster/CONVENTIONS.md`
- `skills/buster/README.md`
- `tests/skills/buster/**`
- `tests/verification/runtime/check-buster-startup-smoke.mjs`
- `tests/verification/contracts/check-buster-*.mjs`

Docs to produce:

- `docs/pipeline/workers-and-buster.md`
- `docs/reference/buster-task-config.md`
- `docs/developers/adding-buster-suites.md`
- `docs/operators/common-failures.md`

Required content:

- Buster task intake
- Redis stream consumption
- task validation
- suite runner model
- suite catalog
- capabilities/default-deny behavior
- sandbox cleanup
- verify-task scope firewall
- completion emission
- rate-limit and recovery behavior
- operator diagnostics

Acceptance checks:

- docs do not refer to `buster-processor.cjs` as current runtime
- docs describe `buster-pipeline.ts` as the active worker
- docs include suite config sources and tests

### Prism and project setup skills

Source files:

- `skills/prism/**`
- `docker/Dockerfile.prism-preview`
- `my-values/nova-values.yaml` extra container
- `skills/nova/project_setup/**`

Docs to produce:

- `docs/architecture/component-map.md`
- `docs/getting-started/repository-tour.md`
- `docs/developers/codebase-tour.md`
- optional `docs/developers/prism-and-project-setup.md` if the content is large

Required content:

- Prism role
- preview sidecar
- project setup skill files
- where generated designs/config live

### Discord, webhooks, and human operations

Source files:

- `charts/kubeclaw/values.yaml`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- `skills/common/pipeline/integrations/discord-webhook.ts`
- `skills/nova/pipeline/integrations/discord.ts`
- `skills/common/discord-purge.ts`
- `tests/verification/behavior/areas/discord-correlation.mjs`
- `tests/skills/common/discord-purge.test.mjs`

Docs to produce:

- `docs/operators/running-the-platform.md`
- `docs/operators/security-operations.md`
- `docs/reference/environment-variables.md`

Required content:

- Discord token and channel config
- webhook config
- exec approvers
- notification paths
- operator approval behavior
- secret handling warnings

### Observability, notifications, and telemetry sinks

Source files:

- `charts/kubeclaw/templates/**`
- `charts/kubeclaw/values.yaml`
- `my-values/**`
- `skills/common/pipeline/**`
- `skills/common/pipeline/integrations/**`
- `skills/nova/pipeline/**`
- `skills/buster/pipeline/**`
- `tests/verification/behavior/areas/*telemetry*.mjs`
- `tests/verification/behavior/areas/*discord*.mjs`
- `tests/verification/behavior/areas/operator-surface.mjs`
- `tests/verification/contracts/**`

Required search checks:

- Search rendered Helm output and templates for Kubernetes-native observability resources such as `ServiceMonitor`, `PodMonitor`, Prometheus scrape annotations, metrics ports, log annotations, Fluent Bit annotations, Loki annotations, OpenTelemetry collectors, and sidecar log shippers.
- Search Buster and Nova runtime code for file telemetry, artifact writes, Discord notifications, webhooks, and custom sink or integration hooks.
- Search Buster sandbox runtime paths for stdout/stderr capture, task logs, transcript artifacts, cleanup behavior, and whether logs are centrally aggregated.

Docs to produce:

- `docs/architecture/observability-model.md`
- `docs/pipeline/telemetry-and-artifacts.md`
- `docs/reference/telemetry-events.md`
- `docs/operators/debugging.md`
- `docs/operators/running-the-platform.md`

Required content:

- current telemetry and artifact files
- Discord notification paths
- webhook/file notification behavior where source-proven
- custom sink or integration hooks where source-proven
- how operators can collect Nova and Buster pod logs today
- whether Buster sandbox logs are centrally aggregated today
- Kubernetes-native observability resources found in rendered manifests, or explicit statement that none are currently present
- Clawdeck or metric-stack integration only as `Target state` or future work unless implementation exists

Acceptance checks:

- docs do not claim Prometheus, Loki, Fluent Bit, OpenTelemetry, or central Buster log aggregation support unless manifests or runtime code prove it
- missing metric-stack integration is recorded in `docs/open-issues.md` or `docs/future-implementation-ideas.md`
- current file, Discord, webhook, and custom sink behavior is documented from code/tests rather than existing docs

### Verification and testing

Source files:

- `tests/README.md`
- `tests/verification/README.md`
- `tests/verification/run-fast-verification.sh`
- `tests/verification/run-full-verification.sh`
- `tests/verification/run-local-acp-verification.sh`
- `tests/verification/deployment/check-deployment-truth.mjs`
- `tests/verification/behavior/verify.mjs`
- `tests/verification/contracts/*.mjs`
- `tests/verification/runtime/*.mjs`
- `tests/skills/**`

Docs to produce:

- `docs/deployment/deployment-verification.md`
- `docs/developers/testing-and-ci.md`
- `docs/reference/verification-commands.md`

Required content:

- fast verification
- full verification
- behavior areas
- contract checks
- deployment truth
- runtime smoke checks
- live Redis smoke
- what cannot be verified without a cluster

Acceptance checks:

- docs include exact commands
- docs state required external tools such as Helm/kubeconform when used
- docs distinguish local deterministic checks from live cluster checks

### Security model and reliability model

Source files:

- `charts/kubeclaw/templates/rbac.yaml`
- `charts/kubeclaw/templates/serviceaccount.yaml`
- `charts/kubeclaw/templates/secret.yaml`
- `charts/kubeclaw/templates/service.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `my-values/infra/buster-namespace-fence.yaml`
- `skills/common/pipeline/security.ts`
- `skills/common/pipeline/redaction.ts`
- `skills/buster/pipeline/services/capabilities.ts`
- `tests/verification/contracts/check-redis-transport-policy.mjs`
- `tests/verification/behavior/areas/redaction-surface.mjs`
- `docs/archive/legacy-root-docs/deployment-backlog-open-tasks.md`

Docs to produce:

- `docs/architecture/security-model.md`
- `docs/deployment/networking.md`
- `docs/deployment/rbac-and-sandbox.md`
- `docs/operators/security-operations.md`
- `docs/decisions/security-decisions.md`

Required content:

- secret model
- Redis password and optional TLS/network isolation behavior
- missing NetworkPolicies if current
- service exposure and NodePorts
- RBAC and Buster privileged sandbox
- namespace fence
- default-deny Buster capabilities
- redaction behavior
- responsible disclosure expectations for `SECURITY.md`, including sensitive handling for Buster sandbox escape, privilege escalation, credential exposure, and zero-day reports
- operator security checklist

Acceptance checks:

- docs clearly label missing hardening as open issue/backlog
- docs do not claim network isolation exists unless manifests prove it
- docs explain why Buster needs privileged mode if current
- `SECURITY.md` either exists with a source-grounded vulnerability reporting process or the missing file is recorded in `docs/open-issues.md`

## Execution phases

### Execution discipline

Work sequentially to avoid context overflow and stale partial edits:

- At the start of every phase, read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.
- Complete one phase at a time. Do not begin the next phase until the current phase deliverables and acceptance checks are complete.
- Do not voluntarily stop until every phase in this plan is complete.
- Within each phase, work on one target documentation file at a time.
- For each target file, inspect only the source files needed for that page, write or update the page, add source references only when they materially help the reader, run the most relevant focused check, then move to the next file.
- Keep a short phase summary while working: files completed, source references reviewed, open issues created, and checks run.
- Stop early only if genuinely blocked or forced to hand off because context is getting large. In that case, stop at a clean boundary after a completed file and leave the next exact file to continue with.
- Do not load broad archived docs or large source areas into context unless the current file needs them.

### Phase 0 - Prepare and lock scope

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Tasks:

1. Run `git status --short`.
2. Run `rg --files` for the source inventory areas.
3. Confirm no unrelated uncommitted changes will be touched.
4. Choose the first phase target file and keep the work scoped to that file until it is complete.

Deliverables:

- no docs written yet
- short note in session summary listing the source areas found

### Phase 1 - Create documentation skeleton

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Tasks:

1. Create missing directories from the target tree.
2. Create `README.md` files for each major section.
3. Create or verify repository root community files only when maintainers have selected their content or when the file can safely link to source-grounded docs.
4. Add a concise navigation index to `docs/README.md`.
5. Add `Status: scaffold` to pages that are created but not filled.

Acceptance checks:

- `find docs -maxdepth 3 -type f | sort` shows the new tree
- repository root community files are present, intentionally deferred in `docs/open-issues.md`, or left untouched because maintainers must decide content such as license terms
- no page claims implementation behavior before source inspection

### Phase 2 - Full repository inventory and archive review

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Tasks:

1. Confirm the public docs root only contains the active control files listed above, plus any newly created target docs.
2. Review `docs/archive/**` as source material, not as current truth.
3. For each target page, inspect code first and use archived docs only to find topics that may need coverage.
4. Identify stale claims immediately.
5. Record active problems in `docs/open-issues.md`.
6. Record non-blocking ideas in `docs/future-implementation-ideas.md`.
7. Do not create new public docs from archived content unless the claim has been verified against source.

Acceptance checks:

- `find docs -maxdepth 1 -type f | sort` shows only approved root files
- no stale archived docs are linked as current reader paths
- stale archived claims are not copied without source verification
- source files, rendered manifests, tests, or scripts are referenced only when that provenance materially helps the reader

### Phase 3 - Architecture overview

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/architecture/system-overview.md`
- `docs/architecture/component-map.md`
- `docs/architecture/runtime-topology.md`
- `docs/architecture/data-flow.md`
- `docs/architecture/observability-model.md`

Mechanical workflow:

1. Inspect chart values and rendered manifests.
2. Inspect `skills/nova/**`, `skills/buster/**`, `skills/common/**`, and `skills/prism/**` entry points.
3. Write a component map with owner, source files, runtime location, inputs, outputs, and operational notes.
4. For observability, inspect rendered manifests for Kubernetes-native metrics/logging resources and inspect runtime code for current file, Discord, webhook, and custom sink behavior.
5. Add Mermaid diagrams only if they are easy to maintain in Markdown. Do not use static HTML as canonical diagrams.

### Phase 4 - Deployment documentation

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/deployment/helm-chart.md`
- `docs/deployment/values-files.md`
- `docs/deployment/agent-deployments.md`
- `docs/deployment/infrastructure.md`
- `docs/deployment/docker-images.md`
- `docs/deployment/secrets.md`
- `docs/deployment/networking.md`
- `docs/deployment/rbac-and-sandbox.md`
- `docs/deployment/persistent-storage.md`
- `docs/deployment/ci-and-image-publishing.md`
- `docs/deployment/deployment-verification.md`
- `docs/reference/helm-values.md`
- `docs/reference/environment-variables.md`

Mechanical workflow:

1. Render Nova and Buster manifests.
2. Inspect every chart template.
3. Inspect every `my-values/**` file.
4. Inspect every Dockerfile and workflow.
5. Inspect deployment scripts.
6. Write current behavior.
7. Add missing hardening to `docs/open-issues.md`.

### Phase 5 - Operator guide

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/operators/install-and-upgrade.md`
- `docs/operators/running-the-platform.md`
- `docs/operators/running-the-pipeline.md`
- `docs/operators/recovery-runbook.md`
- `docs/operators/debugging.md`
- `docs/operators/common-failures.md`
- `docs/operators/maintenance.md`
- `docs/operators/security-operations.md`

Mechanical workflow:

1. Use deployment docs for setup commands.
2. Use pipeline docs for run/resume/status behavior.
3. Use tests and scripts for verification commands.
4. Include `kubectl`, `helm`, Redis, pod logs, PVC/config checks, and gateway status checks where code supports them.
5. Label any command that requires a live cluster.

### Phase 6 - Pipeline documentation

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/pipeline/architecture.md`
- `docs/pipeline/runtime-flow.md`
- `docs/pipeline/modules-and-gates.md`
- `docs/pipeline/workers-and-buster.md`
- `docs/pipeline/failure-and-recovery.md`
- `docs/pipeline/telemetry-and-artifacts.md`
- `docs/pipeline/configuration.md`
- `docs/reference/progress-json.md`
- `docs/reference/status-and-artifacts.md`
- `docs/reference/redis-streams.md`
- `docs/reference/telemetry-events.md`
- `docs/reference/exit-codes.md`
- `docs/reference/buster-task-config.md`

Mechanical workflow:

1. Review pipeline files in cohesive batches.
2. Promote verified facts into public docs.
3. Capture discrepancies and gaps in `docs/open-issues.md` or `docs/future-implementation-ideas.md`.
4. Document current telemetry/artifact sinks, Discord notifications, webhook/file behavior, and custom integration hooks only where code/tests prove them.
5. Rebuild a maintainer implementation map only if it adds clear value beyond the public docs.

Batch template:

```md
# Batch name

Status:
Files reviewed:

## Role

## Imports and dependencies

## Exports and public surface

## Runtime inputs

## Files and paths touched

## Authority and state writes

## Error and recovery behavior

## Verification coverage

## Verified Facts

Facts proven from code/tests/rendered output that can move into public docs.

## Discrepancies & Gaps

Contradictions with existing docs, unclear behavior, missing tests, or operator risks. Move active items into `docs/open-issues.md`; move non-blocking ideas into `docs/future-implementation-ideas.md`.
```

### Phase 7 - Developer guide

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/developers/codebase-tour.md`
- `docs/developers/adding-pipeline-features.md`
- `docs/developers/adding-gates.md`
- `docs/developers/adding-buster-suites.md`
- `docs/developers/adding-verification.md`
- `docs/developers/testing-and-ci.md`
- `docs/developers/documentation-conventions.md`

Mechanical workflow:

1. Derive extension rules from current code and tests.
2. Include required verification for each kind of change.
3. Document ownership boundaries.
4. Do not turn internal implementation quirks into public extension promises.

### Phase 8 - Reference layer

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write exact references:

- `docs/reference/helm-values.md`
- `docs/reference/environment-variables.md`
- `docs/reference/openclaw-config.md`
- `docs/reference/swarm-config.md`
- `docs/reference/progress-json.md`
- `docs/reference/status-and-artifacts.md`
- `docs/reference/redis-streams.md`
- `docs/reference/telemetry-events.md`
- `docs/reference/exit-codes.md`
- `docs/reference/buster-task-config.md`
- `docs/reference/verification-commands.md`

Mechanical workflow:

1. Extract fields from code/config.
2. Cite exact source files.
3. Include defaults and required/optional status.
4. Avoid prose-heavy explanations. Link to concepts/operator docs.

### Phase 9 - Decisions

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Write:

- `docs/decisions/architecture-decisions.md`
- `docs/decisions/deployment-decisions.md`
- `docs/decisions/pipeline-decisions.md`
- `docs/decisions/security-decisions.md`

Mechanical workflow:

1. Use current code as proof and archived docs only as historical source material for topics to verify.
2. Mark decisions as current or target-state.
3. Keep each decision short:
   - Context
   - Decision
   - Consequences
   - Optional source references

### Phase 10 - Link, verify, and archive

Phase start:

- Read `docs/DOCUMENTATION_WORKFLOW.md` and `docs/DOCUMENTATION_HANDOFF_PROMPT.md`.

Tasks:

1. Add cross-links from `docs/README.md`.
2. Update or add docs-surface verification if needed.
3. Run docs and deployment checks.
4. Confirm `find docs -maxdepth 1 -type f | sort` contains only approved root files from the public docs root rule.
5. Confirm public docs do not link readers into archive/review/migration material unless the link is explicitly labeled historical.

Suggested checks:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
git diff --check
```

## Open-source readiness checklist

The documentation effort is not complete until these are true:

- `docs/README.md` is a clear landing page.
- root `README.md` and/or `docs/README.md` contains a source-verified quickstart, or the missing quickstart path is recorded in `docs/open-issues.md`.
- standard repository root files are present or explicitly tracked as readiness gaps: `CONTRIBUTING.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
- `SECURITY.md` defines responsible disclosure and separates normal bugs from sensitive security reports.
- a new operator can find install, upgrade, recovery, and debugging steps.
- a new developer can find the codebase tour and extension rules.
- deployment docs cover Helm, values, infra, images, secrets, networking, RBAC, storage, and CI.
- `docs/deployment/infrastructure.md` includes a dependency compatibility matrix with tested/source-proven versions separated from unknown support.
- pipeline docs cover Nova, Buster, Redis, gates, artifacts, telemetry, and failure behavior.
- observability docs state exactly how telemetry and logs can be collected today, including file/artifact outputs, Discord notifications, webhooks, custom sink hooks, pod logs, and whether Kubernetes-native metrics/logging resources exist.
- references include values, env vars, config files, Redis streams, telemetry events, artifacts, and exit codes.
- security docs clearly state current protections and missing hardening.
- current docs avoid boilerplate source lists; source references appear only where useful.
- stale old docs are archived or merged.
- docs do not claim unimplemented NetworkPolicies, TLS, image pinning, or HA behavior.
- any gap discovered during writing is captured in `docs/open-issues.md` or `docs/future-implementation-ideas.md`.
