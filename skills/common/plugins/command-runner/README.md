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
