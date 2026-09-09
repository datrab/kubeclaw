# WP05 — attempt-owned Forge workspaces and bounded Git contention

Scope: PCR-IMPLEMENTATION-001, PATH-T07-001 and T06-F01. Existing committed
Git/repository path and process fixes remain prerequisites. No compiler policy,
review decision, registration, deployment or CI change is included.

## Changes and ownership

The Git workspace adapter now issues `runtime-workspace.v1` after native
`git worktree add` succeeds. The reference binds canonical repository and
workspace roots, path, branch, initial source revision and the complete core
attempt identity. The SDK contains only its JSON contract and deterministic
identity helpers; filesystem authority remains in the owning adapters.

Git atomically publishes and fsyncs an owner record beneath its configured
workspace root, outside the worker worktree. OpenClaw dispatch requires an
explicit configured `workspaceRoot`, matches the request's trusted attempt,
checks canonical roots and the existing worktree, and verifies the protected
owner record before passing its path as the actual `sessions_spawn.cwd`.
Caller-provided arbitrary `cwd` is not accepted. Commit, merge and cleanup
carry and verify that same reference; merge checks the repository and branch.
Git also creates missing compiler-generated parent directories one component at
a time beneath the canonical workspace root, rejecting symlink/noncanonical
parents. The integration fixture performs no parent-directory provisioning.
Existing generic Git callers without the optional reference retain their
existing configured-root capability boundary.

The owner record is a current ownership pointer, not a new event journal.
A generic caller may recreate a successfully removed fixed path; only a new
successful native worktree creation replaces that path's pointer. Old
references then fail verification. The normal implementation stage never
reuses the previous generation, and immutable cleanup artifacts retain its
reference and confirmed integrated source revision. Owner records are not
automatically deleted. Trusted roots and their ancestors must remain protected;
these checks do not sandbox a process with permission to rewrite them.

Implementation workspace paths and branches append a full SHA-256 generation
bound to repository, compiler project branch and complete attempt identity.
The same attempt is deterministic; another project, repository, run or attempt
has a separate namespace. A repair therefore leaves a locked old worktree or
residual branch intact, creates a new generation from confirmed current HEAD,
and retains the old cleanup failure as evidence. A failed or uncertain effect
is not blindly repeated or declared successful.

The runtime requests the result inside the validated worktree, reads it with
bounded, fatal-UTF-8, descriptor-pinned no-follow checks, and preserves the
established immutable repository result file before cleanup. Existing collector
and terminal-output fallbacks remain available. No new central result store,
log deletion or result-retention policy is introduced.

Core resource acquisition now waits for original lock-manager contention only
before effect request/acceptance. The wait is cancellable and bounded by the
smaller of the lock lease duration and 30 seconds. Other acquisition failures
propagate. The existing fencing, renewal, locked journal recheck, accepted-effect
recovery and release paths remain authoritative. Neither accepted mutations nor
Git conflicts are retried. The existing lock manager's synchronous metadata
mutex remains unchanged; the new polling wait does not make that separate
critical section asynchronous.

## Evidence

`tests/verification/reliability/forge-workspace.test.mts` uses actual project
compiler inputs, core runner and file journals/locks, original Git, lint,
OpenClaw, network, secret and artifact adapters, and a controlled local HTTP
endpoint. The endpoint executes a real native file writer in the received
spawn cwd and writes an atomic completion file. It is a transport integration
fixture, not a real OpenClaw model or deployed Forge execution claim.

Two independent compiler-derived implementation stages are selected into a
concurrent test graph. Both integrate only their own files and preserve their
repository result records through cleanup. The compiler's existing default
serialization policy is not changed. Real `git worktree lock` and a real branch
ref lock separately cause post-merge cleanup failures. Original native ESLint
then finds one error, core requests repair, a distinct generation starts from
H1, and a second original native lint attempt reports zero errors at H2. The
old worktree/branch and owner-bearing cleanup artifact remain inspectable.
This proves invalidated lint re-execution, not a complete review/test delivery.

Authority negatives include different run and attempt owners, a different
configured root, and a forged source revision. Root and source negatives use
a still-existing locked worktree and a passing positive control; they cannot
pass merely because cleanup deleted the target. A separate deterministic
identity case covers project branch, repository, run and attempt changes.

`forge-lock-wait.test.mts` uses the original Git adapter and two original
FileResourceLockManager instances. Release permits one native create;
cancellation and bounded timeout create no worktree and write no requested or
accepted effect. Concurrent real conflicting merges each execute once, leave
one failed receipt and preserve the unresolved Git index.

Before/after control: with exact pre-change source from commit
`816645732c6246ff2bc48356341dd02512d99544` for core durable invocation and
implementation stage/protocol supplied by a read-only Node source-load hook,
all seven integration/lock cases fail: immediate `RESOURCE_LOCKED`, or the
HTTP server observing the static repository cwd. No adapter, Git executable,
lock manager or HTTP implementation was replaced. Current source passes those
seven cases, plus the additional deterministic namespace case. These original
transport failures precede the repair-specific assertions; they are not claimed
as an isolated pre-change reproduction of the cleanup failure.

Existing implementation-agent, Git-workspace, runtime-dispatch (including its
300-iteration result-path race gate), SDK JSON tests and four effect-lock
lifetime regressions pass. The affected package builds, Nova typecheck and
canonical lint for changed source/tests pass. No new suppression or lint-policy
exception was introduced. Two already-unused runtime lint directives were
removed; its existing identity parser exception is retained.

## Operational boundary

Configure OpenClaw `workspaceRoot` to the same canonical protected root as
Git-workspace and the compiler. Dynamic workspace dispatch without this explicit
configuration fails closed. The gateway must share the declared filesystem
paths; this batch does not provision mounts, deploy configuration, or establish
remote-agent sandbox authority. Existing static dispatch without a workspace
reference continues to use its configured cwd. Real OpenClaw agent execution,
full delivery and production concurrency remain separate operational evidence.
