# Private cleanup-disposition contract proposal

Source investigation, before implementation. No live change or runtime job. This is runtime authority, not a configurable setting.

## Existing authority and failure chain

`executeProvider` validates and freezes the provider result, stages its evidence, then marks a passed fixture retained. `cleanupProviderOperation` skips retained fixtures and otherwise invokes provider cleanup. `cleanupFaultedFixture` handles a previously retained fixture whose worker later faults or does not complete; that path must be incomplete, despite the earlier provider passed result. `runner-node.retainedFixture` requires !cleanupFailed, fixture kind, completed execution and passed outcome; `runner-scheduler` accepts only that returned retained fixture. Final `cleanupRetainedFixtures` owns successful fixture cleanup after dependent consumers finish.

`IsolatedLoadedProvider.cleanup` uses the current session or constructs a NEW ProviderProcessSession after termination, passing the original invocation. There is no result in ProviderInvocationV1 or current cleanup IPC. An in-memory flag in the plugin cannot survive this boundary. Runner-wide completion recovery is separately owned by Nova; no new claim of durable old-fixture reconstruction is made here.

The Kubernetes invoker currently suppresses a failed release after preparation failure. Its provider cleanup currently returns for any configured retain mode, including failed execution. That combination can make cleanup appear successful and allow retry under a new attempt-bound namespace while the original remains unconfirmed.

## Proposed minimal explicit contract

Add a required typed runtime cleanup disposition to the SDK cleanup method, LoadedTestProvider.cleanup and ProviderProcessSession.cleanup. Allowed values are `incomplete` and `completed-fixture`. The cleanup IPC carries it explicitly; child validates it before invoking the plugin cleanup with the third argument. Missing/unknown values fail closed; never infer completed from a prior execute event or from requested retention. Exact invocation/session identity already binds the child; successful authority must originate in the host ownership path, not plugin state.

Host callers:

- Ordinary operation cleanup: explicit incomplete.
- Faulted retained fixture cleanup via runner.ts -> cleanupRetainedProvider: explicit incomplete.
- Final retained fixture cleanup: completed-fixture only after verifying the actual retained AttemptExecution result is completed/passed and node kind fixture; otherwise incomplete. No reconstructed success from configuration.
- Loaded provider original and newly created recovery sessions forward the exact selected disposition unchanged.

Kubernetes plugin skips release only when configuration retain AND host disposition completed-fixture. Incomplete always invokes release. A rejected release remains cleanup failure and blocks retry via the existing owner machinery. Successful delete behavior stays unchanged. Other providers may ignore the additional argument, preserving their current cleanup semantics; the SDK/IPC contract and all direct host callers must still be explicit.

In the invoker preparation catch, await the SAME existing bounded release. If it succeeds, rethrow the identical primary error. If it fails, throw AggregateError([primary, cleanup], `KUBERNETES_FIXTURE_PREPARE_CLEANUP_FAILED`, {cause: primary}). Preserve original error objects locally. IPC presently serializes only error.message: the stable top-level marker survives; do not claim nested causes cross the protocol.

## Concrete source scope

SDK src/runtime.ts (cleanup type/signature, export visibility); provider-loader.ts (Loaded contract/current/recovery); provider-process-session.ts (argument validation and cleanup wire message); provider-child.mjs (wire validation and plugin argument); runner-provider-operation.ts; runner-fixtures.ts; runner.ts; Kubernetes provider.js and preparation helper. Preserve original invocation/configuration bytes and package digest verification; no journals rewritten or public store aliases introduced.

Direct maintained fixture migrations: Kubernetes plugin live-function.test.ts's two cleanup calls; provider-loader-ownership.test.mjs's three session cleanup calls; provider-child-session.test.mjs's three explicit cleanup messages. Other `.cleanup()` matches include process ownership and test teardown, which are unrelated APIs and must not be blindly rewritten. Other plugins' two-argument implementations remain valid consumers of an additional argument. Check full source call inventory and types before freeze.

## Required original and new proofs

1. Actual public Kube invoker: preparation failure + delete failure preserves both error object identities and stable marker; successful rollback rethrows identical primary. Independent cleanup AbortController/timer must remain active when original request is aborted.
2. Real registered Kubernetes provider through DefaultRunner: retain failed-prepare/failed-delete produces failed cleanup, no retry, no cleanupCompleted claim. Equivalent delete case remains blocked. Use real child IPC with explicit isolated command/API fixtures, not live cluster calls.
3. Successful retain: no release during final cleanup; successful delete: release occurs. Verify host result/evidence ownership conditions, not only a provider stub's response.
4. Force terminated execute session -> distinct cleanup process: disposition survives recovery; incomplete still releases, successful retained still retains. Missing/invalid disposition rejects before plugin cleanup; observed process IDs prove separate sessions.
5. Mutants: restore suppressed delete error; restore unconditional retain return; discard disposition on recovery; wrongfully mark faulted fixture completed. Each must fail an exact behavioral oracle. Preserve all original assertions/deadlines and package/snapshot digest checks.

Historical boundary: old immutable Kubernetes plugin snapshots retain their old two-argument behavior unless an explicit compatibility/migration gate handles them. An additive host IPC argument alone cannot retroactively fix old retained code. This must be resolved explicitly before claiming historical cleanup safety; no unknown producer is silently assumed updated.

Recovery ownership limit: loader cleanup removes its package snapshot in finally after termination, including failure paths. Forwarding the host disposition into a new provider session is session recovery, not a durable retry record for failed cleanup. This patch must not claim crash recovery or retirement of historical namespaces; that needs separate authority/lifetime work.
