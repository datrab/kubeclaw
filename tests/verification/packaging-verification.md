# Packaging Verification

## Scope

Packaging verification covers the real code-bundle runtime surface that Nova and Buster expose under `/app/skills`, not just the source tree layout.

Authoritative packaging rules:
- `scripts/package-agent-skill-bundle.sh` builds `/app/skills` bundles from the role-specific skill tree plus `skills/common`
- the packager materializes the canonical agent-observability and telemetry contract sources inside `/app/skills/pipeline`; runtime code never depends on repository-only `contracts/` paths
- the Common overlay contributes the generic v2 runtime from `skills/common/plugin-runtime` and shared plugins from `skills/common/plugins`
- role-owned plugins come only from `skills/nova/plugins` or `skills/buster/plugins`; package-local plugin tests are source evidence and are excluded from runtime bundles
- `charts/kubeclaw/templates/deployment.yaml` prepares the durable empty image baseline, overlays the required code bundle, overlays optional `/init-skills/.`, then mounts `/skills-merged` back onto `/app/skills`

Current verification policy:
- use the live repo root as the source of truth
- use `tests/verification/runtime/check-agent-skill-bundles.mjs` to execute the real packager for both roles and compare each archive byte-for-byte with the declared role-first/Common-second overlay
- use `tests/verification/runtime/check-runtime-collisions.mjs` as the canonical guard entrypoint
- rerun `check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees
- treat unpacked audit artifacts as historical reference only, not authoritative evidence

## Guardrail coverage

The packaging guard fails if any of the following regress:
- Nova or Buster bundle contents differ from the exact role-first/Common-second source overlay
- a bundle manifest changes its role, source paths, overlay order, contract version, or `/app/skills` runtime surface
- a bundle nests another `skills/` directory or omits required role entrypoints
- code-bundle runtime path collisions
- broken local imports or undeclared runtime packages across the complete
  materialized TypeScript and JavaScript module graph under `/app/skills/**`;
  the graph uses the TypeScript parser and covers static imports/exports,
  import-equals, literal dynamic imports, and literal `require()` calls.
  Non-builtin packages must be installed by the corresponding process image or
  supplied by a declared role-bundle consumer. `openclaw/plugin-sdk` is
  gateway-owned: the shared observer extension runs in the Nova/Buster
  OpenClaw gateway, never in the dedicated Buster pipeline sidecar
- `// @ts-nocheck` directives in runtime TypeScript sources
- missing generic v2 core, SDK, contracts, shared plugins, or role-owned plugins
- cross-role plugin leakage between the Nova and Buster bundles
- package-local plugin tests leaking into runtime bundles
- general-image `pipeline.ts` import failure
- general-image `pipeline/index.ts` import failure
- Buster Redis-tool import failure, including loss of Buster-specific environment ownership through the Common overlay
- missing self-contained agent-observability or telemetry contract assets
- bundle owner drift for the shared pipeline helper surface under `/app/skills/pipeline/**`
- bundle owner drift for sandbox `/app/skills/pipeline/tools/redis.ts`

This protects the code-bundle runtime surface against overlay/copy-order regressions and broken cross-skill relative imports after bundle/chart layering.

## Reproducible check

```bash
cd <repo-root>

node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root <repo-root>

node tests/verification/runtime/check-agent-skill-bundles.mjs \
  --source-root <repo-root>
```

## Conclusion

Packaging verification is reproducible from current repo truth.
The packaging guard is the authoritative executable check for packaged runtime ownership and import validity.
Its implementation lives under `tests/verification/runtime/`.
