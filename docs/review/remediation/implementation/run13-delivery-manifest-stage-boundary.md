# Delivery manifest registered-stage boundary checkpoint

Status: coherent RED/contract proof, independently reviewable; no production
implementation, runtime acceptance, SDK closure or finding closure. Run
`20260910t035412`, author `run13_delivery_author`.

## Authority and frozen scope

The remote integration base is
`e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`. The isolated checkout was
reconstructed with that exact complete tree before this additive proof. Fresh
remote resume README, work-items, package-checkpoints, root-checkpoint, active
inventory, latest continuation, current register and c387 baseline were read.
The 47 baseline `implementiert` IDs exactly match `partial-47-scope.json`; their
original `source_finding_text` is unchanged. Current status remains eight
`verifiziert`, 39 `implementiert`, overall incomplete.

Read the complete preparatory design
`13f0aa8262a20c31aac25a62b63e3aa018155768` and independent review
`98d8f41abf0d822d94f1d854326a252e5dfa25ac`. They explicitly authorized no
production source. This checkpoint therefore adds only a proof and its raw
records. It is separate from, and does not invoke or emulate, the prohibited
semantic helper action.

## Actual executed chain

The new unchanged-source proof discovers and activates the original packages,
registers the original `kubeclaw.report.project-summary` stage, and executes it
through `PipelineRunner`, `AdapterRuntime`, `EffectCoordinator`, disk
`FileEffectJournal`, `FileResourceLockManager` and the original disk
ArtifactStore. Four preceding registered stages persist implementation, lint,
module-gate and final-gate artifact-contract vectors. Those vectors are labeled
fixtures: no agent, remote provider, build, deployment or imported-result
success is claimed.

The registered producer succeeds. The full returned manifest, unsigned body,
stored JSON bytes, complete ArtifactRef, all producer effect requests/receipts,
and especially the Summary write request/receipt are retained in
`producer-proof.json`. The proof also embeds the exact ordered producer effect
and lifecycle JSONL. It asserts that the registered Summary
`attempt.completed` StageResult ArtifactRef, subsequent `artifact.created`
checkpoint and completed write-receipt ArtifactRef are byte-for-byte equal.
Each consumer proof likewise embeds its exact ordered effect and lifecycle
JSONL, so requested/accepted/completed ordering is independently replayable
rather than inferred from final journal state. The actual Summary write is:

- operation `put_json`, namespace `kubeclaw.project-summary`;
- resource `project-summary:run:delivery-manifest-stage-boundary`;
- idempotency key
  `run:delivery-manifest-stage-boundary:project-summary:1:10`;
- absent `payload.encoding`, retaining historical v2 behavior;
- completed receipt from the original ArtifactStore;
- semantic digest
  `sha256:5b033483ae8a3debdeda748e2b7d1a2c40cbb790c570a529cac90835f65a382b`;
- stored ArtifactRef digest
  `sha256:4b024bdf2fb6d908e3522ffa3d9e4b7f2aa01a87b54ef067d1dfcf4aeeba9f4a`,
  6,608 bytes.

Separate registered consumer runs invoke the original
`kubeclaw.remote-test-gate:evidence` adapter through Core against that stored
generated manifest. No parser, hash, provider or import-store substitute is
used. The same-locale English run passes manifest and gate validation, then
stops honestly at `NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED`: the deliberately
absent genuine imported result is not manufactured. An explicit reader-domain
contract copy stores the identical v2 value using the already accepted
`kubeclaw-json.utf16.v1` outer tag; the original reader likewise reaches the
same import boundary. This preserves existing v2 acceptance of valid portable
outer refs without changing or inferring v2 semantic digest rules.

The Czech run reads the exact original stored ArtifactRef and exact bytes. Its
parsed manifest matches the producer value, but its unchanged v2 unsigned-body
rehash is
`sha256:68d15155b83efb5461f16d248f8c848193a850f66fc593108acee4282e32772d`,
not the stored semantic digest. The original evidence adapter therefore stops
earlier at `DEMO_EVIDENCE_MANIFEST_INVALID`; its import store is not reached.
The intentionally green expectation that the same v2 generated manifest cross
this boundary fails, producing the retained exit 1. This establishes the
registered producer/persistence/original-consumer defect boundary. It does not
establish provider E2E, remote gate success, delivery, or an accepted fix.

## Commands and results

`KUBECLAW_DELIVERY_MANIFEST_PROOF_OUTPUT=docs/review/evidence/run13-delivery-manifest-stage-boundary node --test tests/verification/reliability/delivery-manifest-stage-boundary.test.mjs`

- expected RED, actual exit 1, zero skips;
- registered producer `succeeded`;
- English original untagged v2 and tagged-portable v2 both reach
  `NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED`;
- Czech exact stored v2 rejects at `DEMO_EVIDENCE_MANIFEST_INVALID`;
- full raw and exact node-test transcript retained.

`node --test tests/verification/integration/project-summary.test.mjs`

- exit 0, original artifact-contract suite passed.

`node --test skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts`

- exit 1 before its assertion body because its unchanged child requires the
  absent `go` executable (`spawnSync go ENOENT`);
- the direct child confirms two non-Go contract negatives pass and the native
  controller credential producer alone is environment-blocked;
- this failure is retained, not counted as consumer acceptance and not retried
  endlessly.

Raw material is in
`docs/review/evidence/run13-delivery-manifest-stage-boundary/`. SHA-256:

- `producer-proof.json`:
  `4e5daeadecf3ca65e3cedacc548d299526295eb0dda141ceb028a826b047d4c8`;
- `consume-en-proof.json`:
  `d759204f0cbea11c837093a0b15434ba808451f4225c40b91633798caf4de048`;
- `consume-portable-en-proof.json`:
  `abca65f16dd8f3356e21c72c1676810b15d032f5d62a867c716fea88230cd193`;
- `consume-cs-proof.json`:
  `e74155f4fdab4ce3eca43d5c7044f042e67ac725606e7eba6a66147a201156ac`;
- `phase-transcript.json`:
  `f9ed3c15f5ee2a82adc41441331a3963af91a8a2ab887da6d3a703bafb003591`;
- `node-test.txt`:
  `191bb19ed64c15e63c67c6e50fa6b4111682af9c2042da18114347edd137472e`;
- `regression.txt`:
  `280160a63088b8d38557da8727808983e991b2cc2d78c679b8bd13fdbdbd48a9`.

The test source hashes are
`e4e58ffe6de4958fc729320f5d2abb168c7e3866e9c1b613e677d6abb0a9a0c1`
for the child and
`19ff6011912b2dd3b0616fac04be514fc366c88ef75a9c15869528fe0b0dfa44`
for the parent at this checkpoint.

## Exact remaining decisions and gates

This RED closes the missing observation gap only. Before any production source
authorization, an independently reviewed final design must freeze:

1. the exact closed `delivery-manifest.v3` required/optional field contract,
   nested bindings, limits, unsigned digest body and full-ref ownership;
2. the legitimate shared contract owner/API or bounded version-map parity
   mechanism, without private cross-plugin imports or two drifting validators;
3. the exact finite Summary configuration selector, old omission behavior,
   compiler option/default ownership and whole-graph recovery rules independent
   of Review semantic mode;
4. v3 portable inner digest plus required portable outer encoding while keeping
   the existing v2 reader domain demonstrated here;
5. old/new requested, accepted, completed, genuine-prefix and actual SIGKILL
   write/read histories, plus all no-trap/version/codec/ref/owner/size/digest/
   coverage/import-failure negatives from the preparatory review;
6. unchanged original Summary/evidence-adapter/demo candidate, package pins,
   current-source archive restoration, full regression and independent frozen-
   source acceptance.

The absent Go prerequisite and absent genuine imported remote result remain
open. No source, register, MAIN, CI, deployment, production resource, provider
or third-party communication was changed. This branch is a red/partial durable
checkpoint, not implementation approval.
