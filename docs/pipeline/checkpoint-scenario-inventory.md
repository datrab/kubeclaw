# Checkpoint Scenario Inventory

Status: current
Audience: maintainers, pipeline developers

Purpose: keep one canonical matrix surface while preserving typed evidence for
each failure/recovery contract.

## Summary

- Registered real E2E cases: 46.
- Active matrix suites: 8.
- Active matrix cases: 46.
- Manual cases outside the matrix: none.

Each suite restores the case hook, mutates only the declared surface, runs only
the remaining phase authority for that case, and stops the suite on the first
failed case unless `--continue-on-failure` is explicitly enabled.

## Suites

### `full-pipeline-smoke`

Full lifecycle smoke.

- `success`

### `module-failure-retry`

Module Forge, Buster, retry, timeout, identity, and needs-Nova authority.

- `forge-retry-then-success`
- `retry-budget-exhausted`
- `retry-fix-malformed-output`
- `retry-buster-pass-echo-rejects`
- `needs-nova-code-failure`
- `buster-module-failure`
- `buster-module-infra-failure`
- `buster-invalid-completion-identity`
- `buster-module-timeout`
- `forge-malformed-output`
- `forge-timeout`

### `human-gates`

Operator approval, module review, final review, and pipeline review gates.

- `approval-deny`
- `approval-timeout-block`
- `echo-malformed-output`
- `echo-gate-timeout`
- `final-review-timeout`
- `pipeline-review-timeout`

### `final-deployment-buster`

Final Buster, Kubernetes, registry, namespace, and preview authority.

- `buster-gate-failure`
- `namespace-lease-denied`
- `k8s-pod-never-ready`
- `k8s-context-invalid`
- `registry-pull-failure`
- `tailscale-preview-url-unreachable`
- `tailscale-preview-wrong-deployment`

### `git-authority`

Git sync and cleanup authority.

- `git-credential-failure`
- `git-non-fast-forward`
- `git-merge-conflict`
- `git-commit-failure`
- `git-dirty-worktree-preserved`
- `git-cleanup-failure`

### `infrastructure-observability`

Runtime infrastructure, observability, summary, architecture, and cancellation.

- `redis-unavailable`
- `discord-unavailable`
- `pipeline-summary-failure`
- `architecture-validator-block`
- `pipeline-cancelled`

### `module-graph`

Independent and dependent module graph authority.

- `multi-module-independent-success`
- `multi-module-dependent-success`
- `multi-module-dependency-blocked`

### `crash-resume`

Crash and resume idempotency across pipeline checkpoints.

- `crash-before-buster-handoff`
- `crash-after-buster-task-enqueue`
- `crash-during-buster-wait`
- `crash-after-failed-gate-before-retry`
- `crash-during-git-operation`
- `crash-after-final-review-before-summary`
- `crash-during-cleanup`

## Rules

- Aggregate matrix selection uses `--suite` or `--suites`.
- Focused diagnosis uses `--scenario`; suite continuation uses `--from-scenario`.
- Case names remain the evidence identity and retain exactly one suite owner.
- No case may be owned by more than one suite.
- No real E2E case may be outside all suites.
- Checkpoint mode defaults to `auto`; full lifecycle is explicit operator mode.
- A suite result is the matrix child artifact; case result files remain the
  machine-readable evidence for each contract.
