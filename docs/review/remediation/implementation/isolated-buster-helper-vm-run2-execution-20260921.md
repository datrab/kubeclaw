# Corrected Buster helper guest execution — run 2

The exact independently reviewed run-2 proposal completed successfully: seven
original cases passed, zero failed/cancelled/skipped. Service tests passed 3/3
and root-driven tests 4/4. Compilation and actual guest file-capability setup
succeeded. The wrapper exited zero after its source verification and final disk
hash; QEMU exited zero after 68.109 seconds with no watchdog stop.

Root session: `91300`; QEMU PID: `103191`. Raw console, terminal result and command
outcome are preserved under
`docs/review/evidence/isolated-buster-helper-vm-run2-execution-20260921/`.
Three earlier coordinator launch attempts refused the unchanged initial memory
guard before boot. Those refusals remain in the proposal evidence. A subsequent
attempt after quiescence passed the same guard; no threshold, test deadline or
production byte was changed to obtain this result.

The fixed test observes actual UID/GID1003, empty supplementary groups and zero
inheritable/permitted/effective/ambient capabilities before requiring EACCES.
The allowed browser helper actually runs as UID1001/GID1000, with no supplementary
groups, all four capability masks zero and NoNewPrivs set. Existing checks also
prove service denial of private preparation data, the old generic file-cap
helper's ability to violate that boundary, rejection before cgroup sentinel
writes, root configuration/code protection and unprivileged generic execution.

Initial disk SHA256:
`8b6ca26245f8cd5596f45058627b18d612c028ddf4ea526d8532e5b9cf10f909`.
Final mutable disk SHA256:
`37472c77c56d9bd4a66306fcb9ec7ab1aeb209ed80404e785b1eb2ea07b7bd15`.
Snapshot manifest SHA256:
`7d75b0ba49eb18744bd63d2f741c60d65329f73251f38f4c5716780c25d0aaad`.

The failed original 6/7 run and diagnostic run remain unchanged. This run uses
that frozen source plus exactly the two reviewed test-fixture changes; it does
not include later UID1004/two-phase preparation work or establish a built image,
full Buster integration, physical quotas or complete finding closure. Independent
execution review accepted this bounded result, including sixteen frozen source/
test/proof identities; see the separately maintained
[review](independent-buster-helper-vm-run2-20260921.md).
