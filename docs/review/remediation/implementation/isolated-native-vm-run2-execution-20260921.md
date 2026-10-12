# Isolated native VM execution — run 2

Status: failed, terminal. Wrapper session 49576 returned failure; QEMU exited 0
after normal guest poweroff. Elapsed wrapper time was 507.97 seconds; no watchdog
stopped the run. Actual persistent guest identity, launcher compilation and
native scoped typecheck all passed their explicit preflight phases.

| Unchanged gate | Tests | Passed | Failed | Cancelled | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native scope/topology | 12 | 11 | 1 | 0 | 0 |
| Node pools | 35 | 30 | 1 | 4 | 0 |

The native failure exposed a production defect: `runNativeWorkerProcess` passed
the complete process policy to owner allocation, whose strict scope decoder
accepts only memory and task limits. The original production-launcher/whole-host
accounting case failed with `WORKER_NATIVE_LIMIT_INVALID`, wrapped by
`WORKER_NATIVE_SUPERVISOR_UNRESOLVED`. This is separate from run 1's invalid
fixture identity. The eleven actual kernel passes include memory/task pressure,
recovery identity, nested-cgroup rejection and draining after persistence failure;
they do not make the full native gate pass. A boundary fix requires independent
review and a separately bound run; it cannot rewrite this failed checkpoint.

Node pools retained one missing-`systemd-analyze` prerequisite failure and four
cancellations: accepted-writer SIGKILL, sealed-writer SIGKILL and busy-live-attempt
cases hit their original 20-second deadlines; the supervisor-lock/SIGKILL case
hit its original 15-second deadline. No cases or assertions were removed and no
deadline was extended for TCG.

The [run-2 proposal](isolated-native-vm-run2-proposal-20260921.md) and copied
prepared metadata bind the initial disk, kernel, initrd, tools and frozen run-1
source snapshot. Source verification passed before and after execution. The
explicit comparator has 131/134 current inputs matching; chart config, shared
swarm schema and shared swarm loader changed during separate Buster work. Run 2
tested their frozen versions, not the current whole repository.

[Raw console](../../evidence/isolated-native-vm-run2-execution-20260921/vm-console.txt)
and [wrapper result](../../evidence/isolated-native-vm-run2-execution-20260921/vm-result.json)
retain terminal output. Initial disk SHA-256:
`e214e47071eba919812e05f820ae9acb3021e7902a3d59c20804bf11cf81e9bf`;
final mutable disk SHA-256:
`b1c3805885814fb8669cdb7a947b350edf64c5b4957c99b485aea959be33a83c`.
The run-2 disk is retained separately; run-1 artifacts remain untouched.
Guest-kernel evidence does not establish physical-host performance, deployment
or full IFR16 acceptance.
