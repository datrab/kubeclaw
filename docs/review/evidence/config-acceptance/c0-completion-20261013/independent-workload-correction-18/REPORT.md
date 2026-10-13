# Independent workload correction review 18

Reviewer: `/root/workload_correction_recheck_18`, fresh bounded source-definition reviewer, no implementation responsibility. Instructions: GOAL-START.md and OPENCLAW-CONFIG-GOAL.md. HEAD `263277b0014de5f056c019307c40dc83f0201ef5`; HEAD tree `2f2553f6ad902dc83c36e0de7020ccae05d44f86`. Exact bounded input SHA256 identities are in `input-identities.json`; this does not claim a full dirty-worktree snapshot.

## Verdict

**W17-001 and W17-002 corrections verified at bounded source-definition scope.** No unresolved blocking finding in those corrections. This verdict is not complete acceptance of the 23-row inventory, global C0-A–E, a runtime/native result, or C1–C6 authorization. All 23 row-level `definitionAccepted` flags remain false and all implementation `runtimeResult` values remain `not-run`.

## Independent observations

### W17-001: fixed-role envelope and distinct provenance — corrected

For SRC-61a34b698eb6c0ba, `classification` is now `generated-fixed-role-envelope`; `proposedAuthorOrGeneratedRef` correctly identifies the fixed control/studio/worker role loop, not workerTrust/enabled. Current workloads.yaml:13 enumerates those three roles. Line34 includes an explicit OR for each role: for either SPIFFE flag value the envelope is true inside this loop. This is source reasoning, not a Helm/native run.

Five separately named `generationInputs` pin exact expressions and whole-file hashes:

- role membership: 13/34;
- swarm checksum: 36/37, includes kubeclaw.swarmBundle for all three roles;
- worker role/policy: 39–41, worker-only constant `prism` and selected worker.native.policyDigest (the latter is emitted, not recomputed here);
- Control product checksum: 43/44, Control plus productDecisions.enabled, hashes toJson of productDecisions;
- trust checksum: 46/47, SPIFFE-enabled Control/worker only, hashes the corresponding rendered worker-trust ConfigMap data entry.

Thus disabling SPIFFE does not suppress the envelope, swarm checksum, worker role/policy, or independently enabled Control product checksum. Trust checksum retains its own flag/role dependency. No full transitive swarmBundle/ConfigMap generation closure is credited from these expression pins.

### W17-002: actual template readers — corrected

- SRC-4c6b76f7a12d287c: actualReaderRef is workloads.yaml:138, `toYaml (index $.Values $name).resources`; the fixed loop supplies each role, rather than values.yaml:27's Control author/default declaration.
- SRC-336010687eecb339: actualReaderRef is workloads.yaml:166, the direct Envoy repository:tag@digest projection; values.yaml:82 is retained only as `priorMisclassifiedReaderRef`, not an actual reader. This expression does not use prism.imageRef helper validation.
- SRC-031d2d94167393f9: actualReaderRef is workloads.yaml:167, the Envoy pullPolicy projection, not the image expression at166.

Current lines164–167 put Envoy reads inside SPIFFE-enabled Control/worker applicability; resource138 is role-generic. The corrected rows name Kubernetes scheduling/kubelet/container runtime downstream consumers and explicitly set `nativeConsumptionProven: false`. No scheduler, image-cache, kubelet or container-runtime effect is credited to a template read.

## Conservation and exact identities

Independent `check.py` compares all original 23 IDs, their ordering and uniqueness with review17's enumerated expected set. All 23 originalCandidate bodies are equal between batches25/26; their stored SHA256 values match independent canonical sorted-key/compact JSON hashing. Exactly the four expected definition rows change; the other 19 complete row bodies are unchanged.

All six original batch25 manifest pins match current bytes and the corresponding review17 frozen package bytes. The old manifest itself is byte-identical to review17's frozen manifest. All seven review17 frozen identities pass. All three batch26 manifest pins and its supersedesDefinitionRef pass. Batch25 source-field-definitions SHA256 remains `4d92bac3a16f03be5cac564dadde223f1becd8a7abdd77fa78618af275b56ddd`; reviewed batch26 SHA256 is `81f62d8762eea544c5320011ca6823c3c47b3558dcb8e1f40024b29c52e1c1dc`.

All 50 current Chart source/reader/provenance references encountered in batch26 match whole-file SHA256 and exact line expressions. That count is identity evidence, not semantic completeness. Non-Chart productive reader chains were not rereviewed. Original candidate-dispositions and prior batch24 queue bytes were not reread; this review checks preservation against unchanged batch25 and review17's frozen package/expected ID list, not a new independent discovery pass.

## Actual commands/evidence

Read scope: the two instruction documents; batch25 and26 small packages; review17 REPORT, frozen identities and frozen package; current Chart expressions and helper. Interactive commands used `rg --files`, `cat`, bounded Python JSON comparisons, `rg -n` to inspect the canonical body hashing expression, and `nl -ba ... | sed` for workloads.yaml:1–55/130–175. No batch25 define.py execution occurred.

Reproducible independent conservation/source check:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/independent-workload-correction-18/check.py
```

This check writes only this review directory. Actual execution exited0, with raw `check.stdout` and empty `check.stderr`; `checks.json` stores every comparison and derived envelope truth-table. Git read-only rev-parse captures HEAD/tree; exact material file hashes are in `input-identities.json`.

## Remaining limits/gates

Review17's whole selected schema/profile joins, exact setting/requirement/case links, complete typed role-specific A/B fixtures, concrete future executable oracles, generation/recovery binding, and authentic external image/Envoy/CSI/SPIRE/Kubernetes/native proof remain open. Transitive generation author closure and queued remaining source slices are not newly accepted. No broad test, Helm render, native operation, production-code/test/schema/canonical-inventory edit, deployment, merge or global acceptance occurred. Only this independent review directory was written.

Per-gate: bounded identity/conservation PASS; W17-001/002 correction PASS at source-definition scope; full schema/profile/case closure OPEN; native/runtime proof NOT-RUN; global C0-A/B/C only partial, C0-D/E NOT ACCEPTED. No implementation permission inferred.
