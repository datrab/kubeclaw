# Pipeline Test-Gate Phase 6-E Audit

Status: complete
Date: 2026-08-09

## Purpose

Phase 6-E connects declared report artifacts to the report-adapter runtime.
It keeps the provider verdict separate from normalized report facts.

## Declaration and Resolution

A provider registration declares its supported report formats. A provider
result names each report by evidence ID and format. Each source must be
declared as `test-report` evidence.

Nova resolves one exact adapter registration for every provider format. It
stores the immutable adapter package, digest, format, and contract version in
the plan node. A missing or ambiguous adapter stops plan resolution. Operator
policy can select one exact registration for an ambiguous format.

## Execution

Buster always retains a declared report. It then runs the exact adapter from
the resolved plan. The adapter receives the stored artifact through the
isolated Phase 6-C runtime.

The worker adds normalized reports only after evidence collection. It checks
the final result size again. The reports then enter the same durable worker
result as the provider result. Buster copies these durable facts to the public
attempt result.

## Verdict Rule

Normalized report facts do not change the provider outcome. A passed provider
can have a report that contains failed cases. The gate can use those facts in
a later policy phase.

An adapter failure is an execution error. The original report remains durable
so a user can diagnose the problem or replay normalization.

## Bounds

- A provider can declare at most 32 report formats.
- Reports use existing artifact file and byte limits.
- Report detail uses the Phase 6-A limits.
- All normalized reports share one 16 MiB result budget. Each adapter receives
  only the remaining budget.
- Adapter work uses the Phase 6-C process, memory, CPU, file, output, and time
  limits.
- Worker finalization has its own bounded deadline.

## Proof

The plan-runner proof covers:

- Exact adapter identity in the resolved plan.
- Explicit report evidence and format declaration.
- Original report retention.
- Isolated adapter execution.
- Normalized report facts in the attempt result.
- Normalized report facts in the durable worker result.
- Provider verdict preservation.
- Adapter failure as an execution error.
- Original evidence retention after adapter failure.

## Decision Audit

- D-090 is implemented. Providers return facts. The test-agent remains the
  quality-decision owner.
- D-108 is preserved. Report errors are separate facts, not a new pipeline
  outcome.
- D-109 freezes exact adapter identity and makes normalization durable.
- D-106 is preserved. Report evidence and normalized facts use durable,
  identity-linked records.

## Review Findings

Terra found that the first implementation gave each adapter the complete
16 MiB report-result budget. This was valid. Buster now tracks the remaining
budget across all reports and stops before another adapter can exceed it.

Terra also requested compatibility defaults for old version-1 provider and
plan records. This finding was not accepted. The test-gate roadmap requires an
atomic replacement of the closed runtime. No production provider contract or
resolved plan is active yet. Keeping two forms would add an implicit legacy
path before the first provider cutover. The schema change remains an explicit
pre-cutover contract update.

Terra later reported that the larger worker-result envelope could allow a raw
provider result to use the report reserve. This finding was not accepted. The
runner measures the encoded `ProviderResultV1` immediately after provider
execution and rejects it against `maximumProviderResultBytes` before it creates
the worker specialist result. The larger worker envelope applies only to the
combined durable result after this independent check.
