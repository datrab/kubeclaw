# C0 lifetime contract correction — open pending independent acceptance

2026-10-14: structured non-author review found a material defect in the prior
same-OFD parent/unprivileged-child fd9 delivery contract. An inherited child can
call `flock(9, LOCK_UN)` and remove the parent's exclusion lock while the parent
still holds its descriptor. Actual Linux OFD behavior was reproduced locally
under the actual execution UID0; this is not UID/GID1000 execution acceptance.

The corrected delivery retains the real lock-owning OFD exclusively in trusted
root processes: shell, native parent and a narrow privileged lifetime guardian.
The service's fd9 is a same-inode **O_PATH witness**, not the owning description.
Duplicating or transferring that witness cannot unlock the owning OFD. The
service still validates its physical witness and exact retained-A fd3 startup
ACK before importing/activating its productive runtime.

The guardian retains the owning OFD until its actual service child is reaped.
Parent-death and explicit shutdown forward TERM/CONT; the original required
`runtime.shutdownTimeoutMs` bounds grace before KILL. Exclusion is released only
after actual `waitpid`, never from a sampled PID, timer expiry or child claim.
The guardian does not retain fd3. This is a service-lifetime privilege boundary
correction, not D18 execution-worker topology redesign.

Neither witness, guardian, fd9 availability nor metadata is archive/native
quiescence proof. Original-A archive, per-owner/pre-owner accounting, authentic
host/store joins, original cleanup, final actual kernel quiescence, and accounted
retirement before shell runtime/platform/config effects remain mandatory.

Local mechanism controls passed: O_PATH LOCK_UN returns EBADF; root guardian
retains the lock after the parent closes its copy; actual service reaping allows
last-holder release; parent SIGKILL plus a genuinely stopped TERM-ignoring service
causes bounded KILL and actual reaping. Emitted-role owner/witness distinction,
regular-fd witness denial, source archival, and reused fd3 framing pass 2/2.
Broad Buster typecheck passed. All these executions were UID0; actual UID1000,
writable native cgroup lifecycle, Docker and full independent acceptance are
still unavailable/unverified. No fake UID/GID or fake cgroup pass is introduced.

The corrective structured source review reported no actionable findings, but
dependency inspection was blocked by its UID-map sandbox failure. It is not a
whole-C0 reacceptance or C1 package acceptance. The material C0 finding remains
open until a genuine fresh review and all required native gates are evidenced.
Original 2409 fields, 6845 cases, 50 requirements and historical results remain
conserved; no requirement or case is waived or relabeled a new runtime pass.
