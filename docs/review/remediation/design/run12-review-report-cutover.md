# Minimal report-only artifact encoding cutover (proposal)

NO production changes. OPEN until implementation and independent genuine tests.
Original counterexample: remote4ac681dd400fd8dd2c0310c7fe696571005d290f,
based on fresh main a43aa256bdce35d7f9c44d5d661e59c4055e562e. Original source
and current mandatory resume/register/SDK requirements inspected. Own isolated
run12-review-report-design; no cache-profile or Prism source writes.

## Reproduced boundary

Unchanged original report builder generates schema-admitted sha256:aa... and
sha256:af... item keys. Original storeReviewReport, actual ArtifactStore and Core
EffectCoordinator/FileEffectJournal execute native en-US write, en-US completed
replay and da-DK completed replay. First two pass; Danish replay rejects the
returned original artifact after recomputing legacy locale-dependent report
bytes. The completed journal remains byte-identical. Independent rerun exit0
confirms the counterexample, not repair. Typed findings/governor are admitted
fixtures, not real verifier/provider findings or full Review stage acceptance.

## Why returned ArtifactRef encoding alone is insufficient

The old report producer uses canonicalJson(report), invokes put_json with NO
encoding field, and computes the expected digest before invoke. Its existing
receipt is untagged. Merely selecting portableJson after replay either rejects
legitimate old bytes or silently assigns old content a different digest. Selecting
from returned metadata would also let the adapter response authorize a contract
change. Unlike Prism's read-only consumer, this owner must choose the write
encoding BEFORE first persistence, and check the response against that choice.

## Proposed smallest explicit authorization boundary

Add one optional closed Review-stage config selector, provisionally
`reportArtifactEncoding: "kubeclaw-json.utf16.v1"`. Absence alone means legacy;
present undefined/null/unknown values reject, after accepted-JSON validation.
This is an explicit REPORT-ONLY version contract, not report content semantics,
cache identity, runtime dispatch or bundle identity. Keep review-report.v2,
strict admission, report item IDs, report logical artifact ID, policy digests and
bundleDigest semantics unchanged. Do not extend the cache-only v4 profile.

The selector is authored into genuinely NEW pipeline definitions by the owning
definition producer/operator. Core already snapshots complete StageDefinition
nodes including config in the immutable execution graph. Resume must load that
stored selector, and changed/missing/added config must trigger original graph
identity mismatch. Do not inject a current default into a restored definition,
infer from missing effects, use a latest package/cache/transport profile, or
reinterpret an existing graph version. New-definition opt-in must be visible and
tested; a runtime default that also changes old resumes is forbidden. Existing
package provenance pins and recovery checks remain enforced, not bypassed by
the test. If this explicit immutable-config signal cannot be proven, stop and
design a separately named run-owned report profile/version; do not widen cache.

For selected new runs, storeReviewReport keeps operation/resource/invocation
position unchanged but adds ONLY encoding to its put_json payload and computes
the expected portableJson(report) digest/size. Response validation must require
that exact expected encoding plus original ID/namespace/media type/complete
producer/digest/size binding. For absent selector, emit the exact original
request shape, canonicalJson bytes, artifact ID and expected untagged metadata.
Do not manufacture an extra read, use a new idempotency key or retry on mismatch.

The report's semantic schema can remain review-report.v2 because all report fields
and item identities retain their meanings; the paired immutable selector and
ArtifactRef encoding explicitly identify the newly persisted JSON bytes. The
outer artifact digest continues to mean SHA256 of actual bytes, not a new hidden
domain preimage. A future change of report item/policy/bundle digest meanings
would need its own explicitly paired semantic version and is NOT authorized here.

## Exact historical replay obligations

Old pending/requested writes must retain operation put_json, resource canonical
ID review-report:<original attempt/bundle identity>, payload namespace/mediaType/
value WITHOUT encoding, exact original report content and invocation ordinal.
Original EffectJournal identity/payload checks apply before receipt reuse; adding
encoding to those pending requests conflicts even if the effect ID is unchanged.
Old completed replay must reuse the exact stored request/result/journal bytes;
same-locale passes and known historical cross-locale verification may remain
fail-closed. Do not claim repairing unavailable old locale bytes by guessing.
Accepted-without-receipt remains the original uncertain recovery condition;
neither another artifact write nor a synthetic completed result is authorized.

New-profile pending/completed replay must keep its explicit payload tag stable
across en/da/tr/sv and reject tag removal/change, wrong owner/ref/digest/size,
altered report value and non-JSON shapes. Native original producer → real CAS →
real EffectJournal replay must establish exact new byte identity, unchanged
historical archived request/receipt prefixes, no repeated adapter side effect and
actual graph-config authority across restart. Unit/fake invocation contexts alone
do not establish those recovery guarantees. Keep failure evidence.

## Scope and next action

Owning paths: Review config schema/parser, report-storage's report-only branch,
definition producer opt-in if authorized, and original real persistence/recovery
tests. storeReviewBundle stays exact legacy; shared validation helpers must not
accidentally switch that separate producer. The adjacent gate-coverage bundle
write is a distinct remaining consumer, not silently covered by this report fix.
No blanket claim that hexadecimal keys are locale-safe. No full provider/model,
browser/database/deployment gate is invented for this bounded serialization fix.

## Concrete ordinary producer and recovery selection

Code scan finds the production storeReviewReport caller only in
review-report-flow.persistReviewOutcome; the original builder, storage owner and
attachReviewReport remain one flow. Project compiler.ts.moduleStages and
coverage.ts.cumulativeStages author the ordinary module/final Review configs.
Do not ship an opt-in helper while those normal fresh producers remain legacy.
Their genuine NEW project compile path must emit the report selector in every
generated Review stage. Use a separate finite report-format compiler argument,
independent of the existing sourceIdentity argument; current fresh compile/CLI
selects portable report mode. Preserve exact old output when explicitly compiling
legacy report mode, including both module and cumulative Review config bytes.

project/recovery.ts currently recompiles from sourceIdentity only. It must read
the immutable stored graph first and derive the REPORT compiler mode separately
from the expected generated Review nodes' finite stored selectors. Old source
encoding does not imply old/new report encoding: old portable-source graphs
still have legacy reports. All absent report selectors means legacy; generated
portable-report graphs must have the exact selector on every expected Review
node. Unknown/present-invalid or inconsistent selections reject. Recompile with
both stored source and report modes, then invoke unchanged verifyPinnedGraph;
do not copy arbitrary saved config into the supplied project and mask changes.
No Review nodes needs no producer switch, but must still match the complete graph.

The initial compile used merely to obtain runId in current recovery.ts must not
authorize new report defaults; parse/validate the project identity first or use
an explicitly legacy preliminary compile that is never treated as the recovered
definition. Historical archived producer/compiler fixture and original CLI chain
must reproduce the exact old graph, requested write shape and digest. Standard
explicit pipeline.json graphs retain their authored config and are never silently
rewritten by Core; future explicit definitions/templates opt in visibly. Adding
the selector to an already saved pipeline is an identity error, not migration.
This is controlled new-producer selection, not a generic default serializer change.

Config acceptance must be owned by review/schemas/config.schema.json plus the
owning runtime parser. Validate accepted JSON before getter-prone field access,
then allow exactly the finite string when the property is present. Stage config
parsing must enforce it even on paths that later fail before report persistence.

## Existing report consumers

project-summary reads original bytes using get_json_bytes and the expected full
ArtifactRef via verifiedArtifactJsonText. This supports explicit portable report
encoding without changing report semantic schema; its bundleDigest/coverage
checks refer to the separate legacy bundle and must remain unchanged. Actual
original reader acceptance for new report bytes is required, not a static claim.
review-governor-history uses unchanged get_json then report schema/digest/size/
attempt checks; the real ArtifactStore validates original bytes before returning
that value. Re-run actual producer/store/history consumption with typed valid
governor fixtures. Its lack of explicit full returned ArtifactRef comparison is
a distinct preexisting integrity boundary; do not silently add legacy
recanonicalization or claim this report encoding fix resolves that issue.
attachReviewReport exports the actual ArtifactRef.digest into review.report_digest;
there is no separate whole-report digest field to retag. Every old semantic
report field/item ID and bundle digest must remain exact.

Root must approve this explicit-config/producer/recovery authority or request a
distinct run-owned profile before implementation. Reconcile fresh SDK/cache integration first;
independent reviewer must reproduce genuine old/new writer and replay matrices.
This checkpoint is a design, not repair completion or finding closure.
