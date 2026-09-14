# Supervisor ownership and post-launch I/O

The original CLI treated unreadable procfs command data and a readable foreign
command alike as an absent pipeline. With a real live heartbeat PID, the new
regression demonstrates that the previous source attempted another npm launch
when the journal was nonterminal, and reported success when it was terminal.
The launch-negative uses an empty PATH, not a substituted executable. A live
unconfirmed process now produces PROCESS_OWNERSHIP_UNCONFIRMED before adoption,
launch, heartbeat replacement or terminal reporting. It is never signalled.
A process confirmed absent still permits normal recovery/status evaluation.

Two further regressions use the original CLI and a real loopback health server.
After launch and the initial status read, the server creates a directory at the
resource-log or heartbeat-file location. Both original writes fail with EISDIR.
Before this change the supervisor exited without an attempt-exit diagnostic.
The supervisor now records the first error, requests its existing TERM stop,
waits for actual direct-child exit, and writes the exit diagnostic before failing.
An additional real diagnostic-path conflict preserves both filesystem errors.
There is no substituted npm/pipeline implementation, filesystem API or procfs.

Periodic heartbeats are serialized, and outstanding writes settle before the
final stopped heartbeat. A late sample cannot overwrite that final record.
The existing resource sampling code was moved unchanged into its own module to
retain the canonical lint limits. An already exited/signalled child is not sent
another stop signal. Launch and heartbeat failures remain separately recorded;
if both occur the thrown aggregate retains both causes.

## Validation

- Both new ownership negatives fail on the previous source; absent-PID control passes.
- Both new post-launch I/O cases fail on the previous source for missing diagnostics.
- All 26 original operations tests plus added regressions pass without skips,
  including the original finite Core preflight pipeline and signal/recovery tests.
- Canonical lint and full Knip pass without changed limits or suppressions.
- The unchanged original operator-retention suites separately pass 11/11 with
  real Core, HTTP receipts, file locks, SIGKILL and actual byte/record quotas.
  This confirms their existing bounded scope, not additional retention coverage.

Raw outputs are in `docs/review/evidence/pr6-supervisor-ownership-io/`.

## Limits

The heartbeat PID/command check still does not establish durable identity of an
entire process tree, distinguish PID reuse with a matching command, or prove
containment quiescence. TERM-ignoring descendants and native adoption remain
unresolved. On constrained hosts an unreadable live owner now deliberately
blocks automatic recovery; do not delete its heartbeat to force another start.
No whole-process cleanup or native adoption success is claimed. Neither the
39-ID scope nor any finding status is promoted by this checkpoint.
