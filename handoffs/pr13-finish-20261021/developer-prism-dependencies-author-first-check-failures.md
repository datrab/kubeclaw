# Retained author-check failures

1. Actual MarkdownIt checker initial attempt, tool chunk03b9d0, terminal1: `Missing semantic field within actual parsed block 1 > **Source evidence — checkout baseline**`. The scratch parser normalized all whitespace and erased soft-break-separated existing plain fields inside one paragraph. Corrected only scratch parsing to preserve newline boundaries, then mapped existing Negative test + Local result semantics. No public field/heading/quote was changed to satisfy that mistake. Corrected parser terminal0, tool chunks5c01c9/92ab7f.
2. Original Reader boundary CLI, tool chunkfe7d85, terminal1: `docs/site/extend/platform/prism.md:380: source-inspection bookkeeping`. New Limit had `Route/source inspection...`; the phrase failed the existing reader-content guard. Candidate correction describes router/session limitations directly. No validator change or exemption.

These are author-tool/prose failures, not failed product test executions. All terminal statuses above were witnessed directly; no nonexistent raw stderr archive is claimed.
