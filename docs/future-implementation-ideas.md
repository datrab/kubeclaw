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

## Automate progress.json generation and normalization

Status: candidate
Area: pipeline
Priority: high

### Summary

Add a source-backed `progress.json` generator/normalizer that can derive stable project workflow fields from `.swarm` module files, gate instruction files, app files, platform defaults, and a generated scaffold form with only the remaining blanks left for an agent or operator to fill.

### Why it matters

`progress.json` is a major manual error surface. Recent cleanup found that active project files can keep stale gate fields and stale review verdict wording after the runtime contract changes. A generator should make routine fields deterministic, create the form for the remaining decisions, and provide a diff before writing.

### Generated scaffold form

The explicit setup file should not start as a blank document. The project setup script creates `progress.scaffold.json` from discovered project facts, with defaults, candidate values, and clear `TODO` placeholders only where human or agent judgment is required.

Implemented first shape:

```json
{
  "_schema": "progress-scaffold/v1",
  "description": "TODO: one-sentence project purpose",
  "notes": [
    "TODO: operator-visible scope note"
  ],
  "policy": {
    "arch_validation": { "enabled": true },
    "pipeline_review": { "enabled": false },
    "case_study": { "enabled": false },
    "telemetry": { "enabled": true }
  },
  "execution_order": ["01-foundation", "TODO: place gate:final-review among [01-foundation]"],
  "modules": {},
  "gates": {}
}
```

The generator treats missing `TODO` values as blocking diagnostics, treats accepted inferred values as structured input, and keeps the final `progress.json` machine-oriented.

### Two-track implementation

The work should split into a project setup track and a runtime validation track.

Project setup skill/script:

- The first script is `skills/nova/project_setup/tools/progress-scaffold.ts`.
- The skill tells the agent to create module files, gate instruction files, Buster files, and the intended execution order first.
- The agent then runs the script to generate `progress.scaffold.json` from the project files already present.
- The generated form lists concrete values for fillable fields where possible, such as enabled/disabled toggles, review/Buster/approval gate types, preview modes, cleanup policies, inferred ports, health paths, Forge-only modules, and final validation gates.
- The skill should tell the agent exactly which fields require judgment and which choices are allowed, rather than asking it to author the full `progress.json` shape.
- After the gaps are filled, rerunning the same script with `--apply` validates and writes `.swarm/progress.json`.

Pipeline validator:

- Make pipeline config validation strict for fields with checkable truth: object shapes, required keys, enum values, safe paths, gate references, execution order references, module directories, required files, model aliases, suite names, and stale field names.
- Validate content when the repository gives deterministic evidence, such as `test-spec.json` existence for `api`, baseline metadata for `visual-reg`, Dockerfile/manifest paths, service names, health paths, ports, package test scripts, and Kubernetes manifest shape.
- Use form-only validation when semantic correctness is dynamic or ambiguous. Examples: whether a note is a good operator note, whether a review instruction is sufficiently nuanced, whether a gate placement is product-wise ideal, or whether inferred content matches the author's intent.
- Form-only validation should still fail missing required text, unresolved `TODO`, wrong type, invalid enum, unsafe path, or references to files that do not exist.
- Diagnostics should distinguish `strict_content_check` from `form_check` so operators know whether the pipeline proved the content or only proved the shape.

### Derivation map

| `progress.json` area | Likely source | Automation level |
| --- | --- | --- |
| `project` | `Projects/<project>/src/.swarm` path | derive |
| `version` | generator schema version | derive |
| `description`, `notes` | generated scaffold form plus optional `ARCHITECTURE.md` front matter | explicit with generated blanks |
| `defaults.models`, `defaults.thinking`, `payload.rate_limit` | platform defaults plus optional project intent overrides | default and normalize |
| `arch_validation`, `pipeline_review`, `case_study`, `telemetry` | generated scaffold form policy toggles | explicit, with defaults |
| `modules.<id>.dir` | `.swarm/modules/<dir>` inventory | derive |
| `modules.<id>.title` | first heading in module `FORGE.md` | derive with override |
| `modules.<id>.substeps` | child directories containing `FORGE.md` | derive |
| `modules.<id>.stages` | presence of `BUSTER.md`, `test-spec.json`, baselines, or suite hints | infer, then add confirmation prompts for non-trivial cases |
| `modules.<id>.depends_on` | module number/order plus explicit dependency annotations | mostly derive; gate dependencies remain explicit |
| `modules.<id>.test_suites` | `BUSTER.md`, `test-spec.json`, `baselines/`, manifest paths, Dockerfile/app files | infer and validate |
| `modules.<id>.test_config.serve` | package scripts, Dockerfile, health endpoint docs, port usage | infer best-effort, require confirmation |
| `modules.<id>.test_config.unit` | `package.json`, pytest/vitest/node:test files, `FORGE.md` Unit Tests section | infer |
| `modules.<id>.test_config.api` | `test-spec.json` location | derive |
| `modules.<id>.test_config.manifest` | Kubernetes YAML paths and required env in manifests | infer and validate |
| `modules.<id>.test_config.k8s` | Kubernetes manifests, service name, container port, health probes | infer with explicit preview/cleanup policy |
| `gates.<id>` | files under `.swarm/echo-review/`, `.swarm/buster-test/`, and generated scaffold execution order | derive fields, keep placement explicit |
| `execution_order` | module directory sort plus generated scaffold gaps for gate insertion | explicit with generated blanks |
| `phases` | architecture/module grouping metadata | derive when present, informational only |

### Proposed automation

1. Add the project setup script that emits discovered facts and `progress.scaffold.json`. First pass exists at `skills/nova/project_setup/tools/progress-scaffold.ts`.
2. Update the project setup skill to tell agents to create module/gate files, choose execution order/gate placement, run the script, and fill only the generated form gaps. First pass is documented in `skills/nova/project_setup/SKILL.md`.
3. Add a read-only analyzer mode that emits a canonical candidate object and diagnostics without writing.
4. Add a normalizer mode that rewrites stale field names, canonical verdict wording, model aliases, and path shapes inside an existing `progress.json`.
5. Add strict validator coverage for checkable fields and explicit form-check diagnostics for dynamic fields.
6. Add or improve generator behavior that reads the discovered facts plus filled scaffold form and shows a clearer diff against `progress.json`.
7. Keep apply mode gated on clean scaffold validation and current project setup docs.
8. Add verification that active project examples and smoke projects do not contain stale gate fields or stale verdict wording.

### Notes

Related files: `skills/nova/project_setup/progress-json.md`, `skills/nova/project_setup/module-files.md`, `docs/reference/progress-json.md`, `skills/nova/pipeline/core/config.ts`, `skills/nova/pipeline/services/validation.ts`, and `Projects/pipeline-smoke-landing/src/.swarm/progress.json`.

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

Related files: `scripts/docs-generate.mjs`, `scripts/docs-inventory.mjs`, `docs/reference/verification-commands.md`, and `docs/generated/inventory/`.

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

Related issue: the clean-cluster deployment gap in `docs/open-issues.md`.

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
