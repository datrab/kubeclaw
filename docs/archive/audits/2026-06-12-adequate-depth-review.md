# Adequate Depth Review - 2026-06-12

Source of truth for this pass:

- `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`
- `docs/archive/audits/2026-06-12-documentation-topic-map.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`

Status: executed in the adequate-depth execution pass recorded in `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`.

This review applies a stricter rule than the prior `P1 + shallow = 0` pass. An `adequate` rating is acceptable only when the page is intentionally limited:

- intentionally an index/router
- generated wrapper or static generated artifact
- historical/planning context
- narrow reference/template
- simple example landing page

If an `adequate` page is operator-facing, developer-facing, or otherwise actionable, it should be upgraded to `rich` unless it clearly fits one of those limited categories.

## Summary

- Adequate rows reviewed: 71
- Keep as adequate with explicit rationale: 32
- Upgrade to rich: 39

## Upgrade to rich

These pages are currently `adequate`, but they are operator/developer/actionable or entry-path docs. They should become `rich` before the docs are considered fully complete.

| Doc path | Why adequate is not enough | Rich upgrade should add |
| --- | --- | --- |
| `docs/CONTRIBUTING.md` | Developer-facing contribution flow. | Source-backed setup/test commands, expected outputs, failure signals, and ownership boundaries. |
| `docs/DOCUMENTATION_HANDOFF_PROMPT.md` | Actionable maintainer handoff prompt. | Current audit authority, exact commands, expected artifacts, and stale-prompt failure signals. |
| `docs/README.md` | Primary documentation entry point, not just a maintainer note. | Source-of-truth map, first-reader routes, verification commands, generated artifact expectations, and known limitations. |
| `docs/architecture/data-flow.md` | Architecture page used by developers/operators to reason about runtime behavior. | Runtime owners, concrete inputs/outputs, state artifacts, failure paths, and verification commands. |
| `docs/architecture/runtime-topology.md` | Operator/developer topology page. | Deployment owners, network/runtime boundaries, live vs repo-proven claims, commands, and troubleshooting signals. |
| `docs/concepts/intent-driven-pipeline.md` | Core concept page for the pipeline. | Source-backed pipeline flow, config inputs, state outputs, terminal decisions, failure modes, and extension boundaries. |
| `docs/deployment/ci-and-image-publishing.md` | Operator CI/image procedure. | Workflow triggers, image tags/artifacts, local reproduction, failure signatures, and the base-image pinning limitation. |
| `docs/deployment/deployment-verification.md` | Operator verification procedure. | Exact commands, expected output, source owners, artifacts, common failures, and recovery steps. |
| `docs/deployment/helm-chart.md` | Operator deployment reference. | Chart value owners, rendered manifests, env/config wiring, verification commands, and failed-render signals. |
| `docs/deployment/litellm.md` | Operator deployment procedure. | LiteLLM config keys, Secret names, service/port expectations, deployment commands, and failure checks. |
| `docs/deployment/model-provider-prerequisites.md` | Operator prerequisite checklist. | Provider boundary, required keys, Kubernetes Secret wiring, validation commands, and external-account failure modes. |
| `docs/deployment/networking.md` | Operator networking procedure/reference. | NetworkPolicy source, ingress/egress behavior, verification commands, live CNI limitation, and troubleshooting checks. |
| `docs/deployment/rbac-and-sandbox.md` | Operator security/RBAC procedure. | ServiceAccount/Role owners, sandbox permissions, `kubectl auth can-i` checks, and failure/recovery guidance. |
| `docs/deployment/tailscale-operator.md` | Operator deployment procedure. | OAuth Secret keys, values file ownership, install/verify commands, expected resources, and common failure signals. |
| `docs/developers/adding-buster-suites.md` | Developer extension procedure. | Suite contract, config inputs, output verdicts, tests, runtime failure modes, and extension invariants. |
| `docs/developers/adding-gates.md` | Developer extension procedure. | Gate runner contracts, terminal decision handling, telemetry/status artifacts, tests, and failure-mode examples. |
| `docs/developers/adding-observability-sinks.md` | Developer extension procedure. | Sink contract, config keys, dispatch flow, fallback behavior, verification commands, and failure isolation rules. |
| `docs/developers/adding-verification.md` | Developer procedure. | Worked example for a new behavior/contract area, command wiring, expected outputs, and CI/local boundaries. |
| `docs/developers/codebase-tour.md` | Developer entry page. | Source-owned module map, runtime ownership, common edit paths, verification routes, and stale-tour signals. |
| `docs/developers/linting-rules.md` | Developer reference for lint behavior. | Tool owners, rule inputs/outputs, command examples, expected diagnostics, and failure interpretation. |
| `docs/developers/replacing-agent-runtime.md` | Developer migration procedure. | Runtime contract, config keys, integration points, verification commands, rollback/failure modes, and invariants. |
| `docs/developers/testing-and-ci.md` | Developer verification procedure. | Local vs CI command map, expected artifacts, failure triage, workflow ownership, and check expansion rules. |
| `docs/examples/progress-json/README.md` | Operator/developer example landing page. | What each example proves, when to use it, expected interpretation, failure cases, and verification commands. |
| `docs/examples/secrets/placeholder-secrets.md` | Operator/developer example with security implications. | Secret placeholders, safe/unsafe usage, setup commands, expected Kubernetes objects, and failure checks. |
| `docs/getting-started/first-deployment.md` | Operator first-run procedure. | Prerequisites, commands, expected artifacts/resources, failure signals, verification, and cleanup/next steps. |
| `docs/operators/common-failures.md` | Operator troubleshooting page. | Symptom/check/recovery blocks per failure, source owners, commands, expected outputs, and escalation boundaries. |
| `docs/operators/debugging.md` | Operator debugging procedure. | Log/state/Redis/Kubernetes checks, expected artifacts, failure interpretation, and recovery decision points. |
| `docs/operators/install-and-upgrade.md` | Operator install/upgrade procedure. | Upgrade steps, values/Secret handling, verification commands, rollback limits, and failure signals. |
| `docs/operators/maintenance.md` | Operator maintenance procedure. | Storage/log/secret cleanup procedures, commands, destructive-action safeguards, expected artifacts, and open automation gaps. |
| `docs/operators/running-the-platform.md` | Operator runbook. | Runtime checks, steady-state signals, command map, failure triage, and source-backed operational boundaries. |
| `docs/pipeline/architecture.md` | Pipeline architecture page. | Stage ownership, config inputs, status/artifact outputs, terminal decisions, tests, and extension invariants. |
| `docs/reference/buster-task-config.md` | Operator/developer reference with runtime contract impact. | Field schema, validation rules, examples, task lifecycle outputs, tests, and failure signatures. |
| `docs/reference/cli.md` | Operator/developer command reference. | Complete command surface, env vars, expected output/artifacts, failure exits, and verification links. |
| `docs/reference/exit-codes.md` | Operator/developer troubleshooting reference. | Exit/status authority, command examples, terminal status mapping, tests, and failure interpretation. |
| `docs/reference/helm-values.md` | Operator/developer deployment reference. | Values ownership, generated/manual boundary, rendered outputs, failure signals, and verification commands. |
| `docs/reference/linting-rules.md` | Developer reference with quality-gate impact. | Rule owners, rule inputs/outputs, diagnostics, examples, and verification tests. |
| `docs/reference/redis-streams.md` | Operator/developer runtime reference. | Stream names, producers/consumers, commands, expected entries, failure/dead-letter behavior, and tests. |
| `docs/reference/secrets.md` | Operator/developer security reference. | Secret names/keys, generation modes, overwrite rules, verification commands, and failure/recovery guidance. |
| `docs/reference/status-and-artifacts.md` | Operator/developer runtime reference. | Status state contract, artifact paths, read models, terminal semantics, weak evidence, and verification commands. |

## Keep as adequate

These rows can remain `adequate` if the coverage matrix records the rationale explicitly. They are not the place to duplicate full operator/developer procedures.

| Doc path | Accepted reason | Why adequate is appropriate |
| --- | --- | --- |
| `docs/DOCUMENTATION_AUDIT.md` | Historical context | Preserves an older audit and points to the current 2026-06-12 audit artifacts. |
| `docs/DOCUMENTATION_REBUILD_PLAN.md` | Historical context | Keeps the older rebuild plan as background while current work is tracked in the matrix/topic map/changelog. |
| `docs/DOCUMENTATION_TARGET_PAGE_LIST.md` | Historical context | Retains the old target list, but should not be used as the current missing-page inventory. |
| `docs/ROADMAP.md` | Historical/planning context | Records roadmap themes and audit pointers, not current runtime behavior or an operator procedure. |
| `docs/future-implementation-ideas.md` | Historical/planning context | Captures non-promised future work; promoting it to rich would imply implemented behavior that is not repo-proven. |
| `docs/decisions/README.md` | Intentionally an index/router | Routes to decision pages and names decision areas; detailed evidence belongs in the linked pages. |
| `docs/decisions/architecture-decisions.md` | Narrow reference | Summarizes architecture decisions without replacing full ADRs or implementation manuals. |
| `docs/developers/templates/architecture-page.md` | Narrow reference/template | Template skeleton for authors; it should encode required sections, not become a completed architecture page. |
| `docs/developers/templates/deployment-component.md` | Narrow reference/template | Template skeleton for deployment docs; richness belongs in pages created from it. |
| `docs/developers/templates/operator-task.md` | Narrow reference/template | Template skeleton for operator tasks; it should remain concise and reusable. |
| `docs/developers/templates/reference-page.md` | Narrow reference/template | Template skeleton for reference pages; it should define structure rather than duplicate reference content. |
| `docs/developers/templates/runbook.md` | Narrow reference/template | Template skeleton for runbooks; operational detail belongs in concrete runbooks. |
| `docs/developers/templates/troubleshooting-entry.md` | Narrow reference/template | Template skeleton for troubleshooting entries; symptom-specific detail belongs in filled entries. |
| `docs/diagrams/README.md` | Intentionally an index/router | Visual index that routes to static diagram assets and their related docs. |
| `docs/diagrams/buster-worker-flow.svg` | Generated/static visual artifact | SVG asset; source-backed explanation should live in adjacent markdown pages. |
| `docs/diagrams/deployment-topology.svg` | Generated/static visual artifact | SVG asset; do not inflate the asset file into prose documentation. |
| `docs/diagrams/failure-recovery-decision-flow.svg` | Generated/static visual artifact | SVG asset; prose belongs in failure/recovery docs. |
| `docs/diagrams/final-preview-tailscale-flow.svg` | Generated/static visual artifact | SVG asset; prose belongs in Tailscale/deployment docs. |
| `docs/diagrams/infrastructure-dependencies.svg` | Generated/static visual artifact | SVG asset; prose belongs in topology/deployment docs. |
| `docs/diagrams/pipeline-runtime-flow.svg` | Generated/static visual artifact | SVG asset; prose belongs in pipeline runtime docs. |
| `docs/diagrams/secret-flow.svg` | Generated/static visual artifact | SVG asset; prose belongs in secrets/security docs. |
| `docs/examples/progress-json/end-to-end.json` | Generated/static example artifact | JSON fixture/example; interpretation belongs in the README and reference pages. |
| `docs/examples/progress-json/failed.json` | Generated/static example artifact | JSON fixture/example; interpretation belongs in the README and failure docs. |
| `docs/examples/progress-json/in-progress.json` | Generated/static example artifact | JSON fixture/example; interpretation belongs in the README and lifecycle docs. |
| `docs/examples/progress-json/partial-artifacts.json` | Generated/static example artifact | JSON fixture/example; interpretation belongs in the README and artifact docs. |
| `docs/examples/progress-json/success.json` | Generated/static example artifact | JSON fixture/example; interpretation belongs in the README and status docs. |
| `docs/examples/swarm-config/local-dev.json` | Generated/static example artifact | JSON config example; usage and verification belong in the swarm-config example README/reference. |
| `docs/examples/swarm-config/staging-like.json` | Generated/static example artifact | JSON config example; usage and verification belong in the swarm-config example README/reference. |
| `docs/generated/inventory/deploy-script.json` | Generated wrapper/artifact | Machine-readable inventory artifact; source and interpretation belong in generated inventory docs. |
| `docs/generated/inventory/helm-values.json` | Generated wrapper/artifact | Machine-readable inventory artifact; source and interpretation belong in generated inventory docs. |
| `docs/generated/inventory/secret-setup.json` | Generated wrapper/artifact | Machine-readable inventory artifact; source and interpretation belong in generated inventory docs. |
| `docs/generated/reference/README.md` | Generated wrapper | Explains first-slice generated reference support; deeper generated references should be added as generator coverage expands. |

## Follow-up actions

1. Done: the coverage matrix now records an accepted reason for each remaining `adequate` row.
2. Done: the 39 listed pages are now rated `rich`.
3. Done for the execution pass: verification results are recorded in the enrichment changelog.
4. Future work: expand generated inventory/schema coverage, live CNI proof, live observer proof, backup/restore automation, and additional worked extension examples when source behavior exists.
