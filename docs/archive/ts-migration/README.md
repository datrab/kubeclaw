# TypeScript Migration Docs

This folder owns the JavaScript-to-TypeScript pipeline migration planning artifacts.

Scope for the current migration: pipeline-relevant code under `kubeclaw-main/skills/*` only. Tests and verification harnesses are intentionally out of scope for now.

## Files

| File | Purpose |
|---|---|
| `phase-plan.md` | Overall migration strategy and phase ordering. |
| `phase-0-batch-plan.md` | Concrete Phase 0 read/migration batches, with every JS migration target named. |
| `phase-2-batch-plan.md` | Concrete Phase 2 implementation batch scope. |
| `phase-3-batch-plan.md` | Concrete Phase 3 core/runtime/config/registry implementation batch scope. |
| `phase-4-batch-plan.md` | Concrete Phase 4 shared helper implementation batch scope. |
| `phase-5-batch-plan.md` | Concrete Phase 5 implementation batch scope. |
| `phase-6-batch-plan.md` | Concrete Phase 6 implementation batch scope. |
| `phase-7-batch-plan.md` | Concrete Phase 7 implementation batch scope. |
| `phase-8-batch-plan.md` | Concrete Phase 8 runner policy/facade cleanup batch scope. |
| `phase-9-batch-plan.md` | Concrete Phase 9 remaining unpaired JavaScript/facade cleanup batch scope. |
| `entrypoint-inventory.md` | Placeholder for every runtime/CLI/tool entrypoint and its dispatch path. |
| `import-call-graph.md` | Placeholder for per-file incoming callers, outgoing imports, and dynamic imports. |
| `authority-registry.md` | Placeholder for canonical authority ownership decisions. |
| `fallback-ledger.md` | Placeholder for every legacy/compat/fallback/shim finding and its decision. |
| `architecture-map.md` | Placeholder for the human navigation map of the pipeline. |
| `existing-typescript-islands.md` | Placeholder for TypeScript code that already exists and how it fits the migration. |
| `slice-review-template.md` | Reusable checklist for each migration slice/batch. |

## Phase 0 rule

For each batch, read every listed file fully before recording architecture, call graph, authority, fallback, and simplification notes.

## Phase 1 guardrail

Run this before committing TypeScript migration slices:

```bash
scripts/typecheck-ts-migration.sh
```

The command runs `scripts/check-ts-migration-guardrails.mjs` first, then the role-local TypeScript typechecks.
