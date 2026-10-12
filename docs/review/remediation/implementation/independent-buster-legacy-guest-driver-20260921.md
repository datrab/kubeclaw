# Independent legacy-seal guest-driver review — in progress

This is source review of `tests/fixtures/test-gate/legacy-seal-guest.py`, not
kernel execution or acceptance. The driver author did not perform this review.
All original LIS1–LIS10 cases and the fixed guest envelope remain required.

## Findings before any guest execution

1. **Descendant lifetime is not bounded by leader lifetime.** The initial
   `bounded()` implementation kills its private process group only when the
   immediate process still runs. If that process exits while a descendant holds
   an output pipe, the watchdog can expire without terminating the descendant.
   Nested commands also kill only their immediate child. Continuing to fixture
   cleanup or another case with an unproved surviving writer invalidates the
   test isolation. Correction must establish complete case-descendant termination
   before cleanup/continuation, including leader-exits-first and inherited-pipe
   cases. Sending a signal alone is not a positive termination observation.
2. **Sequential mount namespaces can reuse identifiers.** The namespace-stable
   case initially creates and destroys the two namespaces sequentially, then
   requires different mount IDs. Keep both actual namespace views alive until
   their observations are collected, so the test establishes two distinct live
   mount identities rather than depending on allocator behavior after teardown.

## Correction review, still before execution

The driver now creates a real per-case PID namespace with util-linux `unshare`,
mounts matching procfs, binds the namespace init through its outer PID and pidfd,
and requires positive pidfd termination before ordinary cleanup. Infrastructure
exceptions abort before cleanup/continuation and report remaining unexecuted
cases. Both mount-namespace workers remain alive through the identity comparison.
These are source corrections, not kernel acceptance.

Two follow-up prerequisites were identified. Without a startup acknowledgment,
a fast case could exit before the parent binds the announced namespace init;
add a bounded handshake before any fixture action. Also bind the actual mount
tool's supported flags: the existing guest payload offers BusyBox mount, whose
help documents `-o rprivate`, while the initial driver used `--make-rprivate`.
Do not infer util-linux mount availability from the separate unshare binary.

A read-only invocation of the existing private util-linux unshare binary confirms
help support for `--pid`, `--fork`, `--mount-proc` and `--kill-child`. Its SHA-256
is `3d8bcc1445d8812324bab1b4119112470ef4f40d2077490262c02df6ad8c4b05`.
This neither ran namespace operations nor completed source/artifact binding for
the new guest.

The subsequent source correction adds a bounded startup acknowledgment: PID1
waits before fixture creation until the parent has bound its pidfd. Mount
propagation now uses the documented `mount -o rprivate /` form. An actual
unprivileged [leader-exits-first probe](../../evidence/buster-legacy-guest-driver-independent-20260921/leader-exit-pipe.json)
forked a descendant that retained the output pipes, observed the expected
watchdog and then confirmed the descendant absent from procfs. The exact driver
hash was unchanged across that probe. This proves the corrected process-group
timeout case only; it does not execute PID namespaces, capabilities, mounts or
the immutable-tree verifier. Full guest results remain pending.
No finding authorizes a host mount, privileged host test or relaxation of
watchdogs. The final review must cover every case, positive control, source
binding, syscall audit and output budget.
