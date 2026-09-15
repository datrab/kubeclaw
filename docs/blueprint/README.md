# Documentation transformation blueprint

Status: AP02 planning baseline, revised after the AP01 recheck.
Scope: documentation migration; implementation and live acceptance remain separate.

KubeClaw documentation must let a new reader understand the system, an operator complete operational tasks, and a developer build supported extensions without previous conversations. Detail is required where it explains behavior or lets a task finish. More pages are not a measure of completeness.

## Start here

1. [Inventory and evidence rules](01-platform-inventory.md): scope, source authority and implementation boundaries.
2. [Reader journeys and chapter structure](02-three-track-site-map.md): canonical chapters and measurable outcomes.
3. [Document decisions and migration](03-migration-and-deletion.md): individual review, extraction, deletion and progress preservation.
4. [Coverage and verification matrix](04-evidence-matrix.md): source families, task evidence and verification limits.
5. [Decision preservation](05-decision-record-catalogue.md): retain reasoning without confusing acceptance with implementation.
6. [Tooling and publication](06-automation-and-publication.md): reuse existing tools, add only necessary checks, keep unfinished work visible.

[Work plan](documentation-work-plan.md) defines AP01–AP11. [AP01 baseline](ap01-baseline/README.md) records the complete source inventory, plugin comparison, open findings and executable review dependencies. AP03 is next: review every document, using this blueprint; do not treat AP01 classifications as completed content review.

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

This revision changes the blueprint and work plan only. It does not regenerate old inventories, migrate product pages, delete reviews, fix runtime findings, or claim that existing full documentation CI is green. Those tasks retain their explicit work-package ownership.
