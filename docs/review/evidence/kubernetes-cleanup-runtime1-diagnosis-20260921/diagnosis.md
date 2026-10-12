# Cleanup runtime1: source-grounded diagnosis

No runtime or live edits by this reviewer. Evidence: independent-buster-runner-execution-child-20260921/cleanup-v2-runtime1/cleanup-runtime-1.txt:37/42 pass, five Runner cases fail. Earlier source acceptance did not establish these scenarios; this report corrects those insufficient assumptions.

## Two missing summary markers

Actual final summaries contain TEST_PROVIDER_FAILED:KUBERNETES_FIXTURE_KUBECTL_FAILED:external delete fault. Worker attempt-executor execution catch records the initial fault, but later cleanup catch deliberately replaces fault with WORKER_CLEANUP_FAILED (or termination failure), retaining cleanup.summary. Runner attemptSummary projects that Worker summary. Therefore requiring the original prepare+rollback marker in final summary is the wrong boundary. Production preparation still aggregates both errors, capability IPC sends its message and child emits an error frame; source predicts that earlier execution frame has the marker. Runtime1 does NOT print those frames, so this remains a required observation, not asserted historical evidence.

Small fixture correction: require the exact PREPARE_CLEANUP_FAILED marker on the real executed child's recorded error IPC, before the separate recovery cleanup error. Keep failed final cleanup, two delete attempts, one plan attempt despite unsafe retry, both closes and distinct recovery PID. Assert the final cleanup diagnostic separately. Do not change Core failure priority or claim it aggregates original and cleanup faults.

## Two same-PID positive failures

Default successful Worker execution does not call terminate just for success. A passed fixture sets retainFixture and skips ordinary cleanup; final retained cleanup uses its still-live original session. The same PID is the correct normal path. Preserve this genuine positive path with explicit same-session, passed result, completed-fixture and retain/delete effects.

Preserve the distinct-PID requirement in a separate explicit recovery scenario: after real execution succeeds, explicitly await the real LoadedProvider terminate and actual close, then call its real cleanup with the host disposition. This is an intentional session-recovery fixture, not evidence normal successful execution always recreates a process. Do not replace provider execution or suppress termination failure.

## Fifth case targets the wrong phase

The first owned-group TERM after successful execution currently occurs inside final retained cleanup, not a Worker post-execution failure phase. The stack confirms cleanupRetainedFixtures -> Loaded.cleanup finally -> terminate. Thus the injected EPERM cannot establish faulted retained-attempt cleanup or later retry. A real distinct post-passed fault seam is needed and must prove it occurs before host final retained-fixture selection. A narrowly injected invalid measurement/observation after real passed IPC, through the actual Loaded resources consumer, could exercise that branch; explicitly label injected host observation fault, preserve genuine DefaultRunner/Core/provider execution and require the exact Worker fault, incomplete cleanup, and later completed/passed retain. This is a proposed scenario, not yet source-frozen or executed. Do not mislabel final cleanup failure as this branch.

## Separate genuine production state defect

ProviderProcessSession.terminate waits actual close and capability drain, then may throw retained signalFailure. LoadedProvider.terminate sets its #terminated flag only on successful resolution. After a confirmed close/drain followed by signal failure, the flag remains false. Subsequent cleanup chooses the dead session; repeated termination returns the same rejected promise. cleanupRetainedProvider.catch then awaits that rejected promise, escaping before its false result. Runtime1 fifth stack demonstrates this repeated final-cleanup rejection. No evidence establishes a leaked live process in this path; the defect is conflating disposal confirmation with error-free stop.

Bounded proposal: expose a read-only session disposal-confirmed state set ONLY after actual close and successful capability drain (also the already-closed branch), before throwing the retained signal error. Loader may record this state in finally while preserving the original rejection; it must never infer safety from an error string or set terminated=true unconditionally. Recovery can then select a new session only after confirmed disposal. Timeout, withheld close and nonsettling/failed drain stay unconfirmed. Retained cleanup should preserve both cleanup and stop errors and return failure only under the intended confirmed-disposal contract; unresolved ownership must remain visibly failed and may still reject. Do not swallow errors merely to obtain a boolean.

Required separate regressions: confirmedclose+drained+TERMerror allows later real recovery but first termination still rejects with exact cause; withheldclose and nonsettling drain do not authorize recovery; final cleanup keeps stop error and no false success; original ownership/deadline tests unchanged. This production correction should be authored and independently reviewed separately from fixture assumption repairs. No code change is bundled in this diagnosis.
