# Independent WFINAL correction review - 2026-10-14

Verdict: **NOT ACCEPTED** for bounded WFINAL-01/WFINAL-02 closeout at definition scope.

This review is limited to the author corrections for WFINAL-01, WFINAL-02 and D116/D115 navigation. It does not perform whole-C0 acceptance, C1-C6 implementation acceptance or native/runtime execution.

## Findings

1. **WFINAL-01 remains ambiguous because the lock-variant profile also changes `effectLockTtlMs`.**

   The correction does add explicit Core-owned `settings.runtimeLocks` leaves in `field-activation-partition-02/nova-core-owner.schema.json` for `journalAppendLockTimeoutMs`, `runMutationLockTtlMs` and `runMutationLockRenewEveryMs` (lines 31-69). The corrected fixture also carries those leaves in `local-A` with 5,000ms / 60,000ms / 20,000ms (lines 97-100), and in `local-B-lock` with 8,000ms / 90,000ms / 30,000ms (lines 196-199).

   However, `local-B-lock` also changes `settings.platform.effectLockTtlMs` from the preserved `local-A` value of 300,000ms (line 60) to 150,000ms (line 159), while the correction README says the lock-variant profile changes only the three Core lock leaves and that the policy is not a projection from `effectLockTtlMs` (whole-c0-final-corrections README lines 22-27). That makes the WFINAL-01 ALT/future binding non-isolated and leaves the exact confusion WFINAL-01 asked to close: a future lock-profile comparison cannot prove the three new Core lock leaves are the only changed lock policy in the selected profile.

2. **WFINAL-02 is corrected at definition scope.**

   The compiler schema explicitly requires separate `projectCompiler.executionGroups.cumulative.timeoutMs`, `.source.timeoutMs` and `.demo.timeoutMs` leaves (owned-compiler schema lines 113-165). The corrected complete Core profiles preserve the current values: cumulative 1,800,000ms, source 120,000ms and demo 120,000ms, while `projectCompiler.execution.timeoutMs` remains a separate module-stage policy (residual-core-owner-fixtures.corrected.json lines 81-95, 180-194, 279-293 and 378-392). The correction README also states the non-inheritance rule and future case binding for missing/ALT/mutant/current-source cases (lines 40-68). No material WFINAL-02 definition-scope blocker was found.

3. **D116/D115 navigation correction is present.**

   `PACKAGE-FIELD-CASE-JOINS.json` still defines both document labels, with `D116` as the original `REPORT.md` and `D115` as the closing `FOLLOWUP.md`. The remaining RBR material finding references now point to `D115#` for RBR-01, RBR-02 and RBR-03 (`.remaining.materialFindings[0..2].ref`), so the closure navigation is corrected.

## Notes

`PACKAGE-GENERATION-CONTRACT.json` records the intended receiving rule that WFINAL-01 lock policies and WFINAL-02 helper groups are explicit Core-owned leaves, not inferred from `effectLockTtlMs` or module execution timeout (lines 214-232). That statement is consistent with WFINAL-02, but WFINAL-01 remains blocked by the contradictory `local-B-lock` fixture value above.

