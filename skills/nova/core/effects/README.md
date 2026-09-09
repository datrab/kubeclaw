# Effect ownership

Core derives a stable SHA-256 effect identity from the idempotency key,
attempt, capability, operation, and canonical resource. Requested, accepted,
completed, and failed records are fsync-backed and hash chained.

File journals validate their complete chain once at startup. While the process
is running, append and refresh operations validate only bytes added after the
last verified offset under the cross-process append mutex. File replacement,
truncation, or a divergent committed prefix fails closed. A final record is
committed by its newline; startup truncates an unterminated crash-torn tail to
the last commit marker before validating the hash chain. Large effect results are stored
once in a content-addressed sidecar. The effect journal keeps the verified
reference, and lifecycle events keep bounded digest metadata instead of a
second copy of the result.

Effect request, acceptance, and receipt decisions synchronize newly appended
records and commit under the same cross-process journal transaction. Two live
journal instances therefore cannot accept the same idempotency key twice.
Requests and receipts are owned immutable JSON snapshots, both when first
written and when replayed, including results hydrated from verified sidecars.
Mutating a caller's object cannot change a later receipt or request lookup.

Recovery never blindly repeats an accepted effect. The selected adapter must
return its durable receipt for the original effect identity; otherwise
recovery fails closed for explicit operator reconciliation. This is intentional:
generic core cannot infer whether an arbitrary subprocess or remote HTTP
endpoint committed an effect. Adapters backed by systems with idempotency or
receipt lookup should implement `receipt()` to recover automatically.

Every mutable invocation holds a file-backed canonical resource lock shared by
all runs in the storage root. Monotonic fencing tokens are passed to the adapter
invocation, adapters must assert the active fence before mutation, and a live
local adapter execution boundary remains exclusive while an asynchronous
operation unwinds. Stale owners cannot release a replacement lock.
The platform can set `effectLockTtlMs`; the default is five minutes and is
independent of the shutdown timeout. Core renews the lease after durable
pre-dispatch bookkeeping and then periodically while the adapter is active.

The invocation owns the resource lock from successful acquisition through the
locked journal recheck, receipt replay and awaited execution. A single finalizer
releases it on every exit, including conflicting requests and invalid journals.
If both the primary operation and lock release fail, the thrown AggregateError
retains both errors and identifies the primary error as its cause. A failed
cleanup must be reconciled explicitly; expiry alone never authorizes stealing
a lock from a still-running owner.
