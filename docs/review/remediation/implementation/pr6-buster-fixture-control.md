# Buster fixture control integration checkpoint

2026-09-13. Counts remain **138 locally verified / 16 incomplete**. This
checkpoint does not close a finding or activate Buster's native runner.

## Implemented boundary

`BusterFixtureControl` connects the real bounded native process channel to the
durable fixture journal. Readiness must match the admitted owner's actual scope
binding and active claim. The journal is written before acknowledgment and
dependency readiness. Repeated readiness, a different scope, or EOF without
teardown fails the control session. Teardown intent fences a concurrently
arriving readiness, including across acknowledgment I/O.

The host requires the original readiness digest acknowledgment before accepting
teardown. Teardown binds both admission and readiness digests. The first durable
reason remains immutable. Forced cancellation persists its intent independently
of channel writes, so it cannot wait for a host to consume a teardown message.
Neither channel completion nor SIGKILL manufactures a terminal receipt.

`startNativeBusterFixture` reserves the fixture before Core execution, obtains
the expected scope from the running ownership record, and exposes separate
readiness and completion promises. Terminal fixture sealing uses the original
Core journal only. External cancellation persists intent before aborting Core;
persistence uncertainty fences admission. Commands and limits are captured
before asynchronous reservation. Recovered readiness is never new authorization
to admit dependents.

## Local verification

`node --test --test-concurrency=1` on
`tests/verification/reliability/buster-fixture-control.test.mts` and
`tests/verification/reliability/buster-fixture-journal.test.mts`:
**12 passed, 0 failed, 0 skipped** (20.1 seconds).

These tests use real Node child processes, inherited descriptor 3, real sockets,
actual journal files and SIGKILL. Shared admission/readiness data are protocol
vectors, not simulated kernel execution evidence. The terminal journal test
uses an original never-launched Core receipt. Positive cgroup execution of the
new lifetime wrapper is not claimed.

Buster engine and strict fixture-test TypeScript checks pass. Canonical lint
initially found type-only imports and a deeply nested acknowledgment validator;
these were corrected before the successful final lint check.

## Remaining integration

The production scheduler still uses the old runner. The in-scope restricted
broker, actual Buster attempt host, fixture dependency scheduling, capability
accounting and old runner/file-capability/sampling removal remain unfinished.
The new lifetime API is not yet a production consumer. Native identity-switch,
scope accounting and full recovery acceptance remain separate D12 live gates.
No deployment, merge, or history cleanup occurred.
