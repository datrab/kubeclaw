# Narrow independent metadata preservation

Reviewer: `/root/release_review`; read-only review. Current committed revision `310b8dca1377e0ef3b5c307fc1f917af8a3c89de`; comparison base `1402b013a0e145a68548c8261296446ea0741598`.

**Verdict: bounded Source/Reader/Quality preservation PASS** for exactly these two prior PASS records and the routine generated-map delta:

- `AP09.1-ready-topics-20261020`: preserves its existing eleven named requirement scopes (GOV-001/003/004/008, ENT-001/002/003/004, DEC-001, STA-001/002), original no-live/no-global-publication limits, and its historical NOT_READY exclusions. Does not newly accept GOV-002 or DEC-002 or resolve all old metadata/publication findings by inference.
- `Reviewed-corrections-20261020`: preserves its existing seven named corrections (SPC-001, CFG-006, FLW-011, EXT-005/006, CFG-016, GOV-006), original documentation/source-only and unrelated pin/publication exclusions. No reapproval of untouched Buster/configuration/capability/lint implementations or historical executions.

Read each exact record's identity, revision, requirements/gates, named pages/sources, checks, review dimensions, summary, limits, openIssues and verdict, plus their prior narrow-impact history for context. The current changed-file set intersects their direct dependencies only at `docs/site/reference/generated-documentation-map.json`. No named implementation authority or their canonical content pages changed in this commit. Other source/diagram/search/Prism preservation belongs to the coordinator's separate reviews and is not inferred here.

## Exact changed boundary

Independently compared full parsed JSON trees, preserving dictionary keys, array lengths/order and every unchanged leaf: **exactly three scalar changes**, no additions/removals or structural changes:

1. `docs/site/reference/images-and-digests.md` → `lastVerified`: now explicitly source review plus local receipt-presence/first-configuration-rejection recheck, with no remote build/deployment/container observed.
2. `docs/site/use/install.md` → `status`: replaces false absent runtime selection with stored selection failing current configuration verification, retaining stop-before-mutation.
3. `docs/site/use/maintenance.md` → `lastVerified`: retains prior local checks, states local selection rejection/synthetic manifest-reader checks, and explicitly disclaims live upgrade/rotation/retirement/bundle observation.

All three new values equal their current owning Markdown header values exactly. These page headers were already included in the corrected independent release review; this review accepts the projection, not a new execution of the tests described by metadata. All routes, owners, audience, sourceDependencies, applicable checks, contentKind, appliesTo, page set/count and every other map entry remain byte-equivalent after those three explicit scalar substitutions.

Read the complete current owner `scripts/docs-governance.mjs` (unchanged between these commits): metadata() extracts exact named single-line header values; the per-page constructor projects Status→status and Last verified→lastVerified directly (`14,37–39,92–116`), alongside independent routing/ownership/dependency/check projections. The script serializes deterministic JSON; `--check` compares existing bytes and exits without writing (`156–166`). This is a generator-owned projection, not another authored authority. The three scalars introduce no new route, grant, implementation interpretation or live-success claim.

## Dimension assessment and checks

- **Source accuracy PASS (delta only):** actual owner projection and exact header equality establish all three changed values; the current selection stop remains truthful and does not imply later checks passed.
- **Reader usability PASS (delta only):** public metadata now agrees with the reviewed reader pages and distinguishes stored-file presence from usable selection; no reader route or ownership/check mapping changed.
- **Quality PASS (delta only):** consistent generated ownership, concise bounded verification language, no duplicated manually edited authority or silently widened acceptance.
- `node scripts/docs-governance.mjs --check`: **exit 0**, “documentation governance passed (167 pages mapped)”. Actual current read-only owner check, not a whole documentation/publication result.
- Structural JSON comparison + exact owning-header checks: **exit 0**, precisely three leaf changes. Generator source diff: empty.
- Current map SHA-256: `291975654090a334cf66c0e903cdbda3f022deb7be46ef6b8c4422ada89c6126`.

No repository file or completion record was mutated by this reviewer. No build/browser/Source-preview/global link suite, historical raw evidence replay or runtime test was performed. This permits preserving those two previously accepted scopes across this exact metadata delta; it does not expand either record or independently accept any other changed input.
