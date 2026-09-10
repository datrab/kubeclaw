# Replay-preserving Prism architecture reader candidate

Author source/test freeze: f8e7989df97aaaa17be53e6aef46c2fa1f33e72c.
Base SDK MAIN28909f62da68f70d94e0672ce7ae12ced8d7b3d9, exact local69253f29.
Incomplete until independent review and root integration; no SDK/finding closure.
This supersedes WIP test status, retaining its earlier evidence unchanged.

## Cause fix and durable compatibility

Only registered Prism stage.ts and its owning architecture.ts verifier change.
Original get_json operation/resource/payload/ordinal is unchanged. TypeScript AST
inspection confirms byte-identical capability invocation arguments for both
artifacts.read and the separately reviewed runtime.dispatch profile wrapper.
No get_json_bytes/reference payload addition, extra capability call, new effect
key, global serializer change or inferred cache/transport/run profile is used.

Expected Core ArtifactRef is accepted-JSON validated before property access.
An own encoding property must be exactly kubeclaw-json.utf16.v1; unknown and
present-undefined tags reject. Only own-property presence after this validation
selects the portable serializer. Untagged legacy values retain exact original
canonicalJson verification and native cross-locale failure, without guessing.
Returned response is JSON-domain validated before accessing its required own
fields. Full returned ref including producer/namespace/ID/media/encoding must
match expected reference; selected value bytes must match expected and returned
digest/size. Getter/proxy/invalid-value rejection occurs before incidental access.

## Completed genuine gates against the frozen source

- 16 actual registered preflight/Git/Core/ArtifactStore/Prism-stage cases:
  native en/sv, original/current stage, portable/legacy artifact, fixed/mixed
  admitted source-policy keys I/i/z/å. Original portable mixed cases reproduce
  the reader failure; repaired cases pass this reader and reach genuine HTTP503
  refusal. The current transport profile wrapper is used unchanged.
- Original old-stage read request/accepted/completed journal prefixes are copied
  byte-for-byte (no rewriting or rehashing) and reopened through actual original
  prepareRuntime/createAdapterRuntime/registered ArtifactStore: 24 phase cases.
  Requested histories finish with the same request/effectId/attempt/key; completed
  receipts replay without journal appends; accepted-without-receipt histories
  remain unresolved at original Core safety and adapter receipt-unavailable gates.
- 32 native en/sv/da/tr consumers reopen those actual completed journals and
  derive expected refs from actual lifecycle source results. Portable values
  pass; legacy values follow the unchanged original verifier, including explicit
  en/sv mixed-key denial. Journal bytes remain unchanged in every consumer.
- Eight genuine latest-record ownership ambiguities are written/read through
  registered ArtifactStore using another existing pipeline attempt and identical
  bytes/digest. The original get_json latest selector returns the other owner;
  full ref binding rejects it, rather than silently changing the read payload.
- Five focused negative/contract tests use the actual saved original receipt/ref:
  unknown/undefined tags, all owner/ref fields, digest/length/value corruption,
  sparse/nonfinite/exotic/cyclic values, getters/proxies and inherited accessors.
  Reversible inherited getter traps demonstrate zero executions. No fabricated
  PluginInvocationContext or replacement provider is used as positive evidence.
- Original plugin live-function, real wait-store and archive-integrity programs,
  owning plugin typecheck and configured source/test lint each exit0. Initial
  test-depth lint finding was fixed by extracting unchanged assertions; no
  thresholds, ignores or rejection assertions were weakened.

Raw: docs/review/evidence/run12-prism-reader-frozen-matrix.txt and
run12-prism-reader-frozen-gates.txt. Original/initial raw remains separate.
Archived exact original stage SHA256 is pinned in the test fixture; dependencies
resolve from current checkout, not unavailable historical Git objects.

## Explicit boundaries and next action

The source producer's logical source-preflight ArtifactRef ID is admitted by the
original Prism stage but not the downstream service's separate ID grammar. The
loopback receiver explicitly refuses with503 and never returns a fake Prism
result. No service handoff, renderer/browser, operator approval or full pipeline
package-upgrade/recovery is claimed. Prefix tests establish actual durable effect
replay; they do not bypass registry package pins or administrative continuation.
Accepted uncertainty remains open. Baseline archive sources are untouched.

Independent run5_native review must repeat frozen gates, then root must reconcile
against fresh MAIN and preserve other approved changes before ff-only integration.
No MAIN update, deployment, CI, paid resource or third-party message occurred.
