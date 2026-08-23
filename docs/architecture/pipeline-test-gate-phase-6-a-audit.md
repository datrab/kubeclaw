# Pipeline Test-Gate Phase 6-A Audit

Status: complete
Date: 2026-08-09

## Purpose

Phase 6-A audits the shared report contract before report-adapter runtime work
starts. It keeps the contract small and preserves the facts that later tools
need.

## Current-State Findings

The Phase 2 contract already defined adapter registration and result objects.
It did not yet implement adapter behavior.

The audit found these contract gaps:

- JUnit test errors were forced into `failed` or lost.
- Cases did not identify their suite or class.
- The contract allowed 100,000 inline cases and 10,000 findings.
- A consumer could not tell whether case or finding details were truncated.
- The common test counts could not add report errors without changing every
  provider result.

## Implemented Contract

Report facts now use a report-specific count object:

- `total`
- `passed`
- `failed`
- `errored`
- `skipped`

A report case has a suite path and an optional class name. Report cases use a
report-only outcome. Pipeline outcomes do not change.

The normalized result records whether case, report-finding, or case-finding
lists were truncated and how many items were omitted. Contract limits are
5,000 cases, 5,000 top-level findings, 100 findings per case, and 64 suite-path
elements. Runtime limits can be lower.

The source report remains a durable artifact. The normalized result does not
replace it.

## Architecture Check

- D-077 remains unchanged for provider and attempt outcomes.
- D-078 remains unchanged because the source report is explicit evidence.
- D-090 remains the report-adapter authority.
- D-108 preserves report errors without adding pipeline workflow state.
- The adapter returns facts and does not apply Nova gate policy.

## Proof

- The JSON schema and TypeScript types use the same report facts.
- Contract fixtures include an errored case.
- Unknown fields still fail validation.
- Semantic validation rejects impossible count totals, contradictory
  truncation fields, and duplicate case IDs.
- TypeScript compilation and the report contract checks must pass before
  Phase 6-B starts.
