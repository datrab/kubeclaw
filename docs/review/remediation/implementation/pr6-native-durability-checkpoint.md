# Native attempt durability checkpoint — 2026-09-13

This is partial implementation for PCR-BUSTER-ENGINE-001/004,
PCR-PRISM-WORKER-002 and PCR-OBS-002. None of those findings closes here.
The register remains 135/154 locally verified, 19 unfinished.

## Implemented boundary

Worker ownership store v2 persists final, quiescent kernel observations before
removing the cgroup. Their first durable value is immutable; recovery after
removal preserves it. V1 ownership remains readable without rewriting history
or fabricating missing measurements. A trusted root-owned node identity now
binds the store to one machine. Different boot IDs only establish a reboot
within that same bound machine; moving a PVC to a different machine fails
closed. Unbound legacy history from another boot also requires reconciliation.

The native executor now reserves an immutable full-envelope identity before
launch, spools original stdout/stderr under a private directory, archives the
process outcome and its original completion time, and fsyncs the sealed result
before returning it. Real kernel lock stripes serialize duplicate attempts
across processes. Contention beyond the Foundation lock wait is retryable busy,
not permission to launch again or a reason to kill the original owner.

A completed result replays with the same receipt. A crash after process archival
can reconstruct a receipt using the original completion time and matching final
ownership counters. A crash without a durable process outcome cannot silently
rerun the identity. The recovered failure keeps known kernel counters; missing
measurements remain unavailable. Native quiescence alone does not establish
that specialist external cleanup succeeded. Unknown cleanup fences admission.
Startup reconciliation scans accepted envelopes one at a time before readiness.

The input blob is fsynced under the checked global admission reservation before
the acceptance record: a crash can leave retained original bytes but cannot
leave an accepted record with no recoverable input. Actual retained files and
pending input/output/result reservations count toward the journal disk budget.
No expiry, log rotation, automatic retirement or destructive recovery is added.
The default Prism journal budget is a generous 64 GiB, configurable independently
from its 64 MiB metadata, 16 MiB input, 32 MiB output and 64 MiB sealed-result caps.

The Prism native execution factory now uses this journal and startup recovery.
Its HTTP lifecycle also bounds concurrent incomplete requests and connections
before body buffering. Dedicated probe capacity keeps local health responsive
under request pressure. Defaults are 16 active requests, 4 probe reservations,
128 connections and a 120-second incoming-body deadline. They are named settings
captured with worker configuration. The separate central-settings inventory
remains the agreed roadmap item, not a second new configuration authority.

## Local evidence and limits

The exact commands and raw results are in
`docs/review/evidence/pr6-worker-final-observation/`. Tests use genuine files,
flock, real child pipes, SIGKILL and HTTP sockets. The kernel observation test
reads this environment's actual cgroup counters. Storage-format fixtures contain
explicit metadata test values; they do not emulate writable cgroups or establish
positive native execution. No original full-log bytes are censored. Spool crash
claims cover bytes already flushed and fsynced, not unread bytes still in pipes.

This runtime's cgroup2 mount is read-only. No positive delegated cgroup execution,
root launcher admission, host aggregate enforcement or cluster live test has
been substituted or claimed. The prepared native live gate additionally requires
`KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE` pointing to the actual trusted node file.

Owner metadata, attempt journal and corresponding native delegation are one
recovery authority. Partial rollback or storage loss is not proof that an
unrecorded old process never ran; coordinated storage restore and fencing remain
part of IFR-26-001. Unknown external cleanup needs reconciliation before service
readiness. The journal retains receipt metadata indefinitely; its manual,
reference-aware cross-store retirement remains within PCR-OBS-002.

Still unfinished: production V3 startup/producer/chart activation, native launcher
image installation and node delegation with independent role aggregate limits;
Buster whole-attempt integration, retained-fixture lifetime and restart cleanup;
connected manual retention. The legacy production startup is not relabelled as
native execution by this checkpoint.
