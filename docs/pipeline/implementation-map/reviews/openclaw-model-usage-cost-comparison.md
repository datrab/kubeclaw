# OpenClaw `model.usage` cost path migration

Status: implemented
Date: 2026-05-18

## Runtime flow

```text
OpenClaw runtime
  emits diagnostic model.usage
OpenClaw agent observer plugin
  normalizes to openclaw.model.usage
  XADD pipeline:agent-observability:control:v1
Nova pipeline runner
  runs openclaw plugins enable kubeclaw-agent-observer when swarm.config.json has agent_observability.plugin_control.enabled=true
  starts AgentObservabilityIngester when swarm.config.json has agent_observability.ingester.enabled=true
AgentObservabilityIngester
  XREADGROUP/XAUTOCLAIM control stream
  prepares cumulative run aggregate from usage snapshots + current delta
  maps to cost.update with delta and cumulative fields
  emits canonical telemetry
  appends .swarm/logs/cost/usage-snapshots.jsonl after successful emit
observability.js
  owns aggregateUsage(config), writeCostReport(config), and budget warning helpers
  writes .swarm/logs/cost/cost-report.json
summary/runner callers
  import observability.js directly; no cost.js shim remains
Nova pipeline runner cleanup
  stops ingester
  runs openclaw plugins disable kubeclaw-agent-observer
```

Runtime enablement is config-only:

```json
{
  "agent_observability": {
    "ingester": {
      "enabled": true
    }
  }
}
```

`OPENCLAW_AGENT_OBSERVABILITY_INGESTER_ENABLED` is intentionally not supported as an enablement gate.

## Behavior after migration

| Behavior | Owner now |
| --- | --- |
| Raw usage/cost source | OpenClaw diagnostic `model.usage` |
| Redis transport | `plugins/openclaw-agent-observer` writes `openclaw.model.usage` |
| Redis consumer | `skills/nova/pipeline/services/agent-observability-ingester/` |
| `cost.update` emission | Agent-observability ingester mapper |
| Cumulative usage snapshots | `observability.js` snapshots via ingester `usage-aggregation.ts` |
| Operator cost report | `observability.js writeCostReport(config)` |
| Summary usage block | `summary.js` reads `observability.js aggregateUsage(config)` |
| Budget warning artifacts | `observability.js checkBudgetThresholds(...)` / `emitBudgetWarnings(...)` |

## Retired completely

`skills/nova/pipeline/services/cost.ts` was removed. The previous helper/facade APIs are not used:

- `captureSessionSnapshot(...)`
- `writeUsageArtifact(...)`
- `accumulateTokens(...)`
- `writeCostReport(...)` from `cost.js`
- `checkBudgetThresholds(...)` from `cost.js`
- Gateway/session-status cost snapshot dependency
- runtime-stat cost fallback

## Remaining limitations

- Module/gate attribution depends on identity fields available on `openclaw.model.usage`; if OpenClaw only emits session identity, module/gate cost views need a future correlation table.
- USD conversion from raw tokens is not implemented here. We trust OpenClaw `costUsd` when present. A future ClawDeck/provider-pricing pass can add token-to-dollar conversion if runtime diagnostics do not include cost.
- The ingester loop runs inside the Nova pipeline runner process. If future ClawDeck needs always-on ingestion independent of a pipeline run, run the same ingester as a dedicated worker.
