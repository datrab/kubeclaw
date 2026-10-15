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

Attempt-owned workspace dispatch requires explicit `workspaceRoot` configuration.
The adapter checks the Git-issued reference against the trusted request attempt,
canonical configured roots and the protected Git owner record before setting the
spawn cwd. Its result file is read inside that worktree and persisted at the
established repository result location before workspace cleanup. The gateway must
share these filesystem paths; configuration does not itself provision mounts or
sandbox the agent. Static requests without a workspace reference retain their
configured cwd.


The `openclaw` registration requires top-level `resultReadMaximumBytes` and
`collectorWaitTimeoutSeconds` plus the required timing-profile map below. Nova supplies its selected Core `openClawDispatch`
policy and retains the effective config; raw Platform/per-target duplicates
reject. Direct callers author all required processing data explicitly. The result cap applies only to
the existing local workspace file read. Collector seconds are a per-call
`agents_wait` request (zero allowed), still clamped by the host maximum; not the
session deadline. Missing/invalid direct values fail before read/request. No
change to result source/identity, workspace authorization or session cleanup.
The separate HTTP registration uses the required byte profiles described below; other target defaults remain unchanged.


OpenClaw targets require an explicit `timingProfile` selecting one complete
`targetTimingProfiles` entry (spawnIntervalMs, pollMs, maxPollMs, maxPolls,
sessionTimeoutMs). Nova authors that map only in selected Core policy; direct
callers explicitly supply it. Former target timing keys reject, even equal/null.
All profiles are checked for original bounds/relations. The codec freezes the
resolved target; existing timer consumers are unchanged. Recovery restores the
recorded processing selector and values, without substituting current B; other
target/endpoint/configuration mismatch checks remain unchanged. See operator
guide for standard and preserved production-pipeline values. No native/model or
whole-package acceptance is implied by local protocol-vector timer tests.

### Explicit HTTP target byte profiles

The HTTP `:runtime` registration requires a complete `targetByteProfiles` map
and an explicit `byteProfile` on each target. Nova supplies this map from selected
Core `httpDispatch.targetByteProfiles`; raw adapter maps are competing authors
and reject even when equal/null. Both leaves `maxRequestBytes` and
`maxResponseBytes` are required safe integers from1 through8388608; canonical
`standard` explicitly preserves1048576 bytes each. Missing maps, incomplete or
unknown profiles and the former target-level byte fields reject, without a
default selection/merge/coercion. Different targets may select different profiles.

Activation captures frozen caps. The existing JSON UTF-8 request check runs
before secret/network access; the response check runs after status/body validation.
These are serialized JSON body budgets, not streaming/wire/network-adapter caps.
Authentication, endpoint and token-secret behavior remain separate and unchanged.
Retained runs restore only original byteProfile and selected values from one
recorded snapshot; current endpoint/authentication/token/grants and target-set
changes still face the unchanged pinned configuration comparison. Older runs
missing required policy/selector need their original runtime, not current defaults.
