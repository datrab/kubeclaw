# 3. Document decisions and migration

Status: AP02 policy; individual content review starts in AP03.

## One source inventory, one human review ledger

Reuse the [AP01 inventory](ap01-baseline/file-inventory.tsv) as the baseline path set. Refresh it against the current commit and include root/component docs, site sources and blueprint/work records themselves. Keep excluded licenses and fixtures visible with a reason. Do not use the earlier generated ledger's limited scope as the denominator.

At the start of AP03, create one human-owned review ledger beside this blueprint. Use the existing tabular approach; no new database or application is required. The old generated migration CSV supplies suggestions only. No generator may overwrite human decisions. AP03 must establish this separation before recording the first reviewed document; AP09 integrates the final mechanical checks.

On refresh, compare by path and blob identity. Preserve reviewed entries unchanged when content is unchanged; mark changed content for recheck; retain removed paths until their deletion outcome is recorded; add new files as unreviewed. A rename preserves the record's old/new path mapping. A generator must never replace reviewed proof with a default pending string.

## Four decisions, separate review states

| Decision | Meaning and required record |
| --- | --- |
| Keep | Useful and current; give canonical location and source verification; record any move |
| Remove | No remaining useful content or required dependency; explain why no replacement is needed |
| Extract information | Identify exact facts, decisions, examples or open work to transfer and their destination sections; then remove the replaced source |
| Expand | Retain the topic but specify corrections and missing content; name the target and task acceptance |

These are the user's four decisions: behalten, entfernen, Informationen extrahieren, erweitern. Combination is allowed through the detailed actions, with one primary decision. A filename-based recommendation is not a completed decision.

States are: captured, content-reviewed, migrating, verified-complete, blocked. A reviewed source can still require substantial migration. Completion must be measured separately from documents read.

Each row records path, reviewed blob/commit, topic/audience, state, primary decision, concrete rationale, sections to preserve/correct, target chapter and section, source/test evidence, incoming dependencies, linked issues/decisions, verification result and next action/blocker. Removal without replacement explicitly says so rather than inventing a target URL.

## Work one coherent batch at a time

1. Select approximately 10–20 related documents, fewer for long designs; record the exact source state.
2. Read each whole document. Separate current facts, accepted intent, examples, procedures, proposals, historical results and obsolete material.
3. Compare important claims with actual source, contracts and appropriate evidence. Record disagreements rather than silently selecting whichever text seems newest.
4. Record a specific disposition per file. AP04 extracts durable decisions and open work; AP05 identifies missing topics independently of the old files.
5. In AP06–AP08 write complete replacement content, using the accepted chapter purpose and task criteria.
6. Verify examples/procedures to their declared scope and update source links, navigation, search inputs and all consumers.
7. Remove replaced documents and obsolete generated outputs in the same completed topic migration.
8. Check the resulting references and affected tests, save the change and update the ledger and next action.

Do not postpone every deletion until the end and create a second permanent documentation set. AP10 occurs per completed topic; AP11 performs a global check.

## Reviews, findings and executable evidence

The desired final repository has no collection of old review reports. Before deleting one, preserve only the useful current explanation, durable reasoning, remaining issue context and still-needed test assets.

AP04 establishes one canonical open-issue register using stable historical finding IDs. Each issue needs problem/impact, current partial implementation, affected code, reproduction or evidence, remaining work, completion criterion and relevant decisions. The 13 incomplete baseline findings are not the entire universe of work: also reconcile additional GitHub issues, including #7. Do not change their status merely because documentation improved.

Separate live acceptance from implementation findings. The 141 local closures remain local closures under D12. Extract relevant live tasks from their reports, deduplicate shared checks, and record prerequisites, procedure, expected result and responsible party. The evidence index is a discovery source, not 141 automatically open live issues. Replace old register consumers before retiring the historical full register.

AP01 found tests that execute scripts under `docs/review/evidence/`, and tests that write evidence there. Move required executable reproductions to appropriate test locations and update their imports/invocations. Preserve functional checks; do not remove tests to make deletion pass. Review JSON, parity ledgers, schemas and manifests under `docs/architecture/` can also be executable inputs.

## Deletion gate

A source may be removed when all applicable conditions are true:

- Its individual review is recorded against the actual source revision.
- Each useful fact, example, decision and open item has a concrete destination, or a documented reason for removal.
- The replacement fulfills its reader task and has the required source/verification evidence.
- Incoming prose links, tests, scripts, configuration references and generator inputs are migrated or explicitly retired.
- Build navigation and search inputs use the replacement; public historical routes redirect where useful. An unpublished internal report need not acquire a public redirect.
- Affected checks pass, or a pre-existing unrelated failure is explicitly separated with evidence. A broken affected dependency blocks that topic's deletion.

A live public deployment is not needed to delete repository sources after locally checking replacement navigation. No new archive is created “just in case”. Git history preserves obsolete content. Any unavoidable retained historical asset needs a concrete continuing purpose; it must not masquerade as current product guidance.

## Completion and handoff

Report captured, content-reviewed, migrated and blocked counts separately. Do not use a single percent as a substitute for quality. Preserve the baseline and next action in the same documentation PR. AP03 is complete when every source is read and decided, even if writing remains in later packages. AP11 is complete only after new/changed files are reconciled and all documentation tasks and deletion dependencies are resolved or explicitly bounded by actual product limitations.
