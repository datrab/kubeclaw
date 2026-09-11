# Independent supervisor launch-error review

Reviewed frozen source `1daf211` against previously reviewed `21af42f`, isolated
`review-supervisor-launch` checkout. Production code was not edited by reviewer.

Bounded approval: the child error listener is installed synchronously after
spawn, before any awaited heartbeat work. Actual spawn failure without a PID
settles the wait, closes the descriptor/timer/listener through the existing path,
records a launchError diagnostic and throws the contextual failure. Main's
existing return-await/finally then releases its own lease.

A post-launch error with a real PID does not resolve the exit promise: it still
waits for an actual child exit before recording processError and reporting
failure. This avoids falsely equating a failed signal operation with process
termination. No new process-ownership assumption or PID adoption policy is added.
Existing stop admission, state preservation and lease checks remain unchanged.

Independent actual package command `npm run test:review-operations` passes
**18 tests, 0 failures, 0 skips**. This confirms the new package wiring reaches
all state/status/operations and real CLI start/stop regressions. The added case
uses an actual empty PATH directory, not a replacement npm binary. The original
absolute Node/status reader continues to run; OS npm lookup genuinely fails
ENOENT. The test observes failure1, launchError diagnostic with no child PID exit,
and removal of only its own newly acquired lease.

Canonical configured ESLint of the changed supervisor/state test passes.
Outputs and hashes: `docs/review/evidence/resume-84-supervisor-launch-independent/`.
No native adopted-process gate was rerun; this does not close broader ownership,
full recovery or process-reaping acceptance. No deployment/CI or finding promotion.
