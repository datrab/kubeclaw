# Delivery-manifest registered proof — independent acceptance review

Status: AUTHOR RED/BOUNDARY PROOF INDEPENDENTLY ACCEPTED. This is not production
source authorization, runtime acceptance, SDK closure or finding closure. Reviewer
run13_delivery_review, run `20260910t035412`.

## Frozen authority

Fresh remote MAIN `e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`, was read before this review. The
new isolated checkout points at that exact commit and tree. Fresh remote resume
README, work-items, package-checkpoints, root-checkpoint and register were read.
The original register at `c38779c71bb92bc15c3fcb89930348e5417aa475`
again yields exactly 47 `implementiert` IDs. They exactly match
`partial-47-scope.json`; every frozen finding is present in the current register
with unchanged `source_finding_text`.

This checklist reviews the preparatory owner design
`13f0aa8262a20c31aac25a62b63e3aa018155768` and its independent preparation
review `98d8f41abf0d822d94f1d854326a252e5dfa25ac`. Both explicitly withhold
production authorization. The requested author task is therefore only the
missing genuine registered producer/storage/downstream counterproof. It must
not implement the provisional delivery-manifest.v3 design.

The concrete author checkpoint is
`f3ddec16b5a1c2787e956b5bc9d1556281660831`, sole parent fresh MAIN e644a79,
tree `74eb7c35d4e0de505a34f23f9b22ea17998dde23`. Independent recursive tree
comparison found exactly ten additive `100644` blobs: two test sources, one
implementation checkpoint and seven raw files. All 4,091 original MAIN entries
are unchanged. No production, register or MAIN file is modified.

## Independently inspected current boundary

On the frozen source, `project-summary/src/summary.ts` constructs
`delivery-manifest.v2` and hashes `canonicalJson` of the unsigned value.
`project-summary/src/stage.ts` is the registered writer and issues the original
untagged `put_json` to `kubeclaw.project-summary`. StageExecutor routes that call
through AdapterRuntime/EffectCoordinator and records the returned artifact from
the StageResult into the lifecycle artifact index. The actual ArtifactStore
serializes an untagged value with `canonicalJson`, but its reader also supports
correctly tagged portable outer bytes through `verifiedArtifactJsonText`.

`remote-test-gate/src/evidence-adapter.ts` reopens the requested manifest with
the original `get_latest_json_bytes`, checks the complete returned ArtifactRef
and bytes, then checks the v2 inner digest with locale-sensitive `canonicalJson`.
Only after that does it reopen the decision, call the actual
`FileNovaGateImportStore.readVerifiedResult`, and project demo evidence. A
cross-locale `DEMO_EVIDENCE_MANIFEST_INVALID` proves only the manifest-integrity
boundary; it is not remote-import, provider, demo-delivery or full pipeline
success.

## Acceptance matrix applied to the proof

1. **Exact subject and registration.** The producer must execute the original
   registered `kubeclaw.report.project-summary` stage under genuine PipelineRunner
   or StageExecutor lifecycle. A direct `buildSummary` call, copied stage,
   shadow parser or test registration replacing the owning stage is insufficient.
   Upstream artifact-contract fixtures are permitted only when clearly labelled;
   they are not native provider or agent execution.
2. **Real durability chain.** Use the actual AdapterRuntime,
   EffectCoordinator, disk FileEffectJournal and registered ArtifactStore. Retain
   the complete Summary `put_json` requested/accepted/completed chain, exact
   idempotency request and receipt, returned StageResult reference, lifecycle
   artifact record, stored JSON bytes and the reopened complete ArtifactRef.
   The original operation, resource, namespace, media type, value, ordinal and
   absence of encoding must remain visible. Do not infer them from source.
3. **Complete causality material.** Preserve the complete unsigned manifest and
   both locale recomputations, not only digest strings. Compare parsed unsigned
   values and every upstream ArtifactRef/value before attributing divergence to
   serialization order. No precomputed manifest hash may manufacture a result.
4. **Actual downstream boundary.** Execute the original registered
   `kubeclaw.remote-test-gate:evidence` adapter on the exact stored generated
   manifest reference in the other locale. Preserve its actual error and the
   journal prefix. A same-locale control may reach the real
   FileNovaGateImportStore and `projectDemoEvidence`, but remote envelopes remain
   explicit contract vectors. No mock import store, provider, deployment or
   successful remote-gate claim is allowed.
5. **Historical v2 reader domain.** Preserve a positive control showing that a
   valid v2 manifest with the original canonical inner digest remains readable
   when the outer ArtifactStore bytes/ref carry `kubeclaw-json.utf16.v1`.
   Portable outer encoding does not select a new inner algorithm. The proof must
   not narrow this already valid reader domain or imply that all v2 refs are
   untagged.
6. **Controls and negatives.** Require same-locale generated producer/consumer
   success, cross-locale generated rejection, wrong complete ref/bytes/size/
   producer/run/stage rejection, wrong inner digest rejection, ambiguous gate
   evidence rejection and actual import-binding failure. Report whether each
   failure occurs before or after `readVerifiedResult`; later boundaries cannot
   be inferred from an earlier rejection.
7. **Recovery honesty.** If requested/accepted/completed or process-reopen cases
   are exercised, each must use its genuine durable prefix. Completed replay
   issues no new write; accepted-without-receipt remains uncertain. A child exit
   is not called SIGKILL unless the process was actually signalled and its
   durable prefix is retained.
8. **Publication guard.** Author test, raw and report must be source-identical
   to a remotely saved sole-fresh-parent checkpoint before independent execution.
   No production file, current red source, register or MAIN may change for this
   proof. The prohibited semantic-helper action is not retried, rephrased or
   rerouted. No CI, deployment, provider, paid resource or third-party action is
   part of acceptance.

## Independent source and raw review

Both author test blobs were fetched from f3ddec, materialized in the isolated
e644a79 checkout and matched the remote Git blob IDs
`83b516c229e68fca9ae1b80c2b5c5c7d5bc988fc` and
`801a5c0a6d28a594a6c6a3f7bcd2e51b5c043342`. Their SHA-256 values match the
author report: child `e4e58ffe6de4958fc729320f5d2abb168c7e3866e9c1b613e677d6abb0a9a0c1`,
parent `19ff6011912b2dd3b0616fac04be514fc366c88ef75a9c15869528fe0b0dfa44`.

The fixture plugin does not replace the Summary or evidence adapter. It only
persists explicitly named implementation/lint/gate contract vectors through the
real ArtifactStore, then the original registered `kubeclaw.project-summary`
owner runs. A separate thin consumer registration invokes the original
registered `kubeclaw.remote-test-gate:evidence` adapter through Core. No copied
manifest validator, alternate hash implementation, mock ArtifactStore, mock
FileNovaGateImportStore, provider result or precomputed green result exists.

The remote author raw was read completely. It retains the full manifest and
unsigned value, stored JSON bytes, complete store/read refs, all effect recovery
state, exact ordered effect JSONL, exact lifecycle JSONL and the Summary
request/receipt. The lifecycle has one original project-summary attempt owner,
type `kubeclaw.report.project-summary`, its passed StageResult artifact, matching
`artifact.created`, and the same ArtifactStore receipt ref. The Summary write
has the original `put_json`, namespace, media type, canonical resource,
idempotency ordinal `:1:10` and no encoding field. The exact request has one
requested, accepted and completed journal row.

Author f3ddec demonstrates English stored semantic digest
`sha256:5b033483ae8a3debdeda748e2b7d1a2c40cbb790c570a529cac90835f65a382b`.
English untagged and tagged-portable v2 both pass the original manifest and
decision reads and reach actual `FileNovaGateImportStore`, which fails honestly
with `NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED`. Czech reopens the same stored ref
and bytes, obtains the same parsed manifest, recomputes
`sha256:68d15155b83efb5461f16d248f8c848193a850f66fc593108acee4282e32772d`,
and stops at `DEMO_EVIDENCE_MANIFEST_INVALID` after only the manifest read and
before the decision/import read. This precisely preserves the valid portable-v2
outer reader domain while proving that outer encoding does not repair the inner
v2 digest.

## Independent execution

The exact author RED test was rerun in the new checkout with independent raw
output. The registered producer succeeded. Fresh English semantic digest
`sha256:1f246742fbc7c1c1b14ea7590c992be4d9efb28273d666b8962b79641647556e`
and 6,608-byte ArtifactRef digest
`sha256:d3c66a1e2b457931cd204c59afa4b545d18c4a58d99a14fa2302bb8f1850569c`
were retained. Untagged and tagged-portable English again reached
`NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED`; Czech read that exact ref/bytes and
recomputed `sha256:87700436f6546f61edc7c4ebdbaf1b29b08d69879b3cc0d5344faf7bb3b04e86`,
then rejected at `DEMO_EVIDENCE_MANIFEST_INVALID`. The deliberately green
cross-locale expectation therefore produced the expected exit 1 with zero
skips. Random attempt IDs correctly make independent manifest digests differ
from author raw; the verified relationships and boundary are identical.

A separate reviewer-authored positive test independently parsed the fresh
journals and asserted registration ownership, full stored byte/ref/digest
relations, exact Summary request/receipt/lifecycle equality, v2 portable reader
acceptance and one-versus-two downstream ArtifactStore reads. Its first run
failed because the reviewer counted requested and accepted rows as two reads
(actual 4 rows rather than expected 2); that reviewer assertion was corrected
to count only `requested` rows. The complete failure is retained. The corrected
test passes 1/1 with zero skips.

Original regressions independently executed:

- `tests/verification/integration/project-summary.test.mjs`: 1/1 pass;
- project-summary `live-function.test.ts` and `package-boundary.test.mjs` from
  their required package cwd: 2/2 pass;
- an initial combined root-cwd invocation caused those two cwd-sensitive tests
  to resolve `/skills/...` and `/src/...`; that invocation failure is retained
  and not counted;
- original `remote-test-gate/tests/evidence-projection.test.ts` remains blocked
  before its assertion body because its unchanged child cannot spawn the absent
  `go` executable. This is retained and is not consumer acceptance.

Independent raw is under
`docs/review/evidence/run18-delivery-manifest-independent/`, including the full
fresh producer/consumer proofs, exact author-test transcript, corrected and
first-failure reviewer transcripts, original regressions and unchanged Go
blocker.

## Verdict and exact remaining boundary

The f3ddec RED/contract checkpoint is independently accepted as a genuine
registered Summary producer, disk persistence and original downstream-reader
counterexample. It closes the prior observation gap and is suitable input to a
separate final delivery-manifest design. It is not an implementation, passed
cross-locale gate, imported remote result, provider E2E, SIGKILL/recovery proof,
SDK closure or any finding/all-47 closure.

Production remains unauthorized until an independent final design freezes the
v3 field contract, public owner/API, finite compiler/default ownership and exact
old/new recovery matrix. The absent genuine imported result and Go prerequisite
remain open. The prohibited semantic helper was not invoked, reframed or
rerouted; no CI, deployment, provider, paid resource or third-party action was
performed.
