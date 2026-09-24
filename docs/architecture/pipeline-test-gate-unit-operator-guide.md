# Unit Test Gate Operator Guide

Status: authoritative unit-test operator reference after Phase 10

## Read this first

The unit path has two verification environments:

1. **Contained validation** runs inside the Nova development pod. It uses real
   Git commits, HTTP, Nova and Buster runtimes, worker and provider processes,
   commands, JUnit files, LCOV files, evidence, and gate decisions.
2. **Production acceptance** runs through the deployed Nova and Buster
   services. Buster uses the same unprivileged process-tree accounting path.

Both environments use Landlock, seccomp, `setrlimit`, process-tree termination,
and 25 ms aggregate CPU, memory, and process sampling. The Buster pod does not
mount or administer host cgroups.

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
Buster therefore tracks the complete descendant tree, samples its aggregate
CPU, memory, and process count every 25 ms, and terminates the process group
when a limit is exceeded.

## Operator responsibility

The operator controls which programs Buster can start and the maximum resources
that any project can request. Projects use stable catalog names. They cannot
provide arbitrary host paths.

## Required Buster configuration

This section defines the deployed production form.

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
    "allowSampledProcessLimit": true,
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

Production sets `allowSampledProcessLimit` explicitly. This keeps Buster
unprivileged and portable across Kubernetes nodes. It does not grant
`SYS_ADMIN`, mount `/sys/fs/cgroup`, or rely on node-specific delegation.

The sandbox applies per-process address-space, CPU, file, and core limits. The
runner samples the complete descendant tree every 25 ms, terminates it when an
aggregate process, memory, or CPU budget is exceeded, and kills remaining
descendants during cleanup. A future platform may supply `cgroupRoot` instead,
but it must be a genuinely pre-delegated narrow subtree; Buster must never
configure host cgroups itself.

## Limit behavior

The project node requests limits. Buster applies the lower of the node request
and the operator maximum. Projects cannot increase operator ceilings.

For direct commands, `maximumProcesses` is the aggregate sampled descendant
process limit. The sandbox supervisor is excluded from the project count.

Threaded tools must request enough slots. A small native tool can need only a
few. Node, Java, .NET, browsers, and test tools with worker threads normally
need more. Start with 32 for a single Node test process and 64 for a wrapper
such as npm that starts Node. Measure `maximumProcesses` in the stored resource
facts and lower or raise the project request within the operator ceiling. A
request that is too small fails safely instead of exceeding the boundary.

The command runs without a shell and with a new process group. Cancellation,
timeout, output excess, resource excess, and shutdown terminate the complete
group. The sandbox applies per-process address-space, CPU, open-file, network,
and filesystem restrictions. Buster samples aggregate descendant CPU, memory,
and process use and stops the group when a project budget is exhausted.

## Environment behavior

The command receives declared literal values, `CI=true`, the operator search
path, and private `HOME` and `TMPDIR` directories inside its attempt. It does
not inherit Buster tokens, keys, cloud variables, Git variables, the Buster
home directory, or loader controls.

## Filesystem behavior

Nova sends only a committed source snapshot bound to its archive digest. Buster extracts it once.
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

- BuildKit, a Kubernetes deployment fixture, or another facility that belongs
  to a later suite; or
- the final single-authority cutover.

`verify:test-gate:phase8` exercises the same sampled process-accounting path as
the deployed Buster runtime. If the vertical proof fails, do not bypass the
sandbox. Inspect the test output and the diagnostic evidence described below.

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
- Use the sampled process-tree path only through the tracked command runner.
- Run the focused Phase 10 proof and the full regression commands above.
- Record any unavailable external facility instead of mocking its behavior.
- Confirm that a legacy unit request is rejected and the replacement-only
  vertical proof passes.

### Production acceptance

- All suite parity ledgers are closed.
- Only one execution path can control each gate.
- The runtime platform and service manager are fixed and documented.
- The pod has no host cgroup mount and no `SYS_ADMIN` capability.
- Landlock ABI 2 or later is available.
- Every executable catalog path and version is reviewed.
- The real vertical proof passes through the sampled process-tree boundary.
- Recovery, cancellation, resource exhaustion, upgrade, and rollback proofs
  pass on that platform.
- Nova remains the only final gate authority.

After you deploy the current Nova and Buster images, run:

```bash
./scripts/deploy.sh nova-unit-preflight
```

This command starts a real Node process through Nova and Buster. It requires a
real JUnit report, imports the result, and requires a passing Nova decision.
It stores `dist/verification/unit-production-receipt.json`. Install the
approved public key at
`/etc/kubeclaw/production-receipt-authority.pub` and supply the external
operator private-key file before the run.
