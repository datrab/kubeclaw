# Unit Test Gate Operator Guide

Status: authoritative unit-test operator reference after Phase 10

## Read this first

The unit migration has two operating environments:

1. **Current migration validation** runs inside the contained Nova development
   pod. It uses real Git commits, HTTP, Nova and Buster runtimes, worker and
   provider processes, commands, JUnit files, LCOV files, evidence, and gate
   decisions. The only substituted host feature is delegated cgroup control,
   because the current pod mounts the host cgroup filesystem read-only.
2. **Final production authority** comes only after every suite has migrated and
   one execution path remains. That final cutover must run the same proof with
   a writable delegated cgroup v2 directory on the real runtime platform.

Phase 10 does not require an external Buster host or a production deployment.
Do not weaken the production configuration to make the current pod look like
that final environment. The test harness has an explicit sampled-accounting
fallback for the contained pod. Production configuration does not expose that
fallback and still fails closed without cgroup delegation.

## What 8-B gives the operator

8-B is the shared safe command launcher. It is not a list of unit tests.

The project says, for example, "run the approved program named `pytest`, pass
these exact arguments, and start in `backend`." The operator decides what
program the name `pytest` maps to and how much CPU, memory, output, and process
capacity any project may request.

```text
project specification                    operator configuration
---------------------                    ----------------------
executable: pytest         ----------->  pytest: /usr/local/bin/pytest
args: [...]                              maximum memory: 2 GiB
workingDirectory: backend                maximum tasks: 64
```

The project cannot name an arbitrary host path, start a shell, inherit Buster
secrets, enable network access, or raise the operator ceilings. The same
launcher can later serve another suite when that suite needs a normal contained
command. It does not replace specialist providers such as a container builder
or deployment fixture.

## Cgroups in plain language

A test program can create child programs and threads:

```text
npm
└── node
    ├── test worker 1
    ├── test worker 2
    └── test worker 3
```

Limiting only `npm` would be unsafe because its children consume resources too.
A Linux cgroup is a kernel-managed resource box around the complete tree. The
box applies one total memory limit, one total CPU budget, and one total limit
for processes and threads. Children cannot escape those totals by starting
more children.

The contained Nova pod cannot create this box because its cgroup mount is
read-only. Current migration tests therefore use the explicit test-only sampled
accounting path. They still use real processes and test process-group cleanup,
but they cannot prove the final kernel resource box. That one proof is deferred
to the final single-path production cutover.

## Operator responsibility

The operator controls which programs Buster can start and the maximum resources
that any project can request. Projects use stable catalog names. They cannot
provide arbitrary host paths.

## Required Buster configuration

This section defines the final production form. It is retained now so the
deployment contract is known before cutover. The contained Nova-pod test does
not load this production file; its integration harness constructs the same
runtime with `allowSampledProcessLimit: true` only in test code.

Enable `command.execute` and add `directCommand`:

```json
{
  "allowedCapabilities": ["command.execute"],
  "directCommand": {
    "executableCatalog": {
      "node": "/usr/bin/node",
      "pytest": "/usr/local/bin/pytest",
      "go": "/usr/local/go/bin/go"
    },
    "executableSearchPath": ["/usr/local/bin", "/usr/bin", "/bin"],
    "runtimeReadRoots": ["/usr/local/bin", "/usr/bin", "/lib", "/lib64", "/usr/lib"],
    "cgroupRoot": "/sys/fs/cgroup/kubeclaw",
    "maximumOutputBytes": 8388608,
    "maximumExecutionMs": 900000,
    "maximumProcesses": 64,
    "maximumMemoryBytes": 2147483648,
    "maximumCpuMillis": 900000,
    "terminationGraceMs": 1000
  }
}
```

All catalog paths must resolve to executable files. All search-path entries
must resolve to directories. They must remain stable while Buster runs. Buster
fails startup when `command.execute` is enabled without this configuration.

`executableSearchPath` is the safe `PATH` that commands receive. It lets a
catalog program start its normal child tools. For example, `npm` uses
`/usr/bin/env node`, and Go tests can start compiler tools. This path comes only
from the operator. A project cannot change it.

`runtimeReadRoots` is the complete read-only filesystem view for project test
processes, in addition to their private repository copy and `/dev/null`. List
the approved executable directories and the runtime library directories that
those executables need. Do not add `/`, the Buster state root, the Buster
configuration directory, home directories, or `/proc`.

For example, a Node installation can need `/usr/local/bin`,
`/lib/x86_64-linux-gnu`, and `/lib64`. Use `ldd` during deployment to identify
dynamic-library directories. Then run the focused provider proof. A missing
runtime file makes the command fail with a permission or loader error. Add only
the narrow missing runtime directory after review.

`cgroupRoot` is a delegated, writable cgroup v2 directory. Buster creates one
temporary child cgroup for each command. The child cgroup has a kernel-enforced
`pids.max` value. The value includes one sandbox supervisor in addition to the
project process limit. Buster removes the child cgroup after the command stops.

Create and delegate this directory as part of the Buster service deployment.
Its `cgroup.controllers` file must list `pids`, `memory`, and `cpu`. Buster
rejects production direct-command configuration without `cgroupRoot`. It also
rejects a command when the directory is absent, read-only, or lacks a required
controller. Do not point this value at the cgroup root for the full host.

Buster writes `+pids +memory +cpu` to `cgroup.subtree_control` and verifies the
result before it creates a command cgroup. The service manager must delegate
these controllers and make both the directory and control files writable by
the Buster service. The delegated parent must not contain the Buster service
process itself; place that process in a sibling or parent service cgroup. If
delegation is incomplete, the command fails before the project program starts
with `COMMAND_CGROUP_CONTROLLERS_NOT_DELEGATED` or
`COMMAND_CGROUP_CONTROLLERS_NOT_ENABLED`.

### Final-cutover cgroup preflight

Run these read-only checks on the final runtime platform before configuration:

```bash
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers
cat /sys/fs/cgroup/kubeclaw/cgroup.controllers
cat /sys/fs/cgroup/kubeclaw/cgroup.subtree_control
test -w /sys/fs/cgroup/kubeclaw/cgroup.subtree_control
```

Expected facts are:

- the filesystem type is `cgroup2fs`;
- both controller lists include `pids`, `memory`, and `cpu`;
- the delegated subtree control enables all three controllers; and
- the Buster service account can write the delegated control files.

The exact delegation command belongs to the final service manager or pod
security design. Do not run an ad-hoc privileged command from Buster, and do
not grant Buster the host cgroup root. Record and review that deployment design
when the final runtime platform is selected.

## Limit behavior

The project node requests limits. Buster applies the lower of the node request
and the operator maximum. Projects cannot increase operator ceilings.

For direct commands, `maximumProcesses` is a hard Linux execution-task limit.
Linux counts each process and each thread as one cgroup PID. The sandbox
supervisor gets one separate slot. This definition lets the kernel stop a fork
or thread burst before it starts. It does not depend on later sampling.

Threaded tools must request enough slots. A small native tool can need only a
few. Node, Java, .NET, browsers, and test tools with worker threads normally
need more. Start with 32 for a single Node test process and 64 for a wrapper
such as npm that starts Node. Measure `maximumProcesses` in the stored resource
facts and lower or raise the project request within the operator ceiling. A
request that is too small fails safely instead of exceeding the boundary.

The command runs without a shell and with a new process group. Cancellation,
timeout, output excess, and shutdown terminate the complete group. The sandbox
applies memory, CPU, open-file, network, and kernel PID restrictions. The
cgroup enforces aggregate memory and PID limits for the complete command tree.
It also sets `cpu.max` from the CPU budget and wall-time limit. This kernel rate
cap prevents parallel CPU bursts between accounting checks. Buster reads
cumulative CPU use from `cpu.stat`, so short-lived child processes cannot hide
their CPU use. The repeated check stops the cgroup when its total CPU budget is
exhausted. `/proc` sampling is used only by the explicit local test fallback on
hosts where the test harness cannot delegate a cgroup.

## Environment behavior

The command receives declared literal values, `CI=true`, the operator search
path, and private `HOME` and `TMPDIR` directories inside its attempt. It does
not inherit Buster tokens, keys, cloud variables, Git variables, the Buster
home directory, or loader controls.

## Filesystem behavior

Nova sends only a signed committed source snapshot. Buster extracts it once.
The runner copies that snapshot into one writable repository per attempt.
Report and coverage paths must remain inside that repository. Linux Landlock
denies command reads outside the repository and declared runtime roots. It
denies writes outside the repository. This prevents test code from reading
Buster configuration, state, credentials, other attempts, or same-user `/proc`
data and copying those values into logs. The sandbox fails closed if it cannot
install these rules. Provider code can write only its scratch and evidence
areas.

Buster removes a private repository copy after the attempt has collected its
declared outputs and evidence. Durable logs, reports, artifacts, result facts,
and receipts remain. A retained fixture keeps its private copy only until its
required cleanup completes. This prevents repository storage from multiplying
across completed nodes and retries.

The host kernel must support Landlock ABI 2 or later. ABI 2 is required to
control cross-directory rename and link operations. Buster fails before the
project command starts when the host has no Landlock support or only ABI 1.

Use a dedicated Buster service account and runtime root. Phase 8 uses the Linux
sandbox and process boundary; it does not introduce a container scheduler.

## Network behavior

The command sandbox denies socket creation and connection syscalls. A project
cannot fetch test code during execution. Reusable test code must be in the
signed project snapshot or an installed, verified provider package.

## Package installation

Install these trusted packages in the Buster plugin root:

- `kubeclaw.direct-command`;
- `kubeclaw.coverage-budget`; and
- `kubeclaw.junit-report`.

Package discovery records the package version and content digest. Buster copies
the selected provider package into an immutable attempt snapshot and checks the
digest before execution.

## Safe catalog changes

Treat a catalog edit as an operator deployment change:

1. Resolve the canonical executable path.
2. Record the tool version.
3. Run the direct-command focused proof.
4. Run a real Phase 8 vertical proof.
5. Restart Buster with the new configuration.
6. Confirm recovery completes before the HTTP listener starts.

Do not map a catalog name to a shell such as `sh`, `bash`, `cmd`, or
`powershell`. Do not map a generic name to a mutable project file.

## Current contained Nova-pod verification

Run these commands from the Phase 8 repository worktree inside the Nova pod:

```bash
npm ci
npm run verify:test-gate:phase8
npm run verify:test-gate:phase7
npm run verify:contracts
npm run docs:check:generated
npm run docs:check:coverage
git diff --check
```

What this proves:

- the project input comes from a real committed Git snapshot;
- Nova and Buster communicate over real authenticated HTTP;
- the default runner starts real isolated provider and command processes;
- real JUnit and LCOV files become retained and verified evidence;
- timeout, cancellation, child cleanup, path denial, network denial, output
  limits, retries, concurrency, and Nova's final policy are exercised; and
- Phase 7 behavior remains intact.

What this does not prove:

- writable host cgroup delegation;
- a final production service-manager configuration;
- BuildKit, a Kubernetes deployment fixture, or another facility that belongs
  to a later suite; or
- the final single-authority cutover.

`verify:test-gate:phase8` intentionally enables the sampled process-accounting
fallback inside its test harness. A production Buster configuration cannot set
that option. If the vertical proof fails, do not bypass the sandbox. Inspect
the test output and the diagnostic evidence described below.

Temporary tools may be installed in the contained pod when a real proof needs
them. Pin or record their version, add them only to the test environment, and
remove them after the proof when they are not part of the repository lockfile.
Do not silently turn a temporary tool into a production catalog entry.

## Diagnostics

For a failed attempt, inspect the terminal state before the summary:

- `failed` means the command or JUnit cases completed and failed.
- `errored` means the system could not obtain a trustworthy result.
- `timed_out` means the wall-time limit stopped execution.
- `cancelled` means Nova or shutdown requested cancellation.

Then inspect the stored runner log, original reports, resource facts, package
identity, source identity, and receipt. Do not infer success from console text.

## Authority boundary

The provider-based path is now the only unit-gate authority. Reject legacy
unit requests. Do not restore `test_config.unit`, hidden npm discovery, or the
deleted parser as an operational fallback. The remaining legacy runtime may
run only the twelve suites that have not completed their own migration.

## Operator checklists

### Current contained validation

- Work in the contained Nova pod.
- Use real committed source and real provider packages.
- Use the test-only sampled cgroup fallback only through the tracked harness.
- Run the focused Phase 10 proof and the full regression commands above.
- Record any unavailable external facility instead of mocking its behavior.
- Confirm that a legacy unit request is rejected and the replacement-only
  vertical proof passes.

### Final single-path production cutover

- All suite parity ledgers are closed.
- Only one execution path can control each gate.
- The runtime platform and service manager are fixed and documented.
- A narrow writable cgroup v2 subtree is delegated to Buster.
- `pids`, `memory`, and `cpu` preflight checks pass.
- Landlock ABI 2 or later is available.
- Every executable catalog path and version is reviewed.
- The real vertical proof passes without the sampled fallback.
- Recovery, cancellation, resource exhaustion, upgrade, and rollback proofs
  pass on that platform.
- Nova remains the only final gate authority.
