# Pipeline Test Gate Phase 8 Plan

Status: implemented; Phase 9 parity proof and Phase 10 cutover remain

Phase: first provider-based suite vertical slice

Suite: unit tests

Predecessor: Phase 7 remote Nova-to-Buster gate is complete

Successor: Phase 9 unit parity proof, then Phase 10 cutover and deletion

## Purpose

Phase 8 builds the first real suite on the provider-based test system. It lets a
project declare one or more unit-test commands, runs them through Buster, saves
their logs and reports, and returns verified results to Nova.

Phase 8 does not replace the old unit suite yet. Phase 9 proves full parity.
Phase 10 switches authority and deletes the old implementation.

All Phase 8 acceptance testing runs inside the contained Nova development pod.
The proof uses real committed source, HTTP, Nova and Buster runtimes, worker and
provider processes, test commands, reports, evidence, and gate policy. When a
host facility cannot be delegated into that pod, the proof names the exact gap
and uses only the tracked test fallback. Phase 8 does not require an external
production deployment. The final production-platform proof occurs after every
suite has migrated and only one authority path remains.

The reusable migration method is defined in
[pipeline-test-gate-suite-migration-playbook.md](pipeline-test-gate-suite-migration-playbook.md).

## Plain-language overview

A project can declare tests such as:

```text
frontend-unit
backend-unit
shared-go-unit
```

Each declaration says:

1. which program to start;
2. which exact arguments to give it;
3. which project folder it starts in;
4. which report files it must create;
5. whether failure blocks the pipeline; and
6. how long it may run and whether it may retry.

Nova turns each declaration into a normal test node. Buster runs the nodes using
the shared runner. Nova receives verified results and makes the gate decision.

There is no unit-specific scheduler, workflow engine, result store, or remote
protocol.

## The command model

### `executable`

The executable is the operator-approved program that Buster starts. The project
uses a stable catalog name. For example, `npm` can map to `/usr/bin/npm` in one
Buster deployment and another safe absolute path in a different deployment.
The project never needs that host-specific path and cannot select a program that
the operator did not approve.

Examples:

```text
npm
pytest
go
cargo
dotnet
```

### `args`

Arguments are the exact values passed to the executable.

This terminal command:

```bash
go test ./...
```

becomes:

```json
{
  "executable": "go",
  "args": ["test", "./..."]
}
```

This terminal command:

```bash
npm test -- --reporter=junit
```

becomes:

```json
{
  "executable": "npm",
  "args": ["test", "--", "--reporter=junit"]
}
```

Each array item remains one literal argument. Buster does not interpret `&&`,
`|`, `>`, `$()`, wildcards, or shell variables.

### `workingDirectory`

The working directory is the project folder in which the program starts.

For this repository:

```text
repository/
  frontend/
  backend/
```

a backend test can declare:

```json
{
  "executable": "pytest",
  "args": ["--junitxml=reports/unit.xml"],
  "workingDirectory": "backend"
}
```

The default is the repository root, written as `.`. An absolute path, parent
escape such as `../secret`, or symbolic-link escape is invalid.

### Why Phase 8 does not accept a shell command string

A string such as this is convenient:

```bash
cd backend && pytest --junitxml=reports/unit.xml
```

It also requires a shell. Shells have different quoting rules, expand variables
and wildcards, interpret special symbols, complicate cancellation, and can run
unexpected commands. Exact executable and argument fields are more verbose but
are safer, portable, reproducible, and easier to audit.

Projects that need several steps should declare separate dependent test or
fixture nodes. They can also run a committed project program through an approved
catalog executable. For example, `executable: "node"` with
`args: ["scripts/test-unit.mjs"]` runs committed JavaScript without a shell.
Phase 8 does not hide a workflow inside a command string and does not allow an
arbitrary project path to bypass the executable catalog.

## Configuration contract

The direct-command provider will use a versioned strict schema. The planned
project-facing values are:

```json
{
  "executable": "npm",
  "args": ["test", "--", "--reporter=junit"],
  "workingDirectory": ".",
  "environment": {
    "NODE_ENV": "test"
  },
  "resultMode": "junit-required",
  "reports": [
    {
      "id": "unit",
      "format": "junit",
      "path": "reports/unit.xml",
      "mediaType": "application/junit+xml"
    }
  ],
  "coverage": [
    {
      "id": "unit-coverage",
      "format": "lcov",
      "path": "coverage/lcov.info",
      "mediaType": "text/plain"
    }
  ]
}
```

### Field rules

- `executable` is required, non-empty, and contains no newline or null byte.
  It names an operator-approved executable catalog entry, not an arbitrary host
  path.
- `args` defaults to an empty array. Each value is a bounded literal string.
- `workingDirectory` defaults to `.` and must stay in the attempt repository.
- `environment` is optional. Keys and values are bounded. Protected platform,
  credential, loader, and runtime-control names are rejected. The provider adds
  `CI=true`; it does not assume Node, npm, or another language.
- `resultMode` is either `junit-required` or `exit-code`.
- `reports` is required and non-empty for `junit-required` mode. It is empty in
  `exit-code` mode.
- `coverage` is optional. Coverage files are outputs for a separate linked
  coverage test; they do not change the command result.

The exact count and byte limits will use existing platform ceilings where
possible and will be fixed in the provider schema during Phase 8-B. They cannot
be unbounded or project-expandable beyond operator limits.

## Result modes

### Recommended mode: `junit-required`

The command must create every declared JUnit report. The existing JUnit adapter
reads each original file and returns common facts:

- total cases;
- passed cases;
- failed cases;
- errored cases;
- skipped cases;
- bounded case details; and
- durations.

This mode is recommended because it proves that tests ran and identifies failed
cases.

### Fallback mode: `exit-code`

Some tools cannot produce JUnit. The project can explicitly use exit-code mode.

- exit code `0` records one passed command check;
- a nonzero exit records one failed command check;
- the result does not claim a known count of framework test cases; and
- full logs remain evidence.

This is flexible but provides less detail. It must be selected explicitly; it
is not a silent fallback when a required JUnit report is missing.

## Fixed result precedence

The following rules prevent false passes:

1. A start failure is an execution error.
2. A timeout is `timed_out`.
3. A requested cancellation is `cancelled`.
4. A nonzero process exit fails a completed attempt.
5. Any failed or errored JUnit case fails a completed attempt.
6. A missing required report is an execution error.
7. A malformed or oversized required report is an execution error.
8. JUnit-required mode with zero total cases is an execution error.
9. Logs cannot override the process exit or structured report.
10. A successful retry is marked unstable; every attempt remains stored.

When a process exits zero but JUnit reports a failed case, the attempt fails.
When JUnit reports success but the process exits nonzero, the attempt fails.

## Report declarations

Phase 8 uses exact relative paths, not wildcard patterns.

Each report declaration contains:

- a stable `id`;
- a registered `format`;
- a contained relative `path`; and
- an allowed `mediaType`.

IDs and paths must be unique. Every declared required report must exist. Every
original report is stored as evidence before normalization.

Exact paths are less convenient than patterns such as `reports/**/*.xml`, but
they have deterministic ordering, ownership, count, and size. Wildcard support
can be added later if real projects require it.

Several JUnit reports are allowed. The adapter normalizes each report
separately. Buster presents them in declaration order and calculates the final
attempt from all declared reports and the process exit.

## Writable workspace and source safety

The committed source snapshot remains immutable input authority. Unit-test tools
often create caches, compiled files, snapshots, reports, or coverage files.

For each attempt, Buster supplies a private writable attempt repository derived
from the verified committed snapshot. Changes remain inside that attempt and are
discarded after evidence collection. They do not alter Nova's source repository
or another test attempt.

The direct-command provider calls the shared `command.execute` capability. The
production Buster runtime resolves the catalog name, applies the provider's
grant, and invokes the isolated command adapter. The command process receives a
dedicated attempt boundary, a sanitized environment, no network access, bounded
resources, and no Buster secrets. It can read and write its private attempt
repository but cannot alter Nova's source repository or another attempt. It
cannot fetch test code at runtime.

The shared command adapter must return bounded ordered stdout/stderr records.
The provider writes those records to the normal log evidence in their observed
order. This fixes the old unit path, which concatenated all stdout before all
stderr and lost the original order.

## Multiple unit-test instances

Each instance is an ordinary test-plan node. For example:

```json
{
  "tests": {
    "frontend-unit": {
      "uses": "kubeclaw.direct-command@1",
      "mode": "blocking",
      "config": {
        "executable": "npm",
        "args": ["test", "--", "--reporter=junit"],
        "workingDirectory": "frontend",
        "resultMode": "junit-required",
        "reports": [
          {
            "id": "frontend-unit",
            "format": "junit",
            "path": "reports/unit.xml",
            "mediaType": "application/junit+xml"
          }
        ]
      }
    },
    "backend-unit": {
      "uses": "kubeclaw.direct-command@1",
      "mode": "blocking",
      "config": {
        "executable": "pytest",
        "args": ["--junitxml=reports/unit.xml"],
        "workingDirectory": "backend",
        "resultMode": "junit-required",
        "reports": [
          {
            "id": "backend-unit",
            "format": "junit",
            "path": "reports/unit.xml",
            "mediaType": "application/junit+xml"
          }
        ]
      }
    }
  }
}
```

The exact outer `.swarm/pipeline.json` shape will use the existing test-scope
schema and will be copied from tested Phase 8 fixtures before closeout. The
provider configuration shown above is normative; this full object remains an
illustrative preview until Phase 8-D locks the suite example.

Independent nodes can run in bounded parallel. Failure in one does not stop the
other. Nova fails the gate when any final blocking node fails. Advisory failures
remain visible but do not block.

The existing runner supplies default one-retry behavior, attempt retention,
unstable marking, concurrency limits, dependencies, cancellation, and summaries.
Phase 8 does not reimplement them.

## Provided unit suite

The provided suite is a declarative template. It does not assume Node, npm, a
package file, or automatic test discovery.

It provides:

- the generic direct-command registration;
- JUnit adapter selection;
- full-log and report evidence defaults;
- one retry by default for retry-safe execution;
- a standard concurrency group; and
- examples for blocking and advisory instances.

The project must declare its executable, arguments, and result mode. The system
does not run undeclared tests.

## Coverage

Coverage measures which source lines tests executed. It is not the same as test
success, so it uses a separate node.

Phase 8 supports LCOV first:

```text
backend-unit --LCOV artifact--> backend-coverage-budget
```

The unit provider declares the LCOV file as an artifact output. A typed link
passes the immutable artifact reference to `coverage-budget`.

The coverage-budget provider:

- accepts one or more declared LCOV inputs;
- reports each input separately;
- combines only compatible LCOV line measurements;
- requires at least one minimum when blocking;
- permits report-only advisory use; and
- never changes the source unit-test result.

LCOV is the first format, not a permanent limitation. Other coverage adapters
can be registered later without changing the unit provider or gate authority.

## Alternatives considered

### Shell command strings

Advantage: easy to copy from a terminal.

Rejected for Phase 8: unsafe expansion, platform differences, hidden workflows,
and weaker process cleanup.

### Framework-specific providers only

Advantage: richer automatic setup for each framework.

Rejected as the only path: many packages, duplicated execution logic, and poor
support for uncommon languages. Specialist providers may be added later while
the generic provider remains the fallback.

### Automatic npm discovery

Advantage: very short Node configuration.

Rejected as the default: assumes one ecosystem, can run unintended scripts, and
makes the resolved plan less explicit. A future npm-specific provider can offer
safe discovery as an opt-in feature.

### Console-output parsing

Advantage: works without report configuration.

Rejected as structured authority: output text changes between frameworks and
versions. Exit-code mode remains an explicit low-detail fallback.

### Wildcard report paths

Advantage: easy collection of many generated files.

Deferred: introduces ordering, duplication, escape, and size complexity before
real demand exists.

### Coverage inside the unit result

Advantage: fewer visible nodes.

Rejected: mixes test correctness with a separate quality budget and makes
dependencies and policy less clear.

### A unit-specific scheduler

Advantage: could optimize unit behavior locally.

Rejected: duplicates retries, concurrency, cancellation, history, and graph
authority already supplied by the common system.

### Host-specific executable paths in project configuration

Advantage: matches the current low-level `command.execute` resource directly.

Rejected for project use: `/usr/bin/npm` or another absolute path is not portable
between Buster deployments. A stable operator catalog name keeps project files
simple while preserving an exact allowlist at execution time.

## Applicable accepted decisions

Phase 8 directly closes or exercises:

- D-051 — extensible unit suite and multiple instances;
- D-052 — run all independent unit instances;
- D-053 — optional independent coverage budget;
- D-084 — minimum provider system with unit first;
- D-085 — provider schema, suite template, and project overrides;
- D-090 — replaceable report adapters with JUnit first;
- D-091 — one Nova-owned execution graph;
- D-092 — attempt resource measurements;
- D-093 — stable test identity and retained attempts; and
- D-094 — committed snapshots and installed packages only.

The Phase 8-specific decisions lock these rules:

- D-114 — executable, literal arguments, contained directory, and environment.
- D-115 — explicit result modes and fail-closed precedence.
- D-116 — exact report declarations and original evidence retention.
- D-117 — normal test-plan nodes for every unit instance.
- D-118 — separate LCOV-first coverage checks.
- D-119 — the reusable migration and documentation workflow.

## Subphases

Each subphase requires focused proof, a decision audit, updated documentation,
and Terra/high review before the next subphase.

### 8-A — Lock contracts and proof ownership

Deliverables:

- this detailed plan and the reusable migration playbook;
- D-114 through D-119 in the architecture decision source and ledger;
- mapping for all 15 `UNIT-NEW-*` requirements;
- initial code, test, documentation, and deletion targets; and
- a verified clean Phase 7 baseline.

Acceptance:

- no unresolved user-facing or authority decision;
- every configuration field has an explanation and example;
- traceability and documentation checks pass; and
- review has no unresolved actionable finding.

### 8-B — Direct-command provider

Status: complete

Deliverables:

- installed provider package and registration;
- strict versioned configuration schema;
- operator executable catalog and canonical path resolution;
- production Buster wiring for the existing `command.execute` capability;
- isolated command-adapter enforcement for filesystem, environment, network,
  process, output, and time boundaries;
- exact executable and argument execution without a shell;
- contained working directory and sanitized environment;
- writable attempt repository;
- cancellation, timeout, process-tree cleanup, and output limits;
- full ordered stdout/stderr log evidence; and
- resource and exit facts through the existing attempt contract.

Focused proof:

- several real executables and literal special-character arguments;
- denied shell string, unknown executable catalog entry, path escape, protected
  environment, network/content fetch, excess output, excess process, start
  failure, timeout, and cancellation;
- distinct terminal states and process cleanup; and
- provider package isolation and digest verification.

### 8-C — JUnit result integration

Status: complete

Deliverables:

- exact report declarations;
- original report retention;
- existing JUnit adapter use;
- multi-report deterministic aggregation;
- fixed result precedence; and
- missing, malformed, oversized, duplicate, and zero-case handling.

Focused proof:

- real passing, failing, errored, skipped, and mixed JUnit reports;
- exit/report conflict in both directions;
- multiple reports; and
- evidence digest and size verification.

### 8-D — Unit suite composition

Status: complete

Deliverables:

- provided unit suite template;
- several normal unit nodes per module;
- blocking and advisory examples;
- existing retry, unstable, dependency, and concurrency behavior; and
- complete suite summary through the existing plan result.

Focused proof:

- independent nodes continue after failure;
- bounded parallel execution;
- blocking and advisory gate decisions;
- retry pass retains both attempts and becomes unstable; and
- stable identities across separate runs.

### 8-E — Independent coverage budget

Status: complete

Deliverables:

- declared LCOV artifact output;
- typed artifact links;
- installed coverage-budget provider and strict schema;
- per-input and safely combined line coverage; and
- blocking-limit and advisory-report modes.

Focused proof:

- one and several LCOV inputs;
- malformed, missing, incompatible, duplicate, and oversized inputs;
- boundary percentages and at least one required blocking limit; and
- unit and coverage results remain independent.

### 8-F — Real vertical proof and closeout

Status: complete

Deliverables:

- real project fixtures using several languages or tools;
- complete Nova-to-Buster gate runs;
- restart, duplicate, retry, timeout, cancellation, evidence, and negative
  security proof;
- updated decision ledger, inventory, user guide, operator guide, verification
  reference, and Phase 8 final audit; and
- clean full verification and Terra/high review.

Acceptance:

- every `UNIT-NEW-*` item has implementation and proof;
- the real path uses no synthetic provider execution;
- docs answer every playbook documentation question;
- the old unit suite remains contained and non-authoritative in Phase 8 proof;
- Phase 9 can start without a new architecture decision; and
- no Phase 10 cutover or deletion is claimed early.

## `UNIT-NEW-*` ownership

- `UNIT-NEW-001`: 8-D.
- `UNIT-NEW-002`: 8-D.
- `UNIT-NEW-003`: 8-B.
- `UNIT-NEW-004`: 8-C.
- `UNIT-NEW-005`: 8-D.
- `UNIT-NEW-006`: 8-D.
- `UNIT-NEW-007`: shared foundation exercised in 8-B/8-D/8-F.
- `UNIT-NEW-008`: shared foundation exercised in 8-B/8-D/8-F.
- `UNIT-NEW-009`: 8-B and 8-C.
- `UNIT-NEW-010`: shared resolver exercised in 8-D/8-F.
- `UNIT-NEW-011`: shared foundation exercised in 8-B/8-D/8-F.
- `UNIT-NEW-012`: 8-E.
- `UNIT-NEW-013`: 8-C.
- `UNIT-NEW-014`: 8-C.
- `UNIT-NEW-015`: 8-C.

## Verification plan

Phase 8 will add focused commands for:

- direct-command provider contracts and live execution;
- unit suite resolution and runner behavior;
- coverage-budget contracts and live execution; and
- the complete Phase 8 vertical proof.

Closeout also runs:

- Phase 7 verification;
- all pipeline test-gate contract and traceability checks;
- all affected plugin package and live capability tests;
- the full repository contract suite;
- TypeScript checks;
- documentation generation, references, and coverage checks;
- Git whitespace checks;
- production dependency audit; and
- Terra Autoreview with high reasoning.

## Explicit Phase 8 scope boundary

Phase 8 does not:

- give the replacement production authority;
- delete the old unit suite;
- prove all 92 old-unit parity items;
- add shell execution;
- add automatic framework or package-manager discovery;
- add report wildcards;
- add network access or runtime test-content fetching;
- add a complete historical stability interface;
- add PostgreSQL, object storage, or a distributed worker queue; or
- build ClawDeck UI.

Those exclusions keep the first vertical slice small and verifiable. Phase 9
proves parity. Phase 10 performs the one authority cutover and deletion.
