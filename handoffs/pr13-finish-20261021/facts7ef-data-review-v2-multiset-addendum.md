# V2 multiset audit — correction to V1 inventory completeness

Parent correctly identified a **real reviewer-inventory defect**. V1 keyed operation dictionaries by all fields except sha256, which for generic ImportDeclaration/IfStatement facts is only source/kind/symbol=`<operation>`. Repeated identities overwrite. Therefore V1's claim that its operation inventory covered every changed fact is withdrawn. V1 files/report/hash manifest remain intact; candidate/full original facts and exact receipt digest were never constructed from this lossy inventory and are unchanged.

V2 compares Counters of **complete fact objects including sha256**, separately retaining every full object's original zero-based positions and old/new multiplicity. `operation-deltas-v2-multiset.json` contains all 26 removed and 153 added occurrences across ten consumer closures. Those totals intentionally count a common defining operation again for every actual owning consumer. A zero net complete-object multiplicity is not a semantic delta merely because order differs; the actual digest/candidate still binds the original whole ordered facts result. Every prior installed digest still matches the actual original8522 observed baseline.

Per Source old→new facts; removed/added: discovery212→225;3/16. Classifier31→36;3/8. Product scope1405→1418;3/16. API reference1427→1440;3/16. Configuration inventory2197→2210;3/16. Generate1523→1536;3/16. Publication165→181;4/20. Renderer34→37;2/5. Check-artifact15→51;1/37. Redirects19→21;1/3.

## Exact semantic gap assessment

V1 failed to list **13 added occurrences of seven distinct complete facts**, not a newly discovered production behavior or author DATA change. No removed full fact was lost. `operation-deltas-v2-additional-source-evidence.json` binds each of those seven hashes to exactly one original current Source line/span and includes the exact text, obtained by inert string hashing, not a target import/parser evaluation:

- Discovery's single exact import from `docs-documentation-owner-purpose-custody.mjs` occurs once in discovery and once in each of its four transitive consumers (five missing occurrences). This is the already explicitly reviewed finite freshness/ancestry/native-entry/external-CI hooks import; V1 prose/selector inventory did describe it, but V1 operation inventory omitted it. Complete nonauthor four-owner/CI reviews remain its semantic basis; this audit adds no selfacceptance or new call authority.
- Page-records' two imports from redirects (readonly verifier/legacy route/client) and renderer (actual shared assets/output layout) occur in publication and check-artifact defining closures (four occurrences). Actual readonly redirect/output layout consumer distinctions were part of complete v2 Source/caller review. Imports establish original static binding; they do not imply asset/module execution or native/read grants.
- Publication's import of `appendReaderPageRecords` (one occurrence) is the reviewed ordinary normal-build metadata append, not optional caller metadata or product API body.
- Check-artifact imports `fileURLToPath` and `verifyReaderPageRecords` (two occurrences), plus its complete top-level IfStatement requiring normal verification unless explicit legacy renderer mode AND absent pageRecords (one). The full IfStatement was independently hash-bound here: explicit legacy mode still rejects production build-report presence; ordinary path always invokes finite verifier with explicit/default Source checkout. This is the exact previously reviewed production-vs-fixture distinction, **not** an inferred exemption when metadata is absent.

All seven belong to complete page-records v2/owner-CI Source scopes already named in V1. No additional changed full fact lies outside those finite reviews. V2 supplies exhaustive multiset coverage; no unreviewed semantic gap warrants changing the candidate. Final acceptance remains parent's independent exact DATA review.

## Selector multiplicity

Separately audited every original installed and actual observed selector array for all ten rows using Counters of complete selector objects. Duplicate extra count is **zero on both sides for every row**. Thus V1 selector set differences lose no multiplicity in this actual dataset. `selector-deltas-v2-multiplicity-audit.json` includes exact original before/after arrays and counters, preserving actual order; candidate already uses the exact observed array, not set reconstruction.

## Unchanged boundaries

Candidate SHA256 remains `312926d4089e3d2b3c9d30b9b846bd27a4825e9d9511105aa9761c3f717a87de`. Exact10digest+6selector+1Sourcepin+5finite recipes unchanged. Original four native objects remain UNEXECUTED;115old closure objects/tail unchanged; current graph closure/new guard admission still NOT established. No main edit, Source evaluation/import, producer/native/graph/current acquisition or recapture occurred. Original baseline and V1 report/inventory retained.

A rapid message initially misstated summed removed occurrences as42; the immediate correction and actual machine summary establish26. No actual fact was modified to make the audit pass.
