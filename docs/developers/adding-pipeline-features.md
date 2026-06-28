# Adding Pipeline Features

Status: current
Audience: developer

## Purpose

Describe the safest path for adding Nova pipeline E2E behavior.

## Approach

1. Identify the owning surface: CLI/config, registry, module runner, gate runner, lifecycle, telemetry, artifact writing, Discord, or Redis.
2. Read the existing contract helpers before adding new shapes.
3. Add the behavior in the narrow owner module.
4. Emit lifecycle and telemetry through the existing services when the behavior changes operator-visible state.
5. Update status/artifact surfaces only through the status store and artifact helpers.
6. Add or update focused verification in `tests/verification/`.
7. Update docs and open issues if behavior changes are intentional but incomplete.

Terminal behavior must use typed `terminal_status`, `terminal_decision`, and `reason_code` data. Do not add readers or tests that preserve numeric terminal replay fields such as `exit_code` or `exit_reason`.

## Common owners

- CLI flags: `skills/nova/pipeline/cli.ts`
- Config loading: `skills/nova/pipeline/core/config.ts`
- Plugin registration and validation: `skills/nova/pipeline/core/registry*.ts`
- Module execution: `skills/nova/pipeline/runners/module-runner*.ts`
- Terminal handling: `skills/nova/pipeline/runners/pipeline-runner-terminal.ts`
- Status and artifacts: `skills/nova/pipeline/services/status-store.ts`
- Telemetry: `skills/nova/pipeline/services/telemetry/`
- Terminal contracts: `skills/nova/pipeline/services/contracts/terminal-decision.ts`

## Feature Surface Checklist

| Feature type | Edit first | Required contract | State/artifact output | Verification |
| --- | --- | --- | --- | --- |
| New CLI flag or operator command | `skills/nova/pipeline/cli.ts`; `skills/nova/pipeline/cli-args.ts` | normalized flags must stay JSON-safe and redacted by `sanitizeJsonEgress`/`redactSecrets` | CLI JSON output or process exit code only at boundary | `node --test tests/skills/nova/pipeline/cli.test.mjs tests/skills/common/pipeline/cli-args.test.mjs`; strict CLI contract check |
| New platform config key | `skills/nova/pipeline/core/config.ts`; `skills/nova/pipeline/core/platform-config.ts`; `charts/kubeclaw/files/config/swarm.config.json` | `validateConfig` must reject missing/invalid runtime shapes; project-only keys must stay in `.swarm/progress.json` | loaded `config`, plugin registry summary, derived `config.paths.*` | `node --test tests/skills/nova/pipeline/core/config-plugin-registry.test.mjs tests/skills/nova/pipeline/core/path-segments.test.mjs` |
| New plugin/extension hook | `skills/nova/pipeline/core/registry.ts`; `skills/nova/pipeline/core/registry/validation.ts`; `skills/nova/pipeline/core/context.ts` | stage owner, capability allowlist, and invocation envelope must be explicit | plugin registry entry and bounded invocation envelope | config registry tests plus `node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs --source-root "$PWD"` |
| New module or gate execution behavior | `skills/nova/pipeline/runners/module-runner.ts`; `skills/nova/pipeline/runners/gate-runner.ts`; focused runner file | use typed worker/gate control result and terminal decision helpers | lifecycle events, status read model, artifacts, telemetry | runner unit tests plus `node tests/verification/contracts/check-module-runner-slice-surface.mjs --source-root "$PWD"` |
| New Buster task field or suite capability | `skills/buster/pipeline/services/task-validation.ts`; `skills/buster/pipeline/services/capabilities.ts`; suite runner files | Buster task payload must validate identity, capability, timeout, and repo-relative path boundaries | Redis completion or dead-letter before ACK | `node --test tests/skills/buster/pipeline/services/task-validation.test.mjs tests/skills/buster/pipeline/services/task-completion.test.mjs`; Buster contract check |
| New artifact or telemetry surface | `skills/nova/pipeline/services/artifact-bundle.ts`; `skills/nova/pipeline/services/telemetry/builders.ts`; `skills/nova/pipeline/services/telemetry/dispatch.ts`; `skills/nova/pipeline/services/telemetry-sink-contract.ts` | event envelope stays flat; artifact path stays inside run/plugin artifact roots | `pipeline.jsonl`, Redis telemetry stream, artifact index or summary file | `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"`; telemetry contract check |

## Failure Modes To Preserve

- Invalid config should fail during `loadConfig` or `validateConfig`, not halfway through a module.
- Buster malformed tasks should produce `BUSTER_TASK_MALFORMED` evidence and a dead-letter path before ACK.
- Lifecycle-owned fields must not be changed through unguarded status writes; `STATUS_LIFECYCLE_GUARD_VIOLATION` is the expected protection.
- Telemetry sink failures should degrade observability without changing pipeline terminal truth.
- Prompt files and repo-relative paths must stay inside the current repo and pass path-segment validation.

## Verification

Use the smallest behavior area that covers the change. For cross-surface changes, run the relevant behavior area plus any contract or runtime smoke test that owns the changed schema or startup path.

Common closeout set:

```bash
npm run docs:check
node --test tests/verification/e2e/*.test.mjs
node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
git diff --check
```
