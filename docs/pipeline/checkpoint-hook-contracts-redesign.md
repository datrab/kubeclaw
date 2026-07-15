# Checkpoint Hook Contracts Redesign

Status: phases 1-13 implemented. Scenario hook declarations live beside the scenario registry, checkpoint reuse validates the scenario hook contract before restore or fault injection, mutation entrypoints assert scenario mutation contracts, eight suite declarations own the executable matrix, and root contract verification enforces the redesign.

## Problem

Checkpoint reuse currently behaves too much like "restore a mostly complete seed workspace and hope the scenario still lines up." That makes scenario evidence fragile because restored state may contain unrelated artifacts, stale lifecycle read models, or topology assumptions that the scenario never owned.

Checkpoint snapshots must become phase contracts. A scenario should declare the exact hook point it needs, restore only canonical state for that hook, inject one fault, and execute only the relevant phase or downstream consequences.

## Contract

Each checkpoint hook must define:

- `name`: stable hook id.
- `phase_boundary`: the runner boundary the hook represents.
- `fixture_families`: fixture families compatible with the hook.
- `required_state`: minimal artifacts required before resuming.
- `forbidden_state`: artifacts that prove the hook is too late.
- `required_lifecycle_state`: read-model facts required before resuming.
- `skipped_agent_phases`: phases already proven by the checkpoint.
- `remaining_phases`: phases the scenario is allowed to execute.
- `allowed_fault_surfaces`: scenario fault surfaces that may start from the hook.

Scenario declarations must include:

- `scenario_id`
- `required_hook`
- `fixture_family`
- `fault_injection_surface`
- `allowed_mutation_channels`
- `expected_terminal_authority`
- `expected_evidence`
- `dedupe_group`

Suite declarations must include:

- `id`
- `description`
- `scenarios`

The executable checkpoint matrix is suite-owned. Individual scenarios are case
contracts inside a suite, not top-level matrix children.

The root contract `tests/verification/contracts/check-checkpoint-hook-contracts.mjs`
enforces this shape for every failure-matrix scenario. A scenario without an
explicit hook, fixture family, fault surface, terminal authority, or mutation
channel is invalid before any checkpoint run starts.

## Fixture Families

Use a small number of explicit fixture families instead of bending the canonical seed into every shape:

The currently implemented fixture families are:

- `standard-4-module`: canonical seed with foundation, two parallel branches, and release assembly.
- `linear-2-module`: reserved for a small dependent-module checkpoint family.
- `single-module`: reserved for single-module contract checkpoints.

Only `standard-4-module` has checkpoint bundles today. A scenario that needs `linear-2-module` or `single-module` must add that fixture family before it can reuse checkpoints.

If a scenario needs a fixture shape outside these families, either add a tiny fixture family with its own checkpoints or demote the scenario to a lower-level contract test.

## Hook Points

- `pre-forge`: source/config/progress ready; no module agent output.
- `post-forge`: Forge output and git handoff complete; no Buster completion.
- `pre-module-buster`: Buster task not dispatched yet; used for Redis/task identity faults.
- `during-module-buster-wait`: task dispatched; completion not adjudicated.
- `pre-module-review`: module review gate ready; no review output.
- `post-module-review`: module review applied; approval not started.
- `post-approval`: approval applied; final Buster not started.
- `pre-final-buster`: deployable artifact ready; final Buster not started.
- `pre-final-review`: final review ready; no final review output.
- `post-final-review`: final review applied; summary/delivery not started.
- `pre-terminal-delivery`: summary/latest exist; Discord, pipeline-review, and delivery sinks remain.
- `during-cleanup`: terminal delivery complete enough to test cleanup idempotency.

## Rules

- A checkpoint may not contain downstream artifacts for its hook.
- A scenario may mutate only its declared `fault_injection_surface`.
- Scenario mutation entrypoints must assert their concrete mutation channel before
  changing progress, config, source files, environment, Git shims, malformed
  output, crash/cancel controllers, or cleanup blockers.
- Every scenario mutation contract must be checked through the harness-owned
  assertion before mutation. There is no secondary mutation path.
- A scenario's `fault_injection_surface` must be allowed by its hook.
- A checkpoint bundle's manifest must carry the current canonical hook contract.
- Runtime config is immutable after restore unless the scenario is explicitly a runtime-config scenario.
- Git fault scenarios must inject at Git authority, not by breaking setup.
- Discord scenarios assert degraded observability events, not product success/failure authority.
- Crash/resume scenarios require hook points at the crash surface, not generic late snapshots.
- Multi-module scenarios must use an explicit multi-module fixture family.
- No legacy full-lifecycle fallback remains. `full` checkpoint mode is still an
  explicit operator choice, but `auto` and `reuse` may not silently run a
  scenario from scratch when a hook contract or checkpoint bundle is missing.

## Plan-Validation Tests

The checkpoint redesign is guarded by plan-level contracts, not only by matrix
behavior:

- `check-checkpoint-hook-contracts.mjs` verifies every suite case has an
  explicit hook, fixture family, fault surface, terminal authority, and
  mutation contract.
- The same contract verifies exactly eight top-level suites and exactly one
  suite owner for each real E2E scenario.
- The same contract verifies every scenario hook validates against the hook
  registry and rejects undeclared mutation channels.
- Pruned and merged scenarios are not active matrix children. Each one must
  declare a replacement matrix scenario, a lower-level coverage owner, and a
  reason before it can remain in the registry.
- The contract fails if stale full-lifecycle fallback symbols return to the
  harness.
- `checkpoints.test.mjs` verifies concrete restore-time failures for wrong
  hook, wrong fixture family, missing required state, forbidden downstream
  state, and out-of-surface mutation channels.

These tests validate the checkpoint contract plan itself. The full matrix is
not the authority for whether checkpoint hook contracts are structurally valid.

## Migration Order

1. Add scenario inventory and grouping.
2. Add hook contract metadata beside the scenario registry. Done.
3. Make checkpoint validation use hook contracts before reuse. Done.
4. Collapse required artifacts, forbidden artifacts, lifecycle requirements, remaining phases, and allowed fault surfaces into one hook contract authority. Done.
5. Add phase-specific hook points and fixture-family enforcement. Done.
6. Enforce scenario mutation surfaces at every mutation entrypoint. Done.
7. Delete empty full-lifecycle checkpoint fallback paths. Done.
8. Add plan-validation tests and update docs. Done.
9. Prune or demote duplicate scenarios. Done.
10. Make CLI output compact before the next canary matrix. Done.
11. Keep full child stdout/stderr in files only. Done.
12. Merge scenario children into eight executable suites. Done.
13. Run the suite matrix instead of the old 45-child scenario matrix. Done.

Do not restore the old per-scenario matrix. The canonical operator surface is
`run-real-pipeline-failure-matrix.mjs --suite <id>` or `--suites a,b`; individual
scenario names remain case-level evidence identities only.
