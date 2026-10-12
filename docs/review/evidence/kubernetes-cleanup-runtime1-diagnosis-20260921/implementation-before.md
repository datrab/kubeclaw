# Kubernetes fixture cleanup disposition — 2026-09-21

Status: independently source-reviewed V2 integrated; type/lint/runtime acceptance pending. This does not close historical cleanup, durable ownership, CONFIG or a whole original finding.

Previously a failed Kubernetes preparation discarded rollback errors. The provider also skipped cleanup whenever retention was retain, even for a failed attempt. Since cleanup can start a fresh provider process, a provider-local success flag cannot distinguish these cases reliably.

The host now supplies required incomplete or completed-fixture authority through the SDK, LoadedTestProvider, real cleanup IPC and replacement session. Ordinary and faulted-attempt cleanup use incomplete. Final retained-fixture cleanup validates completed/passed host state, no cleanup failure and node/provider/attempt identities before supplying completed-fixture. The maintained Kubernetes provider retains only with that explicit successful authority. Preparation plus rollback failure preserves both local causes under a stable marker that survives message-only capability IPC.

The [behavioral reference](../../../architecture/buster-fixture-cleanup.md) explains the public contract and boundaries. The [frozen integration](../../evidence/kubernetes-cleanup-disposition-20260921/integration-result.json) binds all 20 files; [independent V2 source review](../../evidence/kubernetes-cleanup-disposition-independent-20260921/source-review-v2.json) accepts them for actual verification. The rejected V1 proof gap and additive V2 correction remain evidence: the faulted-retain test must observe real passed-result IPC before injecting termination failure and must observe the later successful retained attempt.

Required gates: type checks across affected engine/SDK consumers, canonical lint, the maintained cleanup command, full affected original Runner/provider/capability/configuration tests, four exact semantic mutation controls and independent final review. Tests use genuine provider children/IPC with explicitly modeled Kubernetes command responses and injected OS faults; no live cluster or actual permission-denial claim follows. No original deadlines or assertions were removed.

Old immutable plugin snapshots do not gain new semantics from an extra argument. Durable failed-cleanup recovery also remains unresolved; existing snapshot disposal is unchanged. Both limits remain open for the larger goal and must not be inferred solved from a positive current-provider test.
