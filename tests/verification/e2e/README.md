# Real Pipeline E2E Verification

This directory owns the single canonical production-like pipeline verification path.

The harness must prove the pipeline by running real infrastructure and production contracts. It must not adapt itself to the current implementation just to make verification green.

## Canonical Entrypoint

- `run-real-pipeline-e2e.mjs`
- `approval-operator.mjs`

Both fast and full verification must call this harness. Fast mode may use a smaller production-shaped scenario, but it must not use a fake runner, mocked success path, alternate Buster completion hook, or separate lifecycle model.

Each canonical runner invocation writes a structured result JSON file. Pass
`--result-path <file>` to choose the location; otherwise the runner writes under
`.swarm/real-e2e/results/`. Failure matrix Markdown reviews are rendered from
those result files. Child stdout/stderr are bounded diagnostics only and are not
parsed as matrix evidence. Diagnostic streams keep only `tail`, `bytes`,
`truncated`, `tail_limit_bytes`, `fatal_line_limit`, and the first
`fatal_lines`; full process logs are never accumulated in memory.

The root wrappers call this harness directly:

- `tests/verification/run-fast-verification.sh` uses `--mode fast`
- `tests/verification/run-full-verification.sh` uses `--mode full`
- `tests/verification/e2e/run-real-pipeline-failure-matrix.mjs` runs negative scenarios by invoking the same canonical runner with `--scenario`

If production config or infrastructure is missing, these wrappers fail before running legacy contract/behavior checks.

## Required Real Surfaces

- real Redis streams and keys
- real OpenClaw gateway calls
- real ACP/Codex session launches
- real Git branch operations
- real Discord delivery
- real Buster task and completion contracts
- real architecture validator, deterministic checks, and validator agent path
- real Buster gate, Echo gate, approval gate, pipeline review agent, and pipeline summary
- real Buster namespace lease and Kubernetes deployment path
- real Tailscale preview URL reachability when the operator is installed

## Only Allowed Simulated Boundary

Nova may act as a contained Buster-compatible worker only where the real Buster pod/external execution boundary is unavailable to this pod. That simulator must consume the real Buster task payload, validate it with production-compatible rules, run the real suite runner where permissions allow, write the real output artifact, and emit the real completion signal.

The simulator is not allowed to fabricate a pass.

The approval operator is not a gate bypass. It waits for the production approval runner to create `.swarm/operator-approval-gate-status.json`, then writes the same terminal state an operator command would write. The production approval signal adapter, wait state, decision artifact, telemetry, and summary paths still have to process that state.

## Failure Policy

Missing capabilities fail explicitly. Strict full verification must not skip or downgrade missing infrastructure.

Examples:

- missing Tailscale operator: `INFRA_MISSING_TAILSCALE_OPERATOR`
- missing namespace lease RBAC: `INFRA_MISSING_BUSTER_NAMESPACE_LEASE_RBAC`
- missing Discord target/webhook: `INFRA_MISSING_DISCORD_TARGET`, `INFRA_MISSING_DISCORD_WEBHOOK`
- failed real Discord delivery receipt: `INFRA_DISCORD_DELIVERY_FAILED`, `INFRA_DISCORD_DELIVERY_RECEIPT_MISSING`
- failed ACP spawn: `INFRA_ACP_SPAWN_FAILED`
- failed Redis stream write/read: `INFRA_REDIS_FAILED`
- stale runtime swarm config: `PRODUCTION_CONFIG_CONTRACT_INVALID`

## Production Config Contract

The capability probe runs the real Nova CLI against the deployed runtime config path before creating any isolated E2E workspace. If `/home/node/.openclaw/swarm.config.json` is stale, compact-profile expansion is broken, or required runtime keys are absent, the E2E run is blocked with `PRODUCTION_CONFIG_CONTRACT_INVALID`.

The same probe sends a real production-path Discord message through Nova's Discord integration with webhook wait mode enabled. Verification requires Discord to return a concrete message id and channel id. This is the accepted proof level for the canonical E2E: Discord accepted the webhook delivery and returned the created message object. The harness does not claim independent bot/API channel readback unless a real readback credential is added later.

Nova Kubernetes read access for this probe must remain opt-in. The Helm chart keeps `busterNamespaceBroker.leaseClient.verificationRead.enabled` disabled by default; deployments that enable it for real E2E verification should treat it as read-only probe access for pods, the named Tailscale OAuth secret, and the `tailscale` IngressClass, not as workload or namespace mutation authority.

The run itself uses an expanded run-scoped `SWARM_CONFIG` only to isolate streams and worktree paths after the production config contract has passed.

## Post-Run Evidence Contract

A zero exit from the Nova process is not enough. After the production process returns, `real-run-evidence.mjs` verifies the concrete evidence that must exist after a real successful run:

- Forge completion artifact for the nginx module.
- Architecture validator `results.json` and `summary.md`.
- Final Buster gate output with k8s and Tailscale preview evidence.
- Echo module and final review gate outputs.
- Approval request and decision artifacts.
- Pipeline review markdown and JSON.
- Case-study and pipeline summary artifacts.
- Canonical pipeline lifecycle events with typed run, module, gate, ordering, and terminal success evidence.
- Discord audit log and `discord-deliveries.jsonl` receipt with a Discord-accepted webhook response message id.
- Buster task stream entries for both module and gate work, decoded from the canonical Redis task envelope.
- Pipeline telemetry and agent observability stream entries decoded from typed Redis `data` envelopes.

Expected failure scenarios must also prove a run-scoped failure contract. A
nonzero exit and matching stderr text are not sufficient; the run must leave
structured lifecycle evidence with the exact terminal event type, responsible
component, terminal status, failure class, and terminal event id required by the
scenario. Scenario-specific approval, Buster artifact, dead-letter, malformed
publisher, or summary evidence is required in addition to that terminal
contract. Process stdout/stderr are diagnostic tails only.

If any required artifact or stream entry is missing, the E2E run fails even when the process exits `0`.

## Scenario Model

The E2E suite has one runner and many scenarios. Scenarios may mutate only the
run-scoped generated project, progress, or config state. They must not write
fake terminal artifacts or emit alternate completion signals.

`forge-malformed-output` and `echo-malformed-output` use
`malformed-output-publisher.mjs` as a deterministic failure producer. It waits
for the real Forge/Echo prompt artifact, writes the malformed control artifact
at the production path, and leaves a typed manifest that failure evidence must
match exactly, including target path, raw payload SHA-256, and raw payload byte
length. Evidence also requires the production terminal rejection contract and
proves downstream success artifacts were not staged. The scenarios do not
depend on an agent deciding to follow a malformed-output instruction.

Supported scenarios:

- `success`
- `approval-deny`
- `approval-commentary`
- `approval-timeout-block`
- `approval-timeout-continue`
- `buster-module-failure`
- `buster-module-infra-failure`
- `forge-retry-then-success`
- `forge-multi-retry-then-success`
- `retry-budget-exhausted`
- `retry-fix-malformed-output`
- `retry-buster-pass-echo-rejects`
- `retry-stale-forge-output`
- `retry-reuses-previous-success-artifact`
- `needs-nova-code-failure`
- `forge-spawn-gateway-failure`
- `forge-malformed-output`
- `architecture-validator-block`
- `architecture-validator-config-contract-failure`
- `pipeline-review-config-contract-failure`
- `echo-gate-config-failure`
- `echo-malformed-output`
- `buster-invalid-completion-identity`
- `buster-missing-output-file`
- `buster-gate-failure`
- `k8s-pod-never-ready`
- `namespace-lease-denied`
- `tailscale-ingress-creation-failure`
- `tailscale-preview-url-unreachable`
- `tailscale-preview-wrong-deployment`
- `tailscale-unavailable`
- `pipeline-summary-failure`
- `redis-unavailable`
- `redis-transport-policy-failure`
- `discord-unavailable`
- `discord-webhook-missing`
- `k8s-context-invalid`
- `registry-pull-failure`
- `registry-credentials-missing`
- `tailscale-preview-credentials-missing`
- `required-env-missing`
- `git-credential-failure`
- `git-remote-push-failure`
- `git-non-fast-forward`
- `git-merge-conflict`
- `git-commit-failure`
- `git-dirty-worktree-preserved`
- `forge-timeout`
- `buster-module-timeout`
- `echo-gate-timeout`
- `final-review-timeout`
- `pipeline-review-timeout`
- `pipeline-cancelled`
- `multi-module-independent-success`
- `multi-module-dependent-success`
- `multi-module-dependency-blocked`
- `multi-module-retry-unlocks-dependent`
- `multi-module-concurrency-stress`
- `crash-before-buster-handoff`
- `crash-after-buster-task-enqueue`
- `crash-during-buster-wait`
- `crash-after-failed-gate-before-retry`
- `crash-during-retry-cycle`
- `crash-during-git-operation`
- `crash-after-final-review-before-summary`
- `crash-during-cleanup`
- `git-cleanup-failure`

`run-real-pipeline-failure-matrix.mjs` executes required negative scenarios by
shelling back into `run-real-pipeline-e2e.mjs`; it has no separate pipeline
driver. By default it fails fast. Use `--continue-on-failure` to run every
requested scenario and collect all failures before returning a nonzero exit.
When continue-on-failure is enabled, the runner writes a Markdown review under
`.swarm/real-e2e/failure-matrix-reports/` with every failed scenario, primary
structured reasons, artifact paths, and diagnostic tails. Use
`--report-path <file>` to choose a specific report file.

Report rendering is regression-tested from structured result objects. If
durable report fixtures are added, they should be exact captured
`real_pipeline_e2e_result.v1` outputs from real runs, not anonymized or
hand-shaped substitutes. The final Markdown review is human output; the
captured result JSON remains the machine-readable source of truth.

## Cleanup

Every run must be scoped by a run id and record a cleanup manifest. Successful
runs clean their Git branch, run-scoped Redis keys/streams, Buster namespace
lease, test namespace, and temporary artifacts. Failed runs retain artifacts by
default for debugging, and `REAL_E2E_KEEP_ARTIFACTS=1` can retain artifacts for
successful runs as well.

Cleanup is part of verification. If the production run succeeds but the harness
cannot remove its disposable Redis, Kubernetes, Git, or artifact resources, the
E2E process exits nonzero.

Result JSON includes `cleanup.cleanup_verification`. That object separates
infra cleanup (`infra_ok`, per-surface Redis/Kubernetes/Git status, and
`failed_surfaces`) from artifact retention. Retaining artifacts is diagnostic
only and must not hide Redis, Kubernetes, or Git cleanup failures.

`git-cleanup-failure` is the one cleanup-specific negative scenario. It lets the
production pipeline reach the successful terminal state, then creates a real
extra Git worktree on the disposable branch so branch deletion fails. The runner
passes that scenario only when the cleanup failure is observed and the temporary
blocker is then removed.

## Current Implementation Order

1. Capability probe.
2. Fixture project.
3. Run workspace manager.
4. Nova lease-client RBAC.
5. Buster-compatible simulator.
6. Production pipeline runner.
7. Redis, Discord, gate, review, summary, Kubernetes, and Tailscale assertions.
8. Failure-mode matrix.
9. Fast/full wrapper integration.

## Timeouts

The production pipeline child is bounded by `REAL_E2E_PIPELINE_TIMEOUT_MS`
(`45m` in fast mode, `2h` in full mode by default). Timeout termination is a
real verification failure, not a retry/fallback path.
