# Existing TypeScript Islands

Purpose: document TypeScript files that already exist under the skills pipeline scope and decide whether they stay in place, move, or become part of the new canonical TS project layout.

## Buster agent-observability facade

- File/package path: `skills/buster/pipeline/agent-observability/src/index.ts`.
- Current build/typecheck command: no package-local command found in this slice; file is a direct TypeScript re-export.
- Runtime consumer: contract verification imports the Buster shim; no direct Buster runtime consumer found in pipeline source.
- Generated output: none found in this slice.
- Migration impact: role-local TypeScript facade over `skills/common/pipeline/agent-observability/src/index.ts`; keep aligned with common TypeScript island and decide later whether role facades remain as external adapters.

## Common agent-observability contract island

- File/package path: `skills/common/pipeline/agent-observability/src/{constants,index,mapping,masking,routing,types,validation}.ts`.
- Current build/typecheck command: no package-local command was run in Phase 0; files are direct TypeScript source imports/re-exports used by role facades and Nova agent-observability services.
- Runtime consumer: Nova `services/agent-observability-ingester/*` and `services/agent-observability-evidence/*` import through the Nova role facade/common index; Buster and Nova role-local `agent-observability/src/index.ts` files re-export this common index; `consumer.ts` validates Redis stream records with `assertAgentObservabilityIngressEvent`.
- Generated output: none observed in this slice.
- Migration impact: keep as the canonical shared TypeScript contract island for agent-observability; `validation.ts` is already TypeScript and should remain with the contract types/constants. Preserve role facades as adapters unless export/package layout is changed deliberately.

## Nova agent-observability facade

- File/package path: `skills/nova/pipeline/agent-observability/src/index.ts`.
- Current build/typecheck command: no package-local command found in this slice; file is a direct TypeScript re-export.
- Runtime consumer: no direct Nova runtime importer found in the pipeline source during this slice; Nova role-local/contract imports can use it as a facade over the common contract island.
- Generated output: none found in this slice.
- Migration impact: role-local TypeScript facade over `skills/common/pipeline/agent-observability/src/index.ts`; keep aligned with the common TypeScript island and decide later whether role facades remain external adapters.

## Nova agent-observability evidence comparator

- File/package path: `skills/nova/pipeline/services/agent-observability-evidence/comparator.ts`.
- Current build/typecheck command: no package-local command was run in Phase 0; file is direct TypeScript source imported by the adjacent evidence index.
- Runtime consumer: `skills/nova/pipeline/services/agent-observability-evidence/index.ts` re-exports `compareAgentObservabilityParallelRunEvidence`; no direct JS runtime importer was found in this batch search.
- Generated output: none observed in this slice.
- Migration impact: keep as an existing TypeScript island for evidence-only hook-vs-legacy observability comparison. It depends on the Nova/common agent-observability contract island and adjacent `types.ts`; preserve pure comparator behavior while JS callers around it are migrated.

## Nova agent-observability evidence index and types

- File/package path: `skills/nova/pipeline/services/agent-observability-evidence/{index,types}.ts`.
- Current build/typecheck command: no package-local command was run in Phase 0; files are direct TypeScript source imported by the adjacent comparator/index.
- Runtime consumer: no direct JS runtime importer found in pipeline source; `index.ts` is the evidence island surface and re-exports the comparator plus types.
- Generated output: none observed in this slice.
- Migration impact: keep with the existing comparator TypeScript island; it depends on the Nova/common agent-observability contract island and should remain type-only/reporting-focused.

## Nova agent-observability ingester island

- File/package path: `skills/nova/pipeline/services/agent-observability-ingester/{config,consumer,index,mapper,usage-aggregation}.ts`.
- Current build/typecheck command: no package-local command was run in Phase 0; JS runtime imports the `.ts` index directly.
- Runtime consumer: `skills/nova/pipeline/services/agent-observability-runtime.ts` imports `createAgentObservabilityIngester`; `runners/pipeline-runner.js` starts/stops that runtime wrapper.
- Generated output: none observed in this slice.
- Migration impact: keep as a TypeScript island around Redis hook ingestion while migrating surrounding JS callers. It depends on the common agent-observability contract island, Nova Redis transport, telemetry dispatch, observability reporting, and usage accounting.
