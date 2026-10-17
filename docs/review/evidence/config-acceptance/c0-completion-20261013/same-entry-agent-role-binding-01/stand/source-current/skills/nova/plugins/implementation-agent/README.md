# Implementation agent protocol

Owns the deterministic Forge implementation-attempt envelope, strict
completion parser, identity and contradiction checks, canonical result
reduction, and immutable completion evidence.

The package never accepts a returned stage result as authority. A completion
must match the requested run, module, and attempt. `ready_for_testing` requires
changed paths and successful checks; `blocked` requires a non-empty
explanation.

The live test proves the bounded protocol through the real v2 runner,
runtime-dispatch, confidential HTTP authentication, and artifact store without
spawning an agent. Full Forge parity still requires repository-diff
verification, session monitoring, transcript and handoff evidence, rate-limit
recovery, termination, and restart recovery.

Workspace execution uses an attempt-owned Git reference through runtime dispatch,
commit, merge and cleanup. Each attempt derives a separate deterministic path and
branch, so a retained cleanup failure cannot block repair by occupying the prior
name. The cleanup artifact retains ownership and the confirmed merge revision.
OpenClaw targets must configure the same protected `workspaceRoot` as Git and the
compiler; the gateway must see those filesystem paths.

For graphs with architecture report/approval ancestors, Forge reads the bound
subject and authorized source transitions from their original ArtifactRefs.
Configure `artifacts.read` namespaces for `kubeclaw.architecture-validator`,
`kubeclaw.human-approval`, `kubeclaw.blueprint-sync` and
`kubeclaw.implementation-agent` in addition to repair evidence. Worktree creation
uses the pinned source revision and verifies the reviewed architecture/plan bytes.
Merge admission rejects unexpected source changes and changed reviewed plan bytes;
its parent commit is verified before the result can extend the authorized lineage.
Source-less implementation graphs retain their existing behavior.
