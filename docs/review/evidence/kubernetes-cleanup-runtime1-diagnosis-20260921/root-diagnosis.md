# Cleanup Runtime1 diagnosis

The maintained command actually ran 42 cases: 37 passed and 5 failed. This remains failed evidence. The broader original sequence is still owned by Nash; no overall terminal result is asserted here.

The successful fixture path retains its existing session until final cleanup. The test's unconditional distinct-PID assertion therefore describes a recovery scenario that its successful setup did not cause. Normal successful cleanup and an explicitly caused, actually closed original-session recovery must be tested separately.

The injected post-passed TERM fault is currently reached during final retained cleanup, not the claimed earlier worker-fault transition. Its stack also reveals a real production-state problem: ProviderProcessSession waits for actual close and capability drain before reporting the signal error, but IsolatedLoadedProvider marks terminated only on resolution. Its next terminate call reuses the rejected session promise. cleanupRetainedProvider records the first error, then rethrows on its second terminate call. A correction must distinguish confirmed close AND drained capability work from a termination timeout or drain failure. It must retain the original stop failure and prove that unconfirmed shutdown never authorizes a replacement session.

The preparation-marker assertion currently reads the final attempt summary. Independent source diagnosis locates cleanup-error priority in the Core result. The corrected proof must observe the actual execute error IPC carrying the preparation/rollback marker and separately assert final cleanup failure and retry suppression. This report does not claim the first IPC frame has already been proven by a corrected runtime test.

No production edits, weakened deadlines, semantic controls, or passing reruns are claimed. Private correction and independent source review precede the next verification.
