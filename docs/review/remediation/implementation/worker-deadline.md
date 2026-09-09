# Worker absolute claim deadline

Scope: PCR-WORKER-001 and the split-byte log corruption component of PCR-ISOLATION-003. Neutral Core remains responsible for admission, cancellation, result validation and claim fencing; actual execution termination remains engine-owned. No arbitrary JavaScript termination guarantee is introduced.

## Changes

`skills/worker/core/worker/attempt-executor.ts`, `phase-deadline.ts` and `log-decoder.ts` enforce the absolute claim expiry through operation, measurement, cleanup, evidence collection, retained full-log storage and finalization. Admission reserves execution plus one cleanup budget for each actual configured completion phase, including termination and measurement. Retained log storage is counted only when enabled. Buster's real envelope producer reserves its five completion phases; Prism's existing 600-second claim already covers its 330-second requirement.

Each completion callback receives a phase cancellation signal. Timeout aborts the callback and waits a bounded drain interval. A callback or operation still pending after drain produces `WORKER_PHASE_UNRESOLVED`, quarantines later hooks and cannot produce success. The original fault is retained in the diagnostic. Required termination and cleanup may continue after claim expiry; this is separate from the prohibition on late success. Result hashing, validation and recursive freezing precede the final claim-time check immediately before return.

`skills/buster/engine/test-gates/runner.ts` propagates cancellation through evidence collection and suppresses fallback writes after abort. `artifacts.ts` passes the signal into actual file reads/writes and checks before and after awaited I/O. `skills/prism/server/worker-attempt.ts` and `worker-operation.ts` pass the actual operation/phase signal to durable upload consumers. An uncooperative custom storage/engine implementation remains explicitly unresolved; the worker does not pretend that abort kills JavaScript or that an unresolved write has drained.

Byte logs use a separate streaming fatal UTF-8 decoder for each output stream. Byte budgets precede decoding; incomplete terminal sequences and malformed bytes fail explicitly. Valid split characters and literal BOM content are preserved. This addresses worker decoding only, not the broader process-isolation finding.

The new `skills/worker/core/tsconfig.json` is a genuine source project boundary extending repository compiler configuration; no lint rules are disabled. The existing worker contract test project includes the new reliability tests.

## Evidence

`docs/review/evidence/worker-deadline-tests.txt` records 15 passing genuine worker/Prism tests (10 new deadline tests plus 5 existing Prism worker service tests) and passing worker-attempt and LocalRuntime compatibility scripts. The compatibility scripts include older artificial fixtures and are not presented as new native proof.

`tests/verification/reliability/worker-deadline.test.mts` with `worker-deadline-fixture.mts` exercises actual executor and LocalRuntime admission, real file hooks and durable log storage, native blocking work across claim expiry, cooperative cancellation with no later artifact, explicit unresolved uncooperative storage, actual Buster FileEvidenceStore cancellation/read/write, and every interior byte split of accented/CJK/emoji text plus BOM and independent stdout/stderr decoding. No simulated clock or mock execution engine establishes these results. The uncooperative fixture is explicitly drained by the test owner after the unresolved result.

Passing typechecks: worker contract project including new tests, worker Core project, Prism project, and strict standalone Buster runner dependency graph with the existing js-yaml declaration. Focused canonical lint passes new helper/decoder, Prism callback changes and reliability tests. Original executor canonical lint remains exactly 18 baseline errors with the same rule counts (complexity 4, max-depth 7, max-lines-per-function 2, no-swallowed-error 4, max-lines 1). Buster canonical lint cannot obtain an owning project configuration; this pre-existing parsing gate is not claimed green.

The genuine native Buster `plugins/direct-command/tests/runner-artifacts.test.mts` gate is blocked in this host: `open task children: No such file or directory`, followed by summary-pipe EPIPE. No process identity or liveness substitute was used. Full native process-group/cgroup termination proof and arbitrary uncooperative engine termination remain outside the demonstrated result. No external messages or services were used.
