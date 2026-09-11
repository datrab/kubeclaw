# Original Supervisor launch-error handling

An additional real CLI failure was reproduced while reviewing the Supervisor lifecycle. With an empty existing directory as PATH, the original absolute Node status reader succeeds but the operating system cannot find npm. The original ChildProcess error was unhandled, terminating the supervisor before its lease finally/attempt diagnostic path could run. No replacement npm, fake process or status provider was supplied.

The new regression invokes that actual failure and requires a contextual `REVIEW_SUPERVISOR_LAUNCH_FAILED` with ENOENT, no claimed terminal success, a launch-error diagnostic, and release of the supervisor's own lease. Root observed the old test fail. The correction observes ChildProcess error without treating a post-launch signal error as an exit: only an absent child PID permits resolving the failed-launch outcome. A launched process still requires its original exit event. The error is preserved in the diagnostic and rethrown after interval/listener/descriptor cleanup, reaching the existing main finally.

The first corrected root package run passed18/18; after explicitly distinguishing post-launch errors, the exact final five state/launch tests and canonical lint pass. Independent final source review d0f699e passed the actual package gate18/18 with zero skips and canonical lint0 on exact source1daf211. This does not establish complete subtree reaping, repair every possible heartbeat-write failure, or replace native adopted-process acceptance. PCR-SCAFFOLD-OPS-001 remains partial.

Before, intermediate18-test output and final state/lint outputs are retained under `docs/review/evidence/resume-84-supervisor-state-root/` with their respective filenames.
