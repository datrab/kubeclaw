# Pipeline Runtime Packaging Phase 5.6-D Audit

Status: complete

## Purpose

Phase 5.6-D assembles one runtime from its role manifest.

## Result

The builder copies only selected packages, plugins, extensions, and assets.
Internal packages have one physical copy in `skills/packages`. Package links
make normal package imports work without placing TypeScript source below a
`node_modules` real path.

The builder rejects target escapes, target collisions, source links, missing
packages, missing plugins, and source changes during assembly. It excludes
project tests, internal build output, nested dependencies, and TypeScript
build state. It includes required third-party runtime files, including their
published `dist` directories.

The bundle manifest records every selected package and plugin with its source
digest. It also records the entrypoint and external capability bindings.

## Proof

Run:

```bash
node tests/verification/contracts/check-runtime-bundle-builder.mjs
```

The proof imports the Nova and Buster entrypoints from the assembled trees.

Independent review used Codex `gpt-5.6-terra` with high reasoning. It found two
accepted dependency issues. The builder now includes transitive third-party
runtime dependencies. The foundation also declares Ajv and Ajv Formats
directly. The final review was clean.

## Next Step

Phase 5.6-E adds isolation, reproducibility, and negative build proofs.
