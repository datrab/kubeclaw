# Future implementation ideas

Status: active
Owner: Nova / maintainers

## Purpose

This file tracks implementation ideas that are useful but not yet committed work.

Use this for:

- future architecture improvements
- possible pipeline/runtime enhancements
- developer-experience improvements
- operational improvements
- documentation improvements that are larger than a quick edit

Do not use this as a promise or roadmap. Items here are candidates only.

## Entry format

```md
## <idea title>

Status: idea | needs design | candidate | rejected
Area: pipeline | buster | docs | operators | developers | system | reference
Priority: low | medium | high

### Summary

Short description.

### Why it matters

Reason this might be worth doing.

### Notes

Important constraints, risks, or related files.
```

## Ideas

_Add future implementation ideas here._

## Add first-class OpenClaw agent observer CLI status command

Status: idea
Area: operators
Priority: low

### Summary

Expose the existing `kubeclaw-agent-observer` service status through a dedicated plugin CLI command, for example:

```bash
openclaw kubeclaw-agent-observer status
```

The command should print enabled state, registered hooks, Redis configured/connected state, queued/written/dropped counters, retry/dead-letter counters, and last error metadata.

### Notes

The plugin service now has a `status()` method with the underlying data. This item is only the operator CLI UX (`api.registerCli(...)`), not the runtime status plumbing.

## Audit OpenClaw diagnostic events as replacements for HTTP/status health polling

Status: idea
Area: pipeline
Priority: medium

### Summary

Revisit `onDiagnosticEvent(...)` beyond the already-ingested `model.usage` signal and decide whether selected diagnostic event families should supplement or replace current HTTP/Gateway status polling for health/runtime visibility.

### Why it matters

Phase 6 makes OpenClaw hook/Redis events the authoritative runtime observability ingress for lifecycle. Diagnostic events expose additional runtime health and system signals that may reduce dependency on Gateway HTTP/status polling for non-lifecycle health surfaces.

### Notes

Candidate event families to audit later: `session.state`, `session.long_running`, `session.stalled`, `session.stuck`, `diagnostic.heartbeat`, `diagnostic.liveness.warning`, `diagnostic.phase.completed`, `diagnostic.memory.sample`, `diagnostic.memory.pressure`, `payload.large`, `tool.loop`, `tool.execution.*`, `run.*`, `model.call.*`, `message.*`, and `queue.lane.*`.

Constraint: do not make diagnostic events lifecycle/readiness authority without an explicit authority decision. Hook/Redis lifecycle remains authoritative; diagnostics should stay supplemental health/debug/cost evidence unless promoted deliberately.

Related review: `docs/pipeline/implementation-map/reviews/openclaw-hook-telemetry-comparison.md`.

## Add ClawDeck/provider pricing projection for usage without runtime USD cost

Status: idea
Area: pipeline
Priority: medium

### Summary

OpenClaw `model.usage` now feeds `cost.update`, cumulative usage snapshots, and `observability.js` cost reports when the runtime emits `costUsd`. Later, add a ClawDeck/provider-pricing projection that can convert tokens to dollar estimates when `model.usage.costUsd` is absent.

### Why it matters

Some providers/auth modes may emit token counts but not USD cost. ClawDeck can still display estimated dollar cost if we add an explicit pricing table/projection with clear “estimated” semantics.

### Notes

Review note: `docs/pipeline/implementation-map/reviews/openclaw-model-usage-cost-comparison.md`.

Keep runtime `costUsd` as the preferred source when present. Any token-to-dollar conversion must be visibly marked as estimated and versioned by provider/model pricing data.

## Fully retire diagnostic legacy status files after replacement operator surfaces exist

Status: idea
Area: pipeline
Priority: medium

### Summary

Evaluate removing write-only module `status.json` and gate `*-gate-status.json` diagnostic artifacts after lifecycle/read-model projections and operator tooling provide equivalent bootstrap, audit, and troubleshooting surfaces.

### Why it matters

The current authority model already treats module lifecycle read models as scheduler truth and legacy status files as diagnostic/operator evidence. Removing the remaining diagnostic writes could reduce filesystem I/O and simplify recovery reasoning, but only after operators no longer depend on those files.

### Notes

Related current tracker state: OI-34 resolved the authority split by cutting scheduler reads of module `status.json`; gate status remains diagnostic except approval/operator-decision and confirmed rate-limit evidence branches. Do not remove these artifacts without a migration/cutoff contract and replacement operator workflow.
