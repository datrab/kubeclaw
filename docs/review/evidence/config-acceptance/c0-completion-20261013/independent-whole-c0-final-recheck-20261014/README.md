# Independent whole-C0 final recheck - 2026-10-14

Reviewer: `/root/whole-c0-final-recheck`, independent bounded recheck after the
WFINAL-01/WFINAL-02 corrections and follow-up. Checkout HEAD:
`1424d91edc40da54588ad87398c7fffad79a8fa7`.

Verdict: **NOT ACCEPTED** for whole C0/package definition scope.

This review did not implement C1-C6, run production hosts, deployments, paid
evals, native implementation cases or C1-C6 runtime cases. It reviewed the goal,
current definition, package roster/plan/generation contract, prior whole-C0
finding, WFINAL correction evidence and referenced source-specific contract
package at definition/evidence scope.

## WFINAL correction status

WFINAL-01 is corrected at bounded definition scope. The Core owner schema and
complete owner fixture now define explicit `settings.runtimeLocks` leaves for
`RT-CORE-JOURNAL-LOCK`, `RT-CORE-RUN-LOCK-TTL` and
`RT-CORE-RUN-LOCK-RENEW`. `local-A` preserves 5000 / 60000 / 20000ms,
`local-B-lock` changes only those three leaves to 8000 / 90000 / 30000ms, and
both profiles preserve `settings.platform.effectLockTtlMs: 300000`. The
generation contract also states these lock policies are explicit Core-owned
leaves, not projections from `effectLockTtlMs`.

WFINAL-02 is corrected at bounded definition scope. The Core compiler schema and
complete profiles define separate
`projectCompiler.executionGroups.{cumulative,source,demo}.timeoutMs` leaves with
the preserved 1800000ms / 120000ms / 120000ms values. These are distinct from
`projectCompiler.execution.timeoutMs` and are covered by the correction README's
future missing/ALT/mutant/current-source case binding.

D116/D115 navigation is corrected for the RBR closure references. The package
roster defines D116 as the original not-accepted report and D115 as the closing
FOLLOWUP, and `remaining.materialFindings[0..2].ref` now points to `D115#`.

## Material finding

### WRECHECK-01 - package document registry is stale after final corrections

`PACKAGE-FIELD-CASE-JOINS.json` still records stale byte hashes for three
referenced package documents. A fresh traversal of all `Dnnn#` references found
140 referenced document labels and no missing document labels, but recomputing
the 228 document registry hashes produced three mismatches:

- `D002` (`PACKAGE-GENERATION-CONTRACT.json`) registry hash
  `56fb29e008a2e063f663d587df9a792c93ca432d9dada8b6b6bde00edce0eb1f`, actual
  hash `80aeca887f7f77a6eddaa1082e4649beed6e3503f20f4b516ba5002c749db8ba`.
- `D003` (`PACKAGE-PLAN.md`) registry hash
  `cf30950a41b4c94b356fe51f0e764f63fa43386f8f8bb83b5215bc9b603ce3f5`, actual
  hash `812daf18ae1b4cd70379c5f6c223b4ae459c7f3b99f14319b4c8f3aac94a9240`.
- `D105` (`field-activation-partition-02/residual-core-owner-fixtures.corrected.json`)
  registry hash `7ac6a92d08ec6823e7ceed463ca7d2ada1fa4f95861586483e17456d4c9af859`, actual
  hash `420d2a5f32fe75700f1503c5b2775a0a972953f38df547008c5fe5db63140fa0`.

This is material for whole package acceptance because the final roster presents
hashed D-reference navigation as the exact package reference mechanism. The stale
hashes cover the integrated generation contract, the package plan and the
corrected Core owner fixture that closes WFINAL-01/WFINAL-02. A reviewer cannot
accept the whole package while its own registry points at pre-correction bytes for
the documents carrying the final corrections.

Smallest correction: refresh the D002, D003 and D105 registry entries in
`PACKAGE-FIELD-CASE-JOINS.json`, then rerun the bounded registry/reference
readback and recheck that the WFINAL corrections and D115/D116 navigation still
resolve to the same intended documents. No C1-C6 implementation or native case
execution is required for this correction.

## Whole gate result

C0-A through C0-E are **not accepted** as a package solely because of
WRECHECK-01. The bounded semantic corrections for WFINAL-01 and WFINAL-02 are
accepted, and no additional semantic counterexample was found during this
bounded whole-package recheck. The rejection is the package integrity failure in
the current exact-reference roster, not a request to reopen already closed RBR,
PT, CFX, QB, SA or WFINAL semantic scopes.

C1-C6 implementation remains unauthorized. `implementationAuthorization` remains
`null`; production/runtime/native implementation cases remain not-run until the
user explicitly approves the corrected package.
