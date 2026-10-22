# Separate Redis Restoration, Original-Event Replay, and Deduplication

Status: supported recovery boundaries and native dedup contract exercise; no observed deployed outage/replay claim
Audience: Nova, Redis and observer operators
Owner: telemetry, Redis and Nova runtime maintainers
Evidence: skills/common/plugins/redis-transport/src/adapter.ts; skills/common/plugins/redis-transport/src/stream-identity.ts; skills/nova/core/telemetry/observer-delivery.ts; skills/nova/core/telemetry/observer-recovery.ts; skills/nova/core/telemetry/observers.ts; tests/verification/reliability/redis-transport.test.mts; tests/verification/reliability/observer-recovery.test.mts
Applies to: Nova v2 observer delivery through kubeclaw.redis-transport; not OpenClaw direct ingress replay
Last verified: 2026-10-21; source review only for native Redis outage/replay; no native redis-server available in this author environment

## Select the correct authority

A Redis PING, a new startup health-stream entry and an unchanged stopped Nova
audit prove three different things. None proves that an original lifecycle
event reached its intended observer stream exactly once. Start with the
[bounded deployed Redis outage procedure](../diagnose.md#redis-unavailable) for
its registered consumer/target, approved fault window, exact replica restoration,
authenticated health checks, unchanged PVC identities and stopped-run audit
comparison. Do not repeat its cluster mutations from an unbound context.

This guide adds the distinct delivery/replay decision. The canonical event
journal is authoritative; Redis contains a projection. Never manufacture a new
lifecycle event, copy a health-stream entry into a product stream or change an
original event ID to make the stream look complete.

The direct OpenClaw agent-observability ingress has a bounded memory queue and
no repository consumer for its dead-letter stream. Events lost before durable
Redis acceptance have no replay source in that path. The Nova v2 observer
journal/checkpoint procedure below cannot recover those missing host events;
retain that loss and the host/Redis owners' follow-up instead.

## Before an owned outage exercise

Use one explicitly selected Nova run/event and the exact activated observer,
package snapshot, provider, target, Redis database/endpoint and stream prefix.
Record these separately from the role-health stream. Capture the original event
ID, sequence, run identity, observer delivery ID, last valid checkpoint,
started/completed/failed delivery attempts and corresponding effect request and
receipt. Use [Inspect a Run](../operate.md#inspect-a-run) with run/adapter writers
stopped and raw copies strictly parsed before audit. Preserve the Redis store
and retention/dedup settings under its owner too.

The actual transport stream is:

`<streamPrefix>:v2:<publisher|telemetry>:<encodeURIComponent(target)>`

The kind matters: the transport-publisher and telemetry registrations do not
share a stream. A period and underscore in target names remain distinct. The
dedup key appends `:dedup:` and SHA-256 of the canonical JSON idempotency-key
string. Use the returned receipt's exact `stream` and `entryId`, not a hand
sanitization of the target or the latest entry in a similarly named stream.

The operator must establish its authorized read path to that exact Redis
stream and, when applicable, consumer group. This package writes streams; it
does not create/own a consumer group or acknowledge an external consumer's work.
A deployment-specific consumer's `XACK` is not Core delivery completion. If no
consumer exists, record “no configured consumer”, not an invented consumer
baseline or a zero backlog claim.

## Legacy namespace cutover

Do not treat an upgrade from legacy underscore-sanitized stream names as a
normal v2 reconnect. The old mapping is not reversible: dots and underscores
could collapse into the same target name. Upgrade actual writers and consumers
together. Pause legacy writers, reconcile pending deliveries under their
original event/receipt identities and inspect retained legacy records before
switching consumers to the exact v2 names. If the external consumer inventory
or pending-delivery reconciliation is unavailable, retain that migration stop;
a healthy new stream does not establish completion.

The package does not rename, copy, republish, trim or delete old streams, migrate
external consumers, or change the configured `MAXLEN` and dedup TTL policy.
There is no supplied automatic migration command or consumer-group lookup.
The separate OpenClaw host-observer Redis transport is unaffected by this Nova
plugin cutover. Preserve old records under their owners rather than inventing
new canonical events or manually filling the new stream.

[The package's explicit upgrade boundary](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/common/plugins/redis-transport/README.md#L16-L24)
is Source guidance, not evidence that a deployed migration has run.

## Judge restoration and backlog separately

After the approved fault, restore the exact recorded Redis configuration,
replica/PVC identity and credentials using the owning procedure. A healthy role
only permits the delivery investigation to continue. Compare original Nova raw
event bytes and journal head before/during/after; retain any difference rather
than attributing it to Redis automatically.

Then classify the selected event from its original observer history:

- **Checkpoint already covers the event:** runtime skips it. No new observer
  callback or stream append should follow from a normal repeated drain.
- **Delivery completed but checkpoint was not retained:** runtime rebuilds its
  completed-delivery set, commits the derived checkpoint without invoking the
  callback again, and preserves the existing delivery records. Do not delete a
  production checkpoint to recreate the test or turn this internal rebuild
  into permission for arbitrary checkpoint repair.
- **Delivery still has retry allowance:** an owning runtime's drain applies the
  persisted attempt count and declared policy, not a new counter after restart.
  Normal observer effect keys remain stable across delivery retries. Inspect
  original effect receipts and the sink acknowledgement; an already-recorded
  failure or uncertain external outcome does not automatically become another
  successful network attempt because Redis is healthy.
- **Attempts exhausted:** `OBSERVER_DELIVERY_ATTEMPTS_EXHAUSTED` remains exhausted
  after reconstruction. Redis restoration does not reset the budget. The
  canonical event and failed delivery history remain. With `best_effort`, later
  events for that observer/run stop during that drain; other observers/runs can
  continue. With `required`, runtime throws
  `REQUIRED_OBSERVER_DELIVERY_FAILED` and aborts the drain instead.
- **Checkpoint provenance/sequence/event or delivery transition conflicts:**
  stop. Restore/investigate the original compatible bytes and package snapshot;
  do not choose a checkpoint by timestamp or delete failed attempts.

The repository exposes no generic operator CLI to rewind an observer checkpoint,
reset exhausted delivery attempts or clear an effect receipt and replay a
terminal run. Core `--recover` rejects terminal runs; starting a new run is not
replay. If normal owned delivery cannot continue under its original contract,
retain the exact event/delivery/receipt and safe stop. The Nova observer owner
and selected adapter/Redis owner must define an authorized original-identity
continuation; absence of that supported operation is not permission to edit
journals or send a raw Redis `XADD`.

## Verify deduplication without claiming exactly-once delivery

Redis's adapter atomically checks its dedup key, appends with `XADD MAXLEN ~`
only when absent, then stores the resulting entry ID with its configured TTL.
An identical repeated key returns that original entry ID while the dedup key
survives. The script does not compare repeated payload bytes; Core's effect
identity/payload checks are a separate protection. Do not deliberately change
payload under an old key.

Dedup TTL expiry, Redis data loss or a changed prefix/kind/target/key can permit
a new entry. Approximate stream trimming can also remove an old entry while a
dedup key still returns its ID. Therefore a matching receipt is not proof that
the entry remains readable, and a restarted stream is not an exactly-once
consumer guarantee. Verify the exact original payload/identity through the
sink and consumer authority; retain uncertainty when retention prevents it.

For an isolated local **native Redis** contract check, use a selected checkout,
Node.js 24, GNU `flock`, locked dependencies and a real `redis-server` with its
sibling `redis-cli`. The fixture owns its loopback port, temporary server/data,
password and finalizer; do not supply a deployed Redis endpoint or credential.

```bash
export REDIS_SERVER="<absolute-path-to-real-redis-server>"
test -x "$REDIS_SERVER"
test -x "$(dirname "$REDIS_SERVER")/redis-cli"
node --test tests/verification/reliability/redis-transport.test.mts
```

Require all three tests to pass without skipping the native case. The native
case sends the same delivery key through the actual adapter/real Redis for
publisher and telemetry kinds with two distinct targets. It verifies four
separate exact streams and one original entry in each. Same-journal replay
reuses the effect receipt; a fresh **test-only** effect journal forces a second
physical send so actual Lua dedup must return the same original entry ID.
Creating fresh production journals to force retransmission is not a supported
operator procedure. This check demonstrates bounded per-stream dedup, not a
controlled observer outage or external consumer recovery.

The accompanying original socket tests check bounded RESP framing, fragmented
UTF-8 and prompt rejection/closure of malformed responses. The package's
`live-function` test uses a local RESP-speaking TCP fixture, not native Redis;
do not substitute its green result for this command's native-server proof.

## Reproduce observer-history controls separately

```bash
node --test tests/verification/reliability/observer-recovery.test.mts
```

This fixture installs a local file-writing observer, causes an actual missing
sink-directory error and exhausts two attempts. Reconstructing after creating
the directory must still report exhaustion without writing the old event.
A separate run/event then succeeds. Removing only that fixture's derived
checkpoint tests reconstruction from completed delivery history without a
second sink write, followed by a no-op drain. These are real file-journal and
observer behaviors, **not Redis delivery** and not permission to remove an
operator checkpoint. Keep those proof scopes separate.

## Cleanup and completion

For the deployed fault, retain original consumer/target/PVC identities, restored
replica count, exact stream/entry observations, event/checkpoint/delivery/effect
history, failed attempts and the final continuation or stop decision. Remove
only owned fault controls after restoration checks; do not purge streams,
failed journals, credentials or canonical event state to hide a gap. Redis and
consumer retention belong to their separate owners.

A complete same-run no-duplicate recovery observation requires the original
selected event to retain its identity, an allowed owner continuation, a matching
final delivery/checkpoint and exactly the intended sink/consumer observation.
Where the supported continuation is unavailable or the dedup/retention window
expired, report that exact limit. Native adapter dedup and role-health recovery
alone do not establish this stronger outcome.

## Source authority

- [Atomic Lua append/dedup and bounded transport settings](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/common/plugins/redis-transport/src/adapter.ts#L14-L47).
- [Actual credential, operation, payload, stream and receipt handling](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/common/plugins/redis-transport/src/adapter.ts#L57-L91).
- [Exact kind/target stream and dedup identities](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/common/plugins/redis-transport/src/stream-identity.ts#L1-L8).
- [Normal stable observer effect key and selected operator execution exception](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/telemetry/observer-delivery.ts#L15-L43).
- [Checkpoint provenance, event/sequence and monotonicity validation](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/telemetry/observer-recovery.ts#L31-L58).
- [Persisted attempt bound, completed-set reuse and exhaustion](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/telemetry/observers.ts#L82-L108).
- [Native Redis fixture actually checks separate streams and repeated physical sends](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/reliability/redis-transport.test.mts#L24-L81).
