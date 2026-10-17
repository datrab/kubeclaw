# Command runner adapter

Provides bounded `command.execute` effects without ambient shell authority.

The core-issued request identifies the executable through
`resource.type = command.executable` and its canonical path through
`resource.canonicalId`. The payload contains an `args` string array and an
allowlisted `workingDirectory`.

The adapter:

- resolves executable and working-directory symlinks before authorization;
- requires exact executable and canonical directory allowlists;
- starts the executable directly with `shell: false` and an empty environment;
- bounds combined stdout/stderr bytes and execution time;
- terminates cancelled, timed-out, oversized, and shutdown work with
  `SIGTERM`, followed by `SIGKILL` after the configured grace period;
- returns the real exit code, termination signal, stdout, and stderr.

Non-zero command exits are results, not adapter failures. Authorization,
configuration, cancellation, timeout, and resource-limit violations fail with
stable error codes.

Process-group lifetime is tracked independently of the direct child's exit.
Timeout, abort and shutdown still terminate descendants holding inherited
stdout/stderr pipes after the leader exits. TERM and KILL share one grace
budget; stream close does not restart it. Shutdown waits for command cleanup.
The public `CommandRunner` and `CommandRunError` exports remain available for
Buster. The first timeout/cancellation/resource failure keeps its disposition
and original error chain; shutdown retains the existing exit-result behavior.
Direct calls after shutdown or with an already-aborted signal start no process.

POSIX process groups cannot contain programs that create independent sessions.
Buster's configured sandbox/cgroup supplies that stronger boundary. Cgroup
removal remains best effort, and this package does not promise hard cgroup
accounting or complete orphan reaping on an undelegated host. An interrupted
command may already have made external changes; callers must reconcile them
before retrying, rather than treating cancellation as proof of no side effect.

Linux cleanup now acknowledges that the process group has no running members
before returning. It records the outer PGID with PID-namespace identity while
the leader/group exists, then polls actual `/proc` states after force termination.
Zombie/exited entries are nonrunning; PID-namespace-local numbers alone are never
used to select proc records. Acknowledgement has an additional one-second budget
and fails explicitly if proc identity/status cannot be established. Cleanup
failure rejects both the command and an in-progress shutdown drain.

## Monitoring selection

Nova's registered `kubeclaw.command-runner:command` receives
`maximumOutputRecords` and `sampleIntervalMs` from the selected Core policy's
`commandRunnerMonitoring` group. Do not author these fields in Platform adapter
configuration; they are projected during activation and retained with the run.
Direct `CommandRunner` callers may supply `monitoring`; omission preserves their
historical 4096-record / 25-ms contract without reading current configuration.
Sandbox resource-limit ownership is unchanged.

Selected `commandProcessCleanup` supplies required `cleanupPollIntervalMs` and
`exitAcknowledgementMs` and `sandboxMinimumGraceMs` to the registered adapter.
The sandbox SIGTERM floor is selected centrally (original 250ms); raw/native
callers retain the historical constructor contract. Both are captured with the
original Core runtime policy; do not author them in Platform adapter config.
Grace polling and post-kill Linux process-group acknowledgement consume these
values. Direct/raw callers retain their former 10ms/1000ms API boundary.
