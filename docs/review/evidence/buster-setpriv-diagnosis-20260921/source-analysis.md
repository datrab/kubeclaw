# setpriv permission-boundary diagnosis

Status: source-supported hypothesis; not yet an observed guest cause.
The first HA guest run remains failed, with the allowed identity/capability
positive assertions unexecuted after its ACL assertion failed.

The version-matched [upstream setpriv implementation](https://raw.githubusercontent.com/util-linux/util-linux/v2.42.3/sys-utils/setpriv.c)
sets KEEPCAPS and reapplies cached capability state after changing UIDs
(lines 1054–1068), before its final execvp. This supports checking whether the
root-started fixture retains effective DAC authority at the executable permission
check. It does not alone prove the exact packaged binary's runtime state.

The private execvp observer prints at most 8191 bytes from its own proc status
immediately before calling the original execvp. It does not change IDs, groups,
capabilities, securebits or permissions. Diagnostic failures stop that invocation;
no failed observation is counted as a permission pass. Build and execute it only
inside the disposable guest, with LD_PRELOAD scoped to the measured setpriv call.
Compare instrumented and uninstrumented original commands and an ordinary
capability-free caller. Preserve mode/owner/group, actual pre-exec credential
fields and helper stderr/exit status. Do not change the failed assertion merely
to match the observed policy rejection.
