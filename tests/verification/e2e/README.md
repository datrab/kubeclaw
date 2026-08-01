# Real Pipeline E2E Verification

This directory owns the single canonical production-like pipeline verification path.

The harness must prove the pipeline by running real infrastructure and production contracts. It must not adapt itself to the current implementation just to make verification green.

## Canonical Entrypoint

- `run-real-pipeline-e2e.mjs`
- `approval-operator.mts` — v2-only typed approval controller; it rejects non-v2 invocation.
- `check-v2-production-contracts.mts` — constructs the real 15-stage graph and
  validates every package, registration, grant, provider, configuration, stage
  input, and stage schema without dispatching an agent or running the pipeline.

Both fast and full verification must call this harness. Fast mode may use a smaller production-shaped scenario, but it must not use a fake runner, mocked success path, alternate Buster completion hook, or separate lifecycle model.

Each canonical runner invocation writes a structured result JSON file. Pass
`--result-path <file>` to choose the location; otherwise the runner writes under
`.swarm/real-e2e/results/`. Failure matrix Markdown reviews are rendered from
those result files. Failure matrix stdout is intentionally compact: one
`PASS|FAIL|SKIP scenario=<id> reason=<code> artifact=<result.json>` line per
completed scenario and one `SUMMARY` line. Full child stdout/stderr are written
beside each scenario result as `.stdout.log` and `.stderr.log`; they are never
mirrored through matrix stdout/stderr. Bounded diagnostics in result JSON keep
only `tail`, `bytes`, `truncated`, `tail_limit_bytes`, `fatal_line_limit`,
`fatal_lines`, and the full-log file paths; full process logs are never
accumulated in memory.

The root wrappers call this harness directly:

- `tests/verification/run-fast-verification.sh` uses `--mode fast`
- `tests/verification/run-full-verification.sh` uses `--mode full`
- `tests/verification/e2e/run-real-pipeline-failure-matrix.mjs` runs negative scenarios by invoking the same canonical runner with `--scenario`

If production config or infrastructure is missing, these wrappers fail before starting v2 lifecycle execution.

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
- failed configured Codex spawn: `INFRA_CODEX_SPAWN_FAILED`
- failed Redis stream write/read: `INFRA_REDIS_FAILED`
- stale runtime swarm config: `PRODUCTION_CONFIG_CONTRACT_INVALID`

## Production Config Contract

The capability probe runs the real Nova CLI against the deployed runtime config path before creating any isolated E2E workspace. If `/home/node/.openclaw/swarm.config.json` is stale, compact-profile expansion is broken, or required runtime keys are absent, the E2E run is blocked with `PRODUCTION_CONFIG_CONTRACT_INVALID`.

The same probe sends a real production-path Discord message through Nova's Discord integration with webhook wait mode enabled. Verification requires Discord to return a concrete message id and channel id. This is the accepted proof level for the canonical E2E: Discord accepted the webhook delivery and returned the created message object. The harness does not claim independent bot/API channel readback unless a real readback credential is added later.

Nova Kubernetes read access for this probe must remain opt-in. The Helm chart keeps `busterNamespaceBroker.leaseClient.verificationRead.enabled` disabled by default; deployments that enable it for real E2E verification should treat it as read-only probe access for pods, the named Tailscale OAuth secret, and the `tailscale` IngressClass, not as workload or namespace mutation authority.

The run itself uses an expanded run-scoped `SWARM_CONFIG` only to isolate streams and worktree paths after the production config contract has passed.

The generated E2E module and final Buster gate use a bounded internal timeout by
default (`REAL_E2E_MODULE_TIMEOUT_MINUTES`, default `10`, and
`REAL_E2E_BUSTER_GATE_TIMEOUT_MINUTES`, defaulting to the module timeout). The
matrix scenario timeout remains an outer guard only. The Buster suite worker
owns deterministic execution and its authenticated terminal receipt; Nova's
effect and lifecycle journals remain the canonical pipeline authority.

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
- Buster suite-job receipts for both module and gate work, correlated with Nova's canonical effect and lifecycle journals.
- Pipeline telemetry stream entries decoded from typed Redis `data` envelopes.
- Agent observability success evidence from promoted `agent.*` events in the canonical pipeline event spine; raw observer Redis streams are ingress diagnostics.
- The run-relative canonical observability bundle passes the pipeline-owned verifier and offline lifecycle replay with zero projection mismatches.
- Run manifest, terminal closure, archive manifest, producer health, content-addressed artifact catalog, composed-prompt metadata, Git diff evidence, and immutable Git evaluation facts are present and mutually consistent.

ACP sessions may declare tool evidence unavailable when the ACP runtime does not expose raw tool updates. Native OpenClaw subagent runs must still publish paired `agent.tool.started` and `agent.tool.finished` evidence; the E2E success path does not accept missing native-subagent tool evidence.

Evidence corpora are deliberately separate: `generate-schema-conformance.mjs` creates synthetic positive/negative fixtures for every advertised event and marks them `readiness_eligible: false`; `generate-real-parallel-run.mjs` contains only recorded ACP evidence and its explicit tool capability limitation; the real E2E success and failure-matrix scenarios provide production evidence for native subagent tools, commands, retries, degradation, artifacts, Git, quality, and infrastructure. Every corpus event declares `production`, `recorded`, or `synthetic` provenance, and synthetic evidence is excluded from readiness coverage.

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

Each scenario declares one checkpoint `fault_injection_surface` and the harness
derives concrete `allowed_mutation_channels` from that surface. Progress,
config, source-file, environment, Git-shim, malformed-output, crash/cancel, and
cleanup-blocker entrypoints assert that contract before mutating anything.
There is no alternate checkpoint path: every matrix scenario must have a
declared hook contract, and invalid or missing checkpoint bundles fail before
the scenario runs.

The checkpoint contract itself is root-verified by
`tests/verification/contracts/check-checkpoint-hook-contracts.mjs`. That guard
checks all matrix scenarios for explicit hooks, fixture families, fault
surfaces, expected terminal authority, mutation channels, and absence of
non-v2 lifecycle symbols. It also enforces compact matrix stdout and
file-backed full child logs. Matrix execution is not the structural contract
authority; it only proves live behavior after those contracts are already valid.

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
- `approval-timeout-block`
- `buster-module-failure`
- `buster-module-infra-failure`
- `forge-retry-then-success`
- `retry-budget-exhausted`
- `retry-fix-malformed-output`
- `retry-buster-pass-echo-rejects`
- `needs-nova-code-failure`
- `forge-malformed-output`
- `architecture-validator-block`
- `echo-malformed-output`
- `buster-invalid-completion-identity`
- `buster-gate-failure`
- `k8s-pod-never-ready`
- `namespace-lease-denied`
- `tailscale-preview-url-unreachable`
- `tailscale-preview-wrong-deployment`
- `pipeline-summary-failure`
- `redis-unavailable`
- `discord-unavailable`
- `k8s-context-invalid`
- `registry-pull-failure`
- `git-credential-failure`
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
- `crash-before-buster-handoff`
- `crash-after-buster-task-enqueue`
- `crash-during-buster-wait`
- `crash-after-failed-gate-before-retry`
- `crash-during-git-operation`
- `crash-after-final-review-before-summary`
- `crash-during-cleanup`
- `git-cleanup-failure`

The active failure matrix is the executable scenario registry except for the
canonical `success` run. Duplicated or overly broad scenarios are deleted from
the runner and covered by smaller contract tests where needed. Root
`verify:contracts` fails if a second pruned-scenario registry or alternate
full-lifecycle authority is introduced.

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
`real_pipeline_e2e_result.v2` outputs from real runs, not anonymized or
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

## Model Defaults

The harness defaults to `gpt-5.4` with thinking `none` for Nova, Forge,
Buster, Echo, architecture validation, pipeline review, and case study agents.
The direct Codex capability probe follows the production smoke config dispatch.
If the smoke config says `subagent`, the probe proves subagent launch; if it
says `acp`, the probe proves ACP launch. Use `REAL_E2E_MODEL`,
`REAL_E2E_THINKING`, or `REAL_E2E_AGENT_RUNTIME` only when a run intentionally
needs an override.
