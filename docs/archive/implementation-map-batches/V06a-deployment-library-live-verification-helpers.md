# Batch V06a — Deployment, library, and live verification helpers

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/deployment/README.md
tests/verification/deployment/check-deployment-truth.mjs
tests/verification/lib/README.md
tests/verification/lib/fake-redis-lib.mjs
tests/verification/lib/lifecycle-audit-lib.mjs
tests/verification/lib/verification-console.mjs
tests/verification/live/redis-backend-smoke.mjs
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end before conclusions were written.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/deployment/README.md
kubeclaw-main/tests/verification/deployment/check-deployment-truth.mjs
kubeclaw-main/tests/verification/lib/README.md
kubeclaw-main/tests/verification/lib/fake-redis-lib.mjs
kubeclaw-main/tests/verification/lib/lifecycle-audit-lib.mjs
kubeclaw-main/tests/verification/lib/verification-console.mjs
kubeclaw-main/tests/verification/live/redis-backend-smoke.mjs
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/docs/pipeline/implementation-map/README.md
kubeclaw-main/docs/pipeline/implementation-map/batch-template.md
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `tests/verification/deployment/README.md`

Role: Documents the canonical deployment verifier scope and operator evidence split.

Imports/dependencies: None; markdown only.

Exports/public surface: Human-facing guidance for `tests/verification/deployment/check-deployment-truth.mjs`.

Defines: Deployment truth scope for Helm renders, kubeconform, operator deploy/build/smoke/teardown commands, replay/audit artifact paths, Redis audit artifact paths, and live-cluster limitation.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Operators and maintainers.

Environment variables / CLI inputs / config fields: Documents deploy commands and optional tags, not parsed by this file.

Paths built/read/written: Documents `.swarm/logs/pipeline/latest.json`, run-scoped `.swarm/logs/pipeline/runs/<run_id>/...`, and `.swarm/logs/redis/...` artifacts.

Authority behavior: Deployment verifier owns repo-only truth checks; live build/push/redeploy/smoke/teardown remains operator-controlled.

Error/retry/terminal behavior: None found in scoped file.

Verification coverage: Documentation only.

Findings: None found.

### `tests/verification/deployment/check-deployment-truth.mjs`

Role: Repo-only deployment truth guard for Helm chart render, kubeconform validation, Buster/Nova pod surfaces, deploy/setup scripts, image-build workflow, runtime config provenance, live verification commands, smoke commands, and teardown safety surfaces.

Imports/dependencies: Quiet runtime console, Node fs/path/assert/child_process, lifecycle audit `parseArgs` and `resolveRoots`, host `helm` and `kubeconform` binaries.

Exports/public surface: CLI script; supports lifecycle audit args through `parseArgs`; prints a JSON result with roots, chart/value paths, check names, and kubeconform summaries.

Defines: `assertIncludes`, newline normalization helpers, `findRenderedDocument`, `extractLiteralDataBlock`, Helm/kubeconform render checks, source-template/script checks, executable bit check.

Important variables/state: Chart paths, Nova/Buster values, deployment/service/configmap templates, swarm config and Semgrep source artifacts, deploy/setup/setup-secrets scripts, build-images workflow, rendered Nova/Buster manifests, rendered ConfigMap literal data.

Calls out to: `helm template`, `kubeconform -strict -summary -ignore-missing-schemas`, filesystem reads/stat.

Called by / expected callers: Deployment verification entrypoint/operators/CI.

Environment variables / CLI inputs / config fields: Lifecycle audit args (`--source-root`, `--overlay-root`, `--contract` via shared parser though this script uses source root). Deploy script surfaces pinned in source include `LOCAL_REGISTRY_PUSH`, `LOCAL_REGISTRY_PULL`, `GENERAL_IMAGE_REPOSITORY`, `SANDBOX_IMAGE_REPOSITORY`, `DISABLE_IMAGE_PULL_SECRETS`.

Paths built/read/written: Reads `charts/kubeclaw`, `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, chart templates/files, scripts, setup values, and `.github/workflows/build-images.yaml`; no writes.

Authority behavior: Rendered Helm output must match chart-provided config artifacts. Deploy script is canonical executable operator surface for local image build, live verification, smoke, and destructive teardown. CI workflow owns real general image build path. Custom skills are extension-only and cannot override protected runtime skills.

Error/retry/terminal behavior: Missing files, render/schema failures, missing source markers, non-executable deploy script, broad silent fallbacks (`|| true`, `&>/dev/null`), stale config mounts, disabled sidecar drift, or literal ConfigMap drift cause terminal failure. Optional deploy/setup failures must be classified by helper functions instead of silently swallowed.

Verification coverage: Strong rendered-manifest, source-template, script, and workflow source coverage. Live build/push/redeploy/smoke/teardown execution is intentionally not performed by this repo-only verifier.

Findings: None found.

### `tests/verification/lib/README.md`

Role: Documents shared verification helper location and canonical helper module.

Imports/dependencies: None; markdown only.

Exports/public surface: Human-facing pointer to `tests/verification/lib/lifecycle-audit-lib.mjs`.

Defines: None beyond helper location.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Verification maintainers.

Environment variables / CLI inputs / config fields: None found in scoped files.

Paths built/read/written: None.

Authority behavior: `lifecycle-audit-lib.mjs` is the canonical helper module.

Error/retry/terminal behavior: None found in scoped file.

Verification coverage: Documentation only.

Findings: None found.

### `tests/verification/lib/fake-redis-lib.mjs`

Role: Installs an in-runtime fake `ioredis` module and exposes fake Redis event helpers for verification runtime tests.

Imports/dependencies: Node fs/path and `ensureDir` from lifecycle audit lib.

Exports/public surface: `installFakeRedis`, `xaddEvents`, `flushAsync`.

Defines: Fake Redis class with `status`, `on`, `incr`, `xadd`, `expire`, `multi().xadd().expire().exec()`, and `quit` methods written into a temp `node_modules/ioredis` package.

Important variables/state: Global `__fakeRedisCounters` and `__fakeRedisCalls` stores.

Calls out to: Filesystem writes for fake package; `setTimeout(0)` for async flush.

Called by / expected callers: Runtime/telemetry verification scripts materializing fake Redis.

Environment variables / CLI inputs / config fields: None found in scoped files.

Paths built/read/written: Writes `<runtimeRoot>/node_modules/ioredis/index.js` and package.json.

Authority behavior: Fake Redis is test-only transport authority for isolated runtime checks; not production Redis authority.

Error/retry/terminal behavior: JSON parse failures in `xaddEvents` bubble; fake methods do not simulate connection errors.

Verification coverage: Helper only; consumed by other verification tests.

Findings: None found.

### `tests/verification/lib/lifecycle-audit-lib.mjs`

Role: Shared lifecycle/deployment/runtime verification helper library for source roots, overlays, packaging manifest materialization, telemetry contract parsing, markdown schema table extraction, and emitted telemetry event discovery.

Imports/dependencies: Node fs/os/path/url.

Exports/public surface: `SHARED_PIPELINE_HELPER_PATHS`, `DEFAULT_TELEMETRY_CONTRACT_REL_PATH`, `expectedPackagedRuntimeOwners`, `parseArgs`, `resolveRoots`, `resolveTelemetryContractPath`, `readOverlayText`, `effectiveFiles`, `loadPackagingRules`, `buildManifest`, `findCollisions`, `materializeRuntimeTree`, `importRuntimeModule`, `ensureDir`, `writeExecutable`, `extractContractEventNames`, `extractTelemetrySchemaEventNames`, `extractMarkdownSection`, `extractMarkdownTables`, `extractMarkdownFieldTable`, `TELEMETRY_SCHEMA_HOTSPOT_AUTHORITY_NOTE`, `TELEMETRY_SCHEMA_HOTSPOT_FIELD_ROWS`, `assertTelemetrySchemaHotspotAuthority`, `collectEmitEventNames`.

Defines: Shared helper inventory, default telemetry contract path, overlay-aware file walkers, packaged runtime ownership/overwrite rules, markdown table parsing, authoritative telemetry hotspot rows, source emit-event regex collector.

Important variables/state: No persistent global state; materialization uses temp dirs when caller does not provide `outDir`.

Calls out to: Filesystem reads/writes/copies/chmod, dynamic import through file URLs.

Called by / expected callers: Contract, behavior, deployment, and runtime verification scripts.

Environment variables / CLI inputs / config fields: Generic `--source-root`, `--overlay-root`, `--contract`; `--contract` must point to markdown, not JS verifier scripts.

Paths built/read/written: Reads Dockerfiles, chart deployment template, common/Nova/Buster source dirs, telemetry contract markdown, telemetry schema docs, and source files. Writes materialized runtime trees and executable fixture files when requested.

Authority behavior: Common helper inventory defines shared pipeline helper surfaces. Packaging rules enforce `/app/skills` materialization and common-over-shim overwrites. Telemetry contract markdown and schema hotspot tables are authoritative payload surfaces for high-value events.

Error/retry/terminal behavior: Missing packaging markers, stale `/app/common`, wrong common overwrite order, unknown image, invalid telemetry contract path, missing markdown/schema sections/rows/types/descriptions, or unexpected schema drift throws terminal errors; no retry.

Verification coverage: High helper coverage through dependent verification scripts.

Findings: None found.

### `tests/verification/lib/verification-console.mjs`

Role: Quiet console wrapper for verification scripts so noisy runtime imports do not corrupt JSON success output while failures still show buffered logs.

Imports/dependencies: None beyond global process/console/Buffer.

Exports/public surface: `verificationVerboseEnabled`, `installQuietRuntimeConsole`.

Defines: Console arg stringifier, verbose mode detection, console/stdout/stderr capture, restore/flush, uncaught exception and unhandled rejection failure handler.

Important variables/state: Captured original console/stdout/stderr functions, `bufferedOutput`, `restored`, `handlingFailure` per installation.

Calls out to: `process.once('uncaughtException')`, `process.once('unhandledRejection')`, `process.exit(1)` on handled failure.

Called by / expected callers: Verification scripts.

Environment variables / CLI inputs / config fields: `--verbose` CLI flag or `VERIFICATION_VERBOSE=1` disables quiet capture.

Paths built/read/written: None.

Authority behavior: Verification scripts own their final JSON output; runtime logs are buffered unless verbose/failure.

Error/retry/terminal behavior: On uncaught exception/unhandled rejection, restores console, prints failure label, buffered logs, stack/message, and exits 1. Reentrant handling is guarded.

Verification coverage: Helper only; behavior visible through all quiet verification scripts.

Findings: None found.

### `tests/verification/live/redis-backend-smoke.mjs`

Role: Optional live Redis backend smoke test that dispatches a Buster task through real Redis, processes it, and verifies Nova Redis completion reading.

Imports/dependencies: Quiet runtime console, Node assert/fs/os/path/child_process, live production Redis tool and Buster pipeline modules, host `git`, live Redis backend.

Exports/public surface: CLI script; skips by default unless live smoke is explicitly enabled.

Defines: Enable/skip gates, temp Git fixture repository/origin builder, Redis stream/task/completion identity, Buster task payload, cleanup finalizer.

Important variables/state: `LIVE_REDIS_SMOKE`, `KUBECLAW_LIVE_REDIS_SMOKE`, `REDIS_HOST`, optional `LIVE_REDIS_SMOKE_DISCORD`, `BUSTER_TASK_STREAM`, `LIVE_REDIS_SMOKE_KEEP_ARTIFACTS`, generated project/run/module/dispatch ids, Redis task/completion streams, temp repo.

Calls out to: Real Redis client/tool, Buster pipeline `readNextTaskEntry`, `processTask`, `disconnectRedisClient`, host git init/commit/push, filesystem fixture creation/removal.

Called by / expected callers: Live verification operators/CI with Redis available.

Environment variables / CLI inputs / config fields: Live smoke gates and Redis/Discord/task-stream/artifact-retention env vars listed above. The task payload carries `completion_stream`, `log_dir`, `session.cwd`, manifest test config, run/module/attempt/dispatch ids.

Paths built/read/written: Creates temp Git repo and bare origin, writes invalid manifest under `.swarm/modules/<module>/k8s/deployment.yaml`, Buster logs under fixture `.swarm/logs/buster/...`, cleans Redis streams and temp root unless retention is enabled.

Authority behavior: Live Redis is authority only when explicitly enabled and `REDIS_HOST` is present. Completion identity must match project/run/module/attempt/dispatch and source `buster-pipeline`.

Error/retry/terminal behavior: Skips cleanly without enable env or `REDIS_HOST`. Redis ready waits up to 10s. Existing consumer group `BUSYGROUP` is tolerated. Task processing must FAIL for invalid manifest/no subagent. Cleanup attempts xdel/del/disconnect and warns on cleanup failures. No retry beyond Redis ready wait/group idempotence.

Verification coverage: Optional live integration; skipped by default to avoid live dependency.

Findings: None found.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `check-deployment-truth.mjs` | Helm/kubeconform/chart/scripts/workflow | rendered manifests and operator script source | Pins deployment truth and repo-only checks. |
| `fake-redis-lib.mjs` | lifecycle audit `ensureDir` | fake `ioredis` package install | Test-only Redis transport fixture. |
| `lifecycle-audit-lib.mjs` | source tree/docs/schema/runtime files | packaging, materialization, markdown, telemetry helpers | Shared verification utility owner. |
| `verification-console.mjs` | process/console globals | quiet capture and failure handling | Keeps JSON success output clean. |
| `redis-backend-smoke.mjs` | real Redis tool/Buster pipeline/git | live task dispatch and completion read | Optional live Redis integration check. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| Deployment truth | rendered Nova/Buster manifest contains expected services/deployments/config | Helm output/templates/files | pass or terminal assertion | Pins deployable chart truth. |
| Deployment truth | broad silent fallback markers appear | deploy/setup source | terminal assertion failure | Prevents swallowed operator failures. |
| Packaging helpers | image equals `general`/`sandbox`/unknown | image argument | build manifest or throw unknown image | Runtime materialization authority. |
| Shared helper overwrite | dest path is shared helper with common final owner | manifest owners | allowed intentional overwrite | Common helper replaces compatibility shims. |
| Telemetry contract path | `--contract` is JS, non-markdown, missing, or markdown | CLI path | descriptive throw or accepted path | Prevents verifier-as-contract mistakes. |
| Quiet console | verbose requested | `--verbose` or `VERIFICATION_VERBOSE=1` | no capture vs buffered capture | Clean JSON by default, full logs on demand. |
| Live Redis smoke | enable env and `REDIS_HOST` present | env vars | skip or live run | Avoids accidental live dependency. |
| Live Redis cleanup | cleanup operations fail | Redis/disconnect/fs operations | warn and continue cleanup finalizer | Best-effort live fixture cleanup. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| Deployment truth | no repo state | Helm renders and source reads | source artifacts must equal rendered literal blocks | Repo-only verifier remains read-only. |
| `buildManifest` | in-memory manifest/owners | image packaging layers | later layer overwrites destination; common overwrites shims only intentionally | Deterministic runtime file ownership. |
| `materializeRuntimeTree` | temp runtime tree | manifest owner paths | copy final manifest owner to `/app/skills`-like tree | Runtime import fixture. |
| Fake Redis | fake node module and global stores | runtime root/fake calls | write fake `ioredis`; append operation calls | Test transport call log. |
| Live Redis smoke | live Redis streams and temp Git repo | generated ids/task payload | dispatch task, process, read matching completion, cleanup streams/root | Live completion identity verified. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `walkFiles`/`effectiveFiles` | directory entries remain | none | none | all files collected. |
| Markdown table extraction | table lines remain | none | none | first table/field map extracted. |
| Live Redis ready wait | Redis not ready | event listeners | 10s `setTimeout` | ready or timeout/error. |
| Fake async flush | single event-loop tick | `setTimeout(0)` | none | promise resolves after tick. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `--source-root` | CLI flag | deployment/lifecycle audit helpers | cwd | Resolves source tree. |
| `--overlay-root` | CLI flag | lifecycle audit helpers | null | Overlay source merge. |
| `--contract` | CLI flag | lifecycle audit helpers | telemetry contract markdown | Must be markdown. |
| `--verbose` | CLI flag | verification console | false | Disables quiet capture. |
| `VERIFICATION_VERBOSE` | Env var | verification console | unset | `1` disables quiet capture. |
| `LOCAL_REGISTRY_PUSH`, `LOCAL_REGISTRY_PULL` | Deploy env vars pinned by source check | deploy script | host/cluster registry defaults | Live verification registry split. |
| `LIVE_REDIS_SMOKE`, `KUBECLAW_LIVE_REDIS_SMOKE`, `REDIS_HOST`, `LIVE_REDIS_SMOKE_DISCORD`, `BUSTER_TASK_STREAM`, `LIVE_REDIS_SMOKE_KEEP_ARTIFACTS` | Env vars | live Redis smoke | disabled/missing by default | Gate live integration and cleanup behavior. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `charts/kubeclaw` and `my-values/*-values.yaml` | repo source | deployment truth | source | Helm render authority. |
| `charts/kubeclaw/files/config/swarm.config.json` and `.semgrep.yml` | repo source | deployment truth | source | Must exactly match rendered ConfigMap literals. |
| `scripts/deploy.sh` | repo source | deployment truth/operators | source/operator | Canonical executable deployment/build/smoke/teardown surface. |
| `/app/skills` | Docker/chart runtime path | lifecycle audit/deployment truth | image/chart runtime | Runtime skill materialization target. |
| `<runtimeRoot>/node_modules/ioredis` | fake Redis helper | runtime verification modules | fake Redis helper | Test-only Redis shim. |
| materialized runtime temp trees | lifecycle audit helper | runtime contract/behavior tests | lifecycle audit helper | Isolated runtime import tree. |
| `pipeline:telemetry` docs/schema paths | lifecycle audit helpers | telemetry checks | docs | Contract/schema event authority. |
| temp live Redis smoke repo/origin and streams | live Redis smoke | Redis/Buster/Nova smoke | live smoke | Optional live integration fixture. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Deployment manifest truth | Helm chart/templates/values | deployment truth verifier/operators | None. |
| Runtime config ConfigMap content | chart files under `charts/kubeclaw/files/config` | Helm render/runtime pod | None. |
| Deployment operator commands | executable `scripts/deploy.sh` | operators/live verification | None. |
| Packaged runtime helper ownership | lifecycle audit packaging rules and common helper list | contract/behavior runtime materializers | None. |
| Fake Redis call log | fake `ioredis` module | verification assertions | None. |
| Quiet verification output | verification console wrapper | verification scripts/CI | None. |
| Live Redis completion | real Redis completion stream when explicitly enabled | Nova Redis reader/Buster pipeline | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Deployment truth JSON result | deployment verifier | `sourceRoot`, `chartDir`, values paths, `checks[]`, `kubeconform.summary`, `kubeconform.busterSummary` | source/render assertions | CI/operators. |
| Packaging owner entry | lifecycle audit manifest builder | `sourceDir`, `relativePath`, `absPath` keyed by destination path | `buildManifest`, `findCollisions` | runtime materializers/contracts. |
| Telemetry hotspot row | lifecycle audit lib | `field`, `type`, `description` per hotspot event | `assertTelemetrySchemaHotspotAuthority` | telemetry schema contract. |
| Fake Redis call entry | fake Redis helper | `op`, `key`/`value` or `args` | `xaddEvents` JSON parser | runtime telemetry tests. |
| Quiet console handle | verification console | `verbose`, `restore`, `flush` | install helper | verification scripts. |
| Live Redis task/completion payload | live smoke | project/run/module/attempt/dispatch ids, `completion_stream`, `task_stream`, `completion_id`, source/outcome | Redis tool/Buster processing assertions | live verification operators. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Deployment operator tool | `scripts/deploy.sh` checked by deployment truth | live build/smoke/teardown outputs | No prompt content in scoped files | Docker, kubectl, helm via operator shell | Classified failures; no broad silent fallbacks. |
| Live Redis Buster task | live smoke payload | temp repo `.swarm` and Redis completion | No prompt content in scoped files | Redis and Buster pipeline runtime | FAIL completion for invalid manifest/no subagent with matching identity. |
| Verification console | helper wrapper | JSON success output / failure stderr | No prompt content | process console/stdout/stderr | Quiet success, buffered failure logs. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| Deployment truth | missing chart/values/source marker/render/schema drift | No | none | terminal error/assertion failure | none. |
| Deployment scripts | optional setup/status/teardown command failures | command-specific | classified helpers in script source | visible warning/classified handling; broad swallowing forbidden | script-level, not inspected. |
| Lifecycle audit packaging | missing packaging marker, stale `/app/common`, wrong overwrite order, unknown image | No | none | throws terminal error | none. |
| Telemetry contract helper | invalid/missing/non-markdown contract, missing schema rows | No | none | throws descriptive terminal error | none. |
| Fake Redis helper | malformed fake XADD data | No | none | JSON parse error bubbles | none. |
| Verification console | uncaught exception/unhandled rejection | No | none | restore, print buffered logs, exit 1 | none. |
| Live Redis smoke | disabled/missing `REDIS_HOST` | Not an error | none | JSON skip and exit 0 | Discord disabled unless explicitly enabled. |
| Live Redis smoke | Redis not ready/group exists/task processing fail/cleanup fail | Redis ready wait only | 10s ready timeout; BUSYGROUP tolerated | terminal assertion on smoke failure; cleanup warnings nonterminal | Discord webhook cleared unless enabled. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| Deployment truth | render/schema/source drift | Yes/partial | process stderr/stdout | assertion/error or JSON result | verifier script | Repo-only verifier output. |
| Deploy/setup scripts | classified optional failures | Yes/partial | operator shell output | warning/classified helper messages | deploy/setup scripts | Source markers asserted, not executed live. |
| Lifecycle audit packaging/contract helper | helper drift or invalid contract | Yes/partial | thrown error/stdout | descriptive Error | helper functions | Adequate for verification. |
| Fake Redis helper | malformed XADD data | Yes/partial | thrown JSON parse error | parse exception | `xaddEvents` | Test helper only. |
| Verification console | uncaught/unhandled failure | Yes | stderr after restore | `[label] FAILED` plus buffered logs | `handleFailure` | Ensures hidden runtime logs surface on failure. |
| Live Redis smoke | skipped | Yes | JSON stdout | `skipped: true` with reason | smoke script | Prevents accidental live dependency. |
| Live Redis smoke | live task/completion failure | Yes/partial | assertion stderr and cleanup warnings | assertion/cleanup warning; Redis task/completion streams during run | smoke script/Buster/Nova Redis tool | Optional live integration. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js | Runtime binary | Node runtime | all V06a scripts | ESM, fs, child processes, assertions | Required. |
| Helm | host binary | host version | deployment truth | render Nova/Buster chart | Missing/failing render fails deployment verifier. |
| kubeconform | host binary | host version | deployment truth | strict manifest validation | Missing/failing schema validation fails verifier. |
| Docker/kubectl/helm live command surfaces | operator environment | operator versions | deploy script source | live build/smoke/teardown | Source-pinned but not executed by repo verifier. |
| Redis backend | live service | configured by env | live Redis smoke | optional live task/completion check | Skipped unless explicitly enabled and `REDIS_HOST` present. |
| Host git binary | system binary | host version | live Redis smoke | temp repo/origin fixture | Required only for live smoke when enabled. |
| Fake `ioredis` module | generated test package | helper-local | runtime verification | isolated Redis telemetry tests | Not production Redis. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Live Redis ready wait | one wait per smoke run | 10s timeout | timeout rejects smoke | assertion/error output | None. |
| Live Redis consumer group | Redis group create | `BUSYGROUP` tolerated | existing group continues | live smoke path | None. |
| Fake Redis counters | per-key global counter | global object | monotonic increment per key in process | fake call log | None. |
| Verification console capture | in-memory buffer per install | quiet by default | flushed only on failure/manual flush | failure stderr | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Deployment pod smoke | gateway status command in deployed pod | deploy script | operator/live verification | rollout and ready waits before exec | source-pinned command markers. |
| Runtime skill/config surface | `/app/skills`, `/home/node/.openclaw/swarm.config.json`, `/config/swarm.config.json` | chart/image/deploy runtime | OpenClaw agents | init container merge/copy | Helm render assertions. |
| Live Redis Buster task | Redis task with run/module/attempt/dispatch/session and completion stream | Nova Redis tool/live smoke | Buster pipeline | Redis group/read/process/xack | optional live smoke assertions. |
| Live Redis completion | completion stream entry with source/status/outcome identity | Buster pipeline | Nova Redis reader | readCompletion identity filter | optional live smoke assertions. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Deployment render/operator truth | `check-deployment-truth.mjs` | High repo-only render/source coverage | Live build/push/redeploy/smoke/teardown not executed by repo verifier. |
| Fake Redis helper | `fake-redis-lib.mjs` | Helper coverage via dependent tests | None found. |
| Lifecycle audit helper | `lifecycle-audit-lib.mjs` | High helper coverage via dependent tests | None found. |
| Quiet verification console | `verification-console.mjs` | Helper coverage via all quiet scripts | None found. |
| Live Redis backend smoke | `redis-backend-smoke.mjs` | Optional live integration | Skipped unless explicitly enabled and Redis configured. |

Validation evidence:

```text
node --check tests/verification/deployment/check-deployment-truth.mjs
node --check tests/verification/lib/fake-redis-lib.mjs
node --check tests/verification/lib/lifecycle-audit-lib.mjs
node --check tests/verification/lib/verification-console.mjs
node --check tests/verification/live/redis-backend-smoke.mjs
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
# kubeconform: Nova valid 7/7; Buster valid 11/11
node tests/verification/live/redis-backend-smoke.mjs
# {"ok":true,"skipped":true,"reason":"set LIVE_REDIS_SMOKE=1 to run live Redis backend smoke"}
git diff --check
```

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
