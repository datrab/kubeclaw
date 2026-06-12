# Observability Reference — `.swarm/logs/` Artifact Layout

This reference describes the complete artifact layout produced by the governance pipeline under `.swarm/logs/`. All paths are relative to the project's `.swarm/logs/` directory (e.g. `Projects/<project>/src/.swarm/logs/`).

---

## Artifact Layout

```
.swarm/logs/
├── pipeline/
│   ├── latest.json            ← Pointer to the most recent run-scoped audit tree
│   ├── pipeline.jsonl          ← Structured lifecycle event stream
│   ├── model-policy.jsonl      ← Effective model/thinking resolution log
│   ├── discord.jsonl           ← Persisted Discord notifications with run correlation
│   ├── nova-injections.jsonl   ← Nova escalation handoff audit log
│   ├── buster-telemetry-fallback.jsonl ← Buster Redis-telemetry fallback/degradation mirror
│   └── summary.json            ← End-of-run pipeline summary
├── architecture-validator/
│   ├── results.json            ← Machine-readable validator findings
│   ├── summary.md              ← Human-readable validator report
│   └── validator-prompt.md     ← Prompt used for agent judgment run
├── cost/
│   ├── usage-snapshots.jsonl   ← Per-agent usage records (append-only)
│   ├── cost-report.json        ← Aggregated cost/usage report
│   └── budget-events.jsonl     ← Budget warning/exceeded events
├── redis/
│   ├── redis-exchanges.jsonl   ← Redis send/receive records
│   └── redis-ops.jsonl         ← Redis completion/archive operation trace
├── gates/
│   └── <gate-id>/
│       ├── approval-request.json       ← Normalized approval request
│       ├── approval-request.md         ← Operator-facing summary
│       ├── approval-transitions.jsonl  ← Append-only state transitions
│       └── approval-decision.json      ← Final resolved decision
└── modules/
    └── <module-dir>/
        └── (attempt logs, prompts, transcripts — written by status-store)
```

Run-scoped pipeline audit mirrors live under:

```text
.swarm/logs/pipeline/runs/<run-id>/
├── pipeline.jsonl
├── discord.jsonl
├── nova-injections.jsonl
├── buster-telemetry-fallback.jsonl
├── summary.json
└── redis/
    ├── redis-exchanges.jsonl
    └── redis-ops.jsonl
```

`.swarm/logs/pipeline/latest.json` is the operator shortcut to the most recent run. It records the current `run_id`, the canonical live `telemetry_stream_key`, and the relative paths to that run's `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, `buster-telemetry-fallback.jsonl`, `redis/redis-exchanges.jsonl`, `redis/redis-ops.jsonl`, and `summary.json`.

Approval-gate artifacts and state carry the same core correlation envelope: `gate_id`, `gate_type`, `run_id`, and `project`.
Transition entries in `approval-transitions.jsonl` also persist `run_id`, `project`, `gate_id`, and `gate_type` alongside each state change.
`summary.json` keeps the same governance correlation: top-level `telemetry_stream_key` plus `.artifacts.*` mirror the same run-scoped replay bundle named in `latest.json`, while `.governance.arch_validator` carries `run_id` and `project`, and `.governance.approval_gates[]` persists `gate_id`, `gate_type`, `run_id`, `project`, plus the approval state/request/decision/transition artifact paths.
Those same summary approval entries also persist `decision_via`, normalized `timeout_policy`, and `continued`, so offline replay can distinguish a blocking timeout from an auto-continued timeout without reopening the raw gate-state file.
`summary.json.governance.overall_outcome` now distinguishes `CONTINUED_AFTER_APPROVAL_TIMEOUT` and `CANCELLED_BY_OPERATOR`, so auto-continued approval timeouts and operator cancellations no longer collapse into the same halted or unknown summary state.

---

## Pipeline Event Stream (`.swarm/logs/pipeline/pipeline.jsonl`)

Every major lifecycle transition appends a structured event to `.swarm/logs/pipeline/pipeline.jsonl`. This file is the primary instrument for reconstructing what happened in a run.

The Redis telemetry stream is a capped live/consumer window (`MAXLEN ~10000`), not the durable audit log. Use the run-scoped `pipeline/runs/<run_id>/pipeline.jsonl` replay bundle for complete post-mortem reconstruction; when Redis emission succeeds, the Redis-owned `seq` is mirrored into this artifact so ordered replay survives stream trimming.

Both Nova-side pipeline telemetry and Buster-side canonical telemetry mirrors append here, so `source` / `emitter` identify which runtime produced a given event.

### Agent lifecycle authority

After the Phase 6 agent-observability cutover, agent runtime observability and lifecycle authority are exclusive to the self-contained OpenClaw hook plugin Redis path. The plugin is loaded from `/app/dist/extensions/kubeclaw-agent-observer` in production and does not import pipeline skill code from `/app/skills`:

```text
OpenClaw hook event
  -> pipeline:agent-observability:control:v1
  -> kubeclaw agent-observability ingester
  -> canonical agent.* telemetry
```

ACP/Gateway session-status polling, transcript monitor state, and `forge-completion.json` are not agent observability or lifecycle truth and must not be used as fallback completion/readiness authority. If hook/Redis/ingester evidence is missing, the run should report degraded/fail-closed lifecycle evidence instead of silently switching to a legacy observer path. Gateway remains available for command/control operations such as spawn, stop/kill, steer/nudge, and platform health checks.

### Event envelope

Every event has these fields:

```json
{
  "v": 1,
  "type": "<event_type>",
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "project": "my-project",
  "source": "pipeline",
  "emitter": "nova/pipeline/services/observability",
  "<additional fields per event type>"
}
```

### Covered event types

| Event | When emitted |
|---|---|
| `pipeline.started` | Pipeline begins execution |
| `pipeline.completed` | Pipeline finishes normally |
| `pipeline.halted` | Pipeline halted early (blocked, needs Nova, etc.) |
| `module.started` | Module execution begins |
| `module.status_changed` | Module status changes, including PASS, FAIL, and BLOCKED |
| `gate.started` | Gate execution begins |
| `gate.verdict` | Gate returns GO or NO-GO |
| `agent.spawned` | Session-backed agent work (Forge, Echo, subagent-backed fixes) spawned |
| `agent.killed` | Session-backed agent work terminated |
| `retry.scheduled` | Retry queued after a failure |
| `retry.exhausted` | All retries consumed |
| `error.escalation` | Run escalated to NEEDS_NOVA or BLOCKED |
| `summary.started` | Post-run summary flow begins (`summary_type`: `pipeline`, `pipeline_review`, `case_study`, or `project_summary`) |
| `summary.completed` | Post-run summary flow completes with typed `terminal_status`/`reason_code`, artifact/session identity when relevant, and pipeline summary join fields like `summary_json_path`, `pipeline_summary_path`, and `latest_json_path` |
| `cost.update` | Token and cost usage recorded |
| `budget.warning` | Cost or token threshold crossed |
| `budget.exceeded` | Hard budget limit exceeded |
| `approval.requested` | Approval gate posted |
| `approval.resolved` | Approval gate decision recorded |
| `rate_limit.detected` | A rate-limit pause is triggered |
| `observability.degraded` | Visibility is impaired on a critical surface |
| `observability.restored` | A degraded observability surface recovers |
### Inspecting the event stream

```bash
# Read all events for a run
cat .swarm/logs/pipeline/pipeline.jsonl | jq '.'

# Find all module FAIL transitions
cat .swarm/logs/pipeline/pipeline.jsonl | jq 'select(.type == "module.status_changed" and .new_status == "FAIL")'

# Find budget events
cat .swarm/logs/pipeline/pipeline.jsonl | jq 'select(.type | startswith("budget."))'
```

---

## Discord Audit Log (`.swarm/logs/pipeline/discord.jsonl`)

Every Discord notification is also persisted as JSONL in both the top-level operator log and the run-scoped mirror. This keeps the operator surface auditable even when the webhook destination is unavailable or external message history is incomplete.

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "project": "my-project",
  "run_id": "run-<timestamp>",
  "session_key": "agent:forge:session123",
  "attempt": 2,
  "module_id": "07-observability-cost-and-budgeting",
  "gate_id": null,
  "dispatch_id": null,
  "level": "WARN",
  "title": "Module 07 RATE LIMITED",
  "description": "Pausing before retry after provider rate limit.",
  "fields": [
    { "name": "Session", "value": "agent:forge:session123", "inline": true }
  ]
}
```

These records are written before webhook delivery is attempted, so the local audit trail remains available even if Discord posting fails. When correlation fields like session, attempt, module, gate, or dispatch are already present in embed fields, the persisted artifact also normalizes them into top-level keys for easier replay and audit joins.

If live Discord webhook delivery itself fails, Nova also emits `observability.degraded` on the `webhook` surface with the same module, gate, session, gateway-label, attempt, and dispatch correlation when known, and later emits `observability.restored` after a successful post for that run. This makes operator-surface visibility loss explicit instead of relying on warn logs plus resumed message flow.

If writing `.swarm/logs/pipeline/discord.jsonl` or the run-scoped `discord.jsonl` mirror fails, Nova emits `observability.degraded` on the `audit_log` surface and later emits `observability.restored` once Discord audit writes resume for that run. This keeps replay-gap incidents explicit instead of silently breaking cross-surface joins while live Discord delivery still succeeds.

---

## Buster Telemetry Fallback (`buster-telemetry-fallback.jsonl`)

Buster is a separate Redis-connected worker, so Nova-owned run evidence is normally mirrored from the canonical run telemetry stream. If Buster expects Redis telemetry but cannot initialize or emit to Redis, it writes an explicit `observability.degraded` fallback record into both its task-local `telemetry-fallback.jsonl` and the run-scoped `pipeline/runs/<run-id>/buster-telemetry-fallback.jsonl` when run paths are available. The same degradation is also mirrored into run `pipeline.jsonl` with `artifact_fallback: true` and `seq: null`, making the Redis visibility gap operator-visible without pretending it was successfully sequenced on the Redis stream.

If Buster telemetry is intentionally disabled (`enabled: false`), no degraded fallback is emitted; that path is treated as an explicit diagnostic/offline mode, not a Redis outage.

### Trust boundaries for Buster/operator surfaces

- **Buster Redis task stream:** Redis task payloads are untrusted transport data until `validateBusterTaskPayload(...)` accepts their typed identity (`task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, and gate identity for gate tasks). Malformed or weak-identity tasks are acknowledged only after writing rejection evidence; they must not create lifecycle authority from partial payload fields.
- **Buster Redis completion stream:** completion entries remain a compatibility input for Nova polling/reconciliation, not standalone truth. Scheduler/recovery code must consume the projection/arbitration layer before deciding pass/fail/rate-limit/blocked state.
- **Discord/audit artifacts:** Discord fields and embeds are operator evidence only. They may mirror known run/module/gate/session/dispatch identity for replay, but they must not be parsed back into lifecycle authority or promoted from display labels into canonical join keys.
- **Fallback/degraded artifacts:** Buster fallback records preserve known typed join keys, carry `artifact_fallback: true` / `seq: null` when Redis is unavailable, and remain diagnostic evidence rather than Redis-ordered canonical telemetry.
- **Custom skills overlay:** Helm `customSkills` is an extension surface only. It is guarded from replacing protected runtime paths such as `pipeline/**`, `common/**`, `nova/pipeline/**`, `buster/pipeline/**`, `redis.ts`, `buster-pipeline.ts`, and `verify-task.ts`; custom overlays must not be used as a compatibility patch path for core runtime behavior.

---

## Model/Thinking Policy Log (`.swarm/logs/pipeline/model-policy.jsonl`)

Every agent spawn appends an effective-resolution record to `.swarm/logs/pipeline/model-policy.jsonl`. This file answers "which model ran, and why?" for any execution in the run.

### Record schema

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "project": "my-project",
  "scope": "module_forge",
  "agent": "forge",
  "module_id": "03-my-module",
  "model": "anthropic/claude-sonnet-4-6",
  "model_source": "scope_policy",
  "thinking": null,
  "thinking_source": "none",
  "thinking_supported": true
}
```

### Source values

| Source | Meaning |
|---|---|
| `runtime_override` | `--model` CLI flag set at invocation |
| `scope_policy` | Module `forge_model` or gate `model` field in `progress.json` |
| `project_default` | `progress.defaults.models.<agentName>` |
| `platform_fallback` | `fallback_model` from `swarm.config.json` |
| `none` | No value found at any level |
| `not_supported_on_redis` | Thinking not forwarded on Redis/Buster dispatch path |

### Inspecting effective model resolution

```bash
# See which model ran for each scope in a run
cat .swarm/logs/pipeline/model-policy.jsonl | jq '{scope, agent, module_id, model, model_source}'

# Find any runtime overrides applied
cat .swarm/logs/pipeline/model-policy.jsonl | jq 'select(.model_source == "runtime_override")'

# Find all redis dispatch (thinking not supported)
cat .swarm/logs/pipeline/model-policy.jsonl | jq 'select(.thinking_supported == false)'
```

---

## Cost and Usage Artifacts

### `cost/usage-snapshots.jsonl`

Raw per-agent usage records. Each record represents one agent session's contribution, scoped to a module or gate.

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "agent_type": "forge",
  "module_id": "07-observability-cost-and-budgeting",
  "attempt": 1,
  "session_key": "forge-session-abc",
  "source": "session_status",
  "input_tokens": 12450,
  "output_tokens": 3820,
  "estimated_cost_usd": 0.0423,
  "partial": false
}
```

`partial: true` means the snapshot is incomplete — the total may undercount. This is recorded honestly rather than fabricating missing data.

### `cost/cost-report.json`

Machine-readable aggregated cost report written at end-of-run. Includes:

```json
{
  "generated_at": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "project": "my-project",
  "usage": {
    "run": { "input_tokens": 98200, "output_tokens": 21400, "estimated_cost_usd": 1.24, "partial": false },
    "by_module": {
      "07-observability-cost-and-budgeting": { "input_tokens": 12450, "output_tokens": 3820, "estimated_cost_usd": 0.0423, "partial": false }
    },
    "by_gate": {},
    "by_agent": {
      "forge": { "input_tokens": 54200, "output_tokens": 15100, "estimated_cost_usd": 0.78, "partial": false }
    }
  },
  "warnings": [],
  "availability": {
    "status": "full",
    "note": "Complete cost and token data available."
  }
}
```

`availability.status` values:
- `full` — complete cost and token data available
- `partial` — some snapshots marked partial; totals may undercount
- `tokens_only` — dollar cost unavailable for this provider; token counts recorded
- `unavailable` — no usage data captured (provider doesn't expose token/cost info)

### `cost/budget-events.jsonl`

Emitted when a configured threshold is crossed. Events are written here AND emitted as WARN logs.

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "type": "budget.warning",
  "threshold": "warn_cost_usd",
  "current": 1.24,
  "limit": 1.00,
  "unit": "usd",
  "current_cost_usd": 1.24,
  "budget_usd": 1.00,
  "percent_used": 124
}
```

Event types: `budget.warning`, `budget.exceeded`.

---

## Budget Threshold Configuration

Budget thresholds are configured under `observability.budget` in `swarm.config.json`:

```json
{
  "observability": {
    "budget": {
      "warn_cost_usd": 1.00,
      "hard_limit_cost_usd": 5.00,
      "warn_tokens": 500000
    }
  }
}
```

| Key | Effect |
|---|---|
| `warn_cost_usd` | Emit `budget.warning` once estimated cost reaches this amount |
| `hard_limit_cost_usd` | Emit `budget.exceeded`; `isBudgetExceeded()` returns `true` |
| `warn_tokens` | Emit `budget.warning` when total token count reaches this amount |

Thresholds are **non-blocking by default** — they emit events and log warnings but do not halt the pipeline unless caller code explicitly checks `isBudgetExceeded()`.

---

## Redis Exchange Log (`redis/redis-exchanges.jsonl`)

Records every Redis send/receive during the run. Each line is a normal JSON object, not a JSON string nested inside JSONL, so replay tools can parse it with one `JSON.parse`.

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "direction": "sent",
  "type": "buster_task",
  "module_id": "07-observability-cost-and-budgeting",
  "session_key": "buster-session-abc",
  "payload": { "task": "...", "module_id": "..." }
}
```

## Redis Operation Trace (`redis/redis-ops.jsonl`)

Records Redis completion-read and archive operations that support the fast-path polling logic.

```json
{
  "ts": "2026-04-02T12:00:00.000Z",
  "run_id": "run-<timestamp>",
  "component": "redis",
  "op": "read_completion",
  "stream": "swarm:pipeline:demo:completions",
  "module": "07-observability-cost-and-budgeting",
  "found": true,
  "scanned_entries": 4,
  "scan_batches": 2
}
```

These records are written to both the global `.swarm/logs/redis/` directory and the run-scoped mirror under `.swarm/logs/pipeline/runs/<run-id>/redis/`.

---

## Non-Blocking Safety

All observability writes are non-blocking:

- Failures to write artifacts produce DEBUG log entries, not pipeline errors.
- Core pipeline execution continues if any observability code fails.
- Observability code does not introduce hidden retries or stalls.

This means: if a log directory is missing or a write fails silently, the pipeline still runs correctly. Artifacts may be missing but the run is not blocked.
