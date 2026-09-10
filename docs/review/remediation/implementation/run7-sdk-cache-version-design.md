# Review cache: bounded producer/reader version proposal

Status: DESIGN ONLY; not implemented or approved. PCR-SDK-001 stays open.
Transport source/checkpoint is frozen separately and is not changed by this work.

## Fresh source and original acceptance

Own sparse checkout `run7-sdk-cache-design`, no dependency install, source remote
`a43aa256bdce35d7f9c44d5d661e59c4055e562e` equals local `b3d2f7ba` and whole
tree `ee96baf145fa19235f170571791e904b35203ba9`. Remote head was freshly read.
Mandatory resume README, work-items, package-checkpoints, root-checkpoint and
current register/original SDK requirement were reread. The original baseline
register yields exactly 47 implemented IDs, matching partial-47-scope.json.

Independent source/raw/checkpoint at remote
`05faa821ad473135654d64702170d7835f5fa661`, branch
`fix/resume-47-run7-sdk-cache-3d6cfd2`, was inspected and all four named Git blobs
matched the remote tree. Paths are the three
`docs/review/evidence/run7-sdk-cache-context-*` files and
`implementation/run7-sdk-cache-context-checkpoint.md`.

The original component job, Echo parser, context-request requirements and
`reusableReviewResult(..., true)` accept additional `I`/`i` assessment keys.
Actual Core/FileEffectJournal/ArtifactStore writes and rereads en-US, while
tr-TR rejects the same authority. This is a real cache admission/storage
counterexample, not successful model/Gateway execution. Extra accepted
assessments and valid context requests must remain accepted.

## Three separate owning proofs

`review-content-cache.ts` currently computes both `valueDigest` and the unsigned
record `digest` with legacy canonicalJson; its schemaVersion is v1. The logical
cache key covers unitDigest and the five-field runtime/policy identity. Its
actual producer has fixed field names, so the demonstrated I/i difference is in
the cache VALUE, not a reason to change this lookup identity.

`repository-audit-cache.ts` adds an outer artifact digest by reserializing the
whole record, reads `get_json`, and compares every same-ID candidate's raw
artifact digest before selecting the earliest trusted attempt. Core's original
ArtifactCheckpointRecorder retains all prior attempt refs, not just the newest.
Its cache trust boundary is same run AND same stage, strictly earlier attempt.
These facts make a default v1-to-v2 serializer replacement unsafe even if its
first put/get succeeds.

Original StageExecutor also derives effect keys from attempt plus invocation
sequence. Changing an old run's pending artifacts.write record or artifacts.read
operation changes the original requested payload at that stable key. Record
versioning alone does not preserve old requested/accepted effect replay.

## Recommended coherent design (requires root approval)

1. Add a separately owned canonical finite ReviewCacheProfile selecting
   review-content-cache.v2 plus the existing portable JSON encoding. Do NOT
   infer this from RuntimeDispatchProfile, EvidenceVersion or unrelated digests.
   The next genuine run snapshot version (v4, after the transport v3 package)
   requires BOTH its existing transport profile and this explicit cache profile.
   Existing v1/v2/v3 snapshots retain their exact original digest/shape semantics
   and select the legacy cache producer for the whole run. A v3 run therefore
   intentionally has portable transport but legacy cache. No automatic migration.

2. Thread the persisted cache profile through original executePrepared, Runner,
   StageExecutor and closed PluginContext, retaining its canonical frozen value.
   Both cachedReviewJobs and cachedVerificationJobs pass this owning profile to
   the existing runWithReviewCache/RepositoryAuditArtifactCache producer path.
   Public invoke-only/generic cache APIs need an explicit documented selection;
   absent historical selection must not silently become a different producer.

3. Add an exact record.v2 contract: current unit/key/identity/value fields stay;
   its schemaVersion selects portableJson for valueDigest AND the unsigned
   record digest. New v2 admission validates strict JSON and exact owned fields;
   invalid sparse/nonfinite/getter/exotic/cyclic values still reject without
   executing getters. The old v1 parser retains its original validator/codec;
   no newly closed v2 field rules are retroactively imposed on old v1 records.
   Unknown versions and profile/record mismatches fail closed, never a cache miss.

4. New v2 ArtifactStore put_json includes the existing explicit portable encoding
   and checkpoint:true. Its returned ref must bind exact namespace, artifact ID,
   media type, producer, size, digest AND encoding. New v2 reads use existing
   get_json_bytes with the FULL selected ArtifactRef, then
   verifiedArtifactJsonText(response, expectedRef), before checking inner v2
   identity/value/record digests. Do not reserialize legacy outer bytes as proof.
   A returned foreign same-byte reference, unknown encoding or mismatched profile
   is an error. Core's existing checkpoint implementation already verifies this
   encoded write path; it must not be bypassed or reimplemented in the cache.

5. Old run profiles keep the exact old write/read invocation shapes needed by
   pending EffectRequests. They never rewrite hits into v2, guess the old locale,
   or treat an unverifiable old record as a miss. The demonstrated historical
   tr-TR read remains a visible legacy integrity error unless a separately
   authorized original-byte semantic migration is designed. This is a controlled
   new-producer cutover, not a claim of universal historical portability.

## Same key, retained candidates, no invented miss

Keep the original logical cacheKey and `repository-review-cache:<hash>` ID.
Do not invent a new lookup key/prefix that bypasses unresolved old candidates.

| Original run/record situation | Required behavior |
| --- | --- |
| Old v1/v2/v3 run, reusable legacy record | Validate as legacy; hit; retain exact original ref; no v2 write or dispatch. |
| Old run, requested or accepted legacy artifact operation | Reproduce exact old operation/payload; original Core replay/uncertainty gate remains authoritative. |
| New v4 run, fresh cache miss | Produce only record.v2 with portable inner and outer proofs; keep ordinary logical cache key. |
| Later attempt of the same new run | All genuine producer refs are v2 under the immutable run profile; same-value writes retain identical bytes/digest and cannot create a version-only candidate conflict. |
| Previous run's old v1 ref sharing that ID | Existing same-run/stage admission excludes it; exact selected-ref reads prevent a newer foreign metadata row substituting its bytes. |
| Same-run mixture of legacy/v2 refs or changed encoding | Explicit profile/history-integrity error before model execution; no newest-version preference, no ignored legacy candidate, no newly allocated key. Such a mixture is not emitted by the frozen genuine producer. |
| Distinct same-version values under one immutable logical key | Keep existing conflict rejection. This proposal does not silently change cache replacement/reusability policy. |

Thus the normal upgrade does not create mixed-version candidates: existing runs
remain v1; genuinely new run ownership starts v2. This also avoids quietly
turning an old stored context-request into another dispatch. The existing
nonreusable-value refresh policy can still independently produce a same-key
content conflict; changing that policy is not required by version-only migration
and must not be hidden as part of this repair.

## Alternatives not selected

- Merely adding record.v2 but keeping a default writer switch changes pending old
  EffectRequests and produces different outer digests under the same artifact ID.
- A new v2 cache-key namespace or prefer-newest policy can bypass a legitimate old
  unresolved value and dispatch again. Candidate absence under the new name is
  not evidence of absence under original authority.
- Allowing mixed versions by comparing normalized values would require verifying
  BOTH old inner digests from original raw JSON token boundaries, or an explicit
  supersession receipt. The existing verifiedArtifactJsonText proves the outer
  bytes/ref, not those two old inner semantic digests. Implementing a second JSON
  parser/ordering reconstruction or inventing a supersession authority is larger
  and riskier than preserving the original run-owned producer selection.

## Required independent acceptance before integration

- Original admitted component/contextRequest I/i vector through actual cache,
  FileEffectJournal, ArtifactStore and Core checkpoints: new en-US/tr-TR/sv-SE
  writes/reads and later attempts have identical authority and no extra dispatch.
- Actual original v1 cache producer archive (current-checkout resolvable): valid
  same-locale old hit unchanged; wrong-locale old authority stays explicit; native
  requested/accepted/completed SIGKILL prefixes are never retagged or repeated.
- Genuine new run/context/profile production and v1/v2/v3/v4 snapshot reopen,
  plus malformed/future profile, profile removal/downgrade and digest tampering.
- Retain old ref, write same new v2 key/value on later attempts, restart again:
  no version-only conflict; conflicting values, mixed profiles and foreign refs
  reject before execute. A failed read is never converted into a miss.
- Real outer-byte/ref tests vary owner, encoding, digest, size, content and returned
  same-byte foreign reference; inner valueDigest/record-digest corruption remains
  detectable even with an honestly recomputed outer artifact hash.
- Original full Review package, SDK negative/locale tests, artifact/checkpoint,
  EffectJournal, historical CLI, retirement and projection suites; generated
  contract parity and full typechecks. No weakened schema or model-output gate.

No production code, test assertion, register status or main ref was changed.
Next action: root chooses/approves the owning run-profile boundary (or requests a
different explicit authority design), then a separate author branch implements
one coherent package and an independent reviewer reruns the genuine tests.
