# Compaction contract after Prepared-store migration

Status: open integration finding, discovered by executing the original compaction suite during the Readiness regression checks. This is not resolved by the passing 16 Readiness cases. It belongs to the existing Buster/history/retirement work, not a newly completed issue.

The original `buster-job-compaction.test.mts` creates a job through the production HTTP path, then calls `compactCompletedArchive` on `FileBusterPlanJobStore`. It requires release of more than 32768 real embedded-archive metadata bytes, terminal replay, idempotent receipts, conflicting-intent rejection, source/evidence validation, writer serialization and crash recovery.

The current public `FileBusterPlanJobStore` export is an alias for `PreparedBusterPlanJobStore`, which does not implement that historical embedded-archive operation. The operation still exists on `HistoricalBusterPlanJobStore`, explicitly intended for historical/manual format records. Current production preparation deliberately does not reconstruct those full-job records. Supplying the missing admission and preparation options alone therefore cannot restore this original contract.

## Required resolution

1. Preserve the original failure evidence and all original behavioral requirements. Do not relabel this as an environment prerequisite or a successful Readiness regression.
2. Trace the maintained historical import path and its terminal-job replay behavior. Identify which existing production owner is responsible for historical embedded archive bytes and which is responsible for current prepared source storage.
3. Where the original assertions concern historical embedded bytes, generate real signed historical records and compact them through the actual historical store. Demonstrate terminal HTTP replay through the actual supported import/prepared-service path. A fixture may explicitly model native preparation only where the established tests already do; it must not fabricate compaction, receipts, released bytes, durable import or HTTP results.
4. Retain source/evidence identity, intent conflicts, crash/retry and writer-lock oracles. If an assertion cannot be preserved literally because the physical format changed, map its original guarantee to the new real consumer and prove the replacement. Never delete a failing guarantee to obtain green tests.
5. Do not reconnect the removed historical execution service, reverse the public store alias, add a facade that lies about reclaimed metadata, or claim current prepared-source retirement from historical compaction tests.
6. Update the maintained retention/import documentation and the test's declared scope. Bind the resulting source and original-to-current assertion mapping; require an independent nonauthor review and execution of the complete migrated contract.

The native prepared-source retirement/ownership requirements remain separately open. Successful historical compaction must not be counted as their completion.

## Confirmed import prerequisite

Current inspection of `preparation-historical-import.ts` finds an intentional fail-closed startup gate: `runHistoricalImport` returns for an absent historical `records` directory, but throws `BUSTER_HISTORICAL_STOP_AUTHORITY_REQUIRED` when that directory exists. The function does not publish transformed records into the Prepared store. Its comment names the unfinished external maintained stop-receipt producer/verifier integration.

The existing historical-import test exercises the fixed-UID filesystem materialization/batch slice. It must not be promoted into proof of authorized publication and Prepared-service HTTP replay. Consequently the proposed complete historical-to-current test migration depends on implementing and proving the real stop-authority boundary. Copying transformed metadata directly into the current store, manufacturing a stop receipt, or removing this startup rejection would bypass the unresolved requirement.

A second production boundary is independently confirmed in `PreparedBusterPlanJobStore.result`: after validating completed status, requested digest and byte limits, any result origin other than `v2` throws `BUSTER_HISTORICAL_RESULT_AUTHORITY_REQUIRED`. Historical input transformation alone therefore cannot prove HTTP result replay. The historical source type declares a private verified-authority brand; inventing that brand with a cast is not a verifier. A legitimate implementation must establish and check historical result authority and preserve exact bytes/digests before exposing the result through the current service.

Historical store compaction can still be tested as its own real operation, but splitting out those tests must retain an explicit failing/unfulfilled replay-integration gate and the complete original assertion mapping. Such a split is not completion of this finding.
