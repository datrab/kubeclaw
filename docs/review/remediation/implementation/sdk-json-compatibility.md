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
