# Independent current 37-field Buster execution/session review

Status: bounded local implementation/runtime evidence accepted for the tested profiles; DOC current-status correction remains required. No full CONFIG/D17, all14 workstream, privileged/native isolation, image or external-service acceptance. No active jobs; explicit HOLD after the final controls.

This updates the earlier28-field checkpoint in `independent-buster-runner-execution-child-20260921.md`; that report and all failed raw runs remain historical evidence. Evidence root is `docs/review/evidence/independent-buster-runner-execution-child-20260921/`.

## Current bound execution

Fast session29473 passed all three canonical type projects and the complete touched-source canonical lint, including the new Completion/Report/Ownership tests and Session changes. No source drift.

Stable Runtime4 session24421 passed the actual maintained `verify:buster:execution-config` ten-module command (142/142), actual `verify:lint:policy-delivery`, original provider-capabilities test, full original Runner, RealProvider, and maintained Components649/649. Commands and exact results are in `session37-runtime4/results.json`. No unexpected source/dependency drift. The maintained command really rebuilt the sandbox: its compiler/sysroot are bound, and the expected output inode replacement is preserved separately in sandbox-build-delta.json. Do not call that replacement an unchanged tool identity. No production deployment or privileged host operation was used.

Controls session89719 passed and has empty source drift. All four mutations were applied privately and manually checked at the intended actual assertion, not accepted merely from nonzero exit:

- Restoring old stdout/readline order dispatches one over-budget log where the initialized-idle regression requires zero.
- Removing persisted protocol-failure checks returns PROCESS_CLOSED instead of PROTOCOL_LIMIT to the later operation.
- Forcing500ms grace removes the actual parent KILL required by the50ms profile.
- Forcing50ms grace produces a real parent KILL forbidden in the500ms profile, where the existing native supervisor should close first.

The real supervisor's approximately100ms descendant cleanup explains the two grace oracles. Parent50/500 settings and original50ms tolerance remain; no production timer or test deadline was raised. PID absence, cancelled result, actual forwarded signals, and fixture cleanup remain asserted.

## Source and consumer scope

The existing central execution owner now contains provider14, report9, observation2 and store12 settings:37 fields. The nine formerly hardcoded provider/session values are mandatory settings of that same owner, not a second configuration author. Complete provider+observation policy reaches the default loader/session; construction validates before package/process effects, rejects invalid/missing values, and freezes the snapshot. Legacy observation-only construction is rejected. Constructor workspace extraction retains the same realpath/resolve/containment operations and error contract.

ProtocolV2 registers the byte guard before readline dispatch, retains the first protocol overflow, suppresses the over-budget frame and reuses the retained failure on later initialize/execute/cleanup. It does not silently reclassify the original protocol failure as generic closed-process state. Real initialized-idle low/high probes and both protocol mutations demonstrate this narrower behavior.

New provider consumers exercise actual stdout protocol capacity; V8 heap capacities and exec arguments; real EMFILE thresholds for minimum descriptors/reserve; live parent signal grace; bounded delayed close; actual pending-capability IPC; and capability-drain outcomes. Completion tests add actual cleanup timeout50/1000 and Core wrapper reserve1/4096, preserving retained result/cleanup state and exact failure distinctions. Prior provider result/claim/queue consumers and observation scheduling remain covered by the maintained suite. These are concrete profiles, not exhaustive timing guarantees or sandbox security acceptance.

All twelve store settings retain the previously documented actual default-owned receiver/Runner quota coverage; the corrected admitAndRead hook delegates unchanged and the malformed direct writes are explicitly test operations, not ordinary Runner-produced records.

Report coverage now extends the earlier aggregate-byte proof with eight true defaultRunner→registered-adapter pairs: source bytes, case count, finding count, per-case findings, timeout, memory, CPU and open files. Valid retained source and successful outputs are checked; physical-limit cases require REPORT_WORKLOAD_STARTED before the intended failure and bind actual child stderr/closure where applicable. They therefore distinguish workload boundaries from mere startup failures. Cleanup owns actual spawned children, waits for observed closure, and retains/fails on uncertainty. These tests demonstrate the selected profile outcomes; they do not prove every possible platform resource condition. The separate unchanged original ReportAdapter contract passed in the earlier bound delta and remains preserved.

## Failure history and original scope

Do not rewrite the intermediate failures as passes. The37-field Fast1 exposed a constructor63-line lint violation; cohesive extraction fixed it. One reviewer runtime harness initialization failed because host cc was absent; actual cached Alpine GCC/sysroot was subsequently bound. Runtime3 preserved126/128 with the real protocol-classification defect and incorrect grace oracle. That run also observed exactly four concurrent Root source changes (Additional3+package): old npm eight-module command plus newer ownership cases was a genuinely mixed revision. It is not the stable acceptance run. Runtime4 reran the complete current maintained ten-module scope after coordinated integration.

Original full Runner/RealProvider/Capability/Component tests were executed without filters, widened deadlines or substituted successful providers. New tests are additive. Earlier independent evidence preserves original Core/deadline/output and report-contract coverage; this does not claim that every external vertical or native caller was rerun or is green. Historical compaction, privileged/native process-restart/preparation, external BuildKit/browser/tool prerequisites and image gates remain separately open. Previous test-hook review misses and raw failures remain in the earlier report/evidence.

## Required DOC correction and release

`config-buster-provider-session-20260921.md` still begins with a private/unreviewed/unexecuted11-file V1 status. That historical proposal must remain but be clearly labeled as historical; its current header must identify the integrated37-field state, current independent bound evidence and remaining limits. This is a documentation finding, not a claim that all CONFIG work is complete. Root owns that DOC-only correction after freeze.

Current sources are released. HOLD: no further runtime jobs without a concrete delta.
