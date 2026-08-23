# Pipeline Test Gate Phase 8 Final Audit

Status: implementation complete; final verification and review evidence is recorded below

## Result

Phase 8 implements the first complete provider-based suite vertical slice.
Projects can declare several shell-free unit commands. Buster runs them in
private attempts, retains ordered logs and exact reports, normalizes JUnit,
evaluates optional LCOV coverage in a separate node, and returns verified facts
to Nova. Nova remains the gate authority.

Phase 8 does not cut over production authority. Phase 9 parity and Phase 10
cutover remain required.

Phase 8 acceptance ran inside the contained Nova development pod. The vertical
proof used real committed Git source, authenticated HTTP, Nova and Buster
runtimes, worker and provider processes, commands, JUnit, LCOV, evidence, and
Nova policy. The pod's cgroup filesystem is read-only, so the tracked test
harness used sampled process accounting for that one unavailable kernel
facility. Production configuration cannot enable this fallback.

External production-platform validation is deliberately deferred until every
suite has migrated and only one authority path remains. At that final cutover,
the same proof must run with delegated cgroup v2 controls and without local
fallbacks. Phase 8 does not require an interim external Buster deployment.

## Subphase audit

### 8-B

Implemented the direct-command provider, operator catalog, literal arguments,
contained directories, sanitized environment, real process execution, resource
limits, complete process-group termination, network denial, and ordered output.

### 8-C

Implemented exact required report declarations, original XML retention,
registered JUnit normalization, several report aggregation, fail-closed result
precedence, and missing, malformed, zero-case, and exit/report conflict proof.

### 8-D

Implemented the provided unit suite contract and tested project examples.
Several instances use normal test nodes and the existing dependency,
concurrency, retry, identity, attempt, evidence, and policy systems.

### 8-E

Implemented optional LCOV outputs, typed artifact links, and a separate coverage
budget provider. It verifies artifacts, reports each input, safely combines
line data, supports blocking thresholds and advisory reporting, and does not
rewrite unit results.

### 8-F

Added a real committed Git project proof through Nova HTTP dispatch, Buster
recovery-safe job storage, the default runner, worker attempt executor, isolated
provider process, real command process, JUnit adapter, coverage provider,
evidence import, execution graph, and Nova policy.

## Defects found during implementation

The implementation audit found and fixed shared defects:

- output handling lost stdout and stderr order;
- command termination did not target the complete process group;
- remote per-node capability grants were not selected by the runner;
- different capability sets produced duplicate worker profile names;
- provider stdin could emit an unhandled pipe error during termination;
- test attempts shared one extracted repository instead of private writable
  copies; and
- normalized JUnit failures did not control the direct-command result.
- the command sandbox limited its start directory but did not deny writes to
  other Buster-owned directories;
- an empty `PATH` prevented wrapper tools such as npm from starting their
  normal child runtime; and
- the shared sandbox denied local process IPC that normal child tools need;
  local IPC is now allowed while network sockets remain denied; and
- the contained legacy Buster worker used a hard-coded repository root when a
  live test ran from a Git worktree.

The first Terra review found three additional security defects. They were
accepted and fixed:

- a detached child could leave the original process group and survive cleanup;
  the sandbox now supervises all descendants as a Linux child subreaper and
  terminates adopted background processes before it returns;
- report collection checked a path and then reopened it by name; it now opens
  with no-follow behavior and copies from the verified file descriptor; and
- the shared legacy command adapter accepted caller environment values; it now
  rejects them, while the dedicated direct-command boundary applies its own
  protected-name policy.

The second Terra review found two more defects. They were accepted and fixed:

- kernel limits applied to each process, but the declared limit applies to the
  complete process tree; this was first fixed with aggregate accounting and was
  later strengthened with the cgroup controls recorded below; and
- a nonzero command exit with passing JUnit cases could report zero failed
  checks; the result now adds one failed command check so outcome and counts
  agree.

The descendant-supervisor audit then found a provider-loader compatibility
defect: the old termination fallback killed only the new supervisor PID. The
provider loader now starts a distinct process group, asks the supervisor to
stop, and uses a bounded group-wide kill only if graceful cleanup fails.

Later Terra cycles found and fixed additional hard-boundary defects:

- report and coverage bytes are checked against one cumulative attempt budget
  before Buster creates an evidence copy;
- final production-authority direct commands require delegated cgroup v2 `pids`, `memory`, and
  `cpu` controllers;
- cgroups now bound the command tree's execution tasks and memory, while
  `cpu.max` and cumulative `cpu.stat` accounting bound CPU use;
- Landlock denies undeclared file and directory reads as well as writes,
  permits only the private repository and operator runtime roots, and requires
  ABI 2 for safe cross-directory operations;
- output records are coalesced and count-bounded, and captured output is logged
  before a timeout, cancellation, or resource error is reported;
- private repository copies preserve relative symlinks and are removed after
  attempt finalization so completed nodes and retries do not multiply disk use;
- sandbox termination gives the descendant supervisor enough time to adopt and
  remove detached children; and
- Nova rejects a blocking coverage node without a declared minimum before
  dispatch.

## Decision result

D-051, D-052, D-053, D-084, and D-114 through D-118 are implemented. D-085,
D-090 through D-094, and D-119 remain implemented and are exercised by Phase
8. All 15 `UNIT-NEW-*` requirements have Phase 8 implementation proof.

## Security result

- no shell execution;
- exact operator executable catalog;
- signed committed source only;
- verified provider packages;
- private writable attempt repositories;
- kernel-enforced write isolation to the current attempt repository;
- kernel-enforced read isolation to the attempt repository and declared runtime
  roots;
- sanitized environment with no ambient secrets;
- operator-controlled executable search path and private home/temp folders;
- denied network syscalls;
- cgroup-bounded time, aggregate CPU, aggregate memory, execution tasks,
  output, file, and artifact use;
- exact contained report paths; and
- digest and size verification for stored reports and coverage inputs.

## Verification record

The final closeout ran:

```text
npm run verify:test-gate:phase8
npm run verify:test-gate:phase7
npm run verify:contracts
npm run verify:plugin-packages
npm run verify:plugin-live-capabilities
npm run docs:check
git diff --check
npm audit --omit=dev
```

All checks passed except the known unrelated Prism reference noted below.
Results:

- the focused Phase 8 vertical proof passed;
- the complete Phase 7 regression passed;
- the full contract and plugin-system regression passed;
- 119 architecture decisions and 92 unit parity items remain traced;
- all 35 live plugin packages passed;
- all 40 executable plugin registrations passed crash containment;
- generated inventories and references are current;
- Git whitespace checks passed; and
- the production dependency audit found zero vulnerabilities.

The complete documentation command has one known unrelated failure: the
architecture index links to the untracked Prism design draft. The Phase 8
generated-document and coverage checks pass. This phase does not add, copy,
change, or remove Prism material.

Final structured review:

```text
python /home/node/.openclaw/agents/main/agent/codex-home/skills/autoreview/scripts/autoreview \
  --mode local \
  --engine codex \
  --model gpt-5.6-terra \
  --thinking high \
  --codex-bin /app/node_modules/@openai/codex/bin/codex.js \
  --stream-engine-output
```

Final result:

```text
autoreview clean: no accepted/actionable findings reported
patch is correct
```

Each valid review finding was fixed and retested. A few findings were rejected
with direct proof because the referenced header, branch, or early return already
existed and its executable test passed.
