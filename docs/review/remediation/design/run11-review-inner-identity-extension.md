# Review inner identity extension — bounded design

Status: DESIGN ONLY, awaiting independent/root approval. No production changes,
new test execution, candidate acceptance, SDK closure or frozen47 closure.
Run: run16-inner-identity-design, 2026-09-10.

## Authority and preserved evidence

Fresh MAIN is `ff55ab962d16dc0eba5ee6aafa2150abaa723fb5`, tree
`dcd8b5875bf08a414cbd2c9ebfbec52331486e26`. The private standalone checkout
base `3d95e424488032dbfe2c7585d4008408a887757d` matches all 4,090 remote
non-tree entries, including mode/type/blob. Current mandatory resume README,
work-items, package-checkpoints, root-checkpoint and register were read. The
fresh original register at `c38779c71bb92bc15c3fcb89930348e5417aa475` again
produces exactly 47 implementiert IDs, equal to partial-47-scope.json.
PCR-SDK-001 requires genuine ArtifactStore/EffectJournal evidence and controlled
persisted digest migration; a statically plausible design is not that evidence.

This extends only the explicitly deferred inner-owner boundary in approved
design `e07c5c0730e71bed3519ad5a51730e6d7a4dafaf`,
`design/run13-review-bundle-semantic-cutover.md`, independently reviewed at
`be25cf15b8e5305e66e680d65cd77163e4867182`. Its bundle/governor/report version
map, immutable graph authority, exact legacy effects and full native gates
remain mandatory. The active separate implementation checkpoint is
`c6ef941d0c330e74466bb7351d7760b53cb2575c`; this document does not approve it.

The concrete new counterexample is durable at
`cf45e370564dea42879c76cb83cfed3ffec03ea1`, branch
`fix/resume-47-run11-semantic-producer-e52a43e`. Its original child/test and
`docs/review/evidence/run11-semantic-producer-{original-native.txt,classification.json,checkpoint.md}`
record six actual Core/registered Review/ArtifactStore/FileJournal executions:
en/cs, each with gate, lean and audit. All six original runs succeeded, but the
cross-locale identity assertion failed. Equal genuine Git revisions, changed
manifest, context and selection do not yield equal policyDigest in any profile.
Lean/audit generated fact parsed values are equal but their bytes/digests differ;
candidate parsed differences are only source.digest references to those facts.
Candidate IDs themselves are equal. Existing first/second fixture failures are
retained and are not product failures. This is a local original HTTP contract
fixture, not successful external model/Gateway verification.

No new execution was performed here. A subsequent helper action was safety
flagged; it was not retried, rephrased or rerouted. Existing red proof remains
the evidence, and no later candidate green result is implied.

## Exact original owners and cause

All paths below are relative to `skills/nova/plugins/review/src/`.

| Owner | Original contract and persisted/recomputed impact |
| --- | --- |
| review-policy-contract.ts / review-policy-parser.ts | Closed review-policy.v2, fixed sections and finite weight keys; selected original profile/settings/authorized override is actually parsed. Root keys schemaVersion and scope are admitted together. |
| review-policy-resolver.ts | digestReviewPolicy hashes canonicalJson(policy); resolveReviewPolicy computes selected digest AND every sources provenance digest, freezes and WeakSet-brands the result. |
| stage.ts / review-reducer.ts | resolvedStagePolicy selects the policy. invalidPolicyResult recomputes digestReviewPolicy and checks brand/frozen state; changing the resolver alone would reject its new digest. |
| review-preparation.ts | buildReviewSnapshot uses policy.digest, generates facts, mines/certifies candidates, then includes their evidence in initial, slice and expanded bundle creation. |
| simplification-fact-producer.ts / simplification-contract.ts / simplification-parser.ts | Original generated simplification-facts.v1 is parsed before canonicalJson content/digest creation; revision contains changedManifestDigest and head. |
| simplification-manifest.ts | Original simplification-candidate-manifest.v1 is parsed, serialized and hashed; WeakMap certification binds object, revision, policy and digest. isCertifiedSimplificationManifest recomputes legacy bytes. |
| simplification-miner.ts | source.digest points to the actual fact evidence digest. candidateIdentity excludes source, hashes the existing simplification-candidate-identity.v1 semantic fields. No candidateId change is established by this proof. |
| review-bundle-contract/parser/bounds and review-evidence-encoding.ts | Existing evidence encoding independently authenticates canonical content bytes and digest. Tagged portable and untagged historical content are already distinct admitted contracts. |
| review-stage-verification.ts | simplificationState consumes persisted candidate evidence through content digest/schema/revision/registry checks, not the producer WeakMap. Both this reader and the public certificate API remain required consumers. |
| review-governor.ts, review-report-builder/contract, reducer/evaluation | Carry or compare policyDigest, bundle and governor identities. The already approved paired bundle.v2/governor.v2/report.v3 contract must bind the selected inner policy identity; naked digests do not select algorithms. |

Source-level explanation, distinct from the recorded native production proof:
Czech collation treats the ch inside schemaVersion as a unit, reversing its
order relative to scope compared with English. The policy's closed ASCII
domain therefore is not sufficient for locale stability. Generated facts have
the already proven changedManifestDigest/head pair inside revision. A candidate
manifest also owns that revision and must serialize its full content consistently,
even after the upstream source.digest divergence is repaired. This is not a
claim that every inner identity fails, nor that a fixed/hex alphabet is safe.

## Smallest explicit extension

Reuse the already approved finite graph-owned selector
`reviewSemanticEncoding: 'review-semantics.utf16-v1'`. It selects these additional
owner algorithms at creation time. It is not derived from reportArtifactEncoding,
ArtifactRef.encoding, cache/transport/source profile, current locale, a current
compiler, a digest match, or the presence of a generated fact. New semantics
still requires the separately explicit portable outer report codec. No new
run-global snapshot version or second user configuration selector is proposed.
This semantic selector is not yet integrated. The inner extension and the full
paired semantic package must be reviewed, tested and integrated atomically as
its first cutover: never publish the same selector with one policy/fact algorithm
and later silently replace that algorithm under the same persisted version.

### Policy digest owner

Keep the accepted policy value/schema review-policy.v2 unchanged. Preserve
`digestReviewPolicy(policy)` and `resolveReviewPolicy(input)` omitted-mode
behavior, return fields, precedence, authorization, original bytes and digests.
Add an explicitly validated optional semantic mode at these owning APIs. In new
mode, hash existing portableJson of the same parsed policy value for BOTH the
selected digest and every provenance source digest. The new algorithm's version
authority is the frozen Review semantic selector and persisted paired v2/v3
envelopes, not a newly tagged historical policy or a silently changed v2 schema.
Do not invent a second policy input schema or change approved policy decisions.

Retain immutable owner metadata for the selected mode in the resolver's private
brand (for example WeakMap rather than WeakSet). A caller cannot turn an old
resolved policy into a new one by spreading it, setting an optional property or
supplying a digest. Expose an owning verification operation that accepts the
expected semantic mode, proves ownership/frozen snapshot/mode agreement and
recomputes all required digest data using the certified mode. The reducer must
use that owner, not an unconditional legacy digestReviewPolicy call. Preparation,
both governor branches and report construction must reject a resolver certificate
whose mode differs from their explicit semantic context before using its digest.
Omitted expected mode in existing exported helpers remains historical; do not
implicitly trust whatever mode happens to be attached to a supplied object.

The stage passes its already admitted explicit selector into resolution and all
normal/failure paths. repository-audit-stage.ts is another resolver caller but
does not own this graph selector: leave its omitted legacy API behavior and
prepared-plan identity unchanged. Do not broaden the task to migrate it.

### Generated fact and candidate evidence bytes

In explicitly new semantic snapshots only, produce the same parsed
simplification-facts.v1 value with portableJson and emit the existing evidence
`encoding: 'kubeclaw-json.utf16.v1'` alongside its actual content/digest. Omission
in produceSimplificationFacts retains the original canonicalJson content and
absence of encoding. No scanning, rule, factId, limit, order or semantic schema
change is justified; the existing evidence codec is the byte-version owner.
The actual bundle bounds reader parses inner content and uses reviewEvidenceJson
with this evidence's own encoding to compare exact canonical bytes; the marker
is therefore necessary for portable reopening, not decorative metadata.

Propagate the explicit mode through buildReviewSnapshot for initial, slice and
expanded creation and into buildSimplificationCandidateManifest. Keep original
mining rules, candidateIdentity algorithm/schema, candidateId, ordering and source
references. New-mode candidate evidence serializes the complete parsed original
manifest with the existing portable evidence codec/tag. The new source.digest
is the digest of the genuinely generated tagged fact bytes, not a replacement
or precomputed constant. The manifest's WeakMap proof must retain its selected
codec and expected semantic context; certification recomputes with that same
codec and rejects cross-mode policy/revision/certificate substitution. Its old
exported omitted-mode path remains byte-identical and untagged.

Do not require all input evidence to have the new tag. Existing independently
admitted historical/portable external evidence retains its actual encoding,
bytes, digest and reference. Never recanonicalize or retag it merely because
the bundle is new. A stripped tag is checked under the original legacy evidence
contract: it rejects when bytes are not legacy canonical; if the same bytes are
valid under both codecs, absence alone is not proof of corruption and must not
be treated as an invented cryptographic distinction. Generated new output is
nonetheless required to carry its explicit selected tag.

## Historical and package boundaries

Preserve the approved compiler rule: only genuinely fresh compilation opts all
expected module/final Review nodes into the explicit semantic mode. Omitted
exported compiler/coverage helpers remain historical, including the archived CLI
that restores old compiler/source but imports current helpers. Recovery derives
source, outer report and semantic selections independently from the exact stored
graph, preserves the complete node/config/package-pin comparison, and never
upgrades an old graph. No private cross-plugin import or pin bypass is allowed.

Historical Review resolution, generated evidence, bundle/report writes, governor
reads and runtime dispatch retain exact operation/resource/payload/ordinal and
absence of new fields. Old requested/completed replay must not get a different
policy/evidence payload at the same invocation key. Old accepted-without-receipt
history remains uncertain, not terminal success/failure or permission for a new
key. A historical locale-dependent recomputation may fail closed under another
locale; preserve that behavior instead of silently migrating stored history.
The explicit new graph authority is what permits new producer identities.

No migration of changedManifestDigest, context-selection candidateManifestDigest,
context/reference hashes, candidateId, proposal/finding IDs, repository-audit
plans or scalable compiler IDs is authorized by this extension. In particular,
context selection candidateManifestDigest is not the simplification candidate
evidence digest. A newly observed admitted owner failure requires separate
evidence and review, not a blanket serializer replacement.

## Required acceptance after authorization

1. Preserve cf45 original red and fixture diagnostics. Run approved genuine
   original Core producer acceptance on the final candidate: same real Git/input,
   native en/cs gate/lean/audit; actual resolver, preparation, generated facts,
   mining, governor/report, original disk ArtifactStore and FileJournal. No
   precomputed policy/evidence/manifest hash, copied producer or fake context.
   New modes must give equal actual policy/provenance identities and generated
   fact/candidate bytes/digests, then equal downstream semantic identities.
   Preserve candidate IDs for the demonstrated original case. Retain original
   legacy outputs as controls, not as required cross-locale equalities.
2. Policy owner tests cover all built-in profiles, settings precedence and actual
   authorized/unauthorized overrides; parser bounds/closed fields/invariants,
   immutable provenance and reducer recomputation; wrong-mode authentic brands,
   forged clones, changed digest/policy, and mixed certificates must fail. New
   selector and JSON admission must reject present undefined/null/unknown values,
   getters, proxies, sparse/nonfinite/cyclic/exotic values before incidental
   reflection. This is accepted-domain validation, not an alternate serializer.
3. Actual producer/miner/parser/certificate tests cover generated source binding,
   manifest revision and policy ownership, existing finite limits/diagnostics,
   both codecs and legitimate mixed external evidence. Wrong content/digest/tag,
   unknown versions, wrong policy mode and cross-owner certificates fail closed;
   same-byte dual-codec cases use the precise compatibility rule above.
4. Complete the parent design's genuine initial/slice/expanded, both governor
   branches, later certified history and actual Summary reader gates. Persisted
   new bundle/report semantics and full references must match policy identity;
   wrong version pairs, producer, bytes/digest, required encoding and coverage
   remain rejected. Fresh production and reopening stored bytes are separate
   proofs; neither substitutes for the other.
5. Repeat original archived legacy producer/compiler plus new Core journal/CAS
   requested/accepted/completed write/read histories from current checkout
   archives. Keep native SIGKILL evidence distinct from replaying genuine byte
   prefixes; no fabricated journals or changed effect keys. Prove completed
   replay avoids duplicate invocation and accepted uncertainty stays uncertain.
6. Preserve original schema/type/lint/test assertions, actual source/graph/package
   pin checks and independent Summary boundary. Run affected original suites and
   paired migration gates against a freshly reconciled integration head, with
   full raw results and independent exact-source review. Existing unavailable
   external/native prerequisites are not replaced by local contract fixtures.

These are future requirements, not passes achieved in this design-only task.
No safety-flagged execution is authorized by listing a gate here; any unavailable
or denied boundary remains explicitly unproven.

## Durable next action

Independent design review by run5_storage and explicit root approval first.
Then the separate semantic implementation owner may add this bounded extension
to its isolated candidate, preserving its pending compiler/Summary work and all
old exported APIs. Save source/raw checkpoints, obtain independent implementation
review and fresh-head combined evidence before integration. MAIN, register and
finding statuses are unchanged by this document. Repository workflow inspection
shows push triggers restricted to main; this design checkpoint uses a new
fix/resume-47 branch and [skip ci], with no CI, deployment or external messages.
