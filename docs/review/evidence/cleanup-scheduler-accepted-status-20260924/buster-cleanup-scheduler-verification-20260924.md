# Buster cleanup and scheduler verification — 2026-09-24

Status: bounded implementation and local positive/semantic checks complete; fresh independent final evidence/DOC review pending. No original finding, whole CONFIG, historical provider safety, durable crash recovery, native isolation or live deployment is closed by this report.

## Implemented behavior

The host supplies explicit incomplete/completed-fixture cleanup authority. Only a validated completed fixture may retain Kubernetes resources. Failed preparation preserves rollback failures; the original marker is observed on execution IPC separately from the Core's later cleanup-priority summary. The loader distinguishes disposal confirmation (actual close plus completed capability drain) from stop diagnostics, adopts a replacement as its current session before initialization, prohibits recovery from unconfirmed current/replacement sessions, preserves cleanup and stop errors and accounts overlapping stops once.

The scheduler settles all started peers after observing an unexpected scheduling/node rejection before fixture cleanup. Late successful fixtures are registered once. Single errors retain identity; distinct execution and cleanup errors are aggregated. Existing scheduling, node deadlines and cancellation authorities remain unchanged.

## Actual verification and exact scope

| Evidence | Actual result |
| --- | --- |
| [Independent combined Fast](../../evidence/independent-buster-runner-execution-child-20260921/disposal-scheduler-fast1/results.json) | Four type projects and complete affected canonical lint passed; no source drift. Subsequent source changes were test diagnostics/profile and documentation; no TypeScript production change. |
| [Root runtime1](../../evidence/disposal-scheduler-runtime-20260924/run1/results.json) | Cleanup53/53, execution193/193, Components649/649 and other affected original modules passed. Scheduler setup failed on invalid maximumRetryCount0; this run remains failed. Its chained original Runner/provider commands did not run there. |
| [Root runtime2](../../evidence/disposal-scheduler-runtime-20260924/run2/results.json) | Corrected fixture lint, all six scheduler cases and complete original Runner/real-provider modules passed. The policy ceiling is1; all three node retry requests remain0. |
| [Root runtime3](../../evidence/disposal-scheduler-runtime-20260924/run3/results.json) and [runtime4](../../evidence/disposal-scheduler-runtime-20260924/run4/results.json) | Diagnostic-only test corrections passed canonical lint and complete Cleanup53/53 again. Runtime4 is the current positive proof for the unconfirmed-disposal test ownership correction. |
| [Nine semantic controls](../../evidence/disposal-scheduler-controls-20260924/final-root-semantic-review.json) | Each deliberately incorrect variant failed at a concrete behavioral boundary; all test modules reported zero skipped/cancelled. Controls never changed live source bytes. |

All four positive/failed checkpoint runs and the three control runs record no unexpected source drift. Sandbox build output is recorded separately. Each run retains command arguments, source patch, content identities, dependency/tool bindings and raw logs. Root owned these runtime/control executions after the earlier reviewer usage interruption; they are not labeled independent execution. The fresh nonauthor reviewer separately checks source, originals, raw evidence and documentation.

## Semantic evidence

Controls restore wrong recovery authority, wrong faulted-fixture authority, suppressed rollback cause, success-only disposal marking, unsafe unconfirmed recovery, duplicate accounting, hidden public error details, the original scheduler and unconditional provider retention. The final unsafe-recovery control observes actual extra children in both drain cases (3 instead2 and4 instead3); close cases fail the actual rejection assertion. Duplicate accounting reports CPU88.822 instead44.411 with unchanged peaks. The original scheduler causes the real Runner to settle before its still-running peer. These are not import, compilation or prerequisite failures.

The provider-retention control mutates only a verified private plugin copy before package discovery/digesting; the real provider child executes that copy. Other controls require the exact current source hash and a unique semantic anchor, and retain actual hook-application logs. Earlier controls with indirect diagnostics remain archived; the later run supplies the missing direct evidence.

## Documentation and boundaries

Behavior and supported verification commands are documented in [fixture cleanup](../../../architecture/buster-fixture-cleanup.md) and [parallel failure handling](../../../architecture/buster-runner-failure-drain.md), linked by the [runtime reference](../../../architecture/buster-v2-runtime.md). Earlier failed checkpoints and rejected V1/V2 disposal designs remain linked from the respective implementation reports.

Tests use real local provider processes/IPC and modeled Kubernetes responses, host barriers and injected failure boundaries. They do not prove live Kubernetes, native isolation or all internal signal-plus-drain error combinations. Snapshot removal still occurs after a successful stop even if cleanup failed; durable failed-cleanup recovery and historical plugin behavior remain separate open work. No register status is raised here.
