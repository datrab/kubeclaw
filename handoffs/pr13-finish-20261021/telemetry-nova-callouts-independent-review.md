# Independent complete Telemetry / Nova Core callout review

**NOT_READY — exactly one material Claim correction (F1).** Complete coherent review covers all58 callouts /348 fields, not an early partial stop. Telemetry30 have bounded Source/semantic Reader/Quality PASS; Nova27 do likewise, but its durable-effect Claim is incorrect. No whole A91205 or rendered Reader acceptance.

## F1: reversed durable-effect ordering

Nova Core, Source evidence — durable effect ordering, new Claim: “Durable effects bind request, acceptance, resource lock, fence and terminal receipt in that order.”

This reverses actual control flow. `skills/nova/core/effects/durable-invocation.ts` execute39–58 first checks prior identity/receipt, then acquires the resource lock at44. Its executeLocked87–103 records the request at98 and acceptance at100 only under that lock. The original surrounding chapter already correctly lists resource lock5, request7, acceptance8. The new field contradicts that explanation and the controlling source.

Finite correction: remove the false universal chronology, for example **“Durable effects bind stable request identity, resource locking, acceptance, fencing and terminal receipts.”** If spelling out order, distinguish a new invocation from prior-receipt reuse, recovery and failed receipt branches. Do not substitute a stronger false universal “current fence before every terminal receipt”: receipt reuse/recovery and failure receipts are distinct paths.

No other verified material finding. No author/main edits made; request one coherent author correction then targeted nonauthor rereview of exact delta/hashes.

## Exact binding/preservation evidence

Independent baseline and candidate SHA-256 values match both frozen manifests. Both captured baseline pages equal committed `2e89bce7`, including telemetry's up-to128/filter-then-sort correction. The historical263 capture is correctly described as HEAD history plus actual worktree bytes, not falsely clean Source.

Both pages are byte-identical outside existing58 Source blocks. All old URLs remain in order, all fields are present, headings/anchors/header/diagrams/text alternatives/payload tables/limits remain unchanged. Independently checked **126 distinct complete page-linked immutable objects** (broader than author's118 Source bindings): all git objects exist, complete current physical bytes equal, ranges in bounds. `telemetry-nova-independent-bindings.json` retains exact paths/revisions/hashes/ranges disposition. Parent's independent MarkdownIt same-block58 result may be reused as separate structural evidence; this review did not run renderer/parser.

## Complete semantic assessment

Read all348 new fields and complete surrounding two-page context: version families, host normalizers/queues, precise lifecycle producer payloads, canonical projection/subscriptions, delivery/recovery/redaction/monitoring, notification consumer; Core admission/compiler/graph/snapshot/journal, scheduler/reducer/budgets/signals/failed Prism handoff, effects/recovery/artifacts/cancellation/admin/remote import/audit/change/failure procedures. Exact unchanged prior independently accepted topic proofs are reused only for their named mechanisms and unchanged Sources, not as global reapproval.

Fresh source reads trace the18 individual lifecycle-payload field summaries through pipeline-loop, run-decisions, engine-admin, wait-request, executor and bridge constructors. Run startup spread-last, omitted identities/fields, terminal precedence, cancellation iteration boundary, skipped false/zero/null values, started-before-attempt ordering, success-before-rescheduling failure, stop/retry/wait/cooldown variants, orchestrator request versus authorization, remediation requester/target identities and consumed administrative overrides match actual branches. Attempt completion is not success-only; checkpoint and result-derived artifact paths are distinct; effect summaries do not create retrievable artifacts. F1 is the one differing new summary.

Host ingress v1, canonical reduced hook payload and eight-field agent projection v2 stay distinct; up-to128 is filter-before-slice-before-name-sort, not a fabricated128-required limit. Observer payload redaction does not cover copied identity or innocent free text. Five available registrations do not imply activation. Required delivery throws and aborts drain; best effort blocks the same observer/run only for that drain. Dedup TTL, stream trim, and external consumer history stay separate. Monitoring/CRI values are not event-delivery or complete retention evidence. Notification suppression precedes target validation and local chain assertions do not prove deployed receiver/crash recovery.

Core frozen identity/package/schema/config constraints remain scoped. In-process leases do not prove cross-host/resource enforcement. Exact signal envelope and consumer guidance remain separate; current Prism/operator payload mismatch remains explicitly uncorrected/source-traced, not an invented successful approval journey. Effect gate still blocks unresolved outcomes and unsupported continuations, including administrative retry; no general receipt-import procedure is invented. Checkpoint is not final success/backup. Cancellation is not rollback. Audit constructor/tail repair and fresh-reader rollback blindness remain explicit, not disguised as write-free reads.

## Test text versus actual execution

Fresh complete assertion-text reads: audit-projection28; observer-recovery85; repair-budget120; external-effect-recovery102; plugin-system-v2-resume91; agent projection unit19; telemetry observer/store and notification live-function files. Their actual assertions support each narrow added description. The repair fixtures use controlled explicit graphs rather than proving every compiled stage. Observer reconstruction uses a real local file observer, not an external sink or every required-mode branch. External-effect fixture includes local durable HTTP mutation/SIGKILL/lost-response definitions, but no fresh run is inferred. Signal tests reject graph drift and duplicate/stale/terminal resume, not arbitrary upgrades. Projection units use supplied deliveries. Notification fixture has local HTTP/real journal assertions, not deployed transport or process-crash proof.

All added test fields either name actual assertions with explicit no-fresh-result limits or truthfully state that the source trace does not establish a specified execution. They do not claim no tests exist anywhere. Mixed pins retain complete current-byte identity; revisions are Source bindings, never execution receipts. Historical Last verified fields unchanged, not renewed.

## Checks / limits

Actual inert static hash/URL comparison and each git-object/current/range check exit0. No product imports, test/CLI/service execution, current DATA/generator acquisition or main/register mutation. Parent's fresh2e89 Reader concerns the integrated prior27 batch only; it cannot validate these off-tree58. Whole A91205, other callout corpus/no-blob dispositions, live deployment, fresh-user/accessibility, global owner/census, runtime/CI/hosting/release and general continuation acceptance stay outside scope.

Exact per-box verdicts, hashes and finding are in `telemetry-nova-callouts-independent-review.json`.
