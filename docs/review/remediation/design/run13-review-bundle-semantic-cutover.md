# Review semantic bundle cutover — design for independent review

Status: DESIGN ONLY; no production change and no finding closure.
Run: run13-sdk-bundle-review-20260910t020224.
Authority: MAIN 680d15eb0ab7344e87b0ab0595d9855acc1f97c9, plus separately reviewed report-only candidate d4df6bfd6e84ac23d3e7095d1d8cfb609bc50d8c.
Proof: 23e14883ace8868ab5ff0267b086253d43f4af35, docs/review/evidence/run13-sdk-bundle-czech-probe.{mjs,txt} and source-hashes.json.

## Actual defect and bounded ownership

The unchanged original parseReviewInput → snapshotReviewBundle → storeReviewBundle → real ArtifactStore producer succeeds in en_US. Reading the same stored artifact and running the original snapshot reader succeeds in en_US but fails in cs_CZ: persisted sha256:332c701d9c2896b952cda3f88bfc072c98871cb01a39bbdd567fa940677882f9 versus recalculated sha256:94f60f4c08a6a3706902e40fdf15effd73d968ccebaa8f6cdcef7d65836896d4. Czech orders the admitted fixed key changedManifestDigest after head. No new fixture payload, mock store, copied serializer or altered assertion produced that failure.

This proof uses the original direct disk ArtifactStore path, not a full Core journal or successful model execution. Those distinctions must remain in final evidence. The report-only cutover preserves storeReviewBundle byte-for-byte and therefore does not fix this domain.

The owner is the decision-Review semantic bundle, not generic ArtifactStore, cache identity, report outer encoding, runtime transport or every SDK import. Required coupled consumers are:

- review-preparation buildReviewSnapshot, initial and slice snapshots; stage expandedDispatch rebuild.
- review-bundle-contract/parser/bounds/snapshot; snapshot identity must include the selected schema and serializer.
- review-report-storage storeReviewBundle; report-builder bundleDigest/revision/governor binding.
- BOTH buildReviewGovernorSnapshot and buildInvalidReviewGovernorSnapshot; their persisted baselineId also hashes keys containing changedManifestDigest/changedFileCount.
- review-report-contract isReviewReport/validGovernor and review-governor-history readReviewGovernorBaseline, which currently drops report/governor version when returning a naked baseline.
- protocol admission and all immutable snapshot/budget checks that assume the v1 constant.
- Project compiler module-review AND cumulative final-review builders; exact stored graph recovery.
- Project Summary verifyFinalReview, currently recalculating bundleDigest with legacy canonicalJson.

The governor and Summary entries are concrete source-coupling requirements, not claims that this run separately executed their native failure paths.

## Proposed explicit version map

A separate finite stage-config field, provisionally reviewSemanticEncoding: 'review-semantics.utf16-v1', authorizes this domain before any effect is journaled. Absence means exact historical semantics. Present null, undefined, unknown values, extra profile fields or malformed JSON are errors, never legacy defaults.

| Frozen semantic mode | Bundle | Governor | Semantic report | Digest serializer |
| --- | --- | --- | --- | --- |
| absent / historical | review-bundle.v1 | review-governor.v1 | review-report.v2 | original canonicalJson |
| review-semantics.utf16-v1 | review-bundle.v2 | review-governor.v2 | review-report.v3 | existing portableJson / json-utf16-v1 |

The new report version changes the owned semantic pair, independently of the already approved reportArtifactEncoding field. The new report schema can otherwise preserve its original closed fields, item identity rules, outcome and coverage checks. Do not introduce arbitrary user-selectable serializer strings or a fallback chain.

New semantics requires the independently explicit portable report outer encoding: the existing PORTABLE_JSON_ENCODING constant, whose literal is 'kubeclaw-json.utf16.v1'. This Artifact constant is distinct from the 'json-utf16-v1' identity-codec label. This is a compatibility constraint, not an inference: a portable report with absent semantic selector remains a valid old report-v2/bundle-v1/governor-v1 combination. Cache profile, run-snapshot.v4, source identity encoding, current compiler version and current locale never authorize a semantic migration.

The actual external names/version constants must be checked against canonical schema owners before implementation. Versioning all three coupled envelopes is intentional: do not reuse report.v2 while silently changing its governor/bundle digest contract.

## Creation and recovery authority

Only genuine new Project compilation opts in. Preserve explicit historical modes on exported helpers and manually supplied old graphs; omitted helper arguments must not change archived compilers that import current helper modules.

Carry source mode, report outer mode and Review semantic mode as separate compiler inputs. New compilation selects the new semantic field on every original module-review and final-review node. Historical CLI/source snapshots retain exact original graph/config bytes, pinned packages and request ordinals.

Recovery obtains the selector from the full original persisted graph, independently from the existing source/report selectors. Validate the exact expected Review node set, both kinds of Review stage, uniform same-run semantic mode and valid combinations; reject missing/mixed/extra/tampered nodes or profiles. Recompile and compare the complete graph under the recovered independent choices. Do not infer new mode from another marker or normalize the old graph.

No new run-snapshot version is needed solely for this graph-owned selector. A proposed implementation that instead adds a run-global authority must return for design review.

## Bundle and governor semantics

The v2 bundle owns the serializer of the normalized entire bundle and its digest; the v1 branch preserves accepted original normalized values and exact legacy bytes. New immutable snapshot validation must re-use the SAME selected serializer as creation. Byte budgets measure selected bytes, not always canonicalJson. Original JSON bounds, required fields, closed schemas, sorting and semantic validation remain.

Before any schema/version/profile reflection (Object.keys, hasOwn, property access), use the existing strict no-trap portable-JSON precondition to reject sparse arrays, nonfinite values, proxies, getters, cycles and exotic objects. This is an admissibility check even on the legacy branch, not authority to change legacy serialization. Apply it to bundle parser/selector, report/governor selectors and profile admission; do not repeat the previous selector holes.

The v2 governor baselineId hashes its explicit governor version plus baseline with portableJson. Both valid and invalid builders use the same version-aware owner. Carry the expected semantic mode into history loading; validate the actual report/governor pair, producer, run/stage/attempt, digest and lifecycle before extracting/reusing baseline. A baseline from an unexpected pair cannot be silently reused, treated as missing, overwritten or reinterpreted. Preserve old error/uncertainty behavior and exact old artifacts.read request arguments.

New semantic report-v3 admission binds v2 governor to the report's policy/revision and bundle-v2 digest contract. Legacy report-v2/governor-v1 remain independently admitted under their original algorithm. A report cannot use a portable governor under a legacy version or vice versa.

## Artifact effects and reader boundary

Legacy storeReviewBundle continues the exact original artifactId, namespace, media type, put_json value and absence of encoding. Legacy governor reads preserve their original get_json operation/resource/payload; no new field may alter a pending old effect key.

New bundle storage uses the existing explicit PORTABLE_JSON_ENCODING ('kubeclaw-json.utf16.v1') Artifact encoding, selected by the already frozen semantic owner, and verifies returned full reference, actual bytes, size and producer. The bundle artifactId continues to derive from its own versioned semantic digest; do not merge old and new same-byte references or use a newest/miss preference to conceal a mismatch.

New history and Summary reads must use the original real registered ArtifactStore and full reference verification, with existing encoded-bytes support. Preserve historical effect shapes on historical paths. Outer Artifact encoding authenticates bytes; it is NOT a selector for bundle/governor/report semantics. Conversely a semantic version does not excuse a wrong/missing required outer encoding.

Project Summary must reject unsupported/mismatched bundle/report/governor schema pairs before recalculating digests and before marking final review valid. Preserve producer, full-ref, required coverage, outcome, revision, policy and requirements checks. It currently has no plugin-review dependency: do not import private Review src through another plugin or defeat package pin/closure validation. Prefer a bounded explicit schema-version→existing SDK-codec mapping at this consumer plus parity vectors against the owning Review validators. If shared nontrivial contract code is necessary, expose it through an approved owning package API and update manifests/pins; that structural addition needs review.

Inner evidence.encoding remains independently authoritative, including legitimate historical/portable evidence combinations. Do not serialize already canonical evidence content under a different codec or silently rewrite its digest.

## Opaque inner identities and scope limit

This cutover owns the whole bundle digest, its persisted outer bytes and the coupled governor/report/reader contract. It does not automatically migrate policyDigest, changedManifestDigest, candidateManifestDigest, context paths/references digests, proposal/finding identities, repository-audit prepared-plan IDs or scalable-review compilation IDs.

Those inner identities keep their explicit current owner/algorithm. Any value re-derived during the new cross-locale path must be checked against its actual admitted producer/reader schema; a failing real inner producer gate is a blocker requiring an explicitly owned extension, not a license to skip it or substitute a precomputed hash. There is no blanket claim that fixed ASCII or hexadecimal property names are locale invariant. Similarly, old explicitly frozen digest versions remaining locale-dependent are not authorization to rewrite their history.

The native completion statement must say whether it proves persisted old values reopened under a new locale, fresh production of new values in both locales, or both. These are different gates.

## Required genuine regression before approval

1. Preserve the exact original en/en/cs red proof and source hashes. Add new admitted v2 bundle producer/store/read cases in en, cs, da, sv and tr. En→cs must genuinely reach the original owning snapshot, artifact storage and downstream digest reader; also produce the same admitted new semantic inputs independently in at least en/cs through genuine prepareReview/buildReviewSnapshot and governor/report creation from the same admitted policy/repository input. Merely resnapshotting a fixture carrying precomputed inner hashes does not satisfy fresh production. An actual inner-identity failure stays open under its own explicit owner.
2. Original registered Core + disk EffectJournal + ArtifactStore must cover bundle WRITE and history/Summary READ requested, accepted and completed SIGKILL boundaries for genuine archived old producer/compiler sources and the new owner. Restore old/new graph modes separately. No fabricated journals or equivalent-looking requests.
3. Verify exact old persisted request keys, operation/payload bytes, prefix and absence of duplicate provider calls. Accepted-without-receipt uncertainty stays uncertain. Completed recovery must not re-run the old effect under a new key.
4. Run a genuine original Review stage snapshot/governor/report path, including initial, slices and expanded context, valid and invalid governor branches, and a later certified attempt loading the previous baseline. Use actual Core lifecycle and original disposable repository/ArtifactStore; no fake Core lifecycle to claim this gate.
5. Run the original Summary owning consumer on stored matched v1/v2 and v2/v3 bundle/report pairs, actual full refs and coverage. Wrong pair, unknown version, tampered digest, wrong producer, missing required encoding or same-byte foreign ref must fail closed. No private-plugin import.
6. Original canonical schema generation and strict Foundation Ajv parity; no-trap counters for all new selectors; original invalid JSON/locale vectors unchanged.
7. Real frozen source/graph/CLI histories resolve sources and dependencies from the current checkout, without old Git objects. Include independently varied source/report/semantic modes and both Review node builders; preserve exact old graph and effect identities.
8. Repeat affected original full Review, compiler/recovery, Summary and Artifact/Journal suites, typechecks, generator and bounded lint on the freshly reconciled final MAIN head. Preserve all red evidence and zero-skip passing raw. Independently review the exact frozen combined source.

None of these local gates claims successful external model/Gateway acceptance, deployment, browser acceptance, or completion of other findings.

## Next action

Independent design review first. After explicit approval, author a separate isolated package and small remote checkpoints; implement the complete coupled owner map, not an outer-only patch. PCR-SDK-001 and the frozen47 remain open until this and the finite remaining original consumer review have genuine evidence.
