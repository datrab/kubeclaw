# Repository-review supervisor status failures

PCR-SCAFFOLD-OPS-001: status child failures are no longer represented as an absent
value that passes the terminal-state check. The supervisor rejects a nonzero
status child, launch failure, timeout, invalid JSON, wrong run identity or unknown
status. Its diagnostic retains the child's exit, signal and original stderr.
Status reads have a 30-second deadline. All three callers use the same boundary.

Confirmed terminal states are emitted as the original status JSON: success exits
zero, failed/blocked/cancelled exit one. A failed read releases the supervisor's
lease without claiming pipeline success or terminating an adopted external process.
This changes the supervisor's observation, not the underlying pipeline result.

Five new tests spawn the original supervisor and status CLI with actual files:
missing/malformed platform, corrupt artifact index despite a successful journal,
later readable success, and the three non-success terminal states. All five pass.
The five existing operations tests also pass; their existing fake npm/formatter
fixtures are not evidence of a real pipeline execution. Independent source review
found no further blocker. New tests lint clean; supervisor canonical lint retains
six existing errors, compared with seven in the original source. No rule changed.

The actual adoption proof remains blocked. A spawned native process is alive by
`kill(pid, 0)`, but its `/proc/<pid>/cmdline` is absent from both parent and sibling
processes in this environment. The supervisor therefore cannot adopt it here.
The explicit native gate remains available and fails its prerequisite visibly:

```sh
node --test scripts/tests/integration/repository-review-supervisor-adoption.mjs
```

That test uses a real process only for the ownership/liveness boundary, with no
substituted status reader or pipeline implementation. Its precondition is not
skipped, and no procfs substitute is supplied. The ordinary CLI regressions are:

```sh
node --test scripts/tests/repository-review-supervisor-status.test.mjs
```

Until the adoption gate and a complete genuine pipeline start/recovery are run
on a suitable host, this finding remains partially verified. No CI, deployment,
external messages or successful full pipeline execution is claimed.
