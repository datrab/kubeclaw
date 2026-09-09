# SDK transport profile: independent early rejection

Status: INCOMPLETE; frozen source d545d30f988c3a05011c4fca1221d41222ca4ecb is NOT approved.

Base freshly read from remote: b06c06dce3364c482a1da5637c36bc2b14ba8c72; equivalent source ca00dc72893deaae21d66f1b302962f97638f7ae. Review checkout is isolated run6-sdk-transport-review. This report is an early counterexample checkpoint, not a finding closure.

## Confirmed historical model-field collision

The old runtime.dispatch payload is an open canonical JsonObject. The old closed EffectRequest has no transport-profile control field. A top-level payload.runtimeDispatchProfile was therefore legal model data. The new d545 extractor interprets arbitrary model data as control metadata even when withRuntimeDispatchProfile receives undefined for a legacy run.

Independent script run6-sdk-profile-collision-independent.mjs exercised original generic runtime-dispatch adapter and genuine network.http against an actual loopback-only HTTP receiver. No mocked provider, journal, storage, or completion guarantee is claimed. The baseline adapter came from the reviewer's own verified run6-coupled-review checkout; its blob is 4eddab412d23ae1d39040583bef6df53f43e36cd, identical to fresh b06. Candidate adapter blob is a9ffcce4decca1334e083c9a43fa7a2224704d3a.

Actual results: string-valued historical model field is newly rejected before HTTP. Const-shaped historical model field is silently stripped from actual transmitted body. This is a regression. Author agreed; root approved moving the control to the formerly closed CapabilityInvocation/EffectRequest envelope, with strict validation, Core provenance, identity and dependency propagation. The original model field must remain data in both forms. Correction still pending independent retest.

## New v3 validation gap

Direct execution of original assertRunSnapshot accepted a rehashed run-snapshot.v3 with registry:null, graph containing only schemaVersion, and an undeclared top-level key. Digest and finite-profile checks alone are not strict new-version shape validation. Preserve v1/v2 compatibility while defining the genuine new v3 contract; do not claim old graph permissiveness was introduced by this package.

## Existing retirement compatibility suite

Original observability-retirement-plan suite ran 15 tests: 14 passed, one failed, zero skips. Its newly created snapshot assertion still expects v2, while the genuine writer now emits v3. Update that specifically new-writer expectation, retain and execute all captured v1/v2 compatibility coverage. This failure is a stale expectation after an explicit approved version change, not evidence to weaken legacy gates.

## Isolation and next action

External dependency bytes are immutable hardlinks to the verified current-root cache, not physically independent copies. Lock blob 96cdba80650e16fb5699df314516b14d08931b95 matches base. All 64 lock-declared workspace links (62 @kubeclaw plus two other declared workspaces) were rebuilt to resolve inside this review checkout. No source or evidence is linked; no install or modification of linked dependency bytes was performed. No CI, deployment, workload, paid resource or third-party message occurred.

Next: review frozen envelope correction, rerun actual wire and HMAC collision cases, attack legacy completed/requested/accepted replay and new locale-stable transport identities through original producers/Core/journal, verify strict snapshot/profile tampering and actual historical CLI from current-checkout sources. Final approval requires fresh-head reconciliation and full affected tests. PCR-SDK-001 remains open.

