# Suite 12 E2E Phase 9 parity plan

## Purpose

Give every legacy behavior, accepted improvement, and removed defect one stable item and executable proof.

## Method

1. Freeze the legacy source at parent revision `f777c4370`.
2. Inventory configuration, execution, result, error, cancellation, and artifact behavior.
3. Map each item to preserved, improved, or removed-defect.
4. Run real passing and failing Playwright tests.
5. Prove retries remain project-owned and a final failure is strict.
6. Verify counts from JSON data and reject zero tests.
7. Keep deployed production acceptance pending until the controlled final cycle.

## Required scenario evidence

The parity gate must name and execute these scenarios:

- Multiple independent tests run from the project config.
- One assertion fails, retries run, and an independent test still completes.
- A project-owned skipped test stays visible.
- Zero selected tests cause an execution error.
- The operator worker ceiling reduces a project request.
- Process, memory, CPU, output, report, result, attachment-file, attachment-byte, and total-time controls exist and fail closed.
- Cancellation stops the process group and removes temporary files.
- Unsafe project, config, report, and attachment paths fail closed.
- A signed remote job imports evidence and produces a Nova decision.
- Duplicate delivery returns the durable prior job instead of executing twice.
- A second provider-shaped record validates against the common E2E result contract.

## Comparison rules

Use the frozen legacy source only as evidence of old behavior. Do not execute deleted authority in the production route. Each ledger item must state preserved, improved, or removed-defect. A source-file citation alone is not proof. The parity checker binds every item to a named executable scenario or an accepted legacy-source fact.

## Workflow improvement check

After parity passes, review this plan against the observed defects. Add a required scenario when an audit or autoreview finds a behavior that the plan did not make explicit. Suite 12 added the common-result conformance case, independent continuation, duplicate delivery, generated-file exclusion, and per-attempt resource controls through this check.

## Exit criteria

All 30 items have named executable or controlled legacy proof. Counts and case identities agree. No item is blocked, deferred, inferred from source presence, or silently lost. Production acceptance remains the only pending item.
