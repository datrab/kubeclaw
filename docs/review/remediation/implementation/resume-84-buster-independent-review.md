# Independent Buster fatal persistence ownership review

Initial reviewed source `daa2b37eb92fa2b811f04bf7f57e476c05a23a12`, separate
`review-buster-final` checkout. No production code changes by reviewer.

The bounded correction is sound: #drain owns the rejection before its finally
removes the execution. The first fatal error survives removal from the map,
closes readiness/admission and prevents the next queued job from starting.
Clearing the in-memory queue does not delete accepted durable records. Shutdown
checks the retained error after draining, including when invoked later or again.
Normal execution errors still use the existing terminal persistence path; an
ordinary persisted cancellation does not become a fatal storage failure.

The new tests use actual FileBusterPlanJobStore quotas, original Git snapshot and
attestation creation, original registry/job construction, and an actual regular
file where a runtime directory is required. No provider launches or mocked store
failures are involved. The terminal-record quota error remains authoritative;
the durable record stays running, so no terminal success is invented. Queued
accepted work is preserved for restart recovery.

The first independent run passes all four new cases and the existing real
result-reservation regression: **5 passed, 0 failed, 0 skipped**. Buster engine
TypeScript checking passes. Evidence is under
`docs/review/evidence/resume-84-buster-independent/`.

This review covers escaping execution-rejection ownership only. Existing
#execute status-read suppression remains explicitly uncorrected; it can still
hide a different unknown-store-state case. BuildKit shutdown behavior is
unchanged. No native provider quiescence, adopted ownership/recovery, or whole
service success under every I/O failure is claimed. No finding is promoted.

## Final follow-up reviewed and independently executed

Final source `36e2027e917dc6d26794c58bcf3b5d6e02d6acf1` adds the pending submission
chain to the synchronous shutdown snapshot, and checks actual rejected drain
participants after settlement. The retained first execution failure has priority.
This closes the admission-write gap raised during independent review: admission
already past its stop check cannot complete a durable accept after a reported
successful shutdown. Later submissions hit the synchronous stopping condition;
existing accepted writes may settle but cannot launch a new job.

The fifth new test holds the original durable-store admission lock using actual
flock, starts original submit, and proves shutdown stays pending until release.
The final accepted response and durable accepted record demonstrate this was an
already admitted write, not a rejected pre-admission call. The scheduling delay
is a test-placement assumption, while the accepted response/state and pending
shutdown assertion are actual observations. No fake store or lock is installed.

Independent final command:
```
node --test tests/verification/reliability/buster-shutdown-storage.test.mts tests/verification/reliability/result-reservation.test.mts
```
Result: **6 passed, 0 failed, 0 skipped**, including all five new original-store
cases plus the existing competing-process reservation regression. Original
Buster engine typecheck exits0. Configured source/test lint exits1 with the four
existing source categories (file size, depth, execute length/complexity), and no
new-test errors; no lint success is claimed. Source file count is766 lines.

Final bounded approval: escaping fatal persistence failures and pending durable
admission are retained/drained correctly on this reviewed source. The remaining
status-read suppression and native ownership/recovery limitations above still
apply. Filesystem/provider cleanup authority has not been broadened.
