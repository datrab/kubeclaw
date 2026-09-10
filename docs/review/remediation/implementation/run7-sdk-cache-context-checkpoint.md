# Remaining SDK domain: admitted review-cache context request

Status: OPEN, unimplemented. Separate from the run-frozen runtime transport repair.

The independently executed probe creates a normal component job through original inventory, graph, plan and job producers. A context-request result includes all original declared component requirements plus mixed-case ASCII `I` and `i` assessment keys. Original Echo parsing accepts it; the original context-request requirement check accepts the requested declared ID; the original runtime-attestation parser accepts its declared input; and `reusableReviewResult(job, value, true)` explicitly permits caching this parsed context request. This is not an arbitrary unknown value passed directly into a generic cache API.

`RepositoryAuditArtifactCache` then invokes the actual `EffectCoordinator`, `FileEffectJournal`, `FileResourceLockManager` and artifact-store implementation through minimal API wiring, with no fake storage, receipt or successful model. A real en-US artifact is persisted and reread successfully. The same completed read effect replays under tr-TR, but the original cache reader rejects its unchanged value with `repository review cache proof is invalid`. All model/provider declarations here are only typed input to the cache-admission boundary, not proof of provider execution. No whole pipeline completion is claimed.

Exact artifact digest: `sha256:09ed48dfd48c929ffdc38bba43db7543ecafb6a25fcfeb6ad6056045e9745efe`.
Exact failing artifact ID: `repository-review-cache:e6371b66b8cc771f343b48c03c8f1c8eb952dd91c9b7c616fd155e08b00867b2`.
Raw and reproducible source: `docs/review/evidence/run7-sdk-cache-context-case-probe.{mjs,txt}`.

The generic claim that ASCII keys are locale-independent is false: native en-US sorts `i` before `I`; native tr-TR sorts `I` before `i`. The current fixed lowercase built-in requirement IDs alone would not establish this defect. It is the actual accepted context-request branch and its extra valid identifier keys that make this input persistable.

An additional diagnostic attempted to compile the Echo output schema using Foundation's strict Ajv. That is not the actual model-output admission path and exposed a pre-existing strictRequired declaration issue. This failed diagnostic is retained separately; no strict validator was disabled, and no canonical-schema compile pass is claimed. The production gate used above is the existing Echo parser and existing cache reusability function.

## Bounded next action

There are three separate proofs: inner valueDigest over the parsed result, inner cache-record digest, and outer Artifact digest. Existing authenticated `get_json_bytes`/`verifiedArtifactJsonText` and declared Artifact encoding can address the outer proof, but do not by themselves repair either inner locale-sensitive digest.

Design an explicit codec/version for genuinely newly created cache records and both inner proofs; retain existing unit/identity lookup so an old unresolved cache is never bypassed by inventing a new key. Verify outer bytes/encoding against the exact original Artifact reference. Existing untagged records must retain their original semantics and fail closed if their authority cannot be established; never silently relabel them or guess the producing locale. Do not whitelist away legitimate context requests or extra admitted assessment keys merely to fit a collation assumption. Final design, implementation and independent real before/after tests remain pending.

PCR-SDK-001 stays open. The bounded transport package can be approved separately once its own exact corrected source and required tests are complete. No CI, deployments, production changes, paid resources or external messages were performed.
