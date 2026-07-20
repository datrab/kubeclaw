# Telemetry contract v1

Status: canonical machine contract is `contracts/telemetry/v1/`.

The pipeline publishes one flat, versioned envelope. Every event has `schema_version`, `event_id`, `type`, `occurred_at`, `emitted_at`, `seq`, `cursor`, `project`, `run_id`, `source`, and `producer`. Correlation fields and event payload fields remain top-level. The generated per-event schemas reject unknown fields; deliberate extension data uses `extensions`.

`seq` is unique and monotonic within `(project, run_id)` and may contain gaps. The portable semantic cursor is `<project>/<run_id>/<seq>`. Redis IDs are transport cursors only. Event identity is the stable `event_id`; retries retain logical artifact identity and are deduplicated by artifact logical ID plus content hash.

The shared correlation structure covers project, run, work, gate, attempt, dispatch, session, agent, model call, tool call, source, and producer. Work-owned events without authoritative work identity are quarantined. Producers must preserve every native identifier they know and must never recover identity from display labels or timestamps.

Canonical live delivery uses `pipeline:telemetry:<project>:<run_id>`. Redis is a bounded live window. Durable replay uses the run archive and lifecycle event spine. Invalid or transport-lost content is written to `runs/<run_id>/quarantine.jsonl`; quarantined records are never assigned a canonical sequence or replay authority.

Large admitted prompts, responses, transcripts, observer events, tool payloads, diffs, images, and reports use bundle-relative content-addressed references under `runs/<run_id>/blobs/sha256/<prefix>/<hash>`. `artifacts.jsonl` is the append-only artifact catalog.

Runtime payload validators are verified against the generated event inventory. Regenerate with:

```bash
node scripts/generate-telemetry-contracts.mjs
```

CI verifies drift with:

```bash
npm run verify:observability
```

Lifecycle events remain scheduler authority. Telemetry, runtime logs, Discord, Kubernetes logs, artifacts, and observer evidence explain execution but cannot mutate scheduler truth.
