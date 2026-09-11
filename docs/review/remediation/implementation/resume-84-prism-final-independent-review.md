# Final bounded worker shutdown review

Source `69d7fa49167d6d70c6a8435c6a8e0cdf4aecbfe4`, tree
`4082654e290fd1f9b5a733ad9a9e24748de7dab0`, independently checked against
`58790e7ac6cf40d5416caada8347697115efcf47` in a separate worktree.

The earlier logging-dependent cutoff concern is resolved: the failure exit no
longer awaits the stderr callback. The diagnostic is best-effort and process
exit is explicit/nonzero. Consequently this reviewer approves the bounded
shutdown implementation, subject to its documented native/external limits.

Both new original test files independently pass: **9 tests, 0 failures, 0 skips**.
`worker-process-shutdown.test.mts` starts the actual worker entrypoint, sends real
SIGTERM/SIGINT, and verifies read-drain, failure-log-upload drain and nonzero
cutoff when actual pg connection startup exceeds the service deadline.
`worker-shutdown-boundaries.test.mts` checks actual native pg pool/TCP settlement,
explicit unresolved deadline preservation, and invalid-budget rejection.

The upload child cases are correctly bounded. The SPIFFE-mode worker has no
Bearer header while the original HMAC artifact handler requires one, so input
returns the genuine401 error. Core's original first error remains
WORKER_ATTEMPT_ERROR/errored, while the actual failure-log bytes reach disk and
its stalled acknowledgement is cancelled during shutdown. This is valid evidence
for failure-phase upload drain; it does not prove successful trust composition or
render execution in that child. Separate in-process tests cover normal completed
render/full-log behavior. No replacement provider, engine, pg client or browser
was introduced by the tests.

Native pg client/TCP tests are not successful SQL/database-service acceptance.
Native Chromium reaping, pod/proxy termination ordering, per-attempt resource
isolation and full Control PostgreSQL transaction replay remain open. No finding
status is promoted. No production source was changed by the reviewer.

Command:
```
node --test skills/prism/tests/worker-process-shutdown.test.mts skills/prism/tests/worker-shutdown-boundaries.test.mts
```
Exit0 and raw output: `docs/review/evidence/resume-84-prism-final-review/tests.txt`.
