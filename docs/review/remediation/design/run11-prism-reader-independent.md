# Independent Prism registered-reader design review

Proposal approved for bounded implementation, NOT an implemented repair.
Reviewed remote 49211bfba8d506d2045d36fe47fbd74a46f85383 / local925787f;
fresh main a43aa256bdce35d7f9c44d5d661e59c4055e562e. All3,844 proposal
blobs/modes/types matched freshly fetched remote before creating this own
run11-prism-reader-review checkout. Mandatory remote resume/register records and
original PCR-SDK-001 requirements were reread. No production source modified.

## Independent reproduction

Executed unchanged `node docs/review/evidence/run10-prism-registered-reader-probe.mjs`
and `node docs/review/evidence/run10-prism-reader-replay-design-probe.mjs`.
Both completed exit0. Original registered stages, Git source, Core, ArtifactStore
and FileEffectJournal produced actual refs/receipts/bytes. Empty policy reaches
the deliberately refusing loopback HTTP endpoint (503, no service result).
Admitted mixed-case policy fails before HTTP at the unchanged reader's locale
digest check. These are real counterexamples, not successful full Prism delivery.
Raw independent output: docs/review/evidence/run11-prism-reader-independent.txt.

The second diagnostic uses original saved real request/receipt records and calls
actual assertMatchingRequest. Unchanged invocation matches; either changed
operation or added expected-reference payload conflicts. It confirms exact
portable bytes/digest/length for the saved receipts, but does NOT execute crash
recovery or implement the repaired reader. The fresh reproduction separately
creates new genuine stage records and independently reaches the same defect.

## Binding and compatibility assessment

Keep get_json, resource, namespace/digest payload, invocation position and ordinal
exactly unchanged. Effect identity validation precedes reuse of completed receipts;
changing payload alone is incompatible even when the effect ID itself is stable.
No extra invoke belongs in the verification helper.

Select encoding from the EXPECTED Core-issued ArtifactRef, not response metadata,
transport profile, current run profile or a guessed locale. Compare the complete
returned reference to that expected object using existing accepted-JSON portable
comparison; this binds all producer fields, namespace, ID, media type, size,
digest and optional encoding. Require the original same-run, JSON media type,
input digest and maximum-size gates, plus digest/length equality for reconstructed
bytes and response metadata. Reject unknown/present-invalid/undefined encoding;
absence alone chooses legacy. Full reference mismatch must fail closed even if
latest logical-ID/digest lookup returns another producer's identical content.

For an explicit UTF16 reference, portableJson(value) reconstructs the owning
producer's bytes. For an untagged reference, retain exact original canonicalJson
verification. This preserves historical same-codec reads and existing cross-locale
failure; do not relabel/guess/retry or claim to recover unavailable legacy bytes.
The existing verifiedArtifactJsonText helper requires ORIGINAL jsonBytes and a
different response shape: do not fabricate those fields from get_json and claim
the result proves original transport bytes. This proposed reader reconstructs
only the bytes promised by the expected stored encoding contract.

## Required implementation acceptance

Actual registered-stage portable mixed-case/Unicode and legacy vectors must pass
the reader without a fake successful Prism response; an explicitly refusing
diagnostic endpoint is an honest downstream boundary. Corrupt expected/returned
owner/ref/codec/digest/size/value cases must reject. Preserve original operation,
payload and ordinal in actual journal requests. Test real completed-receipt reuse
without a second adapter effect, requested admission, and accepted-without-receipt
uncertainty. ArtifactStore exposes no receipt method: that original uncertainty
must remain EFFECT_RECOVERY_RECEIPT_UNAVAILABLE, not invented safe retry.

Reconcile independently integrated SDK/runtime-dispatch source first. Do not edit
baseline archive ownership or retag old records. The downstream designRequest
artifact-ID format mismatch is distinct and remains open. Full Control DB/browser
publication is not a prerequisite to this bounded serialization reader contract,
and none is claimed. Independent source and real tests are required after code
implementation; this design approval does not authorize finding closure.
