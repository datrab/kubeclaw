# Remaining SDK digest consumers: demonstrated versus inspected

Checkpoint source base: `4baa56945abafc608303cf919a365921f2b7a18a`.
This is a bounded inventory refinement, not a claim that all SDK domains have
been enumerated or that a number of textual imports equals unresolved defects.

| Persisted domain | Accepted dynamic keys and actual consumer | Evidence / next action |
| --- | --- | --- |
| Repair pending/order digest | `core/lifecycle/repair-budget.ts:pendingRepair` hashes complete `request.requesterResult.reason.details`, an open JSON object in the production StageResult schema. `sourceFacts` itself is restricted to ASCII namespaced IDs. `recovery-state.ts:recoverAttemptResult` recomputes pending identity; `repair-authorization.ts:authorizedRepair` compares the original signal against it. | **Actual defect reproduced** by original Core, Git, ArtifactStore, disk journal, recovery and authorization across en-US/sv-SE. Explicit version must be bound to the original authoritative completion/repair record, with historical completed-attempt prefixes preserved. Do not infer a new repair version from existing run-snapshot.v2. |
| OpenClaw collector/session transport ID | `runtime-dispatch/src/openclaw.ts:dispatchPayload` retains arbitrary model-payload JSON keys; `dispatchOpenClaw` hashes them into collector-v5/session-v1 IDs. Those determine result paths, labels, group IDs and spawn idempotency. | Source-confirmed dynamic domain, **no original gateway execution in this slice**. Requires original dispatch/reconciliation proof and explicit transport generation migration preserving existing side effects. Not a safe blanket comparator change. |
| Pipeline audit | `core/telemetry/audit.ts:readPipelineAudit` hashes redacted original journal event payloads, which can contain open JSON details. | Dynamic projection domain; no original downstream digest-verifier failure demonstrated in this slice. Identify actual persistence/validation consumer before migrating output version. Original journal sourceRecordHash is a different raw-byte domain and must not change. |
| Delivery manifest | `project-summary/src/summary.ts` and `remote-test-gate/src/evidence-adapter.ts`; inspected contract fields, coverage and refs have fixed ASCII object keys. | No accepted dynamic-key failure found. Purely preventive v3 changes discarded; no product/test change made. |

## Actual repair authorization reproducer

Run from the current repository root:

`node docs/review/evidence/run2-sdk-remaining/repair-authorization-locale.mjs`

The script needs current dependencies and Git, not historical local Git objects.
It runs the existing deterministic checker fixture through the original Core.
Only the temporary test plugin's finding `reason.details` is augmented with
contract-valid Unicode keys; its actual result is checked with the production
StageResult validator. Real Git source attempts and real ArtifactStore writes
produce the waiting run. No production code is patched, no runtime capability
response is mocked, and no native or full application delivery is claimed.

The same original signal is accepted by English recovery and rejected by Swedish
recovery with `REPAIR_AUTHORIZATION_INVALID`. Both readers operate on the same
hash-verified journal, whose bytes remain unchanged. The persisted wait retains
the original digest while pending state is recalculated differently.

Raw result: `docs/review/evidence/run2-sdk-remaining/repair-authorization-locale.txt`.
`reproducedOpenDefect: true` means reproduction succeeded, **not repair passed**.
The audit is intentionally outside the product acceptance test glob.

Next: version the coupled completion/repair identity, preserve the historical
wait/signal and crash-prefix authority, and run genuine original producer and
recovery tests before integrating. PCR-SDK-001 remains incomplete.
