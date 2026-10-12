# Independent source review: Report policy consumer candidates

Decision: **hold integration pending owned-process cleanup correction**. This is a
read-only, nonauthor review of the private eight-test candidate. No syntax check,
render, typecheck or runtime was executed. Candidate SHA256:
`870abfc42026583f39cd1c636ac2468d1c1e66a127c9658d9bb36d799c326df1`.
All eleven archived baseline hashes match their manifest and current live files.

## Blocking finding: failed assertions can remove a still-owned process tree

[Fixture setup](../../evidence/buster-report-policy-consumers-20260921/files/tests/verification/contracts/buster-report-policy-consumers.test.mjs:41)
unconditionally removes its directory in `t.after`. The later child observer
only restores the spawn hook; it neither terminates nor awaits still-owned
children. The happy-path `assert(child.closed)` is an oracle, not failure cleanup:
if it fails, or Runner throws/returns a cleanup-unresolved error, the registered
fixture teardown still deletes the report package/runtime/evidence subtree.
Production deliberately retains a report snapshot on `ProcessInputCleanupError`,
so this test cleanup would defeat that ownership boundary on precisely the path
where the oracle detects an unresolved child.

Before integration, register one coherent ownership cleanup before any spawn.
Observe real owned child close promises, keep forwarding spawn arguments unchanged,
and on failure use a bounded cleanup of those exact owned process groups. Require
actual closure before deleting directories. If closure cannot be established,
retain the directory and fail visibly. The same guard must cover provider and
report children and setup failures; hook-restoration order must not preclude
cleanup. A real process fixture is required, not invented close notification.
No timeout or expected failure needs weakening.

## Eight consumer/oracle assessments

| Setting | Source assessment and positive control |
| --- | --- |
| maximumSourceBytes | 1 rejects the actual retained source via FileReportArtifactReader's REPORT_ADAPTER_SOURCE_LIMIT; 4096 reads exact authored JUnit bytes and yields expected report. Source rejection intentionally precedes adapter execution. |
| maximumCases | Adapter emits two schema-valid cases and consistent counts; 1 reaches bindReportResult's CASE_LIMIT, 2 requires exact original case array/counts. |
| maximumFindings | Two distinct valid info findings reach FINDING_LIMIT at 1; 2 requires full exact findings and cases. |
| maximumCaseFindings | Two distinct findings within one case reach CASE_FINDING_LIMIT at 1; 2 compares the entire cases array, including findings. |
| maximumTimeoutMs | Genuine adapter waits1500ms; selected1000/4000 flows through the default finalizer and runtime deadline. STARTED plus exact TIMEOUT distinguishes startup failure; high profile requires exit0/full result. |
| memoryBytes | Actual retained arrays exceed low Node old-space but fit high profile. STARTED+OOM stderr+protocol rejection prevents generic startup failure. This proves selected memory's Node heap consequence, not independent kernel RSS enforcement. Actual feasibility/output-size interaction remains unexecuted. |
| minimumCpuTimeMs | Wall1900 derives1000ms floor; selected1000 versus3000 yields actual CPU allowances1s/3s. Workload requires1.2s of measured process CPU. Low exact protocol failure plus actual SIGKILL and marker excludes substituting wall timeout. High must finish normally; scheduling contention can make it fail and must remain a failed run. |
| maximumOpenFiles | Opens64 real readonly descriptors to the allowed adapter module; finally closes acquired descriptors. Selected32/128 must distinguish actual EMFILE from full report. STARTED prevents a low-FD loader failure being counted as success. |

The finalizer selects source=min(artifact bytes, configured cap), timeout=min(report
cap, provider cleanup), CPU=max(selected floor, wall rounded to whole seconds).
All proposed profiles fit the current report memory feasibility inequality and
hard bounds. Physical cases explicitly set cleanup6000 so it does not replace the
intended report deadline. The resolved provider node's existing1000ms deadline is
unchanged; report normalization runs in its separate completion phase.

## Isolation and preserved authority

The only fixture file overwritten is the copied adapter. Before writing, the test
checks regular/nonlink/single-link type, contained private realpath and different
original device/inode. Registry discovery occurs after mutation, binding the new
package digest; both profiles share that resolved package. No report-runtime,
provider loader or Worker runtime substitution exists. Report-source bytes and
identity are retained; no code/config fallback supplies an absent policy.

The forward-only spawn observer identifies actual report-child argv and records
stderr/close without changing limits. It currently supplies good happy-path
physical oracles but is insufficient teardown ownership, as above. The copied
package uses non-dereferencing cp; any unexpected adapter alias fails its guard
before write rather than modifying the original.

After the cleanup correction, a fresh source hash check and serialized real run
are appropriate. All eight former-value/disconnected-forwarding mutants and
original regression scope remain required; this source review accepts neither
runtime behavior nor complete CONFIG closure.

## V3 source-only follow-up

V2 addressed the original teardown hole with an early registered owned-child
close/kill/timeout guard and retention on uncertainty. It initially rejected every
spawn lacking a private cwd/detached group, which also rejects legitimate store
`flock` calls. That second source blocker was reported before execution.

V3 confines ownership checks to the exact absolute provider-child and report-child
entrypoint arguments. Other genuine spawns forward unchanged to the captured
original spawn function, preserving the existing tool-path wrapper. Both provider
and report processes now have actual close promises; uncertain cleanup retains the
fixture and fails. Hooks restore only after cleanup. Private file guards and all
eight positive/negative oracles remain.

**V3 integration decision: accept for a serialized first real run**, with no
runtime or complete CONFIG acceptance. V1/V2 findings and manifests remain.
The close/cleanup argument applies to these non-spawning provider/report fixture
bodies under the genuine supervisor; it is not a general proof for escaped or
untracked descendants. Current candidate hash and V3 manifest are recorded in
[the V3 manifest](../../evidence/buster-report-policy-consumers-20260921/manifest-v3.json).
