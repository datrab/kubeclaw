# Packaging Verification

## Scope

Packaging verification covers the real packaged runtime surface that the materialized general and sandbox images would expose under `/app/skills`, not just the source tree layout.

Authoritative packaging rules remain:
- `docker/Dockerfile.general` builds `/app/skills` from `skills/common` plus `skills/nova`, while excluding the Nova-local copies of:
  - `pipeline/integrations/gateway.ts`
  - `pipeline/agents/acp-monitor.js`
- `docker/Dockerfile.sandbox` builds `/app/skills` from `skills/common` plus `skills/buster`, while excluding the common copy of:
  - `redis.ts`
- `charts/kubeclaw/templates/deployment.yaml` still merges image-baked `/app/skills/.` into `/skills-merged/`, then overlays optional `/init-skills/.`, then mounts `/skills-merged` back onto `/app/skills`

Current verification policy:
- use the live repo root as the source of truth
- use `tests/verification/runtime/check-runtime-collisions.mjs` as the canonical guard entrypoint
- rerun `check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees
- treat stale unpacked audit artifacts as historical reference only, not authoritative evidence

## Guardrail coverage

The packaging guard fails if any of the following regress:
- packaged runtime path collisions
- broken relative imports in the materialized `/app/skills/**` tree
- `// @ts-nocheck` directives in runtime TypeScript sources
- general-image `pipeline.ts` import failure
- general-image `pipeline/index.ts` import failure
- packaged owner drift for the shared pipeline helper surface under `/app/skills/pipeline/**`
- packaged owner drift for sandbox `/app/skills/pipeline/tools/redis.ts`

This protects the packaged runtime surface against overlay/copy-order regressions and broken cross-skill relative imports after Docker/chart layering.

## Reproducible check

```bash
cd <repo-root>

node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root <repo-root>
```

## Latest rerun summary (2026-04-11)

Packaging/runtime scan result against the live repo materialization:
- general image collisions: `0`
- sandbox image collisions: `0`
- total packaged owner drift: `0`
- broken packaged relative imports: `0`
- packaged `/app/skills/pipeline.ts` import: `OK`
- packaged `/app/skills/pipeline/index.ts` import: `OK`

Resolved packaged runtime owners:
- general `/app/skills/pipeline/agents/runtime.ts` -> `skills/common/pipeline/agents/runtime.ts` via runtime facade
- general `/app/skills/pipeline/integrations/gateway.ts` -> `skills/common/pipeline/integrations/gateway.ts`
- general `/app/skills/pipeline/agents/lifecycle.ts` -> `skills/common/pipeline/agents/lifecycle.ts` via runtime facade
- general `/app/skills/pipeline/agents/acp-monitor.ts` -> `skills/common/pipeline/agents/acp-monitor.ts` via runtime facade
- general `/app/skills/pipeline/lifecycle-state.ts` -> `skills/common/pipeline/lifecycle-state.ts` via runtime facade
- sandbox `/app/skills/pipeline/agents/runtime.ts` -> `skills/common/pipeline/agents/runtime.ts` via runtime facade
- sandbox `/app/skills/pipeline/integrations/gateway.ts` -> `skills/common/pipeline/integrations/gateway.ts`
- sandbox `/app/skills/pipeline/agents/lifecycle.ts` -> `skills/common/pipeline/agents/lifecycle.ts` via runtime facade
- sandbox `/app/skills/pipeline/agents/acp-monitor.ts` -> `skills/common/pipeline/agents/acp-monitor.ts` via runtime facade
- sandbox `/app/skills/pipeline/lifecycle-state.ts` -> `skills/common/pipeline/lifecycle-state.ts` via runtime facade
- sandbox `/app/skills/pipeline/tools/redis.ts` -> `skills/buster/pipeline/tools/redis.ts`

## Conclusion

Packaging verification is reproducible from current repo truth.
The packaging guard now serves as the authoritative executable check for packaged runtime ownership and import validity, without relying on stale rebuilt-artifact evidence paths.
Its implementation lives under `tests/verification/runtime/`.
