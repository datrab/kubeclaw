# Original registered Prism stage rejects a valid portable artifact

Docs/probe only, no production change. Fresh remote
`a43aa256bdce35d7f9c44d5d661e59c4055e562e` matches local baseline
`b3d2f7ba3ee35d121f26f67f737a400b3d034fb4`; own isolated `run10-prism-reader`.
PCR-SDK-001 original accepted-JSON / genuine ArtifactStore + EffectJournal scope;
not a complete Prism-service or rendering acceptance. Frozen 47 remain open.

## Actual invocation, not a constructed plugin context

Command: `node docs/review/evidence/run10-prism-registered-reader-probe.mjs`.
Original current plugins are copied unchanged into an owned temporary installation
and discovered/registered by original Core. Actual `runPipelineV2` executes:

1. Original `kubeclaw.preflight-contract:source`, actual Git repository with
   architecture and Forge declaration files, original closed source schema plus
   explicitly open policy object. The stage writes through actual `artifacts.write`.
2. Original ArtifactStore persists UTF-16-versioned JSON, original Core assigns
   attempt/lease/ArtifactRef and commits the successful source result/checkpoint.
3. Original registered `kubeclaw.prism-design:design` receives the artifact from
   that actual dependency context, invokes actual `artifacts.read/get_json`, and
   receives an original completed EffectJournal receipt with exactly that ref.
4. The probe independently reopens original FileEffectJournal and reads the
   actual FileDurableBlobStore bytes, asserting exact expected JSON/digest/length,
   encoding, request owner, returned reference and value. It predicts only the
   input content digest using original digest helpers and real Git files; it does
   not create an invocation context, substitute an adapter or manufacture a ref.

With empty policy `{}`, exact original bytes match reader legacy serialization.
The stage reaches one actual HTTP POST; a loopback diagnostic receiver explicitly
refuses work with 503. It provides no fake Prism result or approval. The actual
stage blocks at the resulting original `EFFECT_OUTCOME_UNRESOLVED:...HTTP_503`.

With **original-schema admitted** policy `{I:1,i:2}`, the actual source stage still
succeeds and the ArtifactStore returns correct portable bytes/ref. In native
en-US the unchanged Prism stage hashes a locale-reordered value instead of those
original bytes, then blocks at `PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID` with
**zero HTTP requests**. Full exact artifact bytes and original read request/
completed receipt, journal hash, source result and stage result appear in raw
`docs/review/evidence/run10-prism-reader-before.txt`. Probe exit 0 confirms both
expected paths, not a repaired finding. Initial harness incorrectly expected the
public state name `completed` instead of `succeeded`; original failure is retained
in `run10-prism-reader-initial.txt`. Corrected probe reads actual result records
from the original lifecycle journal, not invented public-state fields.

## Separate existing downstream boundary

The actual preflight producer uses logical ArtifactRef ID `source-preflight`.
The original Prism **stage input** admits it (arbitrary nonempty artifactId);
the downstream Prism service designRequest schema instead requires
`artifact:sha256:<hex>`. This separate mismatch is not hidden or fixed. The
positive control's receiver is deliberately not that service and never claims
service acceptance. Both test cases exercise the same original admitted stage
boundary before any downstream schema/renderer is relevant. No full handoff,
operator message, browser, deployment, CI or native renderer proof is claimed.

## Revised narrow proposal: preserve the original read effect

The initial `get_json_bytes` plus payload `reference` proposal is **superseded
before implementation**: it would break existing durable invocation identity.
Original `stage-executor.ts` assigns the read its stable ordinal key
`<run>:design:<attemptNumber>:1`. `effects/identity.ts` binds the operation in the
effect ID and separately compares payloads. `DurableInvocation.execute` checks
that identity **before** returning an existing completed receipt. Merely adding
`reference` to the old `get_json` payload also conflicts. An artifact encoding
tag specifies bytes, not permission to change a persisted invocation contract.

The replacement proposal changes only post-read verification in `stage.ts`:

- Preserve the exact original `artifacts.read/get_json`, resource, namespace/digest
  payload, call order and key; no extra capability invocation.
- Retain same-run, media-type, size and input digest checks. Require full returned
  `response.artifact` to equal the expected Core-issued ArtifactRef, including its
  producer, namespace, ID and optional encoding, using the existing portable JSON
  value comparison. This compares metadata, not historical bytes or a new ID.
- If the expected ref explicitly owns `encoding: kubeclaw-json.utf16.v1`, use
  the owning `portableJson(response.value)` serializer. Its deterministic output
  reconstructs exactly the producer's defined bytes. Compare those bytes' SHA256
  and byte length plus the response digest/size with the expected ref.
- If the expected ref has no encoding property, retain original `canonicalJson`
  verification unchanged and fail closed on mismatch. Do not guess historical
  collators, infer a tag, or silently retry another codec. Unknown tags and an
  explicitly present invalid/undefined tag must fail under the owning ref contract.
- Keep current blocked-error semantics and all independently changed SDK transport
  wrapper behavior. Transport/cache/run profiles do not select this reader codec.

`run10-prism-reader-replay-design-probe.mjs` reads both real requests and completed
receipts from the original registered-stage raw evidence. It invokes the actual
original `assertMatchingRequest`: unchanged requests pass; changing operation or
only adding a payload reference both fail. On both existing receipts the explicit
portable codec reconstructs exact original CAS bytes/ref/digest/size, including
the original mixed-case counterexample. Its saved raw is a bounded design
diagnostic, **not** an implemented repair or a newly executed crash/recovery test.

Original recovery states remain distinct. A requested but not accepted operation
can retain its original request and acceptance path. A completed receipt remains
reusable without a new adapter call. An accepted operation without a completed
receipt follows original recovery: the ArtifactStore adapter has no `receipt`
method, so `EFFECT_RECOVERY_RECEIPT_UNAVAILABLE` remains fail-closed. This proposal
does not invent retry safety, a new key, or successful recovery for that state.

Old `get_json` selects the latest matching logical ID/digest, not an exact expected
reference; a duplicate with a different producer can therefore return the wrong
owner. Full-reference verification must reject that ambiguity rather than alter
the persisted payload to fetch a different record. Historical same-codec bytes
remain checked exactly; legacy cross-locale mismatches are deliberately not
repaired by guessing. A future full-bytes operation would need a separately
specified reader invocation version frozen when the run starts and exact legacy
branching. It is unnecessary for this bounded portable-artifact defect.

Required bounded follow-up: actual registered-stage success past this reader for
portable mixed-case/Unicode and legacy bytes, exact reference/owner/codec/digest/
size/value corruption denials, original EffectJournal behavior preserved (including
completed receipt replay and accepted-without-receipt uncertainty), and
independent review. The native transport author is modifying runtime.dispatch
producer bindings including this stage: reconcile its fresh reviewed integration
before applying any reader fix, never overwrite those independent changes.
Baseline archive implementation belongs to the separate author; do not change
`archive.ts` or Prism baseline contracts in this package.
