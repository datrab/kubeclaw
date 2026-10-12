# Independent isolated native VM preparation review

Status: **bounded preparation accepted for the fixed reviewed launch attempt**; no VM boot
or guest operation performed by this reviewer. Scope is the
[prepared proposal](isolated-native-vm-proposal-20260921.md), not native-test acceptance.

The inspected command confines execution to unprivileged QEMU TCG, two vCPUs,
1 GiB guest RAM, a 2 GiB address-space ceiling, fixed wall/CPU watchdogs and capped
console output. It exposes no NIC, KVM, passthrough device or writable host source.
The read-only source snapshot and new raw guest disk are the explicit exports.
Guest-only root ownership/cgroup setup does not change host cgroups or namespaces.
Kernel configuration includes cgroup-v2 memory/pids/CPU scheduling, built-in virtio
PCI and the prepared ext4/9p/block module dependencies. These are static checks,
not proof that devices mount, the guest boots or tests pass.

## Historical findings and required corrections

1. The original snapshot verifier checks listed entries but accepts extra files
   and follows a replaced regular entry through an escaping symlink when target
   bytes match. An independent isolated probe of the actual extracted function
   demonstrates both acceptances. Exact entry/type/link-containment verification
   is required before relying on a frozen-snapshot claim.
2. The prepared Alpine GCC injects `_FORTIFY_SOURCE` and rejects the unchanged
   explicit `-D_FORTIFY_SOURCE=3` under `-Werror`. A reviewed preceding undefinition
   can preserve the actual requested hardening rather than relaxing warnings.
3. The guest lacks `/usr/include/linux/magic.h`, required by the production launcher.
   A host-side syntax check with the actual guest sysroot confirms the missing
   Linux header; the guest's libc `errno.h` does exist. Signed Linux headers are a
   concrete compilation prerequisite.

Root separately identified missing `/usr/bin/flock`, bash and systemd-analyze.
The fixed production flock path and launcher compile prerequisites must be
corrected before a meaningful native run. If the complete original node-pools
set retains unavailable systemd prerequisites, its failures must remain visible;
no cases may be removed, skipped or counted as passed to create a green result.

Evidence is in `../../evidence/isolated-native-vm-independent-20260921/`.
`snapshot-verifier-before.json` preserves the actual-function counterexample;
`compiler-before.txt` preserves the concrete compiler failures. The reviewer has
not installed host packages, booted QEMU or run pressure workloads. Cached debugfs
is unavailable, so no direct ext4 guest-file extraction is claimed; the prepared
root's guest-init copy matches the reviewed script. The following final checks resolve preparation blockers without claiming guest
execution.


## Final correction checks and scope

The rewritten actual verifier passes six independent isolated cases: unchanged
snapshot accepted; extra file, extra directory, missing file, changed bytes and a
regular file replaced by an escaping symlink rejected. Corrected guest headers
and `-U_FORTIFY_SOURCE` immediately before the original `-D_FORTIFY_SOURCE=3`
pass an independent cached-GCC syntax check; the author's full hardened link
command also exits 0. Actual guest `/usr/bin/flock --version` returns util-linux
2.42.3. The rebuilt package inventory includes the signed header/flock/bash additions.

Independently matched 38 small artifact hashes to the final manifest and 78
relevant native Core/contract/test/package source identities to current originals.
The embedded compressed-initrd init exactly matches its reviewed script. The
large disk was verified by the author's actual verification-only preflight,
exit 0 with `vmBooted:false`; this reviewer does not claim a separate whole-disk
read. Final disk SHA-256 is
`6bac358fd6d0c496219d99b6a88ecedfb5e53abefa0e221189ce379f725a2cc0`;
snapshot-manifest SHA-256 is
`38f9e278cc33b49dcc0668d43c5019be36601879df07e81ad44b0b7039c11d67`.
`final-binding.json` and `snapshot-verifier-corrected.json` bind these checks.

No remaining preparation defect blocks the fixed bounded attempt. Resource,
network, read-only export and watchdog bounds are unchanged. Systemd-analyze is
still unavailable: its original node-pools case must execute and fail honestly,
and aggregate success must remain false if it fails. A native-module pass would
be real guest-kernel evidence only. Neither this review nor preparation establishes
a VM boot, native test pass, physical-host acceptance or broader goal completion.
The coordinator alone performs the reviewed launch and retains its raw outcome.


## First execution: missed identity prerequisite

The coordinator's subsequent run booted the real guest and reached the original
native tests, proving the preceding guest compiler/typecheck commands completed
under the script's `set -e` ordering. The native summary is **1 passed / 11 failed**.
All eleven failed cases reject `isolated-qemu-native-vm` with
`WORKER_NATIVE_NODE_IDENTITY_INVALID`: the unchanged production reader accepts
only a 32-character lowercase hexadecimal identity or UUID. This is a preparation
format mismatch that this independent review missed, not evidence of successful
ownership/topology/pressure behavior. The prior preparation acceptance did not
establish readiness of that input and is superseded on that point.

The single passing original case demonstrates actual parallel guest scopes,
independent CPU accounting and final counters after drain. It does not cover the
failed helper pressure, durable ownership or recovery cases. The completed run and original node-pools outcome are recorded below from
the coordinator’s exact raw console/results. Any corrected fixture must preserve this failure, provide
an actual guest-generated identity accepted by the unchanged reader, and retain
the original budgets/deadlines/cases; no production validator weakening follows.


## Completed run 1: failed, with limited real-kernel evidence

The wrapper exited 1 after 464.51 seconds. QEMU powered off normally (exit 0),
no watchdog fired, and both original test commands returned 1; guest final marker
is `VM_REVIEW_EXIT=1`. The wrapper correctly records `passed:false`. Source
verification completed and initial/final mutable disk identities are retained.

| Original test set | Passed | Failed | Cancelled | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Native scope/topology, 12 cases | 1 | 11 | 0 | 0 |
| Node pools, 35 cases | 30 | 1 | 4 | 0 |

The native failures all stop at the fixture's invalid node identity. The node-pools
failure is the previously declared missing real `systemd-analyze` executable.
Four cases are cancelled at their unchanged test timeouts: journal accepted/sealed
SIGKILL and live contention at 20 seconds, ownership supervisor SIGKILL at
15 seconds. Their causal performance diagnosis is not established by the summary;
they remain failed acceptance evidence, not benign passes or proven product defects.
No timeout was extended and no case was skipped.

`run1-vm-console.txt`, `run1-vm-result.json` and
`run1-independent-result.json` preserve exact raw bytes, hashes and parsed counts.
The preparation identity-format omission is explicitly this review's missed check.
Any new attempt requires separate fixture identity/hash binding; this run must
remain visible. The bounded isolation observation and single real scope case do
not close native ownership/topology/pressure, full node-pools or the broader goal.
