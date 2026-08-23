# Unit Suite Migration Baseline

Status: Phase 1 complete; replacement not implemented
Implementation plan: `docs/architecture/pipeline-test-gate-implementation-plan.md`

## Purpose

This file records the current unit-suite behavior before replacement. Stable
`UNIT-*` IDs are the parity authority. The replacement can add behavior, but it
cannot omit a required ID.

An accepted design decision can require stricter behavior than the old suite.
Such an item uses the `improved` or `removed-defect` disposition during proof.

## Current Execution Path

1. Nova selects `unit` through `test_suites`.
2. The test-agent invokes `test.suite.execute` with a suite plan.
3. The adapter checks repository and suite allowlists.
4. The adapter archives committed `HEAD` content with `git archive`.
5. The Buster worker verifies and extracts the archive into an isolated run
   directory.
6. The worker calls the closed `runSuites` registry.
7. The unit suite discovers or selects a command and uses `execFile` without a
   shell.
8. The suite parses console output and creates a suite verdict.
9. The runner writes verdict files, telemetry, and a digest-bound receipt.
10. The test-agent reduces each suite result to a Boolean and a short summary
    before optional agent judgment.

## Current Configuration

- Selection: `test_suites` must include `unit`.
- Operator activation: `allowedSuites` must include `unit`.
- Project directory: `test_config.serve.project_dir`; default is the extracted
  repository root.
- Command: `test_config.unit.test_cmd`; the runtime default is `npm test`.
- Command form: the runtime accepts a string or an argument array. The project
  validator requires an explicit string when `unit` is selected. The normal
  validated project path therefore cannot use the runtime default and cannot
  use the runtime's argument-array form. This is inconsistent.
- Unit timeout: `test_config.unit.timeout_ms`; default is 60,000 ms.
- Suite timeout: `test_config.suite_timeout_ms`; required and also limits the
  unit timeout.
- Threshold: `test_config.unit.thresholds.max_failures`; optional numeric
  value.
- Finding limit: fixed at 30 in the unit implementation. It is not a project
  setting.

## Current Parity Inventory

### Selection, Input, and Isolation

- `UNIT-ACT-001`: Unit runs only when `unit` is selected.
- `UNIT-ACT-002`: The adapter rejects unit when the operator allowlist does not
  contain it.
- `UNIT-IN-001`: The worker receives a digest-checked archive of committed
  `HEAD` content.
- `UNIT-IN-002`: Archive paths, links, total size, and extracted size are
  bounded before execution.
- `UNIT-IN-003`: Repository-root values are relocated for the worker and cannot
  escape through `repo://` paths.
- `UNIT-ID-001`: Job, module, project, attempt, and idempotency identities flow
  through the remote execution path.
- `UNIT-ISO-001`: The runner uses a separate UID, cleared groups, no Linux
  capabilities, no-new-privileges, and a PID kill boundary outside test mode.
- `UNIT-ISO-002`: Unit receives no BuildKit or Kubernetes capability from its
  suite identity.
- `UNIT-ISO-003`: Sensitive Buster and Kubernetes environment values are absent
  from the test subprocess.

### Configuration and Discovery

- `UNIT-CFG-001`: The runtime default command is `npm test`. The current
  project validator makes this default unavailable through the normal
  validated project path because it requires an explicit string command.
- `UNIT-CFG-002`: An explicit command bypasses package.json discovery.
- `UNIT-CFG-003`: Direct executable and argument execution rejects empty
  commands, newlines, and null bytes. String commands also reject shell
  operators, command substitution, and unterminated quotes. Argument arrays
  preserve shell characters as literal arguments because no shell runs.
- `UNIT-CFG-004`: The working directory must stay inside an allowed repository
  path.
- `UNIT-CFG-005`: The runtime uses a finite configured unit timeout or the
  60,000 ms default. During normal suite execution it clamps that value to at
  least 1 ms and no more than the remaining suite deadline. The unit
  normalizer does not itself reject zero or negative finite values.
- `UNIT-CFG-006`: Enabling thresholds without numeric `max_failures` is an
  error.
- `UNIT-CFG-007`: `max_failures` accepts any finite number. The current runtime
  does not require a non-negative integer.
- `UNIT-DISC-001`: Missing package.json is a blocking failure when the default
  command is used.
- `UNIT-DISC-002`: Malformed package.json is a blocking failure.
- `UNIT-DISC-003`: Missing `scripts.test` is a blocking failure.
- `UNIT-DISC-004`: The exact npm default no-test stub is a blocking failure.
- `UNIT-DISC-005`: A discovered real test script permits execution of the
  default command.
- `UNIT-DISC-006`: Discovery treats a missing or false-valued `scripts.test`
  as missing. Other truthy values are converted to text. Only the exact
  trimmed npm stub is rejected.

### Process Execution

- `UNIT-EXEC-001`: The suite uses direct process execution and never invokes a
  shell.
- `UNIT-EXEC-002`: The subprocess receives a bounded environment with `CI=true`
  and `NODE_ENV=test`.
- `UNIT-EXEC-003`: Standard output and standard error are captured.
- `UNIT-EXEC-003A`: Parsing receives all captured standard output, then one
  newline, then all captured standard error. The old suite does not preserve
  the original order between the two streams.
- `UNIT-EXEC-004`: A zero exit code is success evidence.
- `UNIT-EXEC-005`: A nonzero exit code is failure evidence.
- `UNIT-EXEC-006`: The configured timeout and suite cancellation reach the
  subprocess.
- `UNIT-EXEC-007`: A timed-out or aborted command returns an execution error
  with a timeout finding.
- `UNIT-EXEC-008`: The worker bounds result output, terminates oversized jobs,
  and escalates termination from `SIGTERM` to `SIGKILL`.
- `UNIT-EXEC-009`: The unit child process uses Node `execFile` without an
  explicit `maxBuffer`. Buffer-limit and start failures are converted to a
  nonzero command result unless they are classified as killed or aborted.
- `UNIT-EXEC-010`: Standard input is opened as a pipe. The suite does not write
  input to it.

### Current Console Parsing

- `UNIT-PARSE-001`: The parser checks non-empty output lines from last to first.
  The last parseable JSON object with `ok: true` and a `checked` array becomes
  a passed `fixture_json` result. Its count is the array length.
- `UNIT-PARSE-002`: Jest summary text maps total, passed, failed, and skipped
  counts.
- `UNIT-PARSE-003`: Vitest summary text maps total, passed, failed, and skipped
  counts.
- `UNIT-PARSE-004`: Mocha summary text maps passing, failing, and pending
  counts.
- `UNIT-PARSE-005`: TAP summary text maps tests, pass, and fail counts.
- `UNIT-PARSE-006`: Pytest summary text maps passed, failed, errors, and skipped
  counts.
- `UNIT-PARSE-007`: Unknown output becomes one passed check for exit zero or one
  failed check for nonzero exit.
- `UNIT-PARSE-008`: Jest, Mocha, and pytest failure text can produce bounded
  finding details.
- `UNIT-PARSE-009`: Generic failure output uses the first non-empty output line
  and truncates it to 300 characters.
- `UNIT-PARSE-010`: Parser precedence is fixture JSON, Jest, Vitest, Mocha,
  TAP, pytest, and then the generic exit-code fallback.
- `UNIT-PARSE-011`: Detailed failure extraction returns at most 10 findings,
  although the unit verdict also applies a fixed outer limit of 30.

The accepted replacement does not keep console parsing as authoritative
structured evidence. JUnit or another registered report adapter replaces these
parsers. The generic command provider preserves exit-code and full-log fallback
behavior. These parity IDs therefore require `improved` proof, not copied
regular expressions.

### Verdict and Evidence

- `UNIT-RES-001`: Zero parsed tests is a failure.
- `UNIT-RES-002`: Nonzero exit is a failure even when no threshold exists.
- `UNIT-RES-003`: A failed completed run is marked critical.
- `UNIT-RES-004`: The verdict contains duration and passed, failed, skipped,
  and total counts when parsing provides them.
- `UNIT-RES-005`: Metadata records project directory, command, discovered test
  script, framework, exit code, mode, skipped count, and configured threshold.
- `UNIT-RES-006`: Missing-test findings use rule `unit-tests-required` and
  critical severity.
- `UNIT-RES-007`: Test failures use rule `unit-test` and serious severity.
- `UNIT-RES-008`: A timeout or suite abort returns `ERROR`, a serious `timeout`
  finding, no test counts, no command metadata, and `critical: false` in the
  unit verdict. Runner aggregation still treats every `ERROR` as a terminal
  gate failure.
- `UNIT-RES-009`: Discovery failures return `FAIL`, one failed check, critical
  severity, and only discovery metadata. Completed command results use the
  full command metadata listed in `UNIT-RES-005`.
- `UNIT-LOG-001`: Human-readable suite progress is written to standard output.
- `UNIT-LOG-002`: Structured suite log entries are appended when a result log
  directory exists.
- `UNIT-LOG-003`: The suite logs its own progress messages. It does not write
  the full child-process output to a declared log artifact.
- `UNIT-EVI-001`: The runner writes unit and aggregate verdict JSON files.
- `UNIT-EVT-001`: Suite-started, suite-completed, and quality-evidence events
  are emitted.
- `UNIT-RCP-001`: The adapter returns a result receipt with job identity,
  completion time, and SHA-256 result digest.
- `UNIT-ERR-001`: Unexpected suite exceptions become typed `ERROR` results.
- `UNIT-ERR-002`: Configuration and discovery exceptions that escape the unit
  function become critical runner `ERROR` results with the exception text and
  no findings.
- `UNIT-ERR-003`: A missing executable or another non-timeout `execFile` error
  becomes a completed nonzero command result and therefore a `FAIL`, not a
  runner `ERROR`.
- `UNIT-ERR-004`: Verdict-file and structured-log write failures are reported
  as non-blocking observability problems. They do not change the unit verdict.
- `UNIT-SCHED-001`: Unit has no old suite dependency and can run with other
  independent ready suites.

### Current Known Defects or Limits

- `UNIT-DEF-001`: `test_cmd` accepts an argument array at runtime, but project
  validation requires an explicit string. The same validation also prevents
  normal use of the runtime's `npm test` default.
- `UNIT-DEF-002`: Threshold-free mode can pass parsed failures when a tool exits
  zero. The replacement must use strict structured results.
- `UNIT-DEF-003`: `max_failures` normally cannot permit failures because common
  frameworks already return a nonzero exit. The setting has unclear authority.
- `UNIT-DEF-004`: The suite is named as one unit execution and cannot represent
  several independent test tools.
- `UNIT-DEF-005`: The suite assumes npm for default discovery.
- `UNIT-DEF-006`: Regex parsing is sensitive to tool output changes.
- `UNIT-DEF-007`: Full unit logs are not declared as explicit evidence files.
- `UNIT-DEF-008`: The test-agent reduces structured results to a Boolean and a
  2,048-character summary before reasoning.
- `UNIT-DEF-009`: Unit-specific direct tests do not cover discovery failures,
  parsers, nonzero exit, zero tests, timeout, cancellation, or output bounds.
- `UNIT-DEF-010`: The operator schema requires at least one suite capability,
  although unit itself declares no privileged suite capability.
- `UNIT-DEF-011`: Unit maps both cancellation and command timeout to the same
  timeout error. The replacement must preserve separate terminal states.
- `UNIT-DEF-012`: The unit timeout normalizer accepts zero and negative finite
  values. Normal suite execution hides this by clamping them to 1 ms.
- `UNIT-DEF-013`: The old examples contain shell-style command strings, but the
  runtime rejects shell operators. These examples do not describe executable
  current unit behavior.
- `UNIT-DEF-014`: Standard output and standard error are concatenated after the
  process ends. Their original order is lost.

These defects do not become parity requirements. Their replacements must follow
the accepted design decisions.

## Required New Unit Behavior

- `UNIT-NEW-001`: Support several independent unit-test instances in one
  module.
- `UNIT-NEW-002`: Support registrations for different tools and languages.
- `UNIT-NEW-003`: Keep a generic direct-command provider with executable and
  argument fields.
- `UNIT-NEW-004`: Use registered structured report adapters, with JUnit first.
- `UNIT-NEW-005`: Run all independent instances and return a full summary.
- `UNIT-NEW-006`: Apply blocking and advisory mode per instance.
- `UNIT-NEW-007`: Use one retry by default, preserve all attempts, and mark a
  retry pass as unstable.
- `UNIT-NEW-008`: Record duration, CPU time, maximum memory, log bytes, artifact
  bytes, and exit code or signal when available.
- `UNIT-NEW-009`: Save full logs and declared reports as explicit evidence.
- `UNIT-NEW-010`: Resolve provider schema, suite-template values, and project
  overrides before execution.
- `UNIT-NEW-011`: Store stable provider, test, attempt, package, and pipeline
  graph identities.
- `UNIT-NEW-012`: Keep coverage evaluation as a separate optional linked check.
- `UNIT-NEW-013`: Fail a blocking instance for any final failed test case.
- `UNIT-NEW-014`: Treat zero executed tests as a configuration or execution
  error.
- `UNIT-NEW-015`: Keep framework-native expected outcomes as case details. Do
  not add a gate-level expected-failure mode.

## Existing Proof Coverage

The package currently has three tests:

- `skills/buster/plugins/buster-suite-runtime/tests/protocol.test.ts` checks job
  parsing, archive digest checks, capability checks, and repository-path
  relocation.
- `skills/buster/plugins/buster-suite-runtime/tests/live-function.test.ts` runs
  one real Node test through the adapter and worker. It proves a success result,
  secret-environment isolation, receipt shape, terminal cancellation, and
  run-directory cleanup.
- `skills/buster/plugins/buster-suite-runtime/tests/package-boundary.test.mjs`
  checks the plugin boundary and declared capabilities.

Real-pipeline fixtures also inject passing, failing, and fail-once unit
commands. These mainly prove Nova retry and remediation behavior. They do not
fully prove the unit-suite contract.

## Unit Cutover Deletion Targets

- `skills/buster/plugins/buster-suite-runtime/src/runtime/suites/unit.ts`
- `skills/buster/plugins/buster-suite-runtime/src/runtime/suites/unit-output.ts`
- The unit import, registry entry, execution-order entry, and dependency entry
  in `runtime/runners/suite-runner.ts`.
- The unit name in the old `SUPPORTED_SUITES` protocol list.
- The unit entry in old `allowedSuites` configuration and related tests.
- `test_config.unit.test_cmd`, `thresholds.max_failures`, and unit-specific
  `test_suites` validation and scaffold logic.
- Old progress.json examples and project-setup documentation for unit.
- Real-pipeline fixtures that mutate the old unit configuration shape.
- Unit-specific paths through the legacy bridge after unit cutover.

Shared old runtime code remains until no unmigrated suite uses it. Each shared
path is deleted only at its final consumer's cutover.

## Phase 1 Exit Check

Phase 1 is complete when:

- Every current unit behavior has a stable parity ID.
- Known defects are separate from required behavior.
- Required accepted improvements are listed.
- Existing proof gaps are visible.
- Unit deletion targets are explicit.
- No runtime behavior was changed during the audit.
