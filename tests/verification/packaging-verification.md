# Packaging Verification

## Scope

Packaging verification covers the real packaged runtime surface that the materialized general and sandbox images would expose under `/app/skills`, not just the source tree layout.

Authoritative packaging rules:
- `docker/Dockerfile.general` builds `/app/skills` from `skills/common` plus `skills/nova`, while excluding the Nova-local copies of:
  - `pipeline/integrations/gateway.ts`
  - `pipeline/agents/acp-monitor.js`
- `docker/Dockerfile.sandbox` builds `/app/skills` from `skills/common` plus `skills/buster`, while excluding the common copy of:
  - `redis.ts`
- `charts/kubeclaw/templates/deployment.yaml` merges image-baked `/app/skills/.` into `/skills-merged/`, overlays optional `/init-skills/.`, then mounts `/skills-merged` back onto `/app/skills`

Current verification policy:
- use the live repo root as the source of truth
- use `tests/verification/runtime/check-runtime-collisions.mjs` as the canonical guard entrypoint
- rerun `check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees
- treat unpacked audit artifacts as historical reference only, not authoritative evidence

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

## Conclusion

Packaging verification is reproducible from current repo truth.
The packaging guard is the authoritative executable check for packaged runtime ownership and import validity.
Its implementation lives under `tests/verification/runtime/`.
