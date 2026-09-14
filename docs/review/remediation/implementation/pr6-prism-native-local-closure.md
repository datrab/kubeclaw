# PCR-PRISM-WORKER-002 — local closure under D12

Reviewed production baseline: `60620e34cbcfc5cd616fb20c9166d8f9123aa7eb`
(remote tree `f1454e8f4c63df6968450eaa77ee972d0b26fabf`).

The register still described the pre-native shared-process CPU implementation.
That diagnosis is superseded by the Prism-only V3 startup at `e71a21dd` and the
launcher ownership correction at `60620e34`.

## Actual production path

1. `skills/prism/server/worker.ts` is the sole startup path. Host authority,
   ownership recovery and journal recovery precede HTTP admission.
2. `native-worker-execution.ts` supplies the original Core native executor with
   the accepted V3 envelope and an unprivileged per-attempt host. A fresh scope
   is allocated from the fixed pool; parallel attempts cannot share its binding.
3. `native-worker-host.ts` runs the real Prism operation. Its own process and
   browser descendants inherit the scope. `worker-operation.ts` reads the scope's
   cumulative kernel counters; it has no shared `process.cpuUsage` measurement.
4. `native-worker-process.ts` checks budgets during execution and again against
   final counters after `lease.finish()`. The durable owner drains every task,
   stores final counters before removing the scope, and fences unresolved work.
5. `native-result.ts` requires an unpopulated scope, replaces provisional counters
   with the final native observation and reseals the result with the envelope
   binding. Parent process CPU is not an input to this path.

The deleted V1 producer and shared-process execution are not restored. The one
remaining test importing `prismAttempt` is now backed by an original captured
V1 envelope and verifies its digest before checking the V1/V3 distinction.

## Local evidence and exact limits

- The six-file Prism/Core run passed **21 tests** and exposed the stale import
  in `worker-native-contract.test.mts` (that file failed to load).
- After correcting the import, all **3 tests** in that contract file pass:
  historical V1 validation, versioned task budgets, and policy against actual
  kernel task observations. This is 24 individual checks across the six files;
  it is not a claim that the initially failing command exited successfully.
- The 21 passing checks include real Prism rendering and artifact HTTP I/O,
  historical receipt binding, cancellation, native startup refusal before
  admission, actual kernel CPU/task counters and durable journal SIGKILL/replay.
- The preceding launch ownership checkpoint adds 24 process/ownership/control
  checks and passing Core typecheck/lint; some coverage overlaps.

Commands for the six-file run:

`node --test --test-concurrency=1 tests/verification/reliability/worker-native-observation.test.mts tests/verification/reliability/worker-native-contract.test.mts tests/verification/reliability/worker-native-journal.test.mts tests/verification/reliability/prism-native-startup.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-cancellation.test.mts`

Corrected file rerun:
`node --test tests/verification/reliability/worker-native-contract.test.mts`

Prism production typecheck and canonical-config lint of the corrected contract
test also pass.

D12 closure: the shared-parent measurement implementation has been removed,
production now binds measurement and finalization to a native attempt, and
local component coverage is sufficient for this finding. **Locally verified**.

Still deferred, not passed here: positive delegated cgroup/UID launch, the
concurrent supervisor-CPU attribution gate in
`skills/prism/integration/worker-concurrent-resource-attribution.mts`, native
browser-tree accounting and deployed HTTP/shutdown acceptance. The original
native gates remain executable and fail on missing prerequisites. This closure
is not a live acceptance or a closure of Buster/retention findings.
