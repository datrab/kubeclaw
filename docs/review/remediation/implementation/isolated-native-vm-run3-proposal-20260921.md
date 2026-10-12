# Isolated native VM proposal — run 3

Prepared fixture for coordinator review; no launch by its preparer. This run
checks the independently reviewed process-to-scope projection that the unchanged
production consumer exposed in run 2. Failed run-1/run-2 disks, exports and logs
remain preserved; their results are not replaced.

The source export is a real independent copy of the frozen baseline, with no
shared regular-file inodes or hardlinks. Exactly four paths change: reviewed
`native-worker-process.ts`, new `native-process-policy.test.mts`, its native
TypeScript project inclusion, and its package node-pools command inclusion.
The snapshot manifest/delta prove this limit. The guest runs all original twelve
kernel cases, then all original 35 node-pools cases plus four maintained policy
cases: 39 total. Assertions, deadlines and original case bodies are untouched.
The new policy cases use actual child processes with modeled ownership, as their
names/docs disclose; they do not replace kernel tests.

A fresh guest disk contains its own generated UUID at `/etc/machine-id`. The
preparation recipe validates its UUID/mode before mkfs; guest initialization
makes guest authority files root-owned and invokes the unchanged production
identity reader before compile/typecheck/tests. Actual Node v24.21.0, kernel,
QEMU, util-linux flock and compiler packages are unchanged. `systemd-analyze`
remains absent, and its unchanged case will retain that prerequisite failure.
TCG cancellations are not grounds to increase original deadlines.

The [run-2 proposal](isolated-native-vm-run2-proposal-20260921.md) supplies the
same isolation and fixed budgets: network disabled, no host devices or host
installation/mount/cgroup/namespace changes, readonly source export, new guest
scratch disk only. Guest RAM 1 GiB, 2 vCPUs, TCG cache 64 MiB, QEMU address space
2 GiB, boot/overall watchdogs 120/900 seconds, process CPU 1200 seconds, console
64 MiB, shared-memory cutoff 2.75 GiB and initial nonreclaimable memory at most
512 MiB. Guest pool limits remain 512 MiB, 4096 tasks and one CPU quota. The
exclusive heavy-test slot remains required.

Exact scripts, package provenance references, snapshot delta, current existing
path differences and initial artifact hashes are in
`docs/review/evidence/isolated-native-vm-run3-proposal-20260921/`.
Newer Buster chart config/shared swarm schema/shared loader changes are excluded;
this does not test the whole current workspace. Other changed existing paths
are enumerated in `current-existing-path-differences.json`; current additional
files are outside that comparison. Native production/test inputs are compared
explicitly in `native-snapshot-current.json`.

```sh
python3 docs/review/evidence/isolated-native-vm-run3-proposal-20260921/launch-approved.py --verify-only
# Only the coordinator, after review and heavy-slot clearance:
python3 docs/review/evidence/isolated-native-vm-run3-proposal-20260921/launch-approved.py --execute-reviewed-proposal --confirm-no-heavy-tests
```

The launcher verifies initial disk/kernel/initrd/QEMU and exact source manifest
before boot, checks source entry sets/types/hashes after execution, and records
separate initial/final mutable-disk hashes. Successful guest cases would prove
bounded guest-kernel functionality, not physical-host scheduling/performance,
production deployment or full IFR16 acceptance.
