# Buster durable shutdown failure ownership — bounded repair

Source baseline: `ba84cccf50a1f0ddff2507cf027b7298dba04dc0`, whose Buster service is unchanged from integration-84 `268bb72`. 2026-09-11. No finding count, status or register changes.

## Confirmed defect and correction

`skills/buster/engine/test-gates/remote-plan-service.ts` original lines 631–636 ignored rejected execution promises through `Promise.allSettled`. Original lines 654–657 removed completed executions; an execution that rejected before shutdown also had no rejection owner. Original lines 788–798 attempt to record ordinary failures; that terminal transition can itself fail.

The counterexample uses original registry discovery and plan resolution, original committed Git source archive and Ed25519 attestation, original job creation and real FileBusterPlanJobStore. The actual store quota admits accepted/running records but rejects a terminal record containing the error. A regular file at runtimeRoot triggers original `OBSERVABILITY_STORE_PATH_NOT_DIRECTORY` before archive extraction or provider construction. There are no replaced stores, execute hooks, child-process shims or native provider executions.

The service now retains only the first fatal execution rejection at the owned drain boundary. This closes existing readiness/admission/start behavior via `#stopping`, clears only the in-memory queue and leaves durable accepted/running records and runtime files intact. Other active executions retain their owners and may finish. Shutdown waits current work, then throws the retained error, including repeated shutdown calls after that execution left the active map. No unhandled rejection is left at that boundary.

BuildKit behavior is unchanged. `buildkit-readiness.ts` awaits `runDependencyProcess`, whose normal spawn, timeout and cancellation failures fulfill with structured results after process closure. A false readiness result alone is not a failed shutdown. The actual runtime caller in `remote-plan-runtime.ts` awaits service shutdown in its stop path, so this retained error can propagate to its caller.

## Verification

All commands below ran locally from the isolated checkout. Native provider, model, cluster, browser and database acceptance was not run.

- `node --test tests/verification/reliability/buster-shutdown-storage.test.mts` with original production source and final four tests: **3 fail, 1 pass**, exit 1. During-drain false success and before-drain unhandled rejection reproduced; the normal terminal control passed. `before-final.log` is the authoritative final baseline.
- `node --test tests/verification/reliability/buster-shutdown-storage.test.mts tests/verification/reliability/result-reservation.test.mts`: **5/5 pass**, exit 0 after repair. Four new cases cover shutdown during failure, shutdown after failure, retained accepted queued work, and normal persisted cancellation. The existing real competing-process reservation test remains green.
- `node --test --test-name-pattern '^dependency shutdown cancels native descendants' tests/verification/deployment/buster-readiness.test.mts`: **1/1 pass**, exit 0. This is the original generic real Node process-group cancellation test, not native BuildKit acceptance.
- `node node_modules/typescript/bin/tsc --noEmit -p skills/buster/engine/tsconfig.json`: exit 0.
- The new test also typechecked at exit 0 through a temporary config in its own directory, extending `../../../skills/buster/engine/tsconfig.json` and including only `buster-shutdown-storage.test.mts`. The temporary config was removed.
- `node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/buster/engine/test-gates/remote-plan-service.ts tests/verification/reliability/buster-shutdown-storage.test.mts`: four existing source violations before and after; no test violations. Existing file max-lines count increased 757→763; existing depth 4, execute length 140 and complexity 48 unchanged. The initial invocation without explicit config failed to locate config and is retained separately; it is not reported as a lint pass.

Evidence: `docs/review/evidence/resume-84-buster-shutdown-storage/`. The preserved original-store-counterexample.mts is an observational defect reproducer for the old source, not an acceptance test; its historical passing log asserts the defect. It is deliberately outside normal test routing and will no longer pass unchanged on the fixed source. Early before.log also records correction of the expected original normalized filesystem error from ENOTDIR to OBSERVABILITY_STORE_PATH_NOT_DIRECTORY; assertions in final baseline and repaired run are identical.

## Limits

This repairs ownership of rejections that escape `#execute`; it does not claim recovery of native adopted processes, provider quiescence after restart, successful native execution, or complete PCR-BUSTER-ENGINE-004/NOVA-GATE-005 acceptance. Existing status-read suppression inside `#execute` is unchanged and has no new acceptance claim. Fatal state is bounded and process-local; durable record truth remains authoritative for subsequent restart recovery. No cleanup or retirement authority is inferred from a terminal or shutdown result.

## Admission drain follow-up

An admission which already passed its stop check can still be awaiting its original FileBusterPlanJobStore write. Shutdown now includes the synchronously captured `#submission` chain in the same bounded allSettled drain. Existing `#start` refuses late launch once stopping is set; the newly accepted durable record remains available for restart.

A fifth regression holds the actual `withDurableStoreLock` admission lock, starts a real submit, then starts shutdown while admission is blocked. It verifies shutdown stays pending, releases the actual lock, and requires an accepted response plus an accepted durable record. That accepted response is also evidence that submit crossed its stop check before shutdown. A 100 ms scheduling allowance precedes shutdown; no private methods or replaced store hooks are used. Removing only the new submission drain makes this final exact test fail with the expected premature-shutdown assertion (`admission-final-before.log`, exit 1); with the fix it passes (`admission-final-after.log`, exit 0). Final five-case regression is 5/5, exit 0 (`final-five.log`).

Two initial attempts to observe waiting flock descendants through procfs failed because the exposed procfs paths did not exist. Those logs are retained and no procfs or host-control workaround was attempted; the final test uses the actual lock and public accepted response directly. Root will integrate persistent test typecheck and original remote-plan gate routing separately. Final Buster typecheck remains exit 0 and configured lint retains the same four source violations, with none in the test.

Final drain also examines settled outcomes after all work finishes: the retained first execution failure has priority; otherwise an actually rejected drain participant is propagated. Normal structured BuildKit false results remain fulfilled and unchanged. No artificial rejecting dependency test is claimed. Final source file max-lines count is 766 (baseline 757); the same four existing lint categories remain. Final five-case test and Buster types were rerun after this last source adjustment. Raw captured test/lint logs preserve their original whitespace, so diff --check reports log-only trailing whitespace; production/test source has no such changes.
