# Adding Pipeline Features

Status: current
Audience: developer

## Purpose

Describe the safest path for adding Nova pipeline behavior.

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

## Verification

Use the smallest behavior area that covers the change. For cross-surface changes, run the relevant behavior area plus any contract or runtime smoke test that owns the changed schema or startup path.
