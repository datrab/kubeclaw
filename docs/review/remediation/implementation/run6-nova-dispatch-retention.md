# Bounded Nova dispatch archive projection

Status: independently review-required; PCR-OBS-002 remains open. Source freeze
`4d44983` was reconciled with reviewed main `4f70d8f13e282e01d014fe82557d37c90d52cb71`
in author checkpoint `a393d914544bd00175e2eaac87d60395b421d65e`.

The original dispatch store now has an explicit projected record: full original
job header, immutable archive reference, and manual receipt, but no duplicate
base64 archive. Original load reconstructs and validates the exact original job.
Duplicate persistence retains the projection; it cannot restore a missing
projected blob. Legacy full-record crash repair remains unchanged. This releases
only net metadata bytes, not record count or unique archive bytes; quotas are
unchanged and no log, result, source, import or artifact is deleted.

## Authority and lock order

An explicit local operator calls `scripts/retire-nova-dispatch.mjs --apply` with an
absolute scope JSON file. Scope schema is `nova-dispatch-retirement-scope.v1`;
action is `compact-imported-dispatch-archive`. It names `novaStorageRoot`,
`orchestratorIssuerId`, `stateRoot`, `dispatchOptions`, `importOptions`,
`inventoryLimits`, and the exact intent (actor, operationId, runId, canonical
runRoot, dispatchRoot, importRoot, jobId, requestDigest, expectedPayloadDigest,
importPayloadDigest, runJournalHead, snapshotDigest). The options carry explicit
existing record/blob limits, not increased budgets. Store roots must be the
original configured `stateRoot/dispatch` and `stateRoot/imports`; aliases and
symlinks are refused before locks.

Lock order is original run mutation fence → original import RecordStore writer
fence → distinct dispatch RecordStore CAS writer fence. The fenced import callback
owns a clone, checks the full original result/attempt/node/receipts/decision and
every evidence/output/report blob with the corrected original bounded BlobStore
reader. It never reenters the held import store. Final authorization is synchronous
under dispatch CAS, with bounded pinned inventory and original `readRunEvidence`.
It checks the exact canonical selected request/accepted/completed contracts,
ordered Core effect audits, original attempt identity and owner, pinned adapter
configuration, full plan/source/request, and the original quality-stage decision
artifact in both the artifact-store receipt and the completed Core attempt.
Any changed inventory or stale scope refuses without overwriting concurrent work.

Only explicit original `providerPlan.revision` is currently eligible. Derived
`sourceStageId` or missing revision is refused: its original source-stage producer
artifact linkage is deliberately **not inferred** from a caller or request string.
Old snapshots without original coordinator evidence, incomplete imports, null
results, pending reviews and nonterminal/uncertain Core histories remain open.

## Actual evidence and limits

The real positive uses original Core quality stage → real local Buster HTTP/service
→ genuine non-null errored result → original Nova import and artifact write →
blocked Core → authenticated original administrative cancellation in disposable
test state. The native sandbox helper was built once; actual EPIPE/initialization
failure is retained exactly. This proves confirmed failed-history storage, not a
native provider success, deployment, or completed global finding.

`run6-nova-dispatch-author-matrix.txt` records 16/16 author cases without skips;
`run7-nova-dispatch-author-matrix.txt` repeats all 16 on approved coupled main
`4f70d8f` without skips. `run7-nova-dispatch-author-regression.txt` records unchanged
canonical lint, original remote-import and original authenticated remote-runtime
commands, including shared-runtime and Nova type checks, all exit 0. Cases cover:
exact HTTP replay/no redelivery, byte/count quotas, missing/corrupt projected blob,
legacy repair, stale scope/alias/run fence, unrelated Core, actual blocked Core,
honestly rehashed missing/derived-source negative snapshots, actual competing
process writer, actual SIGKILL at the original dispatch temporary-write boundary,
canonical-invalid selected request and stage/attempt/source/plan/adapter tampering,
all three evidence-reference categories, pending/null/incomplete authority,
original review-required decision and bounded original record reads.
Evidence-bearing contract vectors are explicitly data vectors using original
stores/validators, not simulated engine execution. The derived-source negatives
are corruption controls, **not a genuine successful derived-source producer run**.

The original full importer verifier and decider were factored once into
`remote-result-authority.ts` and reused by both ordinary import and retention;
canonical lint rules and JUnit executed-case requirements remain unchanged.
The canonical malformed-request failure before correction is preserved in
`run6-dispatch-independent-canonical-before.txt`; the earlier cross-Core failure
is preserved in `run5-dispatch-independent-ownership-before.txt`.

Next: independent review of the final exact source/test freeze and fresh-head
integration checks. A later coupled slice must prove original derived-source
artifact ownership, broader result-store retention and the remaining PCR-OBS-002
native acceptance requirements. No aggregate Finding status is advanced here.
