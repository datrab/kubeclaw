# Original compaction regression: historical producer and current replay migration

Status: read-only migration proposal. No test assertion, production API, store alias or historical record has been changed by this proposal. The original regression remains open. The BR16 author checkpoint is separate; its existing caller migration exposed this genuine historical compatibility gap.

## Why a preparation fixture substitution is insufficient

The public `FileBusterPlanJobStore` now aliases `PreparedBusterPlanJobStore`. That class deliberately stores prepared headers and has no `compactCompletedArchive`. The original `buster-job-compaction.test.mts` expects full historical archives and releases more than 32768 metadata bytes through actual compaction. `HistoricalBusterPlanJobStore` retains that maintained manual-only implementation. The existing `ModeledPreparedPlanJobStore` derives from the current prepared store; substituting it cannot preserve the original compaction oracles.

The first two concrete failures are retained under the BR author runner: missing explicit admission configuration, then HTTP400 reading `preparation.stage` from an absent preparation option. Admission was migrated to the historical direct-constructor profile 2/16/64 with the prior source bound. Adding modeled preparation alone would merely advance to the absent compaction method. No fake method or restored old service is appropriate.

Two further current production gates prevent a complete historical-to-current HTTP positive:

1. `runHistoricalImport` explicitly refuses existing V1 records with `BUSTER_HISTORICAL_STOP_AUTHORITY_REQUIRED`. It does not yet validate and publish a stopped/sealed historical store.
2. `PreparedBusterPlanJobStore.result()` explicitly refuses a historical result origin with `BUSTER_HISTORICAL_RESULT_AUTHORITY_REQUIRED`. `VerifiedHistoricalSource` intentionally has no constructor/decoder that can create migration authority. Its observation decoder proves structure only.

Copying a materialized candidate into the live prepared path, casting an observation into authority, bypassing the startup gate or changing resultOrigin to v2 would bypass the exact contract the regression should verify.

## Smallest honest test migration

Keep one explicit case map covering every original subtest. Separate two real environment scopes rather than changing their oracles.

**Historical manual-store scope:** use the maintained `HistoricalBusterPlanJobStore` by its explicit module name. Generate real signed jobs with the existing `buildCommittedSourceSnapshot` / `createRemotePlanJob` producer pattern in `buster-historical-import.test.mts`. Use real store accept/transition/complete and valid result bytes; when preserving the original skipped-provider execution provenance, run the actual existing runner against that plan rather than inventing an execution result. Original direct-store compaction, result validation, quotas, CAS, crash and CLI assertions continue to target the historical implementation. Real git retained refs, archive contents, result/evidence files, locks and SIGKILL remain real. No old network service is restored.

**Current HTTP replay scope:** after real historical manual compaction, invoke the legitimate maintained stop/seal/import path, and open the actual prepared store and HTTP service on the published metadata. Keep POST replay, status/result/evidence equality, conflicts, missing/corrupt evidence and FIFO rejection assertions. Terminal replay must not execute the job or reconstruct a retired archive. The existing `ModeledPreparation` may be used solely for the current service's already-modeled incoming-wire validation in a clearly identified host test; it does not authorize historical import or make the root/UID/cgroup boundary real. A genuine import ownership test must instead use the fixed-UID/real filesystem slice and ultimately the maintained native path.

This second scope is currently blocked by the two production gates above. A source plan cannot supply them. Implement and independently accept those real boundaries before claiming the original HTTP portion restored.

## Exact original obligations to retain

| Original subtest or boundary | Destination / retained evidence |
| --- | --- |
| Metadata byte quota, record count, terminal status, result equality, zero-byte idempotent retry | Real historical store and its unchanged compactor; real file sizes and journal bytes. |
| Reopened HTTP completion, full request validation and conflict behavior | Current prepared HTTP only after authorized import; original status/result/HTTP assertions unchanged. |
| Stale intent, unknown identity, movable branch, absent retained tag | Historical store / real git repository, unchanged no-mutation assertions. |
| Missing/changed real result blocks compaction | Historical result file and maintained validator, not a modeled blob. |
| Accepted/running/uncertain states remain ineligible | Real historical transitions and unchanged rejection/byte assertions. |
| Artifact HTTP readability, missing artifact and FIFO controls | Historical compactor plus current authorized historical evidence reader; real files/FIFO and original child bound. |
| Mutation of caller intent after submission | Actual historical compactor must retain its capture/immutability behavior. |
| Concurrent identical operation and stale CAS | Real independent store wrappers, locks and journal, no serialized test replacement. |
| SIGKILL before mutation/after durable commit | Existing actual child crash controls with explicit historical-store import; same recovery/idempotence assertions and limits. |
| Manual CLI receipt and repeated zero release | Existing maintained manual CLI and historical store, real receipt bytes. |

The parent test's real production-Nova/HTTP provenance must be mapped explicitly: it cannot simply disappear when generating historical records. Where the original combined path crosses the now-separated historical/manual and current/prepared domains, retain both producer and HTTP consumer assertions in the case union and state the changed environment requirement. Preserve original assertion bodies where their receiver changes mechanically; any unavoidable contract-specific rewrite needs an explicit before/after assertion map and independent review. No shorter substitute test or lowered released-byte threshold is acceptable.

## Existing reusable proof and its limit

`buster-historical-import.test.mts` already creates real full and compacted historical records, checks their preserved status/receipt/digests, invokes `materializeHistoricalImport` as real UID/GID1003 through setpriv, validates the candidate batch, verifies immutable original bytes and one-byte-short quota refusal. Its initial real-UID0 requirement is deliberate. It is a fixed-UID filesystem slice, not cgroup, stop-authority, publication or HTTP-result authorization evidence. Reuse its producer/context shape and child rather than introducing a permissive alternate importer.

`preparation-historical-batch.ts`, `preparation-historical-materialize.ts`, the terminal/result-origin validators and original store descriptors provide the candidate format. An independently verified stop receipt, enduring filesystem/inode/digest binding and owned publication remain necessary. Native source retirement, whole OBS and all unimplemented import/authority work remain open.

## Activation and acceptance

Do not integrate a partial test rewrite that makes the formerly combined regression appear green. First retain the frozen failed original and an exact case/assertion inventory. Implement the historical test-scope mapping without modifying manual compactor semantics, then add the actual authorized import/result-reader consumer when production supports it. Run every original case in its supported environment, preserving child deadlines and hard failures for missing prerequisites. Bind sources/dependencies/tools and obtain nonauthor review; report host-only historical tests separately from actual fixed-UID/kernel/import/HTTP evidence.

This is a proposed migration boundary, not implementation approval or a claim that the legacy regression has passed.
