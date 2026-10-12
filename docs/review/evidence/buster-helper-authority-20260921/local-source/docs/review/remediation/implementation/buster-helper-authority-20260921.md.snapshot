# Buster privileged sandbox identity boundary

Status: implementation and local policy tests completed; real file-capability,
image and fresh independent acceptance remain pending, 2026-09-21. This
prerequisite protects the native preparation parent/source leases. No image
build, deployment or native pass is claimed. Before-source snapshots are in
`../../evidence/buster-helper-authority-20260921/before-identities.json`.

The image installs `/opt/kubeclaw-trusted/plugin-sandbox` root:builder 0750 with
file capabilities SETUID/SETGID. The generic argument parser accepts arbitrary
UID/GID values (including zero). Its single productive privileged caller is the
UID/GID 1000 Buster service's browser Playwright capability, which requests exactly
UID 1001/GID 1000. The latter group is intentionally 1000, not suite group 1001.
Direct-command/provider paths use the separate unprivileged `/app` helper and
retain generic behavior. The page-size query is used by sandbox memory setup.
`newuidmap`/`newgidmap` are separate distribution tools governed by the image's
builder subordinate-ID mappings. This patch validates all inherited mappings,
normalizes the existing node/builder UID 1000 aliases and permits the original
builder range 100000:65536 only. Overlapping ranges and delegation of identities
0 through 1003 fail the image build before either mapping file is written.

The Buster image now compiles a separate helper with a fixed build-time identity
policy: real/effective/saved caller UID/GID 1000 and explicit single target pair
1001/1000. No environment variable, policy path or numeric compiler argument
selects those identities. Reject root/preparation1003/other targets, absent,
partial and repeated identity flags before cgroup writes or identity-changing
syscalls. Preserve the authorized page-size query. Explicitly clear retained
capabilities after entering the target identity and set no-new-privileges before
executing the target. The generic unprivileged helper remains separately built.

All code and dependencies used by the new root parent must be root-owned and
nonwritable to builder, including `/app` and its ancestors/symlink targets.
Runtime generated configuration must also be root-owned and group-readable only;
builder writable caches, job workspaces and existing result storage stay separate.
This image ownership change is necessary: protecting only the privileged helper
would still let the service replace code imported by the root Node parent.

| ID | Required evidence |
| --- | --- |
| HA1 | Inventory the actual privileged caller/target pair and preserve the browser invocation/page-size behavior; direct-command's generic helper is unchanged. |
| HA2 | Actual compiled restricted helper rejects caller/target root, preparation UID 1003, other identities, missing/partial/repeated flags before cgroup/kill-file/credential effects. Rejection is not inferred only from a missing capability. |
| HA3 | Real-capability positive execution proves target UID 1001/GID 1000, cleared supplementary groups and no effective/permitted/inheritable/ambient capabilities; original isolation behavior remains. Missing host authority is recorded honestly. |
| HA4 | Actual UID 1000 write/replacement probes against root code/config, private/published source gate and target UID 1003 escalation fail. Test the file-cap helper route as well as direct writes; before-policy mutant is detected. No image-build claim from source checks. |
| HA5 | Original sandbox/browser/cutover cases, canonical C warnings, relevant script checks and fresh independent review pass; no rule suppression or skipped original assertions. |
| HA-DOC | Document fixed image identities, compilation/install distinction, root import/volume boundaries and real-kernel/image evidence limits. Native preparation remains unaccepted until its end-to-end path is proved. |

## Implemented ancestry and lock boundary

The entrypoint rejects the retired `BUSTER_PLAN_CONFIG_ROOT` override and uses
`/run/kubeclaw-buster/config`. Its helper verifies every ancestor, existing file
identity, link count and permissions without adopting a builder-owned directory.
Runtime configuration and BuildKit configuration stay root-owned, with group
1000 read access. BuildKit's root-opened log also lives in this namespace; the
old builder-owned HOME path and predictable `/tmp/buildkitd.log` are removed.
Root-owned image code under `/app` replaces the previous builder ownership.
These are source/image instructions, not proof of a built image or of future
volume overlays. Actual overlay/import ancestry remains part of BP acceptance.

The root shell holds a private lifetime flock on the root-owned lock file.
BuildKit and both service launch branches close descriptor 9 before executing
untrusted code. Merely protecting the pathname was insufficient: an inherited
open file description lets a child unlock its parent's flock. The original root
reproduction remains in `../../evidence/buster-parent-lock-inheritance-20260921/`.
The maintained regression uses the actual two launch redirections, proves child
unlock failure and a still-blocked independent contender, then proves the
inherited-descriptor negative control releases that same parent lock.

## Executed local evidence and remaining gates

Run `node scripts/tests/run-buster-helper-authority.mjs` with a C compiler and
Python available. It builds both helpers from current source in a fresh private
temporary directory, runs the three original policy tests, runs the actual flock
check and detects the fresh generic-helper negative control. It does not rely on
an existing ignored-cache executable. The local environment lacked a host C
compiler; the recorded run used cached GCC through proot and static linking.
That compiler setup supplies no simulated identity or capability proof: the
resulting binaries execute directly as actual UID/GID 1000. The compiled policy
rejects absent, partial, repeated and foreign target pairs before writable
cgroup sentinels change. The page-size query succeeds. See
`../../evidence/buster-helper-authority-20260921/reproducible-local-tests.txt`.
Canonical lint for the helper scripts/tests and shell syntax pass locally.

The separate `scripts/tests/buster-helper-authority-root.test.mjs` is a mandatory
**unexecuted guest gate** at this checkpoint. It needs root and a freshly built,
root-owned restricted helper installed root:1000 mode 0750 with real SETUID/SETGID
file capabilities. It checks allowed identity, supplementary groups, all four
capability sets and no-new-privileges, reachable denied callers, separate ACL
rejection and fixed-config replacement/symlink attacks. Its representative
root-owned module fixture does not prove actual `/app` image contents. Full image
ancestry, source-gate publication/quiescence and service workspace compatibility
still require BP integration and independent evidence. HA3/HA4/HA5 and HA-DOC are
not fully accepted from the local checks; no B1 or IFR-16 closure follows.
