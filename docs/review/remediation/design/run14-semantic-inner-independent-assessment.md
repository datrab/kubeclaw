# Independent bounded inner-owner assessment

Design assessment only; no additional production implementation is approved by
this document. Current source is frozen first slice 534eb4f, based on remote
ff55ab962d16dc0eba5ee6aafa2150abaa723fb5. Reviewer's production sources are unchanged.

## Established source of the remaining mismatch

Helper proof cf45e370564dea42879c76cb83cfed3ffec03ea1 records six successful original
Core Review executions and an intentionally failing cross-locale assertion. It
uses actual repository/context production and storage, but the local HTTP contract
fixture is not successful external model or Gateway verification. Candidate
validation has not been established.

The exact classification shows policyDigest differs for gate, lean and audit.
Revisions, selected context and selection identity are equal. For lean/audit,
generated simplification facts have equal parsed values but different content
bytes; candidate manifests differ only through their source.digest references to
those facts. Candidate IDs are equal. This does not justify changing every inner
identity or imposing a new schema on arbitrary evidence.

## Minimal owner extension to evaluate

1. The selected graph semantic mode must reach the original decision Review
   policy resolver before creating any policy/source digest. Keep resolver and
   digest helper omission exactly legacy. The actual resolved policy must retain
   trusted immutable mode ownership; unsupported or mixed mode cannot be inferred
   from the digest, selected locale, outer artifact encoding or unrelated source
   profile. The reducer's current digestReviewPolicy(policy) recomputation must
   consume that same owned selection. Keep policy value semantics unchanged and
   distinguish its schema from the versioned identity operation. The independent
   repository-audit-stage caller must not silently change its existing default.

2. Generate new-mode simplification-facts and candidate-manifest content through
   the already existing ReviewBundleEvidence.encoding and reviewEvidenceJson
   contract, with exact kubeclaw-json.utf16.v1 marker. The facts and manifest
   logical schemas may remain v1 if their logical shape and candidate identity
   algorithm do not change. This is a byte encoding change owned by generated
   evidence, not a fabricated candidate-identity migration. Historical helpers
   without a selection must omit the marker and reproduce the original bytes.
   Do not retag arbitrary user-supplied evidence or alter candidateId simply
   because source.digest changes to the actual new facts content digest.

3. CERTIFIED_MANIFESTS currently stores revision, policy and digest but always
   recomputes canonicalJson. Its proof must own the chosen encoding and verify
   exactly those bytes. Producer, parser/protocol, reducer, snapshot and certified
   manifest consumers must agree; no reader may silently reinterpret v1 evidence
   bytes or repair an encoding mismatch. The existing evidence digest check and
   full artifact reference checks remain required.

4. Snapshot bundle.v2 / governor.v2 / report.v3 selection must explicitly bind
   these producer operations through the frozen Review stage choice; old graphs
   retain the exact policy/evidence operations, requests and identities. The new
   source must fail closed if a legacy-resolved policy or wrong-mode certified
   manifest is supplied to a new-mode builder, not package the wrong inner digest
   under a new outer version.

Before root approval, the author should state the exact resolver ownership API,
mode-compatibility guards, generated-evidence arguments and complete consumer
census. No source changes are made by this reviewer. An actual original producer
gate must still establish parity for all three profiles and all required initial,
slice, expanded and history paths; direct helper tests alone cannot close it.

## Unchanged boundaries

No proposed global SDK codec replacement, opaque changed-manifest or candidate-ID
rewrite, manual locale lookup, mocked gateway, weakened timing/contract assertion,
newest artifact preference, read-error-to-miss conversion, old package pin bypass
or silent request migration. Full historical and new compiler/Summary/replay
gates remain required separately.
