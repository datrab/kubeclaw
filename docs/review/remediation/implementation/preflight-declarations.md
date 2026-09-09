# PCR-PREFLIGHT-001 — Explicit Forge delivery declarations

The original function accepted negated prose, foreign full paths with matching basenames, and directory-owned Dockerfiles without any actual delivery declaration. All three produced an empty failures array in a direct original-source baseline counterprobe. This patch fixes that declaration check, not global project preflight or implementation correctness.

## Declaration and authority

Each consumed FORGE.md contains exactly one complete `kubeclaw-deliverables` fenced JSON block. Its closed object requires schemaVersion `forge-deliverables.v1`, the exact moduleId, exact substep identity (null for module-level files), and explicitly authored deliverables. Paths are full canonical repository-relative identities. Missing/malformed/duplicate blocks, nested fenced examples, foreign module/substep identities, unsafe paths and duplicate substep assignments reject. Valid declarations lacking a required exact path request a fix. No filenames, prose, ownership lists or generated provider results are inferred as delivery intent.

Ownership is separate: `ownedPaths` uses exact or slash-boundary prefix matching and optional trailing slash. It controls the existing conditional Dockerfile requirement; the explicit API specification requirement remains unconditional. Each selected substep is validated independently before its declarations are combined. An explicit empty list can declare no deliverables for a substep.

The declaration lives in the existing blueprint bytes, avoiding an extra sidecar authority. Existing reviewed/synced control paths must include these FORGE.md files. The plugin still reads current repository bytes through its original repository capability; it does not independently prove a source approval, artifact existence, build success, delivery or readiness. No Ready producer dependency is needed for this bounded declaration check.

## Actual callers and generation audit

The original plugin live-function runner and quality-provider-runtime caller are the active preflight consumers located by stage-type/field searches. The remote-real-provider test authors the latter caller's FORGE.md and now declares its explicit README.md requirement in the same committed source file. The repository adapter/registry/artifact/runtime routes remain original.

Project setup authors FORGE.md through its module-files guide; that guide now documents the explicit migration. progress-scaffold-discovery reads existing FORGE text and discovers substeps, and its validation checks file presence. It does not write delivery declarations. The E2E workspace generator also emits prose FORGE files but its current project compiler graph does not invoke this stage; those legacy files require authored declarations if a graph later enables preflight. Nothing silently upgrades those files based on discovered filenames.

The current project compiler has no deterministic preflight declaration input or emitted preflight stage. Globally mandatory deterministic architecture checking, with separately optional architecture-agent dispatch, remains an integration obligation; this slice does not claim it is wired. No compiler/core API, architecture-agent setting, or Ready/delivery receipt is invented here.

## Verification

- `npm test --workspace @kubeclaw/plugin-preflight-contract`: passed package-boundary, declaration unit vectors, and 11 genuine pipeline runner scenarios using real temporary FORGE files, registry, repository adapter, artifact store and effect journal. Includes negated prose, wrong full paths, directory ownership, wrong module/substep, valid module/substeps and explicit migration.
- `npm run build --workspace @kubeclaw/plugin-preflight-contract`: passed.
- Canonical ESLint on changed plugin production/tests and migrated remote consumer: passed; git diff --check passed.
- `node tests/verification/contracts/check-pipeline-remote-real-provider.mts`: attempted, blocked before its later preflight call by native supervisor `/proc` task-children failure and `write EPIPE`. Actual original importer records execution_error and blocked, not passed. No substitute executor, process shim or fabricated success was used.

## Exact eight-path scope

- skills/nova/plugins/preflight-contract/src/stage.ts
- skills/nova/plugins/preflight-contract/src/declarations.ts (new)
- skills/nova/plugins/preflight-contract/tests/declarations.unit.test.mjs
- skills/nova/plugins/preflight-contract/tests/live-function.test.ts
- skills/nova/plugins/preflight-contract/README.md
- skills/nova/project_setup/module-files.md
- tests/verification/contracts/check-pipeline-remote-real-provider.mts
- docs/review/remediation/implementation/preflight-declarations.md (this note)

No staging or commits. No CI, deployment, external messages or cluster mutation.
