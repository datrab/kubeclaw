# Observability Reference — `.swarm/logs/` Artifact Layout

This reference describes the complete artifact layout produced by the governance pipeline under `.swarm/logs/`. All paths are relative to the project's `.swarm/logs/` directory (e.g. `Projects/<project>/src/.swarm/logs/`).

---

## Artifact Layout

```
.swarm/logs/
├── pipeline/
│   ├── pipeline.jsonl          ← Structured lifecycle event stream
│   ├── model-policy.jsonl      ← Effective model/thinking resolution log
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
│   └── redis-exchanges.jsonl   ← Redis send/receive records
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

---

## Pipeline Event Stream (`pipeline/pipeline.jsonl`)

Every major lifecycle transition appends a structured event to `pipeline.jsonl`. This file is the primary instrument for reconstructing what happened in a run.

### Event envelope

Every event has these fields:

```json
{
  "event": "<event_type>",
  "run_id": "run-<timestamp>",
  "project": "my-project",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "<additional fields per event type>"
}
```

### Covered event types

| Event | When emitted |
|---|---|
| `pipeline_started` | Pipeline begins execution |
| `pipeline_completed` | Pipeline finishes normally |
| `pipeline_halted` | Pipeline halted early (blocked, needs Nova, etc.) |
| `module_started` | Module execution begins |
| `module_pass` | Module reaches PASS |
| `module_fail` | Module attempt fails |
| `module_blocked` | Module reaches BLOCKED (max fails exceeded) |
| `gate_started` | Gate execution begins |
| `gate_pass` | Gate passes |
| `gate_fail` | Gate fails |
| `agent_spawned` | Agent (Forge, Echo, Buster) spawned |
| `agent_killed` | Agent terminated |
| `retry_scheduled` | Retry queued after a failure |
| `retry_exhausted` | All retries consumed |
| `escalated` | Run escalated to NEEDS_NOVA or BLOCKED |
| `summary_started` | Summary generation begins |
| `summary_completed` | Summary generation complete |
| `budget_warning` | Cost or token threshold crossed |
| `budget_exceeded` | Hard budget limit exceeded |
| `approval_requested` | Approval gate posted to Discord |
| `approval_resolved` | Approval gate decision recorded |

### Inspecting the event stream

```bash
# Read all events for a run
cat .swarm/logs/pipeline/pipeline.jsonl | jq '.'

# Find all failures
cat .swarm/logs/pipeline/pipeline.jsonl | jq 'select(.event == "module_fail")'

# Find budget events
cat .swarm/logs/pipeline/pipeline.jsonl | jq 'select(.event | startswith("budget_"))'
```

---

## Model/Thinking Policy Log (`pipeline/model-policy.jsonl`)

Every agent spawn appends an effective-resolution record to `model-policy.jsonl`. This file answers "which model ran, and why?" for any execution in the run.

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
| `config_default` | `config.models.<agentName>` from `swarm.config.json` |
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
  "type": "cost_warning",
  "threshold": 1.00,
  "actual": 1.24,
  "message": "Cost $1.2400 exceeds warning threshold $1.00"
}
```

Event types: `cost_warning`, `cost_exceeded`, `token_warning`.

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
| `warn_cost_usd` | Emit `cost_warning` event when estimated cost reaches this amount |
| `hard_limit_cost_usd` | Emit `cost_exceeded` event; `isBudgetExceeded()` returns `true` |
| `warn_tokens` | Emit `token_warning` event when total token count reaches this |

Thresholds are **non-blocking by default** — they emit events and log warnings but do not halt the pipeline unless caller code explicitly checks `isBudgetExceeded()`.

---

## Redis Exchange Log (`redis/redis-exchanges.jsonl`)

Records every Redis send/receive during the run.

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

---

## Non-Blocking Safety

All observability writes are non-blocking:

- Failures to write artifacts produce DEBUG log entries, not pipeline errors.
- Core pipeline execution continues if any observability code fails.
- Observability code does not introduce hidden retries or stalls.

This means: if a log directory is missing or a write fails silently, the pipeline still runs correctly. Artifacts may be missing but the run is not blocked.
