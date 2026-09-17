# 1. Inventory and evidence rules

Status: AP02 migration specification.

## Baseline and reuse

The [AP01 report](ap01-baseline/README.md) is the baseline: 5,221 tracked files, 2,773 files under `docs/`, and 963 Markdown files across the repository. Its file inventory covers paths and blob identities, not completed content review. Include the new migration artifacts themselves when refreshing the inventory.

| Existing source | Reuse and limit |
| --- | --- |
| `ap01-baseline/file-inventory.tsv` | Complete baseline path list and scope proposals; each editorial decision still needs a reading |
| `ap01-baseline/plugin-manifests.tsv` | All 48 pipeline plugins, two OpenClaw extensions and one Codex plugin; presence is not activation |
| `generated/platform-inventory.json` | Earlier blueprint inventory; missing two current pipeline plugins; refresh from manifests |
| `generated/migration-ledger.csv` | Earlier filename-based suggestions only; not an editable review ledger |
| `../generated/inventory/plugin-system.json` | All 997 paths in its own search roots are current at AP01; its narrower roots omit the Prism OpenClaw extension and Codex plugin |
| `../site/extend/plugin-catalogue/` | Existing pages for all 50 packages under `skills/`; audit prose and examples, do not recreate blindly |

## Scope

Read every documentation file, including root and component READMEs, instructions, designs, operations material, examples, diagrams, generated references and review texts. Inspect non-prose files under `docs/` for their role before disposition. Fixtures, license text and third-party assets are not editorial deletion candidates merely because they are text. Still check their consumers when moving documentation.

Inventory implementation, scripts, contracts, chart values, role manifests and tests as evidence and consumers. This does not authorize deleting them. AP01's literal-reference scan is an initial dependency map, not a complete link graph. AP03 must inspect relative links, dynamic path construction and additional formats for each affected file.

## Describe each boundary accurately

| Surface | Evidence starting point | Required distinction |
| --- | --- | --- |
| Nova | `packaging/runtime/roles/nova.json`; `skills/nova/core/` | Canonical orchestration versus plugin policy and agent proposals |
| Plugin Foundation and SDK | `skills/common/plugin-runtime/` | Discovery, grants, activation, effects and five registration contracts |
| Worker Core | `skills/worker/core/`; `contracts/pipeline-worker-core/v1` | Shared attempt lifecycle versus engine semantics; assess actual runner integration |
| Buster | `packaging/runtime/roles/buster.json`; `skills/buster/engine/` | Packaged engine/service versus complete attempt-budget and cleanup integration |
| Prism | `packaging/runtime/roles/prism.json`; `skills/prism/`; `charts/prism/` | Existing source and packaged role versus integration, recovery and live acceptance |
| Forge and Echo | `skills/nova/plugins/implementation-agent/`; `skills/nova/plugins/review/` | Dispatched specialists versus runtime roles and deterministic lifecycle authority |
| OpenClaw extensions | `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json`; `skills/prism/openclaw-plugin/openclaw.plugin.json` | Host extensions, not pipeline registrations |
| Codex operations plugin | `plugins/kubeclaw-ops/.codex-plugin/plugin.json` | Codex plugin/skill interface, not OpenClaw or pipeline API |
| Operations access | `charts/ops-pod/`; `scripts/deploy-ops-pod.sh`; PR #12 | Intended Devbox/Ops Pod path, repository configuration and actual deployment are separate |

Do not claim that Prism is designed-only or absent from role packaging. Do not turn the presence of its role into a claim that every Prism workflow has been deployed and verified. Existing worker and retention findings also prevent a blanket claim that every historical execution path has already been retired.

## Evidence is specific to the claim

There is no universal ranking in which a schema automatically overrides executable behavior. Use the evidence needed for the statement:

| Claim | Required evidence |
| --- | --- |
| Intended contract | Versioned schema, exported type or accepted decision |
| Actual behavior | Reachable implementation and suitable behavioral verification |
| Included in a runtime | Role/package manifests and assembly checks |
| Configured by default | Current defaults, readers, precedence and rendered configuration |
| Deployed and usable | Evidence from the actual target environment and relevant task |
| Historical intent | Original decision or design source, explicitly historical |

If contract, implementation and test disagree, describe the discrepancy and link the remaining work. A test that asserts the defect is not proof of its correction. An agent's conclusion is not a replacement for the referenced evidence.

For each important surface keep independent fields: implementation state (absent/partial/implemented), packaging/activation state, verification scope (source inspection/local test/live test), source revision, and remaining work. Unknown is allowed and must say what would resolve it. Avoid one status badge that collapses all these dimensions.

## Status sources and completion

The finding register at the baseline records 141 of 154 locally verified and 13 incomplete, plus five verified integration findings. GitHub issue #7 is additional open work. Refresh these sources before migration; keep local completion distinct from outstanding live acceptance. AP04 will extract actionable, deduplicated live tasks from the evidence index and original reports.

Coverage must account for every runtime role, engine/specialist boundary, manifest, registration, capability, contract family, configuration family, persistent store and operational dependency. Generated counts prove inventory coverage only. Content coverage and task verification use [artifact 4](04-evidence-matrix.md).
