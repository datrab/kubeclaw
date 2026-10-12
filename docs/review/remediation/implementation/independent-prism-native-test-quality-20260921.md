# Independent Prism native test quality review — 2026-09-21

The bounded test maintenance change is accepted. This reviewer did not implement
its renames, package changes or helper extraction. This acceptance covers NQ1–NQ4
and NQ-DOC as a preservation/lint follow-up, not Prism native resource execution
or the broader Buster/worker findings.

## Independent evidence

Raw evidence and the reproducible comparison are in
[`prism-native-test-quality-independent-20260921`](../../evidence/prism-native-test-quality-independent-20260921/).

| Check | Independent result |
| --- | --- |
| Original snapshots | SHA-256 checked against the author's recorded six pre-edit sources. |
| Three native test renames | Exact byte equality to pre-edit snapshots; old paths absent; new glob has exactly the same three members. |
| Root and Prism package commands | Entire package bytes equal the original after only substituting the native glob; explicit attribution integration selection retained. |
| Attribution helper | Independent TypeScript syntax-tree comparison after expanding the helper call and removing its type-only import change restores the original tree exactly. |
| Negative controls | Changing the 60,000 ms deadline or removing the filesystem cleanup registration causes the independent comparison to fail. |
| Canonical lint | Independently reran the explicit 25-source resource/follow-up list; exit 0, including `swarm-resource-operation.test.mts` and all three renamed native tests. |
| Prism typecheck | `npm run typecheck --prefix skills/prism`; exit 0. |
| Original native command | Independently attempted `npm run verify:prism:native-worker`; nonpassing, not substituted with a fake native host. |

Manual inspection also confirms the helper is awaited immediately after storing
the artifact, at the original service-setup location. It closes over the same
module input/digest and takes the same test context/store objects. The server's
cleanup is registered after listening and before native-worker creation, while
filesystem cleanup remains after worker creation. The read/release promises,
authorization and URL assertions, HTTP handling, CPU burn, worker dispatch,
receipt binding and observed CPU comparison are unchanged. No assertions, test
names, numerical limits, timeouts or native prerequisites were relaxed.

The current inventory distinguishes historical old filenames from current active
paths; old filenames inside immutable evidence snapshots remain legitimate.
Original review evidence was preserved. The author's initial comparison-checker
failure remains recorded separately from the corrected comparison, and the
previously omitted lint input is now explicitly included rather than being
retroactively claimed as earlier coverage.

## Native execution limitation

The original native harness requires `PRISM_NATIVE_ISOLATED_TEST_POOL=true` and
its actual native host prerequisites. They are not available here. The independent
run retains these failures and uses a 35-second reviewer process-group deadline
to stop hanging test activity. That bound is outside the product/test source; it
is not a passing test timeout or an execution of all later serial modules.
`native-status.json` records the exact exit and interruption, and `native-suite.txt`
retains the output. No kernel resource, cancellation, shutdown or accounting
acceptance claim follows from this maintenance review.

No product source, tests, lint rules, acceptance budgets or runtime configuration
were changed by this reviewer. `source-identities.json` binds the reviewed current
sources and implementation documentation.
