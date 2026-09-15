# Documentation transformation blueprint

Status: AP01–AP03 completed and rechecked; 2,887 content-reviewed decisions, no open AP03 handoff. AP04 is in progress; see the [saved checkpoint](AP04-checkpoint.md).
Scope: documentation migration; implementation and live acceptance remain separate.

KubeClaw documentation must let a new reader understand the system, an operator complete operational tasks, and a developer build supported extensions without previous conversations. Detail is required where it explains behavior or lets a task finish. More pages are not a measure of completeness.

## Start here

1. [Inventory and evidence rules](01-platform-inventory.md): scope, source authority and implementation boundaries.
2. [Reader journeys and chapter structure](02-three-track-site-map.md): canonical chapters and measurable outcomes.
3. [Document decisions and migration](03-migration-and-deletion.md): individual review, extraction, deletion and progress preservation.
4. [Coverage and verification matrix](04-evidence-matrix.md): source families, task evidence and verification limits.
5. [Decision preservation](05-decision-record-catalogue.md): retain reasoning without confusing acceptance with implementation.
6. [Tooling and publication](06-automation-and-publication.md): reuse existing tools, add only necessary checks, keep unfinished work visible.
7. [Documentation quality standard](07-documentation-quality-standard.md): depth, decision reasons, ASD-STE100, source evidence, task acceptance and a future documentation agent.

[Work plan](documentation-work-plan.md) defines AP01–AP11. [AP01 baseline](ap01-baseline/README.md) records the original inventory and executable dependencies. The [AP03 completion report](AP03-recheck.md#abschluss-der-ap03-nacharbeit-am-15092026) resolves the 285 former handoff blockers and additional candidates. Migration remains pending; AP04 preserves open work, separate live acceptance, decisions and test dependencies before rewriting.

## Authority and historical outputs

The six AP02 artifacts and the subsequent documentation quality standard define the migration policy. Only the [human-maintained review ledger](review-ledger.jsonl) is authoritative for current individual decisions. Files in `generated/` are earlier heuristic AP02 output, not accepted manual decisions or current completion evidence. AP01 found that the old ledger omits 2,322 paths in its generator scope; its generator also resets completion prose to pending. Consumer migration belongs to AP09; do not overwrite human decisions with that output.

The original AP01 baseline is `6979bced8e5bbca90568276256e7328d93a1e072`; AP03 preserves source identities at `e4ba8b1dd830f38450fcabedf4db7188aaeb6c44`. Current main through `1e50167fcb4355dfce4110d612ab360828c64394` has been integrated and affected documentation reconciled, including the removed standalone ChatGPT bootstrap. Six AP03 administrative sources and two new main documents are explicitly added. No cluster or Devbox live acceptance was performed.

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

All 2,887 sources have concrete decisions: 191 expand, 1,752 extract, 18 keep and 926 remove. The original 2,879 identities remain intact; eight sources are explicitly added. There are 2,886 current files and one historical main removal. All records are content-reviewed, none blocked, and all migrations remain pending.

The six-agent follow-up and independent checks resolved concrete destinations, parent evidence, machine-readable inventories and fixture consumers. Source, functional and target-only checks are distinguished; this does not claim a fresh full reading of every historical source-code attachment. See the [completion report](AP03-recheck.md#abschluss-der-ap03-nacharbeit-am-15092026) for scope and evidence and the [progress report](AP03-progress.md) for history.

Next: AP04, preserving the 13 incomplete findings, 141 local closures, Issue #7, separate live acceptance and decisions. The source-confirmed GitOps branch/resolved-revision health-gate discrepancy is an additional technical follow-up, not a closed finding. AP04–AP11 and product/live acceptance remain outstanding.
