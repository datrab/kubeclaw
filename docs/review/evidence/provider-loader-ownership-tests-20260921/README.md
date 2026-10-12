# Private maintained Loader ownership tests

Not integrated, syntax-checked, type-checked or executed. No live production or test file changed. Proposed maintained command after review/integration: `node --test --test-concurrency=1 tests/verification/contracts/provider-loader-ownership.test.mjs`, in the same genuine sandbox/tool environment as the existing Runner tests. This module uses real ProviderProcessSession, actual launcher arguments/environment, actual provider-child, actual capability operation, and real child close events. Serial isolation is required for narrow builtin fault injection.

Five top-level cases (last has two subcases):
1. Exact-child SIGTERM EPERM injection, real closure and capability settlement 80ms after closure; termination must wait then report signal error.
2. Same injected signal error plus capability intentionally never settling: real close, existing 1000ms drain timeout, no infinite hang. The pending promise has no active IO/timers or side effects.
3. Only session close notification withheld after actual ChildProcess close; unchanged process termination timeout must fire without invoking drain. Cleanup replays the actual close arguments to release session listeners/timers. This is a local notification-loss test, not a claim of inducing kernel no-close behavior.
4. Actual child's initial /proc status read receives injected EACCES; later initialize must reject the retained observation failure, including after termination.
5. Already-aborted context rejects with exact caller error, plus distinct successful initialize/execute/cleanup positive control. Earlier suggested cleanup-after-execute-throw was not realizable with the actual child, which deliberately exits after that error; this draft does not fabricate that behavior.

Spawn interception forwards unchanged and only captures the actual child. Signals except exact-child injected SIGTERM forward unchanged. /proc reads except the exact child's injected status read forward unchanged. Cleanup restores injected builtins, kills only its own child if still live, awaits actual close, then deletes only its mkdtemp directory. Faults are injected locally, not actual OS permission failures.

Policy uses the maintained runnerExecutionPolicy.observation fixture and the current constructor API. The independently evolving session-policy API must be explicitly migrated before integration; these baseline snapshots are not a promise of compatibility with future edits. The 1000ms termination/drain constants are not changed. No native security acceptance is claimed by these tests. Root source review and later independent execution remain required.

## Cleanup correction v2

The after hook is now registered immediately after mkdtemp, before any setup writes or mocks. Partial setup restores only installed mocks. Cleanup invokes the original kill for the exact detached negative child PID group (Windows uses child.kill), accepts only ESRCH, and bounds actual-close waiting to 2000ms. This is a fixture cleanup bound, not a production termination/drain change. Timeout or unexpected signal errors are reported; the fixture is not deleted without confirmed actual close. Original v1 source/manifest remain archived, with cleanup-v2.patch recording the correction. No runtime or syntax execution.
