# Open issues

Status: current tracker
Owner: Nova / maintainers
Archived previous tracker: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

## Purpose

This file tracks current source-backed issues, documentation gaps, verification gaps, and maintainer decisions discovered during implementation and documentation review.
The previous tracker was archived under `docs/archive/` at the path above.

## Entry format

```md
## <issue title>

Status: open | investigating | blocked | resolved | migrated-to-github | later
Area: pipeline | buster | docs | operators | developers | system | reference | verification | security
Priority: low | medium | high | critical
Type: bug | inconsistency | simplification | docs-gap | verification-gap | risk | decision-needed

### Evidence

- `path/to/file.js`
- `path/to/test.mjs`

### Affected files

Mandatory. List exact repo-relative file paths, one per bullet, with the reason each file must change or be verified. Do not use vague areas without paths.

- `path/to/file.js` — reason this file must change or be verified.

### Problem / in-depth issue description

Mandatory. Describe what is wrong or unclear in enough detail that another maintainer can reproduce, verify, or implement the fix without re-reading the original review thread. Include observed behavior, expected behavior, authority/ownership confusion, and relevant edge cases.

### Impact

Why it matters.

### Next step

The smallest useful action to move this forward.

### Links / files

Related code, docs, logs, or GitHub issue link when available.
```

## Capture rules

- Add an issue immediately when documentation code review finds something relevant.
- Every new issue must include exact `### Affected files` with per-file reasons.
- Every new issue must include an in-depth `### Problem / in-depth issue description`.
- Keep entries factual and source-backed.
- Put future ideas that are not current problems in `docs/future-implementation-ideas.md` instead.

## Current limitation index

Use this short index for active operator-facing gaps; detailed entries remain below.

- No complete source-verified clean-cluster quickstart yet: `DOCS-2026-06-05-001`.
- Drift-prone reference inventories still need broader generation coverage: `DOCS-2026-06-08-001`.
- License and public security disclosure contact remain maintainer decisions.
- Buster still carries privileged sandbox and broad Kubernetes testing authority.
- LiteLLM and Nova Prism preview still use temporary NodePorts.
- NetworkPolicy exists and is verified, but it is portable/port-based rather than Cilium/FQDN-aware.
- Kubernetes-native metrics/log aggregation is not implemented in this repository.

## DOCS-2026-06-05-001 — Complete live first-deployment quickstart is not source-verified

Status: open
Area: docs
Priority: medium
Type: docs-gap

### Evidence

- `README.md`
- `docs/getting-started/first-deployment.md`
- `scripts/deploy.sh`
- `my-values/setup-secrets.sh`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- `tests/verification/deployment/check-deployment-truth.mjs`

### Affected files

- `README.md` — currently documents verified render/deployment-truth checks, not a full live quickstart.
- `docs/getting-started/first-deployment.md` — explicitly records the missing source-verified live deployment flow.
- `scripts/deploy.sh` — must be checked or extended before a quickstart can promise live cluster behavior.
- `my-values/setup-secrets.sh` — must be checked or extended before a quickstart can promise secret provisioning behavior.

### Problem / in-depth issue description

The repository has source-backed commands for rendering Nova and Buster and running deployment truth verification. It does not yet have a complete clean-cluster quickstart that proves namespace setup, prerequisite installation, secret creation, infrastructure install order, agent install order, smoke verification, and rollback. Writing such a guide without source support would invent behavior.

### Impact

New operators can validate manifests locally, but they do not yet have a guaranteed five-minute live install path.

### Next step

Create or verify a full live-cluster bootstrap script and document it with exact prerequisites, commands, expected outputs, and rollback steps.

### Links / files

- `docs/getting-started/first-deployment.md`
- `tests/verification/deployment/check-deployment-truth.mjs`

## DOCS-2026-06-08-001 — Active docs need generated source inventory before reference pages can be trusted

Status: open
Area: docs
Priority: high
Type: verification-gap

### Evidence

- `docs/DOCUMENTATION_REBUILD_PLAN.md`
- `docs/DOCUMENTATION_AUDIT.md`
- `docs/developers/documentation-conventions.md`
- active docs inventory from `find docs -path 'docs/archive' -prune -o -path 'docs/generated' -prune -o -type f -name '*.md' -print`

### Affected files

- `docs/reference/helm-values.md` — must become generated or inventory-backed because chart and values data are drift-prone.
- `docs/reference/environment-variables.md` — must become generated or inventory-backed because env vars are spread across templates, scripts, values, and runtime config code.
- `docs/reference/secrets.md` — does not exist yet, but the rebuild requires exact secret names, keys, owners, optionality, creation paths, and verification commands.
- `docs/reference/telemetry-events.md` — must become generated or inventory-backed because telemetry event names and payloads are runtime contracts.
- `docs/reference/redis-streams.md` — must become generated or inventory-backed because stream and key names are runtime contracts.
- `docs/reference/status-and-artifacts.md` — must become generated or inventory-backed because status names and artifact paths are operator-facing contracts.
- `docs/reference/verification-commands.md` — must become generated or inventory-backed because verification commands and scripts should not drift from the repository.
- `docs/generated/inventory/` — must be created as the stable generated inventory output location.

### Problem / in-depth issue description

The active docs contain many source-backed prose pages, but the rebuild audit found that exact reference facts are still mostly maintained manually. Helm values, script commands, secret keys, environment variables, telemetry events, Redis streams, status values, artifact paths, and verification commands are all drift-prone. Without generated inventory and stale-output checks, reference pages can look authoritative while silently diverging from source files.

### Impact

Operators and maintainers could follow stale reference values during setup, recovery, or extension work. This is especially risky for secrets, values, environment variables, telemetry, Redis streams, and verification commands because incorrect names or defaults produce confusing deployment and pipeline failures.

### Next step

Build the Phase 3 initial inventory command for deploy script behavior, secret setup behavior, and Helm values; write stable JSON under `docs/generated/inventory/`; then wire a local stale-inventory check before regenerating reference pages.

### Links / files

- `docs/DOCUMENTATION_AUDIT.md`
- `docs/DOCUMENTATION_REBUILD_PLAN.md`

## DOCS-2026-06-05-002 — Repository license is not selected

Status: open
Area: docs
Priority: medium
Type: decision-needed

### Evidence

- `README.md`
- `CONTRIBUTING.md`
- `docs/DOCUMENTATION_PLAN.md`
- repository root file listing

### Affected files

- `LICENSE` — absent until maintainers select license terms.
- `README.md` — records that license terms are not selected.
- `docs/open-issues.md` — tracks the missing decision.

### Problem / in-depth issue description

The documentation plan requires root community files including `LICENSE`, but it also forbids inventing license terms. No source-backed license file exists at the repository root. This must remain an explicit maintainer decision rather than a generated placeholder license.

### Impact

External reuse, contribution expectations, and redistribution rights remain unclear.

### Next step

Maintainers should choose a license and add the exact `LICENSE` text.

### Links / files

- `README.md`

## SECURITY-2026-06-05-001 — Public security disclosure contact is not selected

Status: open
Area: security
Priority: medium
Type: decision-needed

### Evidence

- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- repository root file listing

### Affected files

- `SECURITY.md` — currently records the absence of a public disclosure channel.
- `CODE_OF_CONDUCT.md` — currently references private maintainer coordination instead of a public moderation/security contact.
- `docs/open-issues.md` — tracks the decision gap.

### Problem / in-depth issue description

The repository now has a security policy file, but maintainers have not selected a public security contact, disclosure mailbox, private advisory workflow, or response SLA. The generated docs cannot invent those details.

### Impact

Security reporters do not have a public, source-backed private disclosure path.

### Next step

Maintainers should select and publish the disclosure channel and update `SECURITY.md`.

### Links / files

- `SECURITY.md`

## DEPLOY-2026-06-05-001 — Buster has broad Kubernetes RBAC and privileged sandbox permissions

Status: open
Area: security
Priority: high
Type: risk

### Evidence

- `charts/kubeclaw/templates/rbac.yaml`
- `charts/kubeclaw/templates/deployment.yaml`
- `my-values/buster-values.yaml`
- `my-values/infra/buster-namespace-fence.yaml`
- `docs/deployment/rbac-and-sandbox.md`
- `docs/architecture/security-model.md`

### Affected files

- `charts/kubeclaw/templates/rbac.yaml` — renders Buster ClusterRole and ClusterRoleBinding when service account creation is enabled.
- `charts/kubeclaw/templates/deployment.yaml` — renders privileged sandbox container security context when sandboxing is enabled.
- `my-values/buster-values.yaml` — enables sandbox mode and service account creation for Buster.
- `my-values/infra/buster-namespace-fence.yaml` — constrains namespace create/delete by service account and prefix, but does not replace full RBAC review.
- `docs/deployment/rbac-and-sandbox.md` — documents current behavior and risk.
- `docs/architecture/security-model.md` — documents trust boundary.

### Problem / in-depth issue description

Buster is intentionally configured for destructive validation work. The current deployment grants a service account and sandbox container posture that include broad testing capabilities. The namespace fence only covers namespace CREATE/DELETE admission behavior for allowed prefixes and does not fully constrain all Kubernetes actions Buster can perform through its ClusterRole.

### Impact

If Buster is compromised or misconfigured, it has a larger blast radius than Nova.

### Next step

Review the Buster ClusterRole against required suite behavior and reduce permissions where source-verified test coverage allows.

### Links / files

- `docs/deployment/rbac-and-sandbox.md`

## DEPLOY-2026-06-05-002 — Temporary NodePorts remain for LiteLLM and Prism preview

Status: open
Area: operators
Priority: medium
Type: risk

### Evidence

- `charts/kubeclaw/values.yaml`
- `charts/kubeclaw/templates/service.yaml`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- `my-values/infra/litellm-deployment.yaml`
- `my-values/infra/registry-local.yaml`
- `docs/deployment/networking.md`

### Affected files

- `charts/kubeclaw/templates/service.yaml` — renders service ports and NodePorts.
- `charts/kubeclaw/templates/service-extra-nodeports.yaml` — renders explicit extra-port NodePort Services.
- `my-values/nova-values.yaml` — configures Prism preview NodePort.
- `my-values/infra/litellm-deployment.yaml` — configures LiteLLM NodePort.
- `my-values/infra/registry-local.yaml` — keeps registry-local ClusterIP.
- `docs/deployment/networking.md` — documents the exposed surfaces.

### Problem / in-depth issue description

The current production values keep Nova and Buster gateway Services cluster-internal and keep registry-local as ClusterIP. LiteLLM and Nova Prism preview still use temporary NodePorts until Cilium/gateway routing or a private Tailscale-only path replaces them. The repository NetworkPolicy baseline preserves those temporary ingress paths so this NodePort exposure remains a separate tracked risk.

### Impact

Cluster node network exposure remains for LiteLLM and Prism preview.

### Next step

Replace the remaining LiteLLM and Prism preview NodePorts with the target private gateway/Tailscale routing path, then verify rendered manifests.

### Links / files

- `docs/deployment/networking.md`

## DEPLOY-2026-06-05-003 — OpenClaw runtime config secret persistence guard

Status: resolved
Area: security
Priority: high
Type: risk

### Evidence

- `charts/kubeclaw/templates/deployment.yaml`
- `charts/kubeclaw/templates/configmap-gateway.yaml`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- `docs/deployment/secrets.md`

### Affected files

- `charts/kubeclaw/templates/deployment.yaml` — init container normalizes the persistent source config to SecretRefs and keeps webhook expansion in `/runtime-config`.
- `charts/kubeclaw/templates/configmap-gateway.yaml` — renders `openclaw.json` with env SecretRefs for LiteLLM and Discord token fields.
- `docs/deployment/secrets.md` — documents current secret flow and persistence behavior.

### Problem / in-depth issue description

The original risk was that the deployment init container could copy OpenClaw config into the PVC-backed config mount and substitute secret values such as LiteLLM API key and Discord token there. The current template now keeps `/config/openclaw.json` normalized with env SecretRefs and only writes webhook-expanded `swarm.config.json` into the `emptyDir` runtime overlay.

### Impact

The PVC should no longer receive newly substituted runtime secrets from the current init path. Existing clusters that ran older templates should still inspect retained config PVC contents before assuming historical secret material is gone.

### Next step

Design a runtime secret injection path that avoids writing substituted secrets to persistent storage, or document and enforce access controls around the config PVC.

### Links / files

- `docs/deployment/secrets.md`

## DEPLOY-2026-06-05-004 — Runtime image tags and CI base checks use different pinning models

Status: open
Area: deployment
Priority: medium
Type: risk

### Evidence

- `docker/Dockerfile.general`
- `docker/Dockerfile.sandbox`
- `my-values/nova-values.yaml`
- `my-values/buster-values.yaml`
- `docs/deployment/docker-images.md`
- `docs/deployment/ci-and-image-publishing.md`

### Affected files

- `docker/Dockerfile.general` — uses an OpenClaw `latest` base image.
- `docker/Dockerfile.sandbox` — uses an OpenClaw `latest` base image.
- `my-values/nova-values.yaml` — uses a `latest` style runtime image tag.
- `my-values/buster-values.yaml` — uses a `latest` style runtime image tag.
- `docs/deployment/docker-images.md` — documents image behavior.
- `docs/deployment/ci-and-image-publishing.md` — documents CI/image publishing behavior.

### Problem / in-depth issue description

The runtime image definitions and production values use mutable `latest` style tags, while the CI base digest check references a pinned OpenClaw base tag. The repository therefore has mixed pinning semantics across build verification and deployed image selection.

### Impact

Build and deployment reproducibility can drift when mutable tags move.

### Next step

Choose a consistent pinning policy for Dockerfiles, CI checks, and production values.

### Links / files

- `docs/deployment/docker-images.md`

## DEPLOY-2026-06-05-005 — NetworkPolicy baseline still needs FQDN-aware tightening

Status: resolved
Area: security
Priority: medium
Type: risk

### Evidence

- `charts/kubeclaw/`
- `my-values/`
- `docs/deployment/networking.md`
- `docs/architecture/security-model.md`

### Affected files

- `my-values/infra/network-policies.yaml` — defines the namespace default-deny baseline and explicit allow policies.
- `scripts/deploy.sh` — applies the policy during infra deployment and removes it during infra teardown.
- `docs/deployment/networking.md` — documents the current NetworkPolicy model and future Cilium/FQDN tightening.
- `docs/architecture/security-model.md` — records the resulting trust boundary.

### Problem / in-depth issue description

The repository now includes portable Kubernetes NetworkPolicy resources for agent pods, Redis, Qdrant, LiteLLM, PostgreSQL, registry-local, and registry-mirror. The current model uses default-deny ingress and egress with explicit allowances. Agent pods, LiteLLM, and registry-mirror keep broader internet egress by port so bootstrap and runtime behavior keep working before Cilium/FQDN policy is available.

### Impact

Clusters with NetworkPolicy enforcement get repository-defined namespace segmentation instead of relying on cluster defaults.

### Next step

Future hardening should replace broad port-based internet egress with Cilium FQDN policy once Cilium is available.

### Links / files

- `docs/deployment/networking.md`

## Triage board

Last reviewed: 2026-05-13 (gateway-boundary review added OI-47)

| ID | Issue | Decision | Risk | Patch size | Required verification | Owner surface |
| --- | --- | --- | --- | --- | --- | --- |
| P00a-ISSUE-001 | Nova CLI strict parser errors bypass CLI error envelope | Resolved | Medium | Small | `check-nova-startup-smoke.mjs` invalid-argv cases passed | `skills/nova/pipeline/cli.ts` |
| P01-ISSUE-001 | Runtime `--thinking adaptive` is accepted by policy but omitted from Nova CLI help | Resolved | Low | Small | `check-nova-startup-smoke.mjs` policy-derived help assertion passed | `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/core/policy.ts` |
| P02-ISSUE-001 | Registry validation throws `TypeError` for unknown plugin `manifest.kind` | Resolved | Medium | Small | `foundations` registry regression passed | `skills/nova/pipeline/core/registry/validation.ts` |
| P03-ISSUE-001 | Git runtime-state classifier rejects relative `.swarm/...` paths | Resolved | Medium | Small | `foundations` runtime-state classifier regression passed | `skills/nova/pipeline/integrations/git-worktree.ts` |
| P07-ISSUE-001 | Module Buster crash-exhaustion verification fails on guarded `phase_started_at` status save | Resolved in V02a3 | High | Medium | `module-failures` area passed | `skills/nova/pipeline/agents/module-workers.ts`, `skills/nova/pipeline/runners/module-runner-buster-worker.ts` |
| P13-ISSUE-001 | Generator result builder lacks an explicit validator/normalizer owner | Resolved | Medium | Small/Medium | `check-generator-result-surface.mjs` validator/normalizer cases passed | `skills/nova/pipeline/services/contracts/generator-result.ts` |
| P16-ISSUE-001 | Telemetry event payload builders lack a centralized validator/schema owner | Resolved | Medium | Medium | `check-telemetry-contract.mjs` schema registry/exhaustiveness cases passed | `skills/common/pipeline/services/telemetry/payload-schema.ts`, `skills/nova/pipeline/services/telemetry/dispatch.ts`, `skills/nova/pipeline/services/observability.ts` |
| P17-ISSUE-001 | Redis completion stream entries lack an explicit validator/schema owner | Resolved | Medium | Medium | `check-redis-completion-service-surface.mjs` normalized envelope/completion schema cases passed | `skills/common/pipeline/services/redis-message-contract.ts`, `skills/nova/pipeline/services/redis-completion.ts`, `skills/nova/pipeline/services/completion-adjudicator.ts` |
| P17-ISSUE-002 | Redis task/work streams should migrate to the normalized pipeline message envelope | Resolved | Medium | Medium/Large | `check-redis-completion-service-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`, `operator-surface`, and `buster-runtime-normalization` passed | `skills/common/pipeline/services/redis-message-contract.ts`, `skills/nova/pipeline/tools/redis.ts`, `skills/buster/pipeline/services/task-queue.ts`, `skills/buster/pipeline/services/task-completion.ts` |
| P18b-ISSUE-001 | Summary rate-limit builders drop gateway-label fallback/tracked correlation | Resolved | Medium | Small | `check-rate-limit-slice-surface.mjs` and `summaries.mjs` summary exhaustion correlation regression passed | `skills/nova/pipeline/services/rate-limit-builders.ts`, `skills/nova/pipeline/services/rate-limit-exit.ts` |
| P19-ISSUE-001 | Architecture progress validation throws on non-string execution_order entries | Resolved | Medium | Small | `pipeline.mjs` architecture-validator malformed execution-order regression passed | `skills/nova/pipeline/services/arch-validator-checks.ts`, `tests/verification/behavior/areas/pipeline.mjs` |
| P20-ISSUE-001 | Blueprint commit helper can commit unrelated pre-staged files | Resolved | Medium | Medium | `check-blueprint-commit-scope.mjs` clean and dirty-index cases passed | `skills/nova/pipeline/services/blueprint.ts` |
| P21-ISSUE-001 | Lint-report temp output files are never removed | Resolved | Low | Small | `check-validator-control-result-surface.mjs` temp-cleanup and full-lint artifact retention cases passed | `skills/nova/pipeline/services/lint.ts`, `skills/nova/pipeline/services/module-validators.ts` |
| P22-ISSUE-001 | Forge and fix prompts instruct agents to run broad `git add -A` | Resolved | Medium | Medium | `lifecycle-state-surface`, `foundations`, `polling`, `module-failures`, `migrated-seams`, `many-module-soak`, `repo-docs`, and worker-control contract passed | `skills/nova/pipeline/prompts/forge.ts`, `skills/nova/pipeline/prompts/gate-fix.ts`, `skills/nova/pipeline/prompts/review.ts`, Forge completion polling |
| P23a-ISSUE-001 | Project-summary explicit repo root remains a Git-root contract | Resolved | Medium | Small | `summaries` area explicit non-git repo rejection passed | `skills/nova/pipeline/tools/project-summary.ts`, `tests/verification/behavior/areas/summaries.mjs` |
| P23a-ISSUE-002 | Case-study base uses stale field names for unit-test and hardest-module metrics | Resolved | Medium | Small | `summaries` area collector-shaped formatter regression passed | `skills/nova/pipeline/tools/project-summary-formatters.ts`, `tests/verification/behavior/areas/summaries.mjs` |
| P23b-ISSUE-001 | lint-report CLI exits 0 when tools fail but emit no findings | Resolved | Medium | Small | `check-strict-cli-args-surface.mjs` synthetic tool-failure exit mapping passed | `skills/nova/pipeline/tools/lint-report.ts`, `skills/nova/pipeline/tools/lint-report/report.ts` |
| B00a-ISSUE-001 | Buster conventions still instruct subagents to update `module status JSON artifact` directly | Resolved | Medium | Small | `check-buster-pipeline-slice-surface.mjs` conventions drift assertions passed | `skills/buster/CONVENTIONS.md`, `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`, implementation maps |
| B02a-ISSUE-001 | Buster gitPushWithRetry optional commit path stages the entire worktree | Resolved | Medium | Large | `check-buster-verify-task-scope.mjs`, `check-buster-pipeline-slice-surface.mjs`, and `buster-runtime-normalization` Buster task identity regression passed | `skills/buster/pipeline/services/git-workflows.ts`, Buster completion workflow, implementation maps |
| B03-ISSUE-001 | Buster k8s suite accepts namespace prefixes that cleanup later refuses to delete | Resolved | Medium | Small | `shell-boundary` invalid namespace-prefix regression passed | `skills/buster/pipeline/suites/k8s.ts`, `tests/verification/behavior/areas/shell-boundary.mjs`, implementation maps |
| B04-ISSUE-001 | Buster visual-reg telemetry reports Discord sent even when delivery is skipped or fails | Resolved | Medium | Small | `operator-surface` visual-reg delivery-result and telemetry projection regressions passed | `skills/buster/pipeline/suites/visual-reg.ts`, `skills/buster/pipeline/suites/visual-reg-discord.ts` |
| B04-ISSUE-002 | Buster visual-audit can leak temp media directories when Discord upload throws | Resolved | Low | Small | `operator-surface` visual-audit throwing-upload cleanup regression passed | `skills/buster/pipeline/tools/visual-audit.ts` |
| B05-ISSUE-001 | Buster telemetry accepts arbitrary event-type payloads without a centralized schema validator | Resolved | Medium | Medium | `check-telemetry-contract.mjs` common schema/plugin-event validation passed | `skills/common/pipeline/services/telemetry/payload-schema.ts`, `skills/buster/pipeline/services/telemetry.ts`, Buster plugin emitters, implementation maps |
| C00a-ISSUE-001 | Discord purge can stall on single-message non-rate-limit delete failures | Resolved | Low | Small | Single DELETE non-429 failures now throw terminal errors; tests intentionally not added per maintainer decision | `skills/common/discord-purge.ts` |
| C00b-ISSUE-001 | Common ACP/gateway helper result shapes are consumed as contracts but have no central validator/schema owner | Resolved | Medium | Medium | `check-acp-gateway-contract-surface.mjs`, `check-common-helper-import-surface.mjs`, and `runtime-monitor` area passed | `skills/common/pipeline/services/acp-gateway-contract.ts`, ACP monitor/lifecycle/gateway callers, implementation maps |
| S00-ISSUE-001 | Project setup and Prism docs still document legacy visual-reg `baseline_dir` and `.cjs` tool names | Resolved | Medium | Small | `docs-surface` visual-reg docs drift assertion and `check-buster-repo-scoped-paths.mjs` source contract passed | `skills/nova/project_setup/module-files.md`, `skills/nova/project_setup/progress-json.md`, `skills/prism/prism-conventions.md`, implementation maps |
| S00-ISSUE-002 | progress-json ACP monitor defaults drift from current common monitor defaults | Resolved | Low | Medium | `foundations`, `docs-surface`, `runtime-monitor`, `telemetry`, `buster-runtime-normalization`, and `polling` areas passed | `swarm.config.json`, ACP monitor config validation/consumers, project setup docs, implementation maps |
| OI-34 | Milestone-based state authority deprecation needs an explicit cutoff contract | Resolved | Critical | Medium | status-store/gate-active-session contracts plus restart-recovery/polling/foundations/lifecycle focused areas passed | `skills/nova/pipeline/services/status-store.ts`, `skills/nova/pipeline/services/gate-active-session.ts`, lifecycle read models |
| OI-35 | Gate-specific runner orchestration should collapse into a generic strategy-based GateRunner | Resolved | High | Small | `check-gate-control-result-surface.mjs`, `check-remediation-handoff-surface.mjs`, and `gates,approvals` behavior areas passed | `skills/nova/pipeline/runners/gate-runner.ts`, built-in gate adapters, registry stage entries |
| OI-36 | Pipeline and module runner state machines are fragmented across many micro-modules | Resolved | High | Medium | `check-pipeline-runner-slice-surface.mjs` and `check-module-runner-slice-surface.mjs` explicit state-machine planner coverage passed | `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`, `skills/nova/pipeline/runners/module-runner/state-machine.ts` |
| OI-37 | Redis transport needs a formal TaskQueue/EventBus abstraction boundary | Resolved | Medium | Medium | `check-redis-completion-service-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`, `check-common-helper-import-surface.mjs`, `buster-runtime-normalization`, and `agent-lifecycle` passed | TaskQueue/EventBus Redis transport boundary |
| OI-38 | Nova repo-local re-export facade files duplicate canonical common pipeline package surfaces | Later | Low | Small | Keep runtime collision/shim coverage proving common overwrites shims | `skills/nova/pipeline/*` common repo-local re-export facades, `skills/common/pipeline/` |
| OI-39 | Artifact path construction is scattered across string-based module-local helpers | Resolved | Medium | Medium | `check-path-construction-surface.mjs` central helper/path-boundary cases passed | `skills/nova/pipeline/core/paths.ts`, gate/output/approval/Redis artifact writers |
| OI-40 | Discord identity serialization is duplicated across lifecycle, runner, and gate surfaces | Resolved | Low | Medium | `approvals,gates,fix-cycles,module-failures,agent-lifecycle,discord-correlation,operator-surface`, rate-limit/pipeline/module/gate contracts passed | `skills/common/pipeline/services/rate-limit-contract.ts`, `skills/nova/pipeline/services/discord-fields.ts`, Discord callers |
| OI-41 | ACP monitor/lifecycle circular lazy import is structural coupling | Resolved | Medium | Medium | `check-critical-dynamic-imports.mjs`, `check-common-helper-import-surface.mjs`, `check-acp-gateway-contract-surface.mjs`, and focused behavior areas passed | `skills/common/pipeline/agents/tracked-agents.ts`, `skills/common/pipeline/agents/session-semantics.ts`, ACP monitor/lifecycle facades |
| OI-42 | Active polling loops should be evaluated for event-driven or blocking wait patterns | Resolved | Medium | Medium/Large | Phase 6 closure verified with OI-42 docs/map status check and `git diff --check`; prior implementation verification remains `polling,gates,docs-surface` plus event/adapter/controller contract checks | Event contract, completion adapters, Buster module/gate completion waits, living maps |
| OI-43 | Non-critical failure paths have incomplete degraded telemetry coverage | Resolved | Medium | Medium | `operator-surface`, `check-git-soft-fail-observability-surface.mjs`, `check-system-io-warning-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`, syntax checks passed | Buster Discord transport, Nova git soft-fail helper/callers, system I/O warning helper/schema, living maps |
| OI-44 | Contract-invalid diagnostics can include unredacted plugin input/result previews | Resolved | High | Small/Medium | Contract regressions prove nested secret-like fields are summarized/redacted and raw preview fields are absent before downstream projection | `skills/nova/pipeline/services/contract-diagnostics.ts`, contract normalizers, module/gate/pipeline callers |
| OI-45 | Prompt artifacts and structural logger append failures are still debug-only | Resolved | Medium | Small/Medium | `system.io_warning` now covers prompt artifact and pipeline JSONL append failures with contract/behavior verification | `skills/nova/pipeline/services/status-store.ts`, `skills/nova/pipeline/core/logger.ts`, `skills/nova/pipeline/services/system-io-warning.ts`, `skills/nova/pipeline/services/telemetry-stream.ts` |
| OI-46 | Approval-gate waits still use persisted-state polling instead of event/blocking wait adapters | Resolved | Low | Medium | `approval.signal` contract/adapter checks plus `approvals,governance,resume-idempotence` behavior areas passed; runner polling config absence is asserted | `skills/nova/pipeline/runners/approval-gate-runner.ts`, `skills/nova/pipeline/services/approval-signal-event-adapter.ts`, pipeline event contract |
| OI-47 | Gateway-facing agent operations are still scattered under the common agent boundary | Resolved | Medium | Medium/Large | Typed common Gateway wrappers centralize session status/message/spawn/kill/list/completion/health, and `check-gateway-operation-boundary-surface.mjs` rejects raw `gatewayInvoke` under the common owner/facades | `skills/common/pipeline/integrations/gateway.ts`, common agent modules, Nova gateway call sites, Buster gateway health |


## Issues

## P00a-ISSUE-001 — Nova CLI strict parser errors bypass CLI error envelope

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline.ts`
- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/cli-args.ts`
- `skills/common/pipeline/cli-args.ts`
- `tests/verification/contracts/check-strict-cli-args-surface.mjs`
- `tests/verification/runtime/check-nova-startup-smoke.mjs`

### Affected files

- `skills/nova/pipeline/cli.ts` — added a targeted strict-parser catch so invalid argv gets the same terminal JSON/error handling as other CLI setup failures.
- `tests/verification/runtime/check-nova-startup-smoke.mjs` — added Nova invalid-flag and missing-value smoke assertions so entrypoint invalid-argv behavior stays covered.
- `tests/verification/contracts/check-strict-cli-args-surface.mjs` — verified unchanged; this remains parser-unit/source migration coverage while runtime entrypoint behavior is covered by the startup smoke test.

### Problem / in-depth issue description

`skills/nova/pipeline/cli.ts` calls `parseCliFlagValues(process.argv.slice(2), schema)` before entering its main `try` block. The shared parser throws for unknown flags, unexpected positionals, missing values, invalid inline booleans, and required/positional count failures. Because the parse call is under the CLI catch, those errors bypass the CLI's normal handled-failure path (`log('ERROR', e.message)`, JSON output `{ exit: EXIT_ERROR, error: e.message }`, temp cleanup where applicable, and `process.exit(EXIT_ERROR)`). A live check during this review (`node skills/nova/pipeline.ts --unknown-flag 1`) exited non-zero with a Node stack trace from `skills/common/pipeline/cli-args.ts:24` and no stdout JSON envelope.

Expected behavior should be explicit: either parser errors are intentionally raw Node failures, or they should be caught and reported like other CLI setup errors. The rest of this CLI already treats invalid `--thinking`, missing prompt files, and generic setup failures as operator-facing error messages/envelopes, so parser failures are inconsistent.

### Impact

Operators or automation invoking Nova with a typo or missing flag value receive an implementation stack trace instead of the documented/implemented structured CLI error envelope. This creates inconsistent telemetry/observability for one of the most common operator-error classes and makes invalid-argv behavior unverified for the Nova entrypoint.

### Next step

Resolved by wrapping the strict parser call in a targeted `try/catch` at the start of `main()`. Verification now asserts `node skills/nova/pipeline.ts --unknown-flag 1` and `node skills/nova/pipeline.ts --prompt-file` exit `EXIT_ERROR`, emit `{ exit: EXIT_ERROR, error }`, and do not print a Node stack trace. Focused run: `node tests/verification/runtime/check-nova-startup-smoke.mjs --source-root "$PWD"` passed.

### Links / files

- `skills/nova/pipeline/cli.ts`
- `skills/common/pipeline/cli-args.ts`
- `tests/verification/contracts/check-strict-cli-args-surface.mjs`
- `tests/verification/runtime/check-nova-startup-smoke.mjs`

## P01-ISSUE-001 — Runtime `--thinking adaptive` is accepted by policy but omitted from Nova CLI help

Status: resolved
Area: pipeline
Priority: low
Type: docs-gap

### Evidence

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/core/policy.ts`
- `docs/PIPELINE-CONFIG-REFERENCE.md`
- `docs/progress-json-reference.md`

### Affected files

- `skills/nova/pipeline/cli.ts` — help text now renders runtime `--thinking` values from `VALID_THINKING_LEVELS`, including `adaptive`.
- `tests/verification/runtime/check-nova-startup-smoke.mjs` — extended the help marker assertion so CLI help stays aligned with the policy enum.
- `skills/nova/pipeline/core/policy.ts` — verified unchanged as the authoritative accepted-value list.

### Problem / in-depth issue description

`skills/nova/pipeline/core/policy.ts` defines `VALID_THINKING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'adaptive']`, and a live import check during P01 confirmed `validateThinkingLevel('adaptive')` passes. However, `skills/nova/pipeline/cli.ts --help` documents `--thinking <level>` as `none|low|medium|high|xhigh`, omitting `adaptive`. Other docs checked during this batch (`docs/PIPELINE-CONFIG-REFERENCE.md` and `docs/progress-json-reference.md`) already mention `adaptive`, so the drift is localized to CLI operator help.

Expected behavior: CLI help should either be generated from `VALID_THINKING_LEVELS` or manually list the same values as policy validation. Current behavior can mislead operators into believing `adaptive` is not allowed even though the runtime accepts it.

### Impact

Low operational risk but real documentation drift on an operator-facing CLI flag. Operators may avoid a supported runtime option or assume a valid config/default value is unsupported when comparing it to `node /app/skills/pipeline.ts --help`.

### Next step

Resolved by interpolating `VALID_THINKING_LEVELS.join('|')` in the Nova CLI help text and asserting the same policy-derived string in `check-nova-startup-smoke.mjs`. Focused run: `node tests/verification/runtime/check-nova-startup-smoke.mjs --source-root "$PWD"` passed.

### Links / files

- `skills/nova/pipeline/cli.ts`
- `skills/nova/pipeline/core/policy.ts`
- `tests/verification/runtime/check-nova-startup-smoke.mjs`

## P02-ISSUE-001 — Registry validation throws `TypeError` for unknown plugin `manifest.kind`

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/core/registry.ts`
- `skills/nova/pipeline/core/registry/validation.ts`
- `tests/verification/behavior/areas/foundations.mjs`

### Affected files

- `skills/nova/pipeline/core/registry/validation.ts` — guarded kind-indexed capability maps when `manifest.kind` is invalid or missing.
- `skills/nova/pipeline/core/registry.ts` — verified unchanged; the validation guard preserves accumulated registry errors without changing registry assembly flow.
- `tests/verification/behavior/areas/foundations.mjs` — added a regression case for an unknown plugin kind that asserts `buildPluginRegistry` throws a formatted `Plugin registry validation failed...` error containing `REGISTRY_MANIFEST_INVALID`, not a `TypeError`.

### Problem / in-depth issue description

`validateManifest()` records an error when a plugin manifest declares an unknown `kind`, but `buildPluginRegistry()` still proceeds into `validateCapabilities()`. `validateCapabilities()` indexes capability policy maps with `manifest.kind` and immediately calls `.includes()` on `PLUGIN_FORBIDDEN_CAPABILITIES[manifest.kind]`. For an unknown kind, that map lookup returns `undefined`, producing a raw `TypeError` instead of the intended accumulated registry validation error.

Live reproduction during P02:

```text
TypeError
Cannot read properties of undefined (reading 'includes')
    at validateCapabilities (.../skills/nova/pipeline/core/registry/validation.ts:204:54)
```

Expected behavior: malformed plugin manifests should fail through the registry error accumulator and formatted `Plugin registry validation failed with ...` message. Current behavior can bypass the structured registry rejection codes for this malformed manifest class.

### Impact

Medium startup/operator impact for future local/external plugin discovery or tests injecting malformed plugin definitions. The registry still fails closed, but it fails with an implementation exception instead of actionable validation diagnostics and can hide other accumulated manifest errors.

### Next step

Resolved by defaulting `validateCapabilities()` kind-indexed capability policy arrays to empty arrays when `manifest.kind` is unknown, preserving the `validateManifest()` `REGISTRY_MANIFEST_INVALID` error and the formatted registry failure. `foundations.mjs` now injects `kind: 'bogus'` and verifies the thrown error is not a `TypeError` and includes `Plugin registry validation failed` plus `REGISTRY_MANIFEST_INVALID`.

### Links / files

- `skills/nova/pipeline/core/registry/validation.ts`
- `skills/nova/pipeline/core/registry.ts`
- `tests/verification/behavior/areas/foundations.mjs`

## P03-ISSUE-001 — Git runtime-state classifier rejects relative `.swarm/...` paths

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/integrations/git-worktree.ts`
- `tests/verification/behavior/areas/foundations.mjs`

### Affected files

- `skills/nova/pipeline/integrations/git-worktree.ts` — normalized Git paths inside `isRuntimeStatePath()` while preserving the `.swarm` segment, so relative `.swarm/...`, slash-prefixed `/.swarm/...`, and repo-prefixed `Projects/<project>/src/.swarm/...` inputs classify consistently.
- `tests/verification/behavior/areas/foundations.mjs` — added coverage proving `.swarm/modules/<id>/module status JSON artifact`, `.swarm/logs/...`, gate status, summary, and project-summary paths are treated as runtime-state paths with relative, slash-prefixed, and repo-prefixed forms where applicable.

### Problem / in-depth issue description

`git-worktree.ts` intentionally auto-resolves only runtime-state rebase/stash conflicts so source/config/test files are never silently discarded. Some callers normalize status paths with `normalizeRepoPathForRuntimeCheck()`, but `tryAutoResolveRebaseForRuntimeState()` uses conflict paths returned by `git diff --name-only --diff-filter=U` directly:

```js
const runtimeConflicts = conflicts.filter(isRuntimeStatePath);
```

Git `--name-only` paths are repo-relative, such as `.swarm/modules/01/module status JSON artifact`. Current `isRuntimeStatePath()` requires patterns containing `/.swarm/...`, so it returns `false` for relative runtime-state paths and `true` only for slash-prefixed paths.

Live reproduction during P03:

```text
.swarm/modules/01/module status JSON artifact => false
/.swarm/modules/01/module status JSON artifact => true
.swarm/logs/pipeline.jsonl => false
/.swarm/logs/pipeline.jsonl => true
```

Expected behavior: runtime-state classification should be consistent for Git-relative paths and normalized/slash-prefixed paths, especially because Git conflict listing returns relative paths.

### Impact

Medium operational impact. Runtime-state rebase conflicts that are supposed to be auto-resolvable can be treated as non-runtime conflicts, causing avoidable manual recovery or retry behavior. The fail-closed behavior protects source files, but it weakens the intended safe recovery path for `.swarm` runtime artifacts.

### Next step

Resolved by centralizing Git path normalization in `isRuntimeStatePath()` and preserving `.swarm` as the only runtime root segment used by the classifier. Regression coverage now verifies relative `.swarm/...`, slash-prefixed `/.swarm/...`, and repo-prefixed `Projects/<project>/src/.swarm/...` runtime artifacts classify as runtime state while non-runtime source/module paths remain excluded.

### Links / files

- `skills/nova/pipeline/integrations/git-worktree.ts`
- `tests/verification/behavior/areas/foundations.mjs`

## P07-ISSUE-001 — Module Buster crash-exhaustion verification fails on guarded `phase_started_at` status save

Status: resolved
Area: pipeline
Priority: high
Type: bug

### Evidence

- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `skills/nova/pipeline/runners/module-runner-prebuster.ts`
- `skills/nova/pipeline/runners/module-runner-shared.ts`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- `tests/verification/behavior/areas/module-failures.mjs`

### Affected files

- `skills/nova/pipeline/agents/module-workers.ts` — fixed the Buster worker finalization reloads to read the raw status snapshot before clearing active-agent metadata, preventing projected read-model fields from rolling guarded lifecycle fields backward during crash retries.
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts` — fixed `onFinalized` fallback reload to request the raw status snapshot before clearing active-agent metadata.
- `tests/verification/behavior/areas/module-failures.mjs` — retained/adjusted the regression `module-runner buster crash exhaustion keeps dispatch correlation on telemetry and stop payloads`; focused area validation now passes.

### Problem / in-depth issue description

During P07 validation, the corrected behavior verification command `node tests/verification/behavior/verify.mjs --area module-failures` failed in the regression named `module-runner buster crash exhaustion keeps dispatch correlation on telemetry and stop payloads`. The buffered log showed the first Buster crash retry, then a hard worker failure:

```text
Buster subagent crash (attempt 1/2): Buster timed out (30min) — retrying Buster
Module Buster worker execution failed: Illegal status save: guarded lifecycle fields changed without lifecycle transition (phase_started_at)
AssertionError [ERR_ASSERTION]: 1 == 20
```

The test expected a terminal blocked/crash-exhausted exit (`20`) with the final Buster dispatch/session correlation, but the runner returned `EXIT_ERROR` (`1`) after a guarded status save rejected a `phase_started_at` mutation. `module-runner/buster-phase/dispatch.ts` starts the Buster phase with `startModulePhase(status, 'buster', ...)` and immediately saves status before dispatching the worker. `module-runner-buster-worker.ts` then persists `active_agent` in `onDispatched` and clears it in `onFinalized`. The failing test's path exercises multiple Buster crash attempts, so the fix needs to ensure phase lifecycle fields are transitioned through lifecycle-state helpers exactly once or reloaded safely between attempts, while active-agent updates remain legal status mutations.

Expected behavior: repeated Buster crash attempts should exhaust the configured Buster crash retry budget and return the blocked/crash-exhausted result with final dispatch correlation. They should not trip guarded lifecycle-field validation while updating active agent metadata.

### Impact

High for Buster retry reliability. If the verified failure reproduces in production, a module whose Buster worker repeatedly crashes or times out can terminate as an infrastructure `EXIT_ERROR` instead of the intended blocked/crash-exhausted module result. That also risks losing the final dispatch/session correlation expected by telemetry and stop payloads.

### Next step

Resolved in V02a3 by reloading raw Buster status snapshots in `module-workers.js`/`module-runner-buster-worker.ts` before active-agent finalization saves. Verification run: `node tests/verification/behavior/verify.mjs --source-root . --area module-failures` passed with `passed: 24`, `failed: 0`.

### Links / files

- `skills/nova/pipeline/agents/module-workers.ts`
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
- `tests/verification/behavior/areas/module-failures.mjs`

## P13-ISSUE-001 — Generator result builder lacks an explicit validator/normalizer owner

Status: resolved
Area: pipeline
Priority: medium
Type: docs-gap

### Evidence

- `skills/nova/pipeline/services/contracts/generator-result.ts`
- `skills/nova/pipeline/services/contracts/README.md`
- `tests/verification/contracts/check-generator-result-surface.mjs`

### Affected files

- `skills/nova/pipeline/services/contracts/generator-result.ts` — now owns the v1 generator result builder plus `isGeneratorResult`, `coerceGeneratorResult`, `validateGeneratorArtifactRef`, `validateGeneratorResult`, and `normalizeGeneratorResult` with structured `generator.run` contract-invalid diagnostics.
- `tests/verification/contracts/check-generator-result-surface.mjs` — now verifies valid generator results, malformed artifacts/results, no fallback coercion, and structured normalizer failures.

### Problem / in-depth issue description

The implementation-map README requires exact schemas and says that if code has no explicit schema, the review must record the observed shape and add an issue requesting a validator/schema owner. In P13, `generator-result.js` builds a v1 generator result shape with `schemaVersion`, `producerKind`, `producerType`, `outputs`, optional `artifacts`, and optional `diagnostics`. It also builds artifact refs with `type`, `path`, and extra keys, returning `null` for missing paths.

Unlike `gate-control-result.js`, `validator-control-result.js`, `worker-control-result.js`, and `pipeline-step-result.js`, the generator result surface does not expose `validate*`, `normalize*`, `coerce*`, or assertion helpers. That leaves malformed generator results without a local contract authority or structured contract-invalid diagnostics at the generator boundary.

### Impact

Generator consumers and tests can rely on the builder for well-formed output, but callers have no shared enforcement point for externally supplied or hand-built generator results. This creates an authority gap in the otherwise typed contract layer and makes invalid generator payload handling dependent on each consumer.

### Next step

Resolved by adding the generator result validator/normalizer/coercer in `generator-result.js` and focused contract coverage in `check-generator-result-surface.mjs`. Focused run: `node tests/verification/contracts/check-generator-result-surface.mjs --source-root "$PWD"` passed with `{"ok":true,"checked":45}`.

### Links / files

- `docs/pipeline/implementation-map/batches/P13-nova-contract-result-surfaces.md`

## P16-ISSUE-001 — Telemetry event payload builders lack a centralized validator/schema owner

Status: resolved
Area: pipeline
Priority: medium
Type: schema-gap

### Evidence

- `skills/nova/pipeline/services/telemetry/builders.ts`
- `skills/nova/pipeline/services/telemetry/progress.ts`
- `skills/nova/pipeline/services/observability.ts`
- `skills/nova/pipeline/services/telemetry-sink-contract.ts`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/behavior/areas/telemetry-schema.mjs`
- `tests/verification/behavior/areas/polling.mjs`
- `docs/pipeline/implementation-map/batches/V03a-behavior-verification-agents-buster-deployment-polling-redaction.md`

### Affected files

- `skills/common/pipeline/services/telemetry/payload-schema.ts` — now owns the centralized core telemetry event-type payload schema registry and validation/assertion helpers, including the generic `plugin.event` extension surface.
- `skills/nova/pipeline/services/telemetry/payload-schema.ts` — repo-local re-export facade that re-exports the common schema owner.
- `skills/nova/pipeline/services/telemetry/dispatch.ts` — now validates event payloads before sink dispatch or disk projection; invalid payloads are rejected non-critically and recorded as degraded observability.
- `skills/nova/pipeline/services/observability.ts` — now validates known structured event payloads before writing pipeline JSONL artifacts.
- `skills/nova/pipeline/services/telemetry-sink-contract.ts` — remains the sink envelope validator; event-type payload validation is now owned separately by `payload-schema.js`.

### Problem / in-depth issue description

P16 source review found a clear validator for telemetry sink envelopes in `telemetry-sink-contract.js`, but not for the event-type-specific payloads emitted by `telemetry/builders.js`, `telemetry/progress.js`, and `observability.js`. The implementation-map rules require that if code has no explicit schema, the observed shape is recorded and an issue is carried for a validator/schema owner.

The current code constructs many payloads directly in builder functions (`pipeline.started`, `pipeline.completed`, `module.status_changed`, `gate.verdict`, `agent.transcript`, `observability.degraded`, budget/cost events, and others). Contract and behavior tests plus docs cover important examples, but consumers do not have one runtime validation point that enforces required/optional fields per event type before dispatch to disk, Redis stream, and sink plugins.

### Impact

Telemetry consumers can receive structurally inconsistent event payloads if future call sites add or omit fields without updating docs/tests. The sink contract will still accept these events because it only validates the envelope and that `event.payload` is an object, not the payload schema for each telemetry event type.

### Next step

Resolved by adding `telemetry/payload-schema.js`, wiring validation into `emitEvent` and `appendStructuredEvent`, and extending `check-telemetry-contract.mjs` to prove schema registry exhaustiveness. B05 later promoted schema ownership to common telemetry and added the generic `plugin.event` extension contract while preserving the focused contract coverage. Focused run: `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` passed.

### Links / files

- `docs/pipeline/implementation-map/batches/P16-nova-telemetry-event-sinks-and-observability.md`
- `docs/pipeline/implementation-map/batches/V03a-behavior-verification-agents-buster-deployment-polling-redaction.md`

## P17-ISSUE-001 — Redis completion stream entries lack an explicit validator/schema owner

Status: resolved
Area: pipeline
Priority: medium
Type: schema-gap

### Evidence

- `skills/nova/pipeline/services/redis-completion.ts`
- `skills/nova/pipeline/services/completion-adjudicator.ts`
- `skills/nova/pipeline/services/polling-redis-completion.ts`
- `tests/verification/contracts/check-redis-completion-service-surface.mjs`
- `tests/verification/behavior/areas/polling.mjs`
- `tests/verification/behavior/areas/telemetry.mjs`
- `docs/pipeline/implementation-map/batches/V03a-behavior-verification-agents-buster-deployment-polling-redaction.md`

### Affected files

- `skills/common/pipeline/services/redis-message-contract.ts` — now owns the normalized Redis pipeline envelope plus completion-entry schema used by Nova completion consumers.
- `skills/nova/pipeline/services/redis-message-contract.ts` — repo-local re-export facade to the common Redis message contract.
- `skills/nova/pipeline/services/redis-completion.ts` — validates decoded completion entries before they can be selected as Redis authority and returns explicit `COMPLETION_INVALID` diagnostics for malformed current-identity records.
- `skills/nova/pipeline/services/completion-adjudicator.ts` — now fails closed on invalid/conflict Redis completion diagnostics instead of allowing malformed Redis authority.
- `skills/nova/pipeline/services/polling-redis-completion.ts` — receives schema-validated completion evidence through the registered Redis adapter.

### Problem / in-depth issue description

Resolved by introducing `skills/common/pipeline/services/redis-message-contract.ts` as the normalized Redis pipeline message schema owner. The schema separates a generic Redis envelope (`schema_version`, `type`, `stream_role`, `run_id`, `project`, `target_kind`, `target_id`, `attempt`, `dispatch_id`, `session_key`, `source`, `timestamp`) from stream-role payload validation. Completion entries now validate terminal fields (`status`, `outcome`, `source`, optional diagnostics) on top of that envelope.

The completion reader validates decoded current-identity entries before selection/adjudication. Malformed records now produce explicit `COMPLETION_INVALID` fail-closed evidence rather than being treated as authoritative PASS/FAIL data or silently drifting through selection logic. Gate names remain payload data (`target_kind:'gate'`, `target_id`, `gate_type`) instead of schema-specific stream names, preserving future extensibility.

### Impact

Resolved for completion consumers: malformed current-identity completion records fail closed with explicit diagnostics. `P17-ISSUE-002` subsequently migrated Redis task/work streams to the same generic envelope so future gate work does not introduce bespoke stream schemas.

### Next step

Resolved by the common Redis message contract and focused contract coverage in `tests/verification/contracts/check-redis-completion-service-surface.mjs`. The first pass intentionally applied validation at the completion consumer boundary; task/work stream migration is now resolved by `P17-ISSUE-002`.

### Links / files

- `docs/pipeline/implementation-map/batches/P17-nova-polling-and-completion-watching.md`
- `docs/pipeline/implementation-map/batches/V03a-behavior-verification-agents-buster-deployment-polling-redaction.md`

## P17-ISSUE-002 — Redis task/work streams should migrate to the normalized pipeline message envelope

Status: resolved
Area: pipeline
Priority: medium
Type: schema-gap

### Evidence

- `skills/common/pipeline/services/redis-message-contract.ts`
- `skills/nova/pipeline/tools/redis.ts`
- `skills/buster/pipeline/tools/redis.ts`
- `skills/buster/pipeline/services/task-queue.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `tests/verification/contracts/check-redis-completion-service-surface.mjs`
- `tests/verification/behavior/areas/operator-surface.mjs`
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs`

### Affected files

- `skills/common/pipeline/services/redis-message-contract.ts` — now owns task/work stream helpers on the same normalized non-telemetry Redis envelope as completion entries: `REDIS_TASK_TYPES`, `buildRedisTaskStreamEntry()`, `inferRedisTaskTarget()`, `validateRedisTaskEntry()`, `assertRedisTaskEntry()`, and validity helpers.
- `skills/nova/pipeline/tools/redis.ts` — Nova Redis task dispatch now builds a canonical task envelope before XADD, with `schema_version:'v1'`, `stream_role:'task'`, `target_kind`, `target_id`, identity/correlation fields, and JSON payload.
- `skills/buster/pipeline/services/task-queue.ts` — Buster validates the Redis task envelope before task type/payload processing; invalid envelope records are dead-lettered before ACK with `invalid_task_entry_schema`.
- `skills/buster/pipeline/services/task-completion.ts` — Buster completion emission now builds canonical completion records with normalized envelope fields and validates them before XADD.
- `skills/buster/pipeline/tools/redis.ts` — send helper always builds and validates the canonical task envelope before XADD; the previous raw-field legacy send branch is removed.

### Problem / in-depth issue description

Resolved by extending the common Redis message contract from completion-only validation to the task/work stream side. Buster module and gate work items now share one generic envelope: `schema_version`, `stream_role`, `type`, `project`, `run_id`, `target_kind`, `target_id`, optional module/gate fields, `attempt`, `dispatch_id`, `session_key`, `source`, `sender`, `payload`, `iteration`, and `timestamp`.

Gate type/name remains data (`target_kind:'gate'`, `target_id`, `gate_id`, `gate_type`) rather than becoming a separate schema branch. `validateRedisTaskEntry()` also verifies task type, sender, numeric iteration, payload JSON, payload task-type agreement, and module-vs-gate target-kind consistency.

### Impact

Resolved for current Buster Redis task producers/consumers and completion writers. Future gate work can reuse the same Redis task envelope rather than inventing gate-name-specific streams or schemas. Invalid task envelopes now fail closed into dead-letter evidence before ACK.

### Next step

Resolved by common task-envelope helpers, producer/consumer validation, and focused coverage. The broader transport-interface extraction was later resolved by `OI-37` TaskQueue/EventBus abstraction work.

### Links / files

- `skills/common/pipeline/services/redis-message-contract.ts`
- `skills/nova/pipeline/tools/redis.ts`
- `skills/buster/pipeline/services/task-queue.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `tests/verification/contracts/check-redis-completion-service-surface.mjs`

## P18b-ISSUE-001 — Summary rate-limit builders drop gateway-label fallback/tracked correlation

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/services/rate-limit-builders.ts`
- `skills/nova/pipeline/services/rate-limit-exit.ts`
- `skills/nova/pipeline/services/rate-limit.ts`
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs`
- `tests/verification/behavior/areas/summaries.mjs`
- Live import check of `buildSummarySessionRateLimitStatus()` and `buildTrackedSummarySessionRateLimitStatus()` during P18b

### Affected files

- `skills/nova/pipeline/services/rate-limit-builders.ts` — updated `buildSummarySessionRateLimitStatus()`, `buildTrackedSummarySessionRateLimitStatus()`, and `createSummarySessionRateLimitDiscordNotifier()` to preserve status/tracked/fallback `gateway_label` correlation consistently with module and gate builders.
- `skills/nova/pipeline/services/rate-limit-exit.ts` — verified summary finalizers consume the corrected summary status builder so terminal `rate_limit_exhausted` results and telemetry inherit fallback gateway labels for sparse poll results.
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs` — added focused status/notifier regressions for direct fallback and tracked summary gateway-label correlation.
- `tests/verification/behavior/areas/summaries.mjs` — updated summary exhaustion behavior coverage to assert fallback gateway label preservation in terminal result, Discord fields, and telemetry.

### Problem / in-depth issue description

The module and gate rate-limit status builders preserve `gatewayLabelFallback` when `status` lacks a gateway label. The summary status/notifier path does not. In `buildSummarySessionRateLimitStatus()`, `gateway_label` is assigned as `resolveStatusGatewayLabel(status) ?? null`, ignoring the `gatewayLabelFallback` option that is accepted in the function signature. `buildTrackedSummarySessionRateLimitStatus()` computes tracked correlation but explicitly passes `gatewayLabelFallback: null`, so even `updateCorrelation()` results are not projected into the returned summary status when the raw status is sparse. `createSummarySessionRateLimitDiscordNotifier()` similarly builds Discord fields with `gateway_label: resolveStatusGatewayLabel(status) ?? null`, ignoring `correlation.gateway_label` and `gatewayLabelFallback`.

Live reproduction during P18b with direct imports showed the dropped fallback:

```text
buildSummarySessionRateLimitStatus({}, { gatewayLabelFallback: 'fallback-label' }).gateway_label === null
buildTrackedSummarySessionRateLimitStatus({}, { updateCorrelation: () => ({ gateway_label: 'tracked-label', dispatch_id: 'd1' }), gatewayLabelFallback: 'fallback-label' }).gateway_label === null
```

Expected behavior is consistent with module/gate builders: fallback or tracked gateway label should be preserved when source status does not provide one. The issue affects sparse ACP poll results where dispatch/session may survive but gateway label is only available from tracked state or caller fallback.

### Impact

Summary/post-run rate-limit exhaustion results, Discord notifications, and summary telemetry can lose `gateway_label` correlation. That makes operator notices and telemetry harder to join to the owning ACP session/gateway dispatch, especially for sparse poll results after earlier correlation was already captured.

### Next step

Resolved by projecting summary gateway label correlation with precedence `status.gateway_label` / resolver value, tracked `correlation.gateway_label`, then `gatewayLabelFallback`. Focused verification covers direct fallback, tracked status correlation, summary pause/resume Discord fields, terminal summary result, Discord exhaustion fields, and telemetry.

### Links / files

- `skills/nova/pipeline/services/rate-limit-builders.ts`
- `skills/nova/pipeline/services/rate-limit-exit.ts`
- `tests/verification/contracts/check-rate-limit-slice-surface.mjs`
- `tests/verification/behavior/areas/summaries.mjs`

## P19-ISSUE-001 — Architecture progress validation throws on non-string execution_order entries

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/services/arch-validator-checks.ts`
- `skills/nova/pipeline/services/arch-validator.ts`
- `tests/verification/behavior/areas/pipeline.mjs`
- `docs/pipeline/implementation-map/batches/V02b-behavior-verification-pipeline-recovery-resume-sequence-stops.md`
- Live import check of `runDeterministicArchitectureChecks()` during P19

### Affected files

- `skills/nova/pipeline/services/arch-validator-checks.ts` — `checkProgress()` now validates each `execution_order` entry is a non-empty string before prefix routing and emits `EXEC_ORDER_ENTRY_INVALID` blocking findings for malformed entries.
- `tests/verification/behavior/areas/pipeline.mjs` — added a focused regression proving malformed `progress.execution_order` entries return structured findings/control results and do not become `VALIDATOR_INTERNAL_ERROR`.

### Problem / in-depth issue description

`checkProgress()` correctly verifies that `progress.execution_order` is an array, but it does not validate the type of each entry before calling string methods. A malformed entry such as `1`, `null`, or an object causes a raw `TypeError` at `stepId.startsWith('gate:')` instead of a structured deterministic validation finding.

Live reproduction during P19:

```text
runDeterministicArchitectureChecks({ project: 'p', execution_order: [1], modules: {} }, { paths: { progress_file: 'progress.json' } })
→ TypeError: stepId.startsWith is not a function
```

When called through `runArchValidator()`, the outer catch converts this into a generic blocking `VALIDATOR_INTERNAL_ERROR`, which fails closed but misclassifies a user-authored `progress.json` schema problem as a validator/runtime failure. Expected behavior is a stable deterministic finding that points to `progress.json`, identifies the invalid `execution_order` entry, and tells the operator to use module ids, `gate:<id>`, or `validator:<id>` strings.

### Impact

Malformed progress input still blocks the pipeline, but the diagnostic loses the exact cause and remediation. Operators see an internal validator error rather than an actionable progress schema error, and regression coverage does not currently protect this input class.

### Next step

Resolved by per-entry validation in `checkProgress()` before prefix routing. Malformed entries now return blocking `EXEC_ORDER_ENTRY_INVALID` findings with the progress file path and entry index/value summary; regression coverage asserts deterministic checks and the architecture validator stage return the structured finding without `VALIDATOR_INTERNAL_ERROR`.

### Links / files

- `skills/nova/pipeline/services/arch-validator-checks.ts`
- `skills/nova/pipeline/services/arch-validator.ts`
- `tests/verification/behavior/areas/pipeline.mjs`

## P20-ISSUE-001 — Blueprint commit helper can commit unrelated pre-staged files

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/services/blueprint.ts`
- `tests/verification/contracts/check-blueprint-commit-scope.mjs`
- `tests/verification/lib/run-contract-suite.sh`
- `tests/verification/contracts/check-verification-wrapper-surface.mjs`
- `docs/open-issues.md` existing broad-staging findings for comparison

### Affected files

- `skills/nova/pipeline/services/blueprint.ts` — `commitSelectedPaths(config, message, addPaths)` now stages only requested paths, rejects any staged index entries under those selected paths, and commits with an explicit `-- <addPaths>` pathspec.
- `tests/verification/contracts/check-blueprint-commit-scope.mjs` — added focused git-backed clean-release and dirty-index regressions for blueprint commit scope.
- `tests/verification/lib/run-contract-suite.sh` — includes the focused blueprint commit-scope guard in the shared contract suite.
- `tests/verification/contracts/check-verification-wrapper-surface.mjs` — keeps wrapper/list coverage aware of the new contract guard.

### Problem / in-depth issue description

`commitSelectedPaths()` is intended to commit only blueprint/control-file paths passed in `addPaths`. The helper does use a targeted `git add`, but it does not isolate or inspect the pre-existing index. Because the commit command is not path-limited, the final commit includes all currently staged paths, not just the targeted blueprint files. This affects `releaseBlueprint()`, `releaseGateFiles()`, and `syncControlFiles()` because all three call `commitSelectedPaths()` after checking out architecture-branch files.

The exact sequence in `blueprint.ts` is:

```text
git add ...addPaths
git diff --cached --name-only
git commit -m <message>
```

There is no guard that the index was clean before staging, no comparison that every staged path is inside `addPaths`, and no `git commit -- <addPaths>` pathspec. Existing P03 broad-staging issues cover other broad-add helpers, but this is a separate targeted-add/untargeted-commit path in the blueprint service.

### Impact

If an operator, previous pipeline step, or recovery flow leaves unrelated staged changes in the index, a blueprint release/sync can accidentally commit and push those unrelated staged files under a blueprint commit message. That can mix user work with architecture sync commits and make rollback/audit harder.

### Next step

Resolved by validating that every staged path is inside the selected blueprint/control-file pathspecs and by running `git commit -m <message> -- <addPaths>`. Focused verification: `node tests/verification/contracts/check-blueprint-commit-scope.mjs --source-root "$PWD"` passed, including a clean release case and a pre-staged unrelated-file rejection case.

### Links / files

- `skills/nova/pipeline/services/blueprint.ts`
- `tests/verification/contracts/check-blueprint-commit-scope.mjs`

## P21-ISSUE-001 — Lint-report temp output files are never removed

Status: resolved
Area: pipeline
Priority: low
Type: bug

### Evidence

- `skills/nova/pipeline/services/lint.ts`
- `tests/verification/contracts/check-validator-control-result-surface.mjs`
- `tests/verification/behavior/areas/gates.mjs`

### Affected files

- `skills/nova/pipeline/services/lint.ts` — `generateLintReport()` now removes its unique `/tmp/swarm-pipeline-lint-*` scratch output in a `finally` block after subprocess/parsing success or failure.
- `skills/nova/pipeline/services/module-validators.ts` — full-lint validator reports are retained as canonical `.swarm/logs/.../lint/full-lint-*.json` artifacts instead of relying on the transient subprocess output.
- `skills/nova/pipeline/services/contracts/validator-control-result.ts` — typed validator diagnostics now include an optional `report_artifact` path when a retained lint report exists.
- `tests/verification/contracts/check-validator-control-result-surface.mjs` — added regression coverage proving pre-check and full-lint remove `/tmp` scratch output and full-lint retains a canonical gate lint report.

### Problem / in-depth issue description

`generateLintReport()` uses a random path like `/tmp/swarm-pipeline-lint-pre-check-<module>-<ts>-<rand>.json` for the lint-report subprocess output. The wrapper reads and parses this file but never calls `fs.rmSync()`/`unlinkSync()` in a `finally` block. Because pre-check/full lint can run repeatedly across modules, retries, and gates, stale JSON output files accumulate in `/tmp`.

This is separate from the intentional lint artifacts written under the run log directory for operator inspection, including module pre-check reports (`precheck-attempt-<n>.json`) and retained full-lint validator reports (`full-lint-*.json`). The `/tmp/swarm-pipeline-lint-*` file is an implementation scratch file and is not referenced by summaries or telemetry.

### Impact

Long-running workers, soak tests, or repeated pipeline runs can leave unbounded scratch JSON files in `/tmp`. The files can contain static-analysis findings and path metadata longer than needed, increasing disk usage and retaining diagnostic data under the canonical artifact tree.

### Next step

Resolved by wrapping lint-report subprocess/parsing in `try/finally`, deleting the generated `/tmp/swarm-pipeline-lint-*` output with `fs.rmSync(..., { force: true })`, and adding canonical full-lint report retention under `.swarm/logs/.../lint/full-lint-*.json`. Focused verification: `node tests/verification/contracts/check-validator-control-result-surface.mjs --source-root "$PWD"` passed.

### Links / files

- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-validators.ts`
- `skills/nova/pipeline/services/contracts/validator-control-result.ts`
- `tests/verification/contracts/check-validator-control-result-surface.mjs`

## P22-ISSUE-001 — Forge and fix prompts instruct agents to run broad `git add -A`

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/prompts/forge.ts`
- `skills/nova/pipeline/prompts/gate-fix.ts`
- `skills/nova/pipeline/prompts/review.ts`
- `skills/nova/pipeline/prompts/shared.ts`
- `skills/nova/pipeline/services/forge-completion.ts`
- `skills/nova/pipeline/services/polling.ts`
- `skills/nova/pipeline/services/polling-session-end.ts`
- `skills/nova/pipeline/agents/module-workers.ts`
- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `tests/verification/behavior/areas/lifecycle-state-surface.mjs`

### Affected files

- `skills/nova/pipeline/prompts/forge.ts` — removed agent git staging/commit/push instructions; final protocol now only writes the Forge completion artifact and stops.
- `skills/nova/pipeline/prompts/gate-fix.ts` — removed agent git staging/commit/push instructions; fix agent stops after local changes.
- `skills/nova/pipeline/prompts/review.ts` — removed agent git staging/commit/push instructions; review-fix agent stops after local changes.
- `skills/nova/pipeline/prompts/shared.ts` — Forge completion artifact command now writes an explicit `READY_FOR_TESTING` or `BLOCKED` status.
- `skills/nova/pipeline/services/forge-completion.ts` — added the Forge completion artifact path/validator/reader owner.
- `skills/nova/pipeline/services/polling.ts` — added artifact-only Forge completion polling; `module status JSON artifact` is no longer a Forge completion signal.
- `skills/nova/pipeline/agents/module-workers.ts` — Forge worker now polls the typed completion artifact by default.
- `skills/nova/pipeline/runners/module-runner-forge.ts` — module runner applies validated Forge completion statuses to lifecycle state and handles `BLOCKED` artifacts.
- `skills/nova/pipeline/services/polling-session-end.ts` — gate/review fix session polling no longer stages or commits; it reports local changes so the caller-owned git sync can commit/push.
- `tests/verification/behavior/areas/lifecycle-state-surface.mjs` — prompt/artifact regression coverage added.
- `tests/verification/behavior/areas/foundations.mjs` — updated private-surface assertion for the new Forge completion polling helpers.

### Problem / in-depth issue description

The prompt builders instructed Forge and fix agents to stage, commit, and push with broad git commands. That made agent prompts an operational source of repository-wide staging and confused ownership: agents were asked to both produce lifecycle artifacts and perform git synchronization.

Resolved behavior: Forge module agents write the typed `forge-completion.json` artifact with `status: READY_FOR_TESTING` or `status: BLOCKED`, then stop. Gate/review fix agents stop after making local changes. Nova pipeline owns lifecycle transitions and git synchronization. Forge completion polling reads the completion artifact only; `module status JSON artifact` is not treated as a Forge completion signal.

### Impact

Agents no longer receive broad git staging or push instructions, reducing the chance of prompt-driven unrelated commits. Forge completion has a single typed artifact contract, and pipeline code owns lifecycle mutation and git synchronization.

### Next step

Resolved by removing agent git commands from Forge/gate-fix/review prompts, adding a Forge completion artifact validator/poller, routing module Forge workers through artifact polling, and asserting prompt/artifact behavior in `lifecycle-state-surface`. Focused runs passed: `lifecycle-state-surface`, `foundations`, `polling`, `module-failures`, `migrated-seams`, `many-module-soak`, `repo-docs`, and `check-worker-control-result-surface.mjs`.

### Links / files

- `skills/nova/pipeline/prompts/forge.ts`
- `skills/nova/pipeline/prompts/gate-fix.ts`
- `skills/nova/pipeline/prompts/review.ts`
- `skills/nova/pipeline/services/forge-completion.ts`
- `skills/nova/pipeline/services/polling.ts`
- `tests/verification/behavior/areas/lifecycle-state-surface.mjs`

## P23a-ISSUE-001 — Project-summary explicit repo root remains a Git-root contract

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/common/pipeline/git-primitives.ts`
- `skills/nova/pipeline/core/git-context.ts`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/tools/project-summary.ts`
- `tests/verification/behavior/areas/summaries.mjs`

### Affected files

- `skills/nova/pipeline/tools/project-summary.ts` — kept `resolveRepoDir()` strict: explicit `--repo`/`opts.repoDir` and `REPO_ROOT` must name a Git repository root. Updated the `collectCodeStats()` fallback comment so it only promises filesystem walking when `git ls-files` returns no tracked project files inside a valid Git root, not no-git support.
- `tests/verification/behavior/areas/summaries.mjs` — added focused behavior coverage proving explicit non-git repo roots are rejected with the existing `.git` error envelope.

### Problem / in-depth issue description

The original finding observed an apparent mismatch: `generateSummary({ project, repoDir, configPath })` calls `validateAllowedPath(resolveRepoDir(opts.repoDir), ...)`, and `resolveRepoDir()` rejects a root without `<repo>/.git`; meanwhile `collectCodeStats()` had a fallback comment that claimed filesystem walking covered the no-git case.

After checking the shared Git helpers, the intended contract is that project-summary receives a Git repo root. `skills/common/pipeline/git-primitives.ts#getRepoRoot()` resolves real Git repositories with `git rev-parse --show-toplevel`, `skills/nova/pipeline/core/git-context.ts` re-exports that helper, and `skills/nova/pipeline/core/config.ts` uses the same strict `.git` requirement for explicit pipeline repo roots. Project-summary should not introduce a broader repo-root meaning locally.

Expected behavior is now explicit: non-git explicit roots fail before summary collection. The `collectCodeStats()` fallback is only for valid Git repos where `git ls-files -- <project>` returns no project files, not for copied filesystem-only project trees.

### Impact

This resolves the stale contract ambiguity without broadening repo-root authority. Operators get the existing fail-fast error for non-git roots, while maintainers have focused coverage and comments that match the strict Git-root behavior.

### Next step

Resolved by preserving the strict Git repo-root contract, narrowing the misleading fallback comment, and adding a summaries behavior regression for explicit non-git roots. Focused verification: `node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas summaries` passed.

### Links / files

- `skills/common/pipeline/git-primitives.ts`
- `skills/nova/pipeline/core/git-context.ts`
- `skills/nova/pipeline/core/config.ts`
- `skills/nova/pipeline/tools/project-summary.ts`
- `tests/verification/behavior/areas/summaries.mjs`

## P23a-ISSUE-002 — Case-study base uses stale field names for unit-test and hardest-module metrics

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/tools/project-summary.ts`
- `skills/nova/pipeline/tools/project-summary-formatters.ts`
- `tests/verification/behavior/areas/summaries.mjs`

### Affected files

- `skills/nova/pipeline/tools/project-summary-formatters.ts` — updated `buildCaseStudyBase()`, markdown complexity highlights, and Discord hardest-module output to prefer nested `unitCensus.python.functions`, `unitCensus.frontend.functions`, and `failCount`, with older flattened input names treated as diagnostic fallback only.
- `tests/verification/behavior/areas/summaries.mjs` — added coverage that case-study base, markdown, and Discord embeds preserve Python/frontend unit-test counts and hardest-module fail counts from collector-shaped input.

### Problem / in-depth issue description

`collectUnitTestCensus()` returns this shape:

```js
{
  python: { files, functions, lines },
  frontend: { files, functions, lines },
  totalFunctions,
  totalFiles
}
```

`collectPipelineStats()` returns hardest modules from `moduleStats`, where each entry uses `failCount`. Before resolution, `buildCaseStudyBase()` and the markdown complexity table read stale flattened keys:

```js
unitCensus.pythonFunctions
unitCensus.frontendBlocks
m.fails
```

As a result, `caseStudyBase.tests.unit_test_functions_total`, `python_unit_tests`, `frontend_unit_tests`, and `highlights.hardest_modules[].fails` could be zero even when the raw summary data contained tests and failing modules. The formatter now normalizes current collector fields first and treats older flattened/fails aliases as diagnostic fallback only.

### Impact

The generated case-study base under-reports test surface and module complexity. The markdown/Discord project summary can show correct metrics while the downstream case-study generator receives incomplete JSON evidence, causing inconsistent operator/publishing artifacts.

### Next step

Resolved by adding formatter normalization for nested unit census fields and hardest-module `failCount` values while keeping older flattened/fails inputs diagnostic-only. Focused run: `node tests/verification/behavior/verify.mjs --area summaries` passed with 26 checks.

### Links / files

- `skills/nova/pipeline/tools/project-summary-formatters.ts`
- `skills/nova/pipeline/tools/project-summary.ts`
- `tests/verification/behavior/areas/summaries.mjs`

## P23b-ISSUE-001 — lint-report CLI exits 0 when tools fail but emit no findings

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/services/lint.ts`

### Affected files

- `skills/nova/pipeline/tools/lint-report.ts` — added `lintReportExitCode()` and changed `main()` to exit nonzero when either `summary.total_errors` or `summary.tools_failed` is nonzero.
- `skills/nova/pipeline/tools/lint-report/report.ts` — verified unchanged as the report owner that maps thrown tool implementations to `{status:'error', error, duration_ms}` and increments `summary.tools_failed`.
- `tests/verification/contracts/check-strict-cli-args-surface.mjs` — added regression coverage for a controlled throwing tool with `total_errors === 0`, `tools_failed === 1`, and exit mapping `1`.

### Problem / in-depth issue description

The lint-report report schema distinguishes three terminal tool states: `ok`, `skipped`, and `error`. A tool implementation exception is caught in `runTool()` and recorded as `status:'error'`. `runAllTools()` increments `summary.tools_failed` for those results. Before resolution, the direct CLI exit decision in `lint-report.ts` only checked:

```js
process.exit(report.summary.total_errors > 0 ? 1 : 0);
```

A tool could therefore fail internally and produce a report with `tools_failed > 0`, `total_errors === 0`, and process exit code 0. The JSON report carried the failure, but shell callers and direct operators relying on exit status saw success. The CLI now treats tool failures as non-clean reports for exit-code purposes while preserving the JSON report shape.

The pipeline wrapper in `services/lint.js` can inspect report details separately, and the standalone lint-report CLI contract now exposes the same failure through its process exit status.

### Impact

Before resolution, direct lint-report invocations and CI/shell callers could pass despite failed static-analysis tools. That reduced the reliability of lint-report as an operator-facing deterministic check and could mask broken tool integrations.

### Next step

Resolved by routing `main()` through `lintReportExitCode(report)`, which fails when `report.summary.total_errors > 0 || report.summary.tools_failed > 0`. Focused run: `node tests/verification/contracts/check-strict-cli-args-surface.mjs --source-root "$PWD"` passed.

### Links / files

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/report.ts`

## B00a-ISSUE-001 — Buster conventions still instruct subagents to update `module status JSON artifact` directly

Status: resolved
Area: pipeline
Priority: medium
Type: bug

### Evidence

- `skills/buster/CONVENTIONS.md`
- `skills/buster/README.md`
- `skills/buster/buster-pipeline.ts`
- `skills/nova/pipeline/prompts/shared.ts`
- `skills/buster/pipeline/services/pipeline-helpers.ts`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `docs/pipeline/implementation-map/authority-map.md`
- `docs/pipeline/implementation-map/data-schemas.md`
- `docs/pipeline/implementation-map/path-construction.md`
- `docs/pipeline/implementation-map/prompts-and-agent-behavior.md`

### Affected files

- `skills/buster/CONVENTIONS.md` — replaced stale direct `module status JSON artifact` workflow guidance with the artifact-only module/gate completion contract.
- `skills/buster/README.md` — later updated by B02a to the current single `output_file` and Buster-owned verify/push completion contract.
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs` — added docs drift assertions preventing direct `module status JSON artifact` update instructions from returning to Buster conventions.
- `docs/pipeline/implementation-map/authority-map.md` — updated Buster completion authority to remove the old CONVENTIONS drift note.
- `docs/pipeline/implementation-map/data-schemas.md` — clarified child-agent completion schema excludes direct `status JSON artifact path` / `module status JSON artifact` edits.
- `docs/pipeline/implementation-map/path-construction.md` — aligned legacy `status JSON artifact path` notes with README and CONVENTIONS.
- `docs/pipeline/implementation-map/prompts-and-agent-behavior.md` — updated Buster subagent behavior to artifact-only completion.

### Problem / in-depth issue description

The Buster runtime and README have moved to artifact-based completion authority. At the time of B00a, module-test subagents wrote a prompt-provided result artifact and gate-test subagents wrote `output_file`; B02a later normalized both task types to required `output_file`. In all cases, subagents must not edit `status JSON artifact path`; Buster Pipeline reads the artifact, performs verify/push and cleanup, and emits canonical completion. However, `CONVENTIONS.md` still contained stale workflow text telling the subagent to update `module status JSON artifact` using a prompt-provided lifecycle update command.

This created a documentation conflict in the Buster subagent operating contract. Agents or operators following `CONVENTIONS.md` could treat `module status JSON artifact` as a direct child-agent completion target even though current authority belongs to result artifacts and Buster Pipeline completion.

### Impact

Stale convention text could cause future prompt edits or manual subagent runs to reintroduce direct lifecycle mutations, bypassing the guarded Nova status-store path and the Buster-owned completion signal. It also weakened audits that rely on README/runtime authority being consistent with agent-facing docs.

### Next step

Resolved by updating `CONVENTIONS.md` workflow step 5 to require only the prompt-provided artifact, to forbid `status JSON artifact path` / `module status JSON artifact` edits, and to stop after artifact/result-file write. B02a later normalized the artifact field to `output_file` for both module and gate tasks. Focused verification added conventions drift assertions to `check-buster-pipeline-slice-surface.mjs` and passed.

### Links / files

- `skills/buster/CONVENTIONS.md`
- `skills/buster/README.md`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `docs/pipeline/implementation-map/authority-map.md`
- `docs/pipeline/implementation-map/data-schemas.md`
- `docs/pipeline/implementation-map/path-construction.md`
- `docs/pipeline/implementation-map/prompts-and-agent-behavior.md`

## B02a-ISSUE-001 — Buster gitPushWithRetry optional commit path stages the entire worktree

Status: resolved
Area: buster
Priority: medium
Type: risk

### Evidence

- `skills/buster/pipeline/services/git-workflows.ts`
- `skills/buster/pipeline/tools/verify-task.ts`
- `skills/buster/pipeline/services/pipeline-helpers.ts`
- `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `skills/buster/pipeline/services/task-validation.ts`
- `skills/nova/pipeline/agents/orchestration.ts`
- `skills/nova/pipeline/prompts/shared.ts`
- `skills/buster/README.md`
- `skills/buster/CONVENTIONS.md`
- `tests/verification/contracts/check-buster-verify-task-scope.mjs`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs`

### Affected files

- `skills/buster/pipeline/services/git-workflows.ts` — changed commit mode to require explicit `opts.addPaths` and stage only `git add -- <paths>`.
- `skills/buster/pipeline/tools/verify-task.ts` — routes scoped Buster pushes through `gitPushWithRetry` with `addPaths: [swarmRoot]`.
- `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts` — makes Buster completion wait for `output_file` readiness and verify-task push before Redis completion emission.
- `skills/buster/pipeline/services/task-completion.ts` — dead-letters completion precondition failures such as verify/push failure instead of falling through to normal completion.
- `skills/buster/pipeline/services/pipeline-helpers.ts` — removed completion fallback to `result_artifact_path`, `result_file`, or `status JSON artifact path`; added required `output_file` read/write helpers.
- `skills/buster/pipeline/services/task-validation.ts` — requires `output_file` in Buster task payloads.
- `skills/nova/pipeline/agents/orchestration.ts` — sends module Buster artifact path as `output_file`, matching gate Buster payloads.
- `skills/nova/pipeline/prompts/shared.ts` — tells module and gate Buster agents to write `output_file`, not direct status or Redis completion.
- `skills/buster/README.md` — documents required `output_file` and push-before-completion workflow.
- `skills/buster/CONVENTIONS.md` — aligns child-agent conventions with single `output_file` contract and Buster-owned verify/push.
- `tests/verification/contracts/check-buster-verify-task-scope.mjs` — added scoped commit regression proving missing `addPaths` rejects and supplied pathspecs do not stage unrelated files.
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs` — added/updated Buster artifact and push-before-completion drift assertions.
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs` — updated Buster task identity fixture to include required `output_file` and assert missing output file is malformed.
- `docs/pipeline/implementation-map/` — updated living authority/schema/path/call/logic/error/concurrency/dependency/input/boundary/prompt maps for the new Buster completion contract.

### Problem / in-depth issue description

`gitPushWithRetry(repoRoot, branch, opts)` included an optional commit mode that ran `git add -A` before committing. Any Buster caller using `opts.commitMessage` could stage unrelated source, runtime, or user changes.

During decision review this was expanded into the current Buster completion contract problem: Buster emitted Redis completion after reading local artifacts, but before any Buster-owned scoped push. That allowed Nova to consume completion before the Buster artifact was guaranteed to be on Git. Buster also had too many artifact names/fallbacks (`result_artifact_path`, `result_file`, `output_file`, and `status JSON artifact path` fallback), which weakened the intended separation where status JSON is only an operator/projection artifact.

Expected behavior: Buster uses one completion artifact field, `output_file`, for module and gate tasks; child agents write only that file; Buster reads/writes that file, runs verify-task scoped push, and only after successful push emits the Redis completion. If push fails, normal completion is not emitted and the task is dead-lettered/held by the terminal guarantee path.

### Impact

The original broad staging helper could commit unrelated worktree changes. The workflow gap could let Redis completion outrun Git visibility of Buster artifacts. The fallback paths could reintroduce direct status JSON completion semantics that conflict with the pipeline's operator-artifact/status-store direction.

### Next step

Resolved by requiring `opts.addPaths` for `gitPushWithRetry` commit mode, routing verify-task through that scoped mode, requiring Buster task `output_file`, removing legacy result/status fallbacks, and gating Redis completion on verify-task push success. Focused verification passed for the scoped Git helper, Buster pipeline slice, and Buster runtime-normalization task identity.

### Links / files

- `skills/buster/pipeline/services/git-workflows.ts`
- `skills/buster/pipeline/tools/verify-task.ts`
- `skills/buster/pipeline/services/pipeline-helpers.ts`
- `skills/buster/pipeline/services/task-lifecycle/completion-signal.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `skills/buster/pipeline/services/task-validation.ts`
- `skills/nova/pipeline/agents/orchestration.ts`
- `skills/nova/pipeline/prompts/shared.ts`
- `tests/verification/contracts/check-buster-verify-task-scope.mjs`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`

## B03-ISSUE-001 — Buster k8s suite accepts namespace prefixes that cleanup later refuses to delete

Status: resolved
Area: buster
Priority: medium
Type: bug

### Evidence

- `skills/buster/pipeline/suites/k8s.ts`
- `skills/buster/pipeline/services/sandbox-cleanup.ts`
- `tests/verification/behavior/areas/shell-boundary.mjs`

### Affected files

- `skills/buster/pipeline/suites/k8s.ts` — now validates `namespace_prefix` as exactly `buster` or `test` before constructing/tracking a namespace or calling external build/deploy tools.
- `skills/buster/pipeline/services/sandbox-cleanup.ts` — verified unchanged; cleanup remains the delete authority for tracked namespaces matching the safe prefix regex `/^(buster|test)-/`.
- `tests/verification/behavior/areas/shell-boundary.mjs` — added a regression proving `namespace_prefix: "prod"` returns a critical K8s FAIL with `namespace-prefix` evidence before cleanup tracking or build/deploy steps.

### Problem / in-depth issue description

The K8s suite comments say `namespace_prefix` must be `buster` or `test`, but the implementation does not enforce that before creating a namespace. The suite accepts arbitrary `payload.test_config.k8s.namespace_prefix` or `payload.config.k8s.namespace_prefix`, builds a namespace name from it, tracks that namespace, and then proceeds to `kubectl create namespace`.

Cleanup authority is stricter: `sandbox-cleanup.js` only deletes tracked namespaces whose names start with `buster-` or `test-`. If a task config sets `namespace_prefix: "prod"`, the K8s suite can create `prod-<project>-<runId>`, but the cleanup path later refuses to delete it as an unsafe namespace. That leaves a cluster resource orphan and makes the suite behavior inconsistent with its own documented constraint.

### Impact

A misconfigured task can create an ephemeral namespace that Buster's cleanup service intentionally preserves. This can leak cluster resources, leave services/images/secrets behind, and require manual operator cleanup.

### Next step

Resolved by adding `validateK8sNamespacePrefix()` in `k8s.js`, returning a critical K8s FAIL for prefixes under `buster`/`test` before cleanup tracking, Podman, or `kubectl` calls. Focused run passed: `node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas shell-boundary`.

### Links / files

- `skills/buster/pipeline/suites/k8s.ts`
- `skills/buster/pipeline/services/sandbox-cleanup.ts`
- `tests/verification/behavior/areas/shell-boundary.mjs`

## B04-ISSUE-001 — Buster visual-reg telemetry reports Discord sent even when delivery is skipped or fails

Status: resolved
Area: buster
Priority: medium
Type: bug

### Evidence

- `skills/buster/pipeline/suites/visual-reg.ts`
- `skills/buster/pipeline/suites/visual-reg-discord.ts`
- `tests/verification/behavior/areas/operator-surface.mjs`

### Affected files

- `skills/buster/pipeline/suites/visual-reg.ts` — now aggregates Discord helper results and emits truthful `discord_sent`, `discord_status`, and delivery count fields in `buster.visual_reg` telemetry.
- `skills/buster/pipeline/suites/visual-reg-discord.ts` — now returns explicit delivery results for skipped webhook, successful send, and non-critical failure.
- `tests/verification/behavior/areas/operator-surface.mjs` — now verifies skipped, sent, failed, and aggregate telemetry projection cases.

### Problem / in-depth issue description

`visual-reg.js` emits a `buster.visual_reg` telemetry event after successful multi-path and single-path comparisons. In both event payloads the field `discord_sent` is hard-coded to `true`. The actual Discord helpers have three materially different outcomes: they return immediately when no `webhookUrl` is supplied, they send successfully, or they catch/log a delivery/read/body failure as non-critical. Because `discordSummary()` and `discordSingle()` do not return a delivery result, `visual-reg.js` cannot project the real delivery state and records success even when Discord was disabled or rejected the request.

This is observable from the scoped files: `WEBHOOK_URL` can be empty, the helpers no-op on missing webhook, and `operator-surface.mjs` proves HTTP failures are intentionally non-critical and logged. Expected telemetry should distinguish at least `sent`, `skipped_no_webhook`, and `failed_noncritical`, or omit the field when unknown.

### Impact

Operators and downstream telemetry consumers can see `discord_sent: true` while no visual-reg Discord image or summary was actually delivered. That weakens incident/debug evidence for visual regressions and can send maintainers looking for Discord artifacts that do not exist.

### Next step

Resolved by returning `{status:'skipped_no_webhook'|'sent'|'failed_noncritical', sent:boolean, error?}` from visual-reg Discord helpers, aggregating those results into `buster.visual_reg` telemetry, and covering skipped/sent/failed projection in `operator-surface`. Focused run: `node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas operator-surface` passed.

### Links / files

- `skills/buster/pipeline/suites/visual-reg.ts`
- `skills/buster/pipeline/suites/visual-reg-discord.ts`
- `tests/verification/behavior/areas/operator-surface.mjs`

## B04-ISSUE-002 — Buster visual-audit can leak temp media directories when Discord upload throws

Status: resolved
Area: buster
Priority: low
Type: bug

### Evidence

- `skills/buster/pipeline/tools/visual-audit.ts`
- `tests/verification/behavior/areas/operator-surface.mjs`
- `tests/verification/contracts/check-strict-cli-args-surface.mjs`
- `docs/pipeline/implementation-map/authority-map.md`
- `docs/pipeline/implementation-map/path-construction.md`
- `docs/pipeline/implementation-map/resiliency-and-error-handling.md`
- `docs/pipeline/implementation-map/dependency-matrix.md`
- `docs/pipeline/implementation-map/external-boundaries.md`

### Affected files

- `skills/buster/pipeline/tools/visual-audit.ts` — now scopes the `/tmp/audit-<Date.now()>` media directory to a `try/finally`, so success, HTTP errors, thrown upload errors, validation failures, and Chromium launch/capture failures remove temporary media before preserving the existing thrown error/CLI JSON behavior.
- `tests/verification/behavior/areas/operator-surface.mjs` — added a mocked visual-audit regression where Discord upload throws after screenshot generation and asserts no `audit-*` directory remains.
- `docs/pipeline/implementation-map/authority-map.md` — updated visual-audit temp artifact lifecycle authority to resolved behavior.
- `docs/pipeline/implementation-map/path-construction.md` — updated `/tmp/audit-*` path lifecycle to the current `finally` cleanup contract.
- `docs/pipeline/implementation-map/resiliency-and-error-handling.md` — updated visual-audit error/telemetry rows to remove the stale cleanup gap.
- `docs/pipeline/implementation-map/dependency-matrix.md` — clarified that thrown direct REST upload errors propagate after temp cleanup.
- `docs/pipeline/implementation-map/external-boundaries.md` — clarified visual-audit direct upload failures throw after cleanup.

### Problem / in-depth issue description

`visualAudit()` creates a temporary directory under `/tmp` before launching Chromium and generating media. Several terminal paths cleaned the directory explicitly: missing artifact, file larger than 25 MB, and Discord HTTP non-OK after a response is received. However, the Discord upload call previously looked like:

```js
const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, { ... });

// Cleanup
fs.rmSync(outputDir, { recursive: true, force: true });

if (!res.ok) throw new Error(...);
```

If `fetch` threw before returning a response, the cleanup statement was never reached. The same function also launched Chromium before entering the main capture `try`; if launch failed after the temp directory was created, cleanup was likewise not guaranteed. Expected behavior for a temp-media tool is a single `finally` that removes `outputDir` after all capture/upload paths, while preserving the current JSON error behavior at the CLI wrapper.

### Impact

Failed Discord uploads or browser startup failures could leave screenshot/video artifacts under `/tmp/audit-*`. The risk was low for one-off operator use, but repeated failures could accumulate disk usage and leave diagnostic screenshots longer than intended.

### Next step

Resolved by wrapping the visual-audit temp media lifecycle in `try/finally`, keeping browser cleanup local to the Playwright section, and adding a mocked `operator-surface` regression for a thrown upload after screenshot generation. Focused run: `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area operator-surface` passed.

### Links / files

- `skills/buster/pipeline/tools/visual-audit.ts`
- `tests/verification/behavior/areas/operator-surface.mjs`

## B05-ISSUE-001 — Buster telemetry accepts arbitrary event-type payloads without a centralized schema validator

Status: resolved
Area: buster
Priority: medium
Type: schema-validation

### Evidence

- `skills/buster/pipeline/services/telemetry.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/buster/pipeline/services/rate-limit.ts`
- `skills/buster/pipeline/suites/visual-reg.ts`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`
- `docs/telemetry-event-schema.md`

### Affected files

- `skills/common/pipeline/services/telemetry/payload-schema.ts` — now owns the shared telemetry payload schema registry for core events plus the generic `plugin.event` extension event.
- `skills/nova/pipeline/services/telemetry/payload-schema.ts` — changed to a repo-local re-export facade that re-exports the common schema owner.
- `skills/buster/pipeline/services/telemetry/payload-schema.ts` — added the Buster-side repo-local re-export facade for the common schema owner.
- `skills/buster/pipeline/services/telemetry.ts` — validates every Buster emission before Redis/artifact output and records degraded diagnostics for invalid payloads.
- `skills/buster/pipeline/runners/suite-runner.ts` — emits Buster-owned suite telemetry through `plugin.event`.
- `skills/buster/pipeline/services/session-monitor.ts` — emits Buster-owned session monitor telemetry through `plugin.event` while retaining shared observability/transcript events.
- `skills/buster/pipeline/services/task-lifecycle.ts` — emits Buster-owned task/decision telemetry through `plugin.event` while retaining shared agent lifecycle events.
- `skills/buster/pipeline/services/task-lifecycle/cleanup.ts` — emits Buster-owned sandbox cleanup telemetry through `plugin.event`.
- `skills/buster/pipeline/services/task-lifecycle/git-sync.ts` — emits Buster-owned git-sync telemetry through `plugin.event`.
- `skills/buster/pipeline/suites/visual-reg.ts` — emits Buster-owned visual-reg telemetry through `plugin.event` with plugin fields under `details`.
- `tests/verification/contracts/check-telemetry-contract.mjs` — verifies common schema inventory, plugin-event builder behavior, and invalid Buster payload suppression/degraded diagnostics.
- `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` — replaces Buster-specific event-name inventory with the single `plugin.event` extension contract.
- `docs/telemetry-event-schema.md` — documents `plugin.event` as the payload schema for plugin-owned telemetry.

### Problem / in-depth issue description

`services/telemetry.js` owned the Buster telemetry envelope and transport. The code validated whether `project` and `runId` existed before selecting the canonical stream, built a flat envelope, sanitized supplied data, and emitted it to Redis with fallback/degraded artifacts. It did not validate event-type-specific payloads for shared events such as `rate_limit.detected`, `observability.degraded`, and `observability.restored`, and it also allowed Buster-owned events to define arbitrary top-level event names and fields.

The accepted design treats Buster as an external plugin and avoids adding a new core schema/event type for every future plugin or gate. Core telemetry now accepts strict shared event schemas plus one generic `plugin.event` extension shape. Plugin-specific data must live under `details`; top-level fields are reserved for core correlation/status fields. Future plugins can add namespaced `plugin_event` values without changing the top-level canonical telemetry inventory.

### Impact

Telemetry consumers no longer receive arbitrary Buster event names or arbitrary top-level plugin fields. Invalid Buster telemetry payloads are rejected before Redis emission and recorded as degraded diagnostics, preserving non-blocking orchestration while making schema drift visible.

### Next step

Resolved by moving payload schema authority to common telemetry, adding `plugin.event`, migrating Buster-owned task/suite/session/visual events to `emitPluginEvent`, and extending contract verification. Focused run: `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` passed.

### Links / files

- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `skills/buster/pipeline/services/telemetry.ts`
- `skills/buster/pipeline/suites/visual-reg.ts`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`
- `docs/telemetry-event-schema.md`

## C00a-ISSUE-001 — Discord purge can stall on single-message non-rate-limit delete failures

Status: resolved
Area: common
Priority: low
Type: bug

### Evidence

- `skills/common/discord-purge.ts`

### Affected files

- `skills/common/discord-purge.ts` — in the `bulkIds.length === 1` branch, a 429 response sleeps and retries, an OK response increments `totalDeleted`, and any other non-OK response now throws a terminal error containing the status/body.

### Problem / in-depth issue description

`deepPurge()` loops by fetching up to 100 channel messages and deleting eligible messages newer than the 13.9-day cutoff. The multi-message bulk-delete branch throws on non-429 failures, and the fetch branch throws on non-OK fetches. Previously, the single-message delete branch only handled success and 429. For any other Discord response, such as 403, 404, or a non-rate-limit 5xx response, the function fell through to the normal batch delay and then fetched the same undeleted message again. Because no error was thrown and `totalDeleted` was not advanced, an operator could get a long-running or effectively infinite purge loop on one failing message.

### Impact

Low for pipeline execution because this is an operator utility, but a failed single-message delete can leave the process running while repeatedly calling Discord. That creates confusing operator output and unnecessary API traffic.

### Next step

Resolved by handling non-429 single DELETE failures the same way as bulk-delete failures: throw with status/body. Focused tests and pipeline-map updates were intentionally not added because this operator utility is pipeline-unrelated per maintainer decision.

### Links / files

- `skills/common/discord-purge.ts`

## C00b-ISSUE-001 — Common ACP/gateway helper result shapes are consumed as contracts but have no central validator/schema owner

Status: resolved
Area: common
Priority: medium
Type: schema-validation

### Evidence

- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/agents/lifecycle.ts`
- `skills/common/pipeline/integrations/gateway.ts`
- `skills/common/pipeline/services/acp-gateway-contract.ts`
- `tests/verification/behavior/areas/runtime-monitor.mjs`
- `tests/verification/contracts/check-common-helper-import-surface.mjs`
- `tests/verification/contracts/check-acp-gateway-contract-surface.mjs`

### Affected files

- `skills/common/pipeline/services/acp-gateway-contract.ts` — added as the central validator/normalizer owner for transcript state, monitor state, session lifecycle records, kill results, and gateway invoke result/error shapes.
- `skills/common/pipeline/agents/acp-monitor.ts` — now validates transcript cursor state and monitor result objects (`sessionKey`, `sessionState`, `sessionActive`, transcript state, gateway flags, terminal flags, reason/detail aliases, etc.) at return boundaries.
- `skills/common/pipeline/agents/lifecycle.ts` — now validates spawn session data, active-session JSON recovery/persist shape, and kill results.
- `skills/common/pipeline/integrations/gateway.ts` — now normalizes parsed/non-JSON gateway bodies and HTTP error shape through the common contract helper.
- `skills/nova/pipeline/services/acp-gateway-contract.ts` — added Nova repo-local re-export facade for the common contract owner.
- `skills/buster/pipeline/services/acp-gateway-contract.ts` — added Buster repo-local re-export facade for the common contract owner.
- `tests/verification/contracts/check-acp-gateway-contract-surface.mjs` — added focused contract coverage for the new helpers and caller wiring.
- `tests/verification/lib/lifecycle-audit-lib.mjs` — updated shared-helper inventory for the new common helper and repo-local common facades.
- `tests/verification/lib/run-contract-suite.sh` — added the focused contract check to the contract suite.

### Problem / in-depth issue description

The C00b common helpers define several cross-skill contract surfaces: ACP monitor state, transcript cursor state, active-session JSON, spawn result, kill result, and gateway invoke result. These shapes are consumed by Nova/Buster polling, lifecycle, rate-limit, and verification helpers. Before this fix, the source constructed the objects locally and behavior tests exercised representative paths, but no central schema/validator owned the required/optional fields or aliases. Future changes to field names such as `sessionActive`, `terminal`, `reason`, `gatewayUnreachable`, `childSessionKey`, or `confirmed` could silently break consumers unless an incidental behavior test caught the drift.

Resolved by adding `skills/common/pipeline/services/acp-gateway-contract.ts` as the explicit contract owner and wiring the shared monitor, lifecycle, and gateway helpers through it.

### Impact

Medium. ACP monitor and lifecycle result objects are shared across Nova and Buster common helper paths. Shape drift can affect terminal detection, session cleanup, rate-limit recovery, and restart/recovery behavior while still passing basic import checks.

### Next step

Resolved. Focused verification passed: `node tests/verification/contracts/check-acp-gateway-contract-surface.mjs --source-root "$PWD"`, `node tests/verification/contracts/check-common-helper-import-surface.mjs --source-root "$PWD"`, and `node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas runtime-monitor`.

### Links / files

- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/agents/lifecycle.ts`
- `skills/common/pipeline/integrations/gateway.ts`
- `skills/common/pipeline/services/acp-gateway-contract.ts`
- `tests/verification/contracts/check-acp-gateway-contract-surface.mjs`

## S00-ISSUE-001 — Project setup and Prism docs still document legacy visual-reg `baseline_dir` and `.cjs` tool names

Status: resolved
Area: docs
Priority: medium
Type: documentation-drift

### Evidence

- `skills/nova/project_setup/module-files.md`
- `skills/nova/project_setup/progress-json.md`
- `skills/prism/prism-conventions.md`
- `skills/buster/pipeline/suites/visual-reg.ts`
- `skills/buster/pipeline/tools/screenshot.ts`
- `tests/verification/behavior/areas/docs-surface.mjs`
- `tests/verification/contracts/check-buster-repo-scoped-paths.mjs`

### Affected files

- `skills/nova/project_setup/module-files.md` — now documents module-derived visual-reg baseline paths and current screenshot CLI path.
- `skills/nova/project_setup/progress-json.md` — now lists current visual-reg config fields without task-configured baseline paths.
- `skills/prism/prism-conventions.md` — now documents current source/runtime screenshot entrypoints and module baseline placement.
- `tests/verification/behavior/areas/docs-surface.mjs` — added focused docs-drift assertions for stale visual-reg tool/path guidance.
- `docs/pipeline/implementation-map/authority-map.md` — living authority rows now reflect resolved visual-reg docs authority.
- `docs/pipeline/implementation-map/dependency-matrix.md` — living dependency row now points at current screenshot source/runtime entrypoints.
- `docs/pipeline/implementation-map/env-vars-and-inputs.md` — living config row now reflects current visual-reg config and derived baseline paths.
- `docs/pipeline/implementation-map/external-boundaries.md` — living external-boundary row now reflects current screenshot tool boundary.
- `docs/pipeline/implementation-map/function-call-map.md` — living call row now reflects the current screenshot generator command and suite auto-detection.
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md` — living logic row now reflects current mode detection and tool naming.
- `docs/pipeline/implementation-map/path-construction.md` — living path row now reflects module-derived visual-reg baseline paths.
- `docs/pipeline/implementation-map/resiliency-and-error-handling.md` — living resiliency/telemetry rows no longer describe stale config state.
- `skills/buster/pipeline/suites/visual-reg.ts` — verified unchanged; current source derives baseline directories from module identity and rejects legacy baseline path configuration.
- `skills/buster/pipeline/tools/screenshot.ts` — verified unchanged; current source entrypoint is `.js` in this repo.

### Problem / in-depth issue description

The S00 setup/Prism docs instructed users to configure visual regression with a task-controlled baseline path and to run old `.cjs` tool names. The B04-reviewed source shows the current visual-reg implementation derives module baseline paths from module identity and treats legacy path configuration as a path-boundary error. The current repo tool path for baseline generation is `skills/buster/pipeline/tools/screenshot.ts`, and the Buster runtime image exposes it at `/app/skills/pipeline/tools/screenshot.ts`.

This doc drift could cause new project authors to put path fields into `progress.json` that current visual-reg rejects, or to look for stale entrypoints that do not exist in the source tree.

### Impact

Medium. Visual-reg setup is an operator-facing workflow; stale docs can make otherwise valid projects fail visual-reg with configuration errors or skip baseline generation until users reverse-engineer current source behavior.

### Next step

Resolved by updating `module-files.md`, `progress-json.md`, and `prism-conventions.md` to document module-derived `.swarm/modules/<module-dir>/baselines/` paths, current visual-reg config fields, and the current screenshot generator source/runtime entrypoints. Focused docs verification now rejects stale visual-reg tool/path guidance.

### Links / files

- `skills/nova/project_setup/module-files.md`
- `skills/nova/project_setup/progress-json.md`
- `skills/prism/prism-conventions.md`
- `skills/buster/pipeline/suites/visual-reg.ts`
- `skills/buster/pipeline/tools/screenshot.ts`
- `tests/verification/behavior/areas/docs-surface.mjs`

## S00-ISSUE-002 — progress-json ACP monitor defaults drift from current common monitor defaults

Status: resolved
Area: pipeline
Priority: low
Type: authority-boundary / documentation-drift

### Evidence

- `skills/nova/project_setup/progress-json.md`
- `charts/kubeclaw/files/config/swarm.config.json`
- `skills/nova/pipeline/core/config.ts`
- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/nova/pipeline/agents/orchestration.ts`
- `skills/buster/pipeline/services/session-monitor.ts`
- `skills/buster/pipeline/services/rate-limit.ts`
- focused behavior areas listed in the triage row

### Affected files

- `charts/kubeclaw/files/config/swarm.config.json` — now carries the complete required platform-owned `acp_monitor` block.
- `skills/nova/pipeline/core/config.ts` — validates `config.acp_monitor.*` as required non-negative platform config without synthesizing hidden defaults.
- `skills/common/pipeline/agents/acp-monitor.ts` — `getAcpMonitorConfig()` now normalizes explicit config only and throws on missing/invalid fields.
- `skills/nova/pipeline/agents/orchestration.ts` — forwards platform ACP monitor config into Buster task payloads and graceful idle waits.
- `skills/nova/pipeline/agents/reviewer-lifecycle.ts` — forwards platform ACP monitor config into graceful reviewer idle waits.
- `skills/buster/pipeline/services/session-monitor.ts` — consumes explicit Buster task `payload.acp_monitor` for monitor and rate-limit paths.
- `skills/buster/pipeline/services/rate-limit.ts` — liveness probes now receive explicit ACP monitor config instead of relying on fallback defaults.
- `skills/nova/project_setup/progress-json.md` — no longer documents ACP monitor timing as `progress.json` or payload-owned project config.
- `docs/PIPELINE-CONFIG-REFERENCE.md` — documents ACP monitor timing as required `swarm.config.json` platform config.
- `docs/pipeline-reference-v10.md` — updated the Wave 3 note to remove hidden-default language.
- `tests/verification/behavior/areas/foundations.mjs` — added validation coverage for missing/incomplete `config.acp_monitor`.
- `tests/verification/behavior/areas/docs-surface.mjs` — added docs coverage that ACP monitor config remains platform-owned.
- `tests/verification/behavior/areas/runtime-monitor.mjs` — added coverage that common ACP monitor config has no hidden defaults.
- `tests/verification/behavior/areas/telemetry.mjs` — verifies Nova Buster payloads carry explicit ACP monitor config and updates monitor fixtures.
- `tests/verification/behavior/areas/polling.mjs` — updates ACP polling fixtures to supply explicit platform config.
- `tests/verification/behavior/areas/transcript-monitor.mjs` — updates idle-wait transcript fixture to supply explicit platform config.
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs` — updates Buster runtime/rate-limit fixtures to supply explicit platform config.
- `docs/pipeline/implementation-map/*` — living maps now point to `swarm.config.json`/explicit config authority and no longer describe progress-json defaults drift.

### Problem / in-depth issue description

The initial finding observed that project setup docs documented ACP monitor defaults that disagreed with the common monitor source. The corrected authority decision is stronger: ACP monitor timing is platform configuration owned by `swarm.config.json`, not project `progress.json` and not an implicit runtime fallback.

Previously, `getAcpMonitorConfig()` and `core/config.js` synthesized fallback values. That made missing platform config look valid and let docs drift between project setup files and runtime source. Buster rate-limit liveness probes also reached the common monitor through paths that could rely on those hidden defaults.

### Impact

Low-to-medium. Operators should tune ACP monitor timing in one platform config location. Hidden fallbacks make production behavior harder to audit and can mask incomplete Helm/chart config during deployment or local verification.

### Next step

Resolved by making `acp_monitor` required platform config, forwarding it explicitly to Buster payloads, removing project-level docs guidance, and adding behavior/docs assertions for the no-hidden-default contract.

### Links / files

- `charts/kubeclaw/files/config/swarm.config.json`
- `skills/nova/pipeline/core/config.ts`
- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/nova/project_setup/progress-json.md`

## OI-34 — Milestone-based state authority deprecation needs an explicit cutoff contract

Status: resolved
Area: pipeline
Priority: critical
Type: authority-boundary / risk

### Evidence

- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/services/status-store-read-models.ts`
- `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts`
- `skills/nova/pipeline/services/gate-active-session.ts`
- `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/services/status-store.ts` — `loadStatus()` now projects lifecycle read models only; `module status JSON artifact` remains write-only diagnostic output for the pipeline.
- `skills/nova/pipeline/services/status-store-read-models.ts` and `status-store-read-models/module-projection.ts` — verified scheduler read-model helpers do not implicitly read module status artifacts.
- `skills/nova/pipeline/services/status-store-lifecycle/read-models.ts` — verified unchanged canonical lifecycle read-model authority.
- `skills/nova/pipeline/services/gate-active-session.ts` — file-only gate `active-session.json` is diagnostic evidence and never recovery identity.
- `skills/nova/pipeline/runners/pipeline-runner-recovery.ts` — verified stale recovery acts from lifecycle active-session authority, not legacy fallback files.
- `tests/verification/contracts/check-status-store-slice-surface.mjs` — added/updated no-status-read and explicit diagnostic evidence regressions.
- `tests/verification/contracts/check-gate-active-session-surface.mjs` — added file-only gate active-session diagnostic-only regression.
- `tests/verification/behavior/areas/restart-recovery.mjs` and `polling.mjs` — seeded lifecycle authority explicitly and covered recovery/polling without `module status JSON artifact` reads.

### Problem / in-depth issue description

Imported from archived tracker OI-34. Legacy `module status JSON artifact` and `active-session.json` fallback logic needs an explicit milestone-based cutoff. The intended model is that lifecycle/read-model state owns module truth and active dispatch/session lease owns live session truth, while legacy files are diagnostic/operator evidence only.

The broad Git staging finding from the same architecture review is intentionally not duplicated here because it is already tracked separately as OI-05 in the archived tracker and through newer prompt/git-staging findings in this tracker.

### Impact

Without a tracked cutoff contract, compatibility fallback reads can linger as implicit scheduler/recovery authority and reintroduce split-brain lifecycle or session decisions during resume, recovery, or gate handling.

### Next step

Resolved by cutting off pipeline reads of module `module status JSON artifact`: `loadStatus()` now returns lifecycle read-model projection only, scheduler projections do not implicitly read legacy status evidence, and gate file-only active-session evidence no longer becomes recovery identity. Focused verification passed: status-store contract, gate active-session contract, restart-recovery, polling, foundations, and lifecycle-state-surface.

### Links / files

- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-34
- Related archived issues: OI-09, OI-27, OI-28

## OI-35 — Gate-specific runner orchestration should collapse into a generic strategy-based GateRunner

Status: resolved
Area: pipeline
Priority: high
Type: simplification / architecture

### Evidence

- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/runners/remediable-gate-engine.ts`
- `skills/nova/pipeline/runners/waitable-gate-engine.ts`
- `skills/nova/pipeline/core/registry/builtins.ts`
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/runners/gate-runner.ts` — verified as the generic registry-resolved orchestration entrypoint with no concrete gate-type dispatch table.
- `skills/nova/pipeline/runners/review-gate-runner.ts` — verified review-specific behavior is evaluation/control-adapter code; the registry exposes `runReviewGateStage` for scheduler orchestration.
- `skills/nova/pipeline/runners/buster-gate-runner.ts` — verified Buster-specific Redis/task behavior stays behind the gate plugin/stage boundary; the registry exposes `runBusterGateStage`.
- `skills/nova/pipeline/runners/approval-gate-runner.ts` — verified approval wait/pass/block behavior uses typed control results and a waitable adapter; the registry exposes `runApprovalGateStage`.
- `skills/nova/pipeline/runners/remediable-gate-engine.ts` — verified shared fix-loop policy remains generic for review/Buster request-fix gates.
- `skills/nova/pipeline/runners/waitable-gate-engine.ts` — verified shared wait policy remains generic for wait-capable gates.
- `skills/nova/pipeline/core/registry/builtins.ts` — now covered by a contract assertion that built-in gates register stage evaluation functions plus `gateControl` strategy adapters, not direct gate-specific orchestration calls.
- `tests/verification/contracts/check-gate-control-result-surface.mjs` — added registry strategy assertions for review/Buster/approval stage entrypoints and adapter declarations.

### Problem / in-depth issue description

Imported from archived tracker OI-35. Review, Buster, and approval gates should not have separate orchestration semantics. Gate type resolution should be registry-owned, gate plugins should evaluate and return typed control results, and the core runner should own lifecycle mapping, retry/fix-loop policy, wait/block/pass handling, and state transitions.

Re-checking the current code showed the architecture cleanup has already landed: `gate-runner.js` resolves gate type owners from the startup-frozen registry, validates each owner's `gateControl` adapter, routes remediable gates through the generic remediable engine, routes waitable gates through the generic waitable engine, normalizes typed gate control results, and projects a canonical pipeline-step result. The built-in registry invokes only `runReviewGateStage`, `runBusterGateStage`, and `runApprovalGateStage`; it does not invoke the older direct `runReviewGate`, `runBusterGate`, or `runApprovalGate` orchestration helpers. The remaining gate-specific files own evaluation, task-specific side effects, and adapter/controller factories, not scheduler-level dispatch.

### Impact

Resolved as stale tracker drift plus missing contract coverage. The remaining risk is regression: a future built-in or custom gate could bypass the generic runner by wiring direct gate-specific orchestration into registry stage handlers. The added contract assertion protects against that for built-in review/Buster/approval gates.

### Next step

Resolved by documenting the current strategy contract and adding focused verification that built-in gate registry entries expose stage evaluation functions plus `gateControl` adapters, not direct gate-specific orchestration. Focused verification passed: `node tests/verification/contracts/check-gate-control-result-surface.mjs --source-root "$PWD"`, `node tests/verification/contracts/check-remediation-handoff-surface.mjs --source-root "$PWD"`, and `node tests/verification/behavior/verify.mjs --areas gates,approvals`.

### Links / files

- `docs/pipeline/implementation-map/batches/P11-nova-buster-gate.md`
- `docs/pipeline/implementation-map/batches/P12-nova-approval-gate.md`
- `skills/nova/pipeline/core/registry/builtins.ts`
- `tests/verification/contracts/check-gate-control-result-surface.mjs`
- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-35

## OI-36 — Pipeline and module runner state machines are fragmented across many micro-modules

Status: resolved
Area: pipeline
Priority: high
Type: simplification / maintainability

### Evidence

- `skills/nova/pipeline/runners/pipeline-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-loop.ts`
- `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- `skills/nova/pipeline/runners/pipeline-runner-recovery.ts`
- `skills/nova/pipeline/runners/module-runner.ts`
- `skills/nova/pipeline/runners/module-runner-prebuster.ts`
- `skills/nova/pipeline/runners/module-runner/buster-phase.ts`
- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs`
- `tests/verification/contracts/check-module-runner-slice-surface.mjs`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/runners/pipeline-runner-loop.ts` — now delegates loop routing to the explicit pipeline state-machine controller.
- `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts` — added as the cohesive owner for pipeline loop actions: complete, blocked halt, validator, gate, and module execution.
- `skills/nova/pipeline/runners/module-runner/attempt.ts` — now delegates module lifecycle phase routing to the explicit module attempt state-machine controller after dependency checks.
- `skills/nova/pipeline/runners/module-runner/state-machine.ts` — added as the cohesive owner for loaded-status, Forge, forge-only, pre-Buster, Buster, retry/terminal, and unexpected-status actions.
- `tests/verification/contracts/check-pipeline-runner-slice-surface.mjs` — added state-machine import/export and planner transition coverage.
- `tests/verification/contracts/check-module-runner-slice-surface.mjs` — added module state-machine import/export and planner transition coverage.

### Problem / in-depth issue description

Imported from archived tracker OI-36. Runner state is spread across many small phase files. The current split may improve local file size, but it also makes the actual state machine harder to see because transitions, recovery, scheduling, and terminal handling are distributed.

### Impact

Fragmented runner control flow increases onboarding cost and raises the chance that lifecycle, recovery, and terminal transitions drift between modules or future phases.

### Next step

Resolved by introducing cohesive behavior-retaining state-machine controllers for the pipeline loop and module attempts. The controllers centralize transition decisions while leaving transport, plugins, Redis completion handling, telemetry payloads, lifecycle writes, and terminal result builders in their existing collaborators. Focused contract verification now asserts the explicit transition planners and preserved delegation boundaries.

### Links / files

- `skills/nova/pipeline/runners/pipeline-runner-state-machine.ts`
- `skills/nova/pipeline/runners/module-runner/state-machine.ts`
- `docs/pipeline/implementation-map/function-call-map.md`
- `docs/pipeline/implementation-map/authority-map.md`
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md`
- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-36

## OI-37 — Redis transport needs a formal TaskQueue/EventBus abstraction boundary

Status: resolved
Area: pipeline
Priority: medium
Type: simplification / architecture

### Evidence

- `skills/common/pipeline/services/task-transport-contract.ts`
- `skills/nova/pipeline/services/task-transport-contract.ts`
- `skills/buster/pipeline/services/task-transport-contract.ts`
- `skills/nova/pipeline/tools/redis.ts`
- `skills/nova/pipeline/agents/orchestration.ts`
- `skills/buster/buster-pipeline.ts`
- `skills/buster/pipeline/services/task-queue.ts`
- `skills/buster/pipeline/services/task-completion.ts`
- `skills/buster/pipeline/tools/redis.ts`
- `skills/nova/pipeline/services/redis-completion.ts`
- `skills/nova/pipeline/services/polling-redis-completion.ts`
- `skills/nova/pipeline/services/redis-log.ts`
- `skills/buster/pipeline/services/task-lifecycle.ts`
- `tests/verification/contracts/check-redis-completion-service-surface.mjs`
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs`
- `tests/verification/behavior/areas/agent-lifecycle.mjs`
- `tests/verification/behavior/areas/buster-runtime-normalization.mjs`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/common/pipeline/services/task-transport-contract.ts` — added the canonical TaskQueue/EventBus contract, Redis-backed adapter factories, adapter shape assertions, and stream-entry decoding/field flattening helpers.
- `skills/nova/pipeline/services/task-transport-contract.ts` — added Nova repo-local re-export facade to the canonical common transport contract.
- `skills/buster/pipeline/services/task-transport-contract.ts` — added Buster repo-local re-export facade to the canonical common transport contract.
- `skills/nova/pipeline/tools/redis.ts` — migrated task publishing to `publishTask(...)` through the TaskQueue adapter.
- `skills/nova/pipeline/agents/orchestration.ts` — changed Redis dispatch to require/use the TaskQueue-facing `publishTask(...)` method.
- `skills/buster/buster-pipeline.ts` — moved consumer-group creation behind the Buster task queue boundary.
- `skills/buster/pipeline/services/task-queue.ts` — moved Redis read/reclaim/ACK/trim calls behind the TaskQueue adapter while preserving terminal evidence before ACK.
- `skills/buster/pipeline/services/task-completion.ts` — moved completion and dead-letter XADD calls behind the EventBus adapter.
- `skills/buster/pipeline/tools/redis.ts` — migrated task send path to the TaskQueue adapter.
- `tests/verification/contracts/check-redis-completion-service-surface.mjs` — added contract assertions for the TaskQueue/EventBus owner, shims, and Redis adapter parity.
- `tests/verification/contracts/check-buster-pipeline-slice-surface.mjs` — added Buster source contract assertions for TaskQueue/EventBus usage and exported consumer-group initialization.
- `tests/verification/behavior/areas/agent-lifecycle.mjs` — updated Redis dispatch fixtures to expose the new `publishTask(...)` adapter method.
- `tests/verification/lib/lifecycle-audit-lib.mjs` — added the new shared transport helper to the common-helper packaging/shim inventory.
- `docs/pipeline/implementation-map/authority-map.md` — updated living authority rows for TaskQueue/EventBus ownership and canonical publish semantics.
- `docs/pipeline/implementation-map/external-boundaries.md` — updated Redis task/completion boundary rows to the formal transport contract.
- `docs/pipeline/implementation-map/function-call-map.md` — updated call edges for TaskQueue publish/read/ACK/trim and EventBus completion/dead-letter publish.
- `docs/pipeline/implementation-map/data-schemas.md` — updated task/completion/dead-letter schema rows to show transport validation and decoding ownership.
- `docs/pipeline/implementation-map/concurrency-and-backpressure.md` — updated queue/read/trim/reclaim/ACK and completion backpressure rows to the adapter boundary.
- `docs/pipeline/implementation-map/dependency-matrix.md` — updated Redis dependencies to identify the common transport contract owner.
- `docs/pipeline/implementation-map/path-construction.md` — updated stream path rows to TaskQueue/EventBus producers and consumers.
- `docs/pipeline/implementation-map/env-vars-and-inputs.md` — updated sender/stream env-var owner to TaskQueue publish.
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md` — updated Redis publish algorithm row to TaskQueue publish.
- `docs/pipeline/implementation-map/resiliency-and-error-handling.md` — updated publish/ACK/dead-letter failure rows to EventBus/TaskQueue semantics.
- `docs/pipeline/implementation-map/acp-protocol.md` — updated completion stream publish wording for EventBus.

### Problem / in-depth issue description

Imported from archived tracker OI-37. Redis is used as task dispatcher, completion path, telemetry/log mirror, and deployment boundary. That may remain the production adapter, but orchestration semantics should not depend directly on Redis if agents are co-located or if a local-process queue is useful for dev/single-node mode.

### Impact

Concrete Redis coupling makes deployment alternatives harder and risks leaking transport details into gate/task semantics.

### Next step

Resolved by adding a common `TaskQueue` / `EventBus` transport contract and migrating task dispatch, Buster queue consumption, completion emission, dead-letter emission, and consumer-group initialization to that boundary. Redis remains the production adapter. Focused verification passed for Redis contract surface, Buster pipeline slice, common-helper shims, Buster runtime ACK guarantees, and agent lifecycle Redis dispatch.

### Links / files

- `skills/common/pipeline/services/task-transport-contract.ts`
- `docs/pipeline/implementation-map/external-boundaries.md`
- `docs/pipeline/implementation-map/function-call-map.md`
- `docs/pipeline/implementation-map/data-schemas.md`
- `docs/pipeline/implementation-map/concurrency-and-backpressure.md`
- `docs/pipeline/implementation-map/dependency-matrix.md`
- `docs/pipeline/implementation-map/path-construction.md`
- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-37

## OI-38 — Nova repo-local re-export facade files duplicate canonical common pipeline package surfaces

Status: later
Area: pipeline
Priority: low
Type: accepted-duplication / repo-testability

### Evidence

- `skills/nova/pipeline/agents/acp-monitor.ts`
- `skills/nova/pipeline/agents/lifecycle.ts`
- `skills/nova/pipeline/agents/runtime.ts`
- `skills/nova/pipeline/integrations/discord-webhook.ts`
- `skills/nova/pipeline/lifecycle-state.ts`
- `skills/nova/pipeline/security.ts`
- `skills/nova/pipeline/telemetry.ts`
- `skills/common/pipeline/`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/agents/acp-monitor.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/agents/lifecycle.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/agents/runtime.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/integrations/discord-webhook.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/lifecycle-state.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/security.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/nova/pipeline/telemetry.ts` — Nova-local repo-local re-export facade for common implementation.
- `skills/common/pipeline/` — canonical shared helper owner.

### Problem / in-depth issue description

Imported from archived tracker OI-38. Nova-local repo-local re-export facades duplicate package surfaces for canonical `skills/common/pipeline/*` helpers.

Maintainer decision in the archived tracker: this duplication is intentional. The shims keep the repository testable from source paths, and the canonical common implementations overwrite these paths at runtime/image materialization.

### Impact

Accepted trade-off. The shim files are not an active cleanup target as long as they remain thin re-exports and runtime packaging continues to overwrite them with the canonical common implementations.

### Next step

No immediate code change. Revisit only if repo testability no longer needs the shims, runtime overlay behavior changes, or a shim gains logic beyond a thin canonical re-export.

### Links / files

- `skills/nova/pipeline/README.md`
- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-38

## OI-39 — Artifact path construction is scattered across string-based module-local helpers

Status: resolved
Area: pipeline
Priority: medium
Type: simplification / risk

### Evidence

- `skills/nova/pipeline/core/paths.ts`
- `skills/nova/pipeline/runners/buster-gate-terminal.ts`
- `skills/nova/pipeline/runners/review-gate-task.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-state.ts`
- `skills/nova/pipeline/services/redis-log.ts`
- `skills/nova/pipeline/services/status-store-read-models/gate-projection.ts`
- `tests/verification/contracts/check-path-construction-surface.mjs`
- `docs/pipeline/implementation-map/path-construction.md`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/core/paths.ts` — now owns swarm-scoped gate/review/instruction artifacts, approval artifact paths/refs, and Redis log artifact targets.
- `skills/nova/pipeline/runners/buster-gate-terminal.ts` — delegates durable Buster gate output path construction to `gateOutputPath()`.
- `skills/nova/pipeline/runners/buster-gate-runner.ts` — delegates stale output cleanup path construction to `gateOutputPath()`.
- `skills/nova/pipeline/runners/buster-gate-fix-cycle.ts` — delegates fix-cycle stale output cleanup path construction to `gateOutputPath()`.
- `skills/nova/pipeline/runners/review-gate-task.ts` — delegates reviewer and merged review output paths to `reviewGateOutputPath()` / `gateOutputPath()`.
- `skills/nova/pipeline/runners/review-gate-runner.ts` — delegates review cleanup and existing-output reads to `gateOutputPath()`.
- `skills/nova/pipeline/runners/approval-gate-state.ts` — delegates approval request/decision/transition artifact paths to `approvalGateArtifactPaths()` and operator refs to `approvalGateArtifactRefPaths()`.
- `skills/nova/pipeline/services/redis-log.ts` — delegates Redis artifact targets to `redisLogArtifactTargets()`.
- `skills/nova/pipeline/services/status-store-read-models/gate-projection.ts` — delegates gate output read-model path projection to `gateOutputPath()`.
- `tests/verification/contracts/check-path-construction-surface.mjs` — added central helper/path-boundary/source-delegation contract coverage.
- `docs/pipeline/implementation-map/path-construction.md` — updated living path authority map for OI-39.

### Problem / in-depth issue description

Imported from archived tracker OI-39. Artifact locations are constructed through multiple string-based helpers and local interpolations. Path construction exists in `core/paths.js`, but not every artifact writer clearly delegates to one central artifact context/resolver.

### Impact

Scattered path construction increases drift risk, weakens path-boundary reasoning, and makes artifact relocation or documentation harder.

### Next step

Resolved by centralizing durable gate/review/approval/Redis artifact path construction in `core/paths.js`, migrating the affected runners/services to those helpers, and adding `check-path-construction-surface.mjs` coverage for canonical paths, path-boundary rejection, Redis target construction, and source-level delegation.

### Links / files

- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-39
- Related archived issues: OI-13, OI-23

## OI-40 — Discord identity serialization is duplicated across lifecycle, runner, and gate surfaces

Status: resolved
Area: observability
Priority: low
Type: duplication / simplification

### Evidence

- `skills/nova/pipeline/agents/orchestration-lifecycle-events.ts`
- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/runners/review-gate-runner.ts`
- `skills/nova/pipeline/runners/buster-gate-runner.ts`
- `skills/nova/pipeline/runners/approval-gate-shared.ts`
- `skills/nova/pipeline/runners/module-runner-shared.ts`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/common/pipeline/services/rate-limit-contract.ts` — owns canonical Discord identity field specs, surface sets, and surface builder.
- `skills/nova/pipeline/services/discord-fields.ts` — re-exports the canonical common Discord identity surface for Nova callers.
- `skills/nova/pipeline/agents/orchestration.ts` — builds lifecycle Discord/operator identity fields directly from the canonical lifecycle surface.
- `skills/nova/pipeline/agents/reviewer-lifecycle.ts` — builds reviewer lifecycle Discord/operator identity fields directly from the canonical lifecycle surface.
- `skills/nova/pipeline/runners/gate-runner.ts` — builds gate dispatch identity fields from the canonical gate-dispatch surface.
- `skills/nova/pipeline/runners/review-gate-runner.ts` — builds review-gate identity fields from the canonical gate-session surface.
- `skills/nova/pipeline/runners/buster-gate-runner.ts` — builds Buster-gate identity fields from the canonical gate-session surface.
- `skills/nova/pipeline/runners/approval-gate-runner.ts` — builds approval identity fields from the canonical approval-gate surface.
- `skills/nova/pipeline/runners/module-runner-forge.ts` and module runner Buster-phase files — build module notification identity fields from the canonical module-session surface.
- `skills/nova/pipeline/runners/pipeline-runner-*.ts` — build pipeline notification identity fields from the canonical pipeline surface.

### Problem / in-depth issue description

Imported from archived tracker OI-40. Discord identity fields are built in several places. Even when builders delegate to a shared helper, the identity shape and field selection are repeated across lifecycle events, gate dispatch, gate tasks, approval state, and module notifications.

### Impact

Low but real: duplicated identity serialization can make operator alerts inconsistent and can hide missing run/gate/module correlation fields on one notification path.

### Next step

Resolved by centralizing Discord identity field selection in `skills/common/pipeline/services/rate-limit-contract.ts` as `DISCORD_IDENTITY_SURFACES`, `DISCORD_IDENTITY_FIELD_SETS`, and `buildDiscordIdentitySurfaceFields()`, re-exporting the surface through `skills/nova/pipeline/services/discord-fields.ts`, and replacing local lifecycle/gate/approval/module/pipeline Discord field wrappers with direct canonical surface calls. Verification now checks the canonical surface builder and confirms the legacy local wrappers are absent from current callers.

### Links / files

- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-40
- Related archived issue: OI-24

## OI-41 — ACP monitor/lifecycle circular lazy import is structural coupling

Status: resolved
Area: common
Priority: medium
Type: simplification / maintainability

### Evidence

- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/agents/lifecycle.ts`
- `skills/common/pipeline/agents/session-semantics.ts`
- `skills/common/pipeline/agents/tracked-agents.ts`
- `tests/verification/contracts/check-critical-dynamic-imports.mjs`
- `tests/verification/contracts/check-common-helper-import-surface.mjs`
- `tests/verification/behavior/areas/foundations.mjs`
- `tests/verification/behavior/areas/shutdown-integration.mjs`
- `docs/pipeline/implementation-map/function-call-map.md`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/common/pipeline/agents/acp-monitor.ts` — removed the lifecycle lazy import; monitor now statically reads tracked-agent state from the neutral registry and re-exports session parsing from semantics.
- `skills/common/pipeline/agents/lifecycle.ts` — stopped importing ACP monitor; lifecycle imports session parsing from `session-semantics.js` and re-exports tracked-agent helpers as the compatibility facade.
- `skills/common/pipeline/agents/session-semantics.ts` — now owns `parseSessionState` alongside terminal/stopped/unreachable vocabulary.
- `skills/common/pipeline/agents/tracked-agents.ts` — new neutral process-local tracked-agent registry owner.
- `skills/nova/pipeline/agents/tracked-agents.ts` — Nova repo-local re-export facade for the new common owner.
- `skills/buster/pipeline/agents/tracked-agents.ts` — Buster repo-local re-export facade for the new common owner.
- `tests/verification/contracts/check-critical-dynamic-imports.mjs` — verifies ACP monitor has zero dynamic imports and lifecycle no longer imports ACP monitor.
- `tests/verification/contracts/check-common-helper-import-surface.mjs` — verified updated shared helper inventory and shims.
- `tests/verification/behavior/areas/foundations.mjs` — updated source-boundary assertions for static neutral imports.
- `tests/verification/behavior/areas/shutdown-integration.mjs` — updated lifecycle/tracked-agent ownership assertion.
- `docs/pipeline/implementation-map/README.md` — added the neutral tracked-agent helper to the common-agent scope.
- `docs/pipeline/implementation-map/function-call-map.md` — updated call edges to remove the monitor/lifecycle lazy edge and record neutral static imports.
- `docs/pipeline/implementation-map/authority-map.md` — updated tracked-agent registry authority to `tracked-agents.js`.
- `docs/pipeline/implementation-map/data-schemas.md` — updated tracked-agent entry producer/consumer ownership.
- `docs/pipeline/implementation-map/acp-protocol.md` — updated ACP session parsing and tracked-record producers.
- `docs/pipeline/implementation-map/concurrency-and-backpressure.md` — updated shutdown cleanup to reference the neutral tracked-agent map.
- `docs/pipeline/implementation-map/dependency-matrix.md` — removed the old URL/dynamic-import dependency state.
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md` — updated parse-session and tracked-agent algorithm ownership.

### Problem / in-depth issue description

Imported from archived tracker OI-41. `acp-monitor.js` contained a deliberate lazy import of `lifecycle.js` because the ACP monitor and lifecycle modules depended on each other. The dynamic import was documented and safe, but it was a structural coupling workaround rather than a clean module boundary. The coupling was resolved by moving session status parsing into `session-semantics.js` and process-local tracked-agent state into `tracked-agents.js`, allowing both ACP monitor and lifecycle to use static imports without depending on each other.

### Impact

Resolved. Future refactors no longer need to preserve the ACP monitor/lifecycle lazy edge, and static import verification now guards against reintroducing that cycle.

### Next step

No further action for this issue. Focused verification passed:

- `node tests/verification/contracts/check-critical-dynamic-imports.mjs --source-root "$PWD"`
- `node tests/verification/contracts/check-common-helper-import-surface.mjs --source-root "$PWD"`
- `node tests/verification/contracts/check-acp-gateway-contract-surface.mjs --source-root "$PWD"`
- `node tests/verification/behavior/verify.mjs --source-root "$PWD" --areas foundations,runtime-monitor,polling,agent-lifecycle,shutdown-integration,transcript-monitor`

### Links / files

- `skills/common/pipeline/agents/tracked-agents.ts`
- `skills/common/pipeline/agents/session-semantics.ts`
- `docs/pipeline/implementation-map/function-call-map.md`
- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-41

## OI-42 — Active polling loops should be evaluated for event-driven or blocking wait patterns

Status: resolved
Area: pipeline
Priority: medium
Type: optimization / architecture

### Evidence

- `skills/nova/pipeline/runners/buster-gate-completion.ts`
- `skills/nova/pipeline/services/polling-redis-completion.ts`
- `skills/nova/pipeline/services/polling.ts`
- `skills/nova/pipeline/services/polling-session-end.ts`
- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/services/redis-message-contract.ts`
- `skills/common/pipeline/services/pipeline-event-contract.ts`
- `skills/nova/pipeline/services/completion-event-adapters.ts`
- `skills/nova/pipeline/services/buster-completion-controller.ts`
- `docs/pipeline/OI-42-event-driven-completion-refactor-plan.md`
- `docs/pipeline/implementation-map/batches/P17-nova-polling-and-completion-watching.md`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/nova/pipeline/runners/buster-gate-runner.ts` — Buster gate attempts call `waitBusterGateCompletionEvidence(...)` directly for completion evidence.
- `skills/nova/pipeline/runners/buster-gate-completion.ts` — active Buster gate completion waits use Redis/local event adapters and the shared controller.
- `skills/nova/pipeline/services/polling-dual.ts` — active Buster module completion waits use `waitForModuleBusterCompletion(...)` with Redis/local event adapters and the shared controller.
- `skills/nova/pipeline/services/completion-event-adapters.ts` — Redis completion waits now use a dedicated `XREAD BLOCK` adapter.
- `skills/nova/pipeline/services/polling.ts` — Phase 4 keeps `pollDual(...)` / `pollDualWithRateLimitRecovery(...)` public wrappers but routes Buster module completion to the event-driven wait.
- `skills/nova/pipeline/services/polling-session-end.ts` — session-end loops should be evaluated for event-driven monitor support.
- `skills/common/pipeline/agents/acp-monitor.ts` — ACP monitor sleep loops should be evaluated for event-driven or blocking wait patterns.
- `skills/common/pipeline/services/pipeline-event-contract.ts` — Phase 1 added the canonical in-process event envelope, identity normalization, event bus, and abortable wait contract using the Redis schema style as the template.
- `skills/nova/pipeline/services/pipeline-event-contract.ts` — Nova repo-local re-export facade for the common event contract.
- `skills/buster/pipeline/services/pipeline-event-contract.ts` — Buster repo-local re-export facade for the common event contract.
- `skills/nova/pipeline/services/completion-event-adapters.ts` — Phase 4 active Buster module/gate waits now start the Redis and local filesystem completion evidence adapters.
- `skills/nova/pipeline/services/buster-completion-controller.ts` — Phase 4 active Buster module/gate waits now use the controller for Redis/local/fatal event resolution.
- `tests/verification/contracts/check-pipeline-event-contract-surface.mjs` — Phase 5 covers AbortSignal/listener cleanup plus `waitForAny` race and timeout cleanup.
- `tests/verification/contracts/check-completion-event-adapters-surface.mjs` — Phase 5 covers fake Redis dedicated-client/blocking behavior plus local evidence debounce/watcher cleanup.
- `tests/verification/contracts/check-buster-completion-controller-surface.mjs` — Phase 5 covers controller stale-event/timeout cleanup and module/gate wrapper behavior.
- `tests/verification/contracts/check-pipeline-event-contract-surface.mjs` — focused Phase 1 verification for envelope validation, wait matching, timeout, abort, and listener cleanup.
- `tests/verification/contracts/check-completion-event-adapters-surface.mjs` — focused Phase 2 verification for dedicated Redis blocking client behavior, abort cleanup, local watcher debounce, and watcher cleanup.
- `tests/verification/contracts/check-buster-completion-controller-surface.mjs` — focused Phase 3 verification for Redis-first resolution, local fallback/wakeup behavior, invalid completion fail-closed handling, gate output terminal fallback, and fatal adapter errors.
- `docs/pipeline/OI-42-event-driven-completion-refactor-plan.md` — recorded the controlled multi-phase refactor plan and cleanup requirements.

### Problem / in-depth issue description

Imported from archived tracker OI-42. Several runtime paths use active polling. Examples include Buster completion evidence checks over Redis/output files and ACP monitor sleep loops. This is correct but may be less efficient and slower to react than blocking reads such as Redis `XREAD BLOCK`, local event emitters, or a transport adapter that supports wait semantics.

### Impact

Polling can add avoidable latency, CPU wakeups, and configuration complexity. It also scatters interval/backoff semantics across monitor and completion code.

### Next step

Resolved. Phase 1 established the canonical in-process pipeline event contract: normalized event envelopes, shared identity matching, `waitForEvent`/`waitForAny`, and mandatory abort cleanup semantics. Phase 2 added edge adapters for Redis completion evidence (`XREAD BLOCK` with a dedicated client) and debounced local evidence updates (`fs.watch`). Phase 3 added the Buster completion controller with Redis-first adjudication and local gate-output fallback support. Phase 4 cut Buster module and gate completion waits over to that controller. Phase 5 expanded verification for event cleanup, adapter lifecycle behavior, and module/gate controller wrapper behavior. Phase 6 removed the retired per-cycle Buster helpers after dead-caller checks and refreshed the living maps. ACP/subagent observation is intentionally out of the completed Buster completion scope and remains polling until adapter-contained polling or gateway push support is available.

### Links / files

- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-42
- Related: OI-37
- Phase 0/1 plan: `docs/pipeline/OI-42-event-driven-completion-refactor-plan.md`

## OI-43 — Non-critical failure paths have incomplete degraded telemetry coverage

Status: resolved
Area: observability
Priority: medium
Type: telemetry-gap / operator-surface

### Evidence

- `skills/buster/pipeline/suites/visual-reg-discord.ts`
- `skills/buster/pipeline/suites/visual-reg.ts`
- `skills/buster/pipeline/services/discord.ts`
- `skills/nova/pipeline/core/policy.ts`
- `skills/nova/pipeline/services/system-io-warning.ts`
- `skills/nova/pipeline/services/git-soft-fail-observability.ts`
- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `skills/nova/pipeline/runners/review-gate-task.ts`
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts`
- `skills/nova/pipeline/runners/buster-gate-terminal.ts`
- `skills/common/pipeline/services/telemetry/payload-schema.ts`
- `tests/verification/behavior/areas/operator-surface.mjs`
- `tests/verification/contracts/check-git-soft-fail-observability-surface.mjs`
- `tests/verification/contracts/check-system-io-warning-surface.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `docs/pipeline/implementation-map/OI-43-noncritical-observability-plan.md`
- `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md`

### Affected files

- `skills/buster/pipeline/services/discord.ts` — added protocol-agnostic `deliverDiscordWebhookRequest()` so raw/multipart callers share Buster Discord degraded/restored webhook telemetry.
- `skills/buster/pipeline/suites/visual-reg-discord.ts` — now formats multipart visual-reg payloads and delegates HTTP delivery to the shared Buster Discord transport while preserving non-critical delivery result shapes.
- `skills/buster/pipeline/suites/visual-reg.ts` — passes run/module/session delivery context to visual-reg Discord helpers.
- `skills/nova/pipeline/integrations/git-worktree.ts` — verified unchanged for transient retry semantics; retry warnings remain local resiliency signals, not degraded telemetry.
- `skills/nova/pipeline/services/git-soft-fail-observability.ts` — centralizes the stable `git_worktree` / `commit_push` / `git_commit_push_soft_failed` degraded payload while leaving emission caller-owned.
- `skills/nova/pipeline/runners/module-runner-forge.ts` — uses the shared helper with module context when forge-only soft-fail commit/push loses persistence.
- `skills/nova/pipeline/runners/review-gate-task.ts` — uses the shared helper with gate/review context when review output soft-fail commit/push loses persistence.
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` — uses the shared helper with gate/cycle/session context when gate fix soft-fail commit/push loses persistence.
- `skills/nova/pipeline/runners/buster-gate-terminal.ts` — uses the shared helper with gate/session context when Buster gate PASS persistence soft-fail commit/push loses persistence.
- `skills/nova/pipeline/services/system-io-warning.ts` — centralizes point-in-time `system.io_warning` emission and stable local I/O specializations.
- `skills/nova/pipeline/core/policy.ts` — delegates model-policy audit append warning emission to the shared helper without introducing restored state.
- `skills/common/pipeline/services/telemetry/payload-schema.ts` — registers the `system.io_warning` payload contract.
- `tests/verification/behavior/areas/operator-surface.mjs` — added focused regressions for visual-reg shared Discord degraded/restored telemetry, Git soft-fail caller telemetry, and policy IO warning emission.
- `tests/verification/contracts/check-git-soft-fail-observability-surface.mjs` — added Phase 2 source contract coverage for the shared helper, all four orchestration soft-fail call sites, and the low-level git retry helper staying telemetry-free.
- `tests/verification/contracts/check-system-io-warning-surface.mjs` — covers the shared I/O warning helper, stable specializations, logger/status-store wiring, and bare stderr fallback.
- `tests/verification/contracts/check-telemetry-contract.mjs` — extended payload-schema exhaustiveness fixture for `system.io_warning`.
- `docs/pipeline/implementation-map/OI-43-noncritical-observability-plan.md` — records accepted plan and contract seams.

### Problem / in-depth issue description

Imported from archived tracker OI-43. Non-critical failure paths were not uniformly visible in telemetry. Visual-regression Discord multipart delivery only logged non-critical failures instead of sharing the main Buster Discord webhook degraded/restored lifecycle. Nova Git transient retries were reviewed and intentionally kept as local resiliency logs, while `gitCommitAndPush(..., { softFail: true })` callers now emit caller-owned degraded telemetry through the shared Git soft-fail observability helper when persistence loss matters. Local audit/artifact append failures emit point-in-time `system.io_warning` events through the shared system I/O warning helper.

### Impact

Operators may miss storage, network, repository, or side-channel delivery degradation until it causes a larger failure. The system remains fail-soft, but observability is inconsistent.

### Next step

Resolved by routing visual-reg multipart webhook delivery through shared Buster Discord transport, adding caller-owned Git soft-fail degraded telemetry through a shared payload helper, and adding schema-owned `system.io_warning` emission through a shared system I/O warning helper for local audit/artifact append failures. Focused verification: `operator-surface` regressions, `check-git-soft-fail-observability-surface.mjs`, `check-system-io-warning-surface.mjs`, `check-buster-pipeline-slice-surface.mjs`, syntax checks, and telemetry schema coverage.

### Links / files

- Archived source issue: `docs/archive/pipeline-implementation-map-review-2026-05-08/open-issues.md` OI-43
- Related archived issues: OI-17, OI-20, OI-24
- Accepted plan/seams: `docs/pipeline/implementation-map/OI-43-noncritical-observability-plan.md`

## OI-44 — Contract-invalid diagnostics can include unredacted plugin input/result previews

Status: resolved
Area: security
Priority: high
Type: risk

### Evidence

- `skills/nova/pipeline/services/contract-diagnostics.ts`
- `skills/nova/pipeline/services/serialization.ts`
- `skills/nova/pipeline/services/contracts/gate-control-result.ts`
- `skills/nova/pipeline/services/contracts/worker-control-result.ts`
- `skills/nova/pipeline/services/contracts/validator-control-result.ts`
- `skills/nova/pipeline/services/contracts/generator-result.ts`
- `skills/nova/pipeline/runners/module-runner-forge.ts`
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts`
- `skills/nova/pipeline/runners/gate-runner.ts`
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`
- `skills/common/pipeline/redaction.ts`

### Affected files

- `skills/nova/pipeline/services/contract-diagnostics.ts` — now builds source-redacted contract diagnostics through the redaction facade; raw/coerced preview fields are deleted and replaced by redacted summaries.
- `skills/nova/pipeline/services/serialization.ts` — `buildSafeJsonPreview()` was deleted after import verification found no legitimate remaining callers.
- `skills/nova/pipeline/services/contracts/gate-control-result.ts` — gate normalizers still pass raw plugin gate results into `createContractInvalidError()`; the diagnostic builder redacts them before projection.
- `skills/nova/pipeline/services/contracts/worker-control-result.ts` — worker normalizers still pass raw plugin worker results into `createContractInvalidError()`; the diagnostic builder redacts them before projection.
- `skills/nova/pipeline/services/contracts/validator-control-result.ts` — validator normalizers still pass raw plugin validator results into `createContractInvalidError()`; the diagnostic builder redacts them before projection.
- `skills/nova/pipeline/services/contracts/generator-result.ts` — generator normalizer still passes raw generator output into `createContractInvalidError()`; the diagnostic builder redacts it before projection.
- `skills/nova/pipeline/runners/module-runner-forge.ts` — continues propagating `error.diagnostics`, now source-redacted.
- `skills/nova/pipeline/runners/module-runner-buster-worker.ts` — continues propagating `error.diagnostics`, now source-redacted.
- `skills/nova/pipeline/runners/gate-runner.ts` — continues propagating `error.diagnostics`, now source-redacted.
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts` — continues propagating scheduled validator/generator contract diagnostics, now source-redacted.
- `skills/common/pipeline/redaction.ts` — owns the reused `summarizeStructuredValue()`, `redactSecrets()`, and telemetry/Discord sanitizers.

### Problem / in-depth issue description

Resolved by making `contract-diagnostics.js` the source redaction boundary. `buildContractInvalidDiagnostic()` now applies the existing redaction facade to JSON-safe raw/coerced values, ids/refs, invocation, validation errors, and the thrown error message. Diagnostics contain `rawResultSummary` / `coercedResultSummary` metadata and safe identifiers; `rawResultPreview` / `coercedResultPreview` no longer exist.

Gate, worker, validator, and generator normalizers can still pass raw plugin values to the builder, but the diagnostic object that reaches terminal pipeline-step diagnostics, gate failure diagnostics, scheduler diagnostics, logs, telemetry, summaries, or operator artifacts is redacted by construction. Focused contract regressions cover nested token/password/API-key/authorization values and assert raw preview fields are absent before downstream projection.

### Impact

Resolved security/observability risk. Malformed or crashing plugins can still return credentials, request headers, prompts, or other sensitive fields, but contract diagnostics summarize/redact those values before any caller projection.

### Next step

Resolved by deleting raw previews, using the redaction facade in `contract-diagnostics.js`, updating gate/worker/validator/generator/module-runner verification, and synchronizing the implementation maps.

### Links / files

- Review citations: P07-R005, P07-R016, P13-R001 through P13-R007.
- Related redaction owner: `skills/common/pipeline/redaction.ts`.

## OI-45 — Prompt artifacts and structural logger append failures are still debug-only

Status: resolved
Area: observability
Priority: medium
Type: telemetry-gap

### Evidence

- `skills/nova/pipeline/services/status-store.ts`
- `skills/nova/pipeline/core/logger.ts`
- `skills/nova/pipeline/services/system-io-warning.ts`
- `skills/nova/pipeline/services/telemetry-stream.ts`
- `tests/verification/contracts/check-system-io-warning-surface.mjs`
- `tests/verification/behavior/areas/operator-surface.mjs`
- `docs/pipeline/implementation-map/OI-43-noncritical-observability-plan.md`

### Resolution

- `skills/nova/pipeline/services/system-io-warning.ts` owns the canonical `system.io_warning` helper plus stable specializations for model-policy audit, pipeline JSONL, and redacted prompt artifact failures.
- `skills/nova/pipeline/core/logger.ts` calls `emitPipelineLogAppendWarning()` when pipeline JSONL mkdir/append fails.
- `skills/nova/pipeline/services/status-store.ts` calls `emitPromptArtifactWriteWarning()` when `savePrompt()` cannot persist a redacted prompt artifact.
- `skills/nova/pipeline/services/telemetry-stream.ts` no longer imports `core/logger.js`, so warning emission cannot recurse through the structural logger path.
- `system-io-warning.js` includes a bare `console.error`/`process.stderr.write` fallback when Redis stream emission itself fails.

### Verification

- `tests/verification/contracts/check-system-io-warning-surface.mjs` asserts the helper specializations, logger/status-store wiring, logger-free stream path, and bare stderr fallback.
- Focused `operator-surface` behavior coverage proves pipeline JSONL append failures and prompt artifact write failures emit Redis-backed `system.io_warning` events.

### Links / files

- Review citations: P01-R006, P14-R006, P01-F014.
- Related resolved umbrella issue: OI-43.

## OI-46 — Approval-gate waits still use persisted-state polling instead of event/blocking wait adapters

Status: resolved
Area: pipeline
Priority: low
Type: optimization

### Resolution

Approval waits now use the canonical EventBus signal flow. `approval-gate-runner.js` delegates pending approval waits to `waitForApprovalSignalFlow()`, which waits on `approval.signal` / `fatal.error` with the current approval deadline as the only timeout. The fixed runner polling loop, `DEFAULT_POLL_INTERVAL_MS`, and `_approvalPollIntervalMs` have been deleted.

The filesystem edge is isolated in `skills/nova/pipeline/services/approval-signal-event-adapter.ts`. That adapter watches the gate-status artifact, converts pending updates and terminal decisions into strict `approval.signal` events, and deterministically closes watchers/timers on terminal emission or runner completion.

### Verification

- `tests/verification/contracts/check-pipeline-event-contract-surface.mjs` covers the strict `approval.signal` payload schema, synchronous rejection of unknown fields/statuses, EventBus delivery, and adapter watcher/timer cleanup.
- `tests/verification/contracts/check-gate-control-result-surface.mjs` asserts the approval runner consumes the signal adapter/EventBus and contains no `pollForApproval`, `_approvalPollIntervalMs`, `DEFAULT_POLL_INTERVAL_MS`, or `deps.sleep(...)` wait path.
- `tests/verification/behavior/verify.mjs --areas approvals,governance,resume-idempotence` covers approval signal resolution, deadline reload, governance telemetry, and resume idempotence.

### Links / files

- `skills/nova/pipeline/runners/approval-gate-runner.ts`
- `skills/nova/pipeline/services/approval-signal-event-adapter.ts`
- `skills/common/pipeline/services/pipeline-event-contract.ts`
- `docs/pipeline/implementation-map/reviews/open-issues-table.md`

## OI-47 — Gateway-facing agent operations are still scattered under the common agent boundary

Status: resolved
Area: pipeline
Priority: medium
Type: simplification

### Evidence

- `skills/common/pipeline/integrations/gateway.ts`
- `skills/common/pipeline/agents/lifecycle.ts`
- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/agents/session-termination.ts`
- `skills/common/pipeline/agents/runtime.ts`
- `skills/nova/pipeline/services/failures/presentation.ts`
- `skills/nova/pipeline/services/arch-validator.ts`
- `skills/nova/pipeline/services/polling-session-end.ts`
- `skills/nova/pipeline/agents/orchestration.ts`
- `skills/nova/pipeline/agents/orchestration-healthcheck.ts`
- `skills/buster/pipeline/services/gateway-health.ts`
- `skills/buster/pipeline/services/session-monitor.ts`

### Affected files

- `skills/common/pipeline/integrations/gateway.ts` — should expose typed gateway operation wrappers instead of leaving domain code to call raw tool names directly.
- `skills/common/pipeline/agents/lifecycle.ts` — already owns `spawnSession()` / `killSession()`; should remain the canonical spawn/kill boundary and may need additional exported operations for send/steer/status reuse.
- `skills/common/pipeline/agents/acp-monitor.ts` — already owns canonical monitor state and event adapter behavior; should remain the canonical status/transcript monitoring boundary.
- `skills/common/pipeline/agents/session-termination.ts` — verify all termination callers continue to enter through this shared controller after gateway operation wrappers are introduced.
- `skills/common/pipeline/services/acp-gateway-contract.ts` — may need schemas/validators for any new typed common operation result wrappers.
- `skills/nova/pipeline/services/failures/presentation.ts` — currently calls `gatewayInvoke('sessions_send', ...)` for Needs-Nova/operator injection; should call a common typed session-message operation.
- `skills/nova/pipeline/services/arch-validator.ts` — currently calls `gatewayInvoke('complete', ...)` directly; the generic gateway completion operation should be common while the architecture prompt/checks remain Nova-owned.
- `skills/nova/pipeline/services/polling-session-end.ts` — currently calls `gatewayInvoke('sessions_send', ...)` for nudge/stop-style session interaction; should use a common typed session-message operation while retaining Nova-specific no-change/Git/operator policy locally.
- `skills/nova/pipeline/agents/orchestration.ts` — already delegates spawn/kill to common lifecycle but still calls `gatewayInvoke('sessions_send', ...)` directly for steering; steering should use a common operation.
- `skills/nova/pipeline/agents/orchestration-healthcheck.ts` — currently calls `gatewayInvoke('session_status', ...)` directly; the reusable liveness/status check should be common, with Nova retaining only identity projection and degraded/restored telemetry presentation.
- `skills/buster/pipeline/services/gateway-health.ts` — currently performs Gateway `/health` fetch logic in Buster; Gateway health probing should be common if Nova/Buster both depend on it.
- `skills/buster/pipeline/services/session-monitor.ts` — already consumes common ACP monitor and termination primitives; verify it remains on common wrappers and does not grow raw gateway calls.
- `tests/verification/contracts/check-common-helper-import-surface.mjs` or a new focused contract — add source checks that fail if Nova/Buster domain modules call raw Gateway tool names directly under the allowlisted common boundary/facades.
- `docs/pipeline/implementation-map/function-call-map.md` — synchronize call ownership after the common operation boundary is introduced.
- `docs/pipeline/implementation-map/external-boundaries.md` — document the common Gateway operation boundary and allowed raw Gateway callers.
- `docs/pipeline/implementation-map/acp-protocol.md` — update session/status/send/complete/health protocol rows to point at the common wrappers.
- `docs/pipeline/implementation-map/dependency-matrix.md` — document the framework portability boundary for Gateway/OpenClaw-specific operations.

### Problem / in-depth issue description

Spawn, kill, ACP monitoring, and termination are mostly centralized in `skills/common/pipeline/agents/*`, but several Nova and Buster domain modules still speak directly to the OpenClaw Gateway surface. The observed direct operations include `session_status` in Nova cost snapshots and orchestration health checks, `sessions_send` in Needs-Nova presentation, session nudging, and orchestration steering, `complete` in the architecture validator, and Gateway `/health` probing in Buster.

The desired boundary is: domain modules may decide **when** an agent/session action is needed, but the actual Gateway-facing operation should be a typed common function. Nova should own module/gate/run identity, prompts, status mutation, Discord/operator wording, architecture governance, and run-level cost reports. Buster should own suite/task observability and verdicts. Common should own the framework-coupled operations: session status, session message/steer, spawn, kill/termination, transcript/session monitor, Gateway health, generic completion calls, usage/cost snapshots, and rate-limit/liveness probes.

Without that boundary, replacing OpenClaw Gateway with another framework requires auditing scattered Nova/Buster files for raw tool names and response-shape assumptions. It also risks drift where Nova and Buster observe or classify the same session condition differently because the low-level Gateway operation is not a shared contract.

### Impact

Framework portability remains weaker than the current common-agent module layout suggests. A future swap to another agent framework, or to a self-hosted agent runner, would require changes under the intended common boundary. Observability behavior can also drift between Nova and Buster for gateway status, session liveness, rate-limit recovery, and cost/usage snapshots.


### Resolution

Resolved by introducing typed common Gateway operation wrappers (`getGatewaySessionStatus`, `spawnGatewaySession`, `sendGatewaySessionMessage`, `killGatewaySubagent`, `listGatewaySubagents`, `completeGatewayPrompt`, `checkGatewayHealth`) and migrating Nova/Buster/common agent callers off raw `gatewayInvoke`. `tests/verification/contracts/check-gateway-operation-boundary-surface.mjs` now rejects raw `gatewayInvoke` imports/uses under the common Gateway owner and repo-local facades.

### Verification

- `tests/verification/contracts/check-gateway-operation-boundary-surface.mjs`
- `tests/verification/lib/run-contract-suite.sh`
- `node tests/verification/behavior/verify.mjs --source-root .`

### Links / files

- Current canonical common agent boundary: `skills/common/pipeline/agents/`
- Current raw Gateway integration: `skills/common/pipeline/integrations/gateway.ts`
- Implementation-map tracker: `docs/pipeline/implementation-map/reviews/open-issues-table.md`
