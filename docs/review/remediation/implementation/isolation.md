# WP03 — External plugin process boundary

Status: implementation ready for independent review. PCR-ISOLATION-001 and
PCR-ISOLATION-003 have local original-function/process regression evidence.
PCR-ISOLATION-002 and PCR-ISOLATION-004 remain **operationally blocked**: no
successful process-tree/cgroup-memory enforcement claim is made in this runtime.
No infrastructure, delegation, CI, deployment or allowlist was changed.

## Original behavior reproduced

The canonical launcher build succeeded using the original C source. This resolved
the missing binary prerequisite; it did not make the sandbox operational.
Direct original launcher execution exited 70: `open task children: No such file
or directory`. The unchanged isolation gate then crashed its Node host with
unhandled `write EPIPE`. The historical original child/session UTF-8 probe returned
four replacement codepoints for the valid emoji U+1F600.

```bash
npm run plugin-system:sandbox:build
skills/common/plugin-runtime/foundation/isolation/plugin-sandbox 268435456 2 64 /bin/true
node docs/review/evidence/isolation-utf8.mjs
node tests/verification/contracts/check-plugin-system-v2-isolation.mjs
```

The historical probe/report files remain unchanged. Their old-defect assertions
are not a post-fix acceptance suite.

## Ownership and changes

Session owns stdin/stdout/stderr handlers before any write, converts pipe failure
into its one terminal outcome and blocks response writes after termination.
RPC rejection paths are observed. Unawaited host RPCs cannot be followed by a
successful plugin result; at most 64 requests can be outstanding. Already started
host capabilities retain caller/lease-owned effect semantics; session does not
claim their external actions were cancelled. Termination starts with supervisor
TERM, then invokes the host's group kill after a one-second grace before hard
supervisor termination. A second closure deadline returns an explicit cleanup
error. Normal completion waits for child close and cgroup cleanup.

Protocol framing retains bytes through complete newline-delimited messages.
Fatal UTF-8 decoding rejects malformed bytes; valid codepoints split across
chunks remain exact. Limits are measured on bytes before decoding. Existing
256-KiB line, 1-MiB buffer/input and 64-KiB stderr ceilings remain explicit.
No replacement launcher or parser mock is used by the protocol regressions.

The native supervisor installs a parent-death TERM contract before fork and
checks the parent race; after credential drops it reinstalls that kernel setting
because Linux clears it on effective UID/GID changes. The main child has its own parent-death KILL contract.
The new `--child-cgroup` mode joins the workload before exec while keeping the
supervisor outside the group. TERM grace is followed by workload cgroup.kill and
adopted-child reaping, including setsid descendants. Reaping now preserves the
main child's status even during grace. Existing Buster `--cgroup` mode is retained.
The native proc dependency remains mandatory rather than bypassed locally.

The host creates a real delegated cgroup-v2 child and writes/reads back exact
page-floored lease memory.max, zero memory.swap.max and memory.oom.group=1. It requires
cgroup.kill/events and memory.events/peak support, kills remaining workloads,
waits for an empty group and removes it. Kernel OOM evidence is surfaced with
memory.peak. Setup and cleanup errors preserve causes; V8 old-space and RLIMIT_AS
are supplementary limits, never substitutes for the lease ceiling.

Page-granularity correction: the [kernel cgroup-v2 interface documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files)
permits nonaligned writes to round up. The existing trusted native launcher now
offers a read-only sysconf(_SC_PAGESIZE) query, bounded to one second/128 bytes
by the host. A positive safe power of two is required. The lease is rounded down
before exact readback; the effective limit must remain at least 16 MiB and no
larger than the original lease. No hardcoded page size or new image utility is
required. The added real native-query test covers aligned and nonaligned byte
budgets and invalid arithmetic inputs. This is not a cgroup enforcement proof:
the delegated-kernel tests remain blocked as described below.

The small authorized platform seam is optional `isolation.cgroupRoot` through
config loading, activation and engine runtime. It is host-owned and included in
recovery fingerprinting. External execution fails closed without delegation;
builtin in-process execution retains its existing path. Foundation imports no
concrete worker/plugin implementation. Deployment prerequisites are documented
in config ownership and the security model.

## Passed verification

```bash
node --test tests/verification/reliability/isolation-session.test.mjs
node tests/verification/contracts/check-plugin-system-v2-resume.mjs
node tests/verification/contracts/check-plugin-system-v2-engine.mjs
npm run plugin-system:sandbox:build
node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json
npm run typecheck --prefix skills/nova
git diff --check
```

The reliability suite has **15 passed**. It uses the original child/session with
actual subprocess pipes: immediate child exit, exit during host RPC, unfinished
RPC/result ordering, all six internal splits of 2/3/4-byte Unicode in
capability/event/result messages, three invalid UTF-8 vectors, and direct-child
TERM-ignore timeout/reaping. Additional checks reject ordinary directories and
the cgroup mount root, require delegation, resolve host config paths and use the
real builtin engine to prove changed isolation policy rejects recovery while
unchanged policy resumes successfully.

Canonical ESLint passed on all changed TypeScript, new reliability/kernel tests
and their fixtures. The C launcher compiled successfully with the unchanged
hardened build command. No sanitizer/kernel guarantee is inferred from compilation.

## Blocked verification

```bash
node tests/verification/contracts/check-plugin-system-v2-isolation-kernel.mjs
```

Exit **2**, explicitly blocked: proc task-children files are absent and there is
no supplied delegated cgroup root or explicit UID/GID for the credential-drop proof. Inspection also confirmed cgroup2 mounted
read-only at /sys/fs/cgroup. No fake cgroup directory was accepted as enforcement.

On a provisioned host, supply the delegated root and nonzero target UID/GID arguments to that gate, from a host process able to drop credentials. Its
unexecuted matrix exercises buffer/heap allocation at 128/256 MiB and real native
TERM-ignoring setsid descendants across cancel, timeout and host SIGKILL, including the UID/GID-drop branch. The
buffer cases require actual kernel OOM/memory.peak evidence. Its presence is not
proof that those cases passed. Process disappearance and real peak memory remain
required before closing PCR-ISOLATION-002/004 operationally. The pre-existing
external-engine/isolation/phase11 gates accept the delegated root as an optional CLI argument and require the new host-owned policy to reach
external execution; no forced success or weakened trust policy was added.

Worker/Buster's separate output-decoding boundary, noted in the original review,
is outside this foundation-only implementation and must be verified by its
assigned execution owner.

Final integration: independent foundational review approved protocol/host handling; Root repeated all16 actual session/config/native-page tests and reviewed conservative page-floor plus exact readback. Kernel memory/tree proof remains blocked, so ISOLATION002/004 are not marked verified.
