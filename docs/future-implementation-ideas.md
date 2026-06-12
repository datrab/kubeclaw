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

## Add hostname-aware egress policy

Status: idea
Area: operators
Priority: medium

### Summary

Add a supported CiliumNetworkPolicy, egress proxy, or equivalent hostname-aware egress layer after maintainers choose the cluster networking baseline.

### Why it matters

The current repository includes `my-values/infra/network-policies.yaml`, and deployment truth verifies 13 portable Kubernetes NetworkPolicy resources. Those policies are intentionally port-based and allow broad TCP `22`, `80`, and `443` egress for agents, LiteLLM, and registry-mirror where required. Hostname restrictions for GitHub, GHCR, Docker Hub, and model providers need a non-portable policy layer.

### Notes

Related docs: `docs/deployment/networking.md`, `docs/architecture/security-model.md`, and `docs/operators/security-operations.md`.

## Expand generated reference inventory

Status: candidate
Area: reference
Priority: high

### Summary

Extend generated inventories beyond the current deployment/script/reference slice to cover telemetry events, Redis streams, status/artifact paths, Buster task payload fields, test suites, and config validation fields.

### Why it matters

These facts are operator-facing and drift-prone. The current docs are source-backed by inspected files, but broader generated inventory would reduce future manual sync work.

### Notes

Related files: `scripts/docs-generate.mjs`, `scripts/docs-inventory.mjs`, `docs/reference/verification-commands.md`, and `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`.

## Add Kubernetes-native observability resources

Status: idea
Area: operators
Priority: medium

### Summary

Add first-class Kubernetes observability resources for metrics, log collection, and dashboards after maintainers choose the target stack.

### Why it matters

Current source-backed observability is pipeline artifacts, Redis telemetry streams, Discord audit/fallback artifacts, and process/container logs. The repository does not include ServiceMonitor, PodMonitor, Prometheus scrape annotations, Loki/Fluent Bit shippers, or OpenTelemetry collectors. Adding a supported stack would make cluster operations easier to monitor.

### Notes

Related docs: `docs/architecture/observability-model.md`, `docs/operators/debugging.md`, and `docs/reference/telemetry-events.md`.

## Add a full clean-cluster quickstart bootstrap

Status: idea
Area: docs
Priority: medium

### Summary

Create a maintained bootstrap path that provisions prerequisites, secrets, infrastructure, agent releases, smoke checks, and rollback instructions for a clean cluster.

### Why it matters

The current docs intentionally stop at source-verified render and deployment truth checks. A complete bootstrap would reduce first-run ambiguity for operators.

### Notes

Related issue: `DOCS-2026-06-05-001` in `docs/open-issues.md`.

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

## Fully retire diagnostic state artifacts after replacement operator surfaces exist

Status: idea
Area: pipeline
Priority: medium

### Summary

Evaluate removing write-only module and gate diagnostic state artifacts after lifecycle/read-model projections and operator tooling provide equivalent bootstrap, audit, and troubleshooting surfaces.

### Why it matters

The current authority model already treats module lifecycle read models as scheduler truth and historical state artifacts as diagnostic/operator evidence. Removing the remaining diagnostic writes could reduce filesystem I/O and simplify recovery reasoning, but only after operators no longer depend on those files.

### Notes

Related current tracker state: OI-34 resolved the authority split by cutting scheduler reads of module state artifacts; gate state remains diagnostic except approval/operator-decision and confirmed rate-limit evidence branches. Do not remove these artifacts without a migration/cutoff contract and replacement operator workflow.
