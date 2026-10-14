# Independent WFINAL correction follow-up - 2026-10-14

Verdict: **ACCEPTED** bounded correction.

This follow-up is limited to the corrected Core owner fixture, the package generation contract hash, and the WFINAL-01 ambiguity reported in the prior review. It does not revisit WFINAL-02/D115 except for checking that this correction did not disturb the bounded closeout.

## Checks

1. **`local-B-lock` now isolates the ALT lock profile change.**

   In `field-activation-partition-02/residual-core-owner-fixtures.corrected.json`, `local-A` preserves `settings.platform.effectLockTtlMs: 300000` and `local-B-lock` now also preserves `settings.platform.effectLockTtlMs: 300000` (lines 60 and 159). A structural comparison of `local-A.settings` to `local-B-lock.settings` shows only the three `settings.runtimeLocks` leaves differ: `journalAppendLockTimeoutMs` 5000 -> 8000, `runMutationLockTtlMs` 60000 -> 90000, and `runMutationLockRenewEveryMs` 20000 -> 30000 (lines 97-100 and 196-199). This matches the correction README's statement that the lock-variant profile changes only those Core lock leaves.

2. **`PACKAGE-GENERATION-CONTRACT.json` records the actual completeOwner bytes.**

   The contract's `core.completeOwner.sha256` is `420d2a5f32fe75700f1503c5b2775a0a972953f38df547008c5fe5db63140fa0` for `field-activation-partition-02/residual-core-owner-fixtures.corrected.json` (lines 225-228). Recomputing `sha256sum` over the fixture produced the same digest.

3. **Prior WFINAL-01 finding is closed.**

   The prior blocker was specifically that `local-B-lock` also changed `settings.platform.effectLockTtlMs`, preventing proof that the ALT lock profile changed only the new Core lock leaves. That contradiction is gone, and the contract still states WFINAL-01 lock policies are explicit Core-owned leaves, not inferred from `effectLockTtlMs` (lines 230-231). No regression was observed in the bounded WFINAL-02/D115 scope during this recheck.

## Findings

No remaining bounded correction findings.
