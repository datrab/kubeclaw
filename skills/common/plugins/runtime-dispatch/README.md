# Runtime dispatch adapter

Provides bounded, target-scoped dispatch to configured runtime endpoints.
Requests and responses are closed to JSON values and bounded by depth, shape,
and bytes. Authentication uses an idempotency-bound HMAC so raw runtime secrets
never enter auditable nested effect requests or journals. Network and secret
access remain independently granted.

OpenClaw targets may provide a dedicated `controllerSessionKey`. The adapter
submits spawn and task-control calls through that session, accepts current spawn
responses where `taskId` is resolved later from `runId`, and preserves typed
admission refusals instead of treating a missing child identity as a malformed
successful spawn. Set `collectorMode: true` when OpenClaw Swarm is enabled to
use its supported non-announcing `collect`/`agents_wait` path. The durable
atomic result file remains the result-import boundary. If a completed local
session returns one terminal assistant JSON value but omits the instructed
file write, the adapter validates that terminal value and atomically
materializes the missing file before normal import. Spawn RPCs are
serialized per controller and separated by `spawnIntervalMs` (1,500 ms by
default) so concurrent review jobs can reach their configured active
concurrency without stampeding OpenClaw's process-inspection path.

This package owns the transport protocol only. Legacy spawn, monitoring,
transcript, handoff, cancellation policy, and recovery behavior remain
explicitly blocked until their canonical capabilities are implemented.

Local collector result persistence independently enforces the repository boundary,
even if a caller reports a missing result. Linux directory descriptors are opened
with `O_DIRECTORY|O_NOFOLLOW` for every root and parent component; creation and
atomic hardlink publication use those descriptors through `/proc/self/fd`.
Symlink roots, parents and final existing targets are rejected. Identical existing
regular files remain idempotent; conflicting content is not overwritten. File
and containing-directory fsync are retained. Authorized roots/ancestor locations
must remain protected; this is not a sandbox against relocating the authorized
root itself. No retention or automatic cleanup policy for final results is added.
