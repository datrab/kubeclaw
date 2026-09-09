# Attempt owner: prerequisite launcher admission ordering

Read-only design review on the `wave47-resources` source based on `a8cf34f`,
with resource-measurement fix `9348a49`. No new isolation implementation or
production activation is included. Full engine-host work is deferred until the
native admission boundary is verified.

## Exact latent composition defect

`skills/common/plugin-runtime/foundation/isolation/sandbox.c` processes
`--child-cgroup` in `main` by retaining the path and opening `cgroup.kill`.
It then applies optional `setgroups`/`setresgid`/`setresuid`, optional
`restrict_filesystem`, optional network restriction, and `install_filter`.
Only afterward does `supervise` fork the workload. In the forked child,
`join_cgroup(child_cgroup)` opens `<group>/cgroup.procs` and writes its own PID.

Consequently the cgroup admission runs with the child's inherited restrictions
and credentials. A Landlock whitelist excluding cgroupfs denies that new file
open; a dropped identity is not automatically authorized to migrate the process.
The combination is accepted by the CLI syntax but cannot simply be used for a
new confined engine host. Giving the engine cgroupfs access or migration rights
would be an unsafe workaround.

**This is a latent composition defect and integration blocker, not a proven
production outage.** The existing Foundation `isolation/runner.ts` uses
`--child-cgroup` without credential drop or Landlock path options. The current
Playwright capability uses `--cgroup`, which joins the supervisor before dropping
credentials and applying Landlock. `tests/fixtures/isolation-parent.mjs` likewise
uses `--cgroup` for its credential-drop case and `--child-cgroup` otherwise.
None of those callers proves the problematic combined path works.

## Smallest coherent admission change to implement later

1. Parse/validate the full launch policy before forking. Keep `--cgroup` and
   `--child-cgroup` explicitly distinct; reject ambiguous combined modes.
2. Keep the trusted supervisor outside the workload cgroup and authorized to
   admit its child. Fork a child blocked on a close-on-exec private handshake.
   The parent uses its own `fork` return PID; the child cannot nominate another
   PID or scope. No engine instruction or input executes before admission.
3. The supervisor writes that PID to the verified owned cgroup and confirms
   admission. Only then release the child to drop supplementary groups and
   real/effective/saved UID/GID, install its filesystem/network/seccomp policy,
   and execute. Admission failure, unexpected EOF, cancellation or timeout must
   kill/reap the blocked child and fail closed.
4. Restriction/exec failures return a bounded setup error through the private
   channel. All migration, kill, directory and handshake descriptors must be
   closed in the workload before `exec`; CLOEXEC is a second guard, not the only
   descriptor-ownership rule. The engine receives no cgroup migration authority.
5. Preserve and re-arm parent-death behavior after credential changes. Both
   pre-admission and post-admission host/supervisor death races need native
   coverage. The supervisor retains bounded whole-group kill and descendant
   reaping. Existing callers keep their effective restrictions and resource
   limits; this is not permission to widen mounts, UIDs, network or allowlists.

The handshake must be a native admission barrier. A Node callback after `spawn`,
moving an already-running shared parent, an inherited writable migration FD,
or sleeping before launch would not establish this boundary.

## Owner interface and following complete slice

The reusable primitive is the existing real `IsolationCgroup` plus the native
supervisor. `IsolationCgroup.close()` currently kills, waits for `populated 0`,
reads memory events/peak and removes the group. An attempt owner needs a caller
deadline and an immutable CPU/memory/process observation before disposal, with
an explicit quiescence acknowledgement. Missing/decreasing observations must
remain failures; cgroup CPU rate controls are not cumulative CPU-time limits,
and task counters must not silently be called process counts.

After this prerequisite, the smallest complete engine path is deterministic
Prism: input hydration, engine/browser work, evidence preparation/uploads and
full-log work in one admitted engine process, driven by the same generic Core.
The authenticated service stays outside as bounded transport/claim authority.
Control, receipt validation, image contents and readiness must be wired together;
an unconnected owner helper would not repair the worker.

Buster must use that same owner and place provider dispatch, actual capability
implementations and report preparation/adaptation inside its attempt host.
Attaching only provider/browser children while capability JavaScript remains in
the shared runner is incomplete. Retained fixtures need explicit durable
cleanup ownership: an external demo's lifetime is distinct from the local
provider process lifetime. Restart cleanup cannot be authorized by a terminal
job record alone.

## Native acceptance boundary

The current host has read-only cgroup2 and lacks the original launcher's required
`/proc/<pid>/task/<pid>/children` view; the original isolation-kernel gate is
blocked. Its raw prerequisite output is retained in
`docs/review/evidence/worker-resource-native-gates.txt`. Compiling the existing C
source succeeds, but does not validate admission or reaping. No writable fake
cgroup, substitute launcher, elevated credential or host mount was introduced.

Before activating the new path, the actual compiled launcher must pass on a
real delegated cgroup: combined child-cgroup plus Landlock without cgroupfs
access; optional credential drop; inability of the running workload to migrate
or use owner FDs; admission failure before any marker/write; cancellation and
host/supervisor death at every handshake boundary; TERM-resistant and escaped
descendant reaping; exact empty-scope acknowledgement; preserved legacy caller
behavior. These native tests are not executable to completion here. The design
is secured as documentation only; no new isolation source is shipped unverified.
