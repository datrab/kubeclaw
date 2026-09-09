# Exact committed integration verification

Verified source: `d3c20536210c918e32dce24dce09254198fac8a0`.

A fresh detached worktree at `/workspace/scratch/4e25cf57c177/kubeclaw-resume-verification` was created from that commit. Only real `node_modules` were copied from the existing verification worktree using `cp -a`, preserving relative workspace symlinks. No generated observer contract or build output was seeded. Tracked and untracked source status was clean before and after the run; the source SHA did not change.

The unchanged command `npm run verify:plugin-system-v2` ran with `/workspace/scratch/4e25cf57c177/toolchains/bin:/workspace/scratch/4e25cf57c177/toolchains/go/bin` prepended to `PATH`. It exited with status 1.

Full output: `/workspace/scratch/4e25cf57c177/integration-d3c2053-original.log`.

Log SHA256: `05e076100064965666f9cfc0d360c1bf76a0f155b0745cd951e0eb81ad79a0a9`.

## Passed gates

- Clean `@kubeclaw/openclaw-agent-observer` build, including generated host-observer contract preparation.
- `plugin-system:sdk:check`.
- `plugin-system:plugins:build`.
- `plugin-system:sandbox:build`.
- Plugin runtime TypeScript check.
- Plugin-system-v2 contracts.
- Agent-output contracts (6 registrations, 2 runtime evidence protocols).
- Boundaries, platform configuration, and registry contracts.
- Import safety (46 packages, 40 registrations).
- Lifecycle, phase6, and phase7 contracts.

The clean observer build passed without a cached contract, resolving the previous first failure observed on `9b4e68a`.

## First remaining blocker

`node tests/verification/contracts/check-plugin-system-v2-phase11.mts` failed at line 203, the first isolated external stage execution, with `ISOLATION_CGROUP_REQUIRED` from `foundation/isolation/cgroup.ts:19`.

The committed phase11 gate reads its cgroup root only from `process.argv[2]`. The committed npm verification command supplies no argument, so registry activation receives no isolation root and mandatory cgroup setup correctly fails closed. A delegated cgroup-v2 root is a real execution prerequisite; this environment does not supply one. Later gates were not reached, so this run is not evidence that they pass.

No product or test changes, skipped assertions, weakened isolation, simulated kernel interfaces, CI jobs, or deployments were used.

## Exact committed repair-budget verification

The same clean detached worktree was subsequently moved to `2f265ae18333db2155752261576c6d3332bb48a2`. This committed source excludes the concurrent operator `deliveryId` edits in the shared implementation worktree. Source status remained clean after these checks, which used the same toolchain PATH:

- `npm run typecheck --prefix skills/nova`: exit 0.
- `node --test tests/verification/reliability/repair-budget.test.mjs tests/verification/reliability/repair-budget-recovery.test.mjs`: exit 0; 12 passed, 0 failed, 0 skipped.

Typecheck log: `/workspace/scratch/4e25cf57c177/nova-budget-2f265ae-typecheck.log`; SHA256 `0ba3630c8c428d29a2bd44fa004a9be1052d9ffba1e308038d67e4287c9d3176`.

Test log: `/workspace/scratch/4e25cf57c177/nova-budget-2f265ae-tests.log`; SHA256 `f2fe3d9247ec64efd3593db4976a38cc998616fadcfd40783f1a417da46b2a3a`.

These exact-source results resolve the transient typecheck uncertainty caused by concurrent shared-worktree edits; they do not change the full integration cgroup prerequisite above.

## Required isolation-root wiring

The integration npm chain now explicitly supplies the required `KUBECLAW_TEST_CGROUP_ROOT` as the existing positional argument to all three consumers: phase11, isolation, and external-engine. Shell `${KUBECLAW_TEST_CGROUP_ROOT:?...}` expansion rejects an unset or empty value. The gates and isolation validator are unchanged. Host prerequisites and an operator command example are documented in `docs/developers/testing-and-ci.md`; the variable must identify a genuinely delegated cgroup-v2 subtree provisioned by the host administrator.

Targeted probes extracted the three changed command segments from the shared `package.json` and executed them using `/bin/sh` against the clean detached `2f265ae18333db2155752261576c6d3332bb48a2` worktree:

- All three segments exited 2 with the explicit configuration error when the environment variable was absent.
- Supplying the real ordinary verification-worktree directory as phase11's argument exited 1 with `ISOLATION_CGROUP_ROOT_INVALID`, confirming that the supplied argument reached the unchanged real filesystem-type validator. This was a negative input test, not an attempt to emulate a cgroup.

Probe output: `/workspace/scratch/4e25cf57c177/integration-cgroup-wiring-probes.log`. These probes establish configuration propagation and fail-closed rejection only. A complete integration pass still requires real delegated cgroups and native sandbox/process-tree facilities unavailable in this environment. No CI or deployment was executed.
