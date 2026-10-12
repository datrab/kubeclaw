# Buster Engine Boundary

Buster executes resolved test plans and returns facts and evidence. It uses
the neutral worker core. It does not own pipeline scheduling or the final gate
decision.

## Registered-provider cancellation

The provider session sends the child an IPC abort and signals its process group
with SIGTERM. The child forwards either signal to the same context AbortController.
The SIGTERM listener remains installed because the group signal and the sandbox
supervisor's forwarding can both arrive; repeated abort is idempotent. A provider
can observe `context.signal` and settle its work, but notification alone proves
neither settlement nor cleanup.

The existing parent escalation remains 500 ms to SIGKILL and a 1000 ms termination
bound. No additional grace period is introduced. Noncooperative processes remain
subject to forced stop; unresolved work must not authorize evidence or cleanup
phases. Cancellation acceptance requires the actual cooperative marker after
provider start and actual process closure for noncooperative cases.
