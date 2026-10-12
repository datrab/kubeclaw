# Isolated native VM execution — run 3

Status: terminal. The original native kernel gate passed **12/12** with no
failures, cancellations or skips. The complete run remains failed because
node-pools passed 34/39, with one failure and four cancellations (zero skips).
QEMU exited 0 normally; wrapper session 97452 returned failure after 526.87
seconds with no watchdog stop. Identity, compilation and native typecheck phases
passed. Run-1 and run-2 failed checkpoints remain preserved.

| Gate | Tests | Passed | Failed | Cancelled | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original native scope/topology | 12 | 12 | 0 | 0 | 0 |
| Original node pools plus new policy cases | 39 | 34 | 1 | 4 | 0 |

The unchanged original production-launcher/whole-host/replay case now passes
(19,396 ms), whereas run 2 failed at the strict scope-limit boundary. The
reviewed two-field projection resolves that concrete regression with the strict
decoder retained. Actual guest cases include aggregate CPU accounting, memory
and task pressure, scope/inode authority, recovery and descendant drainage.
The four added policy cases also pass, explicitly using actual child processes
with modeled ownership rather than claiming additional kernel accounting proof.

The node-pools failure remains missing `systemd-analyze`. Accepted-writer
SIGKILL, sealed-writer SIGKILL and busy-live-attempt cases retain their original
20-second deadline cancellations; the supervisor-lock/SIGKILL case retains its
15-second cancellation. No test, assertion or deadline was weakened. These
non-passes prevent node-pools/full-run acceptance.

[Raw console](../../evidence/isolated-native-vm-run3-execution-20260921/vm-console.txt),
[wrapper result](../../evidence/isolated-native-vm-run3-execution-20260921/vm-result.json)
and prepared bindings retain the exact result. The
[run-3 proposal](isolated-native-vm-run3-proposal-20260921.md) binds an independent
source copy with exactly four reviewed changes. Original twelve kernel cases
and original 35 node-pools cases remain byte-identical; new policy cases add four.
Exact source entry-set/type/hash verification passed before and after execution.
This tests the prepared snapshot, with excluded current Buster/shared config and
other differences explicitly listed, not the whole current workspace.

Initial disk SHA-256:
`707ed827cecc3124b7af44ef069389b982859892ed25ccf3066f5ea2111a6d9e`;
final mutable disk SHA-256:
`9a74a2f42ce6654799904336518f52c157e3e93386ef41649021c6d986be43dc`.
The run-3 disk is retained separately. This establishes bounded guest-kernel
functional proof and the corrected original consumer, not physical-host
performance/scheduling, production deployment or full IFR16 acceptance.
