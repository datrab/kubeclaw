# Recovery Runbook

## Recovery Procedure

1. Stop concurrent mutation of the affected run.
2. Verify the pinned graph and package snapshot digests.
3. Replay lifecycle, effect, wait, state, and observer journals.
4. Reconcile any accepted effect without a terminal provider receipt.
5. Resume through the v2 recovery API with the original package snapshot.

## Verification

Run:

```bash
node tests/verification/contracts/check-plugin-system-v2-resume.mjs
node tests/verification/contracts/check-plugin-system-v2-phase7.mjs
```

## Escalation

Do not guess after digest mismatch, journal corruption, stale fencing tokens, or
an ambiguous externally visible effect. Preserve evidence and require operator
reconciliation.
