# Independent report-only cutover design review

Decision: bounded design APPROVED WITH THE IMPLEMENTATION REQUIREMENTS BELOW. No production implementation reviewed, no repair acceptance and no finding closure.

Reviewed frozen design 95880cc1f724d0fac5bb13ab10b31c52811c4b50 and original counterexample 4ac681dd400fd8dd2c0310c7fe696571005d290f. Current source inspected in the reviewer's own c477cca7d8610e9314cee6a9dddb052db68d5703 checkout (approved SDK 28909f62 plus disjoint approved operator work). No dependency copy or product edit. Fresh Prism main 9c8dde882cdb1299902ed3a82d0b3d67d20c945d is a disjoint baseline-reader change; final implementation must reconcile fresh main and any separately integrated cache work.

## Independent original defect reproduction

Exact archived probe executes original buildReviewReport, unchanged isReviewReport plus strict Ajv report schema, original storeReviewReport, actual ArtifactStore, EffectCoordinator, FileEffectJournal and FileResourceLockManager. Native en-US first write and completed replay pass. Native da-DK completed replay rejects its original artifact reference because locale collation reverses legal sha256:aa/af item keys. Original completed journal bytes stay identical. Independent raw: docs/review/remediation/evidence/run12-report-design-independent.txt. Exit 0 proves the counterexample, not repair; typed finding/governor admission fixtures are not independently discovered project defects or full Review/provider acceptance.

## Producer and authority audit

A finite optional reportArtifactEncoding in the immutable Review stage config is an appropriate separate producer authority. Absence alone retains exact legacy; present undefined/null/unknown rejects through original accepted-JSON validation before any getter-prone field access. Parse it at execute's initial config boundary, including invalid-input/early-return paths, and propagate it to normal finalization, dispatch failure and semantic failure report paths. Do not let returned ArtifactRef select its own expected format.

The single original report writer is reached through persistReviewOutcome. Preserve report.v2 fields, item IDs, bundle/policy semantic digests and logical artifact ID. New mode adds only the explicit encoding field to original artifacts.write/put_json payload and uses portableJson for expected report bytes. Validate returned encoding, digest, byte length, ID, namespace, media type and all producer fields. Legacy remains exact original request/untagged reference; mismatch never causes an extra read, write, changed idempotency key or synthesized receipt.

storeReviewBundle is a distinct legacy producer, conditionally invoked before report storage when gate-coverage evidence exists. Preserve its exact payload and invocation position. This report-only repair does not solve bundle/coverage or every whole-Review cross-locale boundary.

## Compiler and historical cutover

Ordinary producers are compiler.ts moduleStages and coverage.ts cumulativeStages. Every genuinely new module and final Review stage must visibly opt in. Use report mode separate from sourceIdentity; old portable-source graphs still contain legacy reports.

Recovery must derive expected generated Review IDs/types from a validated supplied-project skeleton, compare the stored generated node set, and select only uniform absent or uniform exact portable selectors. Unknown, invalid, mixed, missing or extra nodes are not permission to copy saved config into the supplied project. Recompile using independent source/report modes, then call unchanged verifyPinnedGraph over the WHOLE graph. No-review graphs still undergo complete graph verification. Initial compilation merely to obtain runId must not accidentally apply a new default to historical reconstruction.

Concrete archived producer trap: wave47-project-legacy-resume-cutover-probe.mjs restores archived compiler.ts/source.ts but resolves current coverage.ts. Therefore cumulativeStages' omitted report argument MUST preserve legacy while the new compiler explicitly passes portable, or the historical dependency must itself be archived with verified original provenance. Otherwise the supposedly historical final-review producer silently changes. Assert both module and final historical configs lack the selector before CLI recovery. Archived files must be resolved from current checkout with their original byte/SHA256/Git-blob provenance, never old local Git objects or stale paths.

Existing verifyPinnedPackages remains mandatory. Changing Review schema/source changes package provenance; graph-format selection does not authorize swapping a historical pinned package. State the unchanged package set in historical full-CLI tests; distinguish compiler compatibility from any separately authorized package upgrade. Explicit pipeline.json graphs are not compiler-owned migrations.

## Actual consumer audit

Repository-wide source scan finds project-summary and review-governor-history as report readers, plus attachReviewReport exporting the actual artifact digest.

project-summary uses original get_json_bytes with full expected ArtifactRef and verifiedArtifactJsonText, then verifies digest/size/value and semantic review/bundle/coverage relationships. New portable report bytes are supported by owning ArtifactStore/SDK in principle. The separate bundle stays legacy. Execute this real reader with actual stored report bytes; existing loose summary fixture alone does not prove a strict full report producer.

review-governor-history uses original get_json and checks response digest/size, strict report admission and report attempt ID before reading governor baseline. Original ArtifactStore validates actual JSON bytes through verifiedArtifactJsonText. It does not re-canonicalize the report with legacy serialization. Its missing full returned-reference comparison is an existing distinct authority boundary, not fixed by this report-only change; do not claim otherwise or opportunistically change historical effect shapes.

attachReviewReport must preserve exact semantic facts and publish the actual returned artifact.digest. No independent whole-report digest field needs relabeling.

## Required independent acceptance matrix

1. Original hex counterexample retained. New explicit portable writer and actual CAS/journal completed replay pass across en-US, da-DK, tr-TR and sv-SE with identical artifact bytes, complete reference and journal replay prefix; original adapter side-effect count does not increase. Strict builder/admission is real; identify any typed evidence fixtures honestly.
2. Original pending/requested and completed legacy writes keep exact resource, payload WITHOUT tag, report content and invocation ordinal. Same-locale legacy replay passes; existing unknown historical cross-locale integrity failure remains fail-closed. Accepted-without-receipt retains original uncertainty, never a fabricated completed write. Test with real EffectJournal and ArtifactStore, not only fake invoke contexts.
3. Genuine old compiler/archive plus original CLI recovery retain both module/final absent selectors; independently cover portable-source/legacy-report, legacy-source/legacy-report and newly compiled portable-report graphs. Source and report mode cross-product must not couple. Snapshot/graph/request/receipt bytes remain unchanged where historical. Existing terminal blocked-run CLI proof is not pending/completed report replay proof.
4. Fresh ordinary compile and CLI opt in both module/final stages, explicit authored graphs preserve their selected mode, zero-review case remains valid. Changed project task/agent/module list/source binding, missing/extra Review node, mixed selectors or a selector added to an existing graph must reject through original complete graph checks, without snapshot mutation.
5. Present undefined/null/unknown encoding, non-JSON/accessor input, wrong returned encoding/owner/attempt/artifact ID/namespace/media type/digest/size, tag removal, changed report and missing/corrupt bytes reject before acceptance. These are corruption negatives, not substitute native provider gates.
6. Actual original project-summary and governor-history consume portable and legacy stored reports, preserving report.v2 fields/item IDs and separate bundle coverage semantics. Exercise all report-producing normal/dispatch-failure/semantic-failure paths.
7. Run unchanged original Review package tests, project compiler/CLI and archived CLI regressions, shared SDK/ArtifactStore byte-contract tests, relevant Core snapshot/recovery tests, typechecks and canonical lint. No weakened contracts, source shims, skipped cases or cache-profile widening.

Next action: owning author implements this bounded cutover after root authorization, freezes early coherent source/tests, reconciles fresh SDK/cache head, and receives independent executed acceptance review. This document is design approval only.
