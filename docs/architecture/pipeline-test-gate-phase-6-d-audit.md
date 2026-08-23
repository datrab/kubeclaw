# Pipeline Test-Gate Phase 6-D Audit

Status: complete
Date: 2026-08-09

## Purpose

Phase 6-D provides the first standard report adapter. It converts JUnit XML
into the common report facts from Phase 6-A.

## Registration

The adapter is the normal plugin registration:

- Package: `kubeclaw.junit-report`
- Adapter: `junit`
- Format: `junit`
- Contract: version 1

It has no special Buster registry entry. Another installed adapter can support
the same format. The resolved plan will select one exact registration.

## Preserved Facts

The adapter reports:

- Exact passed, failed, errored, and skipped counts.
- Test case name and class.
- Nested suite path.
- Test duration.
- Failure and error messages.
- Safe relative file and line details when present.

The adapter calculates counts from test cases. It does not trust optional suite
summary attributes. This prevents inconsistent producer summaries from changing
the imported facts.

## Bounded Detail

The adapter parses all test cases to keep exact counts. It stores only the
configured number of case and finding details. It records every omitted detail
count through the common truncation fields.

JUnit failures and errors are case findings. The per-case finding limit applies
to them. The separate report-level finding limit applies only to report-level
findings. This adapter does not create report-level findings.

The original JUnit file remains the authoritative full report artifact.

## XML Safety

The parser is dependency-free and runs in the Phase 6-C isolated runtime. It:

- Uses strict UTF-8 decoding.
- Allows one standard UTF-8 XML 1.0 header and rejects other processing instructions.
- Requires one JUnit root element.
- Requires balanced XML tags.
- Rejects document types and custom entities.
- Rejects unknown or invalid entity references.
- Rejects XML 1.0-invalid characters and comments.
- Limits XML depth and tag size.
- Limits captured failure text.
- Rejects invalid or unbounded durations.
- Allows at most one UTF-8 byte-order mark.

Case durations use decimal seconds and have a 30-day maximum. This keeps the
normalized timing facts finite and useful without affecting normal test runs.

It does not access files named by the XML.

## Packaging

The provided adapter is part of the Buster runtime role. Plugin inventory now
counts report-adapter registrations explicitly.

## Proof

The proof covers:

- A nested JUnit document.
- Passed, failed, errored, and skipped cases.
- JUnit and pytest-compatible structures.
- Namespaced element names.
- Durations, file names, and line numbers.
- Case and finding truncation.
- Safe entity decoding.
- Unsafe declaration and entity rejection.
- Malformed XML and invalid UTF-8 rejection.
- Registration discovery.
- Execution through the isolated Phase 6-C runtime.
- Original artifact identity preservation.
