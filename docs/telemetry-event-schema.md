# Telemetry event schemas

Status: generated reference.

The authoritative envelope, correlation identity, individual payload schemas, composed event schemas, fixtures, and generated Go/TypeScript types live in `contracts/telemetry/v1/`.

Raw OpenClaw observations reach pipeline ingestion through the separate neutral bridge contract in `contracts/agent-observability/v1/`. Those records are source evidence, not canonical pipeline telemetry or lifecycle authority.

Canonical event families include pipeline/module/gate lifecycle, agent/session/model/tool evidence, prompt and response summaries, transcripts and progress, artifacts, runtime logs, producer health, Git/workspace evidence, quality/review/visual evidence, infrastructure evidence, immutable evaluation facts, terminal closure, and command lifecycle evidence.

Every event schema is closed (`additionalProperties: false`). New fields require a contract regeneration and review. Optional experimental data belongs in `extensions`; consumers must not infer authority from extension data.

Use the pipeline-owned verifier for contract, bundle, hash, replay, and projection checks:

```bash
npm run verify:observability
node skills/nova/pipeline/tools/observability-readiness.ts verify --run-dir <run-directory>
node skills/nova/pipeline/tools/observability-readiness.ts replay --run-dir <run-directory>
node skills/nova/pipeline/tools/observability-readiness.ts export --run-dir <run-directory> --output <bundle-directory>
```
