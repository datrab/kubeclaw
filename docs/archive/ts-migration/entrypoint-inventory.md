# Entrypoint Inventory

Purpose: list every runtime, CLI, tool, and packaging entrypoint in the pipeline migration scope.

## Buster pipeline runtime

- File: `skills/buster/buster-pipeline.ts`
- Command/import path: deployment uses `node /app/skills/buster-pipeline.ts`; local/status smoke uses `node skills/buster/buster-pipeline.ts --status`; verification harnesses import the module directly.
- Direct caller or operator surface: Buster gateway container command in `my-values/buster-values.yaml`; runtime and contract verification.
- Dispatch target: direct execution runs `main()` unless `process.argv[2] === '--status'`; `--status` prints `{ lastRunLogDir }` from `getLastRunLogDir()` and exits.
- Runtime side effects: signal handlers, gateway readiness wait, orphan recovery, sandbox cleanup, gateway health monitor, optional base-image pre-pull, Redis consumer-group setup, Redis task polling loop, active-session termination and cleanup on shutdown.
- Canonical after migration: yes for Buster pod task-processing runtime; helper implementation should remain delegated to services/common facades.
- Deletion/rename decision if not canonical: not applicable.

## Buster Redis task tool

- File: `skills/buster/pipeline/tools/redis.ts`
- Command/import path: source CLI `node skills/buster/pipeline/tools/redis.ts --action send|read`; Buster sandbox/runtime path is `/app/skills/pipeline/tools/redis.ts`; Nova's general-runtime adapter slot remains `/app/skills/pipeline/tools/redis.ts` and imports the default library.
- Direct caller or operator surface: operator/tooling task publish/read helper; Nova adapter registry.
- Dispatch target: direct execution parses strict flags; `send` publishes a canonical Redis task envelope; `read` reads from the caller agent stream.
- Runtime side effects: lazy Redis client creation, Redis stream/group operations, optional Discord task notification, JSON stdout, Redis disconnect, process exit.
- Canonical after migration: yes as an external task-tool adapter for send/read only.
- Deletion/rename decision if not canonical: remove producer dependence on direct completion emission.

## Buster screenshot and baseline tool

- File: `skills/buster/pipeline/tools/screenshot.ts`
- Command/import path: `node skills/buster/pipeline/tools/screenshot.ts <target> <output.png>` or `node skills/buster/pipeline/tools/screenshot.ts --generate-baselines <preview.html> <output-dir/>`; production/runtime path may be `/app/skills/pipeline/tools/screenshot.ts`.
- Direct caller or operator surface: visual-reg suite imports helpers; Prism/baseline operators use CLI.
- Dispatch target: direct execution calls either `takeScreenshot` or `generateBaselines` based on `--generate-baselines`.
- Runtime side effects: may set Playwright browser path env, launches Chromium, reads HTML/local files, writes PNGs and `paths.json`, JSON stdout, process exit.
- Canonical after migration: yes for Buster visual-reg screenshot/baseline tooling.
- Deletion/rename decision if not canonical: not applicable.

## Buster verify-task scoped push tool

- File: `skills/buster/pipeline/tools/verify-task.ts`
- Command/import path: `node skills/buster/pipeline/tools/verify-task.ts --project <name> [--role <role>] [--message <message>]`; task lifecycle completion imports the default function.
- Direct caller or operator surface: Buster task completion stage; operators can run CLI with `CURRENT_PROJECT`/role env fallback.
- Dispatch target: direct execution calls `verifyAndPush` after parsing role/project/message.
- Runtime side effects: reads Git status, reverts/deletes forbidden changes, commits/pushes scoped `.swarm` changes, JSON stdout, process exit.
- Canonical after migration: yes for Buster `.swarm` scope verification and controlled push.
- Deletion/rename decision if not canonical: not applicable.

## Buster visual-audit media upload tool

- File: `skills/buster/pipeline/tools/visual-audit.ts`
- Command/import path: `node skills/buster/pipeline/tools/visual-audit.ts <url> [--mode image|video]` with `DISCORD_CHANNEL` and `DISCORD_TOKEN`.
- Direct caller or operator surface: standalone operator visual audit CLI.
- Dispatch target: direct execution calls `visualAudit` after mode/env validation.
- Runtime side effects: asserts Buster capabilities, creates/removes temp media dir, launches Chromium, captures screenshot/video, uploads to Discord API, JSON stdout/stderr, process exit.
- Canonical after migration: yes as standalone capability-gated visual-audit operator tool.
- Deletion/rename decision if not canonical: not applicable.

## Nova pipeline CLI/runtime

- File: `skills/nova/pipeline/cli.ts`
- Command/import path: source CLI `node skills/nova/pipeline/cli.ts [options]`; root `skills/nova/pipeline.ts`/`pipeline/index.ts` surfaces delegate or re-export pipeline pieces.
- Direct caller or operator surface: operator/runtime Nova pipeline invocation for full pipeline, resume, status, dry-run, and blueprint commands.
- Dispatch target: direct execution calls `main()` after realpath comparison; `main` routes `--blueprint-list`, `--blueprint`, `--status`, `--dry-run`, or full `runPipeline`.
- Runtime side effects: parses flags, validates `--thinking`, creates/cleans temp dir, loads platform/project config, stores runtime model/thinking overrides, creates/binds `PipelineContext`, initializes log dirs and shutdown hooks, resolves prompt ingress, writes JSON stdout/stderr, and exits with pipeline exit code.
- Canonical after migration: yes for Nova operator/runtime CLI; implementation should stay thin and delegate config, context, status-store, blueprint, prompt ingress, and runner behavior to owned modules.
- Deletion/rename decision if not canonical: not applicable.


## Nova lint-report static-analysis tool

- File: `skills/nova/pipeline/tools/lint-report.ts`
- Command/import path: `node skills/nova/pipeline/tools/lint-report.ts --repo <path> [--tier pre-check|full] [--module-path <path>] [--changed-files <csv>] [--output <path>]`; `services/lint.js` runs it as a subprocess.
- Direct caller or operator surface: Nova pre-check/review/validator lint service and direct operator static-analysis CLI.
- Dispatch target: direct execution parses strict flags, builds lint context, resolves scope, runs `runAllTools` over `TOOL_REGISTRY`, writes JSON, and exits with `lintReportExitCode`.
- Runtime side effects: external lint/security tool subprocesses, filesystem/source/config reads, stderr JSON logs, optional log-path dual write, optional JSON output file, process exit.
- Canonical after migration: yes for lint-report static-analysis aggregation; individual external tool availability remains adapter behavior.
- Deletion/rename decision if not canonical: not applicable.

## Nova project-summary generator tool

- File: `skills/nova/pipeline/tools/project-summary.ts`
- Command/import path: `node skills/nova/pipeline/tools/project-summary.ts --project <name> [--repo <path>] [--output <file>] [--json] [--discord]`; `services/adapter-registry.js` imports `generateSummary` as the canonical project-summary generator.
- Direct caller or operator surface: pipeline summary generator adapter and direct operator summary CLI.
- Dispatch target: direct execution calls `generateSummary`, prints/writes Markdown or JSON, optionally calls `postToDiscord`, then exits.
- Runtime side effects: Git subprocess reads, project source and `.swarm` artifact reads, optional Markdown/JSON file write, optional Discord webhook dispatch via pipeline integration, process exit.
- Canonical after migration: yes for project-summary data collection/formatting; pipeline artifact placement remains owned by `services/summary/project-summary.ts`.
- Deletion/rename decision if not canonical: not applicable.


## Nova Redis task/completion tool

- File: `skills/nova/pipeline/tools/redis.ts`
- Command/import path: `node skills/nova/pipeline/tools/redis.ts --action send|read-completion|archive-completions ...`; production/runtime path remains `/app/skills/pipeline/tools/redis.ts`; `services/adapter-registry.js` imports the default library.
- Direct caller or operator surface: Nova Buster dispatch adapter, completion archival adapter, and direct operator Redis utility.
- Dispatch target: direct execution parses strict flags; `send` publishes a canonical Buster task envelope; `read-completion` scans only with strong expected completion identity; `archive-completions` archives active stream entries to `${stream}:log`.
- Runtime side effects: lazy Redis client creation, Redis stream publish/read/archive operations, optional Discord task notification, Redis operation callback logging, JSON stdout/stderr, Redis disconnect, process exit.
- Canonical after migration: yes as Nova's registered Redis adapter/operator tool; completion policy remains delegated to `services/redis-completion.js` and task queue mechanics to the common task transport contract.
- Deletion/rename decision if not canonical: not applicable; keep `sendTask` as compatibility alias only.

## Nova root pipeline compatibility shim

- File: `skills/nova/pipeline.ts`
- Command/import path: production `node /app/skills/pipeline.ts [options]`; source `node skills/nova/pipeline.ts [options]`; importable public API shim for `pipeline/index.ts`.
- Direct caller or operator surface: Nova runtime/operator pipeline invocation, deployment values, skill docs, verification import/smoke checks.
- Dispatch target: import-only usage re-exports `pipeline/index.ts`; direct execution dynamically imports `pipeline/cli.js` and awaits `main()`.
- Runtime side effects: realpath/exists checks on module and argv entry path; direct execution starts the CLI and inherits CLI side effects/exits.
- Canonical after migration: yes as a thin executable compatibility shim only; runtime logic stays in `pipeline/cli.js`, `pipeline/index.ts`, and service/runner modules.
- Deletion/rename decision if not canonical: not applicable.
