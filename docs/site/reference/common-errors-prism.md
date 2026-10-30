# Prism, storage, backup and browser operations — error catalogue

Status: generated source-backed reference
Audience: operator, developer, maintainer
Owner: documentation automation
Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs
Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence
Last verified: generation checks the declared source digests
Generator: scripts/docs-common-error-catalogue.mjs

<!-- BEGIN GENERATED: common error catalogue -->

[All component families](common-errors.md) · [Diagnostic routing](errors.md)

Search for the exact diagnostic or constructor. Each entry distinguishes its identity from effects and recovery; source links are representative, not a complete call graph.

## Families

- [PrismBrowserCloseError](#js-shared-prismbrowsercloseerror)
- [ProductControllerError](#js-shared-productcontrollererror)
- [StudioRequestError](#js-shared-studiorequesterror)
- [WorkerDependencyUnavailable](#js-shared-workerdependencyunavailable)
- [Prism worker result and cache error forwarding](#j17-prism-bound-worker-result)
- [Prism tool HTTP forwarding](#j18-openclaw-prism-post)
- [commit document operation](#j18-studio-180)
- [restoreRevision](#j18-studio-244)
- [retractPreference](#j18-studio-273)
- [selectDirection](#j18-studio-297)
- [recordDirectionFeedback](#j18-studio-322)
- [approval POST](#j18-studio-386)
- [baseline POST after approval](#j18-studio-401)
- [evaluateDesign](#j18-studio-438)
- [Embedded product operator API and pending intent](#j18-embedded-product-api)
- [Database: `001_prism.sql`](#sql-migration-001-prism)
- [Database: `002_engine_operation_results.sql`](#sql-migration-002-engine-operation-results)
- [Database: `003_worker_nonce.sql`](#sql-migration-003-worker-nonce)
- [Database: `004_approval_warnings.sql`](#sql-migration-004-approval-warnings)
- [Database: `005_direction_source.sql`](#sql-migration-005-direction-source)
- [Database: `006_design_request.sql`](#sql-migration-006-design-request)
- [Database: `007_direction_evidence.sql`](#sql-migration-007-direction-evidence)
- [Database: `008_document_request_binding.sql`](#sql-migration-008-document-request-binding)
- [Database: `009_corpus_source_evidence.sql`](#sql-migration-009-corpus-source-evidence)
- [Database: `010_direction_unsourced_uniqueness.sql`](#sql-migration-010-direction-unsourced-uniqueness)
- [Database: `011_preference_wire_ids.sql`](#sql-migration-011-preference-wire-ids)
- [Database: `012_preference_generation.sql`](#sql-migration-012-preference-generation)
- [Database: `013_design_round.sql`](#sql-migration-013-design-round)
- [Database: `014_agent_jobs.sql`](#sql-migration-014-agent-jobs)
- [Database: `015_product_decisions.sql`](#sql-migration-015-product-decisions)
- [Database: `016_preference_legacy_insert_compatibility.sql`](#sql-migration-016-preference-legacy-insert-compatibility)
- [Database: `017_native_operation_identity.sql`](#sql-migration-017-native-operation-identity)
- [Database: `017_native_operation_identity.sql`](#sql-017-update-identity-raise)
- [backup-shell:fail-constructor](#backup-shell-fail-constructor)
- [backup-shell:positive-validator](#backup-shell-positive-validator)
- [backup-shell:file-validator](#backup-shell-file-validator)
- [backup-shell:configuration](#backup-shell-configuration)
- [backup-shell:artifact-name-control](#backup-shell-artifact-name-control)
- [backup-shell:database-readiness](#backup-shell-database-readiness)
- [backup-shell:artifact-index](#backup-shell-artifact-index)
- [backup-shell:verify-group](#backup-shell-verify-group)
- [backup-shell:backup-stage-publication](#backup-shell-backup-stage-publication)
- [backup-shell:latest-group](#backup-shell-latest-group)
- [backup-shell:database-proof-cleanup](#backup-shell-database-proof-cleanup)
- [backup-shell:dispatch-lock-timeout](#backup-shell-dispatch-lock-timeout)

<a id="js-shared-prismbrowsercloseerror"></a>

## PrismBrowserCloseError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Fixed constructor message.. cause: Argument1 retained as cause.

**Trigger:** Cached browser close settlement reports error.

**Effect:** Throws close failure/cause. worker operation prioritizes it over other operation result.

**Retry boundary:** No guarantee a close retry occurs or succeeds.

**Safe next action:** Treat cleanup as failed. do not report cancellation/browser termination complete from this error.

**Retained evidence:** Close cause and cached close settlement.

**Consumer / translation:** Fixed `PRISM_BROWSER_CLOSE_FAILED` plus cause. closeOnce caches settlement. Abort initiates close. explicit close throws close error then checks signal. Consumer prioritizes settled close failure at worker-operation:56. not a blanket guarantee close or cancellation completed.

**Representative source constructions (not executed by this reference):**

```text
new PrismBrowserCloseError(closed.error)
```

**Owning / consuming source:**

- [skills/prism/engine/browser-capture.ts:3](../../../skills/prism/engine/browser-capture.ts#L3)
- [skills/prism/server/worker-operation.ts:1](../../../skills/prism/server/worker-operation.ts#L1)

<a id="js-shared-productcontrollererror"></a>

## ProductControllerError

**Representation:** constructor family

**Identity / construction:** code: Trimmed UTF8 response body only if /^`DEMO_PRODUCT_`&#91;A-Z_&#93;{1,100}$/u. otherwise undefined. Pattern is not finite known owned causes.. message: Filtered code or product controller response plus argument1 status. argument2 body is source of filtered code.

**Trigger:** Product-controller non-success HTTP response converted from status/body.

**Effect:** Optional filtered controller code. product decision reconciliation may return pending rather than reject decision.

**Retry boundary:** Status failure is ambiguous. reconciliation reuses identical stored envelope, not a replacement.

**Safe next action:** Recover the original decision identity. no blind new decision on unknown outcome.

**Retained evidence:** Stored intent/envelope/receipt authority retained. code is upstream filtered data.

**Consumer / translation:** Controller code exists only for trimmed body matching `DEMO_PRODUCT_`&#91;A-Z_&#93;{1,100}. otherwise message status and codeundefined. Studio constructor status is argument1, code-named argument2 is message, no own code. handler status only for instance, otherwise500. destroys already-started responses and logs cause chain. Nonce unavailable is fixed message. internal DB diagnostics preserve allowed upstream SQLSTATE/system code or PG_&#42; fallback separately from public error. Actual worker-service uses503 for dependency/busy,422 otherwise.

**Representative source constructions (not executed by this reference):**

```text
new ProductControllerError(response.statusCode, Buffer.concat(chunks))
```

**Owning / consuming source:**

- [skills/prism/server/product-controller.ts:4](../../../skills/prism/server/product-controller.ts#L4)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)
- [skills/prism/server/product-decisions.ts:1](../../../skills/prism/server/product-decisions.ts#L1)

<a id="js-shared-studiorequesterror"></a>

## StudioRequestError

**Representation:** constructor family

**Identity / construction:** code: Argument2 named code is message only.. message: Argument2, current callsites have exact fixed or conditional messages.. status: Argument1 status retained, consumed by Studio HTTP handler.. cause: Optional argument3 as ErrorOptions cause.

**Trigger:** Size/configuration/upstream/path/static/URL guard in Studio request handling.

**Effect:** Handler uses its status. other exceptions500. already-started response destroyed. cause chain diagnostic.

**Retry boundary:** No automatic retry rule.

**Safe next action:** Inspect status/message/cause. upstream failure does not prove action absence.

**Retained evidence:** Status and cause retained, no rollback assertion.

**Consumer / translation:** Controller code exists only for trimmed body matching `DEMO_PRODUCT_`&#91;A-Z_&#93;{1,100}. otherwise message status and codeundefined. Studio constructor status is argument1, code-named argument2 is message, no own code. handler status only for instance, otherwise500. destroys already-started responses and logs cause chain. Nonce unavailable is fixed message. internal DB diagnostics preserve allowed upstream SQLSTATE/system code or PG_&#42; fallback separately from public error. Actual worker-service uses503 for dependency/busy,422 otherwise.

**Representative source constructions (not executed by this reference):**

```text
new StudioRequestError(413, 'PRISM_STUDIO_REQUEST_TOO_LARGE')
```

```text
new StudioRequestError(503, 'PRISM_STUDIO_PROXY_NOT_CONFIGURED')
```

**Owning / consuming source:**

- [skills/prism/server/studio-request.ts:14](../../../skills/prism/server/studio-request.ts#L14)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)
- [skills/prism/server/product-controller.ts:1](../../../skills/prism/server/product-controller.ts#L1)

<a id="js-shared-workerdependencyunavailable"></a>

## WorkerDependencyUnavailable

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Fixed constructor message.

**Trigger:** Nonce database readiness/health path cannot supply required authority.

**Effect:** Worker service translates class to503. database diagnostic code is separate allowed upstream/fallback.

**Retry boundary:** 503 here does not establish automatic safe execution retry.

**Safe next action:** Restore/recheck dependency authority. no fabricated database cause from fixed public message.

**Retained evidence:** Internal readiness diagnostics retained. public message intentionally narrower.

**Consumer / translation:** Controller code exists only for trimmed body matching `DEMO_PRODUCT_`&#91;A-Z_&#93;{1,100}. otherwise message status and codeundefined. Studio constructor status is argument1, code-named argument2 is message, no own code. handler status only for instance, otherwise500. destroys already-started responses and logs cause chain. Nonce unavailable is fixed message. internal DB diagnostics preserve allowed upstream SQLSTATE/system code or PG_&#42; fallback separately from public error. Actual worker-service uses503 for dependency/busy,422 otherwise.

**Representative source constructions (not executed by this reference):**

```text
new WorkerDependencyUnavailable()
```

**Owning / consuming source:**

- [skills/prism/server/worker-readiness.ts:4](../../../skills/prism/server/worker-readiness.ts#L4)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)
- [skills/prism/server/product-controller.ts:1](../../../skills/prism/server/product-controller.ts#L1)

<a id="j17-prism-bound-worker-result"></a>

## Prism worker result and cache error forwarding

**Representation:** failure

**Identity / construction:** code: absent on wrapper Error. message: Binding errors joined in `PRISM_WORKER_RESULT_BINDING_INVALID`. noncompleted result.error?.message ?? Prism worker attempt failed, cause entire result.error. schema/cache guards separate. domain: upstream-open bound worker error. not every worker .code copied onto thrown Error

**Trigger:** Envelope/result version validation then binding fails, noncompleted state, specialist schema mismatch, or cached attempt/request identity missing/mismatched.

**Effect:** Rejects before evidence import/database acknowledgement according to owner. noncompleted only forwarded after binding.

**Retry boundary:** Legacy unbound cache explicitly requires reconciliation. automatic rerun not allowed.

**Safe next action:** Reconcile legacy/unbound cached results explicitly. preserve exact execution and request identity.

**Retained evidence:** Bound attempt/result/cause and stored identity, not replaced by invented generic code.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/control/worker-results.ts:13](../../../skills/prism/control/worker-results.ts#L13)

<a id="j18-openclaw-prism-post"></a>

## Prism tool HTTP forwarding

**Representation:** failure

**Identity / construction:** code: absent. message: non-ok -&gt; value.error &#124;&#124; Prism control returned HTTP &lt;status&gt;. JSON parse failure supplies HTTP &lt;status&gt; fallback first. domain: upstream-open error body/status

**Trigger:** Non-ok response after post. network rejection propagates separately.

**Effect:** Tool execute promise rejects upstream. Successful textResult is separate response rendering.

**Retry boundary:** No automatic retry in post.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Upstream response diagnostic. POST may have changed remote state.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/openclaw-plugin/index.mjs:10](../../../skills/prism/openclaw-plugin/index.mjs#L10)

<a id="j18-studio-180"></a>

## commit document operation

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Design update failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:172](../../../skills/prism/studio/app.tsx#L172)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-244"></a>

## restoreRevision

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Revision restore failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:236](../../../skills/prism/studio/app.tsx#L236)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-273"></a>

## retractPreference

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Preference retraction failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:265](../../../skills/prism/studio/app.tsx#L265)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-297"></a>

## selectDirection

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Direction selection failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:289](../../../skills/prism/studio/app.tsx#L289)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-322"></a>

## recordDirectionFeedback

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Direction feedback failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:314](../../../skills/prism/studio/app.tsx#L314)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-386"></a>

## approval POST

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Approval failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:378](../../../skills/prism/studio/app.tsx#L378)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-401"></a>

## baseline POST after approval

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Baseline publication failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:393](../../../skills/prism/studio/app.tsx#L393)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-studio-438"></a>

## evaluateDesign

**Representation:** failure

**Identity / construction:** code: absent. message: upstream body.error via nullish fallback Design evaluation failed. domain: upstream-open. not a new stable browser code

**Trigger:** Actual owning response not ok, or relevant required success-shape guard fails. fetch/JSON errors can bypass fallback.

**Effect:** Throws. UI callbacks setFailure(String(error)). no rollback proof. Direction mutations retain request key until valid success. approval precedes separate baseline operation.

**Retry boundary:** No blanket eight-operation idempotency or automatic retry promise.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Existing document/approval/direction/pending state can remain. baseline failure does not undo prior approval.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/studio/app.tsx:430](../../../skills/prism/studio/app.tsx#L430)
- [skills/prism/server/control-server.ts:1](../../../skills/prism/server/control-server.ts#L1)

<a id="j18-embedded-product-api"></a>

## Embedded product operator API and pending intent

**Representation:** failure

**Identity / construction:** code: absent. direct Error(...) calls are valid constructors without new. message: api uses result.error &#124;&#124; Request rejected. local guard messages and original intent errors separate. domain: upstream-open API message and symbolic pending decision ID

**Trigger:** Non-ok fetch response. missing ready subject/reason, oversized reason, invalid extension, pending decision or absent original intent.

**Effect:** show catches error.message into textContent. Intent stored before submission. Matching applied receipt clears pending. pending202 is not thrown. leave moves intent to unresolved history and does not cancel/reject.

**Retry boundary:** retry submits exact stored intent, not a new ID. no original intent means no retry submission.

**Safe next action:** Recover original decision. reuse stored intent only. Do not treat pending or leave-unresolved as rejection.

**Retained evidence:** Local pending/original/unresolved intent and durable decision history remain separate authorities.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/prism/server/product-operator-page.ts:1](../../../skills/prism/server/product-operator-page.ts#L1)
- [skills/prism/server/product-decisions.ts:1](../../../skills/prism/server/product-decisions.ts#L1)

<a id="sql-migration-001-prism"></a>

## Database: `001_prism.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/001_prism.sql:1](../../../skills/prism/storage/migrations/001_prism.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-002-engine-operation-results"></a>

## Database: `002_engine_operation_results.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/002_engine_operation_results.sql:1](../../../skills/prism/storage/migrations/002_engine_operation_results.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-003-worker-nonce"></a>

## Database: `003_worker_nonce.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/003_worker_nonce.sql:1](../../../skills/prism/storage/migrations/003_worker_nonce.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-004-approval-warnings"></a>

## Database: `004_approval_warnings.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/004_approval_warnings.sql:1](../../../skills/prism/storage/migrations/004_approval_warnings.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-005-direction-source"></a>

## Database: `005_direction_source.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/005_direction_source.sql:1](../../../skills/prism/storage/migrations/005_direction_source.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-006-design-request"></a>

## Database: `006_design_request.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/006_design_request.sql:1](../../../skills/prism/storage/migrations/006_design_request.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-007-direction-evidence"></a>

## Database: `007_direction_evidence.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/007_direction_evidence.sql:1](../../../skills/prism/storage/migrations/007_direction_evidence.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-008-document-request-binding"></a>

## Database: `008_document_request_binding.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/008_document_request_binding.sql:1](../../../skills/prism/storage/migrations/008_document_request_binding.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-009-corpus-source-evidence"></a>

## Database: `009_corpus_source_evidence.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/009_corpus_source_evidence.sql:1](../../../skills/prism/storage/migrations/009_corpus_source_evidence.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-010-direction-unsourced-uniqueness"></a>

## Database: `010_direction_unsourced_uniqueness.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Archives duplicate unsourced directions into `direction_duplicate_archive` with `row_data/reason` before deleting selected originals. `archive_reason` duplicate-unsourced-direction-key is retained data classification, not thrown error.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Archives duplicate unsourced directions into `direction_duplicate_archive` with `row_data/reason` before deleting selected originals. `archive_reason` duplicate-unsourced-direction-key is retained data classification, not thrown error.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/010_direction_unsourced_uniqueness.sql:1](../../../skills/prism/storage/migrations/010_direction_unsourced_uniqueness.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-011-preference-wire-ids"></a>

## Database: `011_preference_wire_ids.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/011_preference_wire_ids.sql:1](../../../skills/prism/storage/migrations/011_preference_wire_ids.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-012-preference-generation"></a>

## Database: `012_preference_generation.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/012_preference_generation.sql:1](../../../skills/prism/storage/migrations/012_preference_generation.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-013-design-round"></a>

## Database: `013_design_round.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/013_design_round.sql:1](../../../skills/prism/storage/migrations/013_design_round.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-014-agent-jobs"></a>

## Database: `014_agent_jobs.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/014_agent_jobs.sql:1](../../../skills/prism/storage/migrations/014_agent_jobs.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-015-product-decisions"></a>

## Database: `015_product_decisions.sql`

**Representation:** owned-DDL-data-and-constraint-policy; DB-engine-errors-not-new-owned-codes

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Primary/foreign/unique/not-null/check/index definitions are owned failure conditions enforced by PostgreSQL. Do not manufacture PostgreSQL message text or SQLSTATE per constraint unless actual source/consumer establishes it. capture exact relation/constraint and caller propagation. Dropped/replaced constraints and partial indexes must retain migration order.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/015_product_decisions.sql:1](../../../skills/prism/storage/migrations/015_product_decisions.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-016-preference-legacy-insert-compatibility"></a>

## Database: `016_preference_legacy_insert_compatibility.sql`

**Representation:** owned-compatibility-transform-and-trigger-not-error

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** BEFORE INSERT fallback COALESCE content.eventId/id for `wire_event_id`, no RAISE and no error code. Retains 011 unique/receipt-pair constraints.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/016_preference_legacy_insert_compatibility.sql:1](../../../skills/prism/storage/migrations/016_preference_legacy_insert_compatibility.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-migration-017-native-operation-identity"></a>

## Database: `017_native_operation_identity.sql`

**Representation:** owned-RAISE-message-and-explicit-SQLSTATE-plus-constraints

**Identity / construction:** Exact complete SQL DDL/data/trigger program. named constraints and stored values are not automatically thrown codes.

**Trigger:** Exact migration operations and later database operations under installed constraints. migration ordering, drops, replacements and partial predicates remain operative.

**Effect:** Own message `PRISM_NATIVE_OPERATION_IDENTITY_IMMUTABLE` and explicit ERRCODE23000 are distinct fields. BEFORE UPDATE `engine_operation` row trigger, only OLD.attempt IS NOT NULL. Rejects changed `attempt/idempotency_key/created_at/attempt_id/request_digest/operation`, or changes to already non-null `result/completed_at`. Check constraint `native_operation_identity` separately permits attemptNULL or enforces `object/schemaVersion/executionId/request_digest` with IS TRUE. No insert RAISE equivalence and no all-row immutable assertion.

**Retry boundary:** OnFailure/backoffLimit3 belongs to the migration Job, not every database error. No universal retry or replay success.

**Safe next action:** No automatic data deletion or constraint removal recommendation. preserve the exact source and actual database-state uncertainty.

**Retained evidence:** Source does not establish actual retained database state. transaction rollback is attempted on caught migration failure.

**Consumer / translation:** storage/index.ts migrate lines21-80 sorts admitted filenames, begins transaction, advisory lock, branches embedded/preprovisioned bootstrap, then reads/execs or queries unapplied SQL and records filename. COMMIT or ROLLBACK+rethrow. release in finally. server/migrate.ts calls preprovisioned and ends pool. chart jobs has OnFailure/backoffLimit3. this is migration job behavior, not a universal per-error retry guarantee.

**Owning / consuming source:**

- [skills/prism/storage/migrations/017_native_operation_identity.sql:1](../../../skills/prism/storage/migrations/017_native_operation_identity.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)
- [skills/prism/server/migrate.ts:1](../../../skills/prism/server/migrate.ts#L1)

<a id="sql-017-update-identity-raise"></a>

## Database: `017_native_operation_identity.sql`

**Representation:** owned-message-explicit-sqlstate

**Identity / construction:** Message `PRISM_NATIVE_OPERATION_IDENTITY_IMMUTABLE`; SQLSTATE 23000. The message and SQLSTATE are distinct fields.

**Trigger:** Own message `PRISM_NATIVE_OPERATION_IDENTITY_IMMUTABLE` and explicit ERRCODE23000 are distinct fields. BEFORE UPDATE `engine_operation` row trigger, only OLD.attempt IS NOT NULL. Rejects changed `attempt/idempotency_key/created_at/attempt_id/request_digest/operation`, or changes to already non-null `result/completed_at`. Check constraint `native_operation_identity` separately permits attemptNULL or enforces `object/schemaVersion/executionId/request_digest` with IS TRUE. No insert RAISE equivalence and no all-row immutable assertion.

**Effect:** PostgreSQL raises the explicit message and SQLSTATE 23000. this rejected UPDATE does not become a successful row change. The surrounding transaction and caller determine rollback and later handling.

**Retry boundary:** No retry policy in function.

**Safe next action:** No bypass or mutation recommendation. inspect exact rejected transition.

**Retained evidence:** No successful update or recovery claimed. actual transaction outcome requires consumer execution evidence.

**Consumer / translation:** PostgreSQL BEFORE UPDATE row trigger. database client receives rejection. Do not equate CHECK failures or INSERT with this RAISE.

**Owning / consuming source:**

- [skills/prism/storage/migrations/017_native_operation_identity.sql:1](../../../skills/prism/storage/migrations/017_native_operation_identity.sql#L1)
- [skills/prism/storage/index.ts:21](../../../skills/prism/storage/index.ts#L21)

<a id="backup-shell-fail-constructor"></a>

## backup-shell:fail-constructor

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Symbolic prefix `PRISM_BACKUP_` plus positional $1, newline on stderr, exit 1 in current shell. no stack unwinding into a caller return.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-positive-validator"></a>

## backup-shell:positive-validator

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Reject $2 unless it matches ^&#91;1-9&#93;&#91;0-9&#93;{0,12}$. forward INVALID_$1 to fail.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-file-validator"></a>

## backup-shell:file-validator

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Require regular file and not symlink. fail `FILE_INVALID`. size delegates stat output/status without an owned error translation.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-configuration"></a>

## backup-shell:configuration

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Shell :? checks are code-absent shell diagnostics. Validate positive settings, root absolute/not root/not symlink, required tools, then mkdir and realpath equality.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-artifact-name-control"></a>

## backup-shell:artifact-name-control

**Representation:** control-or-upstream-status

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Boolean name check: two lowercase hex prefix characters and 64 lowercase hex digest with matching prefix.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-database-readiness"></a>

## backup-shell:database-readiness

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-artifact-index"></a>

## backup-shell:artifact-index

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Enumerate sorted NUL-separated objects, reject invalid root/files/names/digests. accepted two-hex directories are control continue. Outputs index records.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-verify-group"></a>

## backup-shell:verify-group

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** `artifact_index` validates each directory/file/symlink/name/digest. `verify_group` validates original files, hashes, format, total size and reconstructed index. fail exits current shell. under if ! `artifact_index`, explicit fail does not return to wrapper. `ARTIFACT_VERIFICATION_FAILED` is the nonzero-return branch, not blanket translation of all nested failure codes.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-backup-stage-publication"></a>

## backup-shell:backup-stage-publication

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Validate database/image/artifact roots, capacity, readiness. create incomplete stage, dump first, copy objects, index, metadata, checksums, sync, rename, postcheck and verify.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-latest-group"></a>

## backup-shell:latest-group

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Select lexically last backup-&#42; directory from actual find/sort/tail. empty selection fails `COMPLETED_GROUP_MISSING`. verify selected group.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-database-proof-cleanup"></a>

## backup-shell:database-proof-cleanup

**Representation:** control-or-upstream-status

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** `database_proof` is SQL smoke test, not DR proof. Generates owned database name. `proof_created` gates drop cleanup. EXIT preserves original nonzero status over cleanup failure. if original success, returns cleanup status. TERM/INT -&gt;143/130. Existing completed groups not restored in place. Upstream `createdb/pg_restore/psql/dropdb` errors have no newly owned stable code.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<a id="backup-shell-dispatch-lock-timeout"></a>

## backup-shell:dispatch-lock-timeout

**Representation:** owned-symbolic-or-literal-diagnostic

**Identity / construction:** fail: `PRISM_BACKUP_` + argument1, stderr newline, exit1. positive: INVALID_ + parameter1 forwarded to fail. actual configuration caller loop has `BACKUP_MAXIMUM_BYTES`, `BACKUP_MAXIMUM_RETAINED_BYTES`, `BACKUP_MAXIMUM_DURATION_SECONDS`. toolLoop: &#91;'flock', 'sha256sum', 'stat', 'du', 'timeout', 'sync', 'find', 'sort', 'cmp', 'cp'&#93;. pgIsReady: separate constant `TOOL_MISSING_pg_isready`. file: every file(path) failure emits same `FILE_INVALID`. the path is a trigger/context, not added to the code

**Trigger:** Run configuration, require public mode backup&#124;verify&#124;database-proof. exec timeout and nonblocking exclusive flock to self `_locked`. exact argument count and dispatch validated.

**Effect:** Exact selected unit and fail helper determine diagnostic/status and partial side effects. fail exits current shell. No universal rollback.

**Retry boundary:** `database_ready` retries ONLY `pg_isready` status1&#124;2 at one-second intervals within timeout30/kill-after1. Other `pg_isready` status exits inner shell. No dump/restore retry. Job backoffLimit0, restartPolicyNever. concurrencyPolicyForbid is not evidence that other actors cannot write.

**Safe next action:** No automatic deletion, in-place restoration, repeated dump or repeated restore recommended. Preserve actual failed stage and inspect its reached branch.

**Retained evidence:** No automatic deletion or in-place restoration of completed backup groups. A stage created before dump is .incomplete-&#42;. dump/size failures retain it. Later uncoded command failures can also leave partial staging/temporary listings. Final rename+postcheck/sync/verify can fail after a final directory exists. do not promise every failure leaves no completed-named group. Explicit cleanup removes owned temporary listings/checkfiles on the exact reached branches only.

**Consumer / translation:** backup.yaml mounts exact Files.Get program. ranges backup/verify/database-proof. postgresql.enabled controls creation. exact args select natural functions. timeout+nonblocking flock bounds all modes. environment :? failures are shell diagnostics, not `PRISM_BACKUP` codes.

**Owning / consuming source:**

- [charts/prism/files/prism-backup.sh:1](../../../charts/prism/files/prism-backup.sh#L1)
- [charts/prism/templates/backup.yaml:1](../../../charts/prism/templates/backup.yaml#L1)

<!-- END GENERATED: common error catalogue -->
