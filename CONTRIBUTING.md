# Contributing

KubeClaw changes should be source-backed and verified against the local behavior surface before they are shipped.

## Development flow

1. Read the relevant docs under `docs/`.
2. Inspect the source files that own the behavior you plan to change.
3. Keep changes scoped to one behavior or documentation area.
4. Run the narrow verification command for the area you touched.
5. Run deployment truth checks when chart, values, image, or infrastructure files change.
6. Update documentation and `docs/open-issues.md` when a behavior is intentionally unresolved.

## Documentation rules

- Treat code, rendered Helm manifests, and verification scripts as source of truth.
- Add source references only where they materially help verify implementation-specific claims.
- Do not describe intended behavior as current behavior unless the source proves it.
- Put unresolved problems in `docs/open-issues.md`.
- Put future improvements in `docs/future-implementation-ideas.md`.
- Keep archive material under `docs/archive/`.

## Verification commands

Common closeout checks:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

Real E2E scenarios can be run with:

```bash
node --test tests/verification/e2e/*.test.mjs
```
