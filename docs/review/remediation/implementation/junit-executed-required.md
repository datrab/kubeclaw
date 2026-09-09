# Blocking JUnit requires executed cases

PATH-T11-001: a nonempty report containing only skipped cases previously passed
both Buster finalization and Nova import. Blocking direct-command nodes using
`junit-required` now require at least one passed, failed, or errored JUnit case.
Buster returns failed with `TEST_REPORT_NO_EXECUTED_CASES` in its summary when
all cases are skipped. Counts retain their actual values: missing execution does
not invent a failed test. Existing command-exit failure accounting is unchanged.
Successful summaries report passed and skipped counts separately. Zero-case
reports retain the existing `TEST_REPORT_ZERO_CASES` execution error.

The runner calls the extracted production `report-finalizer.ts` after actual
report adaptation and keeps its existing count validation. Nova independently
checks the final attempt's JUnit reports for blocking required execution before
its review-agent branch. An old or contradictory passed outcome, missing report,
or zero/all-skipped report cannot become a pass or an evidence-review override.
Advisory nodes and non-required reporting keep their existing semantics. This
change does not prohibit optional individual skipped cases or conditional node
skips and does not alter result schemas, evidence digests or receipts.

## Evidence

`npm run verify:test-gate:remote-import` passes, including the newly wired
`node tests/verification/contracts/check-junit-executed-required.mts` regression.
Actual Node child test processes write JUnit files for all-skipped, mixed
passed/skipped, full pass and genuine failed tests. The original JUnit parser
reads those real file bytes and the runner's production finalizer applies the
policy. Explicit XML input vectors cover zero cases and an errored case; they
are distinguished from Node's reporter output (Node reports an empty test file
as a successful file-level case). Zero cases still fail Buster finalization.

The same reports supply explicit remote contract vectors, including contradictory
passed outcomes, through actual localhost HTTP, the original
`HttpRemotePlanTransport`, `NovaRemoteGateImporter` and `FileNovaGateImportStore`.
Blocking all-skipped/zero reports fail without review requests; advisory skips
pass; mixed/full passes pass; failures/errors fail blocking decisions. Pipeline
stage output requests a fix for failure. Reopening the real store recovers the
same decision digest. These are contract-boundary proofs, not fabricated native
Buster executions or production authority receipts.

Also passed: unchanged `check-pipeline-remote-result-import.mts` (seven decision
scenarios), Nova TypeScript, shared plugin-runtime TypeScript, canonical ESLint
for the new regression, and scoped diff whitespace checking. Canonical ESLint
cannot individually discover the new Buster helper through its project service;
shared plugin-runtime TypeScript checks its imported production source.

## Native gate still open

Unchanged `check-pipeline-junit-report-adapter.mts` fails locally with
`REPORT_ADAPTER_STDIN_FAILED` caused by `write EPIPE` in the real supervised
adapter path. Unchanged `check-pipeline-direct-command-provider.mts` fails its
first native invocation with exit 70 instead of zero. This host previously
lacked native process-observation and delegated-cgroup prerequisites. Neither
failure is skipped or replaced with a mock executor. Full direct-command →
native adapter → runner finalization → Nova execution remains unverified here.
No CI, cluster operation, deployment or external message was executed.
