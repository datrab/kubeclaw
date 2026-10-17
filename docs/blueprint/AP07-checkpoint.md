# AP07 Completion Checkpoint

Date: 2026-09-16
Status: complete
Scope: W01, W02, W03, and W07
Evidence revision: `85e73b1885f04a9494f388cf6622ad0bde2db447`

## Result

AP07 replaces the short operator entry with one ordered lifecycle.
The operations track contains 2,238 lines and approximately 12,451 words.

The sequence is:

1. Plan and install.
2. Configure and operate.
3. Observe and diagnose.
4. Back up and recover.
5. Maintain and retire.

The pages explain supported actions and implementation limits at the exact affected step.
They do not invent host bootstrap, cancellation, recovery, or acceptance behavior.

## Delivered Pages

| Reader outcome | Canonical page | Package |
| --- | --- | --- |
| Choose the correct operator procedure and understand shared rules | [Operate KubeClaw](../site/use/README.md) | W01–W03, W07 |
| Plan topology, verify prerequisites, install in order, and handle a failed first install | [Plan and Install](../site/use/install.md) | W01 |
| Configure platform authority and start, inspect, resume, recover, and interpret work | [Configure and Operate](../site/use/operate.md) | W07 |
| Classify hangs, lost responses, conflicts, failed gates, uncertain effects, pressure, and delivery gaps | [Observe and Diagnose](../site/use/diagnose.md) | W07 |
| Inventory state, create consistency groups, restore data or access, and prove application reads | [Back Up and Recover](../site/use/recovery.md) | W02 |
| Upgrade, migrate, roll back, rotate, manage capacity, and retire | [Maintain and Retire](../site/use/maintenance.md) | W03 |
| Enter the complete track from a clean checkout | [Operator Quickstart](../site/use/quickstart.md) | W01 |
| Prove workload identity and mTLS through the focused route | [Worker Trust](../site/use/worker-trust.md) | W01, W07 |

Existing detailed component runbooks remain specialist sources.
The product pages give the complete task order and link to those sources at the relevant step.

## AP07 Requirement Evidence

| Required area | Completion evidence |
| --- | --- |
| Planning | The install page requires source, release, cluster, storage, network, identity, data, capacity, change, and access records. |
| Installation | The procedure separates render, namespace, secrets, infrastructure, roles, Prism, Worker Trust, and first evidence. |
| Components | The platform matrix covers host/K3s, CNI, Argo, storage, registry/BuildKit, DNS/Tailscale, SPIRE, databases, queues, and roles. |
| Normal operation | The operate page covers platform configuration, compile, start, audit, typed signal, recovery, results, role changes, Prism, and demo boundaries. |
| Observation | The diagnosis page covers cluster health, events, logs, audit, queues, storage, metrics, receipts, and retained evidence. |
| Troubleshooting | The symptom index distinguishes hangs, lost responses, conflicts, failed gates, uncertain effects, waits, plugins, workers, Prism, demos, and delivery. |
| Data protection | The recovery page assigns owners, authority, consistency, protection, and limits to every persistent or rebuildable state class. |
| Recovery | The procedure covers service, consistency group, pipeline, node, cluster, and independent access recovery. |
| Maintenance | The maintenance page covers version authority, rendering, GitOps, stateful order, Prism, rollback, rotation, registry, capacity, and scanning. |
| Retirement | The final procedure stops admission, resolves work, exports data, removes workloads by scope, revokes access, and verifies retained ownership. |

## Procedure Standard

The canonical pages provide these elements where the action applies:

- Objective and supported boundary.
- Execution location and required authority.
- Starting conditions and prerequisites.
- Expected impact and explicit stop conditions.
- Ordered commands or actions.
- Expected observations after important transitions.
- Verification through the original consumer.
- Symptom-based diagnosis.
- Recovery or rollback boundary.
- Cleanup and evidence retention.

Commands use named placeholders.
The operations entry defines their meaning and required properties.

## Important Honest Limits

| Limit | Documented operator behavior | Authority |
| --- | --- | --- |
| No complete host or K3s bootstrap | Start from an existing cluster; stop whole-cluster recovery at the missing platform-owned step. | [IFR-01-001](../site/status/open-issues.md#ifr-01-001) |
| No proven independent Ops access | Record host or control-plane access before installation; do not rely on the failed Pod. | [IFR-28-001](../site/status/open-issues.md#ifr-28-001) |
| No operator cancel command | Do not call process termination durable cancellation; use incident containment and retain evidence. | Current Nova CLI source |
| No complete environment recovery proof | Restore matched groups in isolation and keep the old environment until application verification. | [IFR-26-001](../site/status/open-issues.md#ifr-26-001) |
| No accepted environment RPO or RTO | Record both values as undecided until measured live restoration establishes them. | G13 remains open |
| Incomplete run-history retirement | Use only narrow implemented cleanup paths; do not delete connected history by age. | [PCR-OBS-002](../site/status/open-issues.md#pcr-obs-002) |
| Incomplete Buster process ownership | Preserve uncertain workspaces and diagnose ownership instead of deleting them. | [PCR-BUSTER-ENGINE-001](../site/status/open-issues.md#pcr-buster-engine-001) |
| Unproved CNI cutover | Separate CNI work from application upgrades and require independent rollback. | [IFR-02-001](../site/status/open-issues.md#ifr-02-001) |
| Incomplete SPIRE expiry recovery | Use the existing rotation runbook and retain the open restore boundary. | [IFR-06-001](../site/status/open-issues.md#ifr-06-001) |
| GitOps branch/SHA comparison gap | Record branch and resolved commit; never accept an arbitrary revision. | [DOC-AP03-GITOPS-001](../site/status/open-issues.md#doc-ap03-gitops-001) |

## Source Evidence

Six source-evidence boxes contain 24 revision-bound code links.
The links cover deployment order, role readiness, CLI behavior, platform authority, and Prism consistency groups.

Each operations evidence box now records the claim, implementation, contract or setting,
test status, source revision, and evidence limit.

The documentation check resolves every link at its stated revision.
It rejects a missing file or invalid line range.

Detailed legacy runbooks remain relative links because they are documentation sources, not copied production code.

## Language and Reader Level

The product pages use controlled technical English.
They assume that readers understand Kubernetes, Git, databases, and operational change control.

The pages define KubeClaw-specific authority, state, and recovery terms.
They avoid academic framing and unexplained product jargon.

The repository controlled-language check accepts every new AP07 product page.
The publication check reports no AP07 page finding.

AP11 retains formal ASD-STE100 dictionary review and human-reader acceptance.
AP07 does not claim that later acceptance.

## Verification

| Check | Result |
| --- | --- |
| `git diff --check` | Pass. |
| `node scripts/docs-check.mjs` | Pass: 887 active Markdown files. |
| Operations evidence check | Pass: six complete evidence boxes and 24 valid revision-bound code links. |
| `npm run docs:check:refs` | Pass: 1,728 local links and 820 repository-path references. |
| `npm run docs:check:coverage` | Pass. The topic-map references remain current. |
| `npm run verify:docs:controlled-language` | Pass. |
| AP07 content measures | Pass: 2,238 lines and approximately 12,451 words across eight operations pages. |
| `npm run docs:publication:check` | No AP07 page error. Existing AP08, AP09, and AP11 findings remain. |
| `npm run docs:blueprint:check` | Known pre-existing AP02 generated inventory drift; no AP07 output owns that file. |

The verification does not claim a new cluster deployment, backup, restore, upgrade, browser session, or failure injection.
All complete live gates in [Operational and Live Acceptance](../site/status/acceptance.md) remain open.

## Follow-up Review on 2026-09-16

A manual command-to-source review found gaps that the original structural checks did not detect.
This follow-up made these corrections:

- The portable quickstart now uses the plugin inventory check. It separates the full verifier and its required delegated cgroup-v2 host.
- The guide no longer presents unsupported `pipeline --help` behavior. It points to the exact project and explicit-graph forms.
- Interactive and noninteractive first installation both run `setup`, so namespace, Helm repositories, and selected Secret handling use one path.
- The retirement procedure treats teardown commands as alternative scopes. It states that broad `teardown` deletes every remaining application-namespace PVC.
- The operations entry records current tool inputs and states that Kubernetes and K3s have no accepted compatibility range.
- Every operations evidence box uses the required evidence fields. The checker now rejects missing fields and the four corrected command hazards.
- [IFR-01-001](../site/status/open-issues.md#ifr-01-001) and the [roadmap](../site/status/roadmap.md#automated-host-bootstrap-and-recovery) now require automated, idempotent host bootstrap and recovery preparation from an empty supported host.

The follow-up ran the project compiler, platform configuration, and deployment truth checks successfully.
The Prism command check failed because its canonical-schema assertion does not match the current source.
[DOC-AP07-PRISM-CHECK-001](../site/status/open-issues.md#doc-ap07-prism-check-001) tracks the exact source-check repair.
The Prism backup test failed before positive proof because of incompatible local utilities and a chart-fixture precondition.
The product documentation records those failures and does not turn them into AP07 success evidence.

## Completion Decision

Every AP07 operational task now has a runnable path or an exact implementation boundary.
The pages separate source verification, component smoke, application verification, and live acceptance.

AP07 is complete.
AP08 follows this checkpoint and owns W08–W10 and the AP08 portion of W11. AP08.0
established its extension baseline, AP08.1 delivered the choice and boundary guide,
and AP08.2 delivered the minimal pipeline-plugin journey. AP08.3 through AP08.6
delivered the shared contracts, effectful, Buster, and Nova guides. AP08.7 is next.
