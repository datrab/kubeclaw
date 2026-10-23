# Whole-C0 final review corrections — 2026-10-14

This correction addresses the two material findings from
`independent-whole-c0-final-review-20261014/README.md` without authorizing any
C1-C6 implementation or running production/native cases.

## WFINAL-01 — Core lock policies

The selected Nova Core owner now carries explicit `settings.runtimeLocks` leaves
in `field-activation-partition-02/nova-core-owner.schema.json` and
`field-activation-partition-02/residual-core-owner-fixtures.corrected.json`:

- `journalAppendLockTimeoutMs` covers original field `RT-CORE-JOURNAL-LOCK` and
  the `FileJournal` append mutex at `skills/nova/core/state/journal.ts:30-37`.
- `runMutationLockTtlMs` covers original field `RT-CORE-RUN-LOCK-TTL` and the
  run mutation lock acquisition/renewal TTL at
  `skills/nova/core/execution/run-mutation.ts:14-15`.
- `runMutationLockRenewEveryMs` covers original field
  `RT-CORE-RUN-LOCK-RENEW` and the renewal interval at
  `skills/nova/core/execution/run-mutation.ts:15`.

The preserved current profile values are 5,000ms journal append lock timeout,
60,000ms run mutation TTL and 20,000ms renewal. The lock-variant profile changes
only these Core lock leaves to 8,000ms, 90,000ms and 30,000ms respectively. The
semantic admission rule for implementation is `runMutationLockRenewEveryMs <
runMutationLockTtlMs`, with all values safe positive native timer integers. This
is a Core owner policy, not a projection from `effectLockTtlMs`.

Future case binding for the nine original cases:

- `*-MISSING`: omit the selected `runtimeLocks` leaf before Core activation and
  expect rejection before any journal append, run mutation lock acquisition or B
  recovery mutation.
- `*-ALT`: use the `local-B-lock` values above and observe the changed lock
  timeout/TTL/renewal values at the named callers while preserving original A
  grants, history and fixed Eval inputs.
- `*-MUTANT`: equal-old-author, fallback-to-default and foreign owner attempts
  remain rejected even when the numeric value equals the preserved current value.

## WFINAL-02 — compiler timeout helper groups

The owned compiler schema now carries explicit
`projectCompiler.executionGroups.{cumulative,source,demo}.timeoutMs` leaves, and
all complete Core profiles preserve the current effective helper values:

- `RT-CUMULATIVE-TIMEOUTMS`: 1,800,000ms for `cumulativeStages` final lint,
  review, test and summary helpers at `skills/nova/project/coverage.ts:44-66`.
- `RT-PROJECT-SOURCE-EXECUTION-TIMEOUTMS`: 120,000ms for source preflight,
  architecture review/approval and blueprint sync at
  `skills/nova/project/source.ts:48-65`.
- `RT-PROJECT-DEMO-EXECUTION-TIMEOUTMS`: 120,000ms for demo candidate,
  delivery and ready helpers at `skills/nova/project/demo.ts:36-39`.

These three groups are distinct from `projectCompiler.execution.timeoutMs`, which
continues to describe the module-stage execution policy from
`runtime/batch-11-project-compiler`. No source/demo helper inherits the
1,800,000ms module/cumulative timeout by implication.

Future case binding for the twelve original cases:

- `*-MISSING`: omit the exact helper group before graph publication and expect a
  validation rejection before persisted graph or StageExecutor activation.
- `*-ALT`: supply a whole A/B Core profile with only the named helper timeout
  changed and observe the emitted helper stages carrying the changed timeout.
- `*-MUTANT`: old author, missing selected Core profile, fallback-to-default and
  unsafe timer values reject before effect.
- `*-CURRENT-SOURCE-DEFINITION`: assert the current source helper, stage IDs,
  timeout value and immutable graph/history receipt for each group.

## D115/D116 navigation

`PACKAGE-FIELD-CASE-JOINS.json` now points the remaining RBR closure material
finding references to `D115#`, the final closing FOLLOWUP. `D116#` remains the
original not-accepted report and is not used as the closure reference.

## Updated contract identity

`PACKAGE-GENERATION-CONTRACT.json` was refreshed to the new schema and complete
owner hashes and records the explicit lock and helper-group receiving rules. This
is still definition-only C0 work: native/runtime cases remain not-run and
`implementationAuthorization` remains `null`.
