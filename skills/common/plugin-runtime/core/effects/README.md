# Effect ownership

Core derives a stable SHA-256 effect identity from the idempotency key,
attempt, capability, operation, and canonical resource. Requested, accepted,
completed, and failed records are fsync-backed and hash chained.

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
