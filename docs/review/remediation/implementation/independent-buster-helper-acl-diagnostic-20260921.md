# Independent review: Buster helper ACL diagnostic preparation

The frozen preparation is accepted for the coordinator's single disposable guest
run. This reviewer did not author the fixture or the execvp observer and did not
boot a VM. [Review evidence](../../evidence/buster-helper-acl-independent-20260921/checks.json)
binds the artifact manifest and 23 independently checked artifact hashes. The
8-GiB disk hash is supported by the author's successful verification-only run,
not a duplicate reviewer disk read. That run explicitly records no VM boot.

The new disk has a distinct inode; the readonly source export and its manifest
are exactly the failed HA run's export. Thus the production helper and all seven
original cases are unchanged. Guest copies of the driver, credential bridge and
canonical observer match their reviewed sources. Existing signed-package tool
provenance is retained; copied setpriv/capability tools match the previous guest
where present. The observer's guest-sysroot shared-library build succeeded.

The launch wrapper differs from the previously reviewed HA wrapper only in its
cache, evidence path and VM name. The 1-GiB guest RAM, two TCG CPUs, 64-MiB TCG
cache, process and memory limits, 120/900-second watchdogs, log bound, no network,
readonly source export and isolated writable disk remain unchanged. Preparation
and guest-only privilege operations do not authorize host privilege changes.

The observer captures bounded pre-exec status and forwards the original execvp
arguments without changing credentials. The diagnostic requires observed and
unobserved commands to agree after removing only the observer dump. It measures
actual UID/GID/groups and effective DAC override instead of treating upstream
source behavior as execution proof. The ordinary Node credential path separately
checks EACCES. The allowed browser identity/capability proof runs even when the
hypothesis fails. All original seven cases subsequently rerun unchanged, with
nonzero completion retained for their expected unresolved ACL assertion.

This accepts diagnostic preparation, not the DAC hypothesis, helper correctness
or full HA/Buster acceptance. The prior 6/7 failure remains unchanged. The actual
pre-exec capability evidence, independent allowed-target result and unchanged
suite outcome must be interpreted separately after execution; a failed
hypothesis cannot justify weakening the maintained test.

## Actual guest execution

The coordinator's run completed with QEMU exit 0 after 72.353 seconds and no
watchdog stop. The wrapper correctly reports `passed: false`: the unchanged
original seven-case suite still has six passes and its original ACL assertion
failure. Raw console, terminal result and parsed diagnostic calls are preserved
in the review evidence directory. Neither the original failed run nor this
expected failing suite is relabeled green.

The diagnostic itself returned zero and establishes the fixture's concrete
credential problem. Immediately before exec, the actual signed setpriv process
had real/effective/saved/filesystem UID and GID 1003, empty supplementary groups,
and effective capabilities `000001ffffffffff`, including `CAP_DAC_OVERRIDE`.
It could therefore pass the executable's discretionary permission check and
reach the restricted helper's caller denial (exit 77). Instrumented and original
invocations had identical outcomes after removing only the observer dump.
The ordinary Node credential bridge showed zero effective capabilities and the
same UID/GID; both that bridge and direct Node spawning received actual EACCES.
This supports correcting how the test constructs an unprivileged caller, rather
than broadening its expected denial to accept a different security boundary.

The separate allowed-target proof also passed in the actual guest: UID 1001,
GID 1000, no supplementary groups, zero inheritable/permitted/effective/ambient
capabilities and NoNewPrivs 1. The capability bounding set remains nonzero and
is not claimed cleared. This closes the previously unexecuted diagnostic positive
for the frozen helper; it does not establish a built container image or full
Buster preparation integration. Any maintained fixture correction still needs
its own exact source binding and fresh tests.

## Maintained ACL fixture correction review

The separately reviewed two-file correction replaces only the misconstructed
setpriv ACL caller with an ordinary Node child and an observed credential bridge.
It requires UID/GID 1003, empty supplementary groups, zero inheritable/permitted/
effective/ambient capabilities, and an actual EACCES spawn failure with no child
exit status or signal. All other original assertions and case membership remain
unchanged. The exact diff and corrected file identities are retained in the
review evidence. Independent canonical lint passed both files. This accepts the
correction for a separately bound guest rerun, not a test pass before execution;
no production helper code or host privileges were changed by this reviewer.
