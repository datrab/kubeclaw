# Independent report-adapter deadline review — 2026-09-21

**Accepted as a bounded deadline-classification correction (RD1–RD4 and RD-DOC),
with the existing lint failures explicitly unresolved.** The reviewer did not
implement this change. Evidence and exact source snapshots are under
[`report-adapter-deadline-independent-20260921`](../../evidence/report-adapter-deadline-independent-20260921/).
No shared production or contract-test source was modified by this review.

The catch is narrow: it requires the internal deadline to have aborted, that
exact reason to have won the combined signal, an Error with the cancellation
message, and the same reason object as its cause. A matching string alone is
insufficient. It rethrows every other error. `ProcessInputCleanupError` remains
distinct and the existing inner catch keeps its snapshot. The underlying process
helper still waits for its lifecycle cleanup before settling; this patch does
not shorten cleanup or turn a cleanup failure into a successful termination.
Pre-process caller cancellation can retain its original reason, as before; the
new translation targets the process helper's wrapped cancellation only.

## Independent executions

- Original report-runtime and JUnit contracts passed **2/2**, no skips, using
  Node and the actual built sandbox (`original-tests.txt`). The original timeout
  assertion is unchanged. The author's additional same-text caller-cancellation
  and successful snapshot-removal assertions execute in this run.
- `probe.mjs` builds a private runner from the original package/artifact fixtures
  and imports the original production runtime and lifecycle. It runs actual slow
  adapter children. For two ordering probes, a test-only wrapper awaits the
  **real original cleanup**, then delays settlement. Caller abort first remains
  caller cancellation even when the internal deadline subsequently fires during
  settlement; internal deadline first remains its own timeout despite a later
  caller abort. Both snapshots are removed only after completion.
- A third probe injects a cleanup exception **after the real cleanup has already
  drained the child**. The actual process helper produces
  `REPORT_ADAPTER_CLEANUP_FAILED`, preserves the injected failure, and the actual
  adapter retains its snapshot. This proves error propagation/retention at an
  explicit fault-injection seam. It does **not** prove an actual failed kernel
  drain. The prototype wrapper is restored in `finally`; the test deletes the
  retained temporary snapshot only after inspecting it.
- Two isolated negative controls are detected by the same independent oracles:
  a broad deadline-only unwrap misclassifies the caller-first ordering; masking
  cleanup errors as timeout fails the cleanup-error predicate. Hashes and raw
  outputs are in `mutations.txt` and its two mutant directories. Copied runtime
  modules resolve the original child file and dependencies; no shared source was
  mutated and no module-resolution failure is counted as detection.

The initial probe-generator invocation used the nonexistent string method
`index` rather than `indexOf` and stopped before running any child. The generator
correction and failure are explicitly recorded. Only the subsequent completed
probe counts as evidence.

## Documentation and limits

The architecture paragraph correctly describes total-deadline scope, exact cause
identity, caller meaning and cleanup precedence without claiming rollback of
external effects. The implementation report's wording was corrected from Error
“named” to Error “with message,” matching the actual predicate.

The independent Buster engine TypeScript check passed (exit 0); its output is
recorded separately from lint. Lint remains
red for the five documented existing runtime rules; the file-length excess grows
with the added catch. This review does not relabel that result as green. A separate
structural cleanup must preserve the reviewed classification and disposal logic.

No Buster native-owner integration, full native process-pool acceptance or live
cluster completion follows from this review. The only simulated behavior above
is the clearly declared delayed settlement/injected cleanup exception; actual
adapter execution and ordinary drain still use the original implementations.
