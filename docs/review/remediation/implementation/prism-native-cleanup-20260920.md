# Native backup test cleanup: B2 diagnosis and regression

The independent review observed one failed native run followed by a successful
repeat. The failed run reported `terminating connection due to administrator
command` and asynchronous exceptions after test completion. A repeat was not
accepted as an explanation. This change repairs the test's cleanup ordering; it
does not establish full IFR-26-001 disaster recovery.

## Cause and deterministic reproduction

The installed `pg-pool` implementation resolves `Pool.end()` once its client list
is empty. Removing an idle client removes it from that list synchronously, but
`client.end()` completes asynchronously. The public pool `remove` event is emitted
inside the client's actual close callback. Consequently, `await pool.end()` alone
can precede actual connection closure. The former test immediately executed
`DROP DATABASE ... WITH (FORCE)` and had no listener for idle pool errors.
A backend still connected at that instant can receive PostgreSQL error `57P01`;
the unhandled pool error then becomes an asynchronous test exception.

The [reproducer](../../evidence/prism-native-cleanup-20260920/reproduce-force-race.mjs)
creates a private randomly named database on the real loopback PostgreSQL server.
It holds the first client close request, without replacing any database command
or result. After `await pool.end()` resolves, a real `pg_stat_activity` query still
finds one backend. Executing the former force-drop ordering produces the exact
real error `57P01: terminating connection due to administrator command`.
The [captured result](../../evidence/prism-native-cleanup-20260920/before-race.txt)
records both observations. That force-drop exists only in this explicit historical
counterexample; the current native acceptance test no longer uses it.

This proves a concrete scheduling defect in the old cleanup and reproduces the
reviewed failure signature. The original failed run's complete stderr was not
retained, and its exact socket schedule cannot be reconstructed. We therefore do
not claim historical packet-level attribution or that no other error preceded
cleanup in that run. Its preserved PostgreSQL server logs showed five forceful
connection terminations without a server restart; this is consistent with the
reproduced multi-client teardown mechanism.

## Fix

The native test records connected clients through public pool events. Cleanup
waits for `Pool.end()` **and every corresponding `remove` callback** before dropping
its owned database. `DROP DATABASE` has no `FORCE`: leaked connections must fail
cleanup rather than being terminated to manufacture a passing test. Unexpected
idle pool errors are collected and fail cleanup explicitly; they are not ignored.

All cleanup operations settle independently. A primary proof failure remains the
first error; any cleanup failures are reported with it in an `AggregateError`.
Successful cleanup cannot replace a failed proof with success. The inventory
queries now run sequentially, so a failed table read cannot leave queued sibling
queries racing against teardown. Every original table and row remains checked.

## Regression and executed evidence

The new regression pauses actual client closure on a real PostgreSQL connection.
It asserts that the underlying pool has already ended while the test's cleanup
is still pending and the backend remains present. Only after releasing the real
client close does cleanup finish, and the database is successfully dropped
without `FORCE`. This would fail against the earlier cleanup ordering; the test
does not depend on catching a naturally intermittent race.

The independent reviewer subsequently found that the first version of this
regression checked `fullyClosed` too early: removing the wait for client removal
still passed. That first green regression did **not** establish defect detection.
The assertion is now also evaluated after the real `pg_stat_activity` roundtrip,
which yields beyond the promise microtasks while the actual client close remains
held. Independent positive and mutant reruns must bind their result to this
corrected test; the earlier 2/2 log below predates that additional assertion.

The full native suite then executes the original storage roundtrip: original
Prism migrations/repositories/artifacts, two separately initialized PostgreSQL
servers, quota failure, manual retirement, another capture, real restore, full
Prism row comparison and post-restore editing. No database query results are
mocked. No skip or relaxed production assertion was introduced.

- Native suite: **2/2 passed**, no skips or asynchronous test warnings.
- ESLint for the changed native test and `git diff --check`: passed.
- [Full native output](../../evidence/prism-native-cleanup-20260920/after-native.txt).
- [File identities](../../evidence/prism-native-cleanup-20260920/sha256.txt).

The same disposable PostgreSQL 18.6 servers and tool environment documented in
[the implementation matrix](prism-retirement-matrix-20260920.md) were used; no
server restart was required. The B1 retirement identity change is independently
owned by the parent agent and must be reviewed alongside this test repair.
The [independent final recheck](independent-backup-review-20260920.md) now confirms
2/2 on the corrected test, no asynchronous exceptions, and 0/1 for the mutant
with the client-removal wait deleted. Its raw evidence preserves the earlier
blind mutant run as well. Full Q1–Q4, keys/journals, concurrent writers, saved-session/job/pipeline
recovery and physical independent failure-domain recovery remain open.
