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
