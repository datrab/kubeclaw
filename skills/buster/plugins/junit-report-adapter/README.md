# JUnit Report Adapter

This provided adapter converts one saved JUnit XML report into the common
KubeClaw report facts.

It accepts:

- `application/junit+xml`
- `application/xml`
- `text/xml`

It reports exact totals for passed, failed, errored, and skipped test cases.
It keeps the first configured number of case details. It records how many case
or finding details it omitted.

The adapter supports a root `testsuite` or `testsuites` element. It supports
nested suites, test durations, failures, errors, skipped tests, file names, and
line numbers used by common JUnit producers.

It accepts both common nesting forms:

- `<testsuites><testsuite><testcase>...`; and
- Node's built-in reporter form, `<testsuites><testcase>...`.

The second form was proved with the real Node 24 test runner during unit parity
work. Direct cases receive the stable suite path `testsuites` when the container
does not declare a name.

The adapter does not decide whether the pipeline passes. It does not change or
delete the original XML report. Buster stores that report as evidence.

For safety, the adapter rejects document types, custom entities, malformed
UTF-8, invalid XML 1.0 characters and comments, non-header processing instructions, malformed XML, excessive XML depth,
excessive tag size, and invalid durations.
Case durations use decimal seconds and cannot exceed 30 days.

There is no project configuration. A provider declares a JUnit report. The
resolved test plan selects this adapter or another registered JUnit adapter.

Attributes require XML whitespace (space, tab, carriage return, or line feed)
between their quoted values and subsequent names. Missing separators and Unicode
spacing outside that set are rejected. Validation continues beyond capture caps;
truncating retained cases never makes malformed XML acceptable.
