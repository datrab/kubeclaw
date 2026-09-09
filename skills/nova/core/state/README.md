# State ownership

Core journals are append-only, fsync-backed, hash chained, and protected
against concurrent cross-process appends. Registration state uses the exact
`plugin.<plugin-id>.<registration-id>` namespace, stable idempotency identity,
monotonic sequence numbers, and deterministic projection reducers.

Append takes an independent, deeply frozen JSON snapshot; records returned from
append, refresh, replay, and plugin-state projection cannot mutate the journal.
Plugin-state construction also snapshots registration provenance. Optional
object fields with value `undefined` are omitted consistently with JSON storage.
Dense arrays, plain/null-prototype objects and finite JSON primitives are
supported. Cycles, sparse arrays, nonfinite numbers, functions, accessors,
serialization hooks, proxies and non-JSON object types are rejected. Existing
JSONL records and their hash encoding retain their format. Snapshot traversal is
iterative; JSON serialization and full replay still impose memory/size limits.

FileMutex requires Linux and `/usr/bin/flock` from util-linux, with a filesystem
providing kernel flock semantics. It locks an inherited open file description;
the caller retains ownership after the short flock subprocess exits. Closing
the descriptor or process death releases the lock. The lock file remains as a
stable inode: **never unlink or replace it while any writer or contender exists**.
PID reuse and competing stale-metadata reclamation no longer determine ownership.
The directory must remain protected from unrelated writers. Shared/network
filesystems require an explicit flock-semantics operational check.

Upgrade requires stopping all writers using the old PID/hardlink implementation
before starting new writers. Existing regular metadata files may remain; their
contents no longer determine ownership. Mixed old/new writers are unsupported.
An unexpected directory or inaccessible lock file fails acquisition; it is never
silently removed. File creation and journal fsync do not by themselves prove
host power-loss durability, including directory-entry persistence.

Lock callbacks and journal transactions are synchronous and non-reentrant.
Waiting blocks the event loop, has the configured timeout, and has no
AbortSignal cancellation. A callback exception releases the lock; already
appended records remain committed. Transaction append callbacks expire on return
or throw and cannot later append outside the lock. An async callback is outside
the supported contract. If a process dies during lock acquisition, its bounded
flock subprocess can retain the inherited descriptor until acquisition completes
or its timeout elapses; no operation callback executes in that subprocess.

Signal resume is single-use and validates wait identity, signal type,
authorized issuer, expiry, and freshness relative to the canonical
`wait.created` event. Resume creates a new stage attempt.
