# Independent review: native process/scope boundary

Bounded acceptance: NP1–NP4 and NP-DOC pass independent review, now including
the unchanged original kernel consumer in separately bound VM run 3. Original
native scope/topology passes 12/12; the full node-pools gate and IFR16 remain
unaccepted. Run 2 remains failed evidence. Reviewer did not author the production
fix or maintained tests.

Independent source comparison confirms the production delta is exactly one
allocation-argument projection to `memoryBytes` and `tasks`. The full cloned
process policy remains available for input admission, output capture, measured
CPU/memory/tasks classification, polling, timeout and drain handling. Snapshot
and allocation ordering are unchanged. The strict child decoder is byte-identical
to the failed VM snapshot; no decoder relaxation, quota increase or alternate
production implementation was introduced.

Fresh serial execution passed all 12 original launch/cancellation and new
policy tests, with no skips/cancellations. The policy tests use actual child
process I/O and deadlines with explicitly modeled ownership; their observations
do not prove kernel accounting. Scoped native TypeScript and canonical ESLint
both exited 0. A private loader reverted only the projection: the original four
maintained policy cases then produced one pass and three actual
`WORKER_NATIVE_LIMIT_INVALID` failures. This reproduces the same decoder boundary
as VM run 2. An earlier malformed import-path invocation failed before testing;
its log is preserved and is not counted as mutation evidence.

All author-frozen identities matched during review. Both original kernel files
and all seven original node-pools files are byte-identical to the run-1/run-2
snapshot, including deadlines and assertions. The new test is wired into the
maintained node-pools command and native typecheck project. The runbook and
author report distinguish the production regression from the first VM fixture
failure, acknowledge the earlier review's coverage gap, and preserve the failed
kernel result instead of substituting modeled proof.

Evidence: `docs/review/evidence/native-process-scope-limits-independent-20260921/`:
`commands.json`, terminal test/type/lint logs, private semantic mutation,
`production.diff`, and source identities. The separate run-2 execution report
retains 11/12 native passes, 30/35 node-pools passes, one node-pools prerequisite
failure and four original-deadline cancellations.

## Actual kernel follow-up

As nonauthor of the production fix, the reviewer inspected run-3 terminal logs,
source bindings and wrapper result. All twelve unchanged native scope/topology
cases passed with zero skips/cancellations/failures, including the exact
previously failing production-launcher/whole-host/replay consumer (19,396 ms).
The independent source copy changed only the reviewed runner, new policy test
and its package/typecheck wiring; strict decoder and original cases stayed
unchanged. Source verification passed before and after execution. This completes
the previously pending real-kernel validation for the projection correction.

The complete run still returned failure: node pools 39 tests, 34 passed, one
missing-systemd-parser failure and four unchanged-deadline cancellations, zero
skips. No broader native deployment or physical-host capacity claim follows.
See [run-3 terminal evidence](isolated-native-vm-run3-execution-20260921.md).
