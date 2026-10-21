# Events, Payloads, and Delivery Boundaries

Status: bounded reference; discovery limitations stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named components own diagnostic and delivery semantics
Evidence: skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/runner.ts; skills/nova/core/telemetry/observers.ts; skills/nova/core/telemetry/observer-delivery.ts; skills/nova/core/state/journal.ts; skills/nova/core/telemetry/audit.ts; contracts/agent-observability/v1/src/constants.ts
Applies to: the named event, delivery, projection and retained-contract boundaries below
Last verified: 2026-10-15; current source behavior checked; no live diagnostic or recovery executed

## Find the authoritative record

An event is a record that something happened. An envelope identifies that
record and its version; the payload carries its type-specific data. A
projection is a derived view for a sink or diagnosis. It does not replace the
original authority merely because it has a timestamp, sequence or digest.

1. Identify the envelope's exact `schemaVersion`, producer and record family.
2. Match its run/attempt/effect/delivery identity and order scope below.
3. Find the actual consumer and its delivery, retention and replay rules before
   repeating an action or interpreting a missing sink record as lost execution.

For a failed operation or uncertain retry, use [Errors](errors.md). For
recursive field constraints and versions, use [Schema authorities](schemas.md)
and the exact consuming definition. For delivery architecture, use
[Telemetry](../understand/telemetry.md); the audit safety conditions on this
page apply before any audit command linked elsewhere.

## Select the family and consumer

These named routes are a bounded index, not a claim that every product event
and payload producer has been catalogued. A consumer is the component that
actually reads or subscribes to the record, not a guessed owner from its name.

| Family / exact version | Producer and payload authority | Consumer / transport | Persistence and repeat boundary |
| --- | --- | --- | --- |
| `lifecycle-event.v2` | Nova runner/executor and effect bridge; exact lifecycle enum and event-specific producer payload | Nova event journal, recovery readers and subscribed observers | Canonical journal order; each append has its own event ID. No global sink or host order follows |
| `plugin-domain-event.v2` | Granted plugin context; registration provenance, namespaced type, owned payload meaning | Same event journal and exact subscribed observers/domain readers | Extension names are constrained; envelope validity alone does not define each payload's meaning |
| `observer-delivery.v2` | Observer invocation wraps one canonical lifecycle/domain event | Activated observer under its lease/grants and configured policy | Stable delivery identity, changing delivery attempt; not a new canonical lifecycle event |
| `observer-checkpoint.v2` | Observer runtime after successful handling | Checkpoint journal and recovery/drain logic | Per observer/run sequence and event identity; no manual advancement to hide a failed sink |
| Observer delivery history | Runtime records started/completed/failed attempts | Delivery journal/recovery logic | Attempt history and checkpoint are distinct; a completed call followed by checkpoint failure must retain both facts |
| File / Redis telemetry projection | Selected telemetry or Redis adapter from its request payload | Bounded file store or Redis stream; downstream readers depend on deployment | Store capacity, stream trimming and dedup expiry are different from canonical event retention |
| `pipeline-audit.v1` | `readPipelineAudit`, from verified event records filtered by run | Caller-returned redacted JSON with journal head/digest | No new lifecycle/audit entry, but acquisition can change journal bytes; see the caveat below |
| `attempt-progress-event.v1`, `worker-log-part.v1`, selected Worker result version | Worker executor and selected resource/result contract | Configured progress/log callbacks and caller/result adapter | Progress is best effort; terminal result/cleanup authority is separate from the last message |
| Prism operation / Buster job and result records | Exact engine/remote dispatch and durable operation contract | Service/controller/import consumers; see their detailed guides | Bound job/operation/attempt/result and import identities, not automatically a Nova event envelope |
| OpenClaw agent-observability schema `1` | Host observer source `openclaw.plugin.agent-observer` and declared ingress types | Control/payload/dead-letter Redis streams | Distinct host envelope and loss/retry rules; not the retained flat telemetry v1 contract |
| Retained flat telemetry v1 assets | Delivered schemas/catalogue/types, as declared by their README | No active flat-envelope runtime producer/consumer found in that source declaration; external readers unresolved | Assets do not implement ingestion, authentication, ordering or retention; version label alone gives no compatibility |

For the complete Worker record fields and resource-version distinction, use
[Worker Core](../understand/worker-core.md) and [worker profiles](worker-profiles-and-roles.md).
For operation/result/evidence import, use [Prism runtime](../understand/prism-runtime.md)
and [Buster](../understand/buster.md). Their records cannot be converted into
canonical lifecycle events merely by renaming a version field.

**Source — separate canonical and delivery definitions:**
[lifecycleEvent envelope and closed type enum](../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1026-L1058) (`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:1026-1058`, current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`). [pluginDomainEvent envelope and type constraint](../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1059-L1080) (`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:1059-1080`, current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`). [observerDelivery / observerCheckpoint](../../../skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L1081-L1117) (`skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json:1081-1117`, current-checkout SHA-256 `837efd7975991aa21b8c92b57881194e9bc8c7adc4370f238d1a15b6d85d44db`).

## Payload meaning and actual production

Both canonical v2 envelopes require `schemaVersion`, `eventId`, positive
`sequence`, `type`, `identity`, `occurredAt`, nullable `causationId` and JSON-object
`payload`. Domain events additionally require `producer` registration provenance.
The closed lifecycle `type` enum includes run, stage, attempt, effect, artifact,
wait and orchestrator records. Read the exact enum and producer, not a
wildcard as permission to invent another lifecycle name.

Domain types are extensible but not unconstrained. The exact schema pattern is:

`^plugin\.[a-z0-9]+(?:[._-][a-z0-9]+)+\.[a-z0-9]+(?:[._-][a-z0-9]+)*$`

A matching name still needs an owning producer, payload definition and actual
consumer/subscription. A generated TypeScript `string` does not remove this
wire constraint or establish every payload's recursive semantics.

| Actual production path | What enters the journal | Consumer / limit to retain |
| --- | --- | --- |
| `PipelineRunner.run` append | New lifecycle envelope; sequence from `appendSequenced`, fresh event ID, supplied identity/payload and causation | Recovery and event consumers need the original run/graph identity and event type |
| `StageExecutor` plugin-context append | Domain envelope with owner provenance and attempt ID as causation | Registration authority and actual payload meaning remain distinct from the generic JSON-object shape |
| Observer plugin-context append | Domain envelope with observer provenance and delivery ID as causation | Same canonical journal, but a new event ID/sequence; it is not the delivery wrapper or checkpoint |
| `effectAppender` | `effect.requested`, `effect.accepted`, `effect.completed` or `effect.failed` with effect/attempt identity | Attempts whose ID starts `observer:` are excluded from this bridge to prevent observer-effect feedback |
| OpenClaw agent-events adapter | `plugin.kubeclaw.openclaw-agent-events.<hook-with-hyphens>` from its supported hook and normalized identity/payload | This granted domain adapter is not the separate host Redis observer or an unconstrained hook registry |

**Source — actual appenders and selected hook mapping:**
[PipelineRunner.run lifecycle append](../../../skills/nova/core/execution/runner.ts#L60-L77) (`skills/nova/core/execution/runner.ts:60-77`, current-checkout SHA-256 `9a34098cd68460f42e220ada2f3e7bef37fcc9eb5fdd351db2cd1585fe6a5cc6`). [StageExecutor plugin-context domain append](../../../skills/nova/core/execution/stage-executor.ts#L82-L97) (`skills/nova/core/execution/stage-executor.ts:82-97`, current-checkout SHA-256 `4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb`). [effectAppender observer feedback exclusion](../../../skills/nova/core/execution/engine-runtime.ts#L53-L61) (`skills/nova/core/execution/engine-runtime.ts:53-61`, current-checkout SHA-256 `de279faaeffc78713d3b3049d43a2efb9add45e4ad05a89c0f4efde1dbe120ec`). [SUPPORTED_HOOKS](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L5-L10) (`skills/common/plugins/openclaw-agent-events/src/adapter.ts:5-10`, current-checkout SHA-256 `665d10a623f4e9e83dc50bc9a7c769aea0bec8658ab233f3a6d07a89338dd7c7`). [normalized hook domain emit](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L70-L80) (`skills/common/plugins/openclaw-agent-events/src/adapter.ts:70-80`, current-checkout SHA-256 `665d10a623f4e9e83dc50bc9a7c769aea0bec8658ab233f3a6d07a89338dd7c7`).

### OpenClaw hook payload is a projection, not the raw hook

All supported hooks in the granted `openclaw-agent-events` adapter share the
same `openclaw-agent-event.v2` payload: `schemaVersion`, `observedFields` and
`metrics`. `observedFields` contains sorted, truncated field names, not their
values. The adapter excludes identity keys and keys matching its sensitive-name
filter, then keeps at most the first 128 entries after filtering; each observed name
is limited to 128 characters. This is a bounded projection, not a promise that
all raw fields survive or that a raw hook payload is retained.

`metrics` keeps only allowlisted duration, latency, count, token-count, success,
cached and status-code keys whose values are finite numbers or booleans. String
values are not copied. Consumers must not reconstruct prompts, tool arguments
or results from this record. Identity is normalized separately: nested camelCase,
nested snake_case, top-level camelCase, then top-level snake_case, selecting the
first non-nullish value. An invalid selected run ID drops the hook; it does not
fall through to a later candidate. Optional stage/attempt IDs must be nonempty
strings of at most 512 characters or are omitted.

See the actual [normalization and projection implementation](../../../skills/common/plugins/openclaw-agent-events/src/adapter.ts#L12-L71).
Observer-produced domain records instead retain the payload supplied by the
granted observer, with its provenance and delivery causation; see the
[observer append path](../../../skills/nova/core/telemetry/observer-delivery.ts#L37-L40).
Neither generic envelope shape establishes a universal payload schema for other
plugin producers.

The platform surface inventory extracts selected lifecycle names, the shipped
OpenClaw domain adapter's hooks and agent-observability ingress names. It does
not discover every dynamic producer, payload builder, subscriber or retention
policy. Keep its generated names linked to the authored owner and task; do not
manually duplicate the list here as another authority.

**Source — existing inventory's finite name extraction:**
[lifecycle/domain/ingress name acquisition](../../../scripts/docs-platform-surface-inventory.mjs#L882-L904) (`scripts/docs-platform-surface-inventory.mjs:882-904`, current-checkout SHA-256 `0a351f643d93c20518b0dd54443a227ffc2f40194c7a35cd7ec55025b5b6bda0`).

## Identity and order are scoped

| Field / identity | Meaning | What it does not prove |
| --- | --- | --- |
| `eventId` | One canonical event's identity | A different delivery or stream ID is the same field |
| Run / stage / attempt identity | Which execution location produced or consumed the record | Two records from different runs can be merged because timestamps look similar |
| `effectId` | Correlates an external-effect lifecycle record | The payload alone proves the external action's terminal receipt |
| `causationId` | Links a producing attempt, delivery or continuation | A globally sorted or complete causal graph exists |
| Journal `sequence` / hash chain | Order and integrity within the actual journal; producers obtain sequence at append | Global order across hosts, roots, Redis streams or databases |
| `occurredAt` / `deliveredAt` / `sentAt` | Timestamp for the named producer/delivery/progress step | Timestamp order equals commit order or proves an acknowledgement |
| `delivery:<observerId>:<eventId>` | Stable observer delivery identity | Delivery attempt number, invocation lease and idempotency key are all interchangeable |
| Redis stream ID / dedup key | The sink's stream position / repeat-suppression key | Unlimited retention or permanent exactly-once event delivery |

The Worker progress producer uses its own local sequence and catches callback
failure; the terminal result is authoritative, not the last progress state.
Its result preserves the selected protocol, attempt and claim generation,
worker, fault, evidence, resource and cleanup fields. Read the matching version
before comparing records from different execution routes.

**Source — actual Worker progress and result construction:**
[best-effort progress record](../../../skills/worker/core/worker/attempt-executor.ts#L590-L611) (`skills/worker/core/worker/attempt-executor.ts:590-611`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`). [terminal result identity and fault fields](../../../skills/worker/core/worker/attempt-executor.ts#L629-L650) (`skills/worker/core/worker/attempt-executor.ts:629-650`, current-checkout SHA-256 `2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42`).

## Delivery, acknowledgement, and replay

An observer is a registered consumer that receives subscribed event types.
Its checkpoint records how far it advanced for one run. An acknowledgement
means the called receiver reported success; it does not make an unbounded
exactly-once guarantee across a lost connection and later retry.

1. Drain reads canonical events and selects observers with grants and an exact
   subscription to the type. It skips events already covered by that observer/run checkpoint.
2. Delivery uses configured `maxAttempts`, `backoffMs` and `timeoutMs`; retained
   prior attempts count toward the maximum rather than resetting on every drain.
3. Each invocation gets an observer-delivery wrapper and a revocable lease.
   The delivery path records success before checkpoint advance. Conflicting checkpoint event
   IDs at the same sequence fail; regression also fails.
4. A required observer failure throws. Best-effort failure records the failure
   and blocks later events for that observer/run in this drain; it is not a
   universal promise to ignore sink failure and continue that run's delivery.
5. If the receiver accepted data but its acknowledgement was lost, another
   delivery can repeat. Reconcile sink evidence and stable identities before
   any manual replay. Do not edit a checkpoint to manufacture success.

Ordinary adapter calls derive an idempotency key from stable delivery ID and
invocation sequence. The supported `operator.request` route to
`kubeclaw.operator-messaging` deliberately has per-execution identity plus a
stable key passed separately. Do not apply one key rule to every capability.
The lease's declared memory/time values do not prove an external process was
killed when its callback timed out.

**Source — policy, checkpoint and genuine delivery keys:**
[checkpoint consistency and subscribed drain](../../../skills/nova/core/telemetry/observers.ts#L51-L91) (`skills/nova/core/telemetry/observers.ts:51-91`, current-checkout SHA-256 `b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd`). [retained delivery attempts and backoff](../../../skills/nova/core/telemetry/observers.ts#L96-L108) (`skills/nova/core/telemetry/observers.ts:96-108`, current-checkout SHA-256 `b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd`). [delivery timeout, lease, wrapper and capability key selection](../../../skills/nova/core/telemetry/observer-delivery.ts#L8-L44) (`skills/nova/core/telemetry/observer-delivery.ts:8-44`, current-checkout SHA-256 `d80f67ca85cafee41eb41d228be7a8d3aff820b556ccf21efa6f0a9845afd1fc`).

## Persistence, retention, and loss

| Layer | Actual policy / source boundary | Safe interpretation |
| --- | --- | --- |
| Nova event journal | Hash-chained append/load under a stable lock; no automatic retirement route in this class | Retain canonical records needed by recovery/effects/artifacts/waits; a sink trim does not retire them |
| Observer attempts / checkpoints | Separate durable records of attempts and progress | Checkpoint state is not a full copy of sink contents or a deletion policy |
| File telemetry projection | Adapter passes per-record, record-count and store-byte bounds to its durable store | Capacity and the downstream store's retention are not canonical event retention; this adapter is not a global retirement procedure |
| Redis telemetry adapter | Lua checks dedup key, appends with approximate `MAXLEN`, then stores dedup entry with TTL | Expired key permits a later repeat; old stream entries can trim; neither policy is unlimited history |
| OpenClaw host writer | Control retries up to configured limit; payload gets one attempt; final control failure gets one dead-letter attempt | A dead-letter queue is a failure-copy stream, not proof a consumer recovered it; failed payload is not Nova-replayable |
| Host queues and external readers | Host-local memory and selected deployment receivers have separate ownership | No durable replay or downstream consumer is inferred where this finite source set has not established one |
| Retained flat telemetry assets | README declares compatibility data, not ingestion/retention/auth implementation | Assess external readers before removing assets; a retained schema is not an active delivery pipeline |

**Source — projection capacity and finite Redis behavior:**
[bounded telemetry projection store and append](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L5-L37) (`skills/common/plugins/telemetry-store/src/adapter.ts:5-37`, current-checkout SHA-256 `f5a3ff64dce028471c800e9a5da01bcc3a405f26b1e68ccdd8e78cd54e00fb13`). [REDIS_PUBLISH_LUA dedup, append, trim and expiry](../../../skills/common/plugins/redis-transport/src/adapter.ts#L14-L21) (`skills/common/plugins/redis-transport/src/adapter.ts:14-21`, current-checkout SHA-256 `15c91e7eed9a98784d6fbdcb931160202295ea6ef20b1c18367bcd9eaab4cc01`). [control/payload retry and dead-letter write](../../../skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts#L202-L253) (`skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts:202-253`, current-checkout SHA-256 `8f974830cf10d931410d6bd1f23b4782aa8988b96baba13f4172a3b9f85d4a5d`).

The host observer's source is `openclaw.plugin.agent-observer`, with separate
`pipeline:agent-observability:control:v1`, `:payload:v1` and `:deadletter:v1`
stream names. These constants identify a different schema/source from both
the granted domain adapter and the flat retained telemetry-v1 assets.
A source string is not sender authentication or proof of a live consumer.

**Source — separate host identity and retained contract scope:**
[host schema, streams and ingress types](../../../contracts/agent-observability/v1/src/constants.ts#L1-L47) (`contracts/agent-observability/v1/src/constants.ts:1-47`, current-checkout SHA-256 `7362261fe21d18e7acdf32b266f938a740e1106a4642579e7a1b203cb8b97924`). [retained flat contract and unimplemented consumer obligations](../../../contracts/telemetry/v1/README.md#telemetry-contract-v1) (`contracts/telemetry/v1/README.md:1-35`, current-checkout SHA-256 `557bb4c6b35df61f1dc31a964953d62c035905790fec1dd06db33248deaef892`).

## Audit acquisition can change the journal

`readPipelineAudit` returns a redacted `pipeline-audit.v1` projection for one
run with source record hashes, journal head and digest. It adds no new
canonical lifecycle/audit entry. It is not a replacement for effect receipts,
artifacts, snapshots, observer delivery history or other stores.

**No new entry does not mean no write.** Before filtering the selected run,
audit constructs `FileJournal`: parent-directory preparation, stable append-lock
open/create and genuine `/usr/bin/flock` precede journal loading. If existing
bytes are nonempty and do not end with a line feed (LF), loading truncates to
the last LF, possibly zero bytes, and synchronizes the file before parsing
committed chain/hash records. Empty or LF-terminated bytes need no tail
truncation; lock metadata effects remain. Invalid committed data can still
fail. This is not general corrupt-journal recovery.

- `AUDIT_JOURNAL_MISSING` is checked before construction when the file is absent;
  audit does not create the missing event journal.
- `AUDIT_RUN_MISSING` is checked after construction and filtering; even this
  failure can already have lock/tail effects.
- Before audit or a retry, retain the first diagnostic, partial output and
  original evidence. Do not assume that interruption left bytes unchanged.
- If original bytes must be retained, inspect or retry only against a correctly
  bound inactive copy of the run root, not the sole retained original. Audit
  can modify that copy too. Keep the original run identity/journal binding;
  do not redirect an active run or merge output from different runs/heads.
- There is no read-only/no-record flag in this audit route that bypasses
  construction, and no alternate parser or command is asserted equivalent here.

**Source — actual audit acquisition, lock and tail effects:**
[readPipelineAudit missing-file/run order and projection](../../../skills/nova/core/telemetry/audit.ts#L15-L27) (`skills/nova/core/telemetry/audit.ts:15-27`, current-checkout SHA-256 `59eb49b7c0e2e430b38c53572edb5d7563724957996bd2dfda261fe1a1569bfd`). [FileJournal constructor](../../../skills/nova/core/state/journal.ts#L30-L42) (`skills/nova/core/state/journal.ts:30-42`, current-checkout SHA-256 `25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf`). [incomplete-tail recovery and subsequent load/parse](../../../skills/nova/core/state/journal.ts#L59-L81) (`skills/nova/core/state/journal.ts:59-81`, current-checkout SHA-256 `25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf`). [FileMutex.withLock and real flock child](../../../skills/nova/core/state/file-mutex.ts#L8-L24) (`skills/nova/core/state/file-mutex.ts:8-24`, current-checkout SHA-256 `d6d347d6b615796ff761c0c608ed6a4d9f4f834bea92ddd2870d2312b5d04c7c`).

## Diagnose one missing or repeated event

1. Retain the original event/run identity, journal head/sequence, observer
   identity, attempt numbers and non-secret sink response. Do not delete or
   rewrite the source to make the projection look complete.
2. Distinguish missing production from failed delivery, expired deduplication,
   trimmed projection, unsupported subscription or an unknown downstream reader.
3. Read the owning policy and first failure. A required observer failure,
   exhausted delivery attempts and a lost acknowledgement need different actions.
4. Establish the original authority and cleanup before replay. Repair the sink
   and use its supported bounded recovery path; do not re-execute the original
   business action solely to repopulate a telemetry projection.
5. Retain restored delivery/result evidence and unresolved gaps separately.
   A dashboard becoming green does not prove the missing source or sink history
   was recovered. Use [Diagnosis](../use/diagnose.md) and [Recovery](../use/recovery.md)
   with their explicit target/access prerequisites, not as a blanket replay instruction.

## Coverage and change impact

This catalogue binds selected canonical v2 definitions and producers, observer
policy, Worker executor records, selected adapters, host constants and retained
assets. It is not a complete census of all dynamic event builders, payload
versions, consumers, native/service/operations paths or external sinks.
A generic JSON-object payload does not establish each event type's full
recursive constraints. Unknown consumers remain unknown; no retention window,
end-to-end availability or replay success is inferred from source presence.

When a type, payload, identity, subscription, retry or retention rule changes,
update its exact authority and consumer explanation together. Use
[Documentation maintenance](../extend/documentation-maintenance.md); existing
name extraction does not generate this authored hub or prove every producer
has an owner. We ran no extractor, parser, audit, replay, live delivery or recovery
command for this page.
