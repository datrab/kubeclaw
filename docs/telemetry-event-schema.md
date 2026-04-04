# Pipeline Telemetry Event Schema v1

**Purpose:** Stable event format published to Redis streams for external consumers (ClawDeck, monitoring, post-mortem tooling).
**Transport:** Redis Stream — `pipeline:telemetry:<project>:<run_id>`
**Encoding:** JSON per entry, one event per XADD

---

## Stream Key

```
pipeline:telemetry:<project>:<run_id>
```

Example: `pipeline:telemetry:kubecommand:run_7f3a2b`

Stream management:
- MAXLEN ~10000 (approximate trim, keeps memory bounded)
- TTL: streams are not auto-expired; old runs can be cleaned by operator or cron
- Consumer groups: ClawDeck should use XREADGROUP for reliable delivery

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
  "seq": 42
}
```

| Field | Type | Description |
|-------|------|-------------|
| v | number | Schema version (always 1) |
| type | string | Event type (see below) |
| ts | string | ISO 8601 timestamp |
| run_id | string | Pipeline run identifier |
| project | string | Project name |
| seq | number | Monotonic sequence number within this run |

---

## Event Types

### pipeline.started

Emitted once at pipeline start. Contains the full run manifest.

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
  "cost_usd": 24.50
}
```

### pipeline.halted

```json
{
  "type": "pipeline.halted",
  "exit_code": 10,
  "exit_reason": "NEEDS_NOVA: module 06 failed after 3 attempts",
  "halted_at_module": "06",
  "halted_at_gate": null
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
  "max_fails": 3
}
```

### retry.exhausted

Emitted when all retry attempts for a module have been consumed.

```json
{
  "type": "retry.exhausted",
  "module_id": "06",
  "attempt": 3,
  "max_fails": 3
}
```

### summary.started

Emitted when a post-run summary agent begins.

```json
{
  "type": "summary.started",
  "summary_type": "pipeline"
}
```

### summary.completed

Emitted when a post-run summary agent finishes.

```json
{
  "type": "summary.completed",
  "summary_type": "pipeline"
}
```

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

Valid statuses: `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`

For `FAIL` and `BLOCKED` transitions, a `reason` field is included:

```json
{
  "type": "module.status_changed",
  "module_id": "06",
  "title": "WebSockets",
  "old_status": "IN_PROGRESS",
  "new_status": "FAIL",
  "attempt": 2,
  "phase": "forge",
  "model": "claude-sonnet-4-6",
  "duration_seconds": 720,
  "cost_estimate_usd": 3.20,
  "commit_hash": null,
  "reason": "forge failed: TypeScript compilation errors"
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
  "duration_seconds": 387
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
  "reason": "2 blocking issues: missing auth middleware, SQL injection in user endpoint"
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

### agent.spawned

```json
{
  "type": "agent.spawned",
  "agent_type": "forge",
  "label": "forge-sonnet-06",
  "model": "claude-sonnet-4-6",
  "dispatch": "acp",
  "module_id": "06",
  "gate_id": null,
  "substep": "06a",
  "attempt": 1,
  "timeout_minutes": 45,
  "session_key": "agent:forge:session123",
  "thinking_level": "high"
}
```

### agent.killed

```json
{
  "type": "agent.killed",
  "agent_type": "forge",
  "label": "forge-sonnet-06",
  "module_id": "06",
  "has_changes": true,
  "duration_seconds": 720,
  "files_changed": ["src/backend/websockets/logs.py", "src/backend/websockets/exec.py"],
  "reason": "completed"
}
```

### agent.transcript

Live transcript line from an ACP agent session. High frequency — one per transcript event.

```json
{
  "type": "agent.transcript",
  "agent_type": "forge",
  "label": "forge-sonnet-06",
  "module_id": "06",
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
  "agent_type": "forge",
  "label": "forge-sonnet-06",
  "module_id": "06",
  "elapsed_seconds": 340,
  "transcript_events": 142,
  "files_touched": ["src/backend/websockets/logs.py"],
  "last_activity": "Writing WebSocket handler",
  "status": "active"
}
```

### memory.recalled

```json
{
  "type": "memory.recalled",
  "module_id": "06",
  "memories": [
    { "text": "Zustand: create(set => ({...}))", "confidence": 0.82, "tags": ["pattern", "frontend"] },
    { "text": "Auth: Bearer in localStorage", "confidence": 0.65, "tags": ["auth"] }
  ],
  "count": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| module_id | string | Module that triggered the recall |
| memories | array | Recalled memory entries with `text`, optional `confidence` (0–1), and optional `tags` |
| count | number | Number of memories recalled |
| count | number | Number of memories recalled (length of `memories` array) |

### buster.result

```json
{
  "type": "buster.result",
  "module_id": "06",
  "gate_id": null,
  "attempt": 1,
  "overall": "PASS",
  "suites": {
    "build": { "status": "PASS" },
    "health": { "status": "PASS" },
    "unit": { "status": "PASS", "passed": 12, "failed": 0 },
    "api": { "status": "PASS", "passed": 8, "failed": 0 }
  },
  "duration_seconds": 180
}
```

### cost.update

Emitted after each module/gate completion with token usage.

```json
{
  "type": "cost.update",
  "module_id": "06",
  "gate_id": null,
  "tokens_in": 45000,
  "tokens_out": 12000,
  "model": "claude-sonnet-4-6",
  "estimated_cost_usd": 0.85,
  "cumulative_cost_usd": 14.20
}
```

### rate_limit.detected

```json
{
  "type": "rate_limit.detected",
  "agent_type": "forge",
  "module_id": "06",
  "provider": "anthropic",
  "pause_count": 2,
  "max_pauses": 5,
  "cooldown_ms": 7200000,
  "resume_at": "2026-04-03T16:32:00.000Z",
  "detail": "429 Too Many Requests"
}
```

### error.escalation

```json
{
  "type": "error.escalation",
  "exit_code": 10,
  "module_id": "06",
  "gate_id": null,
  "fail_count": 3,
  "last_failure": "forge failed: TypeScript compilation errors in websockets/exec.py",
  "action": "NEEDS_NOVA"
}
```

### approval.requested

Emitted when a human approval gate is reached and operator confirmation is required.

```json
{
  "type": "approval.requested",
  "gate_id": "midpoint-review",
  "gate_title": "Midpoint Review",
  "timeout_minutes": 60,
  "timeout_policy": "block"
}
```

| Field | Type | Description |
|-------|------|-------------|
| gate_id | string | Gate identifier |
| gate_title | string | Human-readable gate title |
| timeout_minutes | number | How long to wait before timeout_policy triggers |
| timeout_policy | string | Action on timeout: `"block"` stops the pipeline (default), `"continue"` proceeds without approval |

### approval.resolved

Emitted when a pending approval gate is resolved (approved or rejected).

```json
{
  "type": "approval.resolved",
  "gate_id": "midpoint-review",
  "status": "APPROVED",
  "decision_by": "nova"
}
```

| Field | Type | Description |
|-------|------|-------------|
| gate_id | string | Gate identifier |
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
  "unit": "usd"
}
```

| Field | Type | Description |
|-------|------|-------------|
| threshold | string | Which threshold was crossed (e.g. `"warn_cost_usd"`, `"warn_tokens"`) |
| current | number | Current value at the time of the warning |
| limit | number | Configured threshold value |
| unit | string | Unit of measurement: `"usd"` or `"tokens"` |

### budget.exceeded

Emitted when cumulative cost or token usage crosses the hard limit. The pipeline may halt depending on calling code behavior.

```json
{
  "type": "budget.exceeded",
  "threshold": "hard_limit_cost_usd",
  "current": 5.12,
  "limit": 5.00,
  "unit": "usd"
}
```

Fields are identical to `budget.warning`.

### case_study.started

Emitted when the optional case study agent is spawned after pipeline completion.

```json
{
  "type": "case_study.started",
  "project": "kubecommand"
}
```

### case_study.completed

Emitted when the case study agent successfully writes its output file.

```json
{
  "type": "case_study.completed",
  "project": "kubecommand",
  "output": "/repo/Projects/kubecommand/src/.swarm/logs/pipeline/case-study.md"
}
```

| Field | Type | Description |
|-------|------|-------------|
| project | string | Project name |
| output | string | Absolute path to the generated case study file |

### redis.message

Emitted when a Redis pub/sub message is sent or received by the pipeline. Used for observability of inter-process coordination (e.g. approval signals, pause/resume commands).

```json
{
  "type": "redis.message",
  "direction": "recv",
  "msg_type": "approval",
  "scope": "gate",
  "scope_id": "midpoint-review",
  "payload_size": 128
}
```

| Field | Type | Description |
|-------|------|-------------|
| direction | string | `"send"` or `"recv"` |
| msg_type | string | Message type/channel identifier |
| scope | string | Scope of the message: `"gate"`, `"module"`, or `"pipeline"` |
| scope_id | string\|null | Identifier within the scope (gate_id, module_id, or run_id) |
| payload_size | number | Size of the message payload in bytes |

---

## ClawDeck Mapping

How dashboard sections map to events:

| Dashboard Section | Events Used |
|-------------------|-------------|
| Header (progress, cost, elapsed) | pipeline.started, module.status_changed, cost.update |
| Pipeline visualization (node graph) | pipeline.started (manifest), module.status_changed, gate.verdict |
| Activity feed | All events (rendered chronologically) |
| Active Agent panel | agent.spawned, agent.progress, memory.recalled |
| Agent Stream (terminal) | agent.transcript |
| Visual Audit | buster.result |
| Hull damage (ship) | module.status_changed (count attempts > 1) |
| Module phase tracking | module.started, phase.started, phase.completed |
| Retry tracking | retry.scheduled, retry.exhausted |
| Post-run summary | summary.started, summary.completed |
| Cost / budget tracking | cost.update, budget.warning, budget.exceeded |
| Rate limit indicator | rate_limit.detected |
| Post-run case study | case_study.started, case_study.completed |
| Approval gates | approval.requested, approval.resolved |
| Redis coordination (debug/ops) | redis.message |

---

## Consumer Notes

**Live dashboard (ClawDeck):**
Use XREADGROUP with a consumer group. Process events as they arrive. For the agent transcript, expect high throughput (~1-5 events/second during active Forge work).

**Post-mortem:**
Use XRANGE on the stream to replay a complete run. Or read `summary.json` from `.swarm/logs/pipeline/runs/<run_id>/`.

**Filtering:**
All events have `type` — filter client-side. If transcript volume is too high, subscribe to `agent.progress` instead (every ~30s).

**Retention:**
Streams are trimmed to ~10000 entries per run. For long runs this means early transcript lines may be evicted. The JSONL files in `.swarm/logs/` remain as the durable record.
