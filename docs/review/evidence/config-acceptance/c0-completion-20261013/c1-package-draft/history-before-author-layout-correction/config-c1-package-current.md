# C1 concrete migration draft — not yet approval-ready

This narrows the first implementation delta; it does not authorize it or assert C0 completion. Original requirements and case bodies remain unchanged. Exact current author hashes, selected canonical field IDs and linked original case IDs are in [scope.json](../evidence/config-acceptance/c0-completion-20261013/c1-package-draft/scope.json). Linked cases still need their missing executable definitions; case membership is not acceptance.

## Author movement proposed for C1

| Current editable author | Proposed sole editable author |
|---|---|
| `charts/kubeclaw/files/config/swarm.config.json` | `config/pipeline.config.json` |
| Six sibling `{owner}.config.json` files | `config/{owner}.config.json`, preserving owner names |
| `profiles/buster-engine.runtime.config.json` | `config/profiles/buster-engine.runtime.config.json` |

Six owners: prism-control, prism-studio, prism-worker, prism-execution, buster-engine, worker-core. Current complete base and runtime-profile values must survive byte/semantic comparison. The Buster runtime variant is a whole selected owner document, not a patch merged with base. `pipeline.json` remains workflow input. Schemas remain authored in the existing foundation config module; Chart copies are generated delivery artifacts, never independently editable schema authorities.

The current strict entry fixes sibling filenames and its schemaVersion is `swarm-entry.v2`. Moving/renaming a file does not by itself implement complete profile selection. The exact evolved entry schema, instance-to-profile references and wire/version migration must be finalized from the source-concordance review before approval; do not add an unrelated second system index or silently keep an old-file fallback. Internal Swarm loader names need not be cosmetically renamed to establish one physical author.

## Inseparable productive delta

| Boundary | Current files/callers that must participate | Required result |
|---|---|---|
| Loader/schema | `skills/common/plugin-runtime/foundation/config/swarm-bundle.ts`, `swarm.ts`, `swarm.schema.json`, `swarm-components.schema.json` | Validate complete selected generation and owner identity before publication; preserve no-follow/read-drift/freeze and relations; reject competing old authors, missing values and unsafe refs |
| Helm bundle | `charts/kubeclaw/templates/_swarm-config.tpl`, `configmap-swarm-config.yaml`, `deployment.yaml`; Prism `_swarm-config.tpl`, `_swarm-bundle.tpl`, `configmap-swarm-config.yaml`, workloads | Consume a single generated immutable bundle reachable inside each packaged Chart; no external `.Files.Get`, no independent overlay defaults |
| Images/context | `.dockerignore`, `docker/Dockerfile.buster-runtime`, other actual config-consuming runtime Dockerfiles | Include selected root generation and required schemas; retain source/config/image receipt identity and installed loader behavior |
| Build/release discovery | `scripts/updates/runtime-inputs.mjs`, `release-configuration.mjs`, `deployment-release.mjs`, `.github/workflows/build-images.yaml`, `auto-promote-runtime.yaml` | A config-only change reaches the correct build/deployment input digest and release guard; exact selected generation cannot drift from image receipt |
| Role/package consumers | `scripts/build-runtime-role-bundle.mjs`, `scripts/check-runtime-role-manifests.mjs`, `scripts/package-agent-skill-bundle.sh` | Delivered owner/schema/plugin closure matches actual mandatory and installed optional package semantics; no divergent source-generated copies |
| Native/container locator | `scripts/check-built-runtime-image.sh`, Buster native preparation startup, selected Chart ENV/mounts and Docker ENV | One explicit absolute generation locator, not a settings override; every caller must agree on the new file and schema; old filename must not be auto-selected |
| Fixtures/docs | `tests/fixtures/config/swarm-bundle.mjs`, actual config/Chart/release/image tests, current user docs | Real consumers and negative oracles match new authority; retain existing failure provenance and obligations |

C1 does not implement module-generation persistence, new worker execution topology or live credential/storage/provider operations. It must not be shipped as a file move that leaves CI, release aliases, runtime profiles or the installed loader on the old author.

## Acceptance contracts to complete before approval

- Preserve the original component settings and complete runtime-profile values and relations; reject duplicate authors even when equal.
- For each distinct consumer, identify two valid complete materially different profiles and the observed changed behavior. Reuse exact existing case IDs; do not replace bodies with this list.
- Same real loader positive/negative pairs for missing/type/unit/unknown/relation/profile/reference drift; actual render/package/load rejection, not an isolated substitute checker.
- Verify config-only change detection and selected immutable Chart/image/release generation, then atomic generation publication and startup freeze.
- Exact existing source/test/tool/profile/input identities and concrete command/oracle/prior-state specification for every linked case; implementation remains not-run until approval.
- Fresh complete C0 review and bounded C1 package review; separate local effect from externally unavailable live facts.

## Subsequent slice boundaries (not authorized)

C2 owns Nova/Core orchestration/compiler/runtime policy; C3 owns remaining Engine/Service/Operator/host/deployment settings; C4 owns complete plugin/agent/model/prompt/tool profiles; C5 owns durable module/run/standalone binding and fixed-generation Eval; C6 consolidates real effect/rejection/mutation/recovery/code/document proof. Their exact fields and cases must be included in the eventual reviewable package, not inferred from approving this C1 draft.
