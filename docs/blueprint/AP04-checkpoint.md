# AP04 completion and handoff

Status: AP04 extraction complete and rechecked; AP05 is next
Date: 2026-09-15
Branch: `docs/documentation-overhaul`, existing PR #13
Starting checkpoint: `ed9c53ba056097254b187123acc44e0f2a30a239`
Source authority: AP03 completion `ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`; integrated main source through `1e50167fcb4355dfce4110d612ab360828c64394`

This report replaces the incomplete AP04 checkpoint. It records extraction acceptance,
not completion of the documentation overhaul or acceptance of a running KubeClaw system.
The [quality standard](07-documentation-quality-standard.md) remains binding for AP05–AP11.

## Delivered authority

| Result | Canonical location | Completion evidence |
| --- | --- | --- |
| Incomplete implementation work | [JSON register](../status/open-issues.json), [generated readable view](../site/status/open-issues.md) | 16 entries: 13 original incomplete findings and three separate follow-ups. Each retains problem, impact, current state, components, remaining work, reproduction, completion criteria and evidence limits. |
| Original identity and local closure | [Compact provenance](../site/decisions/acceptance.md) | All 154 original IDs and five separate integration IDs retained. Original local state remains 141 closed and 13 incomplete. |
| Operational acceptance | [Gate plan](../site/status/acceptance.md) | G01–G15 retain prerequisites, procedures and pass conditions. All 36 explicit inherited live obligations are individually mapped. Complete gates remain unexecuted. |
| Durable decisions | [Decision index](../site/decisions/README.md) | Core/plugin records, all 119 test-gate IDs, all 78 Echo phase-2/3/4 IDs, later Echo supersession, runtime/operations, Prism and implementation decisions. Approval gaps remain explicit. |
| Source handoffs | [Existing review ledger](review-ledger.jsonl) | `ap04_extraction` resolves 42 issue, 128 decision and 995 acceptance handoffs. Their overlap affects 1,124 source rows. All 2,887 original AP03 records, source blobs, review states and migration decisions are preserved. |

The ledger's original `target` fields retain AP03 planning names. The new extraction
fields resolve those names to actual pages and sections. They record the source
obligation, disposition and verification boundary. The 1,868 target references resolve.
No filename-only classification is presented as a content review: the source assessment
comes from AP03; AP04 reconciles its reviewed obligations with the canonical records.
AP04 did not reread or rerun every historical raw log.

## Corrections that matter

- Echo intermediate PASS/FAIL, evidence-blocking and reconciliation proposals are distinguished from their successors. Core retains lifecycle authority. Repository audit, normal review, report publication and model promotion have separate boundaries.
- Earlier shared-process Prism CPU accounting is distinguished from later native ownership. The Buster launch-broker recommendation remains a proposal; the incomplete Buster integration findings remain open.
- The old missing demo-extension statement is superseded by the signed product-controller implementation. It does not create a new implementation finding. Actual authenticated human acceptance remains a separate live gate.
- Accepted no-decay preferences conflict with implemented 180-day decay. `DOC-AP04-PREFERENCE-001` preserves the conflict without inventing approval or changing runtime behavior.
- Prism retrieval sources specify both 250 ms and 300 ms. No approval for the relaxation is established. G07 must report both limits; AP05 must retain the decision gap.
- Historical short references `48320e8` and `ac6f673` cannot be resolved locally or through the GitHub commit API. They remain labeled historical text beside pinned evidence. They are not broken clickable commit links or invented replacement proof.
- GitHub issue #7 and its failed security-scan job remain dated external observations. Job status does not establish the failure cause; scanner logs and artifacts were not inspected in AP04.

## Old authority retired

The [old remediation register](https://github.com/datrab/kubeclaw/blob/ad67f9bb5c75cfa8cc1b926668aec1dd0168452c/docs/review/remediation/register.json) was removed after its incomplete work,
identities, local dispositions and explicit live obligations were reconciled.
The old [Markdown register](../review/remediation/register.md) is a temporary pointer.
Operative README, handoff, progress and resume entrypoints now identify the canonical
status and acceptance pages. Historical JSON links use immutable Git history.
The observability-retention assessment links directly to current D01/D07 records.

A repository search found no reader of the old register basename in scripts, tools,
tests or workflows. The branch-audit verification script reads frozen archive files,
not this current-status JSON. Historical reports and test assets remain in place.
Their individual migration and deletion gates still belong to AP06–AP10.
The old register is the only source file deleted in AP04 completion.

## Verification performed

| Check | Actual result |
| --- | --- |
| `node --test scripts/tests/docs-status.test.mjs` | Initial completion: 11 passed. Recheck: 13 passed, zero failed or skipped. Includes invented original IDs, tampered provenance, invalid dates, mutable-source dates, lost actionable fields, count drift and a legitimate later local closure. |
| `node scripts/docs-status.mjs --check` | Passed. The generated view matches the sole JSON authority. |
| AP03 preservation comparison | All 2,887 previous row values are unchanged after excluding the added `ap04_extraction` field. |
| Original scope comparison | Exact 154+5 ID sets retained; all 36 explicit live-obligation IDs retained. No implementation finding closed by documentation. |
| Decision identity comparison | Exact D-001–119, D-ER-001–036, D-ER3-001–019 and D-ER4-001–023 sets retained. |
| Source and navigation audit | 515 distinct Markdown path/anchor targets after recheck on the decision and status pages resolve, including pinned Git blobs and line bounds. All 1,868 ledger extraction targets resolve. All 75 remaining commit links resolve in the Git object store. This is source/link validation, not runtime execution. |
| `git diff --check` | Passed. |
| `npm run docs:check` | Status, plugin inventory, documentation inventory and generated reference checks passed. The run then failed at the known stale `docs/blueprint/generated/platform-inventory.json` check. Later commands in that chain did not run. |

The AP02 generator still conflicts with the human-reviewed migration inventory.
AP09 owns that consumer change. Regenerating heuristic output is not an acceptable
way to overwrite reviewed decisions or claim the global check passed.

No cluster, native runtime, browser, PostgreSQL, model or human product acceptance
was executed for AP04. Existing test results are attributed to their original source.
Formal ASD-STE100 vocabulary/rule verification and independent reader trials remain
AP11 gates. This extraction does not claim that these language gates have passed.

## Recheck of AP04 completion

The recheck starts from `2a2485c928740ec87bb458c704464d810e5bdb7c`.
It compares all 2,887 ledger records with the pre-extraction snapshot, checks the
42/128/995 handoff groups and their 1,868 targets, and compares the exact 154+5
finding identities and 36 explicit live-obligation IDs with the pinned original register.
The original text of all 36 live obligations and the next actions of all 13 incomplete
findings were reviewed. Targeted semantic checks cover Prism retrieval criteria,
Echo governor behavior, and the isolation-kernel command prerequisites.
This is not a second full reading of all 995 historical acceptance-source files.

The following defects were corrected:

- The status validator accepted a closed original ID in place of an open original ID
  when counts stayed equal. It also accepted removal with adjusted counts and no
  corresponding closure record. It now checks the exact disposition of every original
  ID against the provenance rows. A later closure requires both records to agree.
- The validator accepted an invented integration-closure count of 999. It now checks
  the count against the five inherited integration rows.
- G07 omitted retrieval diversity, repeatable result order, comparison with the better
  individual search method, full vector recall, and parts of the measurement scope.
  These criteria are now explicit, including the nonblocking scale probe. The known
  250/300 ms decision conflict remains unresolved; no approval was invented.
- The G03 command now states its root-caller prerequisite and nonzero workload UID/GID.
  The two inherited recovery procedures are directly linked. G11 distinguishes an
  offline cache miss from an online miss.

Narrow source references now support the Echo governor and Prism acceptance claims
next to their explanations. The source/anchor audit passes for 515 distinct targets;
all 1,868 extraction targets remain valid. The register counts and implementation
statuses are unchanged. The 13 status tests and generated-view check pass.
The aggregate documentation check still stops at the known AP02 inventory mismatch.
No runtime or live acceptance was run, and formal STE acceptance remains pending.
No AP04 extraction blocker remains after these corrections.

## AP05 follow-up

AP05 is complete in the [gap and writing plan](AP05-gap-plan.md). It assigns the
reviewed obligations and independently missing reader tasks to canonical destinations
and twelve prioritized writing packages. AP06 is now next. The original AP04 handoff
below remains as the boundary that AP05 used.

## Original AP04 next work

AP05 must turn the reviewed source obligations into a prioritized chapter gap plan.
The architecture, operations and extension chapters must explain mechanisms and
reasons in clear English, with source evidence next to each claim. AP07 supplies
complete operating procedures. AP08 proves supported extension workflows from a
clean checkout. AP09 verifies publication, navigation and code previews from the
same source revision. AP10 removes each superseded source only after its remaining
consumers and evidence have been migrated. AP11 verifies the complete reader tasks,
ASD-STE100 and the maintenance contract for a future documentation agent.
