# Original durable effect journal fixtures

These are byte-for-byte journal files produced by the original
`EffectCoordinator`, `DurableInvocation` and `stableEffectId` at commit
`354ee88060c93e8a0482ac91b7786788eda76fe8`, before the effect identity cutover.
The one-time capture executed those three original source modules with the
actual unchanged FileEffectJournal/FileResourceLockManager, original artifact
adapter, and original runtime-dispatch/network adapters against a real local
HTTP endpoint. Locale was `en_US.UTF-8`; producer request time was fixed to
`2026-09-09T12:00:00.000Z`. No adapter/journal/lock implementation was replaced.
The local endpoint only acknowledges its received request; no model was executed.

- `artifact.jsonl`: original successful artifact write with Unicode object keys.
- `dispatch.jsonl`: original successful HTTP dispatch, using the legacy
  per-effect runtime.invocation lock identity.
- `locale-dependent.jsonl`: original coordinator deliberately given additional
  Unicode-key attempt metadata through its unvalidated direct-call boundary.
  It demonstrates an actually captured historical identity whose bytes differ
  under Swedish ordering. This is not a claim that the closed current pipeline
  AttemptIdentity schema admits those extra fields. The new reader must reject
  the unverifiable stored identity before accepting an old receipt or executing
  anything; it must not infer the old locale.

The regression reuses complete raw files or their exact first one/two lines to
represent crash after request / after acceptance. It does not reconstruct legacy
IDs in a duplicate serializer, replace historical bytes, or require Git history
at test execution. Fixture SHA-256 values and source provenance are also recorded
in `docs/review/evidence/wave47-sdk-effects/legacy-provenance.json`.
