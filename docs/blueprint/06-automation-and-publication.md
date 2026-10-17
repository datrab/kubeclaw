# 6. Tooling and publication

Status: AP02 design, not a statement that the proposed checks are implemented.

## Reuse the current pipeline

Keep Markdown, the existing `docs/site/` sources, generators and publication allowlist. Extend tools to serve the migration; do not select a new framework, invent a second documentation pipeline or require a new interactive architecture application before writing useful content.

| Existing tool or command | Keep and adapt | Owner in the work plan |
| --- | --- | --- |
| `scripts/plugin-system-inventory.mjs` | Its own search scope is current; reuse facts and document separate host/Codex scope | AP03 inventory use; AP08/AP09 integration |
| `scripts/docs-blueprint-generate.mjs` | Preserve useful mechanical discovery, remove misleading completion claims, separate human decisions from generated output | AP03 ledger safety before review; AP09 final checks |
| `scripts/docs-inventory.mjs`, `docs-secret-inventory.mjs`, `docs-yaml-inventory.mjs` | Reuse deployment/configuration/workflow facts and verify effective defaults | AP07/AP09 |
| `scripts/docs-generate.mjs`, `docs-generate-core.mjs` | Reuse factual reference generation without overwriting authored explanations | AP09 |
| `scripts/docs-check.mjs`, `docs-check-refs.mjs`, `docs-check-coverage.mjs` | Update required pages, coverage and link rules to actual migrated destinations | Per-topic migration, final AP09/AP11 |
| `scripts/docs-publication.mjs` | Update catalogue, source links, navigation/allowlist and build output; do not stamp generation as behavioral verification | AP09 |
| `.github/workflows/docs-checks.yaml` and `package.json` | Reconcile actual CI steps with documented commands; preserve trust boundaries of generated writes | AP09 |

The checked-in old blueprint output is not regenerated in AP02. Its stale counts and hardcoded status text are tracked AP03/AP09 work. In particular, never run the old generator over a human-owned review ledger: human data must live outside its output paths. Establish that separation before AP03 records decisions.

## Required automation behavior

1. Read the complete tracked source inventory at an explicit revision, with declared fixture/license exclusions.
2. Generate mechanical manifests, role, contract and configuration facts from their actual sources. Keep pipeline, OpenClaw and Codex types distinct.
3. Preserve the independent human review ledger and flag changed reviewed blobs for recheck. Never reset completed decisions during generation.
4. Check that each inventoried subject has an assigned chapter, then check its content/task status separately.
5. Resolve source references against the documented revision. Distinguish files, directories, patterns and unresolved text; avoid treating every token as an exact missing file.
6. Verify examples with their declared parser/compiler/test or isolated execution. Record environment, failures, skips and unavailable live checks honestly.
7. Check internal links, anchors, navigation, applicable redirects and publication allowlist after each topic migration.
8. Check deleted-source consumers, including tests that run review evidence and generators that would recreate old content.
9. Build publication output and inspect representative rendered pages, code blocks, diagrams and narrow layouts.
10. Emit a small report with source revision, changed content, actual checks/results and remaining limits. Reuse existing hashes/reports; signed reports are not a new prerequisite.

An automatic checker cannot determine that prose is understandable or that an operator has enough information. AP11 reader journeys remain required. Language checks can flag problems but cannot prove formal ASD-STE100 compliance. Apply the project controlled-language rules and the available ASD-STE100 guidance from the [documentation quality standard](07-documentation-quality-standard.md). Preserve explanation depth when revising language; do not omit facts to satisfy a checker. Formal certification is not a publication requirement and must not be claimed.

## Commands and truthful CI status

The existing command names are the starting point, not a promise that they currently pass:

```bash
npm run plugin-system:inventory:check
npm run docs:inventory:check
npm run docs:blueprint:check
npm run docs:check:refs
npm run docs:check:coverage
npm run docs:publication:check
npm run docs:publication:build
npm run docs:publish-check
```

Inspect their implementations and CI wiring before changing them. The current Docs Checks workflow does not simply run the full `docs:publish-check` chain. AP09 must explicitly connect required checks and remove obsolete assumptions. Do not bypass a failing gate by weakening meaningful verification. If an unrelated pre-existing failure blocks a whole suite, report it and run the affected checks separately; do not call the whole suite green.

AP02 changes specifications only. It does not exercise live services or claim that all existing documentation passes these commands. Generation/build commands that write files should run in the working checkout used for that specific verified migration, not overwrite the preserved AP01 snapshot.

## Generated facts and authored guidance

Use manifests for identities, schema fields, registrations and declared roles. Use authored sections for purpose, use cases, limits, operational steps, errors and examples. Keep generated blocks or companion data separate so catalogue regeneration cannot erase those sections.

A generated page date means generated at that revision. A verification field identifies the actual last applicable check and environment. Existing status text such as the claim that Prism has no runtime role must be corrected during product-page migration; do not copy it from a hardcoded generator constant.

## Presentation and publication

Retain the three entrances and shared references. Use direct links and a readable contents/index before adding complex search filters. Search and navigation must only expose intended product pages; migration records, raw reviews and generated evidence indexes remain excluded. Check the allowlist itself, not merely whether a sidebar hides a page.

Diagrams must match the implementation and have a textual explanation. SVG, Mermaid and ordinary tables are acceptable. Interactivity is optional if it makes a specific relationship easier to explore; it must have keyboard access and a readable non-interactive fallback. Do not require three design options, a new visual brand, or seven architecture views to finish the documentation work.

Versioned publication should identify its source revision and preserve useful old public URLs through redirects. Publishing or changing hosting is a separate action from preparing and testing sources. Local build/navigation checks suffice for a source migration; an external deployment is not an automatic requirement.

## Acceptance of the tooling changes

AP09 is done when factual regeneration is reproducible, human decisions survive it, every relevant subject is covered, applicable references and examples pass, deleted files are not recreated, and publication contains only intended content. Test the preservation of reviewed ledger entries against unchanged, modified, renamed, removed and new files when implementing ledger refresh.

AP11 checks actual reader outcomes and the final updated inventory. Documentation can be complete while implementation issues and live acceptance remain explicitly open. It cannot be complete if a reader must infer prerequisites, current limitations or recovery steps from deleted reviews.


## Ongoing ownership and migration closeout

During AP03/AP05, assign each canonical chapter a component or maintenance role and its source dependencies; a named person is not required and must not be invented. A change to an interface, default, manifest, runtime role or documented procedure triggers review of the affected authored content as well as regeneration of factual tables. AP11 adds this rule to contributor guidance and checks that an ordinary change can identify its documentation owner and verification command.

At AP11, inspect the blueprint, AP01 snapshots, human ledger and evidence indexes themselves. Remove temporary migration material once its durable decisions, unresolved tasks and continuing operational evidence have canonical homes. Keep only records with a concrete continuing purpose. Do not leave this migration's bookkeeping as a new permanent layer of duplicated status or obsolete documentation.
