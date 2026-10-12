# Blueprint sync plugin

Synchronizes an explicit set of control files from a validated architecture
Git ref, commits only changed files, persists an append-only outcome, and
writes an immutable summary artifact. Missing declared files request
remediation. Fetch/push and distributed recovery remain separately blocked;
this package never shells out or manipulates Git directly.

When a visible architecture report/approval is present, sync requires its bound
source subject, reads the original report/approval through `artifacts.read`, and
checks repository, architecture ref and allowed control paths. The Git adapter
rechecks current source and consumes the pinned architecture commit. The resulting
artifact binds the original subject to the actual sync commit for downstream Forge.
Grant reads for `kubeclaw.architecture-validator`, `kubeclaw.human-approval`,
`kubeclaw.blueprint-sync` and `kubeclaw.implementation-agent` as applicable to the
graph. An unbound report is not execution authority.
