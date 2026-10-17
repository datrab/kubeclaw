# Pipeline Observability Phase 5.7 Final Audit

Status: pipeline-side complete; ClawDeck deployment pending

## Result

Phase 5.7-A through Phase 5.7-F are implemented.

The pipeline now has one durable observability foundation:

1. Each producer has a stable identity, boot identity, local sequence, and
   pipeline correlation.
2. A producer stores a record before delivery.
3. Admission acknowledges a record only after durable storage.
4. Duplicate delivery is safe. Conflicting or invalid data is quarantined.
5. Worker evidence and terminal results are durable before completion returns.
6. A durable completion intent can finish admission and closure after a crash.
7. Nova reconciles durable results after restart. It imports each result once.
8. Earlier safe work can continue with a visible degraded state.
9. Safety-critical and final gates stop when required evidence is incomplete.
10. ClawDeck receives one joined view over raw records, normalized results,
    evidence references, closures, gaps, and completeness.
11. Worker lifecycle and attempt completion use separate producer identities.
12. Quarantine overflow affects only the pipeline run identified by the raw
    record. It does not degrade unrelated runs.
13. A telemetry-admission outage cannot turn completed provider work into a
    provider failure or cause the provider to run again.
14. The Nova pipeline recovery path invokes observability reconciliation before
    it resumes the pipeline graph.
15. A restarted Buster never executes a provider whose durable result already
    exists. It retries admission and hands graph recovery to Nova.
16. The embedded Buster and Nova profiles use one run-local durable-store root.
17. A gap is restored only after its complete sequence range is durable.
18. Buster requires an explicit observability root. It cannot silently choose a
    store that Nova does not know.
19. A new receipt attests the durable result after evidence references change.
20. Injected stores cannot bypass the declared shared observability root.
21. Expired staged evidence that has no durable result releases its bounded
    storage capacity.
22. Required evidence is read and verified again during completeness checks.
23. Provider outputs use durable evidence references. They do not depend on a
    temporary provider workspace.
24. Store paths reject symbolic links. The durable observability root cannot
    overlap the provider-writable workspace.
25. The worker stores only the exact terminal result accepted by the worker
    runtime.
26. The latest-claim check, completion admission, and closure commit form one
    serialized operation.
27. A restarted Buster skips stale claim generations and never re-runs a
    provider with an accepted durable result.
28. Different durable stores use independent kernel lock files. Nested store
    transactions do not block each other.
29. A result must become durable before its claim expires. A late result is
    rejected and requeued with the next claim generation.
30. Each Buster result records its plan and node owner. Buster delegates only
    pending completions for its own plan to Nova.
31. Result publication uses a pending marker. Its durable time is recorded only
    after the result has already reached durable storage.
32. Nova checks the stored plan and node owner before it imports a result.
33. Attempt finalization and a newer claim generation cannot both win. The
    durable store accepts the first valid terminal state and rejects the race.
34. Artifact, plugin-state, wait, and bounded telemetry adapters use one
    replaceable durable-record interface.
35. Artifact metadata no longer uses `catalog.jsonl`. State, wait, and
    telemetry adapters no longer own separate JSONL authorities.
36. External notification and transport actions save a durable request before
    delivery. They save a receipt or failure after delivery.
37. The embedded driver proves concurrent writers, restart replay, stable
    sequences, idempotency, bounded storage, and corruption detection.
38. Artifact metadata admission occurs before blob storage. A rejected
    metadata record cannot leave an unreferenced blob. Reads hide a pending
    record until its blob exists and can use an older completed record.
39. Notification and transport request identities do not contain the attempt.
    A failed delivery can retry with the same delivery identity from a later
    attempt. Failure records still identify the attempt that failed.
40. Derived delivery record identities have a fixed length. Maximum-length
    caller idempotency keys remain valid and remain visible in request and
    failure payloads.
41. Telemetry accepts only an exact duplicate for a reused idempotency key. A
    different sanitized payload fails as an idempotency conflict.
42. Delivery adapters compare the durable request before they return a saved
    receipt. Changed content cannot reuse an earlier success.
43. Delivery adapters reserve a terminal record before the network action.
    Store exhaustion stops the action before it can create an unrecorded
    external effect.
44. Wait storage accepts the full pipeline idempotency-key length. A valid
    maximum-length key cannot create a record that later blocks stream reads.
45. Artifact namespace validation includes the durable stream prefix. Every
    accepted namespace fits the shared record contract.
46. Delivery record limits include the durable envelope. A payload accepted at
    the configured maximum can still be recorded before delivery.
47. A durable success replaces a concurrent failure for the same delivery
    attempt. Later replay returns the success and does not send again.

## Authority

Nova remains the pipeline decision authority. Workers own only their attempt
facts. ClawDeck is the observability authority. It does not schedule work or
make gate decisions.

## Scale and recovery proof

The proofs cover:

- 20 mixed-order worker completions.
- Nova restart after 10 imports.
- Worker result and evidence recovery.
- Nova replay of a completion that a crashed worker did not finish admitting.
- Nova lifecycle recovery through the persisted reconciliation plan.
- Admission outage after provider completion without provider re-execution.
- Claim expiry and requeue.
- Duplicate delivery.
- Delayed and out-of-order delivery.
- Producer clock skew.
- Missing ranges and late records.
- Quarantine and bounded storage.
- Run-scoped quarantine overflow.
- Live tail from the durable history.

The Terra review rounds found and corrected concrete issues in run attribution,
producer identity, ingress bounds, cross-process locking, retry behavior, and
Nova startup recovery. Later review rounds also corrected evidence
revalidation, provider-workspace separation, stale-claim races, result
acceptance order, nested store locking, rejected artifact cleanup, pending
artifact visibility, telemetry conflict handling, bounded derived keys,
terminal delivery reservations, full-length wait keys, and cross-attempt
delivery retries. The focused proofs pass after these
corrections. The final Terra high-reasoning review is clean. It reports no
accepted or actionable finding.

## Capability retention

The Buster test-plan runner still passes its full focused contract proof. The
new persistence step runs before a terminal result returns. Existing provider,
retry, cancellation, evidence, cleanup, and isolation behavior remains under
test.

The complete contract suite passes with all 40 existing plugin registrations.
Runtime package ownership, role isolation, reproducible bundles, generated
documentation, local references, and production dependency security checks
also pass. The production dependency audit reports zero known vulnerabilities.

## Remaining deployment work

The file stores are the first embedded profile. A production ClawDeck
deployment still needs PostgreSQL and durable object-storage drivers, high
availability, retention jobs, and operational dashboards. These drivers must
keep the Phase 5.7 wire contracts and proof behavior.

This audit does not claim that ClawDeck itself is deployed. It proves that the
pipeline has the contracts and replaceable storage boundaries that ClawDeck
will consume later.

This is a pre-deployment atomic cutover. The repository has no production
configuration that activated the former artifact, state, wait, or telemetry
JSONL stores. Their only configured paths were disposable verification
fixtures. There is no live durable dataset to import, so the pipeline does not
carry a legacy migration reader. A future deployed-store migration must be an
explicit implementation phase and must not be inferred from this cutover.

The legacy Buster status, runtime-result, and per-suite evidence bridges remain
for suites that have not moved to the new provider runtime. Their removal is a
suite-migration and Phase 7 task. Redis remains a non-authoritative live
transport. Nova's hash-chained pipeline journal remains Nova's control record.

Phase 7 still must persist the reconciliation plan before remote dispatch and
map the reconciled test-gate result into Nova's lifecycle graph. Phase 5.7 does
not invent that mapping early. The recovery hook and durable reconciliation
graph are active and ready for the Phase 7 connection.
