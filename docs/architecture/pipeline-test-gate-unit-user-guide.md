# Unit Test Gate User Guide

Status: authoritative unit-test configuration after Phase 10

## Purpose

This guide explains how a project declares unit tests for the new provider-based
test gate. It defines every field, result, error, and supported extension.

Phase 10 made this the only supported unit-test path. The old `test_suites`
unit entry, `test_config.unit`, `test_cmd`, thresholds, npm discovery, and
console parser are deleted. A request that names legacy unit is rejected.

## The basic model

One unit-test instance is one test node. A repository can have any practical
mix of tools:

```text
frontend JavaScript tests
backend Python tests
shared Go tests
```

Each node runs independently unless it declares a dependency. Independent
nodes can run at the same time within the operator limit. One failure does not
stop another independent node.

Nova creates the plan and makes the final gate decision. Buster runs the plan,
stores evidence, and reports facts.

## Command fields

### `executable`

`executable` is a stable name from the Buster operator catalog. It is not a
host path and it is not a command string.

```json
"executable": "pytest"
```

The operator can map `pytest` to `/usr/local/bin/pytest`. A project cannot run a
program that the operator did not approve.

### `args`

`args` is the exact argument array sent to the program.

```json
"args": ["--junitxml=reports/unit.xml", "tests"]
```

Each item is one literal value. Values such as `&&`, `$HOME`, `*`, and spaces
do not receive shell interpretation. The provider never starts a shell.

### `workingDirectory`

`workingDirectory` is the repository folder where the program starts. The
default is the repository root, written as `.`.

```json
"workingDirectory": "backend"
```

The path must be relative and must remain inside the attempt repository.
Absolute paths, `..`, empty path parts, and symbolic-link escapes are invalid.

Every attempt receives a private writable repository copy. A test can create
reports, caches, and compiled files. These changes cannot alter Nova's source
checkout or another attempt.

### `environment`

The optional environment contains literal non-secret values:

```json
"environment": { "APP_MODE": "test" }
```

Buster adds `CI=true`, a safe operator-controlled `PATH`, and private `HOME` and
`TMPDIR` folders inside the attempt. Buster does not copy its ambient
environment. Protected names for credentials, loaders, Git, SSH, cloud
services, runtime control, and platform internals are rejected. Put setup in
committed project files when a tool needs more configuration.

The safe `PATH` lets test tools start normal child programs. It does not let the
project select the first executable that Buster starts. That executable must
still be in the operator catalog.

## Provider and report-format support

`kubeclaw.direct-command@1` is the provider. It can start any operator-approved
unit-test tool, such as pytest, Go, Cargo, dotnet, Maven, Gradle, npm, pnpm, or
another test executable. These tools are not separate Buster providers merely
because they use different programming languages.

JUnit is a **report format**, not the test provider. Many test tools can write
JUnit XML directly or through their normal reporter plugin. One JUnit adapter
therefore gives the common gate detailed test counts, case names, failures,
errors, skips, and durations across many languages.

Node 24's built-in `--test-reporter=junit` output is supported directly,
including its direct-`testcase` container form. No converter is required.

Phase 8 intentionally provides only:

- `junit-required` for detailed structured unit-test facts; and
- `exit-code` for tools that cannot create JUnit.

It does not provide TAP, SARIF, TRX, Go JSON, pytest JSON, or framework-specific
console parsers out of the box. Adding all formats now would increase adapters,
tests, conflict rules, and maintenance without a proved consumer. A later suite
or real project can add a replaceable report adapter without changing the
direct-command provider, test graph, evidence store, or Nova authority.

Add another built-in adapter only when all of these are true:

1. a real accepted suite or project cannot reasonably produce JUnit;
2. exit-code mode loses facts required by its parity ledger or gate policy;
3. the format has a stable machine-readable specification;
4. original source reports remain evidence; and
5. adapter contracts and real malformed-report tests are added.

This keeps the default small without locking the system to JUnit.

## Result modes

### `junit-required`

Use this mode when the test tool can create JUnit XML.

```json
{
  "resultMode": "junit-required",
  "reports": [{
    "id": "backend-unit",
    "format": "junit",
    "path": "reports/unit.xml",
    "mediaType": "application/junit+xml"
  }]
}
```

Every report is required. Buster saves the original XML and then sends it to
the registered JUnit adapter. A report path is relative to `workingDirectory`.

The attempt fails when the process exits nonzero or any JUnit case fails or has
an error. The attempt is an execution error when a required report is missing,
malformed, unsafe, oversized, or contains zero cases.

### `exit-code`

Use this explicit fallback only when the tool cannot create JUnit:

```json
{
  "resultMode": "exit-code",
  "reports": []
}
```

Exit code zero records one passed command check. A nonzero exit code records
one failed command check. This mode does not claim a known framework test count.
It never replaces a missing JUnit report automatically.

## Complete blocking example

The tracked example is
`contracts/pipeline-test-gate/v1/examples/unit-suite-blocking.json`.

Its important form is:

```json
{
  "suites": {
    "unit": {
      "uses": "kubeclaw.unit-suite@1",
      "add": {
        "backend": {
          "uses": "kubeclaw.direct-command@1",
          "mode": "blocking",
          "concurrencyGroup": "unit",
          "config": {
            "executable": "pytest",
            "args": ["--junitxml=reports/unit.xml"],
            "workingDirectory": "backend",
            "resultMode": "junit-required",
            "reports": [{
              "id": "backend-unit",
              "format": "junit",
              "path": "reports/unit.xml",
              "mediaType": "application/junit+xml"
            }]
          }
        }
      }
    }
  },
  "concurrencyLimits": { "unit": 2 }
}
```

`blocking` means a final failure blocks the gate. Use `advisory` when a failure
must remain visible but must not block the gate.

## Several tools in one repository

Add one node for each independent command. The suite does not assume npm or one
language.

```json
"add": {
  "web": {
    "uses": "kubeclaw.direct-command@1",
    "config": {
      "executable": "npm",
      "args": ["test", "--", "--reporter=junit"],
      "workingDirectory": "web",
      "resultMode": "junit-required",
      "reports": [{
        "id": "web-unit", "format": "junit",
        "path": "reports/unit.xml",
        "mediaType": "application/junit+xml"
      }]
    }
  },
  "service": {
    "uses": "kubeclaw.direct-command@1",
    "config": {
      "executable": "go",
      "args": ["test", "./..."],
      "workingDirectory": "service",
      "resultMode": "exit-code"
    }
  }
}
```

The existing runner supplies dependencies, bounded concurrency, timeout,
cancellation, retries, attempt retention, unstable status, and final summaries.
There is no unit-specific scheduler.

## Coverage

Coverage is a separate result. A unit test can pass while its coverage budget
fails.

The direct-command node declares an LCOV output:

```json
"coverage": [{
  "id": "javascript-coverage",
  "format": "lcov",
  "path": "coverage/lcov.info",
  "mediaType": "text/lcov"
}]
```

A separate node receives that immutable artifact:

```json
"coverage": {
  "uses": "kubeclaw.coverage-budget@1",
  "mode": "advisory",
  "config": { "minimumLinePercent": 80, "combine": true },
  "inputs": {
    "coverage-1": {
      "from": "javascript",
      "output": "coverage-1",
      "mediaType": "text/lcov"
    }
  }
}
```

`combine: true` merges compatible LCOV line records by source file and line.
`combine: false` applies the minimum to the weakest input. A blocking coverage
node must set `minimumLinePercent`. Nova rejects a blocking node without this
value before it sends work to Buster. An advisory node can omit the value to
report facts only.

See the complete tracked example at
`contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json`.

## Fixed result rules

The rules are deterministic:

1. A start failure is an execution error.
2. A timeout is `timed_out`.
3. A requested cancellation is `cancelled`.
4. A nonzero process exit fails a completed attempt.
5. A failed or errored JUnit case fails a completed attempt.
6. A missing, malformed, unsafe, or oversized required report is an error.
7. Zero JUnit cases is an error.
8. Logs cannot override the exit code or report.
9. A successful retry is unstable and keeps every attempt.
10. Coverage never changes the source unit-test result.

## Evidence

The gate retains:

- ordered stdout and stderr in the full runner log;
- each original declared JUnit report;
- each declared LCOV file;
- normalized JUnit facts;
- result, identity, timing, exit, resource, digest, and receipt data; and
- every retry attempt.

Console text is evidence but is not a structured test result.

## Common errors

- `DIRECT_COMMAND_EXECUTABLE_DENIED`: the operator catalog does not contain the
  requested name.
- `DIRECT_COMMAND_PATH_INVALID`: a declared path is absolute, empty, or uses
  `..`.
- `DIRECT_COMMAND_ENVIRONMENT_DENIED`: a protected or secret-like environment
  name was declared.
- `DIRECT_COMMAND_REPORT_REQUIRED`: JUnit mode has no report.
- `TEST_REPORT_ZERO_CASES`: JUnit parsed correctly but contained no cases.
- `COMMAND_OUTPUT_LIMIT_EXCEEDED`: stdout and stderr exceeded the attempt limit.
- `COMMAND_TIMEOUT`: the command exceeded its wall-time limit.
- `COVERAGE_LCOV_INVALID`: an LCOV input is malformed.
- `COVERAGE_INPUT_DIGEST_MISMATCH`: an input changed after it was stored.

Do not fix these errors by enabling a shell, parsing console output, widening
paths, or exposing secrets. Correct the project declaration or operator catalog.

## Current authority boundary

Declare unit tests only in `.swarm/pipeline.json`. Nova resolves these
declarations and makes the gate decision. Buster executes the plan and returns
facts and evidence.

Do not use this removed form:

```json
{
  "test_suites": ["unit"],
  "test_config": { "unit": { "test_cmd": "npm test" } }
}
```

There is no compatibility fallback. Convert each old command into an explicit
unit instance with `executable`, `args`, `workingDirectory`, result mode,
policy mode, and limits. Use the examples in this guide.
