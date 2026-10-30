# Nova projects and review — error catalogue

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

- [NovaGateTimeoutError](#js-shared-novagatetimeouterror)
- [TestPlanResolutionError](#js-shared-testplanresolutionerror)
- [RemotePlanTransportError](#js-shared-remoteplantransporterror)
- [LintPolicyError](#js-shared-lintpolicyerror)
- [LintReportContractError](#js-shared-lintreportcontracterror)
- [LintToolExecutionError](#js-shared-linttoolexecutionerror)
- [RepositoryAuditCacheIntegrityError](#js-shared-repositoryauditcacheintegrityerror)
- [RepositoryAuditIntegrityError](#js-shared-repositoryauditintegrityerror)
- [RepositoryAuditInfrastructureError](#js-shared-repositoryauditinfrastructureerror)
- [RepositoryRevalidationIntegrityError](#js-shared-repositoryrevalidationintegrityerror)
- [ReviewContentCacheIntegrityError](#js-shared-reviewcontentcacheintegrityerror)
- [ReviewContextHydrationLimitError](#js-shared-reviewcontexthydrationlimiterror)
- [ReviewGovernorIntegrityError](#js-shared-reviewgovernorintegrityerror)
- [ReviewPhaseAdmissionError](#js-shared-reviewphaseadmissionerror)
- [ReviewPreparationLimitError](#js-shared-reviewpreparationlimiterror)
- [ReviewPreparationIntegrityError](#js-shared-reviewpreparationintegrityerror)
- [ReviewRepositoryProofError](#js-shared-reviewrepositoryprooferror)
- [ReviewRuntimeAttestationError](#js-shared-reviewruntimeattestationerror)
- [ReviewSemanticFlowIntegrityError](#js-shared-reviewsemanticflowintegrityerror)
- [ReviewVerificationRequestLimitError](#js-shared-reviewverificationrequestlimiterror)
- [ReviewStageIntegrityError](#js-shared-reviewstageintegrityerror)
- [Adapter receipt failure to plain Error](#j14-adapter-receipt-forwarding)
- [Stage exception to result reason](#j14-stage-failure-translation)
- [Completed attempt cleanup control](#j14-stage-completion-control)
- [Durable adapter failure receipt and lock-release aggregation](#j14-durable-failure-receipt)
- [Confidential effect failure redaction](#j14-confidential-audit-failure)
- [skills/nova/plugins/remote-test-gate/src/adapter.ts::canonicalDirectory](#j15-helper-6)
- [skills/nova/plugins/remote-test-gate/src/adapter.ts::string](#j15-helper-7)
- [skills/nova/plugins/remote-test-gate/src/adapter.ts::positiveInteger](#j15-helper-8)
- [skills/nova/plugins/repository-adapter/src/revision-reader.ts::assertExpected](#j15-helper-9)
- [FileMutex timeout and acquisition failures](#j16-file-mutex)

<a id="js-shared-novagatetimeouterror"></a>

## NovaGateTimeoutError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Constructor supplies fixed message.

**Trigger:** Deadline guard or abort/timeout helper reaches actual constructor.

**Effect:** Rejects local gate wait. remote reconciliation state remains separately owned.

**Retry boundary:** Timeout does not prove remote operation cancelled or absent.

**Safe next action:** Reconcile actual persisted remote status before new submission.

**Retained evidence:** Existing remote state and unknown outcome retained by dispatch interruption path.

**Consumer / translation:** Resolution code/detail separate, helper code argument1, message code:detail. Remote transport message has owned prefix/status or external cause. retryable is explicit boolean from status policy408/425/429/&gt;=500/network, not name suffix. Poll establishes absence before submit. interruption persists remote state and retains unknown, cannot treat404 as cancellation. Error Object.assign reconciliation and AggregateError causes must survive.

**Representative source constructions (not executed by this reference):**

```text
new NovaGateTimeoutError()
```

**Owning / consuming source:**

- [skills/nova/core/test-gates/deadline.ts:2](../../../skills/nova/core/test-gates/deadline.ts#L2)
- [skills/nova/core/test-gates/dispatch-operation.ts:1](../../../skills/nova/core/test-gates/dispatch-operation.ts#L1)
- [skills/nova/core/test-gates/http-response.ts:1](../../../skills/nova/core/test-gates/http-response.ts#L1)

<a id="js-shared-testplanresolutionerror"></a>

## TestPlanResolutionError

**Representation:** constructor family

**Identity / construction:** code: Argument1 through module-local fail(code,detail). public constructor string.. message: Argument1 + colon + argument2 detail.

**Trigger:** Module-local resolution fail helper receives code/detail from actual invalid plan/provider condition.

**Effect:** Throws code:detail. typed class .code separate.

**Retry boundary:** No automatic retry in resolver.

**Safe next action:** Inspect exact resolution requirement and supplied plan/provider context.

**Retained evidence:** code/message only. not a durable rollback receipt.

**Consumer / translation:** Resolution code/detail separate, helper code argument1, message code:detail. Remote transport message has owned prefix/status or external cause. retryable is explicit boolean from status policy408/425/429/&gt;=500/network, not name suffix. Poll establishes absence before submit. interruption persists remote state and retains unknown, cannot treat404 as cancellation. Error Object.assign reconciliation and AggregateError causes must survive.

**Representative source constructions (not executed by this reference):**

```text
new TestPlanResolutionError(code, detail)
```

**Owning / consuming source:**

- [skills/nova/core/test-gates/resolver.ts:38](../../../skills/nova/core/test-gates/resolver.ts#L38)
- [skills/nova/core/test-gates/deadline.ts:1](../../../skills/nova/core/test-gates/deadline.ts#L1)
- [skills/nova/core/test-gates/dispatch-operation.ts:1](../../../skills/nova/core/test-gates/dispatch-operation.ts#L1)

<a id="js-shared-remoteplantransporterror"></a>

## RemotePlanTransportError

**Representation:** constructor family

**Identity / construction:** code: No .code assignment.. message: Argument1 includes owned HTTP/status/prefix constructions or other supplied messages.. retryable: Argument2 boolean. does not itself execute retry.. cause: Argument3 retained when not undefined.

**Trigger:** HTTP status/size, cancellation or network branch constructs transport failure.

**Effect:** Throws message plus explicit retryable flag/cause. dispatch consumer applies its bounded policy.

**Retry boundary:** retryableStatus permits408/425/429/&gt;=500. network path true, cancellation/size false. No class-level retry execution or cancellation proof.

**Safe next action:** Preserve/reconcile job identity and status. only dispatch consumer authorizes submission/retry.

**Retained evidence:** cause plus persisted remote dispatch state;404 is not cancellation proof.

**Consumer / translation:** Resolution code/detail separate, helper code argument1, message code:detail. Remote transport message has owned prefix/status or external cause. retryable is explicit boolean from status policy408/425/429/&gt;=500/network, not name suffix. Poll establishes absence before submit. interruption persists remote state and retains unknown, cannot treat404 as cancellation. Error Object.assign reconciliation and AggregateError causes must survive.

**Representative source constructions (not executed by this reference):**

```text
new RemotePlanTransportError(`${prefix}_HTTP_${response.status}`, retryableStatus(response.status))
```

```text
new RemotePlanTransportError(`${prefix}_SIZE_EXCEEDED`, false)
```

**Owning / consuming source:**

- [skills/nova/core/test-gates/transport-error.ts:1](../../../skills/nova/core/test-gates/transport-error.ts#L1)
- [skills/nova/core/test-gates/http-response.ts:6](../../../skills/nova/core/test-gates/http-response.ts#L6)
- [skills/nova/core/test-gates/remote-dispatch.ts:148](../../../skills/nova/core/test-gates/remote-dispatch.ts#L148)

<a id="js-shared-lintpolicyerror"></a>

## LintPolicyError

**Representation:** constructor family

**Identity / construction:** code: Own constant field.. message: Argument1. local fail builds field: message.

**Trigger:** Module-local policy validation fail(field,message).

**Effect:** Throws fixed code with exact field diagnostic.

**Retry boundary:** No retry in validator.

**Safe next action:** Inspect rejected policy field. no code-derived repair recommendation.

**Retained evidence:** message/code. no external lint execution implied.

**Consumer / translation:** First two fixed .code plus field/path:message. ExecutionError configurable .code. failParse produces lower-case toolId-parse-failed, message includes external parse/error/output preview. executionError forwards string error.code or lint-tool-execution-failed. Missing required binary returns result status:error/code lint-tool-binary-missing. optional missing returns `not_applicable`, not failure. Experimental findings and ok status do not turn every severity error string into execution failure.

**Representative source constructions (not executed by this reference):**

```text
new LintPolicyError(`${field}: ${message}`)
```

**Owning / consuming source:**

- [skills/nova/plugins/lint/src/engine/policy-validation.ts:3](../../../skills/nova/plugins/lint/src/engine/policy-validation.ts#L3)
- [skills/nova/plugins/lint/src/engine/architecture-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/architecture-tools.ts#L1)
- [skills/nova/plugins/lint/src/engine/container-yaml-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/container-yaml-tools.ts#L1)

<a id="js-shared-lintreportcontracterror"></a>

## LintReportContractError

**Representation:** constructor family

**Identity / construction:** code: Own constant field.. message: Argument1. local fail builds path: message.

**Trigger:** Module-local report contract fail(path,message).

**Effect:** Throws fixed code and path diagnostic.

**Retry boundary:** No retry in validator.

**Safe next action:** Inspect report contract mismatch. do not convert invalid report to clean findings.

**Retained evidence:** message/code. report validity not established.

**Consumer / translation:** First two fixed .code plus field/path:message. ExecutionError configurable .code. failParse produces lower-case toolId-parse-failed, message includes external parse/error/output preview. executionError forwards string error.code or lint-tool-execution-failed. Missing required binary returns result status:error/code lint-tool-binary-missing. optional missing returns `not_applicable`, not failure. Experimental findings and ok status do not turn every severity error string into execution failure.

**Representative source constructions (not executed by this reference):**

```text
new LintReportContractError(`${path}: ${message}`)
```

**Owning / consuming source:**

- [skills/nova/plugins/lint/src/engine/report-contract.ts:12](../../../skills/nova/plugins/lint/src/engine/report-contract.ts#L12)
- [skills/nova/plugins/lint/src/engine/architecture-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/architecture-tools.ts#L1)
- [skills/nova/plugins/lint/src/engine/container-yaml-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/container-yaml-tools.ts#L1)

<a id="js-shared-linttoolexecutionerror"></a>

## LintToolExecutionError

**Representation:** constructor family

**Identity / construction:** code: Argument1. failConfigMissing caller code, or failParse toolId-parse-failed. Known supplied adapter IDs do not close exported helper inputs.. message: Argument2. failParse includes parseError/exitCode/bounded upstream output preview.

**Trigger:** Configuration failure or parse/output guard in imported adapter helper.

**Effect:** runTool catches inside execution boundary and returns status:error with string .code. cancellation still rejects. Required missing binary is a separate result code.

**Retry boundary:** No automatic lint retry in this owner.

**Safe next action:** Inspect exact helper/adapter output and configuration. do not treat finding severity as tool execution error.

**Retained evidence:** Bounded output preview/message. persistent caches may exist. only actual temporary-directory finally paths promise cleanup attempts.

**Consumer / translation:** First two fixed .code plus field/path:message. ExecutionError configurable .code. failParse produces lower-case toolId-parse-failed, message includes external parse/error/output preview. executionError forwards string error.code or lint-tool-execution-failed. Missing required binary returns result status:error/code lint-tool-binary-missing. optional missing returns `not_applicable`, not failure. Experimental findings and ok status do not turn every severity error string into execution failure.

**Representative source constructions (not executed by this reference):**

```text
new LintToolExecutionError(code, message)
```

```text
new LintToolExecutionError(`${toolId}-parse-failed`, message)
```

**Owning / consuming source:**

- [skills/nova/plugins/lint/src/engine/report.ts:40](../../../skills/nova/plugins/lint/src/engine/report.ts#L40)
- [skills/nova/plugins/lint/src/engine/architecture-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/architecture-tools.ts#L1)
- [skills/nova/plugins/lint/src/engine/container-yaml-tools.ts:1](../../../skills/nova/plugins/lint/src/engine/container-yaml-tools.ts#L1)

<a id="js-shared-repositoryauditcacheintegrityerror"></a>

## RepositoryAuditCacheIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Rejects missing attempt, profile encoding/record version, conflicting digests or profile-sensitive sizes, malformed adapter record/artifact, failed serialized proof, read metadata/content mismatch and write producer/metadata mismatch. No candidates is undefined (miss). invalid candidate is not a miss. Upstream artifacts.read/write failures outside proof catches remain original.

**Effect:** executeRepositoryAudit converts this class to blocked `kubeclaw.review.repository_audit_incomplete`. Previously checkpointed artifacts are not erased.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** executeRepositoryAudit converts this class to blocked `kubeclaw.review.repository_audit_incomplete`. Previously checkpointed artifacts are not erased.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new RepositoryAuditCacheIntegrityError('repository review cache adapter returned invalid output')
```

```text
new RepositoryAuditCacheIntegrityError('repository review cache adapter returned no artifact')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/repository-audit-cache.ts:11](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L11)
- [skills/nova/plugins/review/src/repository-audit-stage.ts:1](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L1)

<a id="js-shared-repositoryauditintegrityerror"></a>

## RepositoryAuditIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** The audit rejects invalid artifacts, source budgets, byte/object/head/digest proofs, inventory scope and compiler failures. It also checks prepared plans, requested sources, review completeness, expansion limits and exact result job sets. Report, follow-up, simplification and coverage proofs remain separate guards. This class is not a code field.

**Effect:** executeRepositoryAudit converts to `repository_audit_incomplete`. selectExpansionJobs catches this class only to reject an over-budget selection before a final enforced budget. Plan/report/cache/follow-up writes can precede a later failure.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** executeRepositoryAudit converts to `repository_audit_incomplete`. selectExpansionJobs catches this class only to reject an over-budget selection before a final enforced budget. Plan/report/cache/follow-up writes can precede a later failure.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new RepositoryAuditIntegrityError('artifact adapter returned invalid output')
```

```text
new RepositoryAuditIntegrityError('artifact adapter returned no artifact')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/repository-audit-stage.ts:42](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L42)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-repositoryauditinfrastructureerror"></a>

## RepositoryAuditInfrastructureError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** auditDispatch wraps any caught non-unresolved, non-attestation dispatch exception with review/verification label and original message. This includes errors thrown by callbacks within that execution boundary, not network errors.

**Effect:** Not caught by executeRepositoryAudit. propagates to caller/Core. Comment describes bounded stage-attempt retry from checkpoints. this Source input does not assert an actual retry or a universal retry entitlement.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** Not caught by executeRepositoryAudit. propagates to caller/Core. Comment describes bounded stage-attempt retry from checkpoints. this Source input does not assert an actual retry or a universal retry entitlement.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new RepositoryAuditInfrastructureError(
      `repository audit ${label} dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
    )
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/repository-audit-stage.ts:43](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L43)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-repositoryrevalidationintegrityerror"></a>

## RepositoryRevalidationIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** integrity wraps synchronous input/result checks. helpers validate baseline reference/records/version/count/path/digest/map relations, read proof, remediation dependencies/cycles/supersession, stored artifact proof, ancestry. Artifact/runtime invocations outside the wrappers can retain original errors.

**Effect:** dispatchOne retries caught failures through maxRetries. It invokes shared admission before each retry, but immediately rethrows `EFFECT_OUTCOME_UNRESOLVED`. Final execute catches only this class or PhaseAdmissionError and returns blocked `repository_revalidation_incomplete`. Earlier calls/writes are not rollback proof.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** dispatchOne retries caught failures through maxRetries. It invokes shared admission before each retry, but immediately rethrows `EFFECT_OUTCOME_UNRESOLVED`. Final execute catches only this class or PhaseAdmissionError and returns blocked `repository_revalidation_incomplete`. Earlier calls/writes are not rollback proof.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new RepositoryRevalidationIntegrityError(error instanceof Error ? error.message : String(error))
```

```text
new RepositoryRevalidationIntegrityError(`${label} is invalid`)
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/repository-revalidation-stage.ts:21](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L21)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewcontentcacheintegrityerror"></a>

## ReviewContentCacheIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Rejects record schema/value/digest proof (parse wrapped), encoding profile mismatch, duplicate unit IDs, unknown/duplicate checkpoint, missing/unknown execution results. Undefined or nonreusable valid entries become misses. Store read/write and execute errors are not all recast.

**Effect:** Repository audit catches it to blocked incomplete. Concurrency settles outstanding read workers then rethrows stored failure. prior checkpoints can remain.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** Repository audit catches it to blocked incomplete. Concurrency settles outstanding read workers then rethrows stored failure. prior checkpoints can remain.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewContentCacheIntegrityError('review cache read index is invalid')
```

```text
new ReviewContentCacheIntegrityError('review cache unit IDs are duplicated')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-content-cache.ts:37](../../../skills/nova/plugins/review/src/review-content-cache.ts#L37)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewcontexthydrationlimiterror"></a>

## ReviewContextHydrationLimitError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** hydrate maps only Error.message containing `REPOSITORY_FILE_TOO_LARGE`. changed-file count and hard accumulated candidate bytes have own constructors. Optional dependency candidates too large are skipped. changed-file failures propagate.

**Effect:** reviewCandidates maps surviving hydration errors to PreparationLimit. This is not an automatic failure for every optional omitted context file.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** reviewCandidates maps surviving hydration errors to PreparationLimit. This is not an automatic failure for every optional omitted context file.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewContextHydrationLimitError(`${candidate.path} exceeds the context file byte limit`)
```

```text
new ReviewContextHydrationLimitError('changed files exceed the context file limit')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-context-candidates.ts:15](../../../skills/nova/plugins/review/src/review-context-candidates.ts#L15)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewgovernorintegrityerror"></a>

## ReviewGovernorIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Missing certified lifecycle. baseline base/policy/prefix mismatch. historical response/encoding/digest/size/report/producer mismatch. missing prior report for consumed cycles. Read invocation is explicitly wrapped. generic codec operations outside that wrapper are not automatically this class.

**Effect:** stage.reviewGovernor catches only this class or RepositoryProofError to build `invalid_state` governor. applyReviewGovernor preserves an already blocked result, otherwise returns `governor_invalid_state`. other decisions have separate wait/scope rules.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** stage.reviewGovernor catches only this class or RepositoryProofError to build `invalid_state` governor. applyReviewGovernor preserves an already blocked result, otherwise returns `governor_invalid_state`. other decisions have separate wait/scope rules.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewGovernorIntegrityError('prior review report response is invalid')
```

```text
new ReviewGovernorIntegrityError(
      `review governor history artifact could not be read: ${error instanceof Error ? error.message : String(error)}`,
    )
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-governor.ts:15](../../../skills/nova/plugins/review/src/review-governor.ts#L15)
- [skills/nova/plugins/review/src/review-governor-history.ts:28](../../../skills/nova/plugins/review/src/review-governor-history.ts#L28)

<a id="js-shared-reviewphaseadmissionerror"></a>

## ReviewPhaseAdmissionError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Shared retry counter exhaustion and static count &gt; maximum, not a transient transport code. retry decrements only when admitted.

**Effect:** Revalidation catches directly. Audit passes retry callback into dispatch. an exhausted callback propagates through auditDispatch as InfrastructureError. Do not promise another retry because this class name contains admission.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** Revalidation catches directly. Audit passes retry callback into dispatch. an exhausted callback propagates through auditDispatch as InfrastructureError. Do not promise another retry because this class name contains admission.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewPhaseAdmissionError('review phase shared retry budget exhausted')
```

```text
new ReviewPhaseAdmissionError(`review phase job budget exceeded: ${count} > ${maximum}`)
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-phase-admission.ts:1](../../../skills/nova/plugins/review/src/review-phase-admission.ts#L1)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewpreparationlimiterror"></a>

## ReviewPreparationLimitError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Hard simplification evidence/bundle byte limits, changed files missing from candidate pool, slice construction failures, hydration-limit conversion.

**Effect:** knownFailureResult creates limitViolations, not integrityIssues. Reducer requests orchestrator when valid wait exists, otherwise blocked `missing_orchestrator_wait`. Preparation failure returns before report persistence. later failure paths may persist.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** knownFailureResult creates limitViolations, not integrityIssues. Reducer requests orchestrator when valid wait exists, otherwise blocked `missing_orchestrator_wait`. Preparation failure returns before report persistence. later failure paths may persist.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewPreparationLimitError('Simplification candidate evidence exceeds the review evidence limit')
```

```text
new ReviewPreparationLimitError(`review bundle is ${bytes} bytes`)
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-preparation.ts:22](../../../skills/nova/plugins/review/src/review-preparation.ts#L22)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewpreparationintegrityerror"></a>

## ReviewPreparationIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Wraps non-proof/non-hydration failures inside reviewCandidates and initial selection errors. Does not blanket-wrap every prepareReview operation.

**Effect:** knownFailureResult -&gt; invalid input -&gt; reducer `untrusted_state` blocked. Generic errors outside guarded conversions propagate.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** knownFailureResult -&gt; invalid input -&gt; reducer `untrusted_state` blocked. Generic errors outside guarded conversions propagate.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewPreparationIntegrityError(error instanceof Error ? error.message : String(error))
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-preparation.ts:23](../../../skills/nova/plugins/review/src/review-preparation.ts#L23)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewrepositoryprooferror"></a>

## ReviewRepositoryProofError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Malformed frozen revision, changed scope/ranges, revision path/reference proof, hydrated revision proof, candidate head mismatch. exact per-throw source predicates retained. Underlying repository invocation exceptions are distinct unless a surrounding caller converts them.

**Effect:** knownFailureResult integrity path or governor `invalid_state` according to call site. not a universal repository-read retry classification.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** knownFailureResult integrity path or governor `invalid_state` according to call site. not a universal repository-read retry classification.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewRepositoryProofError(error instanceof Error ? error.message : String(error))
```

```text
new ReviewRepositoryProofError('revision path list is invalid')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-repository.ts:10](../../../skills/nova/plugins/review/src/review-repository.ts#L10)
- [skills/nova/plugins/review/src/review-context-candidates.ts:171](../../../skills/nova/plugins/review/src/review-context-candidates.ts#L171)

<a id="js-shared-reviewruntimeattestationerror"></a>

## ReviewRuntimeAttestationError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Malformed object/exact fields/version/runtime, incomplete trimmed identity or digest, and mismatching expected identity.

**Effect:** Scalable dispatch retries within configured loop except unresolved effects. at exhaustion auditDispatch converts this class to AuditIntegrity. Cache result identity assertions outside auditDispatch propagate directly. Revalidation integrity wrapper converts attestation failure to RevalidationIntegrity before bounded retry.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** Scalable dispatch retries within configured loop except unresolved effects. at exhaustion auditDispatch converts this class to AuditIntegrity. Cache result identity assertions outside auditDispatch propagate directly. Revalidation integrity wrapper converts attestation failure to RevalidationIntegrity before bounded retry.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewRuntimeAttestationError('review runtime attestation is missing')
```

```text
new ReviewRuntimeAttestationError('review runtime attestation is invalid')
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-runtime-attestation.ts:16](../../../skills/nova/plugins/review/src/review-runtime-attestation.ts#L16)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewsemanticflowintegrityerror"></a>

## ReviewSemanticFlowIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.. state: Argument2 state retained.. kind: Argument3 integrity&#124;limit defaults integrity. consumer branches on it.

**Trigger:** Carries state plus kind. Only VerificationRequestLimit maps kind limit. verdict mapping and findings construction wrap failures with preflight/reconciliation/verdict state and default integrity.

**Effect:** stage preserves carried state when persisting outcome. kind limit follows orchestration limit path. integrity follows `untrusted_state`. Unrelated dispatch/read errors propagate.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** stage preserves carried state when persisting outcome. kind limit follows orchestration limit path. integrity follows `untrusted_state`. Unrelated dispatch/read errors propagate.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewSemanticFlowIntegrityError(
      error instanceof Error ? error.message : String(error),
      { ...(preflight === undefined ? {} : { preflight }), findings: [] },
      'limit',
    )
```

```text
new ReviewSemanticFlowIntegrityError(
      error instanceof Error ? error.message : String(error), { preflight, reconciliation, findings: [] },
    )
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-semantic-flow.ts:22](../../../skills/nova/plugins/review/src/review-semantic-flow.ts#L22)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)
- [skills/nova/plugins/review/src/repository-audit-stage.ts:1](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L1)

<a id="js-shared-reviewverificationrequestlimiterror"></a>

## ReviewVerificationRequestLimitError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.

**Trigger:** Actual serialized semantic verification request &gt; hard byte limit. zero eligible proposals or preflight failures return undefined without this exception.

**Effect:** SemanticFlow converts to kind limit carrying preflight. knownFailureResult also handles direct class. No dispatch happens on oversized request path.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** SemanticFlow converts to kind limit carrying preflight. knownFailureResult also handles direct class. No dispatch happens on oversized request path.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewVerificationRequestLimitError(`semantic verifier request is ${bytes} bytes`)
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/review-verifier.ts:13](../../../skills/nova/plugins/review/src/review-verifier.ts#L13)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)

<a id="js-shared-reviewstageintegrityerror"></a>

## ReviewStageIntegrityError

**Representation:** constructor family

**Identity / construction:** code: No own .code assignment. class identity discriminates exceptions.. message: Argument1 forwarded to Error. fixed literals and constructed/forwarded messages occur at actual sites.. snapshot: Optional argument2 snapshot. only supplied sites retain it.

**Trigger:** Context request/assertion or expansion failures. requested paths not selected. second context expansion response (carries latest snapshot).

**Effect:** knownFailureResult integrity path. runReview persists dispatch failure with carried latest snapshot or prepared snapshot. preparation failures return without that persistence. persistReviewOutcome can itself produce `report_identity_missing/report_write_failed`.

**Retry boundary:** Only exact consumer policy applies. Neither integrity nor limit class name itself authorizes retry.

**Safe next action:** Inspect the exact proof/limit and consumer outcome. keep checkpoint/reconciliation authority. No generic retry command is established.

**Retained evidence:** knownFailureResult integrity path. runReview persists dispatch failure with carried latest snapshot or prepared snapshot. preparation failures return without that persistence. persistReviewOutcome can itself produce `report_identity_missing/report_write_failed`.

**Consumer / translation:** Empty Error subclasses inherit message/options: class identity is a discriminator, not automatic code. SemanticFlowIntegrityError retains state and kind integrity&#124;limit. StageIntegrityError optional snapshot. stage knownFailureResult maps limit classes/kind to bundleLimitResult and selected integrity classes to invalidInputResult. unknown errors rethrow. Repository audit/revalidation selectively map named classes to lowercase blocked reasons. Hydration limit can skip dependent candidate rather than fail whole run.

**Representative source constructions (not executed by this reference):**

```text
new ReviewStageIntegrityError(error instanceof Error ? error.message : String(error))
```

```text
new ReviewStageIntegrityError(`requested context exceeds policy limits: ${remaining.join(', ')}`)
```

**Owning / consuming source:**

- [skills/nova/plugins/review/src/stage.ts:32](../../../skills/nova/plugins/review/src/stage.ts#L32)
- [skills/nova/plugins/review/src/repository-audit-cache.ts:1](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L1)
- [skills/nova/plugins/review/src/repository-audit-stage.ts:1](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L1)

<a id="j14-adapter-receipt-forwarding"></a>

## Adapter receipt failure to plain Error

**Representation:** failure

**Identity / construction:** code: absent. plain Error has no own .code. message: receipt.error?.message ?? adapter invocation failed. for requiresExternalContinuation(capability), `EFFECT_OUTCOME_UNRESOLVED`:&lt;effectId&gt;:&lt;message&gt;. domain: upstream-open message, symbolic effectId/capability. completed receipt result is control/success

**Trigger:** Non-confidential effects.invoke returns status other than completed. Earlier stopping/provider/readiness guards are distinct.

**Effect:** Throws. stage #failure recognizes unresolved/recovery prefix and returns blocked `core.effect_reconciliation_required`, preserving message.

**Retry boundary:** No blind resubmit for unresolved external continuation. stage owns failure translation.

**Safe next action:** Reconcile the same durable effect/receipt rather than invent a replacement operation.

**Retained evidence:** Original receipt and effect identity remain authority. no claim effects absent.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/execution/adapters.ts:52](../../../skills/nova/core/execution/adapters.ts#L52)
- [skills/nova/core/effects/coordinator.ts:1](../../../skills/nova/core/effects/coordinator.ts#L1)
- [skills/nova/core/effects/durable-invocation.ts:1](../../../skills/nova/core/effects/durable-invocation.ts#L1)

<a id="j14-stage-failure-translation"></a>

## Stage exception to result reason

**Representation:** failure

**Identity / construction:** code: reason.code, not exception.code: `core.effect_reconciliation_required` / `core.attempt_cancelled` / `core.attempt_timed_out` / `core.plugin_runtime_failed`. message: Error.message or String(error). domain: finite branches in #failure, not full source error universe

**Trigger:** Unresolved/recovery Error prefix first. otherwise parent cancellation signal takes precedence over `PLUGIN_ATTEMPT_TIMEOUT` equality.

**Effect:** Result outcome blocked, cancelled, `timed_out` or retry. #recordResult stores result/reason with attempt identity.

**Retry boundary:** retry is a returned stage outcome, not proof actual scheduler retry executed or safe arbitrary repetition.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Recorded cloned result and reason. side-effect absence not inferred.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/execution/stage-executor.ts:126](../../../skills/nova/core/execution/stage-executor.ts#L126)
- [skills/nova/core/execution/adapters.ts:1](../../../skills/nova/core/execution/adapters.ts#L1)

<a id="j14-stage-completion-control"></a>

## Completed attempt cleanup control

**Representation:** control

**Identity / construction:** code: lease revoke reason `core.attempt_completed`. message: abort reason plain Error `PLUGIN_ATTEMPT_COMPLETED`. domain: owned fixed successful cleanup control, not failure code

**Trigger:** Attempt cleanup executes.

**Effect:** Removes outer abort listener, aborts runtime controller and revokes lease.

**Retry boundary:** No retry meaning.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Attempt result recorded separately. abort control does not prove every external effect stopped.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/execution/stage-executor.ts:143](../../../skills/nova/core/execution/stage-executor.ts#L143)

<a id="j14-durable-failure-receipt"></a>

## Durable adapter failure receipt and lock-release aggregation

**Representation:** failure

**Identity / construction:** code: receipt.error.code = `adapter.effect_failed`. thrown recovery/identity/fence messages separate. AggregateError `EFFECT_FAILED_AND_LOCK_RELEASE_FAILED` retains failure and releaseError. message: Error.message or String(error) in receipt. symbolic effectId/idempotencyKey in thrown guards. domain: owned receipt code with open upstream message

**Trigger:** Adapter invoke/assert-current within catch fails. absent receipt recovery and lock release are separate guarded branches.

**Effect:** Creates failed effect-receipt.v2 and persists through journal.completed. receipt persistence failure can itself throw. If primary failure and release failure coincide, aggregate retains both.

**Retry boundary:** Recovery requires actual adapter.receipt and matching authority. no new invocation merely because failed receipt exists.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Receipt identity, adapter owner, recordedAt and error retained. lock-related earlier effects not rolled back.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/effects/durable-invocation.ts:45](../../../skills/nova/core/effects/durable-invocation.ts#L45)
- [skills/nova/core/execution/adapters.ts:1](../../../skills/nova/core/execution/adapters.ts#L1)
- [skills/nova/core/execution/stage-executor.ts:1](../../../skills/nova/core/execution/stage-executor.ts#L1)

<a id="j14-confidential-audit-failure"></a>

## Confidential effect failure redaction

**Representation:** failure-and-audit

**Identity / construction:** code: audit receipt error.code `adapter.confidential_effect_failed`. message: audit fixed Confidential adapter operation failed. original caught error rethrown to immediate caller. domain: owned redacted audit receipt distinct from open thrown exception

**Trigger:** Confidential adapter.invoke rejects inside try.

**Effect:** Audit completed called with failed redacted receipt, then original error rethrows. audit error can interrupt that path.

**Retry boundary:** No durable replay/retry entitlement from confidential audit.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** Audit resource/payload redacted. original error must not be copied into confidential audit message.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/effects/coordinator.ts:34](../../../skills/nova/core/effects/coordinator.ts#L34)
- [skills/nova/core/execution/adapters.ts:1](../../../skills/nova/core/execution/adapters.ts#L1)

<a id="j15-helper-6"></a>

## skills/nova/plugins/remote-test-gate/src/adapter.ts::canonicalDirectory

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not absolute string path or realpath result is not a directory. realpath/stat OS failures can propagate independently.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:8](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L8)

<a id="j15-helper-7"></a>

## skills/nova/plugins/remote-test-gate/src/adapter.ts::string

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not nonempty string.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:15](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L15)

<a id="j15-helper-8"></a>

## skills/nova/plugins/remote-test-gate/src/adapter.ts::positiveInteger

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument3 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not safe integer between1 and maximum.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:20](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L20)

<a id="j15-helper-9"></a>

## skills/nova/plugins/repository-adapter/src/revision-reader.ts::assertExpected

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument4 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Optional payload&#91;key&#93; is supplied but differs strictly from actual.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/plugins/repository-adapter/src/revision-reader.ts:19](../../../skills/nova/plugins/repository-adapter/src/revision-reader.ts#L19)

<a id="j16-file-mutex"></a>

## FileMutex timeout and acquisition failures

**Representation:** failure

**Identity / construction:** code: absent. message: flock status75 -&gt; constructor argument3 timeoutCode. current journal passes `JOURNAL_APPEND_LOCK_TIMEOUT`:&lt;file&gt;. spawn error/nonzero other status -&gt; `FILE_MUTEX_ACQUIRE_FAILED` with actual details/cause. domain: symbolic-open file/status/signal/stderr/timeoutCode

**Trigger:** Synchronous flock acquisition fails or returns conflict exit75.

**Effect:** Operation executes only after acquisition status0. finally closes descriptor. stable inode intentionally remains and must not be unlinked.

**Retry boundary:** No automatic retry in withLock. operation exceptions propagate.

**Safe next action:** Preserve stable lock inode. inspect actual acquisition/journal state, not blind unlink/retry.

**Retained evidence:** Lock inode remains. acquired.error retained as cause. operation may mutate before its own later exception.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

**Owning / consuming source:**

- [skills/nova/core/state/file-mutex.ts:1](../../../skills/nova/core/state/file-mutex.ts#L1)
- [skills/nova/core/state/journal.ts:29](../../../skills/nova/core/state/journal.ts#L29)

<!-- END GENERATED: common error catalogue -->
