# TELEMETRY_CONTRACT_V1

## 1. Purpose

This document locks the canonical telemetry contract shared by KubeClaw runtime code and ClawDeck.

Rule:
- if telemetry behavior changes in GitHub, the corresponding ClawDeck types, consumer logic, and tests must change too
- if ClawDeck adopts new telemetry assumptions, the runtime/docs must change too
- no one-sided drift

---

## 2. Scope

This contract covers:
- Redis telemetry events
- event identity, ordering, dedupe, and delivery semantics
- plugin-owned telemetry surface (Buster is the first external producer)
- transcript event behavior
- rate-limit telemetry behavior
- cost telemetry behavior
- `.swarm/logs/**` artifact layout relevant to telemetry
- Discord log record shape

This contract does **not** redefine agent lifecycle control paths. That is handled separately by `docs/lifecycle-unification/PHASE0_LIFECYCLE_UNIFICATION_CONTRACT.md`.

### 2.1 Documentation authority split

This contract is the authoritative owner of:
- canonical event inventory
- stream identity and envelope invariants
- enums, ordering, dedupe, and delivery semantics
- compatibility boundaries for legacy telemetry shapes

`docs/telemetry-event-schema.md` is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.

Rule:
- schema event sections must stay in exact inventory parity with this contract
- the schema must not introduce additional canonical event families outside the inventory locked here

---

## 3. Canonical event inventory

### 3.1 Shared pipeline/common event types

These are canonical event names:

- `pipeline.started`
- `pipeline.completed`
- `pipeline.halted`
- `module.started`
- `module.status_changed`
- `phase.started`
- `phase.completed`
- `retry.scheduled`
- `retry.exhausted`
- `system.io_warning`
- `summary.started`
- `summary.completed`
- `gate.started`
- `gate.verdict`
- `agent.spawn.requested`
- `agent.spawned`
- `agent.delivery.target`
- `agent.killed`
- `agent.ended`
- `agent.llm.input.summary`
- `agent.llm.output.summary`
- `agent.tool.started`
- `agent.tool.finished`
- `agent.model.started`
- `agent.model.ended`
- `agent.session.started`
- `agent.session.ended`
- `agent.transcript`
- `agent.progress`
- `cost.update`
- `rate_limit.detected`
- `observability.degraded`
- `observability.restored`
- `error.escalation`
- `approval.requested`
- `approval.resolved`
- `budget.warning`
- `budget.exceeded`

`summary_type` is the canonical discriminator for post-run summary flows: `pipeline`, `pipeline_review`, `case_study`, and `project_summary`. Session-backed summary flows preserve `gateway_label` as the operator-facing correlation key. For `summary_type: pipeline`, the canonical live payload also preserves `exit_code`, `exit_reason`, `summary_json_path`, `pipeline_summary_path`, and `latest_json_path` so the stream joins directly to the persisted run-summary bundle.

`system.io_warning` is a point-in-time warning event for non-critical local I/O loss such as model-policy audit append failure. It is emitted directly to the Redis telemetry stream when possible and must not introduce degraded/restored state for stateless file append helpers.

### 3.2 Plugin-owned event type

Plugin-specific telemetry uses one canonical extension event name:

- `plugin.event`

`plugin.event` is the only accepted event type for plugin-owned lifecycle, suite, tool, and domain-specific telemetry. The plugin namespace lives in payload fields (`plugin_id`, `plugin_event`, and `details`), not in the top-level event type. Core does not add a new top-level event type when a future gate or plugin such as Pentester is added.

### 3.3 Shared event types plugins may emit

Plugins may also emit these shared event names when the event belongs to the platform lifecycle/health contract rather than plugin-specific details:

- `agent.spawn.requested`
- `agent.spawned`
- `agent.delivery.target`
- `agent.killed`
- `agent.ended`
- `agent.llm.input.summary`
- `agent.llm.output.summary`
- `agent.tool.started`
- `agent.tool.finished`
- `agent.model.started`
- `agent.model.ended`
- `agent.session.started`
- `agent.session.ended`
- `agent.transcript`
- `rate_limit.detected`
- `observability.degraded`
- `observability.restored`

So the Buster telemetry surface ClawDeck must handle is one plugin extension event (`plugin.event`) plus reused shared platform events.

---

## 4. Canonical enums

### 4.1 Module status

Canonical module statuses are:
- `PENDING`
- `IN_PROGRESS`
- `READY_FOR_TESTING`
- `TESTING`
- `PASS`
- `FAIL`
- `BLOCKED`

### 4.2 Transcript line kind

Canonical transcript line kinds are:
- `assistant`
- `assistant_delta`
- `tool_call`
- `tool_result`
- `system_event`
- `lifecycle`
- `thinking`
- `info`

### 4.3 Buster task outcome

Canonical Buster task outcomes are:
- `PASS`
- `FAIL`
- `TIMEOUT`
- `RATE_LIMITED`

### 4.4 Buster recommendation

Canonical Buster recommendations are:
- `SPAWN`
- `NO_SPAWN`

### 4.5 Buster suite status

Canonical per-suite statuses are:
- `PASS`
- `FAIL`
- `SKIP`
- `ERROR`

---

## 5. Canonical event envelope

### 5.1 Required envelope fields

Every telemetry event must have:

```json
{
  "v": 1,
  "type": "module.started",
  "ts": "2026-04-08T14:00:00.000Z",
  "project": "clawdeck",
  "run_id": "run-1775632548051-am2s",
  "seq": 42
}
```

Required fields:
- `v`
- `type`
- `ts`
- `project`
- `run_id`
- `seq`

### 5.2 Provenance fields

For new or migrated emitters, these fields should be included whenever known:
- `source` — `pipeline` or `buster`
- `emitter` — concrete component name, for example `nova/pipeline/services/telemetry` or `buster/pipeline/services/telemetry`
- `module_id`
- `gate_id`
- `gate_type`
- `phase`
- `attempt`
- `dispatch_id`
- `agent_type`
- `label`
- `gateway_label`
- `session_key`
- `model`
- `runtime`

### 5.3 Joinability and identity authority

Telemetry join keys are owned by typed runtime context, not display text.

Required boundary:
- `run_id` and `project` identify the run-scoped stream and durable artifact bundle.
- `module_id` identifies module-owned work only.
- `gate_id` / `gate_type` identify gate-owned work; gate-owned evidence must not invent a `module_id` fallback.
- `attempt`, `dispatch_id`, `session_key`, and `gateway_label` are emitted only when the runtime already knows those values from dispatch/session ownership.
- `label` is diagnostic/operator display only and must not be used as a canonical join key.
- monitor lookup keys, log labels, Discord display fields, and generic session labels must not be promoted into `session_key`, `module_id`, `gate_id`, `dispatch_id`, or `gateway_label`.

Artifact fallback rule:
- fallback/degraded artifacts should preserve known join keys from the same typed context/data as canonical Redis events
- fallback/degraded artifacts remain diagnostic when Redis is unavailable; they may carry `artifact_fallback: true` and `seq: null`, and must not pretend to be Redis-ordered canonical stream events

Rule:
- the envelope is intentionally flat: event-specific fields live at the top level beside `v`, `type`, `ts`, `project`, `run_id`, and `seq`
- do not wrap canonical payloads in legacy nested `data` / `refs` objects unless a future version explicitly migrates the contract
- `source` and `emitter` are strings, not object-shaped provenance wrappers
- unknown extra fields are allowed
- consumers must ignore unknown fields
- new emitters should add provenance, not remove it

---

## 6. Ordering, dedupe, and delivery semantics

### 6.1 `seq` means this

`seq` is the canonical semantic order key for a run.

Locked meaning:
- `seq` is monotonic within a run
- `seq` is unique within a run
- `seq` defines display/replay order inside ClawDeck
- consumers should not infer meaning from Redis message IDs

### 6.2 Gap policy

`seq` is **not required to be gapless**.

Reason:
- best-effort telemetry should not force hard failures just to preserve perfect numbering
- losing an event is bad, but blocking the pipeline is worse

So:
- monotonic: **required**
- unique per run: **required**
- gapless: **not required**

### 6.3 Restart policy

Emitter restart must not reuse prior sequence numbers for the same run.

Required behavior:
- after restart, the emitter must continue from the next sequence number
- reusing `seq` values within the same `run_id` is a contract violation

Recommended implementation:
- use a shared Redis-backed counter or equivalent persisted allocator per run

### 6.4 Consumer dedupe key

Canonical semantic dedupe key:
- `(project, run_id, seq)`

Redis message ID may still be stored for transport bookkeeping and consumer-group acking, but it is **not** the semantic event identity.

### 6.5 Delivery semantics

Producer-side semantics:
- emission to Redis is best-effort and non-blocking
- telemetry failure must not crash the orchestrator

Consumer-side semantics after Redis persistence:
- treat delivery as at-least-once
- duplicates are not intended, but consumers must tolerate them

In plain terms:
- emitters should try to publish once
- consumers should assume they may see the same event more than once
- dedupe by `(project, run_id, seq)`

---

## 7. Redis stream contract

### 7.0 Producer / spine / sink ownership

Telemetry has three separate ownership roles:

- **Core telemetry spine**: Nova builds canonical events, appends every event to disk audit artifacts, and dispatches to registry-owned telemetry sinks.
- **Telemetry sink plugins**: registry-owned sinks deliver telemetry to external transports. The built-in Redis sink receives the full event firehose for ClawDeck; the built-in Discord sink sends only explicitly presented operator payloads.
- **External producers**: Buster runs in another pod and may publish core-compatible telemetry directly to the canonical run stream. Plugin-owned details use `plugin.event`; shared lifecycle/health details use the core event names. That is producer-side telemetry, not sink ownership.

Disk audit logging is core-owned evidence, not a plugin sink. Redis and Discord delivery are sink plugins. If a sink is missing or fails, the system records `observability.degraded`; it must not silently reroute through a legacy direct fallback.

### 7.1 Canonical stream identity

Canonical event identity is run-scoped, not module-scoped.

Canonical rule:
- `run_id` identifies the run
- `module_id` identifies the module context when applicable
- stream naming should not replace `run_id`

### 7.2 Canonical stream key

Preferred canonical stream key:

```text
pipeline:telemetry:<project>:<run_id>
```

Reason:
- one run-scoped stream matches the canonical meaning of `seq`
- ClawDeck can consume one ordered run timeline directly

### 7.3 Migration compatibility

During migration, ClawDeck may ingest legacy compatibility shapes that predate the canonical shared run stream.

Compatibility-only behavior still accepted by ClawDeck during migration:
- legacy module-scoped Buster stream keys
- nested Buster envelopes shaped like `{ type, seq, ts, project, module, run_id, data: { ...payload } }`

Those legacy shapes are consumer-compatibility only, not part of the live producer contract.

Locked end-state rule:
- `pipeline:telemetry:<project>:<run_id>` is the single canonical live stream
- module identity belongs in payload as `module_id`
- run identity belongs in `run_id`
- legacy Buster-only stream families are not part of the live producer contract

### 7.4 Redis payload shape

Each XADD entry stores one JSON event under the `data` field.

Example:

```json
{
  "data": "{\"v\":1,\"type\":\"module.started\",\"project\":\"clawdeck\",\"run_id\":\"run-123\",\"seq\":1,\"ts\":\"2026-04-08T14:00:00.000Z\"}"
}
```

One XADD entry = one telemetry event.

### 7.5 Retention and replay authority

Redis is a capped live/consumer window, not the durable audit log.

Canonical producers use one shared approximate trim window (`MAXLEN ~10000`) for `pipeline:telemetry:<project>:<run_id>`. The cap keeps dashboard/consumer memory bounded and means old entries can disappear from Redis during long runs. Consumers may use Redis for live delivery and recent replay, but must not treat XRANGE as complete historical evidence after trimming.

Run-scoped `pipeline.jsonl` is the durable audit trail for replay and post-mortem reconstruction. When Redis emission succeeds, the Redis-owned `seq` is mirrored into the run-scoped `pipeline.jsonl` event so operators can reconstruct the ordered stream even after Redis trims earlier entries. When Redis is unavailable or weak identity prevents canonical stream emission, durable artifacts may contain explicit `observability.degraded` / `artifact_fallback` evidence with `seq: null`; that is intentionally diagnostic and must not pretend to be part of the Redis-ordered sequence.

---

## 8. Event-specific rules

### 8.1 `module.status_changed`

Rules:
- `new_status` must use the canonical module status enum
- `old_status` should be present when known
- `reason` is required for meaningful `FAIL` and `BLOCKED` transitions
- `module_id` is required

### 8.2 `plugin.event`

Rules:
- `plugin_id` identifies the owning plugin namespace, for example `buster`.
- `plugin_event` identifies the plugin-owned action within that namespace, for example `task_completed`, `decision`, or `session_monitor`.
- platform correlation fields such as `module_id`, `gate_id`, `attempt`, `dispatch_id`, and `session_key` stay top-level when known.
- plugin-specific fields must be carried in `details`; arbitrary plugin fields are not allowed at the top level.
- Buster task completion keeps `outcome`, `reason`, `duration_seconds`, and `spawned_subagent` either as generic top-level status metadata where allowed or inside `details`; suite summary counts must be internally consistent.
- Buster decisions use `plugin_event: "decision"`; `details.recommendation` must be `SPAWN` or `NO_SPAWN`, and `details.reason` must be explicit.
- Buster session-monitor heartbeats use `plugin_event: "session_monitor"`; details should include `elapsed_seconds`, `acp_state`, `transcript_events`, and `rate_limited`.

---

## 9. Transcript contract

### 9.1 Allowed transcript kinds

`agent.transcript.line_kind` must use the canonical transcript enum.

### 9.2 Thinking policy

`thinking` may be emitted.

Best-practice rule:
- emit it when it materially improves observability
- do not spam token-level fragments if they overwhelm the feed
- prefer coherent chunks over ultra-high-frequency noise

### 9.3 Batching policy

If transcript emission must be rate-limited:
- batch multiple raw transcript lines into one `agent.transcript` event
- use `line_kind: "info"` for synthetic/batched catch-all entries when needed
- include `line_count` when batching occurred

### 9.4 Missing transcript path

Locked behavior:
- missing transcript path is not a spawn failure by itself
- missing transcript path is retriable
- telemetry should continue even if transcript attachment is temporarily unavailable

### 9.5 Gate-session correlation

When `agent.transcript` or `agent.progress` belongs to gate-owned live work and Nova already knows that identity, the payload should preserve canonical `gate_type` alongside `gate_id`.

When that same gate-owned live work is already tied to a dispatch, the payload should also preserve `dispatch_id` so transcript, progress, rate-limit, observability, and Discord surfaces stay directly joinable.

### 9.6 Gate outcome correlation

When `gate.verdict` or gate-scoped `retry.exhausted` belongs to gate-owned work and Nova already knows that identity, the payload should preserve canonical `gate_type` alongside `gate_id`.

When that same gate-owned verdict or exhaustion path is already tied to a dispatch, the payload should also preserve `dispatch_id` so authoritative gate outcomes stay directly joinable with surrounding rate-limit, Discord, and replay surfaces.

---

## 10. Rate-limit contract

`rate_limit.detected` is the canonical structured signal for actionable rate limits.

Rules:
- it should be emitted when the runtime detects a real rate-limit condition that affects scheduling, monitoring, or progress
- a rate limit is not equivalent to a kill
- sleep-and-retry behavior should preserve the active run/session state when possible

Minimum useful fields:
- `module_id` when applicable
- `agent_type` when applicable
- `retry_after_seconds` when known

When the paused work is gate-owned and Nova already knows that identity, the payload should also preserve canonical `gate_type` alongside `gate_id`.

When the paused work is already tied to a dispatch, the payload should also preserve `dispatch_id` so the pause remains joinable with the surrounding gate lifecycle, transcript/progress, observability, and Discord audit surfaces.

If more detail is available, emit it as extra fields rather than hiding it.

---

## 11. Cost contract

### 11.1 Canonical `cost.update` meaning

`cost.update` represents a cumulative observability checkpoint, not billing perfection.

Current canonical ClawDeck-facing shape:
- `module_id`
- `agent_type`
- `label`
- `cost_usd`
- `total_cost_usd`
- `input_tokens`
- `output_tokens`

Semantic meaning:
- `cost_usd` = delta estimate for this checkpoint
- `total_cost_usd` = cumulative run estimate after applying this checkpoint

### 11.2 Availability policy

If exact usage is unavailable:
- do not fabricate misleading precision
- `input_tokens` and `output_tokens` may be null
- if no meaningful cost estimate is available, prefer omitting `cost.update` over emitting fake zeros
- summary artifacts may explicitly mark cost as unavailable

### 11.3 Emission timing

Emit `cost.update` when available at these boundaries:
- agent/session completion
- module completion
- gate completion
- final run summary

---

## 12. Log artifact contract

### 12.1 Global pipeline log directory

Canonical global telemetry-adjacent path:

```text
.swarm/logs/pipeline/
```

Expected files:
- `pipeline.jsonl`
- `discord.jsonl`
- `nova-injections.jsonl`
- `buster-telemetry-fallback.jsonl` when Buster Redis telemetry fallback is needed
- `latest.json`
- `summary.json`
- `model-policy.jsonl` when model-policy logging is enabled

Redis audit artifacts are canonicalized under the sibling global directory `.swarm/logs/redis/`, not under `.swarm/logs/pipeline/`.

### 12.2 Run-scoped pipeline log directory

Canonical run-scoped path:

```text
.swarm/logs/pipeline/runs/<run_id>/
```

Expected run artifacts:
- `pipeline.jsonl`
- `discord.jsonl`
- `nova-injections.jsonl`
- `buster-telemetry-fallback.jsonl` when Buster Redis telemetry fallback is needed
- `summary.json`
- `config-validation.json`
- `blueprint-sync.json`

Additional files are allowed.

Redis audit mirrors for a run are canonicalized under:

```text
.swarm/logs/pipeline/runs/<run_id>/redis/
```

Expected Redis audit files when Redis logging is enabled:
- `redis-exchanges.jsonl`
- `redis-ops.jsonl`

### 12.3 `pipeline.jsonl`

Purpose:
- structured operational log for pipeline execution

Required core fields per line:
- `ts`
- `level`
- `run_id`
- `msg`

Strongly recommended when applicable:
- `module`
- `phase`

### 12.4 `discord.jsonl`

Purpose:
- audit trail of outbound Discord-visible pipeline/buster notifications

Required core fields per line:
- `ts`
- `level`
- `title`
- `description`
- `fields`
- `run_id`

Rule:
- run-scoped Discord logs must always include `run_id`
- global aggregate logs should also include `run_id`; omission is drift and should be corrected

### 12.5 Redis audit artifacts

Purpose:
- audit trail of Redis dispatch/completion behavior and related integration operations

Canonical paths:

```text
.swarm/logs/redis/redis-exchanges.jsonl
.swarm/logs/redis/redis-ops.jsonl
.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl
.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl
```

Required core fields per line:
- `ts`
- `component`
- `op`

Strongly recommended when applicable:
- `run_id`
- `stream`
- `module`
- `entry`
- `found`

### 12.6 `latest.json`

Purpose:
- pointer to the newest run directory

Required fields:
- `run_id`
- `path`
- `started_at`

When known, `latest.json` should also preserve the canonical `telemetry_stream_key` plus the run-scoped replay bundle fields `pipeline_jsonl`, `discord_jsonl`, `nova_injections_jsonl`, `buster_telemetry_fallback_jsonl`, `redis_exchanges_jsonl`, `redis_ops_jsonl`, and `summary_json` for the same run.

### 12.7 `summary.json`

Purpose:
- latest run summary at the global level
- definitive run summary at the run-scoped level

Summary should include, when known:
- run identity
- start/end timestamps
- exit code and reason
- module/gate totals
- duration
- usage/cost summary
- artifact pointers

When the summary service owns the write, it should also preserve the canonical `telemetry_stream_key` and a stable `.artifacts` bundle for the same run-scoped `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, `buster-telemetry-fallback.jsonl`, `redis/redis-exchanges.jsonl`, `redis/redis-ops.jsonl`, `summary.json`, plus the top-level `.swarm/logs/pipeline/summary.json` and `.swarm/logs/pipeline/latest.json` pointers.

---

## 13. Module artifact contract

Canonical per-module artifact path:

```text
.swarm/logs/modules/<module_id>/
```

Observed artifact families that should remain path-stable unless explicitly versioned:
- `forge-prompt-attempt-<n>.md`
- `forge-transcript-attempt-<n>.jsonl`
- `buster-prompt-attempt-<n>.md`
- `buster-pipeline.jsonl`

Rule:
- artifact naming may grow, but should not silently churn

---

## 14. Compatibility notes captured from current drift

Current drift found during audit:

1. **Buster transport compatibility**
   - compatibility runtime side: older Buster-only flat-envelope stream variants may still exist in historical compatibility contexts
   - ClawDeck consumer side: accepts those flat compatibility envelopes plus legacy nested/module-scoped envelopes during migration
   - contract decision: `pipeline:telemetry:<project>:<run_id>` is the canonical live stream, module belongs in payload

2. **Shared ordering risk**
   - ClawDeck event storage currently dedupes by `seq` within `(project, run_id)`
   - therefore reused sequence numbers inside the same run would silently collide
   - contract decision: `seq` must be unique per run

3. **Cost-shape drift across docs/code**
   - historical docs and current ClawDeck typings are not identical
   - contract decision: ClawDeck-facing `cost.update` shape in shared types is the current canonical surface unless explicitly versioned

---

## 15. Implementation rules

For any telemetry change:

1. update runtime emitters
2. update ClawDeck shared types if the external surface changed
3. update ClawDeck consumer logic if parsing assumptions changed
4. update tests on both sides
5. update this contract if behavior changed materially
6. do not ship silent telemetry drift
