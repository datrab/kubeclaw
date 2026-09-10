# Independent design review: semantic Review bundle cutover

Decision: APPROVED DESIGN ONLY, with the two revisions incorporated in exact
e07c5c0730e71bed3519ad5a51730e6d7a4dafaf, design Git blob
5307c780c1d4385f92e198851386fa700ee26d91. This is not a source approval, a passed
implementation gate or closure of PCR-SDK-001. Root must authorize implementation.

Reviewed document:
docs/review/remediation/design/run13-review-bundle-semantic-cutover.md.

## Independence and current authority

Reviewer inspected owning sources in a new private standalone
run10-bundle-design-review checkout with verified21b051 tree268ca86b.
After MAIN advanced to680d15eb0ab7344e87b0ab0595d9855acc1f97c9, all mandatory
remote resume files, current register and frozen scope were read again; all196
Review/Project Summary/Project compiler owning files match the inspected snapshot.
The original baseline register was fetched again: exactly47 implementiert IDs
match partial-47-scope.json. Eight overall findings verified/39 incomplete is
not changed by this design. No production edits or native suite runs by this
design reviewer. The separate original HTTP/no-trap review is already complete.

I read all four files from the native Czech counterexample
23e14883ace8868ab5ff0267b086253d43f4af35. It invokes the original committed test's
producer/reader modes and actual disk ArtifactStore, with en produce/read exit0
and cs read exit1 at the existing snapshot digest assertion. Stored332c701d...
versus cs94f60f4c... is real semantic identity failure, not a wrapper exit0 pass.
This review does not claim to have separately rerun that native test; root also
reported its independent reproduction. The counterexample is sufficient to
justify a bounded owner design, not proof that an unimplemented design works.

The pending independently reviewed report-only source d4df6bfd was separately
read for review-report-encoding, governor-history and Project recovery.
It preserves governor get_json read shape and storeReviewBundle, and already
restores source/report modes independently. Its outer codec is not a semantic
bundle version selector.

## Why this scope is coherent

The actual owned value is assembled by prepareReview/buildReviewSnapshot,
including initial, slice and expanded snapshots. snapshotReviewBundle and its
owned-snapshot recheck both hash the normalized whole value. storeReviewBundle
uses that digest in artifact identity and checks the stored object. All must
select the same semantic version; changing only the writer or only an Artifact
codec is insufficient.

Both valid and invalid governor builders hash a baseline containing the same
locale-sensitive changedManifestDigest/head ordering. isReviewReport verifies
that baselineId; history loading currently strips version by returning a naked
baseline. Expected pair validation must occur before extraction/reuse, not after
a new-version baseline has overwritten the old authority.

Summary is a real downstream owner of report.bundleDigest and coverage, using
Core-supplied full Artifact refs. Its present canonicalJson(bundle) comparison
needs the explicit bundle/report/governor pair. It has no Review-plugin dependency;
private cross-plugin imports would violate the existing package boundary.

The design's paired map is therefore appropriate:

- Historical absence: bundle.v1, governor.v1 and report.v2 under original
  canonicalJson. Old accepted JSON, field absence, graph and effect bytes remain.
- Explicit graph-owned reviewSemanticEncoding review-semantics.utf16-v1:
  bundle.v2, governor.v2 and report.v3 under existing portableJson.
- Report outer encoding stays a separate authority. Portable outer plus old
  semantic mode is valid and stays old semantics. New semantics requires an
  explicitly portable outer report mode; invalid mixed mode rejects before work.

No extra global run-snapshot version, inferred locale, schema weakening or
generic serializer migration is required. Both Project module and final Review
nodes carry the explicit choice. Recovery derives independent source, report
and semantic choices from exact stored graph authority and verifies the entire
recompiled graph, including expected node set and invalid mixed modes. Historical
exported helper defaults and manually supplied old graphs remain unchanged.

## Required revisions verified in final design

1. New Artifact bytes use exact PORTABLE_JSON_ENCODING
   (kubeclaw-json.utf16.v1), not the distinct identity-codec label json-utf16-v1.
2. Fresh en/cs production must reach genuine prepareReview/buildReviewSnapshot
   and governor/report creation from the same admitted repository/policy input.
   Re-snapshotting precomputed inner hashes is not this gate. Existing inner
   evidence, policy, repository and candidate identities stay separately owned;
   any real dependency failure blocks that path and requires a bounded proposal,
   not an unreviewed blanket migration.

The design also explicitly incorporates my earlier conditions: strict accepted
JSON validation before any version/profile reflection; getter/Proxy rejection
without traps; both governor builders; baseline version retention; bounded Summary
package API/codec parity; exact old read/write operation payloads; full-reference
verification; no error-to-miss or newest-value preference; independent inner
evidence encoding and original byte budgets.

## Implementation acceptance remains outstanding

The required tests are proportionate to the persisted owner cutover: actual
archived old/new Core/FileJournal/ArtifactStore requested/accepted/completed
read/write SIGKILL prefixes, no duplicate calls, accepted uncertainty preserved;
genuine original Review lifecycle across later attempts; initial/slices/expansion
and both governor branches; native new locale producer and persisted-reader cases;
full-reference Summary pair/coverage/corruption negatives; strict canonical
schema/no-trap parity; authentic CLI/graph/package-pin recovery from current
checkout archives; unchanged original suites and fresh-head integration checks.

A semantic version may select only its declared digest contract; Artifact encoding
does not authenticate unrelated semantic authority, and an unkeyed rehash is not
a proof against arbitrary complete historical rewrite. No Gateway/model success,
full Product delivery, deployment or all47 completion is claimed.

Next: root may authorize a separate coherent implementation package after the
report-only source is integrated/reconciled. Keep old producers archived and raw
failures intact. Freeze source, obtain a separate independent implementation
review, repeat the genuine gates and use exact-parent fast-forward integration.
This reviewer made only this report; no MAIN, CI, deployment or external messages.
