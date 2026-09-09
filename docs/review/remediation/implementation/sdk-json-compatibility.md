# PCR-SDK-001 — accepted bytes, persisted consumers, and actual locale boundary

The existing validation change does not change output for accepted JSON on the same runtime and locale. Original source `eaf353a^:skills/common/plugin-runtime/sdk/src/values.ts` and the current original source were executed in separate native Node processes under en-US, sv-SE, and tr-TR. Each compared 115 accepted vectors, including finite numbers, escaping, integer-like keys, Unicode keys, nested records/arrays, and null-prototype records. The original sparse-array `[,]` and undefined/null collision were reproduced; current rejection remains explicit. These vectors substantiate the code-level equivalence: scalar encoding, dense-array iteration, key set, `localeCompare`, and recursive formatting are unchanged for the accepted domain. This does not prove every possible input/runtime version.

**No migration is needed for that validation patch.** Values previously accepted only through lossy non-JSON coercion are not a legacy data format to silently re-enable. Actual historical bytes must be read and checked as stored. A malformed `[,]` artifact fails parsing; a historical `{x:undefined}` already serialized as `{x:null}` cannot reveal its discarded origin. Neither a version tag added today nor a fallback serializer can reconstruct it. No production artifact population was inspected here.

## Concrete remaining defect

The native locale comparison is now measured, rather than inferred. For `{a:3,ä:1,z:2}`:

| Runtime locale | Actual SDK bytes | SHA-256 |
| --- | --- | --- |
| en-US | `{"a":3,"ä":1,"z":2}` | `db1796e0fb21fbd70c2b4b7ade2a3570a4ace8b2eeb1fe14d324360c6c72bcb2` |
| sv-SE | `{"a":3,"z":2,"ä":1}` | `9aabdc44156f32357daefadaa7dcee25eb3b1c98f9a1aeaf560b345590e18e95` |

The original ArtifactStore writes the English-locale object to its real disk stores. A Swedish process reopens that same store and successfully retrieves the original digest and value. Reserializing that legitimate value through the SDK produces the Swedish digest. This proves the producer/read-reserialization mismatch directly; it does not claim a whole pipeline run failed. SDK `source-approval.ts:readBoundArtifact` and `source-revision.ts:readImplementation` compare precisely such reserialized hashes and therefore reject cross-locale bytes when affected keys occur. The blob reader itself hashes original bytes and is compatible.

## Actual consumer inventory

`docs/review/evidence/sdk-canonical-consumers.tsv` enumerates all 99 named `canonicalJson` import/export/declaration sites in the current `skills/` TypeScript source scan, with original import origin and call lines. It includes shared WIP source visible at audit time and is a source inventory, not evidence that every path executed. Test and generated dist paths were excluded; the review evaluation script remains explicitly identified. The SDK's `canonical` alias in Core `effects/identity.ts` additionally feeds `effects/memory-locks.ts`; the persistent lock implementation instead hashes resource type/id separated by NUL. Counts are not a completeness claim for arbitrary differently named serializers.

| Persisted authority / bytes | Actual production producers and consumers | Cutover consequence |
| --- | --- | --- |
| JSON artifacts and refs | `common/plugins/artifact-store/src/adapter.ts`; SDK source approval/revision/preflight; Nova artifact checkpoints, read-run-evidence, review report/bundle/map/cache producers and verifiers, project summary, remote-test-gate evidence, demo handoff | Stored blob hashes remain raw-byte identities. Any consumer reserializing parsed values needs explicit producer codec binding before a new ordering is used. ArtifactRef currently has digest/media type/producer, not serializer identity. |
| Effect request identity / persisted replay | `nova/core/effects/identity.ts` (`stableEffectId`, `assertMatchingRequest`), original `effects/journal.ts` | Fixed schema fields ordinarily have stable ASCII keys; arbitrary payload equality still uses SDK canonicalization. A global sort change must not silently reidentify existing effects. Original journal stores JSON snapshots; it is not an SDK serializer migration. |
| Durable plugin state / wait records | Core `state/plugins.ts`, lifecycle `wait-request.ts`, common `state-store`/`wait-store` adapters | Comparisons/idempotence consume original SDK bytes, while record envelope integrity belongs to a separate observability serializer. Version the semantic identity contract, not only the outer file. |
| Approval, repair, and audit digests | SDK `review-subject.ts`, Core `repair-budget.ts`, `repair-authorization.ts`, `telemetry/audit.ts`, human approval and implementation repair evidence | Approval/source/input and repair-order digests carry existing authority. No recomputation may grant a changed object or budget order under a new codec. |
| Git/runtime ownership and request caches | SDK runtime-workspace; git-workspace ownership/review source; runtime-dispatch `openclaw.ts` and workspace target; Redis `stream-identity.ts` | Persisted descriptors, dispatch/session model payload digests, and Redis dedup names need domain-specific version handling if their bytes can change. SHA-256 prefix alone is not serializer versioning. |
| Project/source policy and report bindings | Nova project source/compiler/coverage and review family entries enumerated in TSV | Normalized input, report, cache, and policy digests must select the same codec at producer and validator. Current source-bound policy must not be silently repinned. |
| Demo credential/exposure handoff | Buster generated-demo-credentials/exposure-generation/exposure-handoff; Nova demo evidence/handoff | Cross-language controller credential commitments use fixed keys; other lease/request owner digests still use SDK. Preserve their explicit actual wire/owner semantics; do not migrate by relabeling hashes. |

### Same name does not mean same contract

Seven inventory sites import the separate `pipeline-observability-contract` serializer (durable record/delivery/attempt integrity and remote compaction), which already uses lexical UTF-16 key ordering. Worker-core digest exports come from `pipeline-worker-core-contract`, not SDK. Buster Kubernetes runtime security and Nova engine snapshot serialization have their own local implementations; engine-run/admin import the latter. No changes to those domains are implied by SDK validation. Their own defects/version requirements, if any, need separate review.

Actual cryptographic signature paths likewise must not be conflated with SDK hashing: Prism internal HMAC hashes received raw body bytes; Prism session HMAC signs encoded payload; runtime-dispatch signs the `JSON.stringify` transport body plus idempotency key; operator messaging signs its exact serialized transport body/delivery identity and receipt digest; transport-publisher signs its own serialized publication; repository revision-reader HMAC signs attempt ID plus Git head. Their secret-bearing signature functions do not call SDK `canonicalJson`. Changing SDK validation alone does not justify resigning their persisted or transmitted data. SDK-derived digest fields carried inside signed bodies remain governed by their own producer contracts.

## Minimal actual cutover design, not an unused compatibility API

1. Retain current strict validation and legacy output for existing callers. Do not infer producer locale or try alternate collators until a hash matches.
2. Choose a named portable encoding for **new** persisted contracts, including exact key/number/string rules. Bind that identifier into newly produced ArtifactRefs/envelopes and semantic digest-bearing approval/effect/ownership contracts; select it from authenticated/stored producer facts at readers, never an unrelated caller hint. Contract schemas and SDK-generated types must change coherently with producers and validators.
3. Keep old blob content hashes verified against original stored bytes. Readers that need parsed-value integrity should consume the verified original bytes/codec evidence through the existing artifact capability rather than trusting unqualified JSON or silently reserializing under a different locale. Preserve legacy authority only where those original facts verify; otherwise require explicit reconciliation. This is not a second generic store.
4. New effect/approval/source identities must use explicit new versions; historical requests remain bound to their existing exact identity. No automatic fallback, replay renewal, or reapproval from newly computed digests. Cross-locale old-producer/new-reader and reverse-direction tests must use real disk stores and original replay/authority consumers before switching defaults.

This is necessarily a coordinated wire/consumer change, not a bounded replacement of the SDK comparator. No production serializer change or unused v2 helper was added in this audit. PCR-SDK-001's valid-domain rejection is implemented; its explicit portability requirement remains open. Clean installation, other ICU versions, deployed historical data, and complete pipeline portability were not proven.

## Executed original gates and exact scope

- `node --test docs/review/evidence/sdk-json-compatibility-audit.mts`: original pre-fix/current source ×3 actual locales, 345 byte comparisons, real cross-process ArtifactStore write/read and visible digest drift; passes as an audit regression that explicitly records the remaining boundary.
- `npm test --workspace @kubeclaw/plugin-sdk`: original accepted-byte and invalid-domain suite passes.
- `node tests/verification/reliability/sdk-json-contract.test.mts`: original disk artifact invalid-write rejection and reopened FileEffectJournal request replay passes, also independently under `LANG=sv_SE.UTF-8 LC_ALL=sv_SE.UTF-8`.
- `npm test --prefix skills/common/plugins/artifact-store`: original boundary/live-function tests pass.
- Canonical ESLint for the new audit test passes. No deployment/CI or full runtime replacement.

Exact audit scope: this note; appended audit section only in `implementation/contracts.md`; `docs/review/evidence/sdk-json-compatibility-audit.mts`; inventory `evidence/sdk-canonical-consumers.tsv`; raw logs `evidence/sdk-json-{compatibility,package,consumers,consumers-sv,audit-lint}.txt` and `evidence/sdk-artifact-original.txt`. Ten paths total. Root owns status/register changes; none were made here.

## Resume review: audit is not a permanent product gate

The historical comparison requires the original materialized local Git revision `eaf353a^`, which is not guaranteed to exist in a fresh remote checkout. It also deliberately demonstrates an unfixed portability defect. The script is therefore preserved as `docs/review/evidence/sdk-json-compatibility-audit.mts`, outside the automatic reliability test glob, rather than introducing a history-dependent product test or asserting that the defect must remain forever. Run only with that original history present. Existing SDK and artifact product regressions remain unchanged. The resume run passed all 345 accepted-value comparisons and reproduced the original cross-locale digest mismatch; PCR-SDK-001 remains partial.

## Wave47 implemented cutover: implementation artifact bytes and their consumers

Basis: `a8cf34f`. This is an executed production cutover, not another audit or an
unused alternative serializer. `portableJson` names `kubeclaw-json.utf16.v1` and
uses strict existing JSON admission with UTF-16 code-unit key ordering. New
original implementation-agent completion writes explicitly select the codec.
The artifact store records it in the schema-generated ArtifactRef; unknown codecs
reject. Other producer contracts keep their old untagged bytes until their own
semantic identities can be versioned coherently. No default comparator changes.

The existing artifact capability now has explicit `get_json_bytes` and
`get_latest_json_bytes` operations registered with the same namespace/resource
grants. They return the original blob bytes in an `artifact-json-bytes.v1`
envelope. SDK source approval/revision, implementation repair evidence, original
human approval, summary, pipeline-review evidence and demo evidence/handoff
consume and verify these original bytes. SHA-256 and byte count remain bound to
the original reference, and parsed value must equal those verified bytes. Tagged
portable content must also satisfy its exact codec. Historical untagged JSON is
never reserialized for byte authority, guessed by locale or rewritten. Ordinary
existing get_json/get_latest_json response fields remain unchanged. Byte-proof
responses include both text and parsed value; existing input limits remain, and
envelope budgets must account for both representations.

A replay cannot add/remove an encoding tag under an existing metadata key, even
if content happens to serialize identically: the original durable record checks
the complete metadata value. Old work that would change a pending payload on
upgrade is rejected by existing effect matching, not silently adopted. No
production data migration or automatic operator reconciliation is claimed.

The new original integration test writes actual artifact blobs and an actual
FileEffectJournal in one native Node locale, reopens them in another process,
and calls the original SDK source-approval/revision consumers. en-US→sv-SE,
sv-SE→en-US and tr-TR→sv-SE all pass. In each direction the legacy reserialized
hash demonstrably differs, yet original legacy source reads retain their correct
identity. Portable writes/replays retain exactly the same digest and reference.
Changed value, changed raw text, unknown codec, same-key codec removal and altered
effect payload reject. The original implementation-agent HTTP/Git test verifies
that its real stage writes the codec tag. SDK invalid-domain tests exercise both
serializers without executing getters or proxy traps.

### Remaining boundary — PCR-SDK-001 still not globally closed

Review-subject/input approval (`sdk/src/review-subject.ts`, `source-preflight.ts`,
`nova/project/source.ts`), repository review report/cache/map semantic digests,
repair-order/approval digests, runtime/workspace ownership and other inventory
domains remain their existing unversioned authority contracts. Their producer and
validator versions must change together; a shared serializer flip would silently
change those authorities. Report/cache-only readers are deliberately not switched
without their own producer cutover. Locale-changing replay is proven for the
original fixed-schema effect identity and payload comparison tested here, not
for every identity domain in the inventory. No full pipeline portability,
deployed historical population migration or production upgrade was performed.

This work removes the demonstrated cross-locale original-blob/source-consumer
failure and installs a real portable producer. It cannot truthfully close the
broader separately persisted semantic-identity contracts by merely extending an
artifact ref, and does not claim to do so.

### Independent reference-binding counterprobe and correction

Independent reviewer `remaining_changes` used the original store to persist two
same-byte/same-ID artifacts with different producers. The first implementation
verified returned bytes but some readers did not compare returned producer/ref
with their selected authority. The independent original-disk counterprobe is
preserved in the reviewer's evidence; it demonstrated the mismatch.

Correction: the shared verifier now requires the full expected ArtifactRef,
including ID, namespace, media type, digest, size, encoding and every producer
field. All migrated readers pass it. New exact `get_json_bytes` calls also carry
`payload.reference`; the store selects that exact durable metadata entry instead
of allowing a newer same-digest foreign producer to replace it. An existing
ID+digest with no matching expected ref raises `ARTIFACT_REFERENCE_CORRUPT`;
missing blobs retain `ARTIFACT_NOT_FOUND`. A missing reference is explicitly
rejected. Latest reads retain their current-run/latest semantics and reject a
selected stale or foreign reference. Existing non-byte read selection and
response fields remain unchanged.

The product regression now persists a genuine foreign same-byte owner, rejects
its response against the original expected ref, and still reads the legitimate
older original ref. It additionally varies expected artifactId, namespace,
mediaType, runId, stageId, attemptId, attemptNumber and encoding. No original
tests were loosened. The unchanged Summary corruption assertion exposed a new
NOT_FOUND diagnostic before the precise reference-corruption distinction above;
the unchanged Demo assertion exposed a domain error-code change, corrected by
performing its existing full-ref check before byte verification. Both failed
outputs and corrected reruns are preserved.

### Executed gates and final counterreview

Committed raw outputs are in `docs/review/evidence/wave47-sdk/`:

| Command / scope | Exit | Raw output |
| --- | --- | --- |
| `node --test tests/verification/reliability/sdk-json-portable.test.mts` | 0 | portable-reference-final.txt |
| `npm test --workspace @kubeclaw/plugin-sdk` | 0 | sdk-tests-final.txt |
| `npm run build --workspace @kubeclaw/plugin-sdk` | 0 | sdk-build-final.txt |
| `node scripts/generate-plugin-sdk-types.mjs --check` | 0 | generated-check.txt |
| `npx --no-install tsc --noEmit -p skills/nova/tsconfig.json` | 0 | nova-types-final.txt |
| `npm test --prefix skills/common/plugins/artifact-store` | 0 | artifact-final.txt |
| `npm test --prefix skills/nova/plugins/implementation-agent` | 0 | implementation-final.txt |
| `npm test --prefix skills/nova/plugins/project-summary` | 0 | summary-reference-final.txt |
| `npm test --workspace @kubeclaw/plugin-demo-handoff` | 0 | demo-reference-final.txt |
| Original approval-source + project-source graphs (22 tests, after operation registration) | 0 | source-graphs-registered.txt |
| Original sdk-json-contract disk/effect replay | 0 | original-consumers.txt |
| Complete changed-source/test canonical ESLint | 1 | lint-complete-final.txt |

The lint result contains only the existing repairEvidence complexity 28/15,
independently reproduced on HEAD in repair-evidence.ts-baseline-lint.txt. No
suppression or threshold relaxation was added. Original repair-evidence and
review-candidate tests passed in source-consumers.txt; that same first grouped
run preserves 18 initial sourcegraph failures caused by the initially missing
new-operation registration. summary-final.txt and demo-owner-final.txt preserve
the diagnostic failures corrected without loosening their tests. Scoped
`git diff --check` passed.

Independent reviewer `remaining_changes` approved this bounded artifact cutover
with no further demonstrated blocker. After final reference/diagnostic changes,
the reviewer reran nine original ProjectSource graphs, the portable locale/replay
test, original sdk-json-contract, exact/latest/foreign reference probes and
legacy serializer comparison across three native locales and five vectors.
Evidence is separately committed as `26816eb`, with
`wave47-sdk-independent-*` paths; it includes the original failed foreign-ref
probe. The broader semantic-identity portability requirement stays explicitly
partial. No deploy, CI invocation, external recipient send or production
population migration took place.

Raw stdout is preserved byte-for-byte, including blank lines/trailing whitespace
emitted by Node assertion diagnostics and npm. Consequently an unscoped
`git diff --check` including these evidence files reports whitespace diagnostics.
The source/test/documentation-only check excludes the raw evidence directory and
passes; no raw failure output was edited to make a whitespace gate appear green.

The next implemented semantic boundary is documented separately in
[sdk-effect-identity.md](sdk-effect-identity.md): new actual durable effect IDs
use an explicit portable version; original requests/receipts, replay,
per-effect runtime locks and ReadRunEvidence select and preserve recognized
historical identity versions. Real original journal fixtures and native
cross-locale replay tests passed, including rejection of unverifiable legacy
identity before actions. Source/Subject, report/cache and other listed semantic
contracts remain separate remaining work; the global legacy serializer has not
been silently switched.

The next implemented boundary is documented in [sdk-source-identity.md](sdk-source-identity.md): explicit ReviewSource/Subject/SourceBinding codecs plus the necessarily coupled run/graph snapshot versions and original-version Runner recovery. Real native-locale paused approval graphs and historical snapshot bytes are covered; the global finding remains partial.
