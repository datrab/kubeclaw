# AP05 documentation gap and writing plan

Status: AP05 complete; AP06 completed W04–W06; AP07 completed W01–W03 and W07; AP08 is next
Date: 2026-09-15
Branch: `docs/documentation-overhaul`, PR #13
Assessment revision: `9dab0a1365a367bb2668298d50802a76bd147d91`

This plan compares the AP03 content review and AP04 authorities with the current
repository and the reader tasks in the AP02 blueprint. It assigns every discovered
product surface to one canonical documentation destination and converts each missing
reader outcome into a bounded writing package. A destination is an assignment, not a
claim that the page is already complete.

AP05 did not change product behavior or execute a live environment. Product defects
remain in the [open issue register](../site/status/open-issues.md), and environment
proof remains in the [live acceptance plan](../site/status/acceptance.md).

## Method and result

The comparison used these independent inputs:

- 2,887 content-reviewed AP03 records and their concrete extraction destinations;
- the 51 plugin manifests from AP01: 48 pipeline plugins, two OpenClaw extensions,
  and one Codex plugin;
- all declared npm workspaces, seven versioned contract families, three runtime-role
  manifests, four Helm charts, deployment values, scripts, workflows and tests;
- the 16 current implementation follow-ups, 15 live gate groups and extracted
  decisions from AP04;
- the U1–U4, O1–O5, E1–E6, R1, S1 and D1 reader outcomes from AP02.

The result is 12 writing packages: three P0, seven P1 and two P2. Every AP02 reader
outcome is either already owned by an AP04 authority or assigned to one of these
packages. No chapter heading counts as coverage. Each package below has a required
reader result and evidence boundary.

## Priority and gap types

| Priority | Meaning in this plan |
| --- | --- |
| P0 | Incorrect or absent instructions can cause data loss, loss of access, unsafe exposure, an unrecoverable upgrade or use of the wrong authority. |
| P1 | A core understand, operate or extend task cannot be completed from the product pages. |
| P2 | The task is possible only by searching scattered sources, or explanation, navigation and maintenance ownership are insufficient. |

Each record has one of three types:

- **DOC**: writing, navigation, example or reference work authorized by this PR.
- **IMP**: implementation behavior is incomplete or disputed. Documentation must
  explain the limit and link the canonical issue; prose cannot close it.
- **LIVE**: the implementation may have local evidence, but a target-environment or
  human exercise is still required. The live gate remains open after documentation is
  written.

## Canonical destination map

AP03 showed that the AP02 chapter model is sound, but its planned destinations were
not concrete enough for migration. AP05 keeps the three entrances and assigns stable
files. It combines quick starts with their parent task and avoids separate pages for
Nova, Buster and Prism when one lifecycle explanation can state their differences.

| ID | Canonical destination | Owner role | Required source families |
| --- | --- | --- | --- |
| U1 | `docs/site/understand/README.md` | documentation + product architecture | root README, current capabilities, S1 limits, one representative project |
| U2 | planned route `understand/components-and-authority` | product architecture | role manifests, package ownership, Nova/Buster/Prism, Foundation/SDK, Worker Core, Forge and Echo |
| U3 | planned route `understand/request-state-recovery` | Nova/Core maintainers | project compiler, lifecycle, effects, state, stores, approval, repair, dispatch and result import |
| U4 | planned route `understand/deployment-and-trust` | platform + runtime maintainers | charts, identities, network policy, isolation, storage and observability flows |
| O1 | planned route `use/install` | platform operators | prerequisites, values, bootstrap, GitOps, access and first verification |
| O2 | planned route `use/operate` | product operators | projects, roles, plugins, approvals, cancellation, Prism and demo access |
| O3 | planned route `use/diagnose` | product + platform operators | health, events, metrics, queues, stores, logs and symptom paths |
| O4 | `docs/site/use/recovery.md` | platform operators | persistent-state inventory, backup groups, restore, access recovery and proof |
| O5 | planned route `use/maintenance` | platform + release maintainers | version authority, promotion, upgrade, rollback limits, rotation, retention and retirement |
| E1 | `docs/site/extend/README.md` | extension maintainers | supported customization choices, setup and first check |
| E2 | planned route `extend/pipeline-plugin` | plugin-runtime maintainers | minimal plugin from package creation through activation and observed output |
| E3 | planned route `extend/contracts` | Foundation/SDK maintainers | five registrations, lifecycle, state/effects, waits, retries and cleanup |
| E4 | planned route `extend/host-and-engine` | Worker Core + host integration maintainers | worker engine, runtime roles, OpenClaw extensions and Codex plugin |
| E5 | `docs/site/extend/testing.md` | extension + quality maintainers | test levels, failure injection, debugging and replace/remove lifecycle |
| E6 | `docs/site/extend/plugin-catalogue/README.md` and one page per package | owning plugin maintainers | generated manifest facts plus authored purpose, examples, limits and checks |
| R1 | planned route `reference/README` with focused generated/authored children | owning component maintainers | commands, configuration, contracts, capabilities, telemetry and compatibility |
| S1 | `docs/site/status/current.md`, `open-issues.md`, `acceptance.md` | platform maintainers | AP04 issue authority, closure provenance and live gates |
| D1 | `docs/site/decisions/README.md` and topic records | architecture maintainers | AP04 decision authority and supersession links |

`quickstart.md`, `first-plugin.md`, and the two worker-trust pages are migration
inputs. AP06–AP08 must either merge their useful content into the destinations above
or retain them only when the task has distinct prerequisites. AP09 owns redirects and
publication routes. This refinement does not add a fourth entrance or a second status
authority.

## Component and contract coverage

The following groups cover the repository's executable components. A group is used
only where its members share responsibility and documentation acceptance. The named
destinations must enumerate their individual public exports or workloads during
writing.

| Component group | Members and public boundary | Destinations | Gap |
| --- | --- | --- | --- |
| Nova orchestration | `skills/nova`, `skills/nova/core`, project compiler/CLI, lifecycle, state, effects, waits, repair and remote gates | U2, U3, O2, O3, R1 | P1 DOC: no connected successful/interrupted request trace or complete command reference |
| Plugin Foundation and SDK | registry, packages, activation, capabilities, isolation, Foundation and SDK workspaces | U2, U4, E1–E3, E5, R1 | P1 DOC: no clean-checkout package-to-activation path across all lifecycle boundaries |
| Worker Core | `skills/worker/core` and `pipeline-worker-core/v1`, attempt ownership, resources, progress, cancellation and results | U2–U4, E4, R1, S1 | P1 DOC plus linked IMP limits: no complete minimal engine journey; incomplete native/Buster integration remains visible |
| Buster | Buster role, runtime and engine; test-plan service, providers, report adapters, evidence import and fixtures | U2, U3, O2, O3, E3–E5, R1 | P1 DOC: scattered engine/provider procedures and no single authority/failure explanation |
| Prism | Prism contract, role, chart, control, server, agent bridge, worker, ingestion, corpus, storage, preferences, domain, renderer, studio and pipeline adapter | U2–U4, O2–O5, E4, R1, S1 | P0/P1 DOC: operation, persistence and recovery are fragmented; unresolved retrieval/preference and live limits must remain explicit |
| Forge and Echo | implementation-agent dispatch, review/Echo policy, evidence reduction and reports | U2, U3, O2, O3, D1 | P1 DOC: specialist proposal, deterministic policy and Core authority are not explained as one handoff |
| Observability and delivery | agent-observability, pipeline-observability and telemetry contracts; observer, transport and telemetry plugins | U3, U4, O3, E3, R1 | P1 DOC: identity, durability, gaps, backpressure and recovery are split across historical reports |
| Delivery and quality contracts | delivery-manifest/v3 and pipeline-test-gate/v1 | U3, O2, O3, E3, E5, R1 | P1 DOC: cumulative gate and report/provider semantics lack one current reference |
| Deployment controllers and workloads | KubeClaw, Prism, GitOps and Ops Pod charts; namespace controller, Archviewer, role workloads and services | U4, O1–O5, R1 | P0 DOC: effective topology, access, dependency order and stop/rollback points are incomplete |

The seven versioned contract families are therefore assigned: agent observability,
delivery manifest, pipeline observability, pipeline test gate, pipeline Worker Core,
Prism and telemetry. Contract reference generation belongs to R1; explanations and
examples remain authored in U3/E3/E4.

## Public interfaces and configuration coverage

| Surface | Included interfaces or source groups | Canonical documentation | Gap/priority |
| --- | --- | --- | --- |
| Operator commands | deployment scripts, Nova Core CLI, project CLI, remote-gate CLI, status/generation commands | O1–O5 and R1 command index | P0/P1 DOC: execution location, authority, outputs and rollback are inconsistent |
| HTTP/service APIs | Nova/Buster remote plan, Prism control/worker/agent/ingestion/studio, demo-ready and internal artifact paths | U3, O2–O3, E4 and R1 contracts | P1 DOC: caller identity, timeout, idempotence and error semantics are incomplete |
| Kubernetes APIs | Helm values, rendered workloads/RBAC/network policy, namespace lease CRD, admission policy and Argo Applications | U4, O1, O4–O5, R1 | P0 DOC: prerequisites, ownership, effective values and recovery access need one safe procedure |
| Plugin manifests | `plugin.json`, OpenClaw manifests, Codex plugin manifest, grants and role inclusion | E1–E6 and R1 | P1 DOC: three plugin kinds are not yet explained with separate activation/removal paths |
| Runtime composition | Nova, Buster and Prism role JSON plus package ownership | U2, U4, E4 and generated R1 table | P1 DOC: inclusion is confused with activation and live usability in old pages |
| Version/release inputs | `versions.json`, image digests, chart/app revisions, action pins and promotion workflows | O1, O5 and R1 compatibility | P0 DOC: authoritative version set and rollback boundary are not available as one task |
| Deployment values | chart defaults and `my-values` for Nova, Buster, Prism, Ops, GitOps, networking, stores and monitoring | O1–O5 and generated R1 configuration | P0 DOC: public placeholders, private values, precedence and effective-value checks are incomplete |
| Project and pipeline configuration | project source/compiler, module graph, providers, grants, optional stages and demo configuration | O2, E1, E3 and R1 schemas | P1 DOC: supported edit, validate, activate, reverse and resume effects are fragmented |
| Quality configuration | lint policies, provider/report settings, baselines and migration manifests | O2–O3, E5 and R1 | P1/P2 DOC: defaults, empty/skipped behavior and failure disposition need consolidation |
| Secrets and identity | Kubernetes Secrets, SPIFFE/SPIRE, service accounts, Tailscale, registry, database and model credentials | U4, O1, O4–O5 and R1 secret names | P0 DOC: supply/rotate/recover procedures and private/public separation are incomplete |

Public reference pages must generate exhaustive fields from source. They must not
publish the private values in `my-values`. Authored task pages use placeholders and
show how the operator verifies the effective result.

### Inventory-backed interface assignment

The current generators provide an exact lower bound, not a complete interface
catalogue. AP05 assigns each generated set and each declared residual set so that a
coarse family row cannot be mistaken for exhaustive coverage.

| Inventory or residual set | Verified current scope | Writing owner |
| --- | --- | --- |
| Deployment command inventory | 16 command cases from `scripts/deploy.sh`, including source anchors, flags, environment and defaults | W01, W03, W07 and the W12 command reference |
| Helm/value inventory | 14 chart, role and infrastructure value sources tracked by the current generator | W01–W03 and the W12 configuration reference |
| Secret setup inventory | 11 environment inputs and 10 Secret records from the setup source | W01–W03 and the W12 secret reference |
| Workflow inventory | 13 GitHub workflows with triggers, jobs and command references | W03, W09 and the W12 workflow/verification reference |
| Plugin-system inventory | 49 package roots, 48 pipeline packages and 67 registrations: 21 stages, five observers, 21 adapters, 19 test providers and one report adapter | W08–W11 and the W12 contract/capability reference |
| Runtime and contract declarations | three role manifests, four charts and seven versioned contract families | W04–W06, W10 and W12 |
| CLI surfaces outside the deployment inventory | Nova Core CLI, project/compiler CLI, project scaffold CLI and remote test-gate CLI | W05, W07–W10 and W12; AP06–AP09 must enumerate commands and flags from source |
| Service/API surfaces outside generated inventory | Nova/Buster remote plan and Prism control, worker, agent bridge, ingestion, Studio, artifact and product-authority handlers | W05–W07, W10 and W12; enumerate routes, caller identity, schemas, errors and timeouts during writing |
| Configuration outside generated inventory | project/compiler inputs, OpenClaw and swarm configuration, role bundles, telemetry/events, Redis/status/artifact paths, Buster suite/provider/report and lint policies | W05, W07–W10 and W12; generate facts where stable and keep task explanations authored |
| Kubernetes surfaces outside value inventory | rendered workloads/services, RBAC, network policy, namespace lease CRD, admission policy and Argo Applications | W01–W03, W06–W07 and W12; enumerate resource ownership and effective behavior from rendered output |

The existing generated inventory explicitly calls itself a first slice. Therefore
AP05 does not call its current reference pages complete. W12 must close the residual
sets or retain an itemized gap; AP11 must reject a generic “covered by reference”
claim without that enumeration.

## Plugin and extension coverage

| Kind | Inventoried scope | Required destination and acceptance | Gap |
| --- | --- | --- | --- |
| Pipeline plugins | 48 manifests: stages, observers, capability adapters, test providers and report adapters | E2 covers creation; E3 covers every registration contract; E5 covers lifecycle; all 48 retain an E6 catalogue page | P1: no complete clean-checkout activation example and no stateful/effectful interrupted example |
| OpenClaw extensions | `kubeclaw-agent-observer` and `kubeclaw-prism` | E4 gives separate manifest, loading, grants, verification, upgrade and removal paths; E6 retains both entries | P1: inventory exists, but authoring and operational lifecycle are incomplete |
| Codex plugin | `kubeclaw-ops` | E4 explains plugin/skill structure, installation context, permission boundary, verification and removal; R1 links its commands | P1: the only manifest lacks an E6 catalogue entry and a complete supported lifecycle guide |
| Worker engines | neutral Worker Core plus Buster and Prism engine meanings | E4 builds one minimal engine through package/role inclusion, submit, progress, result and cancel; S1 identifies unsupported steps | P1 with IMP boundary: no documented verified end-to-end authoring journey |
| Configuration-only extension | project graph, provider/grant selection, role bundles and chart values | E1 and O2 show minimal change, validation, effective result, restart/resume effect and reversal | P1: currently distributed across schemas, skills and operator notes |

The 50 existing catalogue pages cover packages below `skills/`. AP08 must add the
Codex plugin entry and audit authored purpose, operation and examples for all entries.
Generated counts and manifests remain factual inputs; they cannot overwrite authored
guidance.

## Operational dependency coverage

| Dependency or state family | Canonical destinations | Required reader outcome | Priority/type |
| --- | --- | --- | --- |
| Kubernetes/K3s, Argo CD and GitOps | U4, O1, O3–O5 | install in dependency order, inspect reconciliation, recover independent access and roll back a revision | P0 DOC; G01/G02 LIVE |
| Cilium, network policy, DNS and Tailscale | U4, O1, O3–O5 | verify permitted/denied paths, avoid lockout, diagnose CNI/Tailnet failure and recover access | P0 DOC; linked IMP and G12 LIVE |
| SPIRE/SPIFFE, service accounts and secrets | U4, O1, O3–O5 | establish identity, verify authorization, rotate and recover without depending on the failed access path | P0 DOC; G03/G11 LIVE |
| Registry, mirror and BuildKit | O1, O3, O5 | verify push/pull identity, storage/capacity, scanner freshness, GC and failed promotion behavior | P0 DOC; linked IMP and G09 LIVE |
| PostgreSQL, LiteLLM PostgreSQL, Qdrant and Redis | U4, O3–O5 | identify owners/data, monitor health, take consistent backups, restore, migrate and verify application data | P0 DOC; G05/G06/G07 LIVE |
| Journals, queues, caches, artifacts, workspaces and PVCs | U3–U4, O3–O5 | distinguish durable authority from rebuildable data, handle growth/corruption and restore consistent references | P0/P1 DOC; linked IMP and G04/G08 LIVE |
| Model providers and LiteLLM routing | O1–O3, R1 | supply credentials/configuration, verify selected route and distinguish provider failure from pipeline failure | P1 DOC; G10/G14 LIVE |
| Prometheus, Grafana, Alloy and ClawDeck sinks | U4, O3, O5 | observe health/gaps/backpressure, retain evidence and manage capacity without treating logs as lifecycle authority | P1 DOC; linked IMP and G13 LIVE |
| Git, GitHub and CI workflows | O3, O5, E5, R1 | understand source/release identity, reproduce checks and separate a flaky/pre-existing failure from an affected gate | P1 DOC |
| Ops Pod, OpenClaw and Codex | U4, O1–O3, E4 | use the supported access/host boundary, pair/verify it and recover when that path fails | P0 DOC; G02 LIVE |

Deployment-specific schedules, owners, capacity thresholds, recovery time and recovery
point objectives stay explicitly undecided unless current source or live evidence
establishes them.

## Reader-task gap matrix

| ID | Current usable coverage | Missing result | Writing package |
| --- | --- | --- | --- |
| U1 | partial overview and quick start | one accurate request-to-result example with terms and limits | W04 |
| U2 | scattered architecture and extracted decisions | connected authority/component model including roles, engines and specialists | W04 |
| U3 | historical lifecycle reports and a short current page | success, uncertain effect, failure, cancellation, repair and resume trace | W05 |
| U4 | trust page plus many infrastructure sources | complete deployment/data/identity/observability boundary and failure domains | W06 |
| O1 | partial quick start and component runbooks | portable prerequisites, dependency order, access, values and failed-first-install recovery | W01 |
| O2 | pipeline and Prism fragments | complete configure/start/inspect/approve/resume/cancel/results tasks | W07 |
| O3 | component-specific troubleshooting | symptom index with observable distinctions and evidence retention | W07 |
| O4 | partial recovery page and historical proofs | complete data inventory, consistent backup, restore, lost-access path and validation | W02 |
| O5 | version/image source documents | coordinated upgrade, irreversible point, rollback, rotation, retention and retirement | W03 |
| E1 | short Extend index | supported-choice guide and configuration-only extension | W08 |
| E2 | incomplete first-plugin page | clean checkout to built, registered, activated and observed plugin, plus intentional failure | W08 |
| E3 | schemas and phase reports | five surfaces and stateful/effectful interruption/replay/cleanup example | W09 |
| E4 | host manifests and Worker sources | separate OpenClaw/Codex lifecycle and minimal worker-engine journey | W10 |
| E5 | partial testing page | test levels, failure injection, debug, update/replace/disable/remove and compatibility | W09/W10 |
| E6 | 50 generated/package pages | authored audit for 50 pages plus missing Codex entry | W11 |
| R1 | capabilities only | command, config, contract, role, telemetry and compatibility references | W12 |
| S1 | AP04 authority complete | publication/navigation integration only; do not duplicate status | W12 |
| D1 | AP04 authority complete | link decisions beside mechanisms and preserve unknown rationale | W04–W10 |

## Authorized writing packages

### W01 — Safe installation and independent access (P0, AP07)

Write O1 from a portable public configuration. Cover topology, capacity, storage,
network/DNS, identity, secrets, dependency order, effective values, Ops Pod access and
first verification. Include a failed-first-install diagnosis and an independent
recovery path. The reader must identify every placeholder and stop before destructive
or lockout-prone actions. Link incomplete behavior and G01–G03 rather than inventing a
successful target deployment.

### W02 — Data protection and restore (P0, AP07)

Write O4 with a state inventory and consistent groups for databases, queues, journals,
artifacts, workspaces, keys and PVCs. Cover routine backup ownership/detection,
destination independence, integrity, single-service and whole-environment restore,
application verification and access recovery. State unknown schedules/RPO/RTO. The
reader must be able to identify the exact point blocked by an implementation issue or
unexecuted G04–G08 gate.

### W03 — Upgrade, security and retirement (P0, AP07)

Write O5 around the central version set, compatible chart/image/config/data revisions,
promotion, scanning, migration order, irreversible points, rollback, credential and
certificate rotation, capacity/retention and decommission. Include registry/BuildKit,
databases and GitOps. The reader must retain recovery evidence and must not use an old
image or DB rollback after an incompatible migration. Keep G09, G11 and G13 open.

### W04 — Overview, components and authority (P1, AP06)

Rewrite U1/U2. Start with one representative request and define Nova, Foundation/SDK,
Worker Core, Buster, Prism, Forge, Echo, runtime role, engine, specialist and each
plugin kind. Explain ownership and reasons from D1; label unknown rationale. The
reader must explain who can change lifecycle state and distinguish packaging,
activation, local verification and live acceptance.

### W05 — Request, state and recovery architecture (P1, AP06)

Write U3 with connected normal, failure and interruption traces. Show project compile,
stage dispatch, effects, stores, artifacts, waits, approval, repair budgets, test
dispatch, result import, cancellation, resume and terminal closure. Each handoff names
identity, durable state, timeout/retry stop and evidence. Verify claims against current
source and tests without turning old test results into a fresh run.

### W06 — Deployment and trust architecture (P1, AP06)

Write U4. Map processes/pods, roles, identities, grants, network, storage,
observability and failure domains, including infrastructure dependency order. Explain
why capability grants, isolation, role bundles and independent access exist. Link the
P0 procedures and S1 limitations. A diagram requires a textual equivalent.

### W07 — Daily operation and diagnosis (P1, AP07)

Write O2/O3 for projects, roles, plugin/provider selection, start, inspect, approve,
resume, cancel, results, Prism, demo access, health, queues, storage and observability.
Provide a symptom-to-check index for hangs, lost responses, conflicts, failed gates,
uncertain effects and delivery gaps. Each procedure includes prerequisites, expected
observations, safe retry/reconciliation distinction, cleanup and retained evidence.

### W08 — Choose and build a pipeline plugin (P1, AP08)

Write E1/E2. From a clean checkout, choose configuration versus extension, create a
minimal pipeline plugin, define manifest/package/registration/configuration/grants,
build, test, activate and observe it. Add one intentional failure and reversal. Do not
claim support for a surface that the current contracts do not expose.

### W09 — Extension contracts and reliability (P1, AP08)

Write E3 and the shared E5 lifecycle. Cover stages, observers, capability adapters,
test providers and report adapters with input/output, authority and errors. Build one
practical stateful or effectful example and exercise duplicate input, interruption,
retry, cancellation, resume and cleanup to the supported scope.

### W10 — Host plugins and worker engines (P1, AP08)

Write E4 and the host/engine-specific E5 sections. Separate OpenClaw and Codex
manifests, activation, permissions, verification and removal. Document one minimal
Worker Core engine through implementation, package/role inclusion, submission,
progress, result import and cancellation. Where full integration is incomplete, stop
at the exact blocked step and link S1.

### W11 — Catalogue completion (P2, AP08/AP09)

Audit all 50 existing catalogue pages and add `kubeclaw-ops`. Each entry retains
generated identity/contracts and authored purpose, one use case, configuration,
operation, limitations, source and actual checks. Link to the correct extension type.
An inventory row alone cannot pass this package.

### W12 — Reference, navigation and maintenance map (P2, AP09)

Create the R1 index and focused command, configuration, contract, role, telemetry,
compatibility and glossary children. Generate exhaustive facts; keep explanations
authored. Integrate U/O/E, S1 and D1 into publication/navigation, redirects and source
dependencies. The published build and repository view must resolve the same revision.
This package also replaces stale AP02 generator assumptions and records the owner role
and verification command for every canonical page.

## Separate implementation and live work

AP05 creates no second issue list. The 13 incomplete original findings and three
additional follow-ups remain the sole current IMP authority in
`docs/site/status/open-issues.json`. Writing packages must link the relevant entry at
the first blocked step. A documentation package can finish when it accurately explains
that limitation; it cannot mark the implementation complete.

G01–G15 in `docs/site/status/acceptance.md` remain the sole LIVE plan. AP06–AP09 may
improve prerequisites and links, but only recorded execution in the required
environment can close a gate. ASD-STE100 review and independent reader exercises also
remain AP11 gates.

## Verification performed

| Check | Result and boundary |
| --- | --- |
| AP05 structural audit | Passed: all 18 U/O/E/R/S/D reader outcomes and W01–W12 are present. Priorities resolve to three P0, seven P1 and two P2. The inventory contains exactly 51 plugin manifests split 48 pipeline, two OpenClaw and one Codex. |
| Interface-inventory audit | Passed for the declared lower bound: 16 deploy command cases, 14 Helm/value sources, 11 secret environment inputs, 10 Secret records, 13 workflows, 49 plugin roots and 67 registrations. The generator's own residual list was compared with current CLI/service sources and assigned above; it remains work for W12, not a false exhaustive-reference claim. |
| `npm run docs:check:refs` | Passed after the reference repair: 1,583 local links and 791 repository-path references resolve. Planned AP06–AP09 destinations use explicit future routes and do not masquerade as existing files. |
| `git diff --check origin/main` | Passed after normalizing the four AP01 TSV inventories, supplying `unchanged` instead of an empty trailing field, and removing Markdown trailing whitespace. |
| Status authority | All 13 status-generator tests passed with no skip; the generated open-issue view matches its JSON source. |
| Generated facts and topic coverage | Plugin-system inventory, documentation inventory, generated references and current topic-map coverage checks passed. |
| Aggregate blueprint check | Still stops at the previously recorded stale AP02 `platform-inventory.json`. AP09 owns replacement of that heuristic generator/consumer; AP05 did not overwrite human review decisions. |
| Publication check | Still reports the pre-existing stale 50-page plugin catalogue and existing language/source-metadata findings. W11, W12 and AP11 own those changes; AP05 does not claim publication acceptance. |

No runtime, cluster, browser, database, model or human reader exercise was executed.
Dependency installation reported the repository's existing npm audit result of 20
moderate and three high vulnerabilities; AP05 did not mutate dependencies or run an
automatic audit fix.

## AP05 acceptance

- Every U/O/E/R/S/D reader outcome has a canonical destination and a writing package.
- Every workspace/component family, contract family, runtime role, chart/workload
  group, public interface, configuration family, plugin kind and operational
  dependency has a destination above.
- All known gaps use P0/P1/P2 and DOC/IMP/LIVE without converting one type into
  another.
- The target structure remains three-track and is now simpler at the task level:
  shared lifecycle and operations explanations replace per-component duplication.
- W01–W12 specify an observable reader result. No empty page or heading is treated as
  content coverage.

AP05 is complete. AP06 completed W04–W06 and established the required terms and
boundaries. AP07 completed W01–W03 and W07. AP08 is next and owns W08–W09.
