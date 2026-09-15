# Documentation transformation blueprint

Status: AP02 completed and rechecked; AP03 recheck found unresolved decision handoffs (285 blocked, 2,594 content-reviewed).
Scope: documentation migration; implementation and live acceptance remain separate.

KubeClaw documentation must let a new reader understand the system, an operator complete operational tasks, and a developer build supported extensions without previous conversations. Detail is required where it explains behavior or lets a task finish. More pages are not a measure of completeness.

## Start here

1. [Inventory and evidence rules](01-platform-inventory.md): scope, source authority and implementation boundaries.
2. [Reader journeys and chapter structure](02-three-track-site-map.md): canonical chapters and measurable outcomes.
3. [Document decisions and migration](03-migration-and-deletion.md): individual review, extraction, deletion and progress preservation.
4. [Coverage and verification matrix](04-evidence-matrix.md): source families, task evidence and verification limits.
5. [Decision preservation](05-decision-record-catalogue.md): retain reasoning without confusing acceptance with implementation.
6. [Tooling and publication](06-automation-and-publication.md): reuse existing tools, add only necessary checks, keep unfinished work visible.

[Work plan](documentation-work-plan.md) defines AP01–AP11. [AP01 baseline](ap01-baseline/README.md) records the complete source inventory, plugin comparison, open findings and executable review dependencies. [AP03 recheck](AP03-recheck.md): all 2,879 frozen sources retain their individual decisions, but 285 handoffs are blocked pending concrete destinations. AP03 is not yet accepted. Migration remains pending; AP04 follows the corrected handoff and preserves open work, acceptance requirements, decisions and test dependencies before rewriting.

## Authority and historical outputs

The revised six artifacts define the migration policy. The files in `generated/` remain earlier mechanical output and are not current completion evidence. AP01 demonstrated that the old ledger omits 2,322 paths in its present generator scope. The old generator also overwrites completion text with a pending value. Do not write human review decisions into its generated CSV.

The current baseline is commit `6979bced8e5bbca90568276256e7328d93a1e072`. PR #12's removal of the standalone ChatGPT tunnel remains pending at this revision. Recheck affected paths after it merges. No cluster or Devbox configuration was inspected by this blueprint revision.

## Rules that apply across all chapters

- Each topic has one canonical explanation; task pages include the minimum context needed to finish.
- Current behavior, approved intent, unfinished implementation and live verification are separate facts.
- Use direct technical English and define unfamiliar terms on first use. Do not maintain duplicate manual translations.
- Reuse existing inventories and useful prose after checking their scope and correctness.
- Remove replaced texts after extracting useful facts, decisions, open issues and required test assets. Do not create a replacement archive of old reviews.
- Check tasks and examples, not just headings or path existence. A generated verification date is not a behavioral test result.
- Routine migration does not require repeated user approval. Record genuinely unresolved product decisions; continue unrelated work.

## AP02 completion

The six artifacts now agree on scope, chapter identifiers, review states, evidence rules, decision status and migration gates. Prism is represented as a real source/package/role surface with separately assessed integration and live status. Pipeline, OpenClaw and Codex plugins have distinct coverage. Operations includes complete recovery and loss-of-access scenarios. Examples and readable fallback diagrams suffice; a new website framework is not a prerequisite.

The AP02 revision changed the blueprint and work plan only. It does not regenerate old inventories, migrate product pages, delete reviews, fix runtime findings, or claim that existing full documentation CI is green. Those tasks retain their explicit work-package ownership.


## AP02 recheck

Rechecked against the AP02 work-package checklist and the user's end goal. All six artifacts were read again; the baseline and PR head were unchanged before this follow-up. No product functionality was retested.

| Requirement | Blueprint coverage |
| --- | --- |
| Read and decide every document | Artifact 1 scope; artifact 3 individual decisions, review states and changed-source handling |
| Reuse inventories without false completeness | Artifact 1 explicit inventory boundaries; artifact 6 generation versus human review |
| Preserve decisions and open work before deleting reviews | Artifacts 3 and 5; separate D12 local closure and live acceptance |
| Identify missing topics after review | Artifact 4 inventory/content/journey coverage and AP05 gap priorities |
| Detailed, understandable operations | Artifact 2 O1–O5 including bootstrap, daily operation, failed runs, backup operation, restore and loss of access |
| Explain all supported extension paths | Artifact 2 E1–E6 including five registration types, host plugins, a minimal worker engine and configuration-only customization |
| Keep examples usable outside the original operator environment | Artifacts 2 and 4 public/private configuration separation, prerequisites and effective-result checks |
| Avoid duplicate documentation over time | Artifact 3 per-topic deletion; artifact 6 maintenance ownership and final removal of temporary migration records |

The recheck made engine authoring, configuration-only extension, routine backup operation and portable operator examples explicit. It also assigned ongoing ownership and the disposition of these temporary migration records. These are strengthened acceptance requirements, not newly implemented product features. AP03 was not yet started at that recheck; its current progress is recorded below.

## AP03 individual document review

All 2,879 frozen source files retain decisions: 182 expand, 1,898 extract,
14 keep and 785 remove. The independent recheck corrected 61 records and
reopened the concrete-target acceptance gate: 2,594 records are content-reviewed,
285 are blocked for decision clarification, and all migrations remain pending.
These are documentation handoff blockers, not reopened implementation findings.

Next: resolve the exact blockers in `review-ledger.jsonl`, triage the separately
identified target candidates, and reconcile the nine documentation changes on
main before claiming a current-source handoff. See the [recheck](AP03-recheck.md)
for evidence and limits, the [progress report](AP03-progress.md) for history,
and the [human-maintained ledger](review-ledger.jsonl) for each next action.
