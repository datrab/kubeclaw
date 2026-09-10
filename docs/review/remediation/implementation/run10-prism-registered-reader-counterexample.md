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

## Narrow proposed cause fix (not implemented)

After independent reproduction, change only the registered reader in
`skills/nova/plugins/prism-design/src/stage.ts` to request original
`artifacts.read/get_json_bytes`, including the exact selected `reference` in the
payload, then verify original `verifiedArtifactJsonText(response, architectureRef)`.
Retain current same-run/ref/media-type/size/input digest checks and current error
semantics. Hash/measure verified returned bytes, not reader-local serialization.
The existing owning helper already validates value ↔ bytes, complete ArtifactRef,
producer identity, digest/size and known encoding. No new fallback, legacy
recanonicalization, duplicated shadow validator or global serializer change.

Required bounded follow-up: actual registered-stage success past this reader for
portable mixed-case/Unicode and legacy bytes, exact reference/owner/codec/digest/
size/value corruption denials, original EffectJournal behavior preserved, and
independent review. The native transport author is modifying runtime.dispatch
producer bindings including this stage: reconcile its fresh reviewed integration
before applying any reader fix, never overwrite those independent changes.
Baseline archive implementation belongs to the separate author; do not change
`archive.ts` or Prism baseline contracts in this package.
