# Private actual Report policy consumer tests

Eight tests drafted, no syntax/type/runtime execution and no live integration. This author extends an independent coverage finding; it does not close the existing report-field acceptance matrix. Proposed maintained command after review: node --test --test-concurrency=1 tests/verification/contracts/buster-report-policy-consumers.test.mjs in the existing genuine sandbox/tool environment.

Each field has low and high settings through the default TestPlanRunner, specialist report finalization and genuine RegisteredReportAdapterRuntime. No loader or report runtime replacement. The existing real provider writes its retained JUnit artifact. Each test copies the existing package into an owned mkdtemp subtree; before overwriting only its adapter, it checks regular/nonlink/singlelink/private realpath and unequal original dev+inode. Registry discovery and resolution happen AFTER mutation, creating a fresh package digest. Both profiles use the same resolved package. Default worker runtime and all unrelated execution settings remain explicit.

Data controls:
- source bytes 1/4096 against actual existing source; exact SOURCE_LIMIT versus completed report. Low input rejection happens before adapter execution by design.
- cases 1/2, report findings 1/2, case findings 1/2: adapter emits exactly two contract-valid items, exact corresponding limit failure vs full expected output.

Physical process controls (drafts, environment-sensitive until actually run):
- wall timeout1000/4000ms, adapter actually waits1500ms.
- memory128/512MiB, adapter retains20 arrays of1048576 entries; low must show actual V8 allocation/OOM stderr and protocol failure, high must return. This is an actual Node heap-allocation effect of the memory field, NOT independent kernel RSS enforcement proof.
- CPU minimum1000/3000ms, report wall1900ms makes its floored-derived CPU allowance1000ms; adapter consumes1200ms actual process CPU. Low requires genuine SIGKILL plus protocol failure; high succeeds before wall deadline. A wall timeout cannot stand in for the CPU oracle.
- open files32/128, adapter really opens64 readonly handles to its own module, closing all obtained descriptors in finally. Low must report EMFILE, high succeeds.

A forward-only child_process.spawn observer forwards all arguments/environment unchanged and captures actual report-child stderr and close. Every physical low/high case requires the adapter's actual stderr STARTED marker, one process, actual close and retained provider evidence. This prevents startup failures from passing. CPU wall scheduling and low-descriptor startup remain honest draft risks: if original prerequisites cannot reach the marker, investigate rather than weaken the oracle. No hard sandbox bound was changed, no privileged host operations are requested.

Run serially after source review and explicit slot coordination. Integration must rebase on any new Session policy and updated execution fixture; baseline copies are historical. Review should check schema-valid output, default fixture semantic compatibility, exact process close propagation and bounded cleanup before execution. Mutant acceptance is still required: restore each prior fixed value or disconnect the specific field and require the corresponding profile assertion to fail. None has been executed here.

## V2 owned-process cleanup correction

The original manifest/test are preserved as manifest-v1.json and test-v1.mjs.snapshot. cleanup-v2.patch records the isolated fix. A single observer/ownership hook is installed by setup before any discovery or Runner invocation and tracks EVERY actually spawned child, including provider and report children. Spawn arguments and environment forward unchanged after validating the selected cwd belongs to the current fixture and Unix detached ownership exists. Unknown ownership or a late spawn during cleanup is rejected before creating a child and retained as a visible cleanup failure.

Teardown signals only captured unclosed groups with the original process.kill(-pid,SIGKILL), accepting only ESRCH (Windows uses child.kill). It waits for all actual close events with a single bounded2000ms cleanup deadline, preserving every fixture directory on unknown closure or signal/ownership error. The shared original fixture root is also retained if any owned fixture cleanup failed. Hooks restore in finally. No synthetic close is emitted. Normal data/physical assertions and production budgets are unchanged; no syntax/runtime checks were run.

## V3 spawn classification correction

V2's global ownership guard would reject legitimate original flock-store calls, which do not have a provider-style cwd/detached contract. V3 classifies only exact absolute provider-child.mjs and report-adapter-child.mjs argv entrypoints. Other spawns are forwarded untouched to the captured existing spawn function (including any already-installed genuine tool-mapping hook); their existing production owners retain responsibility. Both selected child types retain V2's pre-spawn private-cwd/detached guard, actual-close tracking, bounded group cleanup and retained-directory failure behavior. No field oracle changed. V2 snapshot and manifest retained. No runtime executed.
