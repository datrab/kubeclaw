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
- [canonicalDirectory — skills/nova/plugins/remote-test-gate/src/adapter.ts](#j15-helper-6)
- [string — skills/nova/plugins/remote-test-gate/src/adapter.ts](#j15-helper-7)
- [positiveInteger — skills/nova/plugins/remote-test-gate/src/adapter.ts](#j15-helper-8)
- [assertExpected — skills/nova/plugins/repository-adapter/src/revision-reader.ts](#j15-helper-9)
- [FileMutex timeout and acquisition failures](#j16-file-mutex)
- [Project compilation, CLI admission, recovery and legacy import](#nova-project-compiler-cli-recovery)
- [Nova canonical journals, plugin state and retained run evidence](#nova-canonical-journal-plugin-state-evidence)

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>LINT&#95;POLICY&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/lint/src/engine/policy-validation.ts:3](../../../skills/nova/plugins/lint/src/engine/policy-validation.ts#L3) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>error.code</code> | <code>LINT&#95;REPORT&#95;CONTRACT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/lint/src/engine/report-contract.ts:12](../../../skills/nova/plugins/lint/src/engine/report-contract.ts#L12) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>repository review cache adapter returned invalid output</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-cache.ts:17](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L17) |
| <code>Error.message</code> | <code>repository review cache adapter returned no artifact</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-cache.ts:25](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L25) |
| <code>Error.message</code> | <code>repository review cache requires an attempt identity</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-cache.ts:54](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L54) |
| <code>Error.message</code> | <code>repository review cache record does not match its run</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-cache.ts:74](../../../skills/nova/plugins/review/src/repository-audit-cache.ts#L74) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>artifact adapter returned invalid output</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:128](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L128) |
| <code>Error.message</code> | <code>artifact adapter returned no artifact</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:130](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L130) |
| <code>Error.message</code> | <code>repository audit inventory revision is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:208](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L208) |
| <code>Error.message</code> | <code>prepared repository review is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:257](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L257) |
| <code>Error.message</code> | <code>prepared repository review proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:266](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L266) |
| <code>Error.message</code> | <code>prepared repository review requires an attempt identity</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:276](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L276) |
| <code>Error.message</code> | <code>prepared repository review artifacts conflict</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:283](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L283) |
| <code>Error.message</code> | <code>prepared repository review adapter response is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:290](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L290) |
| <code>Error.message</code> | <code>prepared repository review artifact proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:295](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L295) |
| <code>Error.message</code> | <code>prepared repository review artifact identity is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:318](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L318) |
| <code>Error.message</code> | <code>repository audit context expansion exceeds the resolved operational budget</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:511](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L511) |
| <code>Error.message</code> | <code>artifact adapter returned a repository report reference with invalid identity</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:662](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L662) |
| <code>Error.message</code> | <code>artifact adapter returned an invalid follow-up status reference</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:679](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L679) |
| <code>Error.message</code> | <code>repository audit simplification lens requires an enabled simplification policy</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-audit-stage.ts:692](../../../skills/nova/plugins/review/src/repository-audit-stage.ts#L692) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>baselineReport is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:58](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L58) |
| <code>Error.message</code> | <code>baselineReport.artifactId is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:61](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L61) |
| <code>Error.message</code> | <code>baselineReport.sizeBytes is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:63](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L63) |
| <code>Error.message</code> | <code>repository revalidation input has unknown fields</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:71](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L71) |
| <code>Error.message</code> | <code>baseline repository report version is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:79](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L79) |
| <code>Error.message</code> | <code>baseline repository report findings are invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:82](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L82) |
| <code>Error.message</code> | <code>baseline relation map is too large</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:99](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L99) |
| <code>Error.message</code> | <code>baseline relation count is too large</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:101](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L101) |
| <code>Error.message</code> | <code>baseline repository report proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:125](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L125) |
| <code>Error.message</code> | <code>repository revalidation remediation dependency is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:251](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L251) |
| <code>Error.message</code> | <code>repository revalidation remediation dependency cycle is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:257](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L257) |
| <code>Error.message</code> | <code>repository revalidation supersession target is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:271](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L271) |
| <code>Error.message</code> | <code>repository revalidation artifact proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:303](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L303) |
| <code>Error.message</code> | <code>repository revalidation ancestry proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/repository-revalidation-stage.ts:314](../../../skills/nova/plugins/review/src/repository-revalidation-stage.ts#L314) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>review cache read index is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-content-cache.ts:129](../../../skills/nova/plugins/review/src/review-content-cache.ts#L129) |
| <code>Error.message</code> | <code>review cache unit IDs are duplicated</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-content-cache.ts:151](../../../skills/nova/plugins/review/src/review-content-cache.ts#L151) |
| <code>Error.message</code> | <code>review cache record profile does not match its run</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-content-cache.ts:164](../../../skills/nova/plugins/review/src/review-content-cache.ts#L164) |
| <code>Error.message</code> | <code>review cache execution returned an unknown unit</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-content-cache.ts:187](../../../skills/nova/plugins/review/src/review-content-cache.ts#L187) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>changed files exceed the context file limit</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-candidates.ts:218](../../../skills/nova/plugins/review/src/review-context-candidates.ts#L218) |
| <code>Error.message</code> | <code>changed files exceed the hard candidate byte limit</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-candidates.ts:242](../../../skills/nova/plugins/review/src/review-context-candidates.ts#L242) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>prior review report response is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:28](../../../skills/nova/plugins/review/src/review-governor-history.ts#L28) |
| <code>Error.message</code> | <code>prior semantic report encoding is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:52](../../../skills/nova/plugins/review/src/review-governor-history.ts#L52) |
| <code>Error.message</code> | <code>prior review report failed immutable reference validation</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:56](../../../skills/nova/plugins/review/src/review-governor-history.ts#L56) |
| <code>Error.message</code> | <code>prior review report semantic mode mismatch</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:59](../../../skills/nova/plugins/review/src/review-governor-history.ts#L59) |
| <code>Error.message</code> | <code>prior review report producer does not match its report identity</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:61](../../../skills/nova/plugins/review/src/review-governor-history.ts#L61) |
| <code>Error.message</code> | <code>review governor requires core-certified stage lifecycle state</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:70](../../../skills/nova/plugins/review/src/review-governor-history.ts#L70) |
| <code>Error.message</code> | <code>remediated review attempt has no certified governor baseline</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor-history.ts:74](../../../skills/nova/plugins/review/src/review-governor-history.ts#L74) |
| <code>Error.message</code> | <code>review governor requires certified lifecycle state</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor.ts:109](../../../skills/nova/plugins/review/src/review-governor.ts#L109) |
| <code>Error.message</code> | <code>review governor baseline does not match the current frozen authority</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-governor.ts:143](../../../skills/nova/plugins/review/src/review-governor.ts#L143) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>review phase shared retry budget exhausted</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-phase-admission.ts:8](../../../skills/nova/plugins/review/src/review-phase-admission.ts#L8) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>Simplification candidate evidence exceeds the review evidence limit</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-preparation.ts:54](../../../skills/nova/plugins/review/src/review-preparation.ts#L54) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>revision path list is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-production.ts:101](../../../skills/nova/plugins/review/src/review-context-production.ts#L101) |
| <code>Error.message</code> | <code>revision path list proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-production.ts:106](../../../skills/nova/plugins/review/src/review-context-production.ts#L106) |
| <code>Error.message</code> | <code>revision references are invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-production.ts:111](../../../skills/nova/plugins/review/src/review-context-production.ts#L111) |
| <code>Error.message</code> | <code>revision reference proof is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-production.ts:115](../../../skills/nova/plugins/review/src/review-context-production.ts#L115) |
| <code>Error.message</code> | <code>revision reference records are invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-context-production.ts:121](../../../skills/nova/plugins/review/src/review-context-production.ts#L121) |
| <code>Error.message</code> | <code>REVIEW&#95;CANDIDATE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-preparation.ts:122](../../../skills/nova/plugins/review/src/review-preparation.ts#L122) |

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
- [skills/nova/plugins/review/src/review-context-production.ts:101](../../../skills/nova/plugins/review/src/review-context-production.ts#L101)
- [skills/nova/plugins/review/src/review-preparation.ts:122](../../../skills/nova/plugins/review/src/review-preparation.ts#L122)

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>review runtime attestation is missing</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-runtime-attestation.ts:29](../../../skills/nova/plugins/review/src/review-runtime-attestation.ts#L29) |
| <code>Error.message</code> | <code>review runtime attestation is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-runtime-attestation.ts:36](../../../skills/nova/plugins/review/src/review-runtime-attestation.ts#L36) |
| <code>Error.message</code> | <code>review runtime attestation identity is invalid</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-runtime-attestation.ts:44](../../../skills/nova/plugins/review/src/review-runtime-attestation.ts#L44) |
| <code>Error.message</code> | <code>review runtime attestation does not match the configured reviewer identity</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/review-runtime-attestation.ts:54](../../../skills/nova/plugins/review/src/review-runtime-attestation.ts#L54) |

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

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>Echo requested more than one context expansion</code> | Use the family construction rule above. | [skills/nova/plugins/review/src/stage.ts:124](../../../skills/nova/plugins/review/src/stage.ts#L124) |

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

## canonicalDirectory — skills/nova/plugins/remote-test-gate/src/adapter.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not absolute string path or realpath result is not a directory. realpath/stat OS failures can propagate independently.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:50](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L50) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;REPOSITORY&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:68](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L68) |

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:8](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L8)

<a id="j15-helper-7"></a>

## string — skills/nova/plugins/remote-test-gate/src/adapter.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument2 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not nonempty string.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;SECRET&#95;UNAVAILABLE</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:29](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L29) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:47](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L47) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:49](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L49) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:59](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L59) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:60](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L60) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONFIG&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:61](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L61) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;REVISION&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:94](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L94) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;REPOSITORY&#95;ID&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:95](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L95) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;SUBMITTED&#95;AT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:98](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L98) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;REVISION&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:101](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L101) |

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:15](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L15)

<a id="j15-helper-8"></a>

## positiveInteger — skills/nova/plugins/remote-test-gate/src/adapter.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument3 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Value is not safe integer between1 and maximum.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;CONCURRENCY&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:97](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L97) |
| <code>Error.message</code> | <code>REMOTE&#95;TEST&#95;GATE&#95;TIMEOUT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/plugins/remote-test-gate/src/adapter.ts:99](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L99) |

**Owning / consuming source:**

- [skills/nova/plugins/remote-test-gate/src/adapter.ts:20](../../../skills/nova/plugins/remote-test-gate/src/adapter.ts#L20)

<a id="j15-helper-9"></a>

## assertExpected — skills/nova/plugins/repository-adapter/src/revision-reader.ts

**Representation:** failure

**Identity / construction:** code: absent. parameter named code becomes Error message. message: Helper argument4 forwarded unchanged to new Error(code).. domain: symbolic-open at helper. exact supplied caller arguments retained below. no global closed domain

**Trigger:** Optional payload&#91;key&#93; is supplied but differs strictly from actual.

**Effect:** Throws before the guarded helper returns. Callers decide any later store/admission/prompt/repository/runtime effect.

**Retry boundary:** No retry behavior in helper. input rejection and OS error are not interchangeable.

**Safe next action:** No additional automatic repair/retry instruction is established by these Source selectors. use the exact consumer and retained-state authority.

**Retained evidence:** No durable mutation inside these validation helpers. surrounding caller may already have effects.

**Consumer / translation:** Use the linked owner and its caller. an error object alone does not determine the final operation result.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>REPOSITORY&#95;OBJECT&#95;ID&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/plugins/repository-adapter/src/revision-reader.ts:306](../../../skills/nova/plugins/repository-adapter/src/revision-reader.ts#L306) |
| <code>Error.message</code> | <code>REPOSITORY&#95;FILE&#95;SIZE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/plugins/repository-adapter/src/revision-reader.ts:309](../../../skills/nova/plugins/repository-adapter/src/revision-reader.ts#L309) |

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

<a id="nova-project-compiler-cli-recovery"></a>

## Project compilation, CLI admission, recovery and legacy import

**Representation:** project input/compiler/CLI message family

**Identity / construction:** PROJECT_&#42; and `LEGACY_IMPORT_`&#42; diagnostics are Error.message text. The --project and legacy-import handlers put caught failures in stderr JSON with status:error and an error message. They set exit1; error.code is not a separate JSON field. Other startup/core-CLI paths have their own handling.

**Trigger:** Invalid project/authoring object fields, IDs, paths, module ownership/dependencies/requirements, test-plan scope/digest, Source declarations, review/delivery modes or recovery graph/encoding can reject compilation. The project CLI also rejects invalid/conflicting flags and a changed or dirty repository before a fresh run.

**Effect:** Compiler input guards do not run project stages. The CLI validates the compiled runtime definition before an exclusive output write or run/recovery/resume. Compilation success is not execution. Output-write failure can leave a partial newly created file; runtime failure can follow earlier durable work.

**Retry boundary:** Correct the actual input or prerequisite, retaining original run, graph and approved Source identities. Recovery verifies the whole reconstructed graph against stored state; do not change a baseline or encoding merely to clear that guard.

**Safe next action:** Inspect the exact message and named input. Preserve repository WIP and existing output files; do not reset Git or delete an existing target to clear a conflict. For uncertain run/recovery/resume effects, inspect the original run rather than starting a replacement.

**Retained evidence:** Keep the selected project/platform/source files, run ID, stored graph, first stderr diagnostic and any output already created. The error handler does not provide automatic rollback, erase state or guarantee cleanup.

**Consumer / translation:** The --project catch writes status:error and the Error.message (or String(error)) to stderr and sets exit1. A returned runtime status also determines exit success separately. --import-legacy is selected first and uses its own handler; a direct core-CLI route is not this project error envelope.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;ARGUMENT&#95;INVALID:${flag}&#96;</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:26](../../../skills/nova/project/cli.ts#L26) |
| <code>Error.message</code> | <code>PROJECT&#95;AND&#95;PLATFORM&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:29](../../../skills/nova/project/cli.ts#L29) |
| <code>Error.message</code> | <code>PROJECT&#95;COMMAND&#95;CONFLICT</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:30](../../../skills/nova/project/cli.ts#L30) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;RUN&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:44](../../../skills/nova/project/cli.ts#L44) |
| <code>Error.message</code> | <code>PROJECT&#95;BASELINE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:47](../../../skills/nova/project/cli.ts#L47) |
| <code>Error.message</code> | <code>PROJECT&#95;REPOSITORY&#95;DIRTY</code> | Use the family construction rule above. | [skills/nova/project/cli.ts:49](../../../skills/nova/project/cli.ts#L49) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;OBJECT&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:agent</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:requirement</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:review</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:lint</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:test</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:providerPlan</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:module</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:project</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:final</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:final.lint</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:final.review</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:final.test</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>PROJECT&#95;OBJECT&#95;INVALID:final.providerPlan</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:14](../../../skills/nova/project/compiler.ts#L14) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;TEXT&#95;REQUIRED:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:id</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:agent</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:agentRole</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:requirement.id</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:requirement.statement</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:review.agent</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:lint.policyProject</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:task</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:runId</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:baseRevision</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:final.lint.policyProject</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;TEXT&#95;REQUIRED:final.review.agent</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:18](../../../skills/nova/project/compiler.ts#L18) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;ID&#95;INVALID:${result}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:23](../../../skills/nova/project/compiler.ts#L23) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;ABSOLUTE&#95;PATH&#95;REQUIRED:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:28](../../../skills/nova/project/compiler.ts#L28) |
| <code>Error.message</code> | <code>PROJECT&#95;ABSOLUTE&#95;PATH&#95;REQUIRED:lint.policyPath</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:28](../../../skills/nova/project/compiler.ts#L28) |
| <code>Error.message</code> | <code>PROJECT&#95;ABSOLUTE&#95;PATH&#95;REQUIRED:repositoryRoot</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:28](../../../skills/nova/project/compiler.ts#L28) |
| <code>Error.message</code> | <code>PROJECT&#95;ABSOLUTE&#95;PATH&#95;REQUIRED:workspaceRoot</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:28](../../../skills/nova/project/compiler.ts#L28) |
| <code>Error.message</code> | <code>PROJECT&#95;ABSOLUTE&#95;PATH&#95;REQUIRED:final.lint.policyPath</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:28](../../../skills/nova/project/compiler.ts#L28) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;LIST&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:33](../../../skills/nova/project/compiler.ts#L33) |
| <code>Error.message</code> | <code>PROJECT&#95;LIST&#95;INVALID:dependsOn</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:33](../../../skills/nova/project/compiler.ts#L33) |
| <code>Error.message</code> | <code>PROJECT&#95;LIST&#95;INVALID:ownedPaths</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:33](../../../skills/nova/project/compiler.ts#L33) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;OWNERSHIP&#95;INVALID:${value}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:37](../../../skills/nova/project/compiler.ts#L37) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;REQUIREMENTS&#95;REQUIRED:${moduleId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:90](../../../skills/nova/project/compiler.ts#L90) |
| <code>Error.message</code> | <code>PROJECT&#95;REQUIREMENT&#95;DUPLICATE</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:95](../../../skills/nova/project/compiler.ts#L95) |
| <code>Error.message</code> | <code>PROJECT&#95;PLAN&#95;DIGEST&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:111](../../../skills/nova/project/compiler.ts#L111) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;PLAN&#95;SCOPE&#95;MISMATCH:${moduleId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:112](../../../skills/nova/project/compiler.ts#L112) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;BLOCKING&#95;TEST&#95;REQUIRED:${moduleId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:113](../../../skills/nova/project/compiler.ts#L113) |
| <code>Error.message</code> | <code>PROJECT&#95;MODULES&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:117](../../../skills/nova/project/compiler.ts#L117) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;MODULE&#95;DUPLICATE:${moduleId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:123](../../../skills/nova/project/compiler.ts#L123) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;OWNERSHIP&#95;OVERLAP:${moduleId}:${prefix}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:127](../../../skills/nova/project/compiler.ts#L127) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;DEPENDENCY&#95;UNKNOWN:${dependency}&#96;</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:142](../../../skills/nova/project/compiler.ts#L142) |
| <code>Error.message</code> | <code>PROJECT&#95;DEPENDENCY&#95;CYCLE</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:146](../../../skills/nova/project/compiler.ts#L146) |
| <code>Error.message</code> | <code>PROJECT&#95;SCHEMA&#95;UNSUPPORTED:nova-project.v2 requires explicit architecture and module blueprint declarations; legacy inputs need authored migration</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:163](../../../skills/nova/project/compiler.ts#L163) |
| <code>Error.message</code> | <code>PROJECT&#95;WORKSPACES&#95;INSIDE&#95;REPOSITORY</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:168](../../../skills/nova/project/compiler.ts#L168) |
| <code>Error.message</code> | <code>PROJECT&#95;BASE&#95;REVISION&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:170](../../../skills/nova/project/compiler.ts#L170) |
| <code>Error.message</code> | <code>PROJECT&#95;INTEGRATION&#95;REQUIREMENTS&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/compiler.ts:173](../../../skills/nova/project/compiler.ts#L173) |
| <code>Error.message</code> | <code>PROJECT&#95;TEST&#95;AGENT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/coverage.ts:26](../../../skills/nova/project/coverage.ts#L26) |
| <code>Error.message</code> | <code>PROJECT&#95;TEST&#95;AGENT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/coverage.ts:28](../../../skills/nova/project/coverage.ts#L28) |
| <code>Error.message</code> | <code>PROJECT&#95;FINAL&#95;PLAN&#95;SCOPE&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/coverage.ts:43](../../../skills/nova/project/coverage.ts#L43) |
| <code>Error.message</code> | <code>PROJECT&#95;DELIVERY&#95;MANIFEST&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/delivery-manifest.ts:9](../../../skills/nova/project/delivery-manifest.ts#L9) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;SUMMARY&#95;NODE&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/delivery-manifest.ts:18](../../../skills/nova/project/delivery-manifest.ts#L18) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;DELIVERY&#95;SELECTOR&#95;FOREIGN</code> | Use the family construction rule above. | [skills/nova/project/delivery-manifest.ts:22](../../../skills/nova/project/delivery-manifest.ts#L22) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;DELIVERY&#95;MANIFEST&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/delivery-manifest.ts:30](../../../skills/nova/project/delivery-manifest.ts#L30) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:5](../../../skills/nova/project/demo.ts#L5) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:9](../../../skills/nova/project/demo.ts#L9) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;RETENTION&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:15](../../../skills/nova/project/demo.ts#L15) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;PLAN&#95;DIGEST&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:19](../../../skills/nova/project/demo.ts#L19) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;SOURCE&#95;LINK&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:23](../../../skills/nova/project/demo.ts#L23) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;SOURCE&#95;NODE&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:24](../../../skills/nova/project/demo.ts#L24) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;EXPOSURE&#95;BINDING&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:27](../../../skills/nova/project/demo.ts#L27) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;SOURCE&#95;BUILD&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:30](../../../skills/nova/project/demo.ts#L30) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;BLOCKING&#95;AUTH&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:45](../../../skills/nova/project/demo.ts#L45) |
| <code>Error.message</code> | <code>PROJECT&#95;DEMO&#95;FIXTURE&#95;BINDING&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/demo.ts:54](../../../skills/nova/project/demo.ts#L54) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;ARGUMENT&#95;INVALID:${flag}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import-cli.ts:14](../../../skills/nova/project/legacy-import-cli.ts#L14) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;ARGUMENTS&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import-cli.ts:17](../../../skills/nova/project/legacy-import-cli.ts#L17) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;CANONICAL&#95;REPOSITORY&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import-cli.ts:21](../../../skills/nova/project/legacy-import-cli.ts#L21) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:legacy.gates</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:gateDecisions</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:legacy</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:authoring</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:project</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:legacy.modules</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:moduleIds</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;OBJECT&#95;REQUIRED:module</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:7](../../../skills/nova/project/legacy-import.ts#L7) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;SEGMENT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:11](../../../skills/nova/project/legacy-import.ts#L11) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;KEYS&#95;MISMATCH:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:15](../../../skills/nova/project/legacy-import.ts#L15) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;KEYS&#95;MISMATCH:gateDecisions</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:15](../../../skills/nova/project/legacy-import.ts#L15) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;KEYS&#95;MISMATCH:authoring</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:15](../../../skills/nova/project/legacy-import.ts#L15) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;KEYS&#95;MISMATCH:moduleIds</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:15](../../../skills/nova/project/legacy-import.ts#L15) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;KEYS&#95;MISMATCH:modules</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:15](../../../skills/nova/project/legacy-import.ts#L15) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;GATE&#95;DECISION&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:22](../../../skills/nova/project/legacy-import.ts#L22) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;PROJECT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:27](../../../skills/nova/project/legacy-import.ts#L27) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;NEW&#95;RUN&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:28](../../../skills/nova/project/legacy-import.ts#L28) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;POLICY&#95;ACKNOWLEDGEMENT&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:36](../../../skills/nova/project/legacy-import.ts#L36) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;MODULE&#95;MAPPING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:42](../../../skills/nova/project/legacy-import.ts#L42) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;REPOSITORY&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:44](../../../skills/nova/project/legacy-import.ts#L44) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;SOURCE&#95;OUTSIDE&#95;REPOSITORY</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:46](../../../skills/nova/project/legacy-import.ts#L46) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;MODULE&#95;AUTHORING&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:47](../../../skills/nova/project/legacy-import.ts#L47) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;DEPENDENCIES&#95;REQUIRED:${legacyId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:53](../../../skills/nova/project/legacy-import.ts#L53) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;NONMODULE&#95;DEPENDENCY:${legacyId}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:55](../../../skills/nova/project/legacy-import.ts#L55) |
| <code>Error.message</code> | <code>LEGACY&#95;IMPORT&#95;SUBSTEPS&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:60](../../../skills/nova/project/legacy-import.ts#L60) |
| <code>Error.message</code> | <code>&#96;LEGACY&#95;IMPORT&#95;STRUCTURAL&#95;CONFLICT:${legacyId}:${field}&#96;</code> | Use the family construction rule above. | [skills/nova/project/legacy-import.ts:62](../../../skills/nova/project/legacy-import.ts#L62) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;REVIEW&#95;SEMANTICS&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:13](../../../skills/nova/project/recovery.ts#L13) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;REVIEW&#95;SEMANTICS&#95;MIXED</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:16](../../../skills/nova/project/recovery.ts#L16) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;REVIEW&#95;NODES&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:25](../../../skills/nova/project/recovery.ts#L25) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;REPORT&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:29](../../../skills/nova/project/recovery.ts#L29) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;REPORT&#95;ENCODING&#95;MIXED</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:32](../../../skills/nova/project/recovery.ts#L32) |
| <code>Error.message</code> | <code>PROJECT&#95;RECOVERY&#95;SOURCE&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/recovery.ts:44](../../../skills/nova/project/recovery.ts#L44) |
| <code>Error.message</code> | <code>PROJECT&#95;REPORT&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/review-semantics.ts:9](../../../skills/nova/project/review-semantics.ts#L9) |
| <code>Error.message</code> | <code>PROJECT&#95;REVIEW&#95;SEMANTIC&#95;ENCODING&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/review-semantics.ts:10](../../../skills/nova/project/review-semantics.ts#L10) |
| <code>Error.message</code> | <code>PROJECT&#95;REVIEW&#95;SEMANTIC&#95;REPORT&#95;ENCODING&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/review-semantics.ts:11](../../../skills/nova/project/review-semantics.ts#L11) |
| <code>Error.message</code> | <code>&#96;PROJECT&#95;SOURCE&#95;INVALID:${label}&#96;</code> | Use the family construction rule above. | [skills/nova/project/source.ts:7](../../../skills/nova/project/source.ts#L7) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;INVALID:blueprint</code> | Use the family construction rule above. | [skills/nova/project/source.ts:7](../../../skills/nova/project/source.ts#L7) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;INVALID:architecture</code> | Use the family construction rule above. | [skills/nova/project/source.ts:7](../../../skills/nova/project/source.ts#L7) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;INVALID:review</code> | Use the family construction rule above. | [skills/nova/project/source.ts:7](../../../skills/nova/project/source.ts#L7) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;INVALID:approval</code> | Use the family construction rule above. | [skills/nova/project/source.ts:7](../../../skills/nova/project/source.ts#L7) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;PATH&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/project/source.ts:12](../../../skills/nova/project/source.ts#L12) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;PATHS&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/source.ts:16](../../../skills/nova/project/source.ts#L16) |
| <code>Error.message</code> | <code>PROJECT&#95;SOURCE&#95;SUBSTEPS&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/source.ts:23](../../../skills/nova/project/source.ts#L23) |
| <code>Error.message</code> | <code>PROJECT&#95;ARCHITECTURE&#95;REF&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/source.ts:36](../../../skills/nova/project/source.ts#L36) |
| <code>Error.message</code> | <code>PROJECT&#95;ARCHITECTURE&#95;AGENT&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/source.ts:53](../../../skills/nova/project/source.ts#L53) |
| <code>Error.message</code> | <code>PROJECT&#95;ARCHITECTURE&#95;APPROVAL&#95;REQUIRED</code> | Use the family construction rule above. | [skills/nova/project/source.ts:55](../../../skills/nova/project/source.ts#L55) |

**Owning / consuming source:**

- [skills/nova/project/cli.ts:1](../../../skills/nova/project/cli.ts#L1)
- [skills/nova/project/compiler.ts:1](../../../skills/nova/project/compiler.ts#L1)
- [skills/nova/project/coverage.ts:1](../../../skills/nova/project/coverage.ts#L1)
- [skills/nova/project/delivery-manifest.ts:1](../../../skills/nova/project/delivery-manifest.ts#L1)
- [skills/nova/project/demo.ts:1](../../../skills/nova/project/demo.ts#L1)
- [skills/nova/project/legacy-import-cli.ts:1](../../../skills/nova/project/legacy-import-cli.ts#L1)
- [skills/nova/project/legacy-import.ts:1](../../../skills/nova/project/legacy-import.ts#L1)
- [skills/nova/project/recovery.ts:1](../../../skills/nova/project/recovery.ts#L1)
- [skills/nova/project/review-semantics.ts:1](../../../skills/nova/project/review-semantics.ts#L1)
- [skills/nova/project/source.ts:1](../../../skills/nova/project/source.ts#L1)

<a id="nova-canonical-journal-plugin-state-evidence"></a>

## Nova canonical journals, plugin state and retained run evidence

**Representation:** canonical state/journal/readback guard family

**Identity / construction:** JOURNAL_&#42;, `PLUGIN_STATE_`&#42;, `FILE_MUTEX_`&#42; and `RUN_EVIDENCE_`&#42; names are message text at these owning guards. A timeout code supplied to FileMutex remains caller-defined; it is not automatically an error.code property.

**Trigger:** Journal values fail JSON-safe shape, cycle, descriptor, proxy or array-property checks. Plugin state can fail sequence, namespace, registration or idempotency checks. Locking or retained-evidence file, shape, identity, byte-budget or effect-pairing guards can also fail.

**Effect:** Validation and lock/readback failures stop that operation; a thrown diagnostic does not prove an earlier record or effect was not committed. Plugin state and retained run evidence are recovery authorities, not a disposable cache.

**Retry boundary:** Use original run, record and idempotency identity. Reconcile the actual journal, lock and effect/receipt state before retrying. Do not retry corruption as if it were an ordinary absent record.

**Safe next action:** Preserve the original journal and first diagnostic. Check the named shape, sequence, namespace, registration, lock or evidence bound. Do not rewrite sequences, delete ownership/journals, invent receipts or reset durable state to clear a validation failure.

**Retained evidence:** Keep original records, effect/receipt identities, source/artifact digests and the first read/write/lock failure. State protection can reject progress rather than silently retire or repair data.

**Consumer / translation:** The owning state operation throws a message; higher execution/recovery code determines its public result. FileMutex can forward process status/cause/stderr; retained evidence rejects unresolved or inconsistent effects rather than establishing a safe new run.

### Find a specific diagnostic

A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.

| Field | Diagnostic | Message pattern / condition | Owning source |
| --- | --- | --- | --- |
| <code>Error.message</code> | <code>&#96;FILE&#95;MUTEX&#95;ACQUIRE&#95;FAILED:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/file-mutex.ts:16](../../../skills/nova/core/state/file-mutex.ts#L16) |
| <code>Error.message</code> | <code>&#96;FILE&#95;MUTEX&#95;ACQUIRE&#95;FAILED:${this.#file}:${acquired.status}:${acquired.signal}:${acquired.stderr?.toString().trim()}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/file-mutex.ts:18](../../../skills/nova/core/state/file-mutex.ts#L18) |
| <code>Error.message</code> | <code>JOURNAL&#95;APPEND&#95;LOCK&#95;TIMEOUT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:32](../../../skills/nova/core/state/journal.ts#L32) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;CHANGED&#95;DURING&#95;READ:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:78](../../../skills/nova/core/state/journal.ts#L78) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;REWIND&#95;OR&#95;DIVERGENCE:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:85](../../../skills/nova/core/state/journal.ts#L85) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;REMOVED:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:97](../../../skills/nova/core/state/journal.ts#L97) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;TAIL&#95;READ&#95;INCOMPLETE:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:111](../../../skills/nova/core/state/journal.ts#L111) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;APPEND&#95;WRITE&#95;INCOMPLETE:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:141](../../../skills/nova/core/state/journal.ts#L141) |
| <code>Error.message</code> | <code>&#96;JOURNAL&#95;APPEND&#95;SIZE&#95;MISMATCH:${this.#file}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:151](../../../skills/nova/core/state/journal.ts#L151) |
| <code>Error.message</code> | <code>JOURNAL&#95;TRANSACTION&#95;CLOSED</code> | Use the family construction rule above. | [skills/nova/core/state/journal.ts:171](../../../skills/nova/core/state/journal.ts#L171) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;NOT&#95;JSON</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:11](../../../skills/nova/core/state/json-value.ts#L11) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;NOT&#95;JSON</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:12](../../../skills/nova/core/state/json-value.ts#L12) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;NOT&#95;JSON</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:16](../../../skills/nova/core/state/json-value.ts#L16) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;NOT&#95;JSON</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:21](../../../skills/nova/core/state/json-value.ts#L21) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;CIRCULAR</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:22](../../../skills/nova/core/state/json-value.ts#L22) |
| <code>Error.message</code> | <code>JOURNAL&#95;VALUE&#95;NOT&#95;JSON</code> | Use the family construction rule above. | [skills/nova/core/state/json-value.ts:25](../../../skills/nova/core/state/json-value.ts#L25) |
| <code>Error.message</code> | <code>&#96;PLUGIN&#95;STATE&#95;SEQUENCE&#95;INVALID:${record.entry.sequence}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/plugins.ts:50](../../../skills/nova/core/state/plugins.ts#L50) |
| <code>Error.message</code> | <code>&#96;PLUGIN&#95;STATE&#95;NAMESPACE&#95;DENIED:${record.entry.namespace}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/plugins.ts:53](../../../skills/nova/core/state/plugins.ts#L53) |
| <code>Error.message</code> | <code>&#96;PLUGIN&#95;STATE&#95;REGISTRATION&#95;DENIED:${record.entry.namespace}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/plugins.ts:59](../../../skills/nova/core/state/plugins.ts#L59) |
| <code>Error.message</code> | <code>&#96;PLUGIN&#95;STATE&#95;NAMESPACE&#95;DENIED:${input.namespace}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/plugins.ts:72](../../../skills/nova/core/state/plugins.ts#L72) |
| <code>Error.message</code> | <code>&#96;PLUGIN&#95;STATE&#95;IDEMPOTENCY&#95;CONFLICT:${input.idempotencyKey}&#96;</code> | Use the family construction rule above. | [skills/nova/core/state/plugins.ts:100](../../../skills/nova/core/state/plugins.ts#L100) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;FILE&#95;OR&#95;BUDGET&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:38](../../../skills/nova/core/state/read-run-evidence.ts#L38) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:46](../../../skills/nova/core/state/read-run-evidence.ts#L46) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;ROOT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:56](../../../skills/nova/core/state/read-run-evidence.ts#L56) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;ATTEMPT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:65](../../../skills/nova/core/state/read-run-evidence.ts#L65) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:76](../../../skills/nova/core/state/read-run-evidence.ts#L76) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:77](../../../skills/nova/core/state/read-run-evidence.ts#L77) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;UNRESOLVED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:81](../../../skills/nova/core/state/read-run-evidence.ts#L81) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:87](../../../skills/nova/core/state/read-run-evidence.ts#L87) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:89](../../../skills/nova/core/state/read-run-evidence.ts#L89) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:92](../../../skills/nova/core/state/read-run-evidence.ts#L92) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:94](../../../skills/nova/core/state/read-run-evidence.ts#L94) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:130](../../../skills/nova/core/state/read-run-evidence.ts#L130) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;AUDIT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:140](../../../skills/nova/core/state/read-run-evidence.ts#L140) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;AUDIT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:141](../../../skills/nova/core/state/read-run-evidence.ts#L141) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;AUDIT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:146](../../../skills/nova/core/state/read-run-evidence.ts#L146) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:155](../../../skills/nova/core/state/read-run-evidence.ts#L155) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;BUDGET&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:159](../../../skills/nova/core/state/read-run-evidence.ts#L159) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;SELECTION&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:161](../../../skills/nova/core/state/read-run-evidence.ts#L161) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:166](../../../skills/nova/core/state/read-run-evidence.ts#L166) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;RUN&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:174](../../../skills/nova/core/state/read-run-evidence.ts#L174) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;ATTEMPT&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:183](../../../skills/nova/core/state/read-run-evidence.ts#L183) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;ARTIFACT&#95;OWNER&#95;INVALID</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:187](../../../skills/nova/core/state/read-run-evidence.ts#L187) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;ATTEMPT&#95;UNFINISHED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:193](../../../skills/nova/core/state/read-run-evidence.ts#L193) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;EFFECT&#95;MODE&#95;UNVERIFIABLE:historical snapshot predates coordinator mode evidence; automatic migration is unsupported</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:209](../../../skills/nova/core/state/read-run-evidence.ts#L209) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;SNAPSHOT&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:210](../../../skills/nova/core/state/read-run-evidence.ts#L210) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;HEAD&#95;MISMATCH</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:213](../../../skills/nova/core/state/read-run-evidence.ts#L213) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;NOT&#95;COMPLETED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:215](../../../skills/nova/core/state/read-run-evidence.ts#L215) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:221](../../../skills/nova/core/state/read-run-evidence.ts#L221) |
| <code>Error.message</code> | <code>RUN&#95;EVIDENCE&#95;CHANGED</code> | Use the family construction rule above. | [skills/nova/core/state/read-run-evidence.ts:225](../../../skills/nova/core/state/read-run-evidence.ts#L225) |

**Owning / consuming source:**

- [skills/nova/core/state/file-mutex.ts:1](../../../skills/nova/core/state/file-mutex.ts#L1)
- [skills/nova/core/state/journal.ts:1](../../../skills/nova/core/state/journal.ts#L1)
- [skills/nova/core/state/json-value.ts:1](../../../skills/nova/core/state/json-value.ts#L1)
- [skills/nova/core/state/plugins.ts:1](../../../skills/nova/core/state/plugins.ts#L1)
- [skills/nova/core/state/read-run-evidence.ts:1](../../../skills/nova/core/state/read-run-evidence.ts#L1)

<!-- END GENERATED: common error catalogue -->
