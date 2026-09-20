# Telemetry: Events, Delivery, and Evidence

Status: active v2 path implemented; retained v1 contract has no active runtime producer or consumer
Audience: runtime developer, observer author, operator, security reviewer
Owner: observability maintainers
Evidence: skills/nova/core/telemetry; skills/common/plugins/telemetry-observer; skills/common/plugins/telemetry-store; skills/common/plugins/redis-transport; contracts/telemetry/v1
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
Applies to: Nova lifecycle-event.v2, plugin-domain-event.v2, observer delivery v2, and retained telemetry v1 assets
Last verified: contract, runtime, plugin, configuration, and focused-test inspection on 2026-09-20

## Purpose

Telemetry answers what the system observed. It does not get permission to
change what the pipeline decided.

Nova first commits a canonical event to its run journal. An observer can then
receive that event, redact it, and send a projection to a file store, Redis, an
operator channel, or another granted adapter. If a sink fails, the canonical
event still exists. Recovery restarts delivery from a verified checkpoint.

This order is deliberate. It prevents a dashboard, transport, or notification
service from becoming a second pipeline state machine.

## Two Contract Families

The repository contains two telemetry contract families. Only one is active in
the current runtime.

| Family | Status | Runtime producer and consumer | Use |
| --- | --- | --- | --- |
| Nova v2 events and observer delivery | Active | Nova Core, plugin contexts, Observer Runtime, activated observer plugins, and selected adapters | Canonical runtime events and their controlled delivery |
| `contracts/telemetry/v1` flat envelope | Retained asset | None found in repository runtime code | Compatibility material for possible external readers; schema and generated-type checks only |

Do not describe v1 schemas as the live ingestion contract. Their `cursor`,
timestamps, source, authority strings, quarantine bundles, and generated types
do not create a running service. No v1-to-v2 adapter exists.

> **Source evidence — the version boundary**
>
> [The retained v1 README defines its inactive runtime status and limits](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/contracts/telemetry/v1/README.md#L1-L7).
>
> [The active SDK defines lifecycle events, plugin domain events, observer delivery, and checkpoints as separate v2 contracts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L597-L672).

### What the retained v1 asset contains

The retained catalog names 53 event types. Each type has one source payload
schema and one generated flat event schema. The bundle directory adds 16 schema
documents for archives, manifests, evidence exports, logs, health, and related
read models. The content manifest binds 132 delivered files by byte count and
SHA-256. Generated TypeScript and Go models are part of that set.

These counts describe repository assets only. They do not prove that a service
emits, accepts, stores, orders, or queries any v1 event. The schema accepts a
nullable cursor, but no current consumer enforces its proposed
`project/run/sequence` meaning. `source` and `authority` fields also do not
authenticate a sender.

> [The retained catalog is the complete 53-type source list](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/contracts/telemetry/v1/catalog.json).
>
> [The generated manifest binds all 132 delivered files and states compatibility rules](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/contracts/telemetry/v1/contract-manifest.json).

## Active Data Path

```mermaid
flowchart LR
    Producer[Nova Core or granted plugin] --> Journal[Canonical events.jsonl]
    Journal --> Runtime[Observer Runtime]
    Runtime --> Delivery[Observer delivery v2]
    Delivery --> Observer[Activated observer]
    Observer --> Adapter[Granted adapter]
    Adapter --> Sink[File store, Redis, or operator service]
    Runtime --> Attempts[Delivery journal]
    Runtime --> Checkpoint[Checkpoint journal]
    Journal --> Audit[Redacted audit projection]
```

Text version: Nova Core or a granted plugin appends an event to the canonical
journal. Observer Runtime filters it by an installed subscription. It records
each delivery attempt, invokes the observer with a bounded lease, and writes a
checkpoint only after success. The observer invokes a granted adapter. The sink
stores a projection. Audit is rebuilt directly from the canonical journal.

The active path has six authority boundaries:

1. The producer owns event meaning.
2. The Nova journal owns canonical order and durable presence.
3. The observer registration owns subscription and failure policy.
4. Observer Runtime owns attempt and checkpoint state.
5. The adapter owns transport-specific durability and limits.
6. The sink owns query and retention, but not pipeline lifecycle.

## Active Event Catalog

### Lifecycle events

Nova Core owns the complete closed list of lifecycle event types.

| Family | Event types | Producer | Meaning and primary consumer |
| --- | --- | --- | --- |
| Run | `run.created`, `run.started`, `run.resumed`, `run.waiting`, `run.paused`, `run.succeeded`, `run.failed`, `run.blocked`, `run.cancelled` | Pipeline runner and administrative continuation | Run frontier and terminal status; recovery, audit, observers |
| Stage | `stage.scheduled`, `stage.started`, `stage.waiting`, `stage.retrying`, `stage.skipped`, `stage.succeeded`, `stage.failed`, `stage.blocked`, `stage.cancelled` | Pipeline loop and administrative repair | Stage lifecycle and consumed attempts; recovery, audit, observers |
| Attempt | `attempt.created`, `attempt.dispatched`, `attempt.completed`, `attempt.timed_out`, `attempt.cancelled` | Stage executor | Exact attempt lifecycle and result boundary; recovery, artifact reconciliation, observers |
| Effect | `effect.requested`, `effect.accepted`, `effect.completed`, `effect.failed` | Effect Coordinator bridge | External side-effect audit; effect recovery and audit. Observer-owned effect events are intentionally not re-observed. |
| Artifact | `artifact.created` | Artifact checkpoint recorder after a verified adapter response | Durable artifact reference and producer binding; later stages, recovery, audit |
| Wait | `wait.created`, `wait.resolved`, `orchestrator.required` | Lifecycle reducer, signal path, and orchestrator boundary | Durable pause, exact resume signal, or required external decision |

Each lifecycle event has the same envelope fields:

| Field | Rule |
| --- | --- |
| `schemaVersion` | Exactly `lifecycle-event.v2`. |
| `eventId` | New opaque event identity. Current Nova producers use `event:<UUID>`. |
| `sequence` | Positive append position in the canonical event journal. |
| `type` | One value from the closed list above. |
| `identity` | Always `runId`; optionally stage, attempt, effect, wait, or artifact ID as relevant. |
| `occurredAt` | Producer timestamp. It does not override journal sequence. |
| `causationId` | Prior decision, attempt, delivery, or signal identity when the producer has one; otherwise null. |
| `payload` | Event-specific portable JSON. Meaning belongs to the producer path. |

> **Source evidence — lifecycle production**
>
> [The SDK contract contains the full closed list and common envelope fields](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L605-L645).
>
> [The pipeline runner assigns the journal sequence and writes run, stage, and attempt events through one append function](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/runner.ts#L49-L78).
>
> [The effect bridge emits bounded effect facts but excludes effects created by observer delivery to prevent a feedback loop](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/engine-runtime.ts#L53-L59).

### Plugin domain events

`plugin-domain-event.v2` uses the same event identity, sequence, timestamp,
causation, and JSON payload model. Its `type` is an open string, and it adds the
exact registration provenance of the producer.

A stage plugin emits through its leased invocation context. Nova supplies the
producer provenance and uses the attempt ID as causation. An adapter can emit
through Adapter Runtime. An observer can also emit a domain event, but events
that describe its adapter effects are excluded from later observer delivery.

An open event type is an extension point, not permission to invent an
unversioned contract. A producer must document the type, payload fields,
sensitive fields, subscribers, compatibility rule, and removal plan before a
consumer relies on it.

> **Source evidence — domain event authority**
>
> [The SDK requires producer provenance on every plugin domain event](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugin-runtime/sdk/src/generated/contracts.ts#L646-L656).
>
> [Stage emission assigns canonical sequence, producer provenance, attempt causation, and the supplied type and payload](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/execution/stage-executor.ts#L82-L97).

## Producer and Consumer Matrix

| Record | Producer | Canonical authority | Direct consumers | Subscription or filter | Delivery and sink |
| --- | --- | --- | --- | --- | --- |
| Lifecycle v2 event | Nova runner, loop, executor, effect bridge, wait/resume, or administrative repair | Hash-verified `events.jsonl` | Recovery projections, artifact recorder, audit reader, Observer Runtime | Recovery selects run and known types; observers require exact registered type | Observer policy controls retries; selected adapter controls sink |
| Plugin domain v2 event | Granted stage, adapter, or observer context; Nova assigns provenance and sequence | Same `events.jsonl` | Observer Runtime, audit, domain-specific readers | Exact subscription string; effect-loop exclusion applies | Same observer and adapter path |
| Observer delivery v2 | Observer Runtime | Delivery is not lifecycle authority; source event remains authority | One activated observer registration | Registry grant plus exact event-type subscription | Direct in-process invocation under a revocable lease and timeout |
| Delivery attempt record | Observer Runtime | Recovery authority for delivery attempts | Observer recovery | Exact observer ID, event ID, and attempt number | Local hash-chained `observer-deliveries.jsonl` |
| Observer checkpoint v2 | Observer Runtime after successful delivery | Recovery frontier for one observer and run | Observer recovery | Registration provenance, run ID, sequence, event ID | Local hash-chained `observer-checkpoints.jsonl` |
| Telemetry envelope v2 | Telemetry observer | Projection only | `telemetry.emit` adapter | Observer subscriptions in the active platform configuration | File telemetry store or Redis telemetry adapter |
| Audit v1 projection | Audit reader | Projection only; includes source record hash and journal head | CLI caller or operator | One run ID | Returned JSON; not written as a second authority by this reader |
| Retained telemetry v1 event | No active repository runtime producer | None in current runtime | No active repository runtime consumer | Not applicable | Schema generation and tests only |

The plugin manifest declares what an observer can subscribe to. The platform
configuration decides whether that registration is enabled and granted. A
manifest on disk does not prove activation or a reachable sink.

### Shipped observer registrations

The repository ships five observer registrations. This table is an available
registration catalog. A deployment activates only the entries selected in its
platform configuration.

| Registration | Exact subscriptions | Capability and policy |
| --- | --- | --- |
| `kubeclaw.telemetry-observer:telemetry` | All lifecycle types listed above except `run.resumed`, `run.waiting`, `run.paused`, and `stage.scheduled` | `telemetry.emit`; at least once, per run, best effort, 5 attempts, 1,000 ms backoff, 10,000 ms timeout |
| `kubeclaw.notification-observer:notifications` | `run.started`, the four terminal run events, `stage.started`, the five terminal stage events including `stage.skipped`, `stage.retrying`, `stage.waiting`, and `orchestrator.required` | `operator.request`; at least once, per run, best effort, 5 attempts, 1,000 ms backoff, 10,000 ms timeout |
| `kubeclaw.notification-observer:preview-delivery` | `artifact.created` | `operator.request`; same delivery policy |
| `kubeclaw.agent-observability:ingester` | The 12 OpenClaw domain types `agent-end`, `llm-input`, `llm-output`, `subagent-spawned`, `subagent-delivery-target`, `subagent-ended`, `before-tool-call`, `after-tool-call`, `model-call-started`, `model-call-ended`, `session-start`, and `session-end`, each prefixed with `plugin.kubeclaw.openclaw-agent-events.` | `telemetry.emit`; at least once, per run, best effort, 5 attempts, 1,000 ms backoff, 10,000 ms timeout |
| `kubeclaw.agent-observability:evidence` | `agent-end`, `subagent-delivery-target`, `subagent-ended`, `model-call-ended`, and `session-end` under the same prefix | `artifacts.write`; same delivery policy |

The telemetry observer does not receive the four omitted lifecycle types unless
its manifest changes. The event still remains canonical in Nova. This difference
is important when a sink is used for dashboards: absence from that sink does not
mean the run or scheduler did not emit the event.

OpenClaw Agent Events is the only shipped production adapter that constructs the
12 named plugin-domain types. It normalizes an accepted host hook, changes
underscores to hyphens, and emits under its fixed plugin prefix. The two agent
observers are its declared consumers. Other plugins can use the open domain
event API, but no additional fixed production type catalog was found at this
revision.

> **Source evidence — shipped producer and consumers**
>
> [The telemetry observer manifest contains its exact 27 subscriptions and bounded best-effort policy](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/telemetry-observer/plugin.json#L6-L50).
>
> [The notification manifest separates lifecycle notifications from artifact preview delivery](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/notification-observer/plugin.json#L6-L59).
>
> [The agent-observability manifest declares both the 12-event telemetry consumer and the five-event evidence consumer](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/agent-observability/plugin.json#L6-L65).
>
> [The OpenClaw adapter derives only the fixed prefixed type from an admitted hook name](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/openclaw-agent-events/src/adapter.ts#L52-L82).

## Identity and Correlation

The current v2 model uses several identities for different questions.

| Identity | Answers | Stability |
| --- | --- | --- |
| `runId` | Which pipeline run owns this fact? | Stable across the complete run. |
| `stageId` | Which graph stage does it concern? | Stable inside the pinned graph. |
| `attemptId` and attempt number | Which bounded execution produced it? | Stable for replay of that attempt. |
| `effectId` | Which external effect does it describe? | Stable with the effect request. |
| `eventId` | Which canonical event is this? | Unique event identity. |
| `sequence` | Where is it in the canonical journal? | Monotonic in one event journal. |
| `causationId` | Which decision or operation directly caused it? | Producer-selected from an existing stable identity. |
| `deliveryId` | Which observer and event pair is being delivered? | `delivery:<observerId>:<eventId>`; stable across retries. |

There is no separate global trace ID in the active v2 event envelope. `runId`
is the broad correlation key. The optional identities and `causationId` provide
the narrower chain. A sink must not claim cross-run or cross-producer total
ordering from timestamps.

## Ordering and Deduplification

### Canonical order

`events.jsonl` is one append-only file per run root. `FileJournal` assigns the
next record sequence under an append lock. Event producers receive that same
next sequence. This gives one canonical order for records in that file.

The contract does not promise a total order across different run roots, hosts,
or external sinks. `occurredAt` can be useful for a display, but clock time does
not outrank the journal sequence.

### At-least-once delivery

Observer delivery is at least once around crashes. Runtime records `started`
before invocation and `completed` after success. A crash can occur after a sink
accepted a request but before Nova recorded completion. Recovery can send the
same stable delivery again.

The observer uses a stable delivery ID. Adapter effect keys remain stable for
normal observer retries. The special operator-messaging path separates the
stable logical key from the physical execution attempt, so a retry can execute
again while the sink can still recognize the logical request.

Sinks must treat an exact repeated idempotency key and payload as the same
delivery. A conflicting payload under that key is corruption or a producer bug,
not a new event.

> **Source evidence — stable delivery**
>
> [Observer delivery derives a stable delivery ID and stable adapter keys from observer and event identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/telemetry/observer-delivery.ts#L15-L43).
>
> [Redis performs deduplication and stream append in one Lua operation and returns the original stream entry ID on replay](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/redis-transport/src/adapter.ts#L14-L20).

## Redaction and Sensitive Data

Redaction happens at projection boundaries. It does not make the canonical
journal safe for secrets. Producers must not put credentials into event
identity or payload fields.

The telemetry observer applies the SDK structured-value redactor before it
invokes `telemetry.emit`. The file telemetry store validates a bounded,
accessor-free JSON snapshot and applies a second field-name redaction. It covers
authorization, cookies, passwords, secrets, tokens, API keys, credentials,
private keys, access keys, connection strings, and selected direct personal-data
names. The audit reader recursively redacts a smaller credential-name pattern.

These rules are defense in depth, not data classification. A secret stored
under an innocent key such as `value` can pass a name-based rule. A plugin must
remove or summarize sensitive values at the producer boundary.

| Boundary | Redacts | Does not guarantee |
| --- | --- | --- |
| Telemetry observer envelope | Structured identity and payload through SDK redaction | Removal of an unknown sensitive field name |
| File telemetry projection | Protected and selected personal field names after safe JSON snapshot | Semantic recognition of secrets in free text |
| Audit projection | Credential-like field names in identity and payload | That original `events.jsonl` contains no secrets |
| Redis adapter | No additional semantic redaction | Confidentiality without `rediss:` and correct network policy |

> **Source evidence — projection safety**
>
> [The telemetry observer creates a v2 envelope and redacts event identity and payload before adapter invocation](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/telemetry-observer/src/observer.ts#L7-L29).
>
> [The file telemetry projection rejects proxies, accessors, cycles, invalid Unicode, non-finite numbers, excessive depth or nodes, and sensitive field names](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/telemetry-store/src/projection.ts#L3-L94).
>
> [The audit reader rebuilds from the verified journal, redacts identity and payload, and binds its digest to record hashes and journal head](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/telemetry/audit.ts#L6-L27).

## Observer Delivery, Checkpoints, and Recovery

### Admission

Observer Runtime reads registrations from the immutable registry snapshot. It
delivers only when the registration is enabled by a grant and the event type is
listed in `subscriptions`. Observer Runtime validates configuration and
checkpoint values through the schemas declared by that registration.

Effect lifecycle events produced by observer attempts are excluded. Without
this rule, sending telemetry could produce effect telemetry, which could invoke
the same observer again without a natural end.

### Attempt sequence

For each subscribed event:

1. Skip it when the observer/run checkpoint already covers its sequence.
2. Record a `started` delivery attempt.
3. Invoke the observer under its configured timeout and a 256 MiB lease limit.
4. Record `completed` on success or `failed` with an error string.
5. Retry up to `maxAttempts`, waiting `backoffMs` between attempts.
6. Commit the checkpoint only after successful delivery.

The checkpoint never moves backward. The same sequence with another event ID is
a conflict. Recovery validates checkpoints and delivery transitions against the
canonical event journal and current registration before it resumes.

### Required and best-effort policy

| Mode | Exhausted delivery | Effect on later events |
| --- | --- | --- |
| `required` | Observer Runtime throws and fails the host operation | Delivery stops; the host cannot claim the required sink completed |
| `best-effort` | Failure is returned in the drain result | Later events for the same observer and run are blocked during that drain; other runs and observers can continue |

Best-effort does not mean silent loss. The failed attempt remains in the
delivery journal, and its checkpoint does not advance.

> **Source evidence — recovery behavior**
>
> [Observer Runtime filters subscriptions, enforces checkpoints, applies required or best-effort policy, retries, and checkpoints only after success](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/telemetry/observers.ts#L70-L106).
>
> [Recovery validates attempt transitions and rebuilds the maximum attempt and completed-delivery sets](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/core/telemetry/observer-recovery.ts#L71-L82).

## Sink Contracts

### File telemetry store

The file adapter owns stream `telemetry/plugin-events`. It uses the stable
adapter idempotency key, redacts a bounded JSON snapshot, and returns whether it
appended a new record plus its sequence.

Defaults are:

| Limit | Default | Failure behavior |
| --- | --- | --- |
| One record | 1,048,576 bytes | Reject with `TELEMETRY_RECORD_SIZE_EXCEEDED` |
| Record count | 100,000 | Reject when the durable store is full |
| Whole store | 256 MiB | Reject when the durable store is full |
| JSON depth | 64 | Reject the record |
| JSON nodes | 100,000 | Reject the record |

The store does not silently rotate records. A full required sink applies
backpressure through Observer Runtime. An operator must add capacity or execute
owner-authorized retirement.

> [The file adapter declares the defaults, stream, operation checks, idempotent append, and size-error mapping](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/telemetry-store/src/adapter.ts#L5-L42).

### Redis telemetry adapter

The Redis adapter accepts only `telemetry.emit`, operation `append`, and resource
type `telemetry.event`. It resolves the password through `secrets.read`, rejects
payloads above 1 MiB, and uses `redis:` or `rediss:` with a bounded timeout.

Each target has a stream identity under the configured prefix. The Lua command
uses approximate `MAXLEN`, so Redis can temporarily retain more than the target.
The dedup key expires after `dedupTtlMs`. These two settings are independent:
stream retention does not prove dedup retention, and dedup retention does not
prove the stream entry still exists.

A connection failure, timeout, malformed reply, full Redis instance, or missing
secret fails the adapter call. Observer policy then decides whether the host
fails closed or records a best-effort failure.

> [The adapter validates URL, prefix, MAXLEN, dedup TTL, timeout, secret, payload size, operation, and returned stream ID](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/redis-transport/src/adapter.ts#L23-L87).
>
> [The network exchange supports plain or TLS Redis, AUTH, cancellation, timeout, and bounded reply decoding](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/common/plugins/redis-transport/src/exchange.ts#L5-L36).

## Evidence, Redis, Logs, and Metrics

These records can describe the same operation, but they answer different
questions.

| Record | What it can prove | What it cannot prove |
| --- | --- | --- |
| Canonical lifecycle event | Nova committed a lifecycle fact at a verified journal position | That an external side effect completed unless a verified receipt supports it |
| Effect receipt | The selected adapter recorded the exact terminal effect result under its idempotency key | That a dashboard or notification received a copy |
| Artifact reference plus verified bytes | Exact content, size, media type, producer, and digest | That the artifact changed pipeline state without the corresponding lifecycle record |
| Signed Buster remote result and receipt | Buster produced the bound result for the accepted job and source identity | That Nova imported it, unless Nova's journal records the import path |
| Redis stream entry | A configured adapter appended one projection and received a stream ID | Canonical lifecycle order, indefinite retention, or successful downstream consumption |
| Observer delivery and checkpoint | Nova attempted delivery and, after success, advanced one observer/run frontier | Business success inside a sink beyond the sink's adapter contract |
| Runtime log | Diagnostic text from one process or tool | Complete event order, identity binding, or durable product state by itself |
| Metric sample | An aggregate or measurement at one observation time | Which exact event or artifact caused the value, unless labels and retained evidence bind it |
| Audit projection | A redacted, digest-bound view of canonical events for one run | The complete effect, artifact, Worker, or database store |

Logs and metrics remain useful because they expose latency, pressure, resource
use, and failures that do not belong in a lifecycle payload. Keep them separate
from authority. A missing metric must not change a run to failed, and a green
dashboard must not change a failed run to succeeded.

For the same reason, restore Redis and monitoring after the owning journals and
databases. Rebuild their projections from verified sources when the sink
contract permits replay.

## Retention, Capacity, and Backpressure

There is no single telemetry retention policy in the runtime. Each layer has a
different bound and response.

| Layer | Capacity or retention control | When pressure reaches the limit | Data-loss meaning |
| --- | --- | --- | --- |
| Canonical event journal | Filesystem capacity; no automatic age or count retention | Append fails and Nova cannot safely continue mutation | Authority is preserved up to the last committed record; new progress stops |
| Delivery and checkpoint journals | Filesystem capacity; bounded retries; no automatic retirement | Attempt or checkpoint append fails; required path fails closed | Canonical source remains; delivery recovery cannot advance |
| Observer invocation | `timeoutMs`, `maxAttempts`, `backoffMs`, 256 MiB lease declaration | Abort, retry, then required failure or best-effort blocked run | Sink may have accepted a lost-ACK attempt; stable identity permits deduplication |
| File telemetry store | Record bytes, record count, total bytes, depth, node count | Reject append; never rotate silently | Projection is incomplete; canonical event remains |
| Redis stream | Approximate `MAXLEN` per stream | Old entries trim during append | Projection history can disappear by policy; Nova state does not |
| Redis dedup | `dedupTtlMs` per key | Key expires | A replay outside the window can create another stream entry |
| Redis server | `maxmemory 1gb`, `noeviction`, 20 GiB PVC in selected production values | New write fails instead of evicting state | Backpressure reaches observer policy; existing stream and dedup state remains |
| Audit result | Caller memory/output and complete journal read | Read fails or caller cannot retain output | No canonical data change |
| Retained v1 files | Repository source retention only | Removal can break unknown external readers | No current repository runtime effect; external use must be assessed |

### Pressure propagation

A required sink propagates pressure in this order:

`sink limit -> adapter error -> observer retries -> required observer failure -> host operation fails`

A best-effort sink uses this order:

`sink limit -> adapter error -> observer retries -> failed delivery record -> same observer/run blocks for this drain`

Neither path deletes or rewrites the canonical event. This costs disk space and
can stop work, but it preserves an exact recovery point.

The adapters do not send a built-in capacity alert. The deployment's monitoring
layer must alert on filesystem space, journal growth, sink rejection, observer
failure, Redis memory, Redis persistence, stream length, and checkpoint age.
Until the operator configures and tests that integration, a bounded rejection
is the enforced safety mechanism. The operator owns early warning.

### Retirement

Do not delete canonical events while recovery, audit, effects, artifacts, waits,
or observer checkpoints still refer to them. Do not delete a sink record merely
because its stream trimmed another copy. Retirement needs the domain owner's
fence, selected identities, a reference check, and a durable receipt or
tombstone when the store supports it.

The current Nova event and observer journals have no automatic retirement
implementation. Plan filesystem capacity for the full operational retention
window and copy required evidence to an independent backup before deletion.

## Audit Is a Projection

`audit` reads `events.jsonl`, filters one run, retains the event ID, sequence,
type, redacted identity, time, causation, redacted payload, and source record
hash, and then binds the projection to the journal head with a digest.

This makes the output useful for diagnosis and review. It does not make the
output a replacement journal. It excludes effect-receipt blobs, snapshots,
artifacts, observer delivery attempts, and other stores unless their facts were
also represented by events.

If the audit command is interrupted, rerun it from the unchanged authoritative
run root. Do not merge partial audit output with another run or journal head.

## Failure and Recovery Matrix

| Failure | Preserved authority | Recovery |
| --- | --- | --- |
| Observer is not activated | Canonical event journal | Correct activation and grants. Do not advance a checkpoint manually. |
| Observer times out | Event, attempt record, stable delivery ID | Let the configured policy retry. Check the sink for a lost acknowledgment before manual action. |
| Required observer exhausts attempts | Canonical event and failed delivery history | Repair the sink or configuration, preserve journals, and restart owned recovery. |
| Best-effort observer fails | Canonical event and failed delivery history | Other observers can continue. Repair this observer; replay from its last valid checkpoint. |
| Checkpoint conflicts with event ID | Event journal and conflicting checkpoint evidence | Stop delivery. Restore or investigate the checkpoint journal; do not select one by timestamp. |
| Redis dedup key expired | Canonical event and any retained stream entry | Consumer deduplicates by event/delivery identity, or operator accepts policy-defined duplicate projection. |
| Redis stream trimmed old entry | Nova event journal | Replay only through the observer path when policy and sink allow it. A checkpoint may need an owner-approved rewind procedure; do not edit it casually. |
| File sink is full | Nova event journal and prior sink records | Add capacity or execute verified retirement. Required observers remain failed closed. |
| Canonical event journal is corrupt | No trustworthy projection can repair it | Stop mutation and restore the complete Nova run group from verified backup. |
| Retained v1 schema changes | No current runtime effect | Regenerate manifest/types, run contract tests, and assess external readers. It does not update v2 runtime automatically. |

## Change Guide

### Add a lifecycle event

1. Add the type to the SDK contract and generated schema source.
2. Define the exact producer and lifecycle commit point.
3. Define identity and causation fields.
4. Keep the payload portable, bounded, and free of secrets.
5. Update recovery and audit readers when the event changes state meaning.
6. Update artifact, effect, or wait projections when they consume the event.
7. Add exact observer subscriptions and compatibility tests.
8. Test restart before and after the event commit.

### Add a plugin domain event

1. Choose a namespaced and versioned event type.
2. Document the producer registration and payload schema.
3. State whether replay of the same attempt can emit it again.
4. Define sensitive fields and producer-side minimization.
5. Add subscribers only after the producer contract is stable.
6. Test unknown consumers, duplicate delivery, and removal.

### Add an observer or sink

1. Select exact subscriptions. Avoid a broad event set without a use case.
2. Choose `required` only when pipeline progress must depend on delivery.
3. Set bounded timeout, attempts, and backoff.
4. Use stable delivery identity for every external effect.
5. Define redaction before transport.
6. Define record, store, queue, and retention limits.
7. Define full-store behavior. Never default to silent loss.
8. Test lost acknowledgment, restart, duplicate input, corrupted checkpoint,
   exhausted retries, cancellation, and shutdown.
9. Document how to retire its records and remove the observer without deleting
   canonical events.

### Change retained v1

Treat v1 as a delivered compatibility asset. Update the catalog and source
schemas, regenerate all event and bundle schemas plus Go and TypeScript types,
and run the manifest and cross-language tests. Assess external users first.
Do not claim that this activates v1 in the runtime.

## Verification Map and Evidence Limits

| Area | Repository evidence | Limit |
| --- | --- | --- |
| v2 envelope and event types | SDK schema generation and type checks | Types alone do not prove a configured observer |
| Canonical order and corruption detection | FileJournal and Nova recovery tests | Does not prove target-volume power-loss behavior |
| Observer attempts, checkpoints, required/best-effort policy | Nova observer and recovery tests | Does not prove an external sink's availability |
| Telemetry observer redaction | Telemetry-observer parity and live-function tests | Field-name rules cannot detect every semantic secret |
| File sink bounds and durability | Telemetry-store package and live-function tests | Does not provide off-node backup or automatic retention |
| Redis lost-ACK and dedup behavior | Redis transport package, durability, and migration tests | Dedup remains bounded by configured TTL; cluster storage acceptance is separate |
| Retained v1 schemas and generated languages | `generate-telemetry-contracts.mjs --check` and v1 contract tests | No runtime service, producer, consumer, authorization, or ordering implementation |

## Related Guides

- [Data and State](data-and-state.md) explains storage, backup groups, and deletion.
- [Nova Core](nova-core.md) explains event-driven lifecycle recovery.
- [Plugin Runtime](plugin-runtime.md) explains observer admission, grants, and activation.
- [Deployment and Trust](deployment-and-trust.md) separates evidence from logs, metrics, and transport.
- [Contracts](../extend/contracts.md) explains observer authoring and checkpoints.
- [Back up and recover](../use/recovery.md) gives the operator recovery sequence.
