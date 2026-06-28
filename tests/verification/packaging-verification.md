# Packaging Verification

## Scope

Packaging verification covers the real code-bundle runtime surface that Nova and Buster expose under `/app/skills`, not just the source tree layout.

Authoritative packaging rules:
- `scripts/package-agent-skill-bundle.sh` builds `/app/skills` bundles from the role-specific skill tree plus `skills/common`
- `charts/kubeclaw/templates/deployment.yaml` prepares the durable empty image baseline, overlays the required code bundle, overlays optional `/init-skills/.`, then mounts `/skills-merged` back onto `/app/skills`

Current verification policy:
- use the live repo root as the source of truth
- use `tests/verification/runtime/check-runtime-collisions.mjs` as the canonical guard entrypoint
- rerun `check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees
- treat unpacked audit artifacts as historical reference only, not authoritative evidence

## Guardrail coverage

The packaging guard fails if any of the following regress:
- code-bundle runtime path collisions
- broken relative imports in the materialized `/app/skills/**` tree
- `// @ts-nocheck` directives in runtime TypeScript sources
- general-image `pipeline.ts` import failure
- general-image `pipeline/index.ts` import failure
- bundle owner drift for the shared pipeline helper surface under `/app/skills/pipeline/**`
- bundle owner drift for sandbox `/app/skills/pipeline/tools/redis.ts`

This protects the code-bundle runtime surface against overlay/copy-order regressions and broken cross-skill relative imports after bundle/chart layering.

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
