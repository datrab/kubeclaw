# PR 6 native scope implementation checkpoint

Status: incomplete; no finding is closed by this checkpoint.

The user approved generic ownership mechanisms in Worker Core, Buster-owned
fixture lifecycle, separate Prism attempt execution, and dedicated delegated
cgroup areas with explicit total budgets. No deployment or host mutation ran.
The central settings audit remains a separate roadmap item.

## Implemented primitive

Worker Core now exposes `NativeWorkerResourceScope`. It creates only child
scopes under an explicitly configured, empty, controller-delegated cgroup v2
root; it does not change delegation, permissions or mounts. Memory, swap and
task ceilings are verified by reading them back. Kernel counters retain their
explicit Linux-task unit, cumulative CPU microseconds and memory/task peaks.
Missing counters fail. Ordinary directories cannot emulate an accepted cgroup.

Termination uses `cgroup.kill`, waits for the subtree's `populated` counter to
clear, and keeps counters until explicit disposal. Scope operations verify the
directory device/inode. A timeout retains the scope instead of claiming it was
removed. This primitive is not a durable ownership registry, launcher, contract
migration or engine integration; it is not sufficient to establish attempt
ownership or prevent a trusted caller from reattaching a process after drain.
The eventual coordinator must fence admission/launch before drain and disposal.

## Local checks

- `node --test tests/verification/reliability/worker-native-observation.test.mts`:
  3 passed, 0 failed, 0 skipped. Reads actual test-container cgroup counters and
  executes actual CPU work; also rejects filesystem substitutes, host roots and
  invalid limits. It does not prove isolated per-attempt accounting.
- `node_modules/.bin/tsc --noEmit -p skills/worker/core/tsconfig.json`: passed.
- Canonical ESLint on both native modules and the new test: passed.
- `git diff --check`: passed.

The current test container mounts cgroup v2 read-only:
`cgroup2 on /sys/fs/cgroup type cgroup2 (ro,nosuid,nodev,noexec,relatime,nsdelegate)`.
No `KUBECLAW_WORKER_TEST_CGROUP_ROOT` is configured. Positive child-scope
allocation, native launch, aggregate enforcement, descendant termination and
restart recovery have not run. No remount, privilege escalation or substituted
kernel provider was attempted. These tests must not be reported as passing.

## Remaining work

Persist and reconcile scope ownership under service/claim fences; implement the
trusted pre-execution launcher and host protocol; migrate task contracts and
profiles explicitly; seal terminal observations after quiescence. Integrate
Prism input/render/upload work and Buster capability/adapter work, then add the
Buster fixture lifecycle and restart cleanup. Implement and verify the remaining
cross-store history-retirement operation. Charts and operating instructions for
the full native host path are also still pending. PCR-BUSTER-ENGINE-001,
PCR-BUSTER-ENGINE-004, PCR-PRISM-WORKER-002 and PCR-OBS-002 remain open.
