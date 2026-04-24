# Pipeline Telemetry Event Schema v1

**Purpose:** Stable event format published to Redis streams for external consumers (ClawDeck, monitoring, post-mortem tooling).
**Transport:** Redis Stream — `pipeline:telemetry:<project>:<run_id>`
**Encoding:** JSON per entry, one event per XADD

Authority split:
- Canonical event inventory, stream identity, envelope invariants, and compatibility boundaries live in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`.
- This schema is the authoritative event-by-event payload reference for those canonical event names, including authoritative field tables, payload examples, and event-specific correlation notes.
- The event sections below must remain in exact inventory parity with the contract and must not invent additional canonical event families.

---

## Stream Key

`pipeline:telemetry:<project>:<run_id>` is the single canonical live stream.

```
pipeline:telemetry:<project>:<run_id>
```

Example: `pipeline:telemetry:kubecommand:run_7f3a2b`

Stream management:
- MAXLEN ~10000 (approximate trim, keeps memory bounded)
- TTL: streams are not auto-expired; old runs can be cleaned by operator or cron
- Consumer groups: ClawDeck should use XREADGROUP for reliable delivery

## Redis audit artifacts

Canonical Redis audit paths are:

```text
.swarm/logs/redis/redis-exchanges.jsonl
.swarm/logs/redis/redis-ops.jsonl
.swarm/logs/pipeline/runs/<run_id>/redis/redis-exchanges.jsonl
.swarm/logs/pipeline/runs/<run_id>/redis/redis-ops.jsonl
```

---

## Common Envelope

Every event has these fields:

```json
{
  "v": 1,
  "type": "module.started",
  "ts": "2026-04-03T14:32:08.123Z",
  "run_id": "run_7f3a2b",
  "project": "kubecommand",
  "seq": 42,
  "source": "pipeline",
  "emitter": "nova/pipeline/services/telemetry"
}
```

| Field | Type | Description |
|-------|------|-------------|
| v | number | Schema version (always 1) |
| type | string | Event type (see below) |
| ts | string | ISO 8601 timestamp |
| run_id | string | Pipeline run identifier |
| project | string | Project name |
| seq | number | Run-global monotonic sequence number shared by Nova and Buster within this run |
| source | string | Event producer family, currently `pipeline` or `buster` |
| emitter | string | Concrete runtime emitter path |

---

## Event Types

For the high-value lifecycle and observability events below, the field table is the authoritative payload surface. Examples and prose illustrate common combinations, but the field table owns the canonical payload field list and meanings.

### pipeline.started

Emitted once at pipeline start. Contains the full run manifest.

`models` carries the effective project-level per-agent defaults after applying legacy top-level `models` plus `defaults.models`, with `defaults.models` winning for any overlapping agent key.

```json
{
  "type": "pipeline.started",
  "modules": [
    { "id": "01", "title": "Scaffold + Auth", "dir": "01-project-scaffold", "depends_on": [] }
  ],
  "gates": [
    { "id": "midpoint-review", "type": "review", "title": "Midpoint Review" }
  ],
  "execution_order": ["01", "02", "gate:midpoint-review", "03"],
  "models": { "forge": "claude-sonnet-4-6", "buster": "claude-sonnet-4-6", "echo": "claude-opus-4-6" },
  "resume": true,
  "nova_prompt": null
}
```

### pipeline.completed

```json
{
  "type": "pipeline.completed",
  "exit_code": 0,
  "exit_reason": "all modules passed",
  "duration_seconds": 19080,
  "modules_passed": 13,
  "modules_failed": 0,
  "modules_total": 13,
  "total_cost_usd": 24.50
}
```

### pipeline.halted

```json
{
  "type": "pipeline.halted",
  "exit_code": 10,
  "reason": "BLOCKED",
  "module_id": "06",
  "gate_id": null,
  "attempt": 3,
  "dispatch_id": "buster-dispatch-06-attempt-3",
  "gateway_label": "buster-dispatch-06-attempt-3",
  "session_key": "agent:forge:session123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| exit_code | number | Pipeline exit code responsible for the halt |
| reason | string | Terminal halt label such as `BLOCKED`, `NEEDS_NOVA`, or `ARCH_VALIDATION_BLOCKED` |
| module_id | string\|null | Owning module when the halt is module-owned |
| gate_id | string\|null | Owning gate when the halt is gate-owned |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| session_key | string\|null | Session correlation key when the halted work already owns a live ACP/subagent session |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning retry or gate dispatch correlation key when known |
| gateway_label | string\|null | Operator-facing session/dispatch label preserved across halt, retry, and Discord surfaces when known |
| step_type | string\|null | Pipeline-owned non-module/non-gate stop category such as `arch_validation` |
| step_id | string\|null | Pipeline-owned non-module/non-gate stop identifier such as `arch-validation` |

For module- or gate-owned halts, `module_id` or `gate_id` carries the stopping step. When the halt is tied to a live module or gate session, `session_key` preserves that cross-surface correlation key. When the terminal result already knows the retry identity, the halt also preserves canonical `attempt`, `dispatch_id`, and `gateway_label` so the stop-path event stays joinable with the exact retry or gate dispatch.

When the halt is gate-owned and Nova knows the dispatched gate type, the event also preserves `gate_type`, for example:

```json
{
  "type": "pipeline.halted",
  "exit_code": 10,
  "reason": "NEEDS_NOVA",
  "module_id": null,
  "gate_id": "review",
  "gate_type": "review",
  "attempt": 2,
  "dispatch_id": "review-dispatch-2",
  "gateway_label": "review-dispatch-2",
  "session_key": "agent:echo:session123"
}
```

For pipeline-owned stops outside a concrete module or gate, for example architecture validation before module execution, both stay `null` and the event adds `step_type` / `step_id` instead, for example:

```json
{
  "type": "pipeline.halted",
  "exit_code": 20,
  "reason": "ARCH_VALIDATION_BLOCKED",
  "module_id": null,
  "gate_id": null,
  "step_type": "arch_validation",
  "step_id": "arch-validation"
}
```

### module.started

Emitted when a module begins execution (before the agent is spawned).

```json
{
  "type": "module.started",
  "module_id": "06",
  "model": "claude-sonnet-4-6",
  "attempt": 1
}
```

### phase.started

Emitted when a module sub-phase begins (e.g. forge, buster, echo).

```json
{
  "type": "phase.started",
  "module_id": "06",
  "phase": "buster",
  "model": "claude-sonnet-4-6"
}
```

### phase.completed

Emitted when a module sub-phase finishes.

```json
{
  "type": "phase.completed",
  "module_id": "06",
  "phase": "buster"
}
```

### retry.scheduled

Emitted when a module fails and a retry is queued.

```json
{
  "type": "retry.scheduled",
  "module_id": "06",
  "attempt": 2,
  "max_attempts": 5,
  "max_fails": 5,
  "delay_seconds": 30,
  "reason": "rate limit retry"
}
```

| Field | Type | Description |
|-------|------|-------------|
| module_id | string | Module being retried |
| attempt | number\|null | Next attempt number being scheduled |
| max_attempts | number\|null | Canonical retry budget for the work |
| max_fails | number\|null | Compatibility alias for the same retry budget still emitted today |
| delay_seconds | number\|null | Delay before retry starts |
| reason | string\|null | Reason for scheduling the retry |
| dispatch_id | string\|null | Owning dispatch correlation key when the retry already belongs to dispatched work |
| gateway_label | string\|null | Operator-facing session/dispatch label when the retry already owns one |
| session_key | string\|null | Session correlation key when the retry is attached to a known live session |

When the scheduled retry already knows its dispatch-backed session identity, `dispatch_id`, `gateway_label`, and `session_key` stay on `retry.scheduled` so the queued retry remains directly joinable with Discord, halt, and replay surfaces.

### retry.exhausted

Emitted when all retry attempts for a module have been consumed.

```json
{
  "type": "retry.exhausted",
  "module_id": "06",
  "attempt": 3,
  "phase": "buster",
  "dispatch_id": "dispatch-buster-06",
  "gateway_label": "dispatch-buster-06",
  "session_key": "agent:buster:session123",
  "max_attempts": 3,
  "max_fails": 3,
  "reason": "forge failed repeatedly"
}
```

| Field | Type | Description |
|-------|------|-------------|
| module_id | string\|null | Module whose retries were exhausted, null for gate-owned exhaustion |
| gate_id | string\|null | Gate whose retries were exhausted when gate-owned |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| attempt | number\|null | Final consumed attempt number |
| phase | string\|null | Phase or gate phase that exhausted the retry budget |
| dispatch_id | string\|null | Owning dispatch correlation key when known |
| gateway_label | string\|null | Operator-facing session/dispatch label when known |
| session_key | string\|null | Session correlation key when known |
| reason | string\|null | Exhaustion reason or last failure summary |
| max_attempts | number\|null | Canonical retry budget for the work |
| max_fails | number\|null | Compatibility alias for the same retry budget still emitted today |

When retry exhaustion belongs to dispatched module or gate work, `dispatch_id` preserves the same owning correlation key used on the surrounding verdict, rate-limit, Discord, and replay surfaces when known.

When the exhausted work already has a tracked session label, `gateway_label` preserves that same operator-facing join key across retry, halt, Discord, and replay surfaces.

When retry exhaustion belongs to gate-owned work and Nova already knows that identity, the payload also preserves canonical `gate_type` alongside `gate_id`.

Canonical summary lifecycle event names are `summary.started` and `summary.completed`.

### summary.started

Emitted when a post-run summary flow begins. `summary_type` distinguishes the lightweight pipeline summary (`pipeline`), service-owned pipeline review (`pipeline_review`), service-owned case study (`case_study`), and local project summary artifact generation (`project_summary`). Session-backed summary runs preserve `gateway_label`, `model`, and `runtime`; artifact-owned summaries may preserve output targets plus exit context such as `output_dir`, `exit_code`, and `exit_reason`.

```json
{
  "type": "summary.started",
  "summary_type": "pipeline_review",
  "gateway_label": "pipeline-review-1712876400000",
  "model": "openai-codex/gpt-5.4",
  "runtime": "subagent"
}
```

### summary.completed

Emitted when a post-run summary flow finishes.

```json
{
  "type": "summary.completed",
  "summary_type": "project_summary",
  "status": "ok",
  "output_dir": "/repo/Projects/kubecommand/src/.swarm/logs/pipeline",
  "markdown_path": "/repo/Projects/kubecommand/src/.swarm/logs/pipeline/project-summary.md",
  "data_path": "/repo/Projects/kubecommand/src/.swarm/logs/pipeline/project-summary.json",
  "case_study_base_path": "/repo/Projects/kubecommand/src/.swarm/logs/pipeline/case-study.base.json"
}
```

`summary.completed` preserves `status` (`ok` or `failed`) plus `reason` on terminal failures. Session-backed summary flows also preserve `session_key` when a child session existed, along with the same `gateway_label`, `model`, and `runtime` identity emitted on start.

For `summary_type: pipeline`, the canonical live payload also preserves `exit_code`, `exit_reason`, `summary_json_path`, `pipeline_summary_path`, and `latest_json_path` so the live stream can be joined directly back to the persisted run summary and latest-pointer bundle. Pipeline-owned summary writes (`summary_type: pipeline`) also preserve `exit_code`, `exit_reason`, and the artifact join points `summary_json_path`, `pipeline_summary_path`, and `latest_json_path`.

| Field | Type | Description |
|-------|------|-------------|
| summary_type | string | Canonical summary surface: `pipeline`, `pipeline_review`, `case_study`, or `project_summary` |
| gateway_label | string\|null | Session-backed summary gateway label when the summary owns an ACP/subagent child session |
| model | string\|null | Effective model for session-backed summary generation |
| runtime | string\|null | Dispatch/runtime used by the summary owner (`acp`, `subagent`, etc.) |
| session_key | string\|null | Session-backed summary child-session identity when one existed |
| status | string\|null | Terminal outcome on `summary.completed`, typically `ok` or `failed` |
| reason | string\|null | Failure detail on `summary.completed` when generation failed |
| output | string\|null | Primary output artifact path when the summary writes one file, such as a case study or pipeline review |
| output_dir | string\|null | Directory where local summary artifacts are written |
| exit_code | number\|null | Pipeline exit code when the summary reflects the authoritative pipeline run outcome |
| exit_reason | string\|null | Pipeline summary exit label such as `PIPELINE_COMPLETE`, `BLOCKED:01`, or `single_module:01` |
| summary_json_path | string\|null | Run-scoped `summary.json` artifact path for `summary_type: pipeline` |
| pipeline_summary_path | string\|null | Top-level `.swarm/logs/pipeline/summary.json` artifact path for `summary_type: pipeline` |
| latest_json_path | string\|null | Top-level `.swarm/logs/pipeline/latest.json` pointer path for `summary_type: pipeline` |
| markdown_path | string\|null | Project-summary markdown artifact path when written |
| data_path | string\|null | Project-summary JSON artifact path when written |
| case_study_base_path | string\|null | Project-summary case-study seed artifact path when written |

### module.status_changed

Emitted on every module status transition.

```json
{
  "type": "module.status_changed",
  "module_id": "06",
  "title": "WebSockets",
  "old_status": "IN_PROGRESS",
  "new_status": "PASS",
  "attempt": 3,
  "phase": "buster",
  "model": "claude-sonnet-4-6",
  "duration_seconds": 840,
  "cost_estimate_usd": 4.80,
  "commit_hash": "a1b2c3d4"
}
```

| Field | Type | Description |
|-------|------|-------------|
| module_id | string | Module whose status changed |
| title | string\|null | Human-readable module title when known |
| old_status | string\|null | Prior canonical module status |
| new_status | string\|null | New canonical module status, including `RATE_LIMITED` for cooldown transitions |
| attempt | number\|null | Attempt number associated with the transition |
| dispatch_id | string\|null | Owning dispatch correlation key when the transition is retry- or gate-backed |
| gateway_label | string\|null | Operator-facing session/dispatch label when known |
| phase | string\|null | Active phase associated with the transition |
| model | string\|null | Effective model when the transition is tied to agent-owned work |
| session_key | string\|null | Session correlation key when known |
| duration_seconds | number\|null | Duration accumulated for the finished phase or module step when known |
| cost_estimate_usd | number\|null | Cost estimate accumulated at the transition when known |
| commit_hash | string\|null | Produced commit hash when the transition wrote one |
| reason | string\|null | Material explanation for FAIL, BLOCKED, or RATE_LIMITED transitions when present |

Valid statuses: `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`, `RATE_LIMITED`

For `FAIL`, `BLOCKED`, and rate-limit pause transitions, a `reason` field is included when it materially explains the state change:

```json
{
  "type": "module.status_changed",
  "module_id": "06",
  "title": "WebSockets",
  "old_status": "IN_PROGRESS",
  "new_status": "FAIL",
  "attempt": 2,
  "dispatch_id": "dispatch-buster-06",
  "gateway_label": "dispatch-buster-06",
  "phase": "forge",
  "model": "claude-sonnet-4-6",
  "session_key": "agent:forge:session123",
  "duration_seconds": 720,
  "cost_estimate_usd": 3.20,
  "commit_hash": null,
  "reason": "forge failed: TypeScript compilation errors"
}
```

When a terminal or retry-driving module transition already knows its dispatch-backed retry identity, `dispatch_id`, `gateway_label`, and `session_key` stay on `module.status_changed` so FAIL and BLOCKED telemetry remains directly joinable with the surrounding retry, Discord, and replay surfaces.

Rate-limit cooldown example:

```json
{
  "type": "module.status_changed",
  "module_id": "06",
  "title": "WebSockets",
  "old_status": "TESTING",
  "new_status": "RATE_LIMITED",
  "attempt": 2,
  "phase": "buster",
  "model": "claude-sonnet-4-6",
  "duration_seconds": null,
  "cost_estimate_usd": null,
  "commit_hash": "a1b2c3d4",
  "reason": "Paused 2h (rate limit)"
}
```

### gate.started

```json
{
  "type": "gate.started",
  "gate_id": "midpoint-review",
  "gate_type": "review",
  "title": "Midpoint Review",
  "reviewers": ["echo-opus"]
}
```

### gate.verdict

GO example:

```json
{
  "type": "gate.verdict",
  "gate_id": "midpoint-review",
  "gate_type": "review",
  "verdict": "GO",
  "issues_count": 2,
  "blockers_count": 0,
  "fix_cycle": 0,
  "duration_seconds": 387,
  "dispatch_id": "dispatch-gate-quality-1",
  "session_key": "agent:echo:session123"
}
```

NO-GO example (includes `reason`):

```json
{
  "type": "gate.verdict",
  "gate_id": "midpoint-review",
  "gate_type": "review",
  "verdict": "NO-GO",
  "issues_count": 5,
  "blockers_count": 2,
  "fix_cycle": 1,
  "duration_seconds": 412,
  "reason": "2 blocking issues: missing auth middleware, SQL injection in user endpoint",
  "dispatch_id": "dispatch-gate-quality-1",
  "session_key": "agent:echo:session123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| gate_id | string | Gate identifier |
| gate_type | string | `"review"`, `"buster"`, or `"approval"` |
| verdict | string | `"GO"` or `"NO-GO"` |
| issues_count | number\|null | Total issues found (review gates) |
| blockers_count | number\|null | Blocking issues (review gates) |
| fix_cycle | number\|null | Fix cycle index (0-based; 0 = first attempt) |
| duration_seconds | number\|null | Time from gate start to verdict |
| reason | string\|null | Present on NO-GO — summary of the primary failure reason |
| dispatch_id | string\|null | Owning dispatch correlation key when the gate verdict belongs to dispatched gate work |
| session_key | string\|null | Live gate-session correlation key when the verdict is tied to a known ACP/subagent session |

When Nova already knows the live session that produced the gate verdict, `session_key` preserves the same cross-surface correlation used on Discord, `agent.spawned`, and related lifecycle events. It may be `null` for purely local/configuration failures that occur before a gate-owned session exists. When that verdict is tied to dispatched gate work, `dispatch_id` preserves the same owning correlation used on gate rate-limit, Discord, and replay surfaces.

### agent.spawned

Session-backed agent lifecycle event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawns after a successful task decision. Redis-dispatched Buster work still emits `buster.task_started` / `buster.task_completed` for task-level lifecycle around that child-session work.

```json
{
  "type": "agent.spawned",
  "agent_type": "echo",
  "label": "echo-review-06-1712876400000",
  "model": "claude-sonnet-4-6",
  "dispatch": "acp",
  "module_id": null,
  "gate_id": "review-06",
  "gate_type": "review",
  "substep": null,
  "attempt": 1,
  "dispatch_id": "dispatch-review-06-1",
  "timeout_minutes": 45,
  "session_key": "agent:echo:session123",
  "thinking_level": "high"
}
```

| Field | Type | Description |
|-------|------|-------------|
| agent_type | string | Agent role such as `forge`, `buster`, or `echo` |
| label | string\|null | Operator-facing session label |
| model | string\|null | Effective model for the spawned session when known |
| dispatch | string\|null | Runtime dispatch kind such as `acp` or `subagent` |
| module_id | string\|null | Module context when module-owned |
| gate_id | string\|null | Gate context when gate-owned |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| substep | string\|null | Optional finer-grained substep owned by the spawned session |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning dispatch correlation key when known |
| timeout_minutes | number\|null | Requested wall-clock timeout for the spawned session when tracked |
| session_key | string\|null | Canonical session identity for the spawned ACP/subagent work |
| thinking_level | string\|null | Requested reasoning or thinking level when tracked |

### agent.killed

Session-backed agent termination event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawned for a passing task. Redis-dispatched Buster work still emits `buster.task_completed` for task-level lifecycle, while `agent.killed` closes the child-session lifecycle when one existed.

```json
{
  "type": "agent.killed",
  "agent_type": "echo",
  "label": "echo-review-06-1712876400000",
  "module_id": null,
  "gate_id": "review-06",
  "gate_type": "review",
  "attempt": 1,
  "dispatch_id": "dispatch-review-06-1",
  "session_key": "agent:echo:session123",
  "has_changes": true,
  "duration_seconds": 720,
  "files_changed": ["src/backend/websockets/logs.py", "src/backend/websockets/exec.py"],
  "reason": "completed"
}
```

| Field | Type | Description |
|-------|------|-------------|
| agent_type | string | Agent role such as `forge`, `buster`, or `echo` |
| label | string\|null | Operator-facing session label |
| module_id | string\|null | Module context when module-owned |
| gate_id | string\|null | Gate context when gate-owned |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| session_key | string\|null | Canonical session identity for the terminated ACP/subagent work |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning dispatch correlation key when known |
| has_changes | boolean\|null | Whether the session produced tracked file changes when known |
| duration_seconds | number\|null | Session runtime when known |
| files_changed | string[]\|null | Tracked changed files when known |
| reason | string\|null | Termination reason such as `completed`, `timeout`, or `killed` |

When the orchestrator knows the terminated session identity, `agent.killed` preserves the same top-level correlation fields used on `agent.spawned`, especially `session_key`.

When the spawned or terminated session belongs to gate-owned work and Nova already knows that gate identity, both lifecycle events also preserve canonical `gate_type` and `dispatch_id` join keys alongside `gate_id`, `attempt`, and `session_key`.

### agent.transcript

Live transcript line from an ACP agent session. High frequency — one per transcript event.

```json
{
  "type": "agent.transcript",
  "agent_type": "forge",
  "label": "forge-sonnet-06",
  "module_id": "06",
  "gate_id": "gate:review",
  "gate_type": "review",
  "session_key": "agent:echo:gate-review-06",
  "dispatch_id": "dispatch-review-06-2",
  "line_kind": "assistant",
  "text": "Creating WebSocket handler for pod logs...",
  "transcript_offset": 142
}
```

| Field | Type | Description |
|-------|------|-------------|
| agent_type | string | Agent role: `"forge"`, `"buster"`, `"echo"`, etc. |
| label | string | ACP session label (e.g. `"forge-sonnet-06"`) |
| module_id | string\|null | Module context |
| gate_id | string\|null | Gate context when the live session belongs to a gate or gate-fix cycle |
| gate_type | string\|null | Canonical gate type when the live session is gate-owned and Nova knows that identity |
| session_key | string\|null | Owning ACP/subagent session identity when known |
| dispatch_id | string\|null | Owning dispatch correlation key when the live session belongs to dispatched gate work |
| line_kind | string | See values below |
| text | string | Content of the transcript line or batch |
| transcript_offset | number\|null | Byte offset in the source transcript file (null for batched events) |
| line_count | number\|null | Number of source lines collapsed into this event (set when rate-limited batching occurs; null for individual events) |

line_kind values: `assistant`, `assistant_delta`, `tool_call`, `tool_result`, `system_event`, `lifecycle`, `thinking`, `info`

- `info`: catch-all for batched/rate-limited transcript events (multiple lines collapsed into one) and unrecognized agent-side kinds. ClawDeck should render these as plain text lines without special decoration. When `line_kind` is `info` and `line_count > 1`, the event is a rate-limit batch.

### agent.progress

Periodic summary of agent activity (emitted every ~30s while agent is active). Lower frequency alternative to transcript for dashboards that don't need full terminal view.

```json
{
  "type": "agent.progress",
  "agent_type": "echo",
  "label": "echo-review-06",
  "module_id": null,
  "gate_id": "gate:review",
  "gate_type": "review",
  "session_key": "agent:echo:gate-review-06",
  "dispatch_id": "dispatch-review-06-2",
  "elapsed_seconds": 340,
  "transcript_events": 142,
  "files_touched": ["src/backend/websockets/logs.py"],
  "last_activity": "Writing WebSocket handler",
  "status": "active"
}

| Field | Type | Description |
|-------|------|-------------|
| agent_type | string | Agent role: `"forge"`, `"buster"`, `"echo"`, etc. |
| label | string | ACP session label |
| module_id | string\|null | Module context |
| gate_id | string\|null | Gate context when the live session belongs to a gate or gate-fix cycle |
| gate_type | string\|null | Canonical gate type when the live session is gate-owned and Nova knows that identity |
| session_key | string\|null | Owning ACP/subagent session identity when known |
| dispatch_id | string\|null | Owning dispatch correlation key when the live session belongs to dispatched gate work |
| elapsed_seconds | number\|null | Seconds since the session started |
| transcript_events | number\|null | Count of transcript events seen so far |
| files_touched | string[]\|null | Optional touched-file summary |
| last_activity | string\|null | Last transcript-derived activity summary |
| status | string | Progress status, usually `active` |
```

### Deprecated compatibility exports

`memory.recalled`, `buster.result`, and `redis.message` are no longer exported
by the Nova telemetry module and are not part of the authoritative run stream.
Downstream consumers should rely on the canonical `buster.*`, `approval.*`,
and other documented event families instead.

### cost.update

Emitted after each module/gate completion with token usage.

```json
{
  "type": "cost.update",
  "module_id": "06",
  "agent_type": "forge",
  "label": "forge-06",
  "gate_id": null,
  "cost_usd": 0.85,
  "total_cost_usd": 14.20,
  "input_tokens": 45000,
  "output_tokens": 12000,
  "model": "claude-sonnet-4-6",
  "estimated_cost_usd": 0.85,
  "cumulative_cost_usd": 14.20,
  "tokens_in": 45000,
  "tokens_out": 12000
}
```

### rate_limit.detected

```json
{
  "type": "rate_limit.detected",
  "agent_type": "echo",
  "module_id": null,
  "gate_id": "gate:review",
  "gate_type": "review",
  "gateway_label": "dispatch-review-06-2",
  "session_key": "agent:echo:session123",
  "attempt": 2,
  "dispatch_id": "dispatch-review-06-2",
  "provider": "anthropic",
  "retry_after_seconds": 7200,
  "pause_count": 2,
  "max_pauses": 5,
  "cooldown_ms": 7200000,
  "resume_at": "2026-04-03T16:32:00.000Z",
  "detail": "429 Too Many Requests"
}
```

| Field | Type | Description |
|-------|------|-------------|
| agent_type | string\|null | Agent role or phase experiencing the pause |
| module_id | string\|null | Module context |
| gate_id | string\|null | Gate context when applicable |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| gateway_label | string\|null | Operator-facing session/dispatch label when the paused work already owns one |
| session_key | string\|null | ACP/subagent session correlation key |
| attempt | number\|null | Attempt index when known |
| dispatch_id | string\|null | Owning dispatch correlation key when the paused work already has one |
| provider | string\|null | Provider that triggered the limit |
| retry_after_seconds | number\|null | Cooldown in seconds |
| pause_count | number\|null | Current pause number |
| max_pauses | number\|null | Maximum pauses before escalation |
| cooldown_ms | number\|null | Cooldown in milliseconds |
| resume_at | string\|null | Planned resume timestamp |
| detail | string\|null | Safe summary of the trigger |

### observability.degraded

Emitted when operator visibility is impaired, for example when session status is unreachable through the gateway or when an ACP transcript cannot be read. If the Redis stream itself is down, the same event is also written to fallback artifacts and `observability.restored` is backfilled when stream delivery resumes.

```json
{
  "type": "observability.degraded",
  "component": "acp_monitor",
  "surface": "gateway",
  "reason": "gateway_unreachable",
  "detail": "session status unreachable",
  "module_id": "06",
  "gateway_label": "forge-06-1712876400000",
  "session_key": "agent:forge:session123",
  "attempt": 2,
  "agent_type": "forge",
  "degraded_at": "2026-04-03T14:32:08.123Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| component | string\|null | Runtime owner reporting the incident, e.g. `acp_monitor`, `discord`, or `telemetry` |
| surface | string\|null | Affected surface, e.g. `gateway`, `audit_log`, or `redis_stream` |
| reason | string\|null | Stable machine-readable incident reason |
| detail | string\|null | Safe human-readable detail |
| module_id | string\|null | Module context when visibility loss belongs to module work |
| gate_id | string\|null | Gate context when visibility loss belongs to gate work |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| gateway_label | string\|null | Tracked gateway/session label when the runtime already knows it |
| session_key | string\|null | Session correlation key when the degraded surface belongs to a live session |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning dispatch correlation key when the degraded surface belongs to dispatched work |
| agent_type | string\|null | Agent or phase context when known |
| impacted_event_type | string\|null | Event type whose delivery failed, when the incident is tied to one blocked emit |
| stream_key | string\|null | Telemetry stream key when the degraded surface is stream-specific |
| degraded_at | string\|null | When degraded visibility began |

When degraded visibility is tied to a tracked session or dispatch, the event also preserves the same `gateway_label`, `attempt`, and `dispatch_id` join keys used on the surrounding operator surfaces when known. The same event family also covers Discord operator-surface failures, for example the payload may include "component": "discord", "surface": "audit_log", and "reason": "audit_write_failed" when `discord.jsonl` mirroring cannot be written for a run. When degraded visibility is tied to a gate-owned session and Nova knows the dispatched gate type, the event also preserves `gate_type`, for example:

```json
{
  "type": "observability.degraded",
  "component": "acp_monitor",
  "surface": "gateway",
  "reason": "gateway_unreachable",
  "detail": "session status unreachable",
  "module_id": null,
  "gate_id": "review-01",
  "gate_type": "review",
  "gateway_label": "reviewfix-review-01-1-1712876400000",
  "session_key": "agent:echo:session123",
  "attempt": 1,
  "dispatch_id": "dispatch-review-01-1",
  "agent_type": "review_fix",
  "degraded_at": "2026-04-03T14:32:08.123Z"
}
```

### observability.restored

Emitted when a previously degraded observability surface becomes healthy again.

```json
{
  "type": "observability.restored",
  "component": "acp_monitor",
  "surface": "gateway",
  "reason": "gateway_unreachable",
  "detail": "session status reachable again",
  "module_id": "06",
  "gateway_label": "forge-06-1712876400000",
  "session_key": "agent:forge:session123",
  "attempt": 2,
  "agent_type": "forge",
  "degraded_at": "2026-04-03T14:32:08.123Z",
  "restored_at": "2026-04-03T14:33:15.000Z",
  "restored_after_ms": 66877
}
```

| Field | Type | Description |
|-------|------|-------------|
| component | string\|null | Runtime owner reporting the recovered incident, e.g. `acp_monitor`, `discord`, or `telemetry` |
| surface | string\|null | Recovered surface, e.g. `gateway`, `audit_log`, or `redis_stream` |
| reason | string\|null | Stable machine-readable incident reason carried forward from the degraded event |
| detail | string\|null | Safe human-readable recovery detail |
| module_id | string\|null | Module context when visibility recovery belongs to module work |
| gate_id | string\|null | Gate context when visibility recovery belongs to gate work |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| gateway_label | string\|null | Tracked gateway/session label when the runtime already knows it |
| session_key | string\|null | Session correlation key when the recovered surface belongs to a live session |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning dispatch correlation key when the recovered surface belongs to dispatched work |
| agent_type | string\|null | Agent or phase context when known |
| stream_key | string\|null | Telemetry stream key when the recovered surface is stream-specific |
| degraded_at | string\|null | When the degraded period began |
| restored_at | string\|null | When visibility recovered |
| restored_after_ms | number\|null | Duration of the degraded period in ms |

When restored visibility is tied to a tracked session or dispatch, the event also preserves the same `gateway_label`, `attempt`, and `dispatch_id` join keys used on the surrounding operator surfaces when known. The same event family also covers Discord operator-surface recovery, for example the payload may include "component": "discord", "surface": "audit_log", "reason": "audit_write_failed", and "detail": "discord audit log writes restored" once `discord.jsonl` mirroring resumes for the run. When restored visibility is tied to a gate-owned session and Nova knows the dispatched gate type, the event also preserves `gate_type`, for example:

```json
{
  "type": "observability.restored",
  "component": "redis_completion",
  "surface": "completion_stream",
  "reason": "completion_read_failed",
  "detail": "redis completion stream readable again",
  "module_id": null,
  "gate_id": "gate:buster",
  "gate_type": "buster",
  "gateway_label": "buster-gate-review-1712876400000",
  "session_key": "agent:buster:session123",
  "attempt": 3,
  "dispatch_id": "dispatch-gate-review-3",
  "agent_type": "buster",
  "degraded_at": "2026-04-03T14:32:08.123Z",
  "restored_at": "2026-04-03T14:33:15.000Z",
  "restored_after_ms": 66877
}
```

### error.escalation

```json
{
  "type": "error.escalation",
  "exit_code": 10,
  "module_id": "06",
  "gate_id": null,
  "attempt": 3,
  "dispatch_id": "buster-dispatch-06-attempt-3",
  "gateway_label": "buster-dispatch-06-attempt-3",
  "session_key": "agent:forge:session123",
  "fail_count": 3,
  "last_failure": "forge failed: TypeScript compilation errors in websockets/exec.py",
  "action": "NEEDS_NOVA"
}
```

| Field | Type | Description |
|-------|------|-------------|
| exit_code | number | Pipeline exit code that triggered escalation |
| module_id | string\|null | Owning module when escalation is module-owned |
| gate_id | string\|null | Owning gate when escalation is gate-owned |
| gate_type | string\|null | Canonical gate type when `gate_id` is present and known |
| session_key | string\|null | Session correlation key when the escalated work already owns a live session |
| attempt | number\|null | Owning retry or gate attempt when known |
| dispatch_id | string\|null | Owning dispatch correlation key when known |
| gateway_label | string\|null | Operator-facing session/dispatch label when known |
| fail_count | number\|null | Total failed attempts or retries counted at escalation time |
| last_failure | string\|null | Last failure summary carried into the escalation |
| action | string\|null | Escalation outcome such as `NEEDS_NOVA` or `BLOCKED` |
| step_type | string\|null | Pipeline-owned non-module/non-gate escalation category such as `arch_validation` |
| step_id | string\|null | Pipeline-owned non-module/non-gate escalation identifier such as `arch-validation` |

When escalation is tied to a live module or gate session, `session_key` preserves the same session correlation used on Discord and the surrounding lifecycle events. When the terminal result already knows the retry identity, the escalation also preserves canonical `attempt`, `dispatch_id`, and `gateway_label` so the stop-path event stays joinable with the exact retry or gate dispatch. When the escalation is gate-owned and Nova knows the dispatched gate type, the event also preserves `gate_type`, for example:

```json
{
  "type": "error.escalation",
  "exit_code": 10,
  "module_id": null,
  "gate_id": "review",
  "gate_type": "review",
  "attempt": 2,
  "dispatch_id": "review-dispatch-2",
  "gateway_label": "review-dispatch-2",
  "session_key": "agent:echo:session123",
  "fail_count": 3,
  "last_failure": "Review gate needs Nova guidance",
  "action": "NEEDS_NOVA"
}
```

When escalation is owned by a pipeline-level step rather than a specific module or gate, `module_id` / `gate_id` stay `null` and the event carries `step_type` / `step_id`, for example:

```json
{
  "type": "error.escalation",
  "exit_code": 20,
  "module_id": null,
  "gate_id": null,
  "step_type": "arch_validation",
  "step_id": "arch-validation",
  "last_failure": "Architecture validation failed before module execution",
  "action": "BLOCKED"
}
```

### approval.requested

Emitted when a human approval gate is reached and operator confirmation is required.

```json
{
  "type": "approval.requested",
  "approval_id": "midpoint-review",
  "module_id": null,
  "prompt": "Approval required for gate Midpoint Review",
  "options": ["APPROVE", "REJECT"],
  "gate_id": "midpoint-review",
  "gate_type": "approval",
  "gate_title": "Midpoint Review",
  "timeout_minutes": 60,
  "timeout_policy": "BLOCK"
}
```

| Field | Type | Description |
|-------|------|-------------|
| approval_id | string | Canonical approval identifier, currently the gate id |
| module_id | string\|null | Module context, null for gate approvals |
| prompt | string | Operator-facing approval prompt |
| options | string[] | Available operator choices |
| gate_id | string | Gate identifier |
| gate_type | string\|null | Canonical gate type when the approval event is gate-owned, currently `"approval"` |
| gate_title | string | Human-readable gate title |
| timeout_minutes | number | How long to wait before timeout_policy triggers |
| timeout_policy | string | Action on timeout: `"BLOCK"` stops the pipeline (default), `"CONTINUE"` proceeds without approval |

### approval.resolved

Emitted when a pending approval gate is resolved (approved or rejected).

```json
{
  "type": "approval.resolved",
  "approval_id": "midpoint-review",
  "module_id": null,
  "choice": "APPROVED",
  "resolved_by": "nova",
  "gate_id": "midpoint-review",
  "gate_type": "approval",
  "status": "APPROVED",
  "decision_by": "nova"
}
```

| Field | Type | Description |
|-------|------|-------------|
| approval_id | string | Canonical approval identifier, currently the gate id |
| module_id | string\|null | Module context, null for gate approvals |
| choice | string | Normalized chosen option, same value as `status` today |
| resolved_by | string\|null | Normalized resolver identity, same value as `decision_by` today |
| gate_id | string | Gate identifier |
| gate_type | string\|null | Canonical gate type when the resolution is tied to a gate-owned approval, currently `"approval"` |
| status | string | Resolution: `"APPROVED"`, `"REJECTED"`, `"TIMED_OUT"`, or `"CANCELLED"` (uppercase constants) |
| decision_by | string\|null | Who made the decision (operator name, `"timeout"`, or null) |

### budget.warning

Emitted when cumulative cost or token usage crosses a warning threshold. Non-blocking — the pipeline continues.

```json
{
  "type": "budget.warning",
  "threshold": "warn_cost_usd",
  "current": 0.95,
  "limit": 1.00,
  "unit": "usd",
  "current_cost_usd": 0.95,
  "budget_usd": 1.00,
  "percent_used": 95
}
```

| Field | Type | Description |
|-------|------|-------------|
| threshold | string | Which threshold was crossed (e.g. `"warn_cost_usd"`, `"warn_tokens"`) |
| current | number | Current value at the time of the warning |
| limit | number | Configured threshold value |
| unit | string | Unit of measurement: `"usd"` or `"tokens"` |
| current_cost_usd | number\|null | Normalized USD current value when `unit="usd"` |
| budget_usd | number\|null | Normalized USD limit when `unit="usd"` |
| percent_used | number\|null | Percent of the limit consumed, when computable |

### budget.exceeded

Emitted when cumulative cost or token usage crosses the hard limit. The pipeline may halt depending on calling code behavior.

```json
{
  "type": "budget.exceeded",
  "threshold": "hard_limit_cost_usd",
  "current": 5.12,
  "limit": 5.00,
  "unit": "usd",
  "current_cost_usd": 5.12,
  "budget_usd": 5.00,
  "percent_used": 102.4
}
```

Fields are identical to `budget.warning`.

## Buster Events

Buster publishes into the same canonical run stream as Nova:

```
pipeline:telemetry:<project>:<run_id>
```

Buster events are distinguished by `source: "buster"` and their `buster.*` event names.

### buster.task_started

Emitted once at the start of a task.

```json
{
  "type": "buster.task_started",
  "module_id": "06",
  "task_type": "module_test",
  "attempt": 1,
  "dispatch_id": "dispatch-buster-06",
  "session_key": null,
  "suites": ["build", "health", "api"],
  "serve_type": "server",
  "commit_hash": "a1b2c3d4"
}
```

### buster.task_completed

Emitted at the end of a task on all exit paths (success, failure, timeout).

```json
{
  "type": "buster.task_completed",
  "module_id": "06",
  "task_type": "module_test",
  "attempt": 1,
  "dispatch_id": "dispatch-buster-06",
  "session_key": "agent:buster:session123",
  "outcome": "PASS",
  "reason": "completion_received",
  "duration_seconds": 420,
  "suites_passed": 3,
  "suites_failed": 0,
  "suites_errored": 0,
  "suites_skipped": 0,
  "suite_summary": "✅ build ✅ health ✅ api",
  "spawned_subagent": true
}
```

`outcome` values: `PASS`, `FAIL`, `TIMEOUT`, `RATE_LIMITED`

Both events also carry the standard top-level Buster correlation fields `attempt`, `dispatch_id`, and `session_key` when known. `session_key` may be `null` on early `buster.task_started` emits before the child session exists.

### buster.sandbox_cleanup

Emitted twice per task: before suites (`stage: "pre"`) and after the session ends (`stage: "final"`). Each stage emits a `phase: "started"` then `phase: "completed"` pair.

```json
{
  "type": "buster.sandbox_cleanup",
  "module_id": "06",
  "stage": "pre",
  "phase": "completed",
  "duration_seconds": 2,
  "ok": true
}
```

### buster.git_sync

```json
{
  "type": "buster.git_sync",
  "module_id": "06",
  "mode": "deterministic",
  "commit_hash": "a1b2c3d4",
  "ok": true,
  "error": null
}
```

`mode` values: `"deterministic"` (checkout to `commit_hash`), `"fast-forward"` (pull latest)

### buster.decision

Emitted after suites complete. Determines whether to spawn a subagent.

```json
{
  "type": "buster.decision",
  "module_id": "06",
  "recommendation": "SPAWN",
  "reason": "all critical suites passed",
  "suite_summary": "✅ build ✅ health ✅ api"
}
```

`recommendation` values: `"SPAWN"`, `"NO_SPAWN"`

### buster.suite_started

```json
{
  "type": "buster.suite_started",
  "module_id": "06",
  "suite": "api",
  "attempt": 1
}
```

### buster.suite_completed

```json
{
  "type": "buster.suite_completed",
  "module_id": "06",
  "suite": "api",
  "status": "PASS",
  "duration_seconds": 12,
  "checks_passed": 8,
  "checks_failed": 0,
  "critical": false,
  "top_finding": null
}
```

`status` values: `"PASS"`, `"FAIL"`, `"SKIP"`, `"ERROR"`

Skipped and errored suites are represented through `buster.suite_completed` status and reason fields, not separate event names.

### buster.session_monitor

Emitted every poll cycle while the subagent session is active.

```json
{
  "type": "buster.session_monitor",
  "module_id": "06",
  "session_key": "agent:buster:session123",
  "elapsed_seconds": 90,
  "acp_state": "active",
  "transcript_events": 47,
  "rate_limited": false
}
```

### buster.visual_reg

Rich per-page visual diff data emitted by the `visual-reg` suite. Supplements the generic `buster.suite_completed` event.

```json
{
  "type": "buster.visual_reg",
  "module_id": "06",
  "pages": [
    { "url": "http://localhost:9999/", "diff_pct": 0.02, "status": "PASS" },
    { "url": "http://localhost:9999/dashboard", "diff_pct": 12.5, "status": "FAIL" }
  ],
  "overall": "FAIL"
}
```

Rate-limit pauses are surfaced through the shared `rate_limit.detected` event, not a Buster-specific rate-limit event name.

---

## ClawDeck Mapping

How dashboard sections map to events:

| Dashboard Section | Events Used |
|-------------------|-------------|
| Header (progress, cost, elapsed) | pipeline.started, module.status_changed, cost.update |
| Pipeline visualization (node graph) | pipeline.started (manifest), module.status_changed, gate.verdict |
| Activity feed | All events (rendered chronologically) |
| Active Agent panel | agent.spawned, agent.progress |
| Agent Stream (terminal) | agent.transcript |
| Visual Audit | buster.visual_reg, buster.suite_completed, buster.task_completed |
| Hull damage (ship) | module.status_changed (count attempts > 1) |
| Module phase tracking | module.started, phase.started, phase.completed |
| Retry tracking | retry.scheduled, retry.exhausted |
| Post-run summary | summary.started, summary.completed (`summary_type`: `pipeline`, `pipeline_review`, `case_study`, `project_summary`) |
| Cost / budget tracking | cost.update, budget.warning, budget.exceeded |
| Rate limit indicator | rate_limit.detected |
| Observability health | observability.degraded, observability.restored |
| Approval gates | approval.requested, approval.resolved |

---

## Consumer Notes

**Live dashboard (ClawDeck):**
Use XREADGROUP with a consumer group. Process events as they arrive. For the agent transcript, expect high throughput (~1-5 events/second during active Forge work).

**Post-mortem:**
Use XRANGE on the stream to replay a complete run. Or start at `.swarm/logs/pipeline/latest.json`, which points to the newest run-scoped `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, and `summary.json` under `.swarm/logs/pipeline/runs/<run_id>/`, and records the canonical `telemetry_stream_key` for the same run.

**Filtering:**
All events have `type` — filter client-side. If transcript volume is too high, subscribe to `agent.progress` instead (every ~30s).

**Retention:**
Streams are trimmed to ~10000 entries per run. For long runs this means early transcript lines may be evicted. The JSONL files in `.swarm/logs/` remain as the durable record.
