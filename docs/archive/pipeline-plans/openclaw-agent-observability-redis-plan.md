# OpenClaw Agent Observability Redis Architecture Plan

Status: Phase 0 contracts/docs implemented; Phase 1 standalone OpenClaw plugin implemented observe-only/disabled-by-default; Phase 2 kubeclaw ingester implemented disabled-by-default; Phase 3 first-class telemetry schemas implemented; Phase 4 parallel-run evidence tooling and ClawDeck rendering implemented; Phase 5 Forge completion replacement implemented; Phase 6 architectural override accepted — exclusive Redis hook lifecycle authority, no legacy observability fallbacks
Owner: Nova / maintainers
Related context: `docs/pipeline/implementation-map/reviews/openclaw-hook-telemetry-comparison.md`, `docs/pipeline/OI-42-event-driven-completion-refactor-plan.md`, `docs/telemetry-event-schema.md`

## Purpose

Add a pipeline-owned OpenClaw plugin that observes native OpenClaw agent runtime hooks and feeds them into kubeclaw-main's existing telemetry spine through Redis.

The plugin is an edge adapter. It does not become the consumer framework and it does not make lifecycle decisions directly. It observes OpenClaw runtime facts, normalizes them, applies only minimal API-key masking, and writes them to Redis observability streams. ClawDeck may consume those raw/debug streams directly, while a kubeclaw ingester consumes only the canonical-control subset and maps it into the existing telemetry spine.

## Non-goals

- Do not install or depend on Opik.
- Do not make raw OpenClaw hook object shapes the public consumer contract; consumers should see kubeclaw-normalized events.
- Do not bypass the existing telemetry spine for canonical pipeline lifecycle/status events.
- Do allow ClawDeck/debug tooling to consume raw agent-observability Redis streams directly instead of forcing high-volume payloads through the telemetry spine and back into Redis.
- Do not replace Forge completion behavior in the first cutover.
- Do not move all agent lifecycle control into the plugin yet.

## New-session implementation handoff

If a fresh session starts this work, do this in order:

1. Re-read this plan, `docs/pipeline/implementation-map/reviews/openclaw-hook-telemetry-comparison.md`, and `docs/telemetry-event-schema.md` before coding.
2. Phase 0, Phase 1, Phase 2, Phase 3, Phase 4, and Phase 5 are complete. Phase 6 is an approved architectural cutover: remove legacy observability authority/fallback paths instead of preserving selective compatibility.
3. Phase 0 added the shared TypeScript contract, runtime validator, stream-routing helpers, mapping table, and contract tests first.
4. Suggested locations:
   - read-side shared contract/validator/mapping: `skills/common/pipeline/agent-observability/`, exposed to role code through `skills/{nova,buster}/pipeline/agent-observability/` shims and flattened to `/app/skills/pipeline/agent-observability/` in images
   - self-contained OpenClaw plugin package: `plugins/openclaw-agent-observer/`, built into `/app/dist/extensions/kubeclaw-agent-observer/` and discovered as a bundled OpenClaw plugin
   - kubeclaw ingester integration: `skills/nova/pipeline/services/agent-observability-ingester/` consuming the role-local read-side contract shim
   - verification: `tests/verification/contracts/` for contract surface checks; add focused fake-Redis smoke tests with the phase that introduces Redis writes/reads
5. Because the repository is not globally TypeScript yet, add minimal package-local TypeScript build/test config where needed. Do not start a broad repo-wide TS migration as part of this feature.
6. Do not implement gzip, ClawDeck consumer groups, Redis ACL rollout, or broad prompt redaction unless a later phase explicitly asks for them. Phase 6 scope is limited to exclusive Redis hook lifecycle authority and removal of legacy lifecycle-observability fallbacks.

## Architecture

```text
OpenClaw runtime hooks
  -> pipeline-owned, self-contained OpenClaw plugin
      - loaded from /app/dist/extensions/kubeclaw-agent-observer
      - api.on(...) registrations
      - plugin-local hook normalization and Redis stream-writing code
      - preserve prompt/response/tool/debug context
      - mask only basic API-key/token patterns
      - bounded Redis XADD to agent-observability streams
  -> Redis raw/debug observability streams
      - pipeline:agent-observability:control:v1
      - pipeline:agent-observability:payload:v1
  -> direct debug consumers
      - ClawDeck reads raw/debug streams directly for full agent visibility
  -> kubeclaw agent-observability ingester
      - XREADGROUP/XACK control records and selected summaries
      - validate ingress event contract
      - map to canonical telemetry event types
      - emitEvent(ctx, type, payload, options)
  -> existing telemetry spine for canonical pipeline events
      - payload schema validation
      - telemetry.sink dispatch through kubeclaw registry
      - durable pipeline.jsonl append
      - observability degraded/restored reporting
  -> canonical telemetry sinks / consumers
      - Redis canonical telemetry stream for ClawDeck timeline/status
      - Discord filtered notifications
      - filesystem JSONL audit
      - future OTEL/webhook/database sinks
```

## Component boundaries

### 1. OpenClaw agent observability plugin

A native OpenClaw plugin, likely packaged as `@kubeclaw/openclaw-agent-observer`.

Implementation language: TypeScript-first. The new observer package, ingress envelope types, validators, Redis writer, and tests should be authored in TypeScript now, then compiled to the JavaScript module format required by the current runtime. Do not add a parallel JavaScript implementation that would need to be migrated later.

Responsibilities:

- Register selected OpenClaw hooks with `api.on(...)`.
- Run only lightweight, bounded work inside hook handlers.
- Normalize hook-specific payloads into a stable kubeclaw ingress event envelope.
- Preserve full LLM prompt/history/response content for debugging.
- Preserve tool params/results and agent final messages unless they match the minimal API-key masking rules.
- Own a Redis client lifecycle through plugin startup/service lifecycle.
- Route lifecycle/control events to a control stream and high-volume LLM/tool payloads to a payload stream.
- Degrade safely when Redis is unavailable: log once per class of failure and drop or bounded-spool events according to config.

Initial hooks:

| OpenClaw hook | Ingress event | Why |
| --- | --- | --- |
| `agent_end` | `openclaw.agent.ended` | Deterministic agent finalization; later replaces Forge completion self-reporting. |
| `llm_input` | `openclaw.llm.input` | Full raw prompt/system/history/provider input visibility for local debugging. |
| `llm_output` | `openclaw.llm.output` | Full raw assistant/provider output visibility for local debugging. |
| `subagent_spawning` | `openclaw.subagent.spawning` | Spawn intent and queue/accept latency. |
| `subagent_spawned` | `openclaw.subagent.spawned` | Accepted child session identity. |
| `subagent_delivery_target` | `openclaw.subagent.delivery_target` | Native delivery/routing metadata: requester origin, child run ID, spawn mode, and completion-message expectation. |
| `subagent_ended` | `openclaw.subagent.ended` | Runtime finalization distinct from explicit kill. |
| `before_tool_call` | `openclaw.tool.started` | Tool span start and full params for debugging. |
| `after_tool_call` | `openclaw.tool.finished` | Tool span terminal outcome, duration, error, and result context. |
| `model_call_started` | `openclaw.model.started` | Provider/model call metadata, useful for correlation with `llm_input`. |
| `model_call_ended` | `openclaw.model.ended` | Provider/model terminal metadata, outcome, duration, usage metadata if present. |
| diagnostic `model.usage` | `openclaw.model.usage` | Native usage/cost/context evidence from OpenClaw diagnostics; preferred source for `cost.update` replacement work. |
| `session_start` | `openclaw.session.started` | Session lifecycle correlation. |
| `session_end` | `openclaw.session.ended` | Session lifecycle terminal evidence. |

Optional later hooks:

| OpenClaw hook | Why deferred |
| --- | --- |
| `tool_result_persist` | Useful for runtime-level transcript sanitization, but it mutates persistence and should be introduced separately. |
| `before_agent_finalize` | Control hook, not pure observability. Keep out of the first observer-only plugin. |
| `message_received` / `message_sent` | Useful for channel correlation, but not required for Forge lifecycle replacement. |
| `gateway_start` / `gateway_stop` / `cron_changed` | Useful for platform health after core agent lifecycle events are stable. |

### 2. Redis observability streams

Canonical stream keys for the first implementation:

```text
pipeline:agent-observability:control:v1  # compact lifecycle/control/correlation events
pipeline:agent-observability:payload:v1  # full raw LLM/tool/final-message payloads
```

This split is intentional. ClawDeck can read both streams directly, but the telemetry spine only needs the control stream and selected summaries for canonical pipeline state. This avoids `plugin -> Redis -> spine -> Redis -> ClawDeck` for high-volume raw debugging payloads.

Redis stream field shape:

```text
data = JSON.stringify(AgentObservabilityIngressEventV1)
```

Use a single JSON field to avoid field-level schema drift and to match existing stream patterns where the actual event body is a versioned JSON document. Both streams use the same event envelope; the stream only declares delivery/retention policy.

Ingress event envelope:

```json
{
  "v": 1,
  "type": "openclaw.llm.input",
  "source": "openclaw.plugin.agent-observer",
  "ts": "2026-05-14T06:57:00.000Z",
  "identity": {
    "run_id": "...",
    "session_key": "...",
    "session_id": "...",
    "gateway_label": "...",
    "dispatch_id": "...",
    "agent_id": "...",
    "agent_type": "forge",
    "module_id": "...",
    "gate_id": "...",
    "tool_call_id": "...",
    "model_call_id": "..."
  },
  "payload": {
    "hook": "llm_input",
    "prompt": "raw prompt text...",
    "system_prompt": "raw system prompt text...",
    "history_messages": []
  },
  "masking": {
    "profile": "kubeclaw-agent-observer-v1-minimal-api-key-mask",
    "content": "full",
    "masked": ["basic_api_key_pattern"]
  }
}
```

Identity fields are best-effort at the plugin boundary. The ingester is responsible for reconciling them with active pipeline state before assigning canonical module/gate/run authority.

### 3. Kubeclaw agent-observability ingester

A kubeclaw module/process that consumes the control stream and selected summaries, then feeds the telemetry spine. It is not required to consume every raw payload event.

Implementation language: TypeScript-first for new ingester code and shared agent-observability contracts, with a thin JavaScript runtime/interop boundary only where the existing kubeclaw telemetry spine requires it during migration.

Responsibilities:

- Create Redis consumer group, for example:
  - stream: `pipeline:agent-observability:control:v1`
  - group: `kubeclaw-agent-observability-v1`
  - consumer: `<pod-or-run-specific-id>`
- Read with `XREADGROUP`.
- Validate `AgentObservabilityIngressEventV1`.
- Reject or dead-letter malformed records.
- Map OpenClaw ingress event types to canonical telemetry event types.
- Preserve full debug context only for event families intentionally promoted into canonical telemetry; otherwise leave raw LLM/tool payloads in the payload stream for direct ClawDeck/debug consumption.
- Call `emitEvent(ctx, eventType, payload, options)`.
- Ack only after successful validation and either successful telemetry emission or classified non-authoritative drop.
- Record degraded/restored observability for Redis read failures, invalid events, mapping failures, and telemetry spine failures.

Initial mapping:

| Ingress event | Canonical telemetry event |
| --- | --- |
| `openclaw.agent.ended` | `agent.ended` |
| `openclaw.llm.input` | no canonical event by default; optional `agent.llm.input.summary` if promoted |
| `openclaw.llm.output` | no canonical event by default; optional `agent.llm.output.summary` if promoted |
| `openclaw.subagent.spawning` | `agent.spawn.requested` or temporary `plugin.event` |
| `openclaw.subagent.spawned` | existing `agent.spawned` where schema-compatible; otherwise temporary `plugin.event` |
| `openclaw.subagent.delivery_target` | temporary `plugin.event` until a first-class subagent routing schema is approved |
| `openclaw.subagent.ended` | `agent.ended` with `agent_scope: subagent` or `agent.subagent.ended` |
| `openclaw.tool.started` | `agent.tool.started` |
| `openclaw.tool.finished` | `agent.tool.finished` |
| `openclaw.model.started` | `agent.model.started` |
| `openclaw.model.ended` | `agent.model.ended` |
| `openclaw.model.usage` | `cost.update` |
| `openclaw.session.started` | `agent.session.started` or temporary `plugin.event` |
| `openclaw.session.ended` | `agent.session.ended` or temporary `plugin.event` |

For the first separate implementation, it is acceptable to emit `plugin.event` for any event whose final schema is not yet approved. The replacement phase should promote stable events into first-class telemetry schema entries.

### 4. Existing telemetry spine

The ingester must enter through the existing spine:

```text
emitEvent(ctx, eventType, payload, options)
  -> assertTelemetryEventPayload(...)
  -> dispatchTelemetrySinks(...)
  -> appendStructuredEvent(...)
```

This preserves:

- canonical schema validation;
- durable `pipeline.jsonl` output;
- Redis telemetry stream output for ClawDeck;
- Discord sink filtering/presentation;
- observability degraded/restored reporting;
- future telemetry sink extensibility.

The OpenClaw plugin should not write directly to `pipeline:telemetry:<project>:<runId>` except as an explicit emergency/debug mode.

Agent-observability event families promoted into the telemetry spine need an explicit masking mode so the existing broad telemetry sanitizer does not unexpectedly summarize approved debug fields. High-volume raw prompt, assistant, history, tool params, and tool results should usually remain in `pipeline:agent-observability:payload:v1` and be consumed directly by ClawDeck/debug tooling instead of being re-emitted through the canonical Redis telemetry sink.

## Consumer model

There are two consumer classes.

### Canonical consumers

Canonical consumers remain kubeclaw telemetry sinks, not OpenClaw hook handlers.

Examples:

- ClawDeck consumes the existing final telemetry stream for pipeline timeline/status.
- Discord notification behavior stays in the Discord telemetry sink and only sends events with explicit presentation metadata or approved filters.
- Filesystem logging stays in the telemetry spine's durable JSONL append.
- Future pipeline/status consumers register as telemetry sinks and filter by `event.type`, identity fields, or payload fields.

Canonical consumer filters should operate on canonical telemetry events, not raw hook objects.

### Raw/debug consumers

Raw/debug consumers may read the agent-observability Redis streams directly.

Examples:

- ClawDeck reads `pipeline:agent-observability:control:v1` and `pipeline:agent-observability:payload:v1` for full local debugging visibility.
- Future local debug tools can read the same streams without requiring a telemetry-spine roundtrip.

Raw/debug consumers must treat these streams as live debug windows, not durable archives. ClawDeck must tail these streams with per-client last seen Redis stream IDs. It must not use the ingester's consumer group and must not create shared dashboard consumer groups for normal live viewing, because dashboard consumption is fan-out, not work-queue processing.

## Security and content visibility model

### Initial Redis posture

The first Redis plan assumes the existing Redis transport model: authenticated/shared Redis access through `REDIS_USERNAME` / `REDIS_PASSWORD` where configured and in-cluster network isolation where deployed.

Important limitation: with a shared Redis credential, Redis consumer groups coordinate delivery but do not make the agent-observability streams private. Any actor with broad Redis credentials could read those streams.

For this private local system, that risk is accepted for the first implementation because full debugging visibility is more valuable than aggressive redaction. The plugin still masks obvious API-key/token patterns before `XADD`, but it does not drop or summarize debugging context. ClawDeck/direct debug consumers therefore see full local debugging payloads from the raw streams.

### Future hardening

If we need stronger stream-level isolation, add Redis ACL users:

| Actor | Allowed commands | Allowed keys |
| --- | --- | --- |
| OpenClaw plugin writer | `XADD`, `PING` | `pipeline:agent-observability:*` |
| kubeclaw ingester | `XGROUP`, `XREADGROUP`, `XACK`, `XAUTOCLAIM`, `XTRIM`, `PING` | `pipeline:agent-observability:control:*` plus selected summary streams |
| ClawDeck raw/debug reader | `XREAD`, `XRANGE`, `XREVRANGE`, `PING` | `pipeline:agent-observability:*` |
| ClawDeck canonical telemetry reader | read final telemetry streams only | `pipeline:telemetry:*` |

Do not depend on ACLs for the first functional implementation unless infrastructure is updated in the same phase.

### Minimal masking rules

Initial plugin-boundary masking:

- Preserve raw prompt, system prompt, history messages, assistant responses, final messages, tool params, and tool results.
- Do not summarize or drop content solely because it is prompt-like, assistant-like, transcript-like, or large.
- Apply only basic API-key/token pattern masking, for example obvious `sk-...`, `xoxb-...`, bearer-token, and `api_key=...` style strings.
- Keep the matcher simple and testable; do not introduce a large secret-classification engine in Phase 0 or Phase 1.
- Include `masking.profile`, `masking.content: "full"`, and a small list of applied mask classes.

Kubeclaw telemetry masking must not unexpectedly rewrite any agent-observability event family that is explicitly promoted into the telemetry spine. Most full-content payloads should remain outside the spine on the raw/debug payload stream.

## Redis load, retention, and backpressure

Full LLM visibility can be large. Redis must be protected from unbounded growth and from blocking other pipeline uses such as task ingress, completion evidence, and ClawDeck telemetry.

### Stream partitioning

Split control and high-volume payloads immediately:

```text
pipeline:agent-observability:control:v1  # lifecycle/model/session/tool span control and correlation
pipeline:agent-observability:payload:v1  # llm_input/llm_output/tool params/tool result/full messages
```

This is the main protection against unnecessary double-write overhead. ClawDeck reads the payload stream directly for raw debugging. The ingester reads the control stream and only selected payload summaries when a canonical telemetry event is needed.

If later evidence shows the payload stream is still too broad, split it further without changing the event envelope:

```text
pipeline:agent-observability:payload:llm:v1
pipeline:agent-observability:payload:tool:v1
```

### Retention caps

Use approximate stream trimming on every plugin `XADD`:

```text
XADD <stream> MAXLEN ~ <configured_maxlen> * data <json>
```

Suggested first defaults:

| Stream | Default maxlen | Rationale |
| --- | ---: | --- |
| control stream | 10000 | Compact lifecycle/control events; useful for canonical state and correlation. |
| payload stream | 1000-3000 | Full prompts/responses/tool results are large; keep a short live debug buffer. |
| dead-letter stream | 1000 | Debug invalid records without unbounded growth. |

The canonical durable audit path remains `pipeline.jsonl` for telemetry-spine events. Raw payload streams are live debug windows. If durable raw LLM/tool archives become required, add a dedicated file/blob sink instead of relying on Redis as the infinite archive.

### Payload size handling

Do not drop context for normal debugging. Instead:

- Preserve full content by default.
- Do not gzip payload-stream events in Phase 1. Compression/decompression adds direct Node.js CPU overhead and latency, and should only be added after real Redis/Kubernetes memory metrics prove it is needed.
- Reserve future `encoding: "gzip+base64"` handling for a later measured optimization, not the first implementation.
- Record event byte size in metadata.
- Add metrics/counters for oversized events, queue drops, and Redis write failures.

Hard maximum payload size exists only as a safety fuse, not as normal behavior. Phase 1 uses a default hard limit of 3 MiB per single Redis stream entry. Operator configuration may lower that limit or raise it up to an absolute maximum of 5 MiB; values above 5 MiB must be rejected. If the serialized JSON event exceeds the configured hard limit, do not `XADD` the full payload. Classify the loss as `agent_observability_payload_too_large`, write a degraded observability event if possible, and preserve identity plus size metadata so the dropped payload can be correlated and debugged.

### Plugin backpressure behavior

Plugin hook handlers must not block agent execution for slow observability.

Plugin behavior:

- Use bounded per-process queues before Redis writes, with separate queue budgets for control and payload streams.
- Use short Redis command timeout.
- Drop according to explicit config when queue is full; prefer dropping oldest payload-stream records before lifecycle/control terminal events.
- Never throw from observation hook handlers for delivery failures.
- Prefer at-least-best-effort observation over lifecycle coupling.

### Ingester backpressure behavior

Ingester behavior:

- Use consumer groups for reliable processing of the control stream.
- Reclaim pending records with `XAUTOCLAIM` after a configured idle timeout.
- Dead-letter malformed records to a bounded dead-letter stream, for example `pipeline:agent-observability:deadletter:v1`.
- Trim control/dead-letter streams with approximate `MAXLEN` caps.
- Emit degraded/restored observability when the control backlog grows or processing fails.
- Track lag for the control stream and classify degraded observability when lag crosses a threshold. Track payload stream length/memory pressure separately for ClawDeck/debug visibility.

## Implementation phases

### Phase 0 — Contracts and docs

Status: completed 2026-05-16 in `skills/common/pipeline/agent-observability/` with `tests/verification/contracts/check-agent-observability-contract.mjs`.

- Add `AgentObservabilityIngressEventV1` contract.
- Author the contract as TypeScript types plus runtime validators; generated/compiled JavaScript may be used by existing ESM callers until the broader migration catches up.
- Include `llm_input` and `llm_output` in the initial contract and mapping table.
- Define full-content payload fields for prompts, system prompts, history messages, assistant responses, final messages, tool params, and tool results.
- Define minimal API-key/token masking markers; do not design broad content redaction in this phase.
- Add mapping table from agent-observability event types to canonical telemetry event types.
- Add contract tests for validation, masking markers, full-content preservation, hard payload-size fuse behavior, and mapping.
- Keep all behavior disabled by default or observe-only.

### Phase 1 — Standalone OpenClaw plugin emitting Redis observability streams

Status: completed 2026-05-16 in `plugins/openclaw-agent-observer/` with `tests/verification/contracts/check-openclaw-agent-observer-plugin.mjs`, then production-packaging updated for Phase 6. The plugin registers only observation hooks, stays disabled until explicitly enabled, writes only the split agent-observability Redis streams, applies minimal API-key/token masking, enforces the Phase 0 size fuse, and uses bounded per-stream queues. The plugin is self-contained for production: it carries plugin-local write-side contract/routing/masking/Redis transport code, builds to `dist/index.js`, and is copied into `/app/dist/extensions/kubeclaw-agent-observer/`; pipeline skills consume the read-side contract through `/app/skills/pipeline/agent-observability/` shims. Runtime config is read from OpenClaw plugin config surfaces (`api.pluginConfig`, service `ctx.config`, and per-hook `context.pluginConfig`) with environment variables retained only as compatibility/fallback inputs; hook normalization also consumes the second OpenClaw hook context argument for identity fields such as `sessionKey`, `agentId`, and `runId`.

OpenClaw docs recheck for Phase 1: local `openclaw docs "OpenClaw plugin api.on registerService hooks allowConversationAccess plugin build TypeScript"`, narrower plugin-hook/building-plugin queries, and `openclaw docs "registerService gateway_start gateway_stop plugin-owned service OpenClaw plugin"` were run on 2026-05-16. The docs confirm hook plugins should use `definePluginEntry`, register typed hooks with `api.on(...)`, declare `activation.onStartup` intentionally in `openclaw.plugin.json`, use TypeScript/ESM package metadata, use `api.registerService(service)` for plugin-owned background services, and verify live hook/service registration with `openclaw plugins inspect <plugin-id> --runtime --json`. The plugin hooks page also confirms `llm_input` observes system prompt, prompt, and history, while `llm_output` observes provider output/usage/context budget.

- Create TypeScript OpenClaw plugin package.
- Add `openclaw.plugin.json` with intentional startup activation and `hooks.allowConversationAccess: true` in operator config for LLM/final-message hooks.
- Register initial observation hooks, including `llm_input` and `llm_output`.
- Implement Redis writer with bounded queue, approximate stream trimming, minimal API-key/token masking, and hard payload-size fuse handling.
- Preserve full prompt/response/tool/final-message payloads by default.
- Add plugin smoke tests with fake Redis, including split control/payload routing, full-content LLM payloads, direct ClawDeck-readable payload records, oversized-payload drop metadata, and backpressure cases.
- Do not change pipeline behavior yet.

### Phase 2 — Kubeclaw ingester into telemetry spine

Status: completed 2026-05-16 in `skills/nova/pipeline/services/agent-observability-ingester/` with `tests/verification/contracts/check-agent-observability-ingester.mjs`; runtime wiring added 2026-05-18 through `agent_observability.plugin_control.enabled` and `agent_observability.ingester.enabled` in `swarm.config.json`. The pipeline runner enables `kubeclaw-agent-observer` with `openclaw plugins enable` before work, starts the ingester, then disables the plugin in cleanup. The ingester consumes only the control stream with Redis consumer groups, validates the Phase 0 ingress contract, maps promoted control events into the existing telemetry spine, records `openclaw.model.usage` snapshots for cumulative cost reporting, dead-letters malformed/unemittable records, and leaves payload-stream debug records raw Redis-only.

- Add TypeScript Redis control-stream consumer module.
- Validate and map control-stream events.
- Preserve full debug payloads only for event families explicitly promoted into canonical telemetry; otherwise leave raw payloads in the payload stream.
- Add or select a telemetry-spine minimal masking mode for agent-observability events so existing broad sanitizers do not summarize content.
- Emit through `emitEvent(...)`.
- Initially use `plugin.event` for unstable schemas.
- Add fake Redis tests for XREADGROUP, ACK, invalid event dead-letter, telemetry emit failure handling, control stream lag, payload stream pressure, and trim behavior.

### Phase 3 — First-class telemetry schemas

Status: completed 2026-05-16 in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`, `docs/telemetry-event-schema.md`, `skills/common/pipeline/services/telemetry/payload-schema.ts`, and the agent-observability ingester mapper. Stable control-stream events now have first-class telemetry schemas; LLM/tool full content remains raw-stream-only with bounded canonical summaries.

- Add or finalize schemas for:
  - `agent.ended`
  - optional `agent.llm.input.summary`
  - optional `agent.llm.output.summary`
  - `agent.tool.started`
  - `agent.tool.finished`
  - `agent.model.started`
  - `agent.model.ended`
  - optional `agent.session.started` / `agent.session.ended`
- Update telemetry docs and ClawDeck expectations.
- Move stable mappings from `plugin.event` to first-class event types.

### Phase 4 — Parallel-run replacement evidence

Status: completed 2026-05-17 as observe-only comparison tooling in `skills/nova/pipeline/services/agent-observability-evidence/`, contract coverage in `tests/verification/contracts/check-agent-observability-parallel-run-evidence.mjs`, and raw/debug rendering expectations in `docs/clawdeck-v4.html`. The phase added temporary comparison evidence only; Phase 6 supersedes any legacy fallback interpretation and makes hook-derived Redis lifecycle events the only authority.

- Historical Phase 4 ran the hook-based observer in parallel with then-current ACP/Gateway polling observability to gather replacement evidence before the Phase 6 cutover.
- Compare:
  - agent spawn/end coverage;
  - session end timing;
  - tool/model span completeness;
  - LLM input/output coverage;
  - rate-limit/failure visibility;
  - missing/corrupt identity fields;
  - Redis control-stream lag, payload-stream size, and memory pressure.
- Do not keep the comparison-era polling/session monitor as a runtime fallback after Phase 6 cutover.

### Phase 5 — Forge completion replacement

Status: completed 2026-05-17, then superseded by the Phase 6 override. Forge readiness authority lives in `skills/nova/pipeline/services/agent-observability-forge-completion.ts` and `pollForgeCompletion(...)`: canonical `agent.ended` telemetry plus meaningful git diff evidence promotes Forge to `READY_FOR_TESTING`; `agent.ended` without meaningful diff fails/retries as no work produced. Phase 6 removes ACP session-monitor fallback and the remaining typed `forge-completion.json` parser/prompt compatibility surface from active lifecycle authority.

- Replace Forge's `forge-completion.json` authority with:

```text
openclaw.agent.ended / agent.ended
  + git diff evidence
  + external lint/test/reviewer/Buster verdicts
```

- Decision sketch:
  - `agent.ended` + meaningful diff -> transition to testing.
  - `agent.ended` + no meaningful diff -> fail/retry as no work produced.
  - hook missing/ingester degraded -> degraded/fail-closed lifecycle evidence missing; do not fall back to ACP/Gateway polling.
  - quality remains owned by Buster, reviewers, lints, and test agents.

### Phase 6 — Exclusive Redis hook lifecycle authority cutover

Architectural override accepted 2026-05-18: the OpenClaw hook plugin path is the absolute and only source of truth for agent runtime observability and lifecycle authority. The authoritative chain is plugin hook event -> Redis agent-observability stream -> kubeclaw ingester -> canonical telemetry. Do not preserve dual lifecycle-observability paths.

Required cutover state:

```text
OpenClaw runtime hooks
  -> pipeline-owned OpenClaw plugin
  -> pipeline:agent-observability:control:v1
  -> kubeclaw agent-observability ingester
  -> canonical agent.* telemetry
  -> Forge/readiness/lifecycle decisions
```

In scope:

- Remove Forge completion artifact prompt/parser authority and any runtime branch that can promote readiness from `forge-completion.json`.
- Remove ACP/session-monitor fallback from `pollForgeCompletion(...)` and related Forge readiness wrappers.
- Remove Gateway/session-status polling as fallback lifecycle evidence. Gateway may remain only as command transport for spawn, stop/kill, steer/nudge, and platform health checks; Gateway command responses are acknowledgements or health evidence, not lifecycle truth.
- Remove runtime imports/call paths whose only purpose is legacy lifecycle observation when hook-derived canonical `agent.*` telemetry covers that lifecycle.
- Update architectural maps to state that hook-derived Redis control events are exclusive lifecycle authority.
- Treat missing hook evidence, unavailable Redis control stream, unavailable ingester, or absent canonical `agent.ended` as degraded/fail-closed lifecycle evidence missing. Retry/escalation may use existing retry policy, but must not invoke ACP/Gateway polling as a shadow authority.

Out of scope:

- Redis ACL rollout, gzip payload encoding, broad prompt redaction, or ClawDeck consumer groups.
- Removing Gateway spawn/stop/steer APIs that are command/control transports rather than lifecycle observability authority.

Verification requirements:

- Forge completion cannot import or invoke ACP monitor/session-status fallback.
- `forge-completion.json` cannot grant Forge readiness.
- Gateway status/session polling cannot produce lifecycle completion.
- Missing `agent.ended` produces degraded/fail-closed behavior, not fallback polling.
- Implementation maps and docs no longer describe ACP/Gateway polling as degraded fallback lifecycle authority.

## Open questions for final review

No blocking design questions remain for Phase 0 or the first observe-only implementation. Any later change to the resolved decisions below should update this document before code changes.

## Resolved final-review decisions

1. Stream keys stay global for the first implementation: `pipeline:agent-observability:control:v1` and `pipeline:agent-observability:payload:v1`. Keep `project` and `run_id` in event identity fields; revisit run-scoped stream keys only after real stream-volume or isolation evidence requires it.
2. The first ingester should be a small long-running kubeclaw worker process using a Redis consumer group. It may be disabled by default and run only in observe-only mode initially; active-run-only ingestion is acceptable for local smoke tests, not the production architecture.
3. Shared Redis credentials are accepted for the first cut, relying on private deployment/network isolation plus minimal API-key masking. Redis ACL users remain future hardening, not a blocker for the first observe-only implementation.
4. Discord should receive only `agent.ended` terminal/failure signals and observability degraded/restored alerts by default. Model/tool anomalies should not notify Discord unless they are promoted later with explicit presentation metadata or approved filters.
5. Single-entry payload safety fuse: default hard limit is 3 MiB per event, with an absolute configurable ceiling of 5 MiB. Larger serialized JSON payloads are dropped before `XADD`, classified as `agent_observability_payload_too_large`, and replaced only by identity plus size metadata/degraded-observability evidence.
6. Gzip compression is out of Phase 1. Add `encoding: "gzip+base64"` support only after real metrics show Redis/Kubernetes memory pressure that justifies the added Node.js CPU and latency cost.
7. ClawDeck tails raw/debug streams with per-client Last-IDs. Consumer groups remain for the kubeclaw ingester/work-queue path only, where records are processed and acknowledged with `XACK`.
8. New agent-observability implementation should be TypeScript-first now, because the surrounding codebase is expected to migrate later anyway. Compile to current runtime-compatible JavaScript as needed; avoid hand-written duplicate JS surfaces.
