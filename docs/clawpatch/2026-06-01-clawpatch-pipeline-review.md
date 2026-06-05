# clawpatch report

findings: 149

## high: Archive failure leaves stale review output in place

id: fnd_sig-feat-job-1186ca0ebf-f61bd766_c7a714f380
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Review Gate Runner (feat_job_1186ca0ebf)
next: clawpatch show --finding fnd_sig-feat-job-1186ca0ebf-f61bd766_c7a714f380

evidence:
- nova/pipeline/runners/review-gate-task.ts:167-173 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:226-228 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:345-355 (runReviewGateOnce)

The stale output archive and deletion are in the same try block. If archiveGateOutputIfPresent throws, the catch treats the failure as non-authoritative and continues without unlinking outputFilePath. The next poll then watches that same path, so a stale review JSON can be parsed as the current Echo result; a stale GO can falsely pass the review gate.

recommendation:
Separate archival from authoritative stale-file removal. Always attempt to unlink the old output before polling, and fail or retry setup if the stale output cannot be removed. Optionally reject files older than the current reviewer spawn time.

test analysis:
No linked tests were provided, and this requires an archive-failure plus stale-output scenario that typechecking would not catch.

suggested regression test:
Add a runReviewGateOnce test where archiveGateOutputIfPresent throws while outputFilePath already contains GO JSON; assert the function does not return ok:true from the stale file and either removes it or fails setup.

minimum fix scope:
Update the stale review output cleanup block in nova/pipeline/runners/review-gate-task.ts.

repro:
Seed the reviewer output path with a previous GO JSON, make deps.archiveGateOutputIfPresent throw, then run runReviewGateOnce. The stale file remains and can be accepted by the poll/parse path as the current review result.

## high: Canonical failed gate output is projected as pending

id: fnd_sig-feat-service-bf7d898157-25b3_e3c416bac7
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Status Store (feat_service_bf7d898157)
next: clawpatch show --finding fnd_sig-feat-service-bf7d898157-25b3_e3c416bac7

evidence:
- nova/pipeline/services/status-store-compat/gate-projection.ts:89-128 (normalizeGateProjectionStatus)
- nova/pipeline/services/status-store-compat/gate-projection.ts:523-541 (readBusterGateCompletion)
- nova/pipeline/services/status-store-compat/gate-projection.ts:548-562 (projectGateSchedulerState)

projectGateSchedulerState supplies a truthy completion object for every non-approval gate. readBusterGateCompletion returns that object even when the canonical output_file is a failure. normalizeGateProjectionStatus handles pass and invalid output before checking for any completion object, but it never handles output.isFail before returning PENDING for a non-passing completion. A canonical FAIL/NO-GO/BLOCKED output_file can therefore be written to the gate scheduler read model as PENDING, which can leave scheduler state waiting instead of reflecting the terminal gate failure.

recommendation:
Handle output.isFail before the generic normalizedCompletion branch, preserving the output status and GATE_OUTPUT_EVIDENCE_SOURCE. Alternatively, make readBusterGateCompletion return explicit failure status/source and have normalizeGateProjectionStatus consume it.

test analysis:
No tests were included for this feature, and the provided excerpts do not show a scheduler projection test for failed canonical gate output.

suggested regression test:
Add a unit test for projectGateSchedulerState with output_file statuses FAIL, NO-GO, and BLOCKED, asserting the read model status is the failure status and not PENDING.

minimum fix scope:
nova/pipeline/services/status-store-compat/gate-projection.ts

repro:
Call projectGateSchedulerState for a non-approval gate with readGateOutput returning { exists: true, isPass: false, isFail: true, status: 'FAIL', invalid_contract: false, data: { status: 'FAIL' } }. Because readGateCompletionEvidence returns a truthy non-pass completion object, the projected gate status becomes PENDING instead of FAIL.

## high: Completion failures can be ACKed without notifying the completion stream

id: fnd_sig-feat-service-3bf2d9bd7f-e20e_3bcce06399
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Task Lifecycle Services (feat_service_3bf2d9bd7f)
next: clawpatch show --finding fnd_sig-feat-service-3bf2d9bd7f-e20e_3bcce06399

evidence:
- buster/pipeline/services/task-lifecycle/completion-signal.ts:33-40 (sendTaskCompletionSignal)
- buster/pipeline/services/task-lifecycle/completion-signal.ts:46-64 (sendTaskCompletionSignal)
- buster/pipeline/services/task-lifecycle/completion-signal.ts:80-85 (sendTaskCompletionSignal)
- buster/pipeline/services/task-completion.ts:141-149 (ensureTaskTerminalBeforeAck)
- buster/pipeline/services/task-lifecycle.ts:337-340 (processTask)

sendTaskCompletionSignal marks completionState.attempted before output-file creation, verifyAndPush, or Redis publishing. If any pre-publish step fails, it records completionState.error and returns without emitting to payload.completion_stream. ensureTaskTerminalBeforeAck then treats any attempted completion error as terminal by writing only to the dead-letter stream and ACKing the task. The lifecycle comment says Nova polls completion_stream to unblock the dual-channel poller, so a task can be acknowledged while the expected completion stream never receives PASS or FAIL.

recommendation:
When payload.completion_stream exists and completionState.terminal is false, try to publish a synthesized FAIL completion to that stream before falling back to dead-letter. Only ACK after the configured completion channel, or an explicitly monitored equivalent, has a terminal record.

test analysis:
No linked tests cover completion-signal failures before Redis publish or assert that ACK requires a completion_stream terminal entry when completion_stream is present.

suggested regression test:
Add a queue-level test where sendTaskCompletionSignal fails during verifyAndPush with a completion_stream present, then assert processOneQueuedTask publishes a FAIL completion to that stream before ACK and does not rely only on the dead-letter stream.

minimum fix scope:
Update ensureTaskTerminalBeforeAck and/or sendTaskCompletionSignal so attempted-but-failed completion paths synthesize a failure completion for payload.completion_stream before dead-lettering.

repro:
Use a valid task with completion_stream and make verifyAndPush throw before emitTaskCompletion, for example by denying git push. processTask returns a completion state with attempted=true, terminal=false, and error set; processOneQueuedTask then writes a dead-letter and ACKs without publishing a failure to completion_stream.

## high: Corrupt usage JSONL makes budget enforcement fail open

id: fnd_sig-feat-service-3c4f1855c4-ea0c_69688b66c7
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Pipeline (feat_service_3c4f1855c4)
next: clawpatch show --finding fnd_sig-feat-service-3c4f1855c4-ea0c_69688b66c7

evidence:
- nova/pipeline/services/observability.ts:333-378 (aggregateUsage)
- nova/pipeline/services/observability.ts:447-469 (isBudgetExceeded)

aggregateUsage parses all snapshot lines in one map and catches any parse/read error by returning EMPTY_USAGE. isBudgetExceeded is documented as fail-closed, but its catch cannot run for these parse failures because aggregateUsage swallows them. One malformed trailing line can erase all valid prior usage for aggregation and make a hard budget limit appear not exceeded.

recommendation:
Parse JSONL per line and preserve valid rows while surfacing a parse-error/partial flag, or provide a strict aggregation path for budget checks that throws on corruption so isBudgetExceeded can fail closed.

test analysis:
No tests were included for corrupt usage-snapshot files or the fail-closed budget path.

suggested regression test:
Write a temp usage-snapshots.jsonl with one valid expensive snapshot plus one malformed line and assert isBudgetExceeded returns true or an explicit corrupt-data state is treated as exceeded.

minimum fix scope:
nova/pipeline/services/observability.ts aggregateUsage error handling and isBudgetExceeded budget-read semantics.

repro:
Create usage-snapshots.jsonl with a valid snapshot whose cost exceeds the hard limit followed by an invalid JSON line. aggregateUsage returns EMPTY_USAGE, checkBudgetThresholds sees no cost, and isBudgetExceeded returns false.

## high: Discord embed sanitizer preserves unsanitized outbound fields

id: fnd_sig-feat-library-2d10436c9e-7a16_c27edca6a4
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-7a16_c27edca6a4

evidence:
- common/pipeline/redaction.ts:273-285
- common/pipeline/redaction.ts:287-305

sanitizeDiscordMessage spreads the original embed and field objects, then only sanitizes a small set of properties. Secrets in embed.url, author, image, thumbnail, footer icon_url, or field values whose names are token/password/api-key but whose values do not match regex patterns can be sent unchanged.

recommendation:
Build sanitized embeds from an explicit allowlist or recursively sanitize all supported embed string fields; apply SECRET_KEYS to field labels before preserving field values.

test analysis:
No linked Discord sanitizer tests were included, and the leak depends on runtime object shapes that static checks allow.

suggested regression test:
Pass an embed with url, author.url, footer.icon_url, and a field named token containing a plain value; assert none of those raw values remain in the sanitized message.

minimum fix scope:
common/pipeline/redaction.ts sanitizeDiscordMessage and sanitizeEmbed.

## high: Documented buster tier is rejected by the lint-report CLI

id: fnd_sig-feat-agent-tool-0f7714ee2a-a_fbb79232b7
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-a_fbb79232b7

evidence:
- nova/pipeline/services/lint.ts:27-31 (generateLintReport)
- nova/pipeline/services/lint.ts:51-55 (generateLintReport)
- nova/pipeline/tools/lint-report/constants.ts:6-9 (TIERS)
- nova/pipeline/tools/lint-report.ts:76-79 (buildContext)

The service contract documents generateLintReport tiers as pre-check or buster and forwards the tier value unchanged to lint-report.ts as --tier. The CLI only accepts keys from TIERS, which are pre-check and full, so a documented buster call exits before writing a report. That breaks the review-gate/full-report path as a setup failure instead of running the full tier.

recommendation:
Map the service-level buster tier to the lint-report full tier before invoking the CLI, or add an explicit buster alias to TIERS with the same ordering semantics as full.

test analysis:
No tests are included for the feature, and these files are @ts-nocheck, so the string-tier contract mismatch is not type-checked.

suggested regression test:
Add a generateLintReport test that passes tier "buster" and asserts the invoked report uses full-tier behavior instead of returning setup_failed.

minimum fix scope:
Normalize tier in generateLintReport or extend lint-report tier validation to accept buster as an alias for full.

repro:
Call generateLintReport(config, "buster", opts) with a valid lint_report_path. lint-report.ts rejects --tier buster with "unknown tier" and no output report is produced.

## high: Failed tsc invocations can be reported as clean

id: fnd_sig-feat-agent-tool-0f7714ee2a-2_6899b44e95
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-2_6899b44e95

evidence:
- nova/pipeline/tools/lint-report/execution.ts:23-33 (safeExec)
- nova/pipeline/tools/lint-report/tool-registry.ts:51-57 (tsc.run)
- nova/pipeline/tools/lint-report/tool-registry.ts:70-74 (tsc.run)

safeExec captures non-zero exits and timeouts instead of throwing, but the tsc runner ignores result.exitCode, result.timedOut, and stderr. It only counts stdout lines matching file(line,col) diagnostics. Compiler-level failures such as TS18003, invalid command/config output, or timeouts can produce no matching findings and return zero errors, which makes TypeScript pre-check evidence look clean.

recommendation:
After parsing tsc output, if the process exited non-zero or timed out and no structured findings were produced, emit an error finding containing the first stdout/stderr line or mark the tool as failed.

test analysis:
No tests are included for non-file-scoped tsc diagnostics, non-zero exits with unmatched output, or timeout handling.

suggested regression test:
Add a tsc runner test with safeExec output containing "error TS18003" and exitCode 1, asserting the result has at least one error finding.

minimum fix scope:
Add non-zero/timedOut fallback handling to the tsc tool runner.

repro:
Use a TypeScript project with a tsconfig.json that produces a compiler-level diagnostic like TS18003. tsc exits non-zero, the regex matches no file-scoped lines, and the tool returns errors: 0.

## high: Forge completion reader cursor is not advanced for non-agent events

id: fnd_sig-feat-service-3c4f1855c4-6c52_548b3a7ca0
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Pipeline (feat_service_3c4f1855c4)
next: clawpatch show --finding fnd_sig-feat-service-3c4f1855c4-6c52_548b3a7ca0

evidence:
- nova/pipeline/services/agent-observability-forge-completion.ts:202-225 (decodeXreadEvents)
- nova/pipeline/services/agent-observability-forge-completion.ts:268-293 (createAgentEndedTelemetryReader)

decodeXreadEvents filters the Redis batch down to agent.ended events before the caller sees entry IDs. read() advances lastId only for those filtered events. If XREAD returns non-agent telemetry before the matching agent.ended event, a concrete startId can repeatedly reread the same non-agent batch and never reach the later completion event; with the default '$', leaving lastId as '$' can also skip a matching event that arrives between reads. This can make forge completion miss canonical agent.ended telemetry.

recommendation:
Decode stream entries without filtering away their IDs, advance lastId to every entry read, and then apply agent.ended parsing/matching to decide whether to return a completion event.

test analysis:
No tests were included for mixed telemetry streams or cursor advancement through ignored events.

suggested regression test:
Fake xread to return non-agent entries followed by a matching agent.ended event across batches; assert repeated read() calls advance past ignored entries and eventually return the match.

minimum fix scope:
nova/pipeline/services/agent-observability-forge-completion.ts Redis entry decoding and lastId advancement.

repro:
Configure the reader with startId '0-0' and have Redis return a batch of non-agent telemetry entries before a matching agent.ended entry. The first read decodes no events and leaves lastId unchanged, so subsequent reads can keep returning the same non-agent entries.

## high: GO reviews can pass while declaring critical issues

id: fnd_sig-feat-job-1186ca0ebf-aa2664bd_8b69f3e8ae
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Review Gate Runner (feat_job_1186ca0ebf)
next: clawpatch show --finding fnd_sig-feat-job-1186ca0ebf-aa2664bd_8b69f3e8ae

evidence:
- nova/pipeline/prompts/review.ts:87-105 (buildReviewerPrompt)
- nova/pipeline/runners/review-gate-output.ts:86-95 (parseReviewOutputContent)

The reviewer contract says status is GO only when there are zero critical issues, but parseReviewOutputContent returns ok:true solely from status === 'GO'. Because Echo output is external/untrusted, a malformed but parseable response with status GO and populated critical_issues will pass the gate instead of blocking or entering remediation.

recommendation:
When status is GO, validate that critical_issues and critical_blockers are empty arrays or absent. Treat contradictions as invalid_contract, or normalize them to a NO-GO decision before building the control result.

test analysis:
No tests were provided for parser contract contradictions, and TypeScript cannot catch invalid model-produced JSON semantics.

suggested regression test:
Add parser tests for GO with critical_issues and critical_blockers entries and assert the result is not ok:true.

minimum fix scope:
Update parseReviewOutputContent in nova/pipeline/runners/review-gate-output.ts.

repro:
parseReviewOutputContent('{"status":"GO","critical_issues":[{"description":"real blocker"}],"deferred_issues":[],"summary":"x"}') returns an ok GO decision.

## high: K8s suite can apply cluster-scoped resources outside the ephemeral namespace

id: fnd_sig-feat-test-suite-77bede17d2-3_4c566114b7
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-3_4c566114b7

evidence:
- buster/pipeline/suites/k8s.ts:58-66
- buster/pipeline/suites/k8s.ts:126-140
- buster/pipeline/suites/k8s.ts:241-253

The suite rewrites namespaced objects into the test namespace, but explicitly lets cluster-scoped kinds through by deleting metadata.namespace and then applies the rendered manifest set with kubectl. The -n target namespace flag does not scope CRDs, ClusterRoles, webhook configs, or other cluster-scoped resources, so a repo manifest can mutate shared cluster state outside the ephemeral namespace and outside namespace cleanup boundaries.

recommendation:
Reject cluster-scoped resources by default in the k8s suite, or require an explicit allowlist/capability plus deterministic cleanup before applying them.

test analysis:
No linked tests were included, and typechecking cannot model kubectl namespace semantics for cluster-scoped resources.

suggested regression test:
Add a k8s suite test with a manifest containing a ClusterRole or CRD and assert the suite fails before kubectl apply unless an explicit cluster-scoped allowlist is enabled.

minimum fix scope:
Validate rendered manifest documents in renderManifestForK8sSuite or applyManifests before invoking kubectl.

repro:
Configure k8s.manifests with a ClusterRole or CRD plus the required dockerfile/image/service fields. The suite renders the resource without a namespace and kubectl apply creates or updates it cluster-wide.

## high: Lifecycle events can remain unprojected after crash or concurrent append

id: fnd_sig-feat-service-bf7d898157-298b_8beab30935
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Status Store (feat_service_bf7d898157)
next: clawpatch show --finding fnd_sig-feat-service-bf7d898157-298b_8beab30935

evidence:
- nova/pipeline/services/status-store-lifecycle/appenders.ts:35-63 (appendLifecycleEvent)
- nova/pipeline/services/status-store-lifecycle/read-models.ts:49-58 (loadLifecycleReadModels)
- nova/pipeline/services/status-store-lifecycle/storage.ts:38-49 (writeJsonAtomic)

appendLifecycleEvent appends the canonical event before saving the read-model projection. If the process crashes or saveLifecycleReadModels throws after appendJsonLine, a retry finds the idempotency key in canonical-events.jsonl and returns the stale readModels without applying the already-recorded event. loadLifecycleReadModels only reads read-models.json or a default object, so it does not replay canonical events to heal the missing projection. The same non-serialized read-modify-write flow can also lose one of two concurrent projections, and writeJsonAtomic uses a shared .tmp path that can collide between writers.

recommendation:
Treat canonical-events.jsonl as the recovery source of truth: when an idempotency match is found, verify the read model includes that event and replay/catch up from the log if not. Serialize per-run lifecycle appends, and use unique temporary filenames for atomic writes to avoid writer collisions.

test analysis:
No tests were included, and there is no evidence of crash-after-append or concurrent append coverage in the provided files.

suggested regression test:
Add a test that simulates appendJsonLine success followed by read-model save failure, retries the same lifecycle append, and asserts the read model is rebuilt or caught up from canonical-events.jsonl.

minimum fix scope:
nova/pipeline/services/status-store-lifecycle/appenders.ts and nova/pipeline/services/status-store-lifecycle/read-models.ts

repro:
Force a failure immediately after appendJsonLine succeeds for a module_attempt.started append, then retry the same append. The event exists in canonical-events.jsonl, the retry dedupes, and getLifecycleModuleState can still return null or stale state because the event was never applied to read-models.json.

## high: Non-verdict completion failures can enter the Forge fix loop

id: fnd_sig-feat-job-7ffa522006-0b412907_3a131d4719
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Buster Gate Runner (feat_job_7ffa522006)
next: clawpatch show --finding fnd_sig-feat-job-7ffa522006-0b412907_3a131d4719

evidence:
- nova/pipeline/runners/buster-gate-runner.ts:164-179
- nova/pipeline/runners/buster-gate-completion.ts:65-80
- nova/pipeline/runners/buster-gate-completion.ts:198-215
- nova/pipeline/runners/buster-gate-terminal.ts:339-383
- nova/pipeline/runners/buster-gate-control.ts:16-29

The runner and completion adapter can return infrastructure or contract failures such as completion_archive_failed, completion_conflict, and completion_event_adapter_failed. handleBusterGateEvaluationResult has no terminal branches for these reasons, so after the known cases it treats every remaining false result as a Buster verdict failure and, when gate.on_fail is fix_and_retest, returns a request_fix remediation handoff. That can send Forge to modify code for Redis/archive/controller failures and hides the real broken completion contract. The registered failure-class list also lacks these classes, so direct mapping currently requires a small contract update.

recommendation:
Add explicit terminal handling and registered failure classes for non-verdict completion failures, classify them as environment/API-contract blocks, and only enter buildBusterRequestFixControlResult for actual Buster verdict failures.

test analysis:
No tests were included for completion archive/controller failure paths with gate.on_fail set to fix_and_retest; ts-nocheck also prevents type-level coverage of the missing failure-class mapping.

suggested regression test:
Mock archiveModuleCompletions or waitBusterGateCompletionEvidence to return completion_archive_failed/completion_event_adapter_failed for a fix_and_retest gate and assert the control result blocks without remediation and preserves a non-verdict failure_class.

minimum fix scope:
buster-gate-terminal.ts plus the BUSTER_GATE_FAILURE_CLASSES and decision mapping in buster-gate-control.ts.

## high: Payload-stream observability events are never consumed

id: fnd_sig-feat-service-3c4f1855c4-5b9c_aecde17ed0
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Pipeline (feat_service_3c4f1855c4)
next: clawpatch show --finding fnd_sig-feat-service-3c4f1855c4-5b9c_aecde17ed0

evidence:
- nova/pipeline/services/agent-observability-ingester/consumer.ts:219-235 (AgentObservabilityIngester.readNext)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:253-260 (AgentObservabilityIngester.processEntry)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:344-368 (AgentObservabilityIngester.checkPressure)

The ingester creates and reads a consumer group only on AGENT_OBSERVABILITY_CONTROL_STREAM. It explicitly dead-letters events that belong on the payload stream when they appear on the control stream, and the only payload-stream handling is an XLEN pressure check. Valid events routed to AGENT_OBSERVABILITY_PAYLOAD_STREAM therefore have no ingestion path here, so their telemetry is never emitted or acked and will accumulate until external trimming or Redis retention drops them.

recommendation:
Add a payload-stream consumer path with its own group/read/ack/dead-letter handling, or stop routing promoted telemetry events to the payload stream. Make processEntry stream-kind-aware instead of assuming every processed entry came from the control stream.

test analysis:
No linked tests were included, and there is no evidence of a test that seeds the payload stream and asserts telemetry emission or ack behavior.

suggested regression test:
Use a fake Redis client with entries on both control and payload streams; assert a payload-stream event is mapped, emitted, and acked, while a wrong-stream event is dead-lettered.

minimum fix scope:
nova/pipeline/services/agent-observability-ingester/consumer.ts read/reclaim/process logic plus any stream config needed for payload consumer groups.

repro:
Run the ingester with a valid event classified as belonging on the payload stream. processNext XREADGROUPs only the control stream, emitted remains unchanged, and checkPressure can report payload length growth but does not process the event.

## high: Pipeline lock loss does not stop the active runner

id: fnd_sig-feat-job-904fd99950-7a595249_b04590f293
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Pipeline Runner Core (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-7a595249_b04590f293

evidence:
- nova/pipeline/runners/pipeline-runner-lock.ts:202-205
- nova/pipeline/runners/pipeline-runner-lock.ts:237-258
- nova/pipeline/runners/pipeline-runner-lock.ts:287-297
- nova/pipeline/runners/pipeline-runner-state-machine.ts:50-68

The run lock becomes advisory after acquisition. The heartbeat detects self-expiry, owner loss, or refresh failure, but only records an alert and stops the timer; the pipeline state machine keeps running without consulting lock ownership. A second runner can reclaim an expired lock, and the first runner can continue mutating module, gate, and lifecycle state concurrently. The refresh path also writes via an unconditional rename, so a heartbeat that read the old token just before expiry can replace a newly acquired lock if a stale reclaim races between the read and rename.

recommendation:
Make lock ownership authoritative for the runner: propagate heartbeat expiry/owner-loss/refresh-failure into an abort or fatal error checked by the main loop, and make heartbeat refresh a compare-and-swap operation that cannot overwrite a lock with a different token. Reclaim races should retry rather than replacing a possibly live owner.

test analysis:
No tests were included for the runner lock. This requires a multi-process or fake-clock lease-expiry test; typechecks would not catch the lifecycle race.

suggested regression test:
Use two runner instances with a very short lease and controlled heartbeat delay. Assert that when the second runner reclaims the lock, the first runner aborts before executing another step and cannot overwrite the second runner's token.

minimum fix scope:
pipeline-runner-lock heartbeat/refresh semantics plus a runner-loop cancellation check

repro:
Start one pipeline with a short lease, delay or suspend its event loop past the lease, then start a second pipeline for the same swarm_dir. The second process can reclaim the stale lock while the first process continues executing because heartbeat loss is not propagated to the runner.

## high: Pre-check passes reports with failed lint tools

id: fnd_sig-feat-agent-tool-0f7714ee2a-b_b711bc0427
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-b_b711bc0427

evidence:
- nova/pipeline/tools/lint-report.ts:44-47 (lintReportExitCode)
- nova/pipeline/tools/lint-report/report.ts:75-79 (runTool)
- nova/pipeline/tools/lint-report/report.ts:149-155 (runAllTools)
- nova/pipeline/services/lint.ts:87-95 (generateLintReport)
- nova/pipeline/services/lint.ts:248-250 (runPreCheck)

lintReportExitCode treats tools_failed as non-clean, but generateLintReport intentionally ignores a non-zero lint-report exit when an output file exists. runPreCheck then passes solely when total_errors is zero and never checks summary.tools_failed. Any parser exception or tool status error that produces no parsed errors can therefore pass pre-check even though the CLI considered the report failing.

recommendation:
Make runPreCheck fail closed when report.summary.tools_failed > 0, and include tool error details in the returned error summary.

test analysis:
No pre-check tests are included that exercise a report with tools_failed and zero lint errors.

suggested regression test:
Add a runPreCheck test using a mocked generateLintReport/report with total_errors 0 and tools_failed 1, asserting passed is false and the error mentions the failed tool.

minimum fix scope:
Update runPreCheck's pass condition to require total_errors === 0 and tools_failed === 0.

repro:
Run pre-check with a tool that produces an output report containing summary.total_errors = 0 and summary.tools_failed = 1, for example a shellcheck run that triggers the parser exception. generateLintReport parses the output and runPreCheck returns passed true.

## high: Redis send can wait forever for a ready event

id: fnd_sig-feat-agent-tool-76a5edb417-6_f6c5cb652f
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Redis Operator Tool (feat_agent-tool_76a5edb417)
next: clawpatch show --finding fnd_sig-feat-agent-tool-76a5edb417-6_f6c5cb652f

evidence:
- nova/pipeline/tools/redis.ts:14-20 (getRedis)
- nova/pipeline/tools/redis.ts:197-205 (lib.publishTask)

publishTask waits on a Promise that only resolves when the Redis client emits ready. Connection errors are handled only by the global error logger, and close/end/error states do not reject this wait. With a bad Redis URL, auth failure, or network outage before ready, the send action can remain pending indefinitely instead of failing fast, which can leave the pipeline stuck waiting for dispatch to complete.

recommendation:
Replace the ready-only wait with a bounded connection helper that resolves on ready and rejects on error/end/close or timeout, then surface that failure to the CLI/pipeline so recovery can proceed.

test analysis:
No tests are listed for this feature, and TypeScript checks are disabled in the owned file, so an event-lifecycle hang is not covered by static checks.

suggested regression test:
Mock a Redis client with status connecting that emits error/end but never ready, call publishTask, and assert it rejects within a short timeout and disconnect cleanup can run.

minimum fix scope:
Update getRedis/publishTask connection readiness handling in nova/pipeline/tools/redis.ts.

repro:
Point the Redis client configuration at an unavailable or auth-failing Redis endpoint and invoke the send action; the client logs Redis errors but publishTask never reaches queue.publishTask or the finally disconnect path because the ready-only Promise does not settle.

## high: Redis telemetry key construction allows identity collisions

id: fnd_sig-feat-library-2d10436c9e-52fa_6620c82459
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-52fa_6620c82459

evidence:
- common/pipeline/telemetry.ts:16-21
- common/pipeline/telemetry.ts:31-38

Telemetry identity parts are only trimmed for non-emptiness before being concatenated with ':' separators. Values such as project='a:b', runId='c' and project='a', runId='b:c' produce the same Redis stream and sequence keys, mixing or overwriting telemetry between distinct runs.

recommendation:
Encode each identity component before concatenation or reject delimiter/control characters in project and run_id; apply the same rule to stream and sequence keys.

test analysis:
No linked Redis key contract tests were provided, and this collision is a runtime value issue.

suggested regression test:
Assert getTelemetryStreamKey and getTelemetrySeqKey cannot collide for identities that differ only by embedded ':' characters, either by encoding or rejecting those inputs.

minimum fix scope:
common/pipeline/telemetry.ts identity normalization/key construction.

## high: Scoped path validation can be bypassed with symlinks

id: fnd_sig-feat-library-2d10436c9e-c98b_d865f50aae
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-c98b_d865f50aae

evidence:
- common/pipeline/security.ts:93-115
- common/pipeline/security.ts:123-135

resolveScopedPath and validateAllowedPath enforce only lexical path prefixes using path.resolve/startsWith. A symlink located inside the allowed directory can point outside the scope, and later filesystem reads or writes will follow it despite the helper returning an apparently allowed path.

recommendation:
For existing paths, compare fs.realpath results for both candidate and root. For writes, validate the real parent directory and reject or safely open through symlinks with lstat/O_NOFOLLOW-style checks.

test analysis:
No linked filesystem security tests were provided; typechecks cannot model symlink resolution.

suggested regression test:
Create a temporary scoped directory containing a symlink to an outside directory and assert resolveScopedPath/validateAllowedPath reject access through that symlink.

minimum fix scope:
common/pipeline/security.ts path validation helpers.

## high: Session-end change detection misses edits to already-dirty paths

id: fnd_sig-feat-service-8348e0b688-9bbd_1e2b09effb
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Polling And Completion (feat_service_8348e0b688)
next: clawpatch show --finding fnd_sig-feat-service-8348e0b688-9bbd_1e2b09effb

evidence:
- nova/pipeline/services/polling-session-end.ts:59-83 (worktreeChangeSignature)
- nova/pipeline/services/polling-session-end.ts:184-188 (pollForSessionEnd)
- nova/pipeline/services/polling-session-end.ts:435-441 (pollForSessionEnd)

The initial and final worktree snapshots compare only sorted `git status --porcelain` lines. If a file is already dirty before the agent runs, later edits to that same file usually leave the same porcelain status/path entry, so the signature remains unchanged. When no HEAD movement occurs, `hasChanges` can be false even though the session wrote new work, leading the caller to treat the session as `session_closed_no_changes` and potentially skip commit/push handling.

recommendation:
Make the worktree signature content-sensitive for non-ignored paths. Capture a digest of tracked diffs plus untracked file contents/metadata, or otherwise compare a baseline patch/content hash instead of status categories only.

test analysis:
No linked tests are provided for session-end dirty worktree detection, and typechecking cannot catch a runtime false negative caused by unchanged porcelain status text.

suggested regression test:
Add a temp-repo session-end test where the baseline has a dirty tracked file, the simulated agent changes that file again, and the final result must report `hasChanges: true`. Include a similar case for files inside a pre-existing untracked directory.

minimum fix scope:
Update `worktreeChangeSignature` and its tests; no broader polling lifecycle changes are required.

repro:
Start with a repo containing an already-modified tracked file, run a session that edits that same file without committing, then let the ACP session close. The final porcelain signature still contains the same `M path` entry and `hasChanges` evaluates false.

## high: Sink delivery can block the durable telemetry append

id: fnd_sig-feat-service-c85e781af1-a24d_7b09c7d86a
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Telemetry Services (feat_service_c85e781af1)
next: clawpatch show --finding fnd_sig-feat-service-c85e781af1-a24d_7b09c7d86a

evidence:
- nova/pipeline/services/telemetry/dispatch.ts:82-95 (emitEvent)
- nova/pipeline/services/telemetry-sink-dispatch.ts:115-149 (dispatchTelemetrySinks)
- nova/pipeline/services/telemetry-sink-contract.ts:165-183 (observeRedisTelemetrySink)
- nova/pipeline/services/telemetry-sink-contract.ts:186-213 (observeDiscordTelemetrySink)

emitEvent awaits dispatchTelemetrySinks before appendCoreTelemetryEvent runs. dispatchTelemetrySinks then awaits each sink implementation directly, and the built-in sinks perform Redis stream emission and Discord delivery without any dispatcher timeout. A hung Redis command, Discord call, or custom sink observe promise can therefore prevent the local durable structured event from being appended and can also leave callers awaiting emitEvent stuck on a telemetry side effect.

recommendation:
Append the core durable telemetry event before awaiting external sinks, and bound sink delivery with per-sink timeouts or fire-and-report isolation so sink failures cannot block local evidence or pipeline progress.

test analysis:
No linked tests are provided for sink hangs, sink timeouts, or verifying that disk telemetry is appended when sink dispatch does not complete.

suggested regression test:
Add a test with a telemetry sink observe implementation that never resolves or rejects after a controlled delay, then assert emitEvent still appends the structured event and returns or reports degraded observability within a bounded timeout.

minimum fix scope:
Reorder emitEvent to perform appendCoreTelemetryEvent before dispatchTelemetrySinks and add timeout/isolation around awaited sink observe calls.

repro:
Register or simulate a telemetry sink whose observe promise never resolves, then call emitEvent with a valid payload. The promise never reaches appendCoreTelemetryEvent because the awaited sink dispatch does not return.

## high: Staged renames only validate the destination path

id: fnd_sig-feat-agent-tool-c8cc1151d6-c_0e2e66a26e
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Operator Tools (feat_agent-tool_c8cc1151d6)
next: clawpatch show --finding fnd_sig-feat-agent-tool-c8cc1151d6-c_0e2e66a26e

evidence:
- buster/pipeline/tools/verify-task.ts:75-85 (listChangedFiles)
- buster/pipeline/tools/verify-task.ts:115-130 (verifyAndPush)
- buster/pipeline/tools/verify-task.ts:209-213 (verifyAndPush)

A porcelain rename line is parsed down to only the right-hand destination path. That means a staged rename whose destination is inside the current project's .swarm scope but whose source is outside the scope is treated as fully allowed; the source-side deletion never enters violations or badFiles. The verifier can then proceed to commit/push with an out-of-scope deletion already staged.

recommendation:
Parse git status with a robust format such as --porcelain=v1 -z or --porcelain=v2 -z and evaluate both source and destination for renames/copies. Reject or clean any rename where either side is outside swarmRoot, and perform a final staged/unstaged out-of-scope check before pushing.

test analysis:
No tests are included for this feature, and typechecking cannot catch this because it depends on git status output semantics.

suggested regression test:
Create a temporary git repo, stage a git mv from another project's .swarm directory into the current project's .swarm directory, run verifyAndPush with gitPush mocked, and assert it returns an error or cleans both sides without calling push.

minimum fix scope:
Update verify-task.ts status parsing and scope validation to preserve rename source paths and validate the full staged index before gitPushWithRetry.

repro:
In a temp repo, create Projects/other/src/.swarm/a.txt and Projects/current/src/.swarm/. Then run git mv Projects/other/src/.swarm/a.txt Projects/current/src/.swarm/a.txt and execute verify-task with --project current. The status line is reduced to only Projects/current/src/.swarm/a.txt, so no violation is emitted for Projects/other/src/.swarm/a.txt.

## high: Telemetry secret arrays are not redacted

id: fnd_sig-feat-library-2d10436c9e-58ee_f2d64b2431
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-58ee_f2d64b2431

evidence:
- common/pipeline/redaction.ts:240-255
- common/pipeline/redaction.ts:257-264

sanitizeTelemetryPayload redacts SECRET_KEYS for string and object values, but arrays skip that check and then recurse into items without preserving the parent key. A payload like { tokens: ["plain-secret"] } returns the array contents unless each item independently matches a regex, leaking key-classified secrets into telemetry.

recommendation:
Check SECRET_KEYS before the type branches, or specifically redact arrays whose field name matches SECRET_KEYS; keep parent key context when walking array items where appropriate.

test analysis:
No linked tests were provided, and TypeScript would not catch runtime redaction gaps for key-sensitive array values.

suggested regression test:
Assert sanitizeTelemetryPayload redacts { token: ["abc"], api_keys: ["abc"] } and nested arrays under secret-key fields.

minimum fix scope:
common/pipeline/redaction.ts sanitizeTelemetryPayload recursion logic.

## high: Typed worker failures can crash when poll_result is absent

id: fnd_sig-feat-job-48a562d1e2-816d980e_937c8d6dbd
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-816d980e_937c8d6dbd

evidence:
- nova/pipeline/services/contracts/worker-control-result.ts:76-108 (validateTypedWorkerControlResult)
- nova/pipeline/runners/module-runner-forge.ts:277-283 (runModuleForgePhase)
- nova/pipeline/runners/module-runner-forge.ts:453-458 (runModuleForgePhase)
- nova/pipeline/runners/module-runner/buster-phase.ts:84-89 (runModuleBusterPhase)
- nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:146-154 (handleBusterFailOrBlockedStatus)

The worker contract validator only requires the typed control-result envelope and canonical outcome class; it does not require legacy diagnostics.metadata.poll_result. The runner then explicitly allows result to be null, but non-pass Forge handling dereferences result.status, and Buster pre-test failure handling dereferences result.status when final_status/failure_class came from metadata. A contract-valid worker result can therefore throw a TypeError instead of producing the intended terminal/retry result, losing failure handling and potentially leaving partial state behind.

recommendation:
Either make poll_result/final_status/failure_class explicit required metadata for compatibility-shaped worker outcomes, or make all consumers use result?.status and fall back to typed diagnostics.summary/metadata when poll_result is absent.

test analysis:
No linked tests were included, and the files use AnyRecord/dynamic contract normalization, so TypeScript would not catch the null dereferences.

suggested regression test:
Add worker-contract tests where Forge and Buster workers return valid typed control results without poll_result and assert the runner returns a terminal PipelineStepResult rather than throwing.

minimum fix scope:
Guard the Forge and Buster failure handlers that read result.status, and add typed-diagnostics fallback fields for failure reasons and Redis identity.

repro:
Return a typed module_forge worker control result with nextAction='request_fix', a canonical typed outcomeClass such as 'error', and no diagnostics.metadata.poll_result. The Forge fallback path reaches result.status?.detail while result is null. Similarly, a module_buster result with metadata.final_status plus failure_class='pretest_config' and no poll_result can reach result.status?._redis_entry.

## high: Unvalidated session.cwd lets task payloads choose the repository and active-session path

id: fnd_sig-feat-service-3bf2d9bd7f-48bb_aebd5eb62f
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Buster Task Lifecycle Services (feat_service_3bf2d9bd7f)
next: clawpatch show --finding fnd_sig-feat-service-3bf2d9bd7f-48bb_aebd5eb62f

evidence:
- buster/pipeline/services/task-validation.ts:68-80 (validatePayloadPathBoundaries)
- buster/pipeline/services/task-validation.ts:116-140 (validateBusterTaskPayload)
- buster/pipeline/services/task-lifecycle/git-sync.ts:73-80 (syncTaskRepo)
- buster/pipeline/services/task-lifecycle/session.ts:128-154 (spawnTaskSession)

The validator requires session.cwd to be present but never applies the repository-relative boundary checks used for output_file, module_path, buster_md_path, work_dir, and instructions_file. Later, syncTaskRepo resolves the repo root from payload.session.cwd and runs gitSync there, and spawnTaskSession passes the same cwd into spawnSession and resolveBusterActiveSessionPath. A malformed or malicious Redis task can therefore direct lifecycle operations at an arbitrary accessible Git checkout or filesystem location instead of the intended workspace.

recommendation:
Validate session.cwd against the allowed workspace before using it. At minimum, resolve it to a canonical path and require getRepoRoot(session.cwd) to equal the worker's intended repo root, or require a repository-relative cwd resolved with resolveScopedPath.

test analysis:
No linked tests exercise unsafe absolute session.cwd values or assert that lifecycle git/session operations are confined to the intended repository.

suggested regression test:
Add validation tests for absolute and parent-traversing session.cwd values, plus a lifecycle test asserting syncTaskRepo refuses a cwd whose repo root differs from the worker repo root.

minimum fix scope:
Extend task-validation.ts to validate session.cwd with the same boundary model used for other filesystem payload fields before syncTaskRepo or spawnTaskSession consume it.

repro:
Submit a valid-looking task whose session.cwd points to another writable Git repository on the worker. validateBusterTaskPayload accepts it as long as the string is non-empty, and syncTaskRepo then resolves and syncs that repository.

## high: Pre-Buster validator input omits producerType required by built-in validators

id: fnd_sig-feat-job-48a562d1e2-81f0c042_0fd12caa56
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-81f0c042_0fd12caa56

evidence:
- nova/pipeline/runners/module-runner-shared.ts:305-356 (buildModuleValidatorRunInput)
- nova/pipeline/services/module-validators.ts:15-17 (stageProducerType)
- nova/pipeline/services/module-validators.ts:115-123 (runDeliveryLintValidatorStage)
- nova/pipeline/services/module-validators.ts:141-148 (runPreCheckValidatorStage)
- nova/pipeline/runners/module-runner-prebuster.ts:152-164 (prepareModuleForBuster)
- nova/pipeline/runners/module-runner-prebuster.ts:194-206 (prepareModuleForBuster)

The runner-generated validator input names the validator as validatorType/validatorName, but the built-in validators derive producerType only from opts.producerType, input.validator.producerType, or input.ids.producerType. In the shown runner path, delivery_lint and pre_check are mandatory before Buster for forge+buster modules, so using these built-ins without an external shim will report invalid validator metadata or fail normalization before Buster dispatch.

recommendation:
Populate producerType in buildModuleValidatorRunInput, preferably in both ids.producerType and validator.producerType, or update stageProducerType to accept the existing validatorType/validatorName fields.

test analysis:
No tests were included for the validator runner contract, and module-validators.ts is ts-nocheck, so the field-name mismatch is not typechecked.

suggested regression test:
Add an integration-style prepareModuleForBuster test with built-in delivery_lint and pre_check handlers that pass on a valid module and verify Buster preparation proceeds to git sync/dispatch.

minimum fix scope:
Change buildModuleValidatorRunInput or stageProducerType; no broader runner refactor is required.

repro:
Run prepareModuleForBuster for a forge+buster module with the built-in delivery_lint/pre_check validators registered and no registry shim that injects producerType. The validator input lacks input.validator.producerType and input.ids.producerType, so the validator returns the missing-producer control path.

## high: Remediation re-evaluation can repeat the same fix cycle indefinitely

id: fnd_sig-feat-job-5e93532101-00693775_41b7750953
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Gate Engines (feat_job_5e93532101)
next: clawpatch show --finding fnd_sig-feat-job-5e93532101-00693775_41b7750953

evidence:
- nova/pipeline/runners/remediable-gate-engine.ts:32-42 (runRemediableGateControlLoopResult)
- nova/pipeline/runners/remediable-gate-engine.ts:51-75 (runRemediableGateControlLoopResult)

The loop derives the current cycle from diagnostics.typed.remediation.policy.nextFixCycle and only exhausts when that value is invalid or greater than maxFixCycles. The retry_request_fix path bumps nextFixCycle, but the re_evaluate path accepts the controller's next control result without enforcing that a new request_fix result advances beyond the cycle that was just fixed. A controller or adapter that returns another request_fix with the same nextFixCycle will cause performFix to run the same cycle repeatedly, so the maxFixCycles guard never makes progress and the pipeline can hang in an unbounded remediation loop.

recommendation:
After evaluateGate, if the result is still a gate remediation request, validate that policy.nextFixCycle is greater than the cycle just attempted, or bump it centrally before continuing. If it would exceed maxFixCycles, return the exhausted control result instead of looping.

test analysis:
No linked tests were included for this feature, and the files are ts-nocheck, so neither tests nor typechecks enforce remediation-cycle monotonicity.

suggested regression test:
Add a remediable loop unit test with a controller whose evaluateGate returns a request_fix result with the same nextFixCycle; assert the loop exhausts or throws a contract error instead of invoking performFix repeatedly.

minimum fix scope:
nova/pipeline/runners/remediable-gate-engine.ts remediation loop progress handling.

repro:
Use an initial request_fix control result with maxFixCycles=2 and nextFixCycle=1, a controller.performFix that returns { mode: 're_evaluate' }, and a controller.evaluateGate that returns the same request_fix control result with nextFixCycle=1. The while condition remains true and performFix is called with cycle 1 forever.

## high: Shutdown context cleanup can drop an unconfirmed live ACP session

id: fnd_sig-feat-service-28093c6232-d63d_72c315307e
category: concurrency
confidence: medium
triage: risk
status: open
feature: Nova Agent Runtime And Orchestration (feat_service_28093c6232)
next: clawpatch show --finding fnd_sig-feat-service-28093c6232-d63d_72c315307e

evidence:
- nova/pipeline/agents/orchestration.ts:275-296 (killAcpAgent)
- nova/pipeline/agents/module-workers.ts:235-250 (runModuleForgeWorker)
- nova/pipeline/agents/shutdown.ts:222-228 (clearShutdownContext)

killAcpAgent intentionally keeps the tracked agent registered when terminateSession is not confirmed, so later shutdown can still reconcile or reap it. runModuleForgeWorker always calls its shutdown-context cleanup after killAgent in the finally block, and clearShutdownContext unconditionally untracks the current label. If termination is unconfirmed, that cleanup removes the only tracked reference to a still-live ACP session, making subsequent shutdown handling skip it and potentially leaving an orphaned session/process.

recommendation:
Have the worker cleanup distinguish placeholder shutdown-context entries from real tracked sessions, or make clearShutdownContext only remove the current label when no sessionKey is present or when termination was confirmed. Propagate the kill result into cleanup so unconfirmed sessions remain tracked.

test analysis:
No tests are included for unconfirmed terminateSession paths or for the interaction between module-worker cleanup and shutdown tracking.

suggested regression test:
Simulate a forge worker where killAgent/terminateSession returns unconfirmed, then assert getTrackedAgent(label) remains present after worker finalization and shutdown cleanup.

minimum fix scope:
Adjust clearShutdownContext and its worker call sites so unconfirmed ACP sessions are not untracked.

## medium: A failing gate beforeReturn hook skips gate-failure telemetry

id: fnd_sig-feat-service-e49e423db1-41c3_5580c29da8
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Rate Limiting (feat_service_e49e423db1)
next: clawpatch show --finding fnd_sig-feat-service-e49e423db1-41c3_5580c29da8

evidence:
- nova/pipeline/services/rate-limit-builders/exhaustion-options.ts:39-53 (createGateSessionRateLimitExhaustionOptions)
- nova/pipeline/services/rate-limit-exit.ts:261-296 (finalizeSessionRateLimitExhaustion)

Gate exhaustion combines the caller-provided beforeReturn hook and the required onGateFail emission in one finalizer hook. Because the caller hook runs first, any exception from it aborts the rest of that hook before onGateFail executes. finalizeSessionRateLimitExhaustion catches the hook failure at the outer boundary and continues, but the gate failure event is already skipped, leaving incomplete exhaustion telemetry for that gate.

recommendation:
Isolate the custom beforeReturn callback from the onGateFail emission, or run onGateFail in a finally/separate hook so custom callback failures cannot suppress gate-failure telemetry.

test analysis:
No linked tests exercise failing exhaustion callbacks or verify that gate failure telemetry still emits after callback errors.

suggested regression test:
Configure createGateSessionRateLimitExhaustionOptions with a beforeReturn callback that throws and a mocked onGateFail, finalize a rate-limit result, and assert onGateFail is still called while the callback failure is recorded.

minimum fix scope:
Refactor createGateSessionRateLimitExhaustionOptions.beforeReturn to catch the caller callback separately from onGateFail, or expose onGateFail as its own finalizer hook.

## medium: Canonical merged review output is copied after publication commit

id: fnd_sig-feat-job-1186ca0ebf-b9b3f528_4c1c8c83e5
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Review Gate Runner (feat_job_1186ca0ebf)
next: clawpatch show --finding fnd_sig-feat-job-1186ca0ebf-b9b3f528_4c1c8c83e5

evidence:
- nova/pipeline/runners/review-gate-task.ts:310-313 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:333-342 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-runner.ts:368-395 (runReviewGateEvaluation)

The review output is committed and pushed before the gate.output_file copy to gateOutputPath. When the reviewer output path differs from the canonical gate output path, the canonical file is created after the only publication step and remains uncommitted. A later clean checkout or restart can miss the canonical output that the runner uses for completion skipping/recovery.

recommendation:
Copy the merged gate output before gitCommitAndPush, or run a second publication step after the copy. If the canonical copy fails for a gate with output_file, treat publication as degraded instead of only emitting a non-authoritative warning.

test analysis:
No linked tests exercise gates with a distinct canonical output_file path and verify the published artifacts.

suggested regression test:
Add a runReviewGateOnce test with differing reviewer and gate output paths; assert gitCommitAndPush sees both files or that the canonical file is committed before success.

minimum fix scope:
Move the gate.output_file copy block before the gitCommitAndPush call in nova/pipeline/runners/review-gate-task.ts and adjust failure handling.

repro:
Use a gate with output_file where reviewGateOutputPath differs from gateOutputPath, complete a review, and inspect the pushed commit or working tree. The canonical merged output is created after gitCommitAndPush and is not included in that commit.

## medium: CLI parser accepts prototype-property flags as known flags

id: fnd_sig-feat-library-2d10436c9e-24c0_76103a8d6b
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-24c0_76103a8d6b

evidence:
- common/pipeline/cli-args.ts:16-24
- common/pipeline/cli-args.ts:34-39
- common/pipeline/cli-args.ts:52-58

parseCliArgs checks known flags with flags[name] instead of an own-property lookup. For ordinary schema objects, names inherited from Object.prototype such as toString or __proto__ are truthy, so those unknown CLI flags bypass the unknown-flag error and are parsed as string flags.

recommendation:
Use Object.prototype.hasOwnProperty.call(flags, name) before reading the spec, and consider using null-prototype maps for parsed values.

test analysis:
No linked CLI parser tests were included, and this depends on JavaScript prototype lookup behavior at runtime.

suggested regression test:
Assert parseCliArgs(['--toString','x'], { flags: {} }) and parseCliArgs(['--__proto__','x'], { flags: {} }) throw Unknown flag and do not mutate parsed values unexpectedly.

minimum fix scope:
common/pipeline/cli-args.ts flag lookup and values object construction.

## medium: Completed resume skips terminal generators forever

id: fnd_sig-feat-job-904fd99950-05b13daf_810fe3b307
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Pipeline Runner Core (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-05b13daf_810fe3b307

evidence:
- nova/pipeline/runners/pipeline-runner-terminal.ts:257-262
- nova/pipeline/runners/pipeline-runner-terminal.ts:267-276
- nova/pipeline/runners/pipeline-runner-terminal.ts:291-314

completePipeline records the pipeline as completed before running the project summary, pipeline review, and case study generators. On a later resume, the idempotence guard returns EXIT_OK as soon as the lifecycle read model says the run is completed, before checking or rerunning those generator side effects. If the process exits after the completed event but before or during generator execution, the run is permanently considered complete with missing terminal artifacts.

recommendation:
Track terminal generator completion separately, or make completed-run resume still verify and idempotently run any missing terminal generators before returning. Alternatively, move the completed terminal marker after required completion side effects have durable success markers.

test analysis:
No tests were included. A test that only asserts the resume exit code would pass while missing the generator side effects.

suggested regression test:
Simulate a completed lifecycle read model with missing generator completion markers or artifacts, then call completePipeline and assert the missing terminal generators are scheduled before EXIT_OK is returned.

minimum fix scope:
completePipeline idempotence and terminal generator completion tracking

repro:
Force a crash after appendPipelineLifecycleEvent records pipeline_run.completed but before line 291. Re-run with the same run id; completePipeline returns EXIT_OK at the idempotence guard and none of the terminal generators are invoked.

## medium: Concurrent visual audits can share and delete the same temp directory

id: fnd_sig-feat-agent-tool-c8cc1151d6-4_82ee83ddfb
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Buster Operator Tools (feat_agent-tool_c8cc1151d6)
next: clawpatch show --finding fnd_sig-feat-agent-tool-c8cc1151d6-4_82ee83ddfb

evidence:
- buster/pipeline/tools/visual-audit.ts:70-71 (visualAudit)
- buster/pipeline/tools/visual-audit.ts:83-105 (visualAudit)
- buster/pipeline/tools/visual-audit.ts:149-150 (visualAudit)

The temp directory is derived only from Date.now(). Two audits started in the same millisecond with the same outputRoot will write into the same directory, and image mode uses the same screenshot.png filename. Either invocation can remove the directory in finally while the other is still reading or uploading, causing flaky missing-file errors or cross-contaminated media.

recommendation:
Create the directory with fs.mkdtempSync or fs.promises.mkdtemp using a prefix under outputRoot, and keep per-run file names inside that unique directory.

test analysis:
No concurrency tests are included for visual-audit, and single-call smoke tests would not expose the collision.

suggested regression test:
Mock Date.now to a constant, run two visualAudit calls concurrently with injected chromium/fetch implementations, and assert they use different temp directories and both complete independently.

minimum fix scope:
Replace the Date.now-based outputDir construction in visual-audit.ts with an atomic mkdtemp-based directory.

repro:
Call visualAudit twice concurrently with the same outputRoot while Date.now is fixed or both calls start in the same millisecond. Both use the same audit-<timestamp> directory, and one finally block can delete files needed by the other.

## medium: Discord fields facade exports the contract module instead of the implementation

id: fnd_sig-feat-service-a0fe81756f-613a_d623d9ee0e
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Buster Integrations And Notifications (feat_service_a0fe81756f)
next: clawpatch show --finding fnd_sig-feat-service-a0fe81756f-613a_d623d9ee0e

evidence:
- buster/pipeline/services/discord-fields.ts:1-3
- buster/pipeline/services/discord-fields-contract.ts:1-3

The buster facade claims to mirror the canonical common pipeline implementation, but discord-fields.ts re-exports ./discord-fields-contract.ts instead of the common discord-fields implementation. Any buster-local import expecting the Discord field builder runtime surface will receive only the contract facade, causing missing exports at build or runtime while adjacent facades correctly target their canonical common modules.

recommendation:
Change buster/pipeline/services/discord-fields.ts to re-export the canonical ../../../common/pipeline/services/discord-fields.ts implementation, keeping the contract facade separate.

test analysis:
No tests are included for the buster facade export surface, and the project metadata reports no typecheck command, so missing runtime exports can slip through.

suggested regression test:
Add an import/export smoke test that imports the expected Discord field builder symbols from buster/pipeline/services/discord-fields.ts and verifies they are present.

minimum fix scope:
One-line export target fix in buster/pipeline/services/discord-fields.ts.

## medium: Discord notification observer drops correlation metadata before delivery

id: fnd_sig-feat-service-dfaaf2ccbc-e65c_bb65fe3184
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova External Integrations (feat_service_dfaaf2ccbc)
next: clawpatch show --finding fnd_sig-feat-service-dfaaf2ccbc-e65c_bb65fe3184

evidence:
- nova/pipeline/services/notification-contract.ts:198-212 (observeDiscordNotification)
- nova/pipeline/integrations/discord.ts:271-275 (discord)
- nova/pipeline/integrations/discord.ts:336-343 (discordEmbeds)

The Discord integration records webhook/audit degradation with correlation data only when it can extract correlation fields from the Discord payload or receive opts.correlation. The notification observer forwards presentation data to discord()/discordEmbeds() without passing the normalized notification ids as opts.correlation. For registry-driven notifications whose Discord presentation omits explicit hidden correlation fields, webhook and audit incidents are recorded without run/module/gate/attempt context even though that context is already present in input.ids. This breaks the notification-to-observability contract and makes production Discord delivery failures hard to trace to the affected hook/module/gate.

recommendation:
Pass opts.correlation from observeDiscordNotification using input.ids, mapping runId/moduleId/gateId/gateType/attempt to run_id/module_id/gate_id/gate_type/attempt for both discord() and discordEmbeds().

test analysis:
No linked tests are included for notification observer forwarding or Discord correlation preservation.

suggested regression test:
Add a notification observer test with input.ids populated and presentation.discord lacking correlation fields; stub discord/discordEmbeds or audit targets and assert the forwarded/audited correlation contains run_id, module_id, gate_id, gate_type, and attempt.

minimum fix scope:
nova/pipeline/services/notification-contract.ts observeDiscordNotification only.

## medium: Documented resume commands omit required Nova channel

id: fnd_sig-feat-cli-command-380ac2f9fb-_62dc8c6cbd
category: docs-gap
confidence: high
triage: docs-gap
status: open
feature: Nova Pipeline Entrypoints (feat_cli-command_380ac2f9fb)
next: clawpatch show --finding fnd_sig-feat-cli-command-380ac2f9fb-_62dc8c6cbd

evidence:
- nova/pipeline/cli.ts:131-135 (main)
- nova/pipeline/SKILL.md:10-17
- nova/project_setup/SKILL.md:140-148

The CLI rejects any real pipeline run unless --nova-channel or NOVA_CHANNEL is provided, but the skill and project setup run recipes show the primary --resume invocation with only --project. A fresh operator following the documented command exits before the pipeline starts, unless an unstated environment variable is already configured.

recommendation:
Update the documented run commands to pass --nova-channel <id> or explicitly set NOVA_CHANNEL before --resume, and make the help text mark this as required for pipeline runs.

test analysis:
No tests are included for this feature, and typechecking does not validate Markdown CLI recipes against runtime preconditions.

suggested regression test:
Add a CLI docs smoke test that runs the documented resume recipe form with NOVA_CHANNEL set, and verifies the no-channel case fails with the documented error.

minimum fix scope:
Documentation updates in the Nova pipeline and project setup skill docs, plus an optional CLI smoke test.

repro:
unset NOVA_CHANNEL; node /app/skills/pipeline.ts --project my-project --resume

## medium: Duplicate visual-reg names overwrite artifacts and match the wrong screenshot

id: fnd_sig-feat-agent-tool-c8cc1151d6-3_47cd50af99
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Buster Operator Tools (feat_agent-tool_c8cc1151d6)
next: clawpatch show --finding fnd_sig-feat-agent-tool-c8cc1151d6-3_47cd50af99

evidence:
- buster/pipeline/suites/visual-reg.ts:302-310 (parsePathsJson)
- buster/pipeline/suites/visual-reg.ts:336-340 (runMultiPath)
- buster/pipeline/suites/visual-reg.ts:358-367 (runMultiPath)

paths.json accepts duplicate name values, but artifact paths and result lookup are keyed only by name. Two routes with the same name write to the same actual/baseline/diff filenames, and later screenshots.find returns the first matching result for every duplicate. That can compare the wrong route, overwrite evidence, and report misleading page results.

recommendation:
Reject duplicate route names when parsing paths.json, or introduce a separate unique id for artifact naming and result matching while allowing display names to repeat.

test analysis:
No visual-reg tests are included for malformed or duplicate baseline metadata.

suggested regression test:
Feed parse/runMultiPath a paths.json containing duplicate names and assert the suite returns a contract error before taking screenshots.

minimum fix scope:
Add uniqueness validation for name in parsePathsJson and surface a contract failure that tells the operator which name is duplicated.

repro:
Use paths.json with two entries such as {"name":"home","path":"/"} and {"name":"home","path":"/settings"}. Both targets resolve to the same visual-reg-home-actual.png, and both result lookups use the first screenshot named home.

## medium: Failed session termination is never retried

id: fnd_sig-feat-service-2b3077a806-8087_204b227870
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Runtime Support Services (feat_service_2b3077a806)
next: clawpatch show --finding fnd_sig-feat-service-2b3077a806-8087_204b227870

evidence:
- nova/pipeline/services/summary-session-cleanup.ts:21-30
- nova/pipeline/services/summary-session-cleanup.ts:42-53
- nova/pipeline/services/summary-session-cleanup.ts:56-63

The cleanup closure sets cleaned=true before attempting terminateSession or untrackAgent. If terminateSession throws, diagnostics records the failure but cleaned remains true, so a later finally cleanup call returns already_cleaned and cannot retry termination. A transient gateway or lifecycle failure can therefore leave a summary agent session running.

recommendation:
Track termination and untracking completion separately, or only mark the relevant operation cleaned after it succeeds. Later cleanup calls should retry operations that previously failed while still avoiding duplicate successful cleanup.

test analysis:
No cleanup lifecycle tests were included, and the failure mode requires a throwing dependency followed by a second cleanup call.

suggested regression test:
Use a terminateSession mock that fails once and succeeds on the second call; call the cleanup function twice and assert the second call retries termination.

minimum fix scope:
Adjust createTrackedSummarySessionCleanup state handling and add a focused retry/idempotence test.

## medium: Gate telemetry promises are fired without await on terminal paths

id: fnd_sig-feat-job-7ffa522006-95d7089e_6a34783b38
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Buster Gate Runner (feat_job_7ffa522006)
next: clawpatch show --finding fnd_sig-feat-job-7ffa522006-95d7089e_6a34783b38

evidence:
- nova/pipeline/runners/buster-gate-terminal.ts:49-71
- nova/pipeline/runners/buster-gate-terminal.ts:346-371
- nova/pipeline/runners/buster-gate-terminal.ts:386-402
- nova/pipeline/runners/buster-gate-runner.ts:245-269

handleBusterGateEvaluationResult is async but calls onGatePass/onGateFail without await before returning control results. The exhausted path in the runner awaits onGateFail, which indicates these telemetry hooks are promise-bearing side effects. Returning early can let the pipeline advance or exit before Discord/gateway telemetry is flushed, and rejected telemetry promises become unhandled instead of failing or being recorded deterministically.

recommendation:
Await the telemetry calls in terminal branches, or explicitly collect them with catch handlers if a fire-and-forget policy is intentional and safe for the caller.

test analysis:
No tests were included that make onGatePass/onGateFail asynchronous or rejecting and assert the evaluation result waits for telemetry completion.

suggested regression test:
Inject telemetry hooks that resolve after a tick and reject on demand; assert runBusterGateEvaluation/handleBusterGateEvaluationResult awaits success paths and surfaces or records failures consistently.

minimum fix scope:
buster-gate-terminal.ts and the direct setup-failure onGateFail call in buster-gate-runner.ts.

## medium: Gateway health monitor cannot be cancelled because it drops the interval handle

id: fnd_sig-feat-service-a0fe81756f-1c58_ef995c1a55
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Integrations And Notifications (feat_service_a0fe81756f)
next: clawpatch show --finding fnd_sig-feat-service-a0fe81756f-1c58_ef995c1a55

evidence:
- buster/pipeline/services/gateway-health.ts:36-38 (startGatewayHealthMonitor)
- buster/pipeline/services/gateway-health.ts:58-59 (startGatewayHealthMonitor)

startGatewayHealthMonitor is typed to return the setInterval handle, but it calls setInterval without returning it. Callers therefore receive undefined and cannot clear the monitor during shutdown or tests. The interval can keep running after lifecycle teardown and continue invoking shutdown/logging paths.

recommendation:
Return the setInterval call from startGatewayHealthMonitor, or assign it to a handle and return that handle.

test analysis:
No linked tests exercise the monitor lifecycle or assert that the returned handle can be cleared.

suggested regression test:
Add a test that starts the monitor with a short mocked interval/timer, asserts the returned value is an interval handle, clears it, and verifies no later health checks run.

minimum fix scope:
Return the existing setInterval expression from startGatewayHealthMonitor.

## medium: Gateway injection success is overwritten by Discord notification failure

id: fnd_sig-feat-service-e31a42903c-be88_dbc7aa77c6
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Failure Handling (feat_service_e31a42903c)
next: clawpatch show --finding fnd_sig-feat-service-e31a42903c-be88_dbc7aa77c6

evidence:
- nova/pipeline/services/failures/presentation.ts:223-232 (injectNeedsNova)
- nova/pipeline/services/failures/presentation.ts:233-262 (injectNeedsNova)
- nova/pipeline/services/failures/presentation.ts:263-265 (injectNeedsNova)

The try block covers both the gateway send and the follow-up Discord confirmation. If sendGatewaySessionMessage succeeds but discord(config, 'WARN', ...) rejects, the catch path marks the injection entry as failed and tries to send a critical failure alert. That conflates the primary delivery contract with an auxiliary notification sink, can persist a false failed injection record, and can rethrow if the critical Discord call also fails.

recommendation:
Scope the primary try/catch to sendGatewaySessionMessage only. Once the gateway send is acknowledged, keep entry.status = 'ok'; send the Discord confirmation in a separate best-effort block that records notification degradation without changing gateway delivery status or throwing from injectNeedsNova.

test analysis:
No linked tests exercise partial sink failure where the gateway succeeds and Discord fails, so the cross-sink status overwrite is not guarded.

suggested regression test:
Add a test that stubs gateway delivery success and Discord failure, then asserts injectNeedsNova resolves and appends an ok delivery record with a separate notification warning.

minimum fix scope:
Refactor injectNeedsNova error handling in nova/pipeline/services/failures/presentation.ts.

repro:
Mock sendGatewaySessionMessage to resolve and discord to reject. injectNeedsNova will enter the failure catch after the gateway send already succeeded, set entry.status to failed, and may reject from the second discord call.

## medium: Gateway readiness timeout throws when no shutdown callback is supplied

id: fnd_sig-feat-service-a0fe81756f-c550_50f43ab6e4
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Integrations And Notifications (feat_service_a0fe81756f)
next: clawpatch show --finding fnd_sig-feat-service-a0fe81756f-c550_50f43ab6e4

evidence:
- buster/pipeline/services/gateway-health.ts:16-17 (waitForGateway)
- buster/pipeline/services/gateway-health.ts:26-33 (waitForGateway)
- buster/pipeline/services/gateway-health.ts:36-46 (startGatewayHealthMonitor)

Both waitForGateway and startGatewayHealthMonitor accept shutdown as optional, but call await shutdown(...) on failure without checking or providing a default. If the gateway is unavailable and a caller relies on the optional signature, the failure path becomes a TypeError instead of the structured shutdown event with the intended reason and cleanup metadata.

recommendation:
Either make shutdown required in the type signature or guard the call with a default shutdown implementation that logs and throws/exits in a controlled way.

test analysis:
No tests are included for gateway unavailable paths with omitted shutdown callbacks.

suggested regression test:
Add tests for waitForGateway/startGatewayHealthMonitor with no shutdown callback and a failing health check, asserting the code reports a controlled gateway failure rather than throwing TypeError.

minimum fix scope:
Update the function signatures and/or add a local requireShutdown/defaultShutdown helper used before invoking shutdown.

## medium: Gateway timeoutMs options are leaked into invoke request bodies

id: fnd_sig-feat-service-17a690f465-b8bc_dc74b8a1d6
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Transport Contracts (feat_service_17a690f465)
next: clawpatch show --finding fnd_sig-feat-service-17a690f465-b8bc_dc74b8a1d6

evidence:
- common/pipeline/integrations/gateway.ts:26-36 (GatewayInvokeOptions)
- common/pipeline/integrations/gateway.ts:195-199 (invokeGatewayTool)
- common/pipeline/integrations/gateway.ts:233-261 (gatewayInvoke)
- common/pipeline/integrations/gateway.ts:264-268 (getGatewaySessionStatus)

GatewayInvokeOptions declares timeoutMs, and wrappers merge policy objects containing timeoutMs into opts. gatewayInvoke does not destructure timeoutMs from opts, so it falls into bodyFields and is spread into the JSON payload sent to /tools/invoke. A caller-provided opts.timeoutMs is also ignored for the actual timeout because the positional timeoutMs argument is used instead. Strict gateways can reject the unexpected top-level field, and callers cannot override timeouts through the documented options shape.

recommendation:
Destructure timeoutMs from opts, use it to override the positional timeout when present, and exclude it from bodyFields. Alternatively remove timeoutMs from GatewayInvokeOptions if only the positional argument is supported.

test analysis:
No linked tests assert the exact gateway request body or timeout override behavior, and the index signature allows this to typecheck.

suggested regression test:
Mock fetch around getGatewaySessionStatus and assert the body contains only tool, args, and intentional body fields, then assert opts.timeoutMs changes the abort timing or selected timeout value.

minimum fix scope:
Change gatewayInvoke option destructuring and timeout selection in common/pipeline/integrations/gateway.ts.

repro:
Call getGatewaySessionStatus('s', undefined, { timeoutMs: 1 }) with a mocked fetch. The request still uses the default positional timeout, while the JSON body contains a top-level timeoutMs field.

## medium: Invalid persisted timeout policies can crash before fail-closed handling

id: fnd_sig-feat-job-b7b4461340-c037e750_aab73cdef5
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Approval Gate Runner (feat_job_b7b4461340)
next: clawpatch show --finding fnd_sig-feat-job-b7b4461340-c037e750_aab73cdef5

evidence:
- nova/pipeline/runners/approval-gate-runner.ts:483-488 (runApprovalGateEvaluation)
- nova/pipeline/runners/approval-gate-shared.ts:48-55 (normalizeApprovalGateState)
- nova/pipeline/runners/approval-gate-shared.ts:19-25 (normalizeApprovalTimeoutPolicy)

Resume safety only fail-closes after normalizeApprovalGateState returns, but normalizeApprovalGateState calls normalizeApprovalTimeoutPolicy whenever timeout_policy is present. A persisted state with an illegal timeout_policy, such as "continue_on_timeout", throws from normalization before runApprovalGateEvaluation can build the typed approval control result, notify Discord via failClosedOnInvalidApprovalState, or preserve the intended pipeline gate failure semantics. This is a production recovery path that typechecks will not catch because persisted JSON is runtime data.

recommendation:
Catch timeout-policy normalization errors around persisted state normalization and route them through the same fail-closed invalid-state path, or make normalizeApprovalGateState return a marked invalid-state object instead of throwing for persisted data.

test analysis:
No tests were included for this feature, and the excerpts show no regression coverage for malformed persisted timeout_policy values during resume.

suggested regression test:
Add a resume test with a persisted approval state containing status PENDING_APPROVAL and an invalid timeout_policy, then assert the runner returns an approval typed control result with nextAction block, invalid_state metadata, and emits the invalid-state operator alert path rather than throwing.

minimum fix scope:
Wrap persisted-state normalization in runApprovalGateEvaluation and resolveObservedApprovalState, or adjust normalizeApprovalGateState callers that consume persisted files to convert normalization failures into failClosedOnInvalidApprovalState.

repro:
Persist a gate-status JSON with a valid approval status such as PENDING_APPROVAL and timeout_policy set to an unsupported string. On resume, runApprovalGateEvaluation calls normalizeApprovalGateState and throws instead of returning a typed BLOCK result.

## medium: Kubeconform JSON resources are never inspected

id: fnd_sig-feat-agent-tool-0f7714ee2a-3_36ea3642d3
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-3_36ea3642d3

evidence:
- nova/pipeline/tools/lint-report/container-yaml-tools.ts:119-143 (kubeconform.run)

kubeconform -output json -summary emits a JSON document with resources and summary, not newline-delimited records with a top-level status field. This parser splits stdout by line and checks item.status directly. Compact JSON parses as a summary object with no status and yields zero findings; pretty JSON produces parse warnings instead of invalid manifest errors.

recommendation:
Parse stdout once as JSON, iterate parsed.data.resources, and use the summary only for diagnostics. Keep an NDJSON fallback only if needed for older tool modes.

test analysis:
No tests are included for kubeconform JSON output with invalid resources.

suggested regression test:
Add a kubeconform runner test with a resources array containing statusInvalid and assert one error finding is returned.

minimum fix scope:
Replace the kubeconform line-by-line parser with a JSON document parser over resources.

repro:
Given kubeconform stdout {"resources":[{"filename":"bad.yaml","status":"statusInvalid","msg":"bad"}],"summary":{"invalid":1}}, the loop parses one object, item.status is undefined, and no error finding is emitted.

## medium: Local evidence watcher can miss target creation under a missing parent

id: fnd_sig-feat-service-8348e0b688-808d_c842e3ab23
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Polling And Completion (feat_service_8348e0b688)
next: clawpatch show --finding fnd_sig-feat-service-8348e0b688-808d_c842e3ab23

evidence:
- nova/pipeline/services/completion-event-adapters.ts:177-197 (buildWatcherSpecs)
- nova/pipeline/services/completion-event-adapters.ts:263-288 (createLocalEvidenceEventAdapter.start)

For a target path whose parent directory does not exist, the adapter watches the nearest existing ancestor but filters events to either the final basename or the exact target path. Creating an intermediate directory emits an event for that directory, which fails the filter, and the adapter never re-arms a watcher deeper in the tree. The local completion event is then lost until another signal, such as Redis, arrives or the wait times out.

recommendation:
When watching an ancestor for a not-yet-existing target, treat creation/change of any path that is an ancestor of the target as relevant and re-check the target. Alternatively, create/watch the parent directory before polling begins or re-build watcher specs after ancestor events.

test analysis:
No linked tests cover local evidence paths with missing parent directories; this is an fs.watch runtime behavior that static checks will not detect.

suggested regression test:
Use a temporary directory, start `createLocalEvidenceEventAdapter` on a nested target whose parent is absent, create the parent and target file, and assert that `local.evidence.updated` is emitted.

minimum fix scope:
Adjust the local adapter's watcher filter/re-arm logic and add a focused adapter test.

repro:
Watch `/tmp/root/new-dir/output.json` while only `/tmp/root` exists, then create `new-dir/output.json`. The watched ancestor reports `new-dir`; line 275 rejects it because it is neither `output.json` nor the full target path.

## medium: Manifest suite ignores multi-document Kubernetes YAML

id: fnd_sig-feat-test-suite-77bede17d2-f_438985f1e3
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-f_438985f1e3

evidence:
- buster/pipeline/suites/manifest.ts:73-85
- buster/pipeline/suites/manifest.ts:117-121
- buster/pipeline/suites/manifest.ts:212-214

The file already has a loadYamlDocuments helper, but manifestSuite parses only one YAML document and then requires that single document to be a Deployment. Multi-document Kubernetes manifests are common; a Service followed by a Deployment falsely fails, while a Deployment followed by additional workload or secret-related documents is silently ignored.

recommendation:
Parse all documents with loadYamlDocuments, select Deployment or relevant workload documents, and aggregate image/env/probe/secret checks across them. Fail only when no supported workload document exists.

test analysis:
No manifest parsing tests were included, and a single-document fixture would not catch this production YAML shape.

suggested regression test:
Add a manifest suite fixture with Service plus Deployment documents and assert validation inspects the Deployment rather than only the first document.

minimum fix scope:
Update manifestSuite parsing and extractFromParsedDoc usage to operate over loaded document arrays.

repro:
Use manifest.deployment_yaml pointing to a multi-document YAML where the first document is a Service and the second is a valid Deployment. The suite reports the deployment YAML invalid or missing kind Deployment even though the manifest contains one.

## medium: Module Buster archive errors are not contained

id: fnd_sig-feat-service-28093c6232-4bea_a533cfbe7b
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Agent Runtime And Orchestration (feat_service_28093c6232)
next: clawpatch show --finding fnd_sig-feat-service-28093c6232-4bea_a533cfbe7b

evidence:
- nova/pipeline/agents/module-workers.ts:302-324 (runModuleBusterWorker)
- nova/pipeline/agents/module-worker-control-results.ts:105-154 (buildModuleBusterWorkerControlResult)

runModuleBusterWorker converts an archive result with failed=true into a typed control result, but it does not catch exceptions thrown by archiveModuleCompletions itself. A thrown Redis/archive error bypasses buildModuleBusterWorkerControlResult, skips clearShutdownContext, and escapes the worker as an untyped failure, which can leave orchestration without the expected nextAction/failureClass contract.

recommendation:
Wrap the archive call in try/catch and return the same completion_archive_failed typed worker control result on thrown errors, including clearShutdownContext in that path.

test analysis:
No tests are included for archiveModuleCompletions throwing versus returning { failed: true }.

suggested regression test:
Inject an archive dependency that throws and assert runModuleBusterWorker returns a module_buster typed result with nextAction=block, failureClass=completion_archive_failed, and cleanup called.

minimum fix scope:
Add exception handling around the archive call in runModuleBusterWorker.

## medium: Nested Helm charts are filtered out before recursive chart discovery

id: fnd_sig-feat-agent-tool-0f7714ee2a-4_06771f8087
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-4_06771f8087

evidence:
- nova/pipeline/tools/lint-report/discovery.ts:93-100 (detectProjectTypes)
- nova/pipeline/tools/lint-report/container-yaml-tools.ts:58-64 (helm-lint.detect)
- nova/pipeline/tools/lint-report/container-yaml-tools.ts:113-117 (kubeconform.detect)

detectProjectTypes only marks helm when Chart.yaml exists directly at scanRoot or repoRoot. helm-lint and kubeconform are filtered by ctx.projectTypes.has('helm') before their run logic executes, even though helm-lint would recursively find Chart.yaml files. A full-repo run over a common layout like charts/app/Chart.yaml skips Helm and kubeconform entirely.

recommendation:
Detect Helm using the same recursive Chart.yaml search used by helm-lint, or make the tool detect functions perform their own scoped recursive checks.

test analysis:
No discovery tests are included for nested Helm chart layouts.

suggested regression test:
Add a detectProjectTypes test with charts/app/Chart.yaml and assert helm is detected, then assert helm-lint is applicable.

minimum fix scope:
Change Helm detection in detectProjectTypes to use findFiles(scanRoot, f => f === 'Chart.yaml', 3).

repro:
Run lint-report on a repo whose only chart is charts/app/Chart.yaml. detectProjectTypes does not add helm, so neither helm-lint nor kubeconform is applicable.

## medium: Non-object pre-test verdicts can crash failure classification

id: fnd_sig-feat-service-e31a42903c-90ca_f4d41e7508
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Failure Handling (feat_service_e31a42903c)
next: clawpatch show --finding fnd_sig-feat-service-e31a42903c-90ca_f4d41e7508

evidence:
- nova/pipeline/services/failures/classification.ts:217-228 (parsePreTestVerdict)
- nova/pipeline/services/failures/classification.ts:269-272 (classifyPreTestFailure)
- nova/pipeline/services/failures/presentation.ts:73-74 (buildPreTestDiscordFields)

parsePreTestVerdict returns the raw JSON.parse result for any syntactically valid verdict string. A serialized value like "null" is valid JSON and truthy before parsing, so the helper returns null. classifyPreTestFailure and buildPreTestDiscordFields then immediately read .suites and throw, preventing the corrupted payload from being classified, presented, or retried through the intended failure path.

recommendation:
Normalize parsePreTestVerdict output: after parsing, verify the value is a non-null object and that suites is an object; otherwise report a nonblocking incident and return { suites: {} }.

test analysis:
No linked tests are included for malformed-but-valid Redis verdict payloads, and @ts-nocheck prevents static checking from catching the nullable return shape.

suggested regression test:
Add a pre-test classification/presentation test with verdict values 'null', '[]', and '{"suites":null}' and assert each returns an empty suite summary without throwing.

minimum fix scope:
Update parsePreTestVerdict in nova/pipeline/services/failures/classification.ts and cover callers that consume suites.

repro:
Call classifyPreTestFailure({ reason: 'pretest failed', verdict: 'null' }) or buildPreTestDiscordFields({ verdict: 'null' }); both can throw before producing failure metadata.

## medium: Noncritical reporting can throw through custom sinks

id: fnd_sig-feat-library-2d10436c9e-2c71_2fb81bbe05
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-2c71_2fb81bbe05

evidence:
- common/pipeline/noncritical-reporting.ts:96-134

reportClassifiedNonBlockingError invokes log and fallback callbacks without try/catch, while only the final stderr write is protected. If the configured reporting sink throws, a noncritical incident can become a pipeline exception and the incident key is already marked as reported.

recommendation:
Wrap log and fallback invocations, fall through to the next sink or stderr on failure, and only mark an incident as reported after a sink succeeds or intentionally suppresses it.

test analysis:
No linked tests were provided for failing log/fallback callbacks; static checks cannot catch thrown runtime sinks.

suggested regression test:
Provide a log callback that throws and a fallback/stderr sink that succeeds; assert reportClassifiedNonBlockingError returns true and does not throw.

minimum fix scope:
common/pipeline/noncritical-reporting.ts reportClassifiedNonBlockingError.

## medium: Operator remediation prompt can escape its XML fence

id: fnd_sig-feat-service-2b3077a806-d5e7_8ff71a16f9
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Nova Runtime Support Services (feat_service_2b3077a806)
next: clawpatch show --finding fnd_sig-feat-service-2b3077a806-d5e7_8ff71a16f9

evidence:
- nova/pipeline/services/prompt-ingress.ts:116-130

formatOperatorRemediationDirective inserts untrusted prompt text raw between fixed operator_remediation_directive tags. A prompt containing the closing tag can terminate the fenced section early and place attacker-controlled instructions outside the boundary that the surrounding text relies on for containment.

recommendation:
Encode or escape the prompt before embedding it, or wrap it in a serialization format where delimiter text cannot become structural markup. At minimum, neutralize closing operator_remediation_directive tags before joining the directive.

test analysis:
No prompt-ingress tests were included for delimiter injection; length and secret redaction checks do not prove the boundary survives hostile content.

suggested regression test:
Pass a prompt containing '</operator_remediation_directive>' followed by extra instructions and assert the formatted directive does not contain an unescaped closing tag from user input.

minimum fix scope:
Update formatOperatorRemediationDirective to escape or encode prompt content and add one hostile-delimiter test.

## medium: Optional visual-reg Discord media capability blocks visual validation

id: fnd_sig-feat-test-suite-77bede17d2-b_b9e9799258
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-b_b9e9799258

evidence:
- buster/pipeline/suites/visual-reg-discord.ts:9-11
- buster/pipeline/suites/visual-reg.ts:485-503

Discord delivery is documented as optional and noncritical, but runVisualReg returns a critical ERROR before baseline parsing or screenshot comparison whenever a webhook is configured and DISCORD_MEDIA capability is absent. That turns an external reporting permission into a validation blocker and loses the visual-reg evidence the suite is supposed to produce.

recommendation:
Treat denied Discord media permission as skipped or failed_noncritical delivery metadata and continue the visual comparison. Only required validation capabilities, such as browser automation for screenshots, should block the suite.

test analysis:
No visual-reg capability or Discord-disabled tests were included; static typing accepts both the early error and the intended noncritical delivery path.

suggested regression test:
Add a visual-reg test with a webhook configured and DISCORD_MEDIA omitted, asserting screenshots are compared and the verdict reflects visual status with Discord marked noncritical/skipped.

minimum fix scope:
Change the Discord capability branch in runVisualReg and, if needed, extend the typed delivery summary to represent capability-skipped delivery.

repro:
Configure a Discord webhook, run visual-reg with browser capability but without DISCORD_MEDIA, and the suite exits with buster_capability_denied before taking screenshots or comparing baselines.

## medium: Payload fields can override authoritative telemetry identity

id: fnd_sig-feat-service-c85e781af1-0ca9_3d2a610ab2
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Telemetry Services (feat_service_c85e781af1)
next: clawpatch show --finding fnd_sig-feat-service-c85e781af1-0ca9_3d2a610ab2

evidence:
- nova/pipeline/services/telemetry-sink-contract.ts:29-39 (normalizeTelemetrySinkIds)
- nova/pipeline/services/telemetry-stream.ts:132-146 (emitTelemetryStreamEvent)
- nova/pipeline/services/telemetry/dispatch.ts:13-23 (appendCoreTelemetryEvent)

The sink input accepts payload.run_id before the runtime run id, so a payload value can route the event to a different run stream. The Redis stream event then builds canonical fields such as type, ts, run_id, project, seq, source, and emitter, but spreads sanitizeTelemetryPayload(payload) afterward, allowing payload keys with the same names to overwrite the canonical envelope. When Redis succeeds, appendCoreTelemetryEvent prefers that Redis event for disk output, so the corrupted envelope can also become the local structured event payload.

recommendation:
Treat runtime/options identity and the eventType argument as authoritative. Resolve runId from options or ctx/config before payload, and either strip reserved envelope keys from sanitized payloads or spread payload first and canonical fields last.

test analysis:
No linked tests exercise conflicting payload fields such as run_id, type, seq, project, source, or emitter against the canonical telemetry envelope.

suggested regression test:
Add a stream emission test with payload fields run_id, type, seq, project, source, and emitter set to conflicting values, then assert the emitted Redis event keeps the ctx/options run id, requested event type, allocated sequence, and canonical source/emitter.

minimum fix scope:
Change identity precedence in normalizeTelemetrySinkIds and protect reserved envelope keys in emitTelemetryStreamEvent.

repro:
Emit a telemetry event with a valid ctx run id but a payload containing run_id or type values that differ from the event context. The Redis event object will use the payload's conflicting values after the spread, and payload.run_id can be selected as the sink run id when options.runId is absent.

## medium: Plugin artifact lane segments allow '..' path traversal

id: fnd_sig-feat-service-2b3077a806-82eb_27768fcf5d
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Nova Runtime Support Services (feat_service_2b3077a806)
next: clawpatch show --finding fnd_sig-feat-service-2b3077a806-82eb_27768fcf5d

evidence:
- nova/pipeline/services/artifact-bundle.ts:51-54
- nova/pipeline/services/artifact-bundle.ts:102-121
- nova/pipeline/services/artifact-bundle.ts:445-462

sanitizeSegment preserves '.' characters, so a segment value of '..' remains '..'. resolveArtifactLanePaths passes sanitized moduleId, hookFamily, and stageId directly to path.join, where '..' is normalized as a parent directory. persist() then creates dataDir and writes the artifact payload under that escaped lane path, allowing plugin artifact writes outside the intended plugin-artifacts directory.

recommendation:
Reject or rewrite dot-only path segments, then assert the resolved laneDir and dataDir remain inside the expected runLogDir/plugin-artifacts root before writing.

test analysis:
No tests were included for artifact path containment, and @ts-nocheck prevents static guarantees around these untyped identifiers.

suggested regression test:
Create a plugin artifacts API with moduleId='..', hookFamily='..', or stageId='..' and assert construction or persist() rejects instead of creating a path outside runLogDir/plugin-artifacts.

minimum fix scope:
Harden sanitizeSegment or resolveArtifactLanePaths and add a containment check around laneDir/dataDir.

## medium: Project summary Discord embeds can exceed Discord field limits

id: fnd_sig-feat-agent-tool-96bf37285e-9_d916c2b67c
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Project Summary Tools (feat_agent-tool_96bf37285e)
next: clawpatch show --finding fnd_sig-feat-agent-tool-96bf37285e-9_d916c2b67c

evidence:
- nova/pipeline/tools/project-summary-formatters.ts:337-343
- nova/pipeline/tools/project-summary-formatters.ts:360-377
- nova/pipeline/services/summary/project-summary.ts:63-72

The formatter joins gate titles and hardest-module text directly into Discord embed field values without enforcing Discord's 1024-character per-field limit. The service then sends these embeds as-is when a webhook is configured. A project with enough gates, long gate titles, or long module titles can make the project summary Discord post fail even though summary generation succeeded, losing the notification path for this report.

recommendation:
Clamp or chunk every Discord embed field value produced by buildDiscordEmbeds before calling discordEmbeds, using a shared Discord-safe formatter if one exists. At minimum, truncate gateStr, hardest, scopeSummary, quality, langs, and agent/test strings to the platform field limit with a clear truncation marker.

test analysis:
No linked tests are included for the project-summary Discord formatter or service path, and the implementation has no local guard that would fail fast before sending oversized fields.

suggested regression test:
Create a project summary embed with many long gate titles and assert every returned field value is at or below Discord's field value limit before generateProjectSummary posts it.

minimum fix scope:
nova/pipeline/tools/project-summary-formatters.ts

## medium: Project summary is marked failed when only Discord posting fails

id: fnd_sig-feat-service-2b3077a806-55dc_d9e2fe5155
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Runtime Support Services (feat_service_2b3077a806)
next: clawpatch show --finding fnd_sig-feat-service-2b3077a806-55dc_d9e2fe5155

evidence:
- nova/pipeline/services/summary/project-summary.ts:48-61
- nova/pipeline/services/summary/project-summary.ts:63-72
- nova/pipeline/services/summary/project-summary.ts:86-105

generateProjectSummary writes the markdown/data artifacts and logs success before awaiting discordEmbeds. Because the Discord post is inside the main try block with no local catch, a webhook failure jumps to the catch path, emits project_summary failed telemetry, and returns a failed generator result even though the summary artifacts were already saved.

recommendation:
Treat Discord delivery as a noncritical side effect: catch discordEmbeds errors locally, log/report the notification failure, and keep the generator result status ok when artifact generation succeeded.

test analysis:
No linked tests cover partial side-effect failure after artifacts are written; typechecking cannot distinguish core artifact success from optional Discord notification failure.

suggested regression test:
Mock a generator that returns valid summary content and mock discordEmbeds to throw; assert generateProjectSummary returns status ok with artifact paths and records only a notification diagnostic/log.

minimum fix scope:
Wrap the Discord embed send in its own try/catch inside generateProjectSummary.

## medium: Prompted shell cd commands do not quote workspace paths

id: fnd_sig-feat-job-7ffa522006-61a385c0_19a61d5acb
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Nova Buster Gate Runner (feat_job_7ffa522006)
next: clawpatch show --finding fnd_sig-feat-job-7ffa522006-61a385c0_19a61d5acb

evidence:
- nova/pipeline/prompts/buster-gate.ts:22-30
- nova/pipeline/prompts/buster-module.ts:22-35

Both prompt builders interpolate the project source path into an executable `cd` recipe without shell quoting or `--`. Because the path is derived from configuration/workspace input and the prompt tells the agent to run it, paths containing spaces break the command and paths containing shell metacharacters can change the command the agent executes.

recommendation:
Render shell commands through a shared quoting helper, for example `cd -- '<escaped path>'`, or avoid embedding executable shell when structured working-directory metadata is enough.

test analysis:
No prompt snapshot or unit tests were included for repo/project paths containing spaces, leading hyphens, quotes, or shell metacharacters.

suggested regression test:
Build gate and module prompts with a project source path like `work dir/one; touch bad` and assert the generated command uses robust shell quoting and `cd --`.

minimum fix scope:
buster-gate.ts, buster-module.ts, or a shared prompt shell-quoting helper used by both.

## medium: Public hook enumeration omits model_usage even though model usage events require it

id: fnd_sig-feat-library-1d0d18c75c-a764_a89f1715a5
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Agent Observability Library (feat_library_1d0d18c75c)
next: clawpatch show --finding fnd_sig-feat-library-1d0d18c75c-a764_a89f1715a5

evidence:
- common/pipeline/agent-observability/src/constants.ts:39-53 (AGENT_OBSERVABILITY_HOOKS)
- common/pipeline/agent-observability/src/mapping.ts:93-98 (AGENT_OBSERVABILITY_TELEMETRY_MAPPINGS)
- common/pipeline/agent-observability/src/validation.ts:16-31 (TYPE_TO_HOOK)
- common/pipeline/agent-observability/src/validation.ts:304-309 (knownAgentObservabilityHooks)

The contract accepts and maps openclaw.model.usage with payload.hook set to model_usage, but the exported hook list returned by knownAgentObservabilityHooks is sourced from AGENT_OBSERVABILITY_HOOKS, which does not include model_usage. Any pipeline package that uses the exported hook list to register hooks, validate allowed hooks before event construction, or generate subscription metadata will silently omit model usage events even though the validator and telemetry mapping expect them. TypeScript does not catch this because AgentObservabilityPayloadHook manually unions AgentObservabilityHook with 'model_usage'.

recommendation:
Include 'model_usage' in the exported hook enumeration or provide a separate exported payload-hook enumeration that includes it, and make knownAgentObservabilityHooks return the complete set used by ingress payloads.

test analysis:
No tests are included for consistency between the exported hook list, TYPE_TO_HOOK, and telemetry mappings.

suggested regression test:
Add a contract test that every TYPE_TO_HOOK value and every telemetry mapping hook is present in the public payload-hook enumeration returned to consumers, including model_usage.

minimum fix scope:
Update constants/public enumeration and the associated type/export helper so model_usage is discoverable wherever payload hooks are enumerated.

## medium: Rate-limit embed formatting throws on malformed cooldown values

id: fnd_sig-feat-service-17a690f465-6d02_b1bd830a95
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Transport Contracts (feat_service_17a690f465)
next: clawpatch show --finding fnd_sig-feat-service-17a690f465-6d02_b1bd830a95

evidence:
- common/pipeline/services/rate-limit-contract.ts:69-75 (formatRateLimitEmbed)
- common/pipeline/services/rate-limit-contract.ts:81-90 (formatRateLimitEmbed)

formatRateLimitEmbed accepts cooldownMs as unknown but immediately converts it with Number and builds a Date from the result. For undefined, null-like invalid input, or a non-numeric string, the value becomes NaN and resumeAt.toISOString() throws RangeError. That can drop the Discord notification or interrupt rate-limit handling exactly when recovery telemetry is needed.

recommendation:
Validate cooldownMs as a finite non-negative number before creating the Date. Return a safe fallback embed value or throw a contract error before doing partial formatting.

test analysis:
No linked tests cover malformed or missing cooldown inputs, and the unknown parameter type prevents compile-time protection.

suggested regression test:
Add tests for numeric, numeric-string, missing, and invalid cooldownMs inputs; assert invalid inputs do not throw unexpectedly or produce an explicit contract error.

minimum fix scope:
Add cooldown normalization/validation inside formatRateLimitEmbed in common/pipeline/services/rate-limit-contract.ts.

repro:
Call formatRateLimitEmbed({}, 1, 3, 'not-a-number'); it constructs an invalid Date and throws when formatting Resume at.

## medium: Rate-limit exhaustion telemetry is fired without returning its promises

id: fnd_sig-feat-service-e49e423db1-fc99_4ce3870f80
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Rate Limiting (feat_service_e49e423db1)
next: clawpatch show --finding fnd_sig-feat-service-e49e423db1-fc99_4ce3870f80

evidence:
- nova/pipeline/services/rate-limit-exit.ts:261-296 (finalizeSessionRateLimitExhaustion)
- nova/pipeline/services/rate-limit-builders.ts:92-114 (emitGateRetryExhausted)
- nova/pipeline/services/rate-limit-exit.ts:321-345 (finalizePostRunSummaryRateLimitExhaustion)
- nova/pipeline/services/rate-limit-exit.ts:610-622 (createModuleSessionRateLimitExhaustionOptions)
- nova/pipeline/services/failures/retry-policy.ts:111-123 (handleFail)

The finalizer only awaits and catches what an exhaustion hook returns. Several rate-limit hooks call onRetryExhausted/onSummaryCompleted without returning or awaiting those calls, and the gate wrapper helper also drops the onRetryExhausted return value. The retry policy context treats the same telemetry APIs as awaitable, so rate-limit exhaustion can return before retry/summary telemetry is flushed; rejected telemetry writes also bypass the durable delivery-failure alert path in runHook.

recommendation:
Return or await the telemetry promises from emitGateRetryExhausted and every emitRetryExhausted/emitSummaryCompleted hook used by rate-limit exhaustion finalizers.

test analysis:
No linked tests were included for this feature, and @ts-nocheck means the missing promise returns are not statically enforced.

suggested regression test:
Mock onRetryExhausted/onSummaryCompleted with delayed and rejecting promises, call the gate/module/summary finalizers, and assert finalizeSessionRateLimitExhaustion waits for success and records delivery-failure evidence on rejection.

minimum fix scope:
Update the rate-limit telemetry wrapper/helper functions to return the telemetry calls; make hook implementations async or return the promise directly.

## medium: read-completion accepts missing identity and prints null

id: fnd_sig-feat-agent-tool-76a5edb417-e_1a1d18e16f
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Redis Operator Tool (feat_agent-tool_76a5edb417)
next: clawpatch show --finding fnd_sig-feat-agent-tool-76a5edb417-e_1a1d18e16f

evidence:
- nova/pipeline/tools/redis.ts:229-242 (lib.readCompletion)
- nova/pipeline/tools/redis.ts:324-334 (main)

readCompletion rejects weak expected-completion identity by returning null, but the CLI only validates --stream and --module before calling it with possibly undefined run_id, attempt, dispatch_id, and session_key. A malformed invocation therefore exits successfully with JSON null, which is indistinguishable from 'no completion yet' for shell callers and can cause polling or recovery logic to wait forever instead of failing on bad input.

recommendation:
Make the CLI validate the same strong identity fields required by readCompletion and exit nonzero with the missing field list, or explicitly support and document an unscoped read mode separately.

test analysis:
No linked tests exercise the CLI argument contract for read-completion or assert that missing identity is reported as an invocation error.

suggested regression test:
Call main with --action read-completion, --stream, and --module but no identity flags, and assert it rejects with an error listing the missing identity fields instead of writing null.

minimum fix scope:
Add identity validation to the read-completion branch in nova/pipeline/tools/redis.ts.

repro:
Run the read-completion action with only --stream and --module; the CLI reaches readCompletion with an empty identity and prints null rather than a usage error.

## medium: Redis completion verdict validation accepts non-JSON strings

id: fnd_sig-feat-service-17a690f465-9932_625e3f3077
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Transport Contracts (feat_service_17a690f465)
next: clawpatch show --finding fnd_sig-feat-service-17a690f465-9932_625e3f3077

evidence:
- common/pipeline/services/redis-message-contract.ts:247-249 (validateRedisCompletionEntry)

The validator reports that verdict must be a JSON string, but it only checks typeof string. A completion entry with verdict set to an arbitrary non-JSON string passes validation and can later fail when downstream code parses the machine-readable verdict after the contract has accepted it.

recommendation:
Parse verdict when present and reject invalid JSON, or change the contract/error wording if verdict is intentionally an opaque string.

test analysis:
No linked tests exercise malformed completion verdict values; a typecheck only proves the field is a string, not that it is parseable JSON.

suggested regression test:
Add a completion validation test that rejects verdict: 'not-json' and accepts a representative JSON string verdict.

minimum fix scope:
Update validateRedisCompletionEntry verdict handling in common/pipeline/services/redis-message-contract.ts.

repro:
A valid completion envelope with verdict: 'not-json' does not receive a verdict validation error from validateRedisCompletionEntry.

## medium: Redis publish can wait forever for readiness

id: fnd_sig-feat-agent-tool-c8cc1151d6-1_1484352bcd
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Operator Tools (feat_agent-tool_c8cc1151d6)
next: clawpatch show --finding fnd_sig-feat-agent-tool-c8cc1151d6-1_1484352bcd

evidence:
- buster/pipeline/tools/redis.ts:48-56 (getRedis)
- buster/pipeline/tools/redis.ts:115-117 (publishTask)

publishTask waits on a bare once('ready') whenever the client is not already ready. If Redis is down, misconfigured, or the client transitions to an end/error state without later emitting ready, this promise never settles. Because no Redis command is issued before the wait, maxRetriesPerRequest does not bound the failure, leaving the operator command stuck instead of producing a typed failure.

recommendation:
Race readiness against error/end/close events and a bounded timeout. On failure, disconnect the client and return a clear error rather than waiting indefinitely.

test analysis:
No Redis tool tests are included, and the failure requires a runtime client state that static checks will not catch.

suggested regression test:
Use a fake Redis EventEmitter whose status is not ready and which never emits ready, then assert publishTask rejects after a configured timeout instead of hanging.

minimum fix scope:
Change the readiness wait in redis.ts to a shared waitForRedisReady helper with timeout and failure-event handling.

repro:
Point the tool at an unreachable Redis endpoint and run the send action. The client logs errors, but publishTask remains blocked waiting for a ready event and the CLI does not exit.

## medium: Redis queue reads return a shape that the Redis task validator rejects

id: fnd_sig-feat-service-17a690f465-4740_edcdd7d85c
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Transport Contracts (feat_service_17a690f465)
next: clawpatch show --finding fnd_sig-feat-service-17a690f465-4740_edcdd7d85c

evidence:
- common/pipeline/services/task-transport-contract.ts:46-52 (decodeRedisStreamEntry)
- common/pipeline/services/task-transport-contract.ts:109-120 (readNext)
- common/pipeline/services/redis-message-contract.ts:142-154 (validateRedisPipelineEnvelope)
- common/pipeline/services/redis-message-contract.ts:182-188 (validateRedisTaskEntry)

The queue adapter decodes Redis stream entries as { id, fields, data, reclaimed }, while the message contract validates flat entries and requires a Redis stream id at _id by default. Passing the decoded object fails the field checks, and passing decoded.data still fails the default _id requirement. That makes valid Redis stream tasks require an undocumented rewrap step before validation, which can leave workers rejecting or repeatedly reclaiming otherwise valid tasks.

recommendation:
Make the transport output canonical for the message contract, for example return { _id: id, ...data, id, fields, reclaimed }, or add a shared normalizer that validators and consumers use for decoded stream entries.

test analysis:
No linked tests are included, and TypeScript will not catch the runtime shape mismatch between the two shared contracts.

suggested regression test:
Add a test that decodes a representative Redis stream task entry from createRedisTaskQueue/readNext and asserts it passes assertRedisTaskEntry with default options.

minimum fix scope:
Align decodeRedisStreamEntry/readNext output with validateRedisTaskEntry input, or add and use a shared decoded-entry normalization helper.

repro:
Decode a Redis stream entry like ['1-0', ['schema_version','v1','type','module_test','stream_role','task','project','p','run_id','r','target_kind','module','target_id','m','module','m','attempt','1','dispatch_id','d','source','s','sender','s','payload','{}']]. validateRedisTaskEntry(decoded) sees no flat type/source/_id, while validateRedisTaskEntry(decoded.data) still reports _id missing.

## medium: Remediable and waitable normalization drops plugin correlation metadata

id: fnd_sig-feat-job-5e93532101-0661252b_dd1a768a6e
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Gate Engines (feat_job_5e93532101)
next: clawpatch show --finding fnd_sig-feat-job-5e93532101-0661252b_dd1a768a6e

evidence:
- nova/pipeline/runners/gate-runner.ts:244-270 (normalizeGateControlResultForAdapter)
- nova/pipeline/runners/gate-runner.ts:290-302 (runScheduledStandardGate)
- nova/pipeline/runners/gate-runner.ts:315-325 (runScheduledRegistryGate)
- nova/pipeline/runners/gate-runner.ts:340-350 (runScheduledRegistryGate)

normalizeGateControlResultForAdapter forwards opts.moduleId and opts.pluginInvocation into the normalized contract. The standard gate path supplies both from the scheduled invocation record, but the remediable and waitable closures only pass stageId and inherited opts, so their normalized control results lose moduleId and invocation metadata even though pluginInvocation is already available in the caller. That creates inconsistent diagnostics and telemetry correlation between gate modes.

recommendation:
Capture the scheduled invocation record for remediable and waitable gates, and pass moduleId plus pluginInvocation through every normalizeControlResult call, including post-wait and post-remediation normalization.

test analysis:
No tests were included for these gate engines, and this is a runtime diagnostics contract difference that ts-nocheck will not catch.

suggested regression test:
Add remediable and waitable gate runner tests that normalize a plugin result and assert diagnostics include the same moduleId and invocation fields as the standard gate path.

minimum fix scope:
nova/pipeline/runners/gate-runner.ts plus the normalize call sites in the remediable and waitable engine wrappers if they need to propagate normalize options.

## medium: Session parser can emit states that terminal/unreachable predicates never recognize

id: fnd_sig-feat-library-67301c61e0-829b_94c49f7ccf
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Agent Primitives (feat_library_67301c61e0)
next: clawpatch show --finding fnd_sig-feat-library-67301c61e0-829b_94c49f7ccf

evidence:
- common/pipeline/agents/session-semantics.ts:11-15 (parseSessionState)
- common/pipeline/agents/session-semantics.ts:23-28 (parseSessionState)
- common/pipeline/agents/session-semantics.ts:34-43 (isSessionTerminalState/isStoppedSessionState/isUnreachableSessionState)
- common/pipeline/agents/acp-monitor.ts:287-308 (buildMonitorState)
- common/pipeline/agents/lifecycle.ts:106-121 (waitForSessionStop)

parseSessionState returns structured status/state values directly after lowercasing them, so gateway states like failed, aborted, cancelled, or canceled become inactive states that are not terminal or stopped according to the predicates. The text parser also creates states shaped like unknown (<detail>), but isUnreachableSessionState only matches exact unknown. buildMonitorState and waitForSessionStop rely on those predicates for terminal detection, unknown poll accounting, and stop confirmation, so a state produced by the parser itself can become neither active, terminal, stopped, nor unreachable. That can keep monitor adapters running until an external budget expires and can make kill confirmation fail for sessions that already ended.

recommendation:
Normalize parseSessionState outputs to canonical states before returning, or expand the predicates to include the states the parser can produce. At minimum, treat failed/failure/errored/aborted/cancelled/canceled as terminal or stopped, and treat unknown-prefixed parser output as unreachable.

test analysis:
No tests were included for this feature, and the provided package.json exposes no test script, so these parser/predicate edge cases are not covered in the shown context.

suggested regression test:
Add session-semantics tests asserting that structured failed/cancelled/aborted states are terminal or stopped, and that unrecognized statusText output is unreachable. Add a monitor-state test showing unknown stale polls advance for parser-produced unknown states.

minimum fix scope:
common/pipeline/agents/session-semantics.ts, with expected monitor behavior updated if existing callers assert the current raw state strings.

repro:
parseSessionState({ state: 'failed' }).state returns 'failed', but isSessionTerminalState('failed') and isStoppedSessionState('failed') are false. parseSessionState({ raw: 'unexpected gateway text' }).state returns 'unknown (unexpected gateway text)', but isUnreachableSessionState(...) is false, so unknownPolls resets instead of advancing the unknown-stale timeout.

## medium: Shared result and report paths are overwritten across module runs

id: fnd_sig-feat-test-suite-77bede17d2-6_0abd1679c0
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-6_0abd1679c0

evidence:
- buster/pipeline/runners/suite-runner.ts:316-333
- buster/pipeline/suites/perf.ts:50-79
- buster/pipeline/suites/perf.ts:141-150

The runner writes every module's sandbox verdicts to the same fixed filenames under /sandbox/results, and the perf suite uses one fixed Lighthouse scratch report path before copying it. Sequential module runs lose earlier persisted verdicts, and concurrent perf runs can read or copy another run's report, producing corrupted telemetry artifacts even when in-memory suite results are correct.

recommendation:
Namespace shared artifacts by moduleId plus attempt/run id, and use per-run temporary scratch paths for Lighthouse before atomically publishing the final report.

test analysis:
No artifact isolation or concurrent runner tests were included; single-run tests would not expose the overwrite.

suggested regression test:
Start two runner/perf invocations with distinct moduleIds and controlled timing, then assert both persisted verdicts and Lighthouse reports remain distinct and contain the matching module id or attempt.

minimum fix scope:
Update suite-runner writeResults path construction and perf resolvePerfReportPaths scratch allocation.

repro:
Run two suite runners in the same sandbox with different moduleIds; the later run overwrites /sandbox/results/runner-verdict.json and per-suite verdict files. Run two perf suites concurrently and one run can read the other run's /sandbox/results/lighthouse-report.json.

## medium: ShellCheck JSON output is parsed with the wrong shape

id: fnd_sig-feat-agent-tool-0f7714ee2a-8_371eff9bbb
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Lint Report Tool (feat_agent-tool_0f7714ee2a)
next: clawpatch show --finding fnd_sig-feat-agent-tool-0f7714ee2a-8_371eff9bbb

evidence:
- nova/pipeline/tools/lint-report/tool-registry.ts:233-244 (shellcheck.run)
- nova/pipeline/tools/lint-report/report.ts:71-79 (runTool)

The shellcheck runner invokes --format json, whose current output shape is an object containing a comments array. The parser assumes parsed.data is a top-level array and calls .map on it. A valid ShellCheck JSON result therefore throws a TypeError instead of converting comments into findings, and runTool records only a tool error.

recommendation:
Read diagnostics from Array.isArray(parsed.data) ? parsed.data : parsed.data.comments || [], or invoke a ShellCheck format whose schema matches the parser.

test analysis:
No parser tests are included for real ShellCheck JSON output.

suggested regression test:
Add a shellcheck runner test with a representative { comments: [...] } JSON payload and assert it produces the expected error finding.

minimum fix scope:
Adjust only the shellcheck parsing block to normalize the comments array before mapping.

repro:
Run shellcheck with --format json output shaped as {"comments":[{"file":"x.sh","line":1,"column":1,"level":"error","code":2086,"message":"msg"}]}. parsed.data.map is not a function.

## medium: Started-module detection ignores module-prefixed execution entries

id: fnd_sig-feat-job-904fd99950-1146e653_6d6d32d214
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Pipeline Runner Core (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-1146e653_6d6d32d214

evidence:
- nova/pipeline/runners/pipeline-runner-start.ts:70-83
- nova/pipeline/runners/pipeline-runner-shared.ts:135-144
- nova/pipeline/runners/pipeline-runner-start.ts:168-176

buildStartDescription explicitly supports execution_order entries like module:foo by stripping the prefix before looking up progress.modules. hasAnyStartedModules does not normalize the same entries; it looks up progress.modules[stepId] directly. For module-prefixed execution orders, it returns false even when the real module has started. maybeRunArchitectureValidation uses that false value on resume, so pre-pipeline architecture validation can rerun after module work has already started, contrary to the intended resume guard.

recommendation:
Normalize module ids in hasAnyStartedModules using the same module: prefix handling used by buildStartDescription and the scheduler before looking up progress.modules or loading status.

test analysis:
No tests were included for prefixed module execution_order entries. TypeScript also cannot catch this because the affected files use untyped records or ts-nocheck.

suggested regression test:
Add a resume test with execution_order containing module:api and a started api lifecycle read model; assert architecture validation is skipped.

minimum fix scope:
hasAnyStartedModules module id normalization

repro:
Use progress.execution_order = ["module:api"] with progress.modules.api.dir set and a lifecycle status for api containing current_phase or a non-PENDING status. On --resume, hasAnyStartedModules returns false, so shouldRunArchValidation remains true.

## medium: Suite JSONL logs are dropped when the tests log directory is new

id: fnd_sig-feat-test-suite-77bede17d2-b_67d06bd867
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-b_67d06bd867

evidence:
- buster/pipeline/runners/suite-runner.ts:407-415
- buster/pipeline/runners/suite-runner.ts:339-342

The logSink appends to logDir/tests/suites.jsonl before the runner creates logDir/tests. The only mkdir for that directory happens later in writeResults, after all suites have run. On a fresh logDir, every suite log append fails and is swallowed as a console warning, leaving no JSONL suite telemetry despite the directory existing by the end.

recommendation:
Create swarmResultsDir before constructing logSink, and consider emitting an observability diagnostic if JSONL append fails after initialization.

test analysis:
No tests were included for fresh logDir setup or JSONL log persistence.

suggested regression test:
Run a logging suite with a temporary non-existent logDir and assert logDir/tests/suites.jsonl exists with at least one entry after the run.

minimum fix scope:
Move fs.mkdirSync(swarmResultsDir, { recursive: true }) into runSuites before logSink creation.

repro:
Call runSuites with a logDir whose tests subdirectory does not exist. Suite log calls attempt appendFileSync before writeResults creates the directory, so suites.jsonl is missing or empty.

## medium: Suite timeout cannot interrupt synchronous suite work

id: fnd_sig-feat-test-suite-77bede17d2-1_447f5230a0
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-1_447f5230a0

evidence:
- buster/pipeline/runners/suite-runner.ts:362-372
- buster/pipeline/suites/unit.ts:231-238
- buster/pipeline/suites/e2e.ts:196-203
- buster/pipeline/suites/perf.ts:141-146

runSuiteWithTimeout relies on Promise.race with setTimeout, but several suites perform blocking execFileSync calls. While those calls are running, the event loop cannot fire the timeout callback, so test_config.suite_timeout_ms is not a real safety limit for those suites. A suite-specific command timeout that is larger than suite_timeout_ms, or a blocked synchronous call, can hold the pipeline past the runner limit.

recommendation:
Run suites in a killable worker/child process or convert synchronous subprocess calls to async calls that honor an AbortSignal derived from the suite timeout. Also cap per-suite command timeouts to the remaining suite timeout.

test analysis:
No timeout behavior tests were included, and typechecking does not distinguish event-loop-blocking work from cancellable async work.

suggested regression test:
Add a test around runSuiteWithTimeout using a suite function that performs a synchronous blocking subprocess longer than suite_timeout_ms, and assert the fixed implementation returns a timeout near the configured limit.

minimum fix scope:
Change the runner timeout execution model and the synchronous execFileSync call sites in unit, e2e, perf, and similar suites.

repro:
Set suite_timeout_ms lower than unit.timeout_ms, then run a unit command that blocks until its own timeout. The runner timeout cannot reject until execFileSync returns control to the event loop.

## medium: Telemetry cycle handling is incomplete and can crash reporting

id: fnd_sig-feat-library-2d10436c9e-e14d_91f963178b
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-e14d_91f963178b

evidence:
- common/pipeline/redaction.ts:240-270
- common/pipeline/services/telemetry/payload-schema.ts:53-63
- common/pipeline/services/telemetry/payload-schema.ts:481-495

sanitizeTelemetryPayload has no seen-set at all for recursive objects or arrays, and isJsonSafe tracks plain objects but not arrays. Circular arrays or object cycles in non-sensitive telemetry fields can therefore recurse until stack overflow instead of being rejected or summarized, dropping the telemetry path during failures.

recommendation:
Add WeakSet/Set cycle tracking to sanitizeTelemetryPayload and track arrays as well as objects in isJsonSafe; return a redacted summary or validation error for cycles.

test analysis:
No linked telemetry sanitizer/schema tests were provided for cyclic payloads; typechecks allow circular runtime objects.

suggested regression test:
Validate and sanitize payloads containing a self-referential array nested under a non-sensitive field such as details.items, and assert the call returns a controlled error or redacted summary without throwing RangeError.

minimum fix scope:
common/pipeline/redaction.ts sanitizeTelemetryPayload and common/pipeline/services/telemetry/payload-schema.ts isJsonSafe.

## medium: Termination grace races the same kill operation it asks to confirm

id: fnd_sig-feat-library-67301c61e0-6db1_da00b8f36d
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Common Pipeline Agent Primitives (feat_library_67301c61e0)
next: clawpatch show --finding fnd_sig-feat-library-67301c61e0-6db1_da00b8f36d

evidence:
- common/pipeline/agents/session-termination.ts:108-124 (terminateSession)
- common/pipeline/agents/session-termination.ts:125-132 (terminateSession)
- common/pipeline/agents/session-termination.ts:165-178 (terminateActiveSession)
- common/pipeline/agents/lifecycle.ts:369-403 (killSession)

terminateSession passes confirmTimeoutMs: graceMs into killSession, then separately races the entire killSession promise against that same graceMs. killSession spends time on the initial status check and stop or kill request before entering its confirmation wait, so a normal successful termination can need nearly graceMs after the request is sent. The outer race can expire first, return requested:false/confirmed:false, and detach the still-running kill promise. terminateActiveSession then preserves the active-session file for an unconfirmed result even if the background kill later confirms, which creates stale recovery evidence and reports a failed termination for a session that may have been stopped successfully.

recommendation:
Use one deadline for the termination workflow instead of racing killSession with the same timeout. Either let killSession own the total budget, or make the outer timeout abort killSession and preserve progress such as whether a stop request was sent. If background completion is intentional, attach a success handler that updates active-session cleanup state instead of dropping the result.

test analysis:
No tests were included for termination timing, and typechecking would not catch the runtime ordering problem between the outer Promise.race and killSession's internal confirmation loop.

suggested regression test:
Add a fake-timer termination test where gateway stop is requested before grace expires but confirmation resolves shortly after the outer grace. Assert terminateSession does not report requested:false or leave the kill promise unobserved for a successful in-flight termination.

minimum fix scope:
common/pipeline/agents/session-termination.ts; lifecycle.ts may also need a small abort/budget hook if the fix cancels killSession on timeout.

repro:
With graceMs=5000, let the gateway take about 1000 ms for status, 1000 ms for the stop request, and then confirm stopped 3500 ms later. killSession is still within its own 5000 ms confirmation window, but terminateSession's outer 5000 ms timer fires first and returns state 'termination_grace_expired' while killSession continues in the background.

## medium: Tool and model end reasons are overwritten with outcomes

id: fnd_sig-feat-service-3c4f1855c4-dd0f_5e429b1184
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Pipeline (feat_service_3c4f1855c4)
next: clawpatch show --finding fnd_sig-feat-service-3c4f1855c4-dd0f_5e429b1184

evidence:
- nova/pipeline/services/agent-observability-ingester/mapper.ts:238-252 (toolFinishedPayload)
- nova/pipeline/services/agent-observability-ingester/mapper.ts:267-284 (modelEndedPayload)

Both ended payload mappers set reason from payload.outcome instead of payload.reason. A detailed hook reason such as timeout, cancellation, or rate-limit detail is replaced by the coarse outcome before telemetry emission, which loses diagnostics and weakens downstream evidence comparison.

recommendation:
Populate reason from payload.reason ?? null in toolFinishedPayload and modelEndedPayload, matching the other ended-event mappers.

test analysis:
No mapper tests were included that distinguish outcome from reason for tool/model ended events.

suggested regression test:
Add mapper unit cases for after_tool_call and model_call_ended where outcome and reason differ, and assert the emitted payload preserves both fields correctly.

minimum fix scope:
nova/pipeline/services/agent-observability-ingester/mapper.ts ended payload field assignments.

repro:
Map an after_tool_call or model_call_ended event with outcome 'failed' and reason 'timeout'. The emitted telemetry payload contains reason 'failed' instead of 'timeout'.

## medium: Unknown CLI arguments start the full pipeline

id: fnd_sig-feat-cli-command-cd67a577ef-_7b84f83cd3
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Pipeline Entrypoint (feat_cli-command_cd67a577ef)
next: clawpatch show --finding fnd_sig-feat-cli-command-cd67a577ef-_7b84f83cd3

evidence:
- buster/buster-pipeline.ts:159-186 (main)
- buster/buster-pipeline.ts:207-212 (handleBusterEntrypoint)

The entrypoint only special-cases argv[2] === '--status'; every other invocation, including '--help', misspelled flags, or unexpected user input, falls through to main(). main() then performs side-effectful startup work such as gateway waits, orphan recovery, sandbox cleanup, base-image pre-pull, Redis consumer-group setup, and task polling. A CLI typo therefore crosses filesystem/Redis/process boundaries instead of failing closed, and typechecking will not catch it.

recommendation:
Add explicit argument parsing before calling main(): allow no arguments for normal operation, allow documented status/help flags, and reject all other arguments with a nonzero exit before any startup side effects. Prefer a small pure parser so behavior can be tested without starting the pipeline.

test analysis:
No tests were included for this feature, and the current entrypoint has no pure argument parser that would make unknown-argument behavior easy to assert.

suggested regression test:
Add an entrypoint argument parsing test that passes `['node','buster-pipeline.ts','--bogus']` and asserts that main is not invoked and the result is a nonzero usage error; add a second test that no extra args invokes normal startup.

minimum fix scope:
buster/buster-pipeline.ts

repro:
Run the command with an unrecognized argument such as `buster-pipeline --help` or `buster-pipeline --bogus`; it will enter `main()` rather than printing usage or exiting nonzero.

## medium: Worker exceptions after dispatch leave active_agent persisted

id: fnd_sig-feat-job-48a562d1e2-18b0a65b_e2d718af1f
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-18b0a65b_e2d718af1f

evidence:
- nova/pipeline/runners/module-runner-buster-worker.ts:62-87 (executeBusterWorkerAttempt)
- nova/pipeline/runners/module-runner-buster-worker.ts:125-156 (executeBusterWorkerAttempt)
- nova/pipeline/runners/module-runner-forge.ts:191-212 (runModuleForgePhase)
- nova/pipeline/runners/module-runner-forge.ts:248-274 (runModuleForgePhase)

Forge and Buster worker inputs persist active_agent in onDispatched and clear it only through onFinalized. If the worker calls onDispatched and then throws, or if normalization throws after dispatch without finalization, the catch blocks return terminal errors without clearing or saving the active-agent state. That leaves status.json advertising a live session after the runner has stopped handling it, which can confuse shutdown, resume, and correlation logic.

recommendation:
In each catch path, load the latest status, clearModuleActiveAgent, save the cleared status, and preserve correlation fields from the dispatched session. Prefer a finally/finalization helper around worker execution so all post-dispatch exits clear lifecycle state exactly once.

test analysis:
No worker lifecycle tests were included, and the failure requires a callback-then-throw sequence that typechecks do not model.

suggested regression test:
Add Forge and Buster fake-worker tests that call onDispatched then throw, asserting the terminal error is returned and saved status.active_agent is absent.

minimum fix scope:
Update the Forge and Buster worker catch handling paths.

repro:
Use a fake worker handler that invokes workerInput.onDispatched with a session_key and then throws. The catch path returns EXIT_ERROR, but the saved module status still contains active_agent from onDispatched.

## medium: Base image validation still accepts implicit-registry image references

id: fnd_sig-feat-service-571bdaa394-3a5d_9b9ef5e8ef
category: security
confidence: medium
triage: risk
status: open
feature: Buster Runtime And Telemetry Services (feat_service_571bdaa394)
next: clawpatch show --finding fnd_sig-feat-service-571bdaa394-3a5d_9b9ef5e8ef

evidence:
- buster/pipeline/services/base-images.ts:68-82 (validateBaseImageRef)
- buster/pipeline/services/base-images.ts:146-165 (ensureBaseImages)

The validator documents that base-image inputs must be fully qualified and rejects only values with no slash. References such as `library/python:3.12` or `team/image:tag` pass validation because they contain `/`, then `ensureBaseImages` hands them to `podman pull`. Podman can resolve these through configured default registries/search policy, so a supposedly typed base image can be pulled from an implicit or environment-dependent registry.

recommendation:
Tighten `validateBaseImageRef` to require an explicit registry component, such as a hostname with `.` or `:port`, or the deliberate `localhost/` local-only case, before accepting/pulling the image.

test analysis:
No tests are listed for this feature, and the current code path has no visible assertion that slash-only names are rejected.

suggested regression test:
Add cases for `validateBaseImageRef('library/python:3.12')` and `validateBaseImageRef('team/image:tag')` expecting `ok: false`, while keeping `docker.io/library/python:3.12-slim` and `localhost/my/image:tag` behavior explicit.

minimum fix scope:
Update the image reference validation policy and its focused unit tests.

## medium: Baseline generation invents URL paths from route names

id: fnd_sig-feat-agent-tool-c8cc1151d6-b_65a1ea4387
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Buster Operator Tools (feat_agent-tool_c8cc1151d6)
next: clawpatch show --finding fnd_sig-feat-agent-tool-c8cc1151d6-b_65a1ea4387

evidence:
- buster/pipeline/tools/screenshot.ts:242-255 (parseBaselineRoutes)
- buster/pipeline/tools/screenshot.ts:287-299 (generateBaselines)
- buster/pipeline/tools/screenshot.ts:319-321 (generateBaselines)
- buster/pipeline/suites/visual-reg.ts:336-340 (runMultiPath)

The baseline generator captures each baseline by clicking the route's nav text, but the emitted paths.json sets path to /${route.name} because the manifest has no path field. Visual-reg later screenshots baseUrl + path, so any route whose actual URL is not exactly /<name> compares the reviewed baseline against a different page or a 404.

recommendation:
Extend the data-routes manifest to require an explicit path field, validate that it starts with /, and write that exact path to paths.json. If path is missing, fail baseline generation instead of guessing from name.

test analysis:
No baseline-generation or visual-reg contract tests are included, and the bug only appears when route names diverge from URL paths.

suggested regression test:
Generate baselines from a manifest whose name and path differ, then assert paths.json preserves the explicit path and runMultiPath targets that path.

minimum fix scope:
Update screenshot.ts BaselineRoute parsing and paths.json emission, plus visual-reg metadata validation if needed.

repro:
Create a data-routes entry with name "home" and nav "Home" for an app whose real URL is "/". The generator captures the Home nav state but writes {"path":"/home"}; visual-reg then screenshots http://localhost:<port>/home.

## medium: Budget signals do not abort when deadlines pass

id: fnd_sig-feat-library-2d10436c9e-18ed_4e01dfbca2
category: concurrency
confidence: medium
triage: risk
status: open
feature: Common Pipeline Safety Utilities (feat_library_2d10436c9e)
next: clawpatch show --finding fnd_sig-feat-library-2d10436c9e-18ed_4e01dfbca2

evidence:
- common/pipeline/timing.ts:74-101
- common/pipeline/timing.ts:108-115
- common/pipeline/timing.ts:116-131

createBudget exposes an AbortSignal, but the controller is aborted only when throwIfExhausted is called or an upstream signal aborts. A downstream operation that receives budget.signal can run past the timeout indefinitely unless another loop polls the budget, which can leave pipeline waits stuck beyond their configured deadline.

recommendation:
Schedule a deadline timer when creating the budget, reschedule it on authorized extensions, and abort the controller at exhaustion while preserving upstream abort behavior.

test analysis:
No linked timing tests were provided, and this requires observing asynchronous deadline behavior rather than static typing.

suggested regression test:
Create a budget with a short timeout, wait longer than the timeout without calling throwIfExhausted, and assert budget.signal.aborted becomes true with a BudgetExhaustedError reason.

minimum fix scope:
common/pipeline/timing.ts createBudget deadline/extension handling.

## medium: Completion adapters are started outside their cleanup try/finally

id: fnd_sig-feat-job-7ffa522006-cf4a39a4_8916a14d3b
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Buster Gate Runner (feat_job_7ffa522006)
next: clawpatch show --finding fnd_sig-feat-job-7ffa522006-cf4a39a4_8916a14d3b

evidence:
- nova/pipeline/runners/buster-gate-completion.ts:269-305
- nova/pipeline/runners/buster-gate-completion.ts:307-339

waitBusterGateCompletionEvidence starts the Redis and local evidence adapters before entering the try/finally that aborts the controller and stops those adapters. If localAdapter.start throws after redisAdapter.start has subscribed, or a start method throws synchronously, the finally block is skipped and the adapter can keep running without the wait being aborted or stopped.

recommendation:
Move adapter starts inside the try block, initialize adapter handles before the try, and make the finally stop whichever adapters were successfully created or started.

test analysis:
No tests were included with adapter start methods that throw synchronously after another adapter has started.

suggested regression test:
Inject a Redis adapter whose start returns a pending promise and a local adapter whose start throws; assert waitBusterGateCompletionEvidence calls stop/abort on the Redis adapter before rejecting.

minimum fix scope:
waitBusterGateCompletionEvidence in buster-gate-completion.ts.

## medium: Durable cooldown replay does not extend or pass the run budget

id: fnd_sig-feat-service-e49e423db1-4896_25dc2d7f1d
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Rate Limiting (feat_service_e49e423db1)
next: clawpatch show --finding fnd_sig-feat-service-e49e423db1-4896_25dc2d7f1d

evidence:
- nova/pipeline/services/rate-limit.ts:164-172 (handleSessionRateLimit)
- nova/pipeline/services/rate-limit.ts:367-385 (resumeDurableCooldownForStep)

The normal cooldown path explicitly extends the execution budget for the authorized rate-limit wait and passes that budget to sleep. The durable replay path, used after finding an open persisted cooldown, sleeps the remaining cooldown time with only sleepFn and has no budget option or extension. A resumed pipeline can therefore spend the remaining rate-limit cooldown against its ordinary runtime budget and time out before work resumes, even though the live cooldown path accounts for that delay.

recommendation:
Accept a budget/cooldownBufferMs option in resumeDurableCooldownForStep, extend the budget for remainingMs, and pass the budget through to sleepFn consistently with handleSessionRateLimit.

test analysis:
No linked tests cover durable cooldown replay with a runtime budget; type checking would not catch the semantic mismatch between the two cooldown paths.

suggested regression test:
Create an open lifecycle cooldown with a future resume_at, pass a fake budget and sleepFn to resumeDurableCooldownForStep, and assert the budget is extended and supplied to the sleep call before the cooldown is completed.

minimum fix scope:
Add budget handling to resumeDurableCooldownForStep and update its callers/tests for the new option.

## medium: Failure telemetry is fired without awaiting the async call

id: fnd_sig-feat-job-1186ca0ebf-1ba769f7_f2f8a8dfb0
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Review Gate Runner (feat_job_1186ca0ebf)
next: clawpatch show --finding fnd_sig-feat-job-1186ca0ebf-1ba769f7_f2f8a8dfb0

evidence:
- nova/pipeline/runners/review-gate-runner.ts:409-420 (runReviewGateEvaluation)
- nova/pipeline/runners/review-gate-runner.ts:524-537 (runReviewGateEvaluation)
- nova/pipeline/runners/review-gate-runner.ts:217-224 (emitReviewGateFixCycleFail)

onGateFail is awaited in other review-gate failure paths, but the setup-error and invalid-contract branches invoke it without await and then return a control result. If telemetry or Discord publishing is asynchronous, these terminal failures can lose failure telemetry or surface unhandled rejections after the gate has already returned.

recommendation:
Await onGateFail in these branches, matching the other failure paths. If fire-and-forget is intentional, wrap it in an explicit safe async helper that observes rejections.

test analysis:
No linked tests assert telemetry ordering or rejection handling for config-invalid and invalid-contract review gate exits.

suggested regression test:
Add tests for setup-error and invalid-contract paths with an async telemetry spy, asserting runReviewGateEvaluation does not resolve until the failure event has been observed.

minimum fix scope:
Add await to the two onGateFail calls in nova/pipeline/runners/review-gate-runner.ts.

repro:
Make onGateFail delay or reject in a setup-error or invalid-contract path; runReviewGateEvaluation returns before that failure emission settles.

## medium: Forge retry prompt can crash when fail_summaries is missing

id: fnd_sig-feat-library-ef5973cc96-6fbc_da61d433c8
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Prompt Library (feat_library_ef5973cc96)
next: clawpatch show --finding fnd_sig-feat-library-ef5973cc96-6fbc_da61d433c8

evidence:
- nova/pipeline/prompts/forge.ts:41
- nova/pipeline/prompts/forge.ts:82-83

The retry check dereferences status.fail_summaries.length whenever status.status is FAIL. A partially recovered or older status object with status FAIL but no fail_summaries array will throw while building the prompt, preventing Forge from being launched for recovery. Because this file is ts-nocheck, TypeScript would not catch the nullable/shape mismatch.

recommendation:
Treat missing or non-array fail_summaries as an empty list before computing isRetry, and only build anti-pattern entries from validated array elements.

test analysis:
No tests were included for this feature, and the prompt builder is ts-nocheck, so there is no existing coverage or static check for malformed persisted status during recovery.

suggested regression test:
Add a prompt-builder test that passes a FAIL status without fail_summaries and asserts buildForgePrompt still returns a valid prompt result without an anti-pattern block.

minimum fix scope:
Normalize fail_summaries in buildForgePrompt before line 41 and use that normalized array for retry logic and anti-pattern rendering.

repro:
Call buildForgePrompt with a valid config/module and a status object like { status: 'FAIL', fail_count: 1 } that omits fail_summaries; prompt construction throws before returning a prompt or structured error.

## medium: JSON CLI output can be truncated by immediate process.exit

id: fnd_sig-feat-cli-command-380ac2f9fb-_9501cc0fab
category: data-loss
confidence: medium
triage: risk
status: open
feature: Nova Pipeline Entrypoints (feat_cli-command_380ac2f9fb)
next: clawpatch show --finding fnd_sig-feat-cli-command-380ac2f9fb-_9501cc0fab

evidence:
- nova/pipeline/cli.ts:57 (main)
- nova/pipeline/cli.ts:174-189 (main)
- nova/pipeline/cli.ts:216-221 (main)

output() writes machine-readable JSON with process.stdout.write(), then several branches call process.exit() immediately afterward. stdout writes may be asynchronous for piped output, so process.exit can terminate before the write drains, leaving callers with missing or partial JSON for blueprint commands or error responses.

recommendation:
Avoid exiting immediately after stdout writes. Return exit codes from main and set process.exitCode, or make output() await the write callback/drain before each exit path.

test analysis:
No CLI subprocess tests are included, and tests that stub process.exit would not exercise real stdout pipe flushing.

suggested regression test:
Spawn the CLI as a child process for a large JSON-producing command such as --blueprint-list and assert stdout parses as complete JSON across repeated piped runs.

minimum fix scope:
Refactor CLI output/exit handling in nova/pipeline/cli.ts.

## medium: Malformed ignored Redis completions can override canonical completions

id: fnd_sig-feat-service-8348e0b688-6137_660bb6d96d
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Nova Polling And Completion (feat_service_8348e0b688)
next: clawpatch show --finding fnd_sig-feat-service-8348e0b688-6137_660bb6d96d

evidence:
- nova/pipeline/services/redis-completion.ts:190-206 (selectLatestCompletion)
- nova/pipeline/services/redis-completion.ts:240-257 (scanLatestCompletionFromTail)
- nova/pipeline/services/redis-completion.ts:268-277 (scanLatestCompletionFromTail)

Both Redis completion selectors validate every target/identity match and immediately return an invalid completion before partitioning entries by the current Buster pipeline source. Later code intentionally ignores valid non-current sources, but malformed non-current entries never reach that policy. A stale or external Redis producer can therefore poison completion selection with an invalid FAIL/CONFLICT result even when a valid `buster-pipeline` completion exists for the same identity.

recommendation:
Filter or minimally classify trusted/current sources before fatal schema adjudication. Invalid non-current sources should be ignored or recorded as diagnostics, while only invalid current-source completions should override the canonical result.

test analysis:
No Redis selector tests are linked for mixed-source streams with malformed ignored entries, and the behavior depends on stream contents rather than TypeScript types.

suggested regression test:
Add selector tests for `selectLatestCompletion` and `scanLatestCompletionFromTail` with a valid current-source completion plus malformed ignored-source entries, asserting the current-source completion wins and ignored diagnostics are non-fatal.

minimum fix scope:
Change Redis completion selection order around validation/source filtering and add focused selector coverage.

repro:
Put a valid `buster-pipeline` PASS entry and a malformed completion from another source for the same module/run/attempt/dispatch in the stream. The selector can return the invalid wrapper before selecting the canonical Buster entry.

## medium: Scheduled gate plugin context can carry a mismatched gate id

id: fnd_sig-feat-job-904fd99950-2b6b9203_f80eee681a
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Nova Pipeline Runner Core (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-2b6b9203_f80eee681a

evidence:
- nova/pipeline/runners/scheduled-gate-invocation.ts:32-55
- nova/pipeline/runners/scheduled-gate-invocation.ts:76-83

The scheduled gate identity check verifies the explicit gateId against gateInput.ids.gateId, and verifies only pluginInvocation.stageId. It never rejects pluginInvocation.gateId when it points at a different gate. runScheduledGateInvocation then passes that raw pluginInvocation into the plugin context, so gate handlers that use context invocation metadata can attribute outputs, telemetry, or control decisions to the wrong gate despite the typed input ids being correct.

recommendation:
Validate pluginInvocation.gateId, and any other identity fields present such as runId, gateType, and attempt, against the asserted identity. Prefer rebuilding the invocation from asserted identity before creating the plugin context.

test analysis:
No scheduled gate invocation contract tests were included, and the file is ts-nocheck so mismatched invocation metadata is not statically constrained.

suggested regression test:
Add a unit test that passes a mismatched pluginInvocation.gateId and asserts runScheduledGateInvocation throws before executing the handler.

minimum fix scope:
assertScheduledGateInvocationIdentity validation

repro:
Call runScheduledGateInvocation with gateId "review-a", gateInput.ids.gateId "review-a", and pluginInvocation { stageId, gateId: "review-b" }. The assertion passes and the plugin context receives the contradictory invocation.

## medium: Task-scoped cleanup still stops global nginx and clears shared sandbox outputs

id: fnd_sig-feat-service-3bf2d9bd7f-2dd4_fd93ad33a0
category: concurrency
confidence: medium
triage: risk
status: open
feature: Buster Task Lifecycle Services (feat_service_3bf2d9bd7f)
next: clawpatch show --finding fnd_sig-feat-service-3bf2d9bd7f-2dd4_fd93ad33a0

evidence:
- buster/pipeline/services/sandbox-cleanup.ts:304-320 (cleanupPolicyProfile)
- buster/pipeline/services/sandbox-cleanup.ts:502-512 (cleanupSandboxResources)
- buster/pipeline/services/sandbox-cleanup.ts:517-526 (cleanupSandboxResources)
- buster/pipeline/services/task-lifecycle.ts:147-154 (processTask)
- buster/pipeline/services/task-lifecycle.ts:306-312 (processTask)

When a payload has task identity, cleanup uses the task_scoped policy, but that policy enables sandboxOutputs and processCleanup. The pre-cleanup stage deletes the fixed /sandbox/www and /sandbox/results directories, and every task-scoped cleanup stage can run nginx -s stop. In a multi-worker or overlapping-task deployment, one task's pre or final cleanup can remove another task's sandbox outputs or stop its serving process even though tracked container/image/namespace cleanup is scoped.

recommendation:
Make task_scoped cleanup operate only on resources labeled for that task. Reserve shared output directory clearing and global nginx stops for startup/shutdown sweeps, or partition outputs/processes by cleanup scope.

test analysis:
No linked tests cover overlapping task cleanup or assert that task-scoped cleanup leaves unrelated sandbox outputs and shared processes intact.

suggested regression test:
Add a cleanup policy test that invokes cleanupSandboxResources('pre', scopedPayload) and cleanupSandboxResources('final', scopedPayload) and asserts shared sandbox output deletion and global nginx stop are disabled unless an explicit startup/shutdown policy is used.

minimum fix scope:
Change the task_scoped CleanupPolicyProfile to disable sandboxOutputs and processCleanup, or gate those actions to startup/shutdown policies only.

repro:
Run two Buster tasks concurrently on the same sandbox. While task A is serving or has results in /sandbox/www or /sandbox/results, task B enters pre-cleanup or task A enters final cleanup; the cleanup code clears the shared output directories or stops nginx globally.

## medium: Unvalidated push branch can be interpreted as git options or invalid refspecs

id: fnd_sig-feat-service-434742cac2-4bd4_5fc957b297
category: security
confidence: medium
triage: risk
status: open
feature: Buster Git Workflows (feat_service_434742cac2)
next: clawpatch show --finding fnd_sig-feat-service-434742cac2-4bd4_5fc957b297

evidence:
- buster/pipeline/services/git-workflows.ts:163-178 (gitPushWithRetry)
- buster/pipeline/services/git-workflows.ts:190-192 (gitPushWithRetry)

gitPushWithRetry accepts branch as a raw string and passes it to both `git pull --rebase origin <branch>` and `git push origin HEAD:<branch>` without validating that it is a safe branch/ref name. The subprocess API prevents shell injection, but git still parses refspec-like arguments and option-looking values. A malformed, empty, or option-like branch can make the workflow operate on an unintended ref, fail in a way that leaves retry/rebase state churn, or push to an invalid destination. This crosses the user-input/process-exec boundary and is not protected by TypeScript because branch is just `string`.

recommendation:
Validate branch before any gitExec call: require a non-empty branch name, reject names starting with `-`, reject whitespace/control characters, reject `..`, `@{`, trailing `.`, lockfile suffixes, leading slash, repeated slashes, and other invalid git ref components; ideally verify with `git check-ref-format --branch <branch>` and additionally reject option-looking values before invoking git.

test analysis:
No tests are included for gitPushWithRetry, and the type declaration only constrains branch to `string`, so invalid or option-like branch inputs are not exercised.

suggested regression test:
Add a git-workflows unit test that calls gitPushWithRetry with invalid branches such as `''`, `--force`, and `topic with space`, asserting it rejects before invoking pull or push; add a positive case for a normal branch name.

minimum fix scope:
Add a local branch/ref validation helper in buster/pipeline/services/git-workflows.ts and call it at the start of gitPushWithRetry.

## low: sanitizeForJson corrupts repeated array references as circular

id: fnd_sig-feat-service-2b3077a806-8c7a_3c67976fb5
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Runtime Support Services (feat_service_2b3077a806)
next: clawpatch show --finding fnd_sig-feat-service-2b3077a806-8c7a_3c67976fb5

evidence:
- nova/pipeline/services/serialization.ts:3-13
- nova/pipeline/services/serialization.ts:14-19

sanitizeForJson adds every object to the WeakSet, but the array branch returns immediately after map() and never deletes the array from seen. A non-cyclic structure that reuses the same array in two fields serializes the second field as '[Circular]', losing valid data. Object branches do delete after traversal, so the bug is specific to arrays.

recommendation:
Balance seen.add with seen.delete for arrays, ideally with try/finally around both array and object traversal so repeated references are not mistaken for cycles after traversal completes.

test analysis:
No serialization tests were included for shared references; this is a runtime graph-shape issue that static types do not detect.

suggested regression test:
Assert sanitizeForJson({a: sharedArray, b: sharedArray}) returns both fields as arrays, while a truly self-referential array still emits a circular marker.

minimum fix scope:
Update the array branch in sanitizeForJson and add shared-reference and circular-array regression tests.

## low: CLI may truncate machine-readable JSON by forcing process exit

id: fnd_sig-feat-agent-tool-76a5edb417-f_f51c233b4c
category: data-loss
confidence: medium
triage: risk
status: open
feature: Nova Redis Operator Tool (feat_agent-tool_76a5edb417)
next: clawpatch show --finding fnd_sig-feat-agent-tool-76a5edb417-f_f51c233b4c

evidence:
- nova/pipeline/tools/redis.ts:319-320 (main)
- nova/pipeline/tools/redis.ts:334 (main)
- nova/pipeline/tools/redis.ts:349 (main)
- nova/pipeline/tools/redis.ts:365-370 (CLI wrapper)

The direct CLI path writes JSON intended for machine parsing and then immediately calls process.exit in the promise handler. In Node, stdout and stderr writes can be asynchronous when captured through pipes; forcing process exit can terminate before buffered JSON is fully flushed, leaving callers with empty or partial output.

recommendation:
Remove the explicit success process.exit call and let Node exit naturally after disconnect, and on failures set process.exitCode after writing the error or wait for stream drain before exiting.

test analysis:
No tests are listed that spawn the CLI and parse its stdout under pipe capture, so truncation of machine-readable output would not be detected.

suggested regression test:
Spawn the CLI with a mocked read-completion response large enough to exercise stdout buffering and assert the captured stdout is complete valid JSON across repeated runs.

minimum fix scope:
Adjust only the direct CLI wrapper in nova/pipeline/tools/redis.ts.

repro:
Capture the CLI output through a pipe while the action prints a large completion payload; process.exit can terminate before stdout drains, making the captured JSON unparsable.

## low: Resume command interpolates project names without shell escaping

id: fnd_sig-feat-service-e31a42903c-4021_920847f3ed
category: security
confidence: medium
triage: risk
status: open
feature: Nova Failure Handling (feat_service_e31a42903c)
next: clawpatch show --finding fnd_sig-feat-service-e31a42903c-4021_920847f3ed

evidence:
- nova/pipeline/services/failures/retry-policy.ts:30-32 (buildFullPipelineResumeCommand)
- nova/pipeline/services/failures/presentation.ts:218-220 (injectNeedsNova)

buildFullPipelineResumeCommand constructs a shell command by directly interpolating config.project. The generated command is later sent as an operator-facing resume instruction. A project name containing whitespace or shell metacharacters will either produce a broken command or execute unintended shell syntax if copied into a terminal.

recommendation:
Render resume commands with a shell-quoting helper for every dynamic argument, or provide an argv-style representation and only format it through a safe command renderer.

test analysis:
No linked tests validate generated recovery commands with spaces or shell metacharacters in config.project.

suggested regression test:
Add a unit test for buildFullPipelineResumeCommand with a project name containing spaces, quotes, and semicolons, asserting the output remains one safe --project argument.

minimum fix scope:
Update buildFullPipelineResumeCommand in nova/pipeline/services/failures/retry-policy.ts and keep the presentation path consuming the escaped command.

repro:
With config.project set to "foo; touch /tmp/clawpatch-poc", the resume command becomes a shell sequence rather than a single --project argument.
## Consolidated additional high findings from 2026-06-02

## high: Output file results can be reused without task identity validation

id: fnd_sig-feat-cli-command-3049d169af-_8d0513b589
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Pipeline Entrypoint And Config (feat_cli-command_3049d169af)
next: clawpatch show --finding fnd_sig-feat-cli-command-3049d169af-_8d0513b589

evidence:
- buster/pipeline/services/pipeline-helpers.ts:104-119 (writeBusterOutputFile)
- buster/pipeline/services/pipeline-helpers.ts:123-135 (ensureBusterOutputFile)
- buster/pipeline/services/pipeline-helpers.ts:175-190 (resolveBusterAgentResult)

Buster accepts a terminal PASS/FAIL from the payload-selected output_file and returns it as the current task result without checking run_id, attempt, dispatch_id, gate_id, or any completion_key. The fallback writer also omits those identity fields, so there is no durable way to distinguish the current task from a stale artifact if an output path is reused or pre-created. That can incorrectly mark a new run or retry as PASS/FAIL based on an older task artifact.

recommendation:
Write completion identity fields into Buster output artifacts and require them to match the validated task payload before accepting an existing output_file. Alternatively, remove or atomically reserve the expected output path at task start, then only accept an artifact created for the current run/attempt/dispatch.

test analysis:
No tests are included for reused output_file paths, stale artifacts, or identity mismatch handling; TypeScript cannot catch this semantic contract failure.

suggested regression test:
Add a task-result test where output_file already contains a terminal status for a different run_id/attempt/dispatch_id and assert that Buster rejects it or rewrites a current-task failure instead of returning the stale status.

minimum fix scope:
buster/pipeline/services/pipeline-helpers.ts

repro:
Create a repo-relative output_file containing {"status":"PASS","summary":"old"}, then run a task whose payload points to that same output_file and whose child session terminates without writing a new artifact. resolveBusterAgentResult will return PASS from the stale file.

## high: Identifier-based path helpers can escape managed directories

id: fnd_sig-feat-config-68fc91f4c0-64f49_51a6472ae7
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Nova Core Runtime And Registry (feat_config_68fc91f4c0)
next: clawpatch show --finding fnd_sig-feat-config-68fc91f4c0-64f49_51a6472ae7

evidence:
- nova/pipeline/core/paths.ts:257-274 (gateStatusPath/gateLogDir)
- nova/pipeline/core/paths.ts:261-290 (moduleLogDir/projectLogSubdir)
- nova/pipeline/core/temp.ts:20-24 (createTempManager.file)
- nova/pipeline/core/config.ts:323-361 (validateConfig)

Gate IDs, module directory identifiers used for log paths, and temporary file components are interpolated directly into path.join-derived paths without the relative-path and inside-root checks used elsewhere. A serialized gate key such as '../owned' passes the shown gate validation and makes gateStatusPath return a path outside .swarm; similarly, module log directories and temp file names can be moved out of their intended roots with slash and parent components. Downstream status, approval, log, or temp writes can overwrite or leave files outside the managed artifact directories.

recommendation:
Add a shared safe identifier or safe file-segment validator for gate IDs, module log directory inputs, temp prefixes, temp module IDs, and extensions. Reject null bytes, slashes, backslashes, absolute paths, and parent traversal, and assert final computed paths remain inside the expected root before returning them.

test analysis:
No tests were included for this feature, and these inputs are typed as any or come from serialized progress/config data, so typechecks would not catch traversal-shaped identifiers.

suggested regression test:
Create progress/config fixtures with gate IDs and module dir inputs containing '../' and assert validateConfig or the path helpers reject them; also assert createTempManager.file rejects components containing path separators or parent traversal.

minimum fix scope:
Validate identifier components in core path helpers and temp manager, plus gate IDs during config validation.

repro:
With config.paths.swarm_dir set to '/repo/Projects/p/src/.swarm', gateStatusPath(config, '../owned') resolves to '/repo/Projects/p/src/owned-gate-status.json' instead of staying under '.swarm'.

## high: Blocked Buster outcomes are returned without persisting BLOCKED state

id: fnd_sig-feat-job-48a562d1e2-ad4b3ce8_720b66606e
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-ad4b3ce8_720b66606e

evidence:
- nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts:113-136
- nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts:53-65
- nova/pipeline/runners/module-runner/state-machine.ts:44-47

The completion_conflict path and the missing failure_class path both return EXIT_BLOCKED terminal results, but neither calls markModuleBlocked nor saves status. The state machine only treats a loaded module as terminal-blocked when status.status is STATUS.BLOCKED, so a later resume can re-dispatch Buster, skip into an unexpected FAIL/TESTING state, or even treat a conflicting local PASS as already complete instead of preserving the fail-closed decision.

recommendation:
Before returning EXIT_BLOCKED in these paths, mark the module blocked, save the transition, and emit the same terminal blocked/failure telemetry used by other Buster crash exhaustion paths.

test analysis:
No tests were included for resume behavior after Buster completion conflicts or invalid terminal failure contracts.

suggested regression test:
Add tests for completion_conflict and missing failure_class that assert status.json is saved as BLOCKED and a resumed attempt returns the blocked terminal result without dispatching new Buster work.

minimum fix scope:
Update handleFailedPollResult and handleBusterFailOrBlockedStatus blocked-return branches to persist a BLOCKED transition.

repro:
Trigger a Buster completion_conflict or a terminal FAIL/BLOCKED status with no typed failure_class. The current run returns EXIT_BLOCKED, but status.json remains in the pre-existing local state, so the next resume does not enter TERMINAL_BLOCKED.

## high: Redis completion session checks use the Redis value as the expected session

id: fnd_sig-feat-job-48a562d1e2-f222d891_cd9341481b
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-f222d891_cd9341481b

evidence:
- nova/pipeline/runners/module-runner/buster-phase.ts:133-145
- nova/pipeline/runners/module-runner/buster-phase/identity.ts:27-33

The Buster completion adjudication builds expectedIdentity.session_key from completionSessionKey, but completionSessionKey is resolved with redisEntry and resolveCompletionSessionKey prioritizes resolveResultSessionKey(redisEntry). A stale or wrong Redis completion can therefore supply the session key that is later treated as expected, defeating the identity mismatch check and allowing terminal Redis state to be applied under the wrong session as long as the other identity fields pass.

recommendation:
Compute the expected session key only from the active status, completion identity, worker session key, or poll status fallback. Pass redisEntry only as the candidate completion being adjudicated, not as a source for expected identity.

test analysis:
No tests were included for Redis completion identity drift or session-key mismatch adjudication.

suggested regression test:
Add a Buster phase unit test where Redis completion has the correct run/attempt/dispatch but a mismatched session_key, and assert the completion is not applied to status.

minimum fix scope:
Change the completionSessionKey calculation in runModuleBusterPhase, or add a separate expected-session resolver that never reads redisEntry.

repro:
Return a poll result with _redis_entry.status set to PASS and _redis_entry.session_key different from the active Buster session. The runner passes that Redis session key into expectedIdentity before calling shouldApplyRedisCompletionToStatus.

## high: Run lock can leak when observer setup or cleanup fails

id: fnd_sig-feat-job-904fd99950-2dbc68ea_292e616200
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Pipeline Runner Scheduling (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-2dbc68ea_292e616200

evidence:
- nova/pipeline/runners/pipeline-runner.ts:23-30 (runPipeline)
- nova/pipeline/runners/pipeline-runner.ts:46-49 (runPipeline)
- nova/pipeline/runners/pipeline-runner-lock.ts:282-284 (acquirePipelineRunLock)

The pipeline lock is acquired before the cleanup try/finally begins, and the observer plugin controller is constructed before that try block. If controller construction throws, the acquired lock and heartbeat are never released. The finally block also awaits ingester/plugin stop before releasing the lock, so any stop rejection prevents releasePipelineRunLock from running. Because acquisition starts the heartbeat, a caught setup/cleanup failure can leave active-run.lock.json renewed even though the pipeline is not running, blocking all future runs for the swarm_dir.

recommendation:
Move the cleanup boundary to immediately after lock acquisition, initialize observer resources inside it with null guards, and release the lock in an inner finally that runs regardless of observer stop failures. Capture stop errors without letting them skip lock release.

test analysis:
No linked tests were provided for observer setup/teardown failure paths or lock cleanup ordering.

suggested regression test:
Add a runPipeline test that forces observer controller construction and stop() to throw after lock acquisition, then asserts releasePipelineRunLock is called or the lock file is removed and the original failure is preserved.

minimum fix scope:
Refactor runPipeline cleanup structure only; no scheduler behavior changes are required.

repro:
Mock observer controller construction or plugin stop to throw after acquirePipelineRunLock succeeds; runPipeline rejects and active-run.lock.json remains unreleased, with the heartbeat still capable of renewing it while the process stays alive.

## high: Cooldowns are marked complete before module resume state is persisted

id: fnd_sig-feat-service-0c53714583-8d60_2be1330c14
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Rate Limiting (feat_service_0c53714583)
next: clawpatch show --finding fnd_sig-feat-service-0c53714583-8d60_2be1330c14

evidence:
- nova/pipeline/services/rate-limit.ts:179-207
- nova/pipeline/services/rate-limit.ts:310-315
- nova/pipeline/services/rate-limit.ts:377-379
- nova/pipeline/services/rate-limit.ts:387-408

Both normal cooldown resume and durable replay append rate_limit.cooldown_completed before the module status is actually moved out of RATE_LIMITED. In the tracked module path, the onResume hook can throw before syncModuleRateLimitResume runs, and a process crash or custom resume notification failure in the same window has the same effect. Because durable replay only acts on open cooldowns, the next run will skip the already-closed cooldown and leave the persisted module status stuck at RATE_LIMITED.

recommendation:
Persist the module resume transition before appending cooldown_completed and before sending the resume notification. In createTrackedModuleSessionRateLimitRecoveryOptions, ensure syncModuleRateLimitResume cannot be skipped by a customOnResume failure, or leave the cooldown open and write an operator alert when resume sync fails.

test analysis:
No linked tests were supplied for crash/restart behavior or hook failures between cooldown completion and status resume.

suggested regression test:
Add a durable cooldown replay test that starts with a RATE_LIMITED module and an open cooldown, injects a throwing resume hook or failing resume sync, and asserts the cooldown remains open or is retried rather than being marked completed while the module is still RATE_LIMITED.

minimum fix scope:
Reorder completion writes in handleSessionRateLimit and resumeDurableCooldownForStep, and make tracked module resume sync run before or independently of custom resume hooks.

repro:
Use createTrackedModuleSessionRateLimitRecoveryOptions with a customOnResume that throws, or crash after handleSessionRateLimit appends cooldown_completed and before syncModuleRateLimitResume runs. The lifecycle cooldown is closed, but the module status remains RATE_LIMITED, and resumeDurableCooldownForStep will not retry because the cooldown is no longer open.

## high: Non-throwing telemetry emit failures are acked as success

id: fnd_sig-feat-service-11ed88a7cb-2f4e_c639ca4a96
category: data-loss
confidence: medium
triage: risk
status: open
feature: Nova Observability Ingester (feat_service_11ed88a7cb)
next: clawpatch show --finding fnd_sig-feat-service-11ed88a7cb-2f4e_c639ca4a96

evidence:
- nova/pipeline/services/agent-observability-ingester/consumer.ts:278-286 (AgentObservabilityIngester.processEntry)
- nova/pipeline/services/telemetry-stream.ts:103-116 (emitTelemetryStreamEvent)
- nova/pipeline/services/telemetry-stream.ts:118-130 (emitTelemetryStreamEvent)
- nova/pipeline/services/telemetry-stream.ts:157-168 (emitTelemetryStreamEvent)

The ingester only treats an emit result as failed when the returned object has validationError. The included telemetry stream contract returns structured ok:false results for missing identity, Redis unavailable, and Redis emit failures without throwing. If the dispatch path forwards that shape, the ingester commits usage, increments emitted, and XACKs the control entry, so the original event cannot be retried even though telemetry was not written.

recommendation:
Normalize the emitEvent result contract in processEntry. Treat ok:false, skipped:false, or an error-bearing failure result as an emit failure and avoid acking unless the event has been successfully emitted or intentionally dead-lettered.

test analysis:
No tests were included for this feature, and the EmitEvent type returns unknown, so TypeScript cannot enforce handling of structured failure results.

suggested regression test:
Add a consumer test with an emitEvent mock returning ok:false/reason redis_emit_failed and assert the entry is not counted as emitted and is either left pending or dead-lettered according to the intended retry policy.

minimum fix scope:
Update AgentObservabilityIngester.processEntry result handling and add a focused unit test for non-throwing emit failures.

repro:
Inject an emitEvent that resolves { ok: false, skipped: false, reason: 'redis_emit_failed', error: new Error('down') } for a valid control entry. processEntry will call ack and increment emitted instead of dead-lettering or retrying.

## high: Architecture validation rejects supported gate dependencies

id: fnd_sig-feat-service-333c4ffda9-af64_cad6982104
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Project Artifacts And Validation (feat_service_333c4ffda9)
next: clawpatch show --finding fnd_sig-feat-service-333c4ffda9-af64_cad6982104

evidence:
- nova/pipeline/services/dependencies.ts:48-50
- nova/pipeline/services/dependencies.ts:64-75
- nova/pipeline/services/arch-validator-checks.ts:407-423

The runtime dependency checker explicitly supports module dependencies on gates via depends_on entries like gate:<gateId>, but the deterministic architecture validator treats every depends_on entry as a module id. A valid module that waits on a gate will therefore receive DEP_UNDEFINED_REF and block before execution, even though the scheduler can handle the dependency.

recommendation:
Update checkDependencyGraph to special-case dep values that start with gate:, validate the referenced gate exists in progress.gates, and keep the existing module/self-reference checks for module dependencies.

test analysis:
No linked tests are included for architecture validation of gate dependencies, and the current implementation path is not type-checkable because the files use ts-nocheck.

suggested regression test:
Add a deterministic architecture-validator test where progress.modules.m2.depends_on contains gate:approval and progress.gates.approval exists; assert no DEP_UNDEFINED_REF is emitted. Add the inverse missing-gate case and assert a blocking gate finding.

minimum fix scope:
Modify checkDependencyGraph in nova/pipeline/services/arch-validator-checks.ts.

repro:
Define a module with depends_on: ["gate:operator-approval"] and a matching progress.gates.operator-approval. runDeterministicArchitectureChecks will still report DEP_UNDEFINED_REF because knownModules does not include gate:operator-approval.

## high: Redis completion events inherit the active wait identity when stream entries omit routing fields

id: fnd_sig-feat-service-43984fffc4-076b_9d67ce4fc1
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Completion And Control Services (feat_service_43984fffc4)
next: clawpatch show --finding fnd_sig-feat-service-43984fffc4-076b_9d67ce4fc1

evidence:
- nova/pipeline/services/completion-event-adapters.ts:123-130 (createRedisCompletionEventAdapter)
- nova/pipeline/runners/buster-gate-completion.ts:271-279 (waitBusterGateCompletionEvidence)
- nova/pipeline/services/buster-completion-controller.ts:237-241 (waitForBusterCompletion)
- nova/pipeline/services/buster-completion-controller.ts:100-103 (buildRedisCompletionResult)
- nova/pipeline/services/buster-completion-controller.ts:119-121 (buildRedisCompletionResult)

The Redis adapter emits wait-routing identity as baseIdentity overlaid with fields decoded from the Redis entry. Because the gate runner passes the active gate/run/attempt/dispatch identity and replays from startId 0-0, any historical or malformed completion entry that omits routing fields is stamped with the current active identity before waitForAny filters it. The controller then treats validation failures as resolved completion conflicts, so unrelated bad Redis stream data can terminate the active gate instead of being ignored.

recommendation:
Build Redis completion event routing identity only from the Redis entry for target and strong completion fields. If required identity fields are absent, emit a non-wait-specific diagnostic or drop the event before it can match an active waiter. Keep baseIdentity only for non-routing context that cannot make an entry match.

test analysis:
No linked tests were provided for Redis replay or malformed stream entries, and these files are ts-nocheck so typechecks would not catch identity stamping behavior.

suggested regression test:
Simulate the Redis adapter reading a completion entry missing gate_id/run_id/attempt/dispatch_id while a gate wait is active with startId 0-0. Assert the wait does not resolve as completion_conflict for the active gate.

minimum fix scope:
Change createRedisCompletionEventAdapter identity construction and add a focused adapter/controller test for missing Redis routing identity.

## high: Redis terminal verdicts can bypass local terminal conflict checks

id: fnd_sig-feat-service-43984fffc4-0c4f_f76f4553b1
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Completion And Control Services (feat_service_43984fffc4)
next: clawpatch show --finding fnd_sig-feat-service-43984fffc4-0c4f_f76f4553b1

evidence:
- nova/pipeline/services/completion-adjudicator.ts:216-226 (buildCompletionAuthorityPolicy)
- nova/pipeline/services/buster-completion-controller.ts:242-249 (waitForBusterCompletion)
- nova/pipeline/runners/buster-gate-completion.ts:287-302 (waitBusterGateCompletionEvidence)
- nova/pipeline/runners/buster-gate-completion.ts:303-305 (waitBusterGateCompletionEvidence)
- nova/pipeline/services/completion-event-adapters.ts:241-246 (createLocalEvidenceEventAdapter)
- nova/pipeline/services/completion-event-adapters.ts:288 (createLocalEvidenceEventAdapter)

The adjudicator rejects conflicting Redis/local terminal statuses only when a local statusCompletion is supplied. waitForBusterCompletion obtains that only through getLocalStatus, but the gate runner does not pass getLocalStatus; it only registers a debounced local evidence resolver. Since Redis replay is started before the local adapter and existing local evidence is emitted after a debounce, a Redis PASS/FAIL can resolve first without comparing an already-present local output file, allowing the wrong terminal result to win the race.

recommendation:
Pass a synchronous getLocalStatus for gate completion that projects the current gate output state before adjudicating Redis events, or perform an initial local projection before starting Redis replay. The Redis path should always compare against current local terminal truth before resolving.

test analysis:
No linked tests cover races between replayed Redis completion and pre-existing local gate output. Typechecks cannot catch this because the missing callback is a runtime wiring issue.

suggested regression test:
Create a pre-existing local gate PASS output and a same-identity Redis FAIL completion in the replay stream. Assert the controller reports a conflict or preserves local terminal truth instead of returning the Redis failure.

minimum fix scope:
Wire getLocalStatus in waitBusterGateCompletionEvidence and add one race-focused gate completion test.

## high: Runtime stash restoration can pop an older user stash

id: fnd_sig-feat-service-5696822083-3f69_04689c8fef
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Notifications And Integrations (feat_service_5696822083)
next: clawpatch show --finding fnd_sig-feat-service-5696822083-3f69_04689c8fef

evidence:
- nova/pipeline/integrations/git-worktree.ts:75-82 (listStashRefs)
- nova/pipeline/integrations/git-worktree.ts:130-144 (collectRuntimeStateStash)
- nova/pipeline/integrations/git-worktree.ts:179-182 (restoreRuntimeStateStash)

The code compares ordinal stash names like stash@{0} before and after pushing a new stash. Git renumbers existing stashes when a new one is pushed, so if any stash already exists, the set difference identifies an older stash such as stash@{1}, not the newly-created runtime-state stash. The restore path then pops and may drop that older user stash, applying unrelated saved changes into the repo and leaving the new runtime stash behind.

recommendation:
Track the stash by stable object id or create/store the stash explicitly instead of comparing ordinal ref names. For example, compare rev-parse outputs for stash entries, store the new stash commit id, apply that exact commit, and drop the matching stash entry only after verifying its object id/message.

test analysis:
No tests were included for this feature, and this case requires a pre-existing stash entry to expose the renumbering bug.

suggested regression test:
Create two stashes in a temporary repo, dirty only an allowed .swarm runtime file, run the stash/restore flow, and assert the original stash list is preserved while only the runtime-state stash is applied/restored.

minimum fix scope:
Update collectRuntimeStateStash and restoreRuntimeStateStash to use stable stash identities rather than stash@{n} names.

repro:
In a repo with an existing stash, create a dirty runtime-state file under .swarm, then run a path that calls collectRuntimeStateStash followed by restoreRuntimeStateStash. The stored stashRef will refer to the pre-existing stash after renumbering, so restore pops the wrong stash.

## high: Rebase detection breaks in linked git worktrees

id: fnd_sig-feat-service-5696822083-f1ec_db7bab607a
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Notifications And Integrations (feat_service_5696822083)
next: clawpatch show --finding fnd_sig-feat-service-5696822083-f1ec_db7bab607a

evidence:
- nova/pipeline/integrations/git-worktree.ts:316-348 (tryAutoResolveRebaseForRuntimeState)
- nova/pipeline/integrations/git-worktree.ts:366-379 (_gitPullCore)

The rebase recovery logic checks repo_root/.git/rebase-merge and repo_root/.git/rebase-apply. In a linked worktree, .git is a file that points to the real gitdir, so those paths do not exist even while the worktree is rebasing. A pull --rebase conflict can therefore be treated as a generic pull failure and returned without aborting or auto-resolving, leaving the repository stuck in a rebase state for later pipeline steps.

recommendation:
Resolve rebase state paths through Git, for example with git rev-parse --git-path rebase-merge and git rev-parse --git-path rebase-apply, and use those paths in both _gitPullCore and the auto-resolve loop.

test analysis:
No tests were included, and a normal repository with a .git directory would not catch the linked-worktree path behavior.

suggested regression test:
Run gitPullBeforePush from a linked worktree with a synthetic rebase conflict and assert the function detects the rebase and either auto-resolves allowed runtime conflicts or aborts before returning/throwing.

minimum fix scope:
Replace direct repo_root/.git rebase path checks in git-worktree.ts with gitdir-aware path resolution.

repro:
Use a linked git worktree, create a pull --rebase conflict, and call gitPullBeforePush. The existsSync checks under repo_root/.git do not detect the active rebase, so the recovery branch is skipped.

## high: Final cleanup can turn a successful task into a queue failure

id: fnd_sig-feat-service-86a35b1a93-d5eb_27d58f032b
category: bug
confidence: medium
triage: risk
status: open
feature: Buster Task Lifecycle And Queue (feat_service_86a35b1a93)
next: clawpatch show --finding fnd_sig-feat-service-86a35b1a93-d5eb_27d58f032b

evidence:
- buster/pipeline/services/task-lifecycle.ts:302-356
- buster/pipeline/services/task-lifecycle/cleanup.ts:6-24
- buster/pipeline/services/task-queue.ts:211-232
- buster/pipeline/services/task-completion.ts:169-178

processTask performs final cleanup, telemetry completion, completion signaling, logger flush, and telemetry close inside an unguarded finally block. runSandboxCleanupStage also awaits telemetry and doSandboxCleanup without catching errors. If the task has already produced PASS but final cleanup or final telemetry throws before sendTaskCompletionSignal marks completionState.terminal, processTask throws to processOneQueuedTask. The queue then treats this as process_task_error and can synthesize a FAIL completion for the same Redis task. This can falsely fail completed work and unblock Nova with the wrong outcome.

recommendation:
Make final cleanup and closeout telemetry best-effort around the already-determined task outcome. Catch and log cleanup/telemetry close errors, preserve the original outcome, and still attempt sendTaskCompletionSignal. If cleanup failure must be reported, add it as diagnostic metadata rather than throwing after task success.

test analysis:
No linked tests are included for processTask finally behavior or queue terminal synthesis after a successful task with cleanup failure.

suggested regression test:
Add a processOneQueuedTask/processTask test where suites pass, the session returns PASS, and runSandboxCleanupStage throws during final cleanup; assert the emitted completion remains PASS and the task is not converted into a synthesized failure.

minimum fix scope:
Guard the final-cleanup and telemetry-close section in task-lifecycle.ts, or make runSandboxCleanupStage nonthrowing for final cleanup while returning diagnostic status.

## high: Single-session reaper can kill unrelated orphan ACP sessions

id: fnd_sig-feat-service-a85bf60e69-7896_fbcbe2f259
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Agent Lifecycle And Orchestration (feat_service_a85bf60e69)
next: clawpatch show --finding fnd_sig-feat-service-a85bf60e69-7896_fbcbe2f259

evidence:
- nova/pipeline/agents/shutdown.ts:96-111 (buildVictimSet)
- nova/pipeline/agents/shutdown.ts:126-132 (reaperAfterKill)
- nova/pipeline/agents/orchestration.ts:267-273 (killAcpAgent)
- nova/pipeline/agents/reviewer-lifecycle.ts:140-146 (killReviewerAgent)

The cleanup path is invoked for one specific session, but buildVictimSet also adds every PPID-1 ACP wrapper for the same project without requiring the command or environment to match the session key, gateway label, or agent id. reaperAfterKill then sends SIGTERM and SIGKILL to that whole victim set. If another active session for the same project is orphaned or daemonized under PID 1, killing one agent can terminate the unrelated session and leave the pipeline without its running worker.

recommendation:
Restrict orphanRoots to processes linked to the target session identity, or make project-wide orphan cleanup an explicit global-shutdown mode that runs only after all tracked sessions are being stopped.

test analysis:
No tests are included for process selection in the reaper, and ts-nocheck means the broad victim selection is not constrained by type-level contracts.

suggested regression test:
Unit test buildVictimSet/reaperAfterKill with two same-project orphan ACP wrappers and assert only the PID matching the requested session identity is signaled during single-session cleanup.

minimum fix scope:
Update nova/pipeline/agents/shutdown.ts so buildVictimSet applies session identity filtering to orphanRoots or accepts a separate projectWide flag.

repro:
Stub parsePsTable to return two orphan wrapper rows with OPENCLAW_SHELL=acp and the same CURRENT_PROJECT, only one containing the target session key; reaperAfterKill will signal both PIDs.

## high: Dispatch/finalize hook failures can strand module worker sessions

id: fnd_sig-feat-service-b1adbcd40d-0401_3fed6161ad
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Module Workers (feat_service_b1adbcd40d)
next: clawpatch show --finding fnd_sig-feat-service-b1adbcd40d-0401_3fed6161ad

evidence:
- nova/pipeline/agents/module-workers.ts:171-176 (runModuleForgeWorker)
- nova/pipeline/agents/module-workers.ts:221-249 (runModuleForgeWorker)
- nova/pipeline/agents/module-workers.ts:326-333 (runModuleBusterWorker)
- nova/pipeline/agents/module-workers.ts:365-406 (runModuleBusterWorker)

Both workers await onDispatched after a successful spawn but before entering the poll try/finally that kills the agent and clears shutdown context. If that callback throws, the spawned forge or buster session is left running and the worker returns no typed control result. onFinalized is also awaited inside the cleanup finally before saveStreamLog and clearShutdownContext, so a finalize hook failure can skip those required cleanup steps and still make the worker reject. Telemetry or persistence hook failures therefore become lifecycle leaks and stuck worker outcomes.

recommendation:
Guard lifecycle callbacks separately from worker session cleanup. Put the spawned-agent lifetime under an outer try/finally that always kills and clears context, move saveStreamLog and clearShutdownContext into a non-skippable cleanup block, and either log hook errors or convert them into an explicit block/retry typed control result.

test analysis:
No linked tests are included for this feature, and the excerpts do not show rejection-path tests for onDispatched or onFinalized.

suggested regression test:
Add module forge and module buster worker tests where onDispatched and onFinalized reject, asserting killAgent and clearShutdownContext are still called and the worker does not leave an untyped rejection for the dispatch-hook case.

minimum fix scope:
nova/pipeline/agents/module-workers.ts lifecycle callback and cleanup handling.

repro:
Pass an onDispatched callback that rejects after spawn succeeds. In the forge path, killAgent and clearShutdownContext are never reached; in the buster path, the same happens before polling starts.

## Consolidated additional medium findings from 2026-06-02

## medium: Visual-reg log sinks are shared globally during async runs

id: fnd_sig-feat-agent-tool-031bde43ff-9_1689c1aa71
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Buster Operational Tools (feat_agent-tool_031bde43ff)
next: clawpatch show --finding fnd_sig-feat-agent-tool-031bde43ff-9_1689c1aa71

evidence:
- buster/pipeline/suites/visual-reg.ts:112-116
- buster/pipeline/suites/visual-reg.ts:457-460
- buster/pipeline/suites/visual-reg.ts:528-570

Start two runVisualReg calls concurrently with different logSink functions and delay one screenshot batch; logs emitted after the second call starts will use the second sink regardless of which run produced them.

recommendation:
Make log a per-run closure that captures ctx.logSink and pass it into helper functions, or save and restore the previous sink in a try/finally while avoiding shared state across concurrent runs.

test analysis:
No tests were included, and sequential suite tests would not expose cross-run sink overwrites.

suggested regression test:
Run two visual-reg contexts concurrently with separate collecting sinks and mocked screenshot/Discord functions; assert each sink receives only its own module's log entries.

minimum fix scope:
Remove the module-level _logSink dependency for runVisualReg and thread a per-invocation logger through runMultiPath and Discord delivery options.

repro:
Start two runVisualReg calls concurrently with different logSink functions and delay one screenshot batch; logs emitted after the second call starts will use the second sink regardless of which run produced them.

## medium: Case-study summary writes incorrect machine metrics

id: fnd_sig-feat-agent-tool-f8325826e1-2_2c5a2fc608
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Project Summary And Redis Tools (feat_agent-tool_f8325826e1)
next: clawpatch show --finding fnd_sig-feat-agent-tool-f8325826e1-2_2c5a2fc608

evidence:
- nova/pipeline/tools/project-summary.ts:206-214
- nova/pipeline/tools/project-summary.ts:419-430
- nova/pipeline/tools/project-summary-formatters.ts:128-145

Use code.codeFiles for code_files, and either compute duration_seconds from tests.totalDuration or add a normalized totalDurationSec field in collectTestResults.

recommendation:
Use code.codeFiles for code_files, and either compute duration_seconds from tests.totalDuration or add a normalized totalDurationSec field in collectTestResults.

test analysis:
No linked tests validate buildCaseStudyBase output, and @ts-nocheck allows these field-name mismatches.

suggested regression test:
Call buildCaseStudyBase with totalFiles=5, codeFiles=3, swarmFiles=2, and totalDuration=2500, then assert code_files excludes swarm files and duration_seconds reflects the 2.5 second suite duration.

minimum fix scope:
Patch nova/pipeline/tools/project-summary-formatters.ts, with an optional collector normalization in nova/pipeline/tools/project-summary.ts.

repro:
No concrete reproduction provided.

## medium: Redis send CLI prints a human log before its JSON result

id: fnd_sig-feat-agent-tool-f8325826e1-9_43f48d9867
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Project Summary And Redis Tools (feat_agent-tool_f8325826e1)
next: clawpatch show --finding fnd_sig-feat-agent-tool-f8325826e1-9_43f48d9867

evidence:
- nova/pipeline/tools/redis.ts:208-211
- nova/pipeline/tools/redis.ts:313-321

Move the human status line to stderr or emitLog, or add a quiet/machine mode so CLI stdout contains only the JSON payload.

recommendation:
Move the human status line to stderr or emitLog, or add a quiet/machine mode so CLI stdout contains only the JSON payload.

test analysis:
No linked tests cover the Redis CLI stdout contract, and @ts-nocheck cannot catch stdout pollution.

suggested regression test:
Run the send CLI with a mocked Redis queue and assert stdout is exactly one parseable JSON document while diagnostics go to stderr.

minimum fix scope:
Update nova/pipeline/tools/redis.ts so publishTask or the CLI send path preserves machine-readable stdout.

repro:
No concrete reproduction provided.

## medium: REPO_ROOT environment fallback is advertised but ignored

id: fnd_sig-feat-cli-command-1c32f81ffb-_1c562c6cca
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Pipeline Entrypoint And Skill Docs (feat_cli-command_1c32f81ffb)
next: clawpatch show --finding fnd_sig-feat-cli-command-1c32f81ffb-_1c562c6cca

evidence:
- nova/pipeline/cli.ts:34-38 (normalizeNovaCliFlags)
- nova/pipeline/cli.ts:95-96 (main)

Set repo to rawFlags.repo || env.REPO_ROOT in normalizeNovaCliFlags, and add a unit test for the environment fallback.

recommendation:
Set repo to rawFlags.repo || env.REPO_ROOT in normalizeNovaCliFlags, and add a unit test for the environment fallback.

test analysis:
No linked tests cover normalizeNovaCliFlags or the CLI help contract.

suggested regression test:
Exercise normalizeNovaCliFlags({}, { REPO_ROOT: '/tmp/repo' }) and assert that the returned repo is '/tmp/repo'.

minimum fix scope:
Change nova/pipeline/cli.ts normalization for repo and add a focused CLI flag normalization test.

repro:
No concrete reproduction provided.

## medium: Startup cleanup failures are ignored before the pipeline advertises readiness

id: fnd_sig-feat-cli-command-3049d169af-_45b982ccdf
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Pipeline Entrypoint And Config (feat_cli-command_3049d169af)
next: clawpatch show --finding fnd_sig-feat-cli-command-3049d169af-_45b982ccdf

evidence:
- buster/buster-pipeline.ts:165-186 (main)
- buster/buster-pipeline.ts:119-127 (shutdown)
- buster/pipeline/services/pipeline-helpers.ts:350-362 (doSandboxCleanup)

Have cleanupSandboxResources return {ok:false, errors:["container removal failed"]} for the startup sweep. main still proceeds to start the gateway monitor, ensure the Redis consumer group, and enter polling.

recommendation:
Handle the startup cleanup result the same way shutdown does: emit a runtime diagnostic on ok:false and fail closed or shut down before declaring the worker ready when cleanup did not complete.

test analysis:
No startup-path tests are included that simulate cleanup returning ok:false without throwing.

suggested regression test:
Add a main startup test with doSandboxCleanup mocked to return ok:false and assert that the pipeline reports a diagnostic and does not log Ready or start polling.

minimum fix scope:
buster/buster-pipeline.ts

repro:
Have cleanupSandboxResources return {ok:false, errors:["container removal failed"]} for the startup sweep. main still proceeds to start the gateway monitor, ensure the Redis consumer group, and enter polling.

## medium: Capability alerts can append outside the repository using unscoped context paths

id: fnd_sig-feat-cli-command-3049d169af-_ae5a17fd4e
category: security
confidence: medium
triage: risk
status: open
feature: Buster Pipeline Entrypoint And Config (feat_cli-command_3049d169af)
next: clawpatch show --finding fnd_sig-feat-cli-command-3049d169af-_ae5a17fd4e

evidence:
- buster/pipeline/services/capabilities.ts:115-122 (alertTargets)
- buster/pipeline/services/capabilities.ts:138-141 (appendDurableOperatorAlert)
- buster/README.md:188-190

Call appendDurableOperatorAlert({logDir:'../../outside'}, {reason:'buster_capability_denied'}). The function attempts to create ../../outside and append ../../outside/operator-alerts.jsonl.

recommendation:
Scope every context-derived alert target through resolveScopedPath or an equivalent repo/log-root allowlist. Reject absolute paths and parent traversal before mkdir/append, and keep the default pipeline alert path as the fallback.

test analysis:
No tests are included for path traversal or absolute path handling in durable operator alert targets.

suggested regression test:
Add a capability-denied alert test with logDir:'../../outside' and an absolute pipelineLogPath, asserting that no write is attempted outside the approved log root and that a safe default alert is still written.

minimum fix scope:
buster/pipeline/services/capabilities.ts

repro:
Call appendDurableOperatorAlert({logDir:'../../outside'}, {reason:'buster_capability_denied'}). The function attempts to create ../../outside and append ../../outside/operator-alerts.jsonl.

## medium: Message fetch rate limits abort the purge instead of retrying

id: fnd_sig-feat-cli-command-4ba4c52231-_8b53872882
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Common Discord Purge Tool (feat_cli-command_4ba4c52231)
next: clawpatch show --finding fnd_sig-feat-cli-command-4ba4c52231-_8b53872882

evidence:
- common/discord-purge.ts:36-39 (deepPurge)
- common/discord-purge.ts:79-85 (deepPurge)

Handle `res.status === 429` before the generic `!res.ok` throw, parse `retry_after`, sleep, and continue the loop just like the delete paths.

recommendation:
Handle `res.status === 429` before the generic `!res.ok` throw, parse `retry_after`, sleep, and continue the loop just like the delete paths.

test analysis:
No tests are included for this feature, and typechecking would not catch a runtime HTTP status handling gap.

suggested regression test:
Mock `fetch` so the first channel messages request returns a 429 with `{ "retry_after": 0.01 }`, then returns messages, and assert `deepPurge` retries instead of rejecting.

minimum fix scope:
Add 429 handling for the messages fetch response in `deepPurge`.

repro:
No concrete reproduction provided.

## medium: Loaded plugin registry is not bound to the config API expects

id: fnd_sig-feat-config-68fc91f4c0-30b45_ad85e47057
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Nova Core Runtime And Registry (feat_config_68fc91f4c0)
next: clawpatch show --finding fnd_sig-feat-config-68fc91f4c0-30b45_ad85e47057

evidence:
- nova/pipeline/core/config.ts:74-80 (loadConfig)
- nova/pipeline/core/registry.ts:144-158 (getPluginRegistry/requirePluginRegistry)
- nova/pipeline/core/context.ts:257-261 (createPipelineContext)

After const loaded = loadConfig(project), calling requirePluginRegistry(loaded.config) returns the missing-registry error unless the caller also manually supplies loaded.pluginRegistry through an active context.

recommendation:
Bind the startup registry onto the loaded config after validation, or make createPipelineContext default pluginRegistry from the loadConfig result in a way registry.ts can resolve consistently. Add the corresponding validator allowance if the registry property can be present during revalidation.

test analysis:
No tests were included for direct registry facade usage, and the affected values are all any-shaped runtime objects, so typechecks cannot prove the registry was threaded.

suggested regression test:
Add an integration test that calls loadConfig, then requirePluginRegistry(loaded.config) and requireStageOwner(loaded.config, 'gate.execute', 'gate:review') without setting an active context; both should resolve the startup registry.

minimum fix scope:
Make loadConfig or context creation consistently bind pluginRegistry to the config path consumed by registry.ts.

repro:
After const loaded = loadConfig(project), calling requirePluginRegistry(loaded.config) returns the missing-registry error unless the caller also manually supplies loaded.pluginRegistry through an active context.

## medium: Gate dependencies can crash when progress.gates is omitted

id: fnd_sig-feat-config-68fc91f4c0-ef1e5_ccb2d2941b
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Core Runtime And Registry (feat_config_68fc91f4c0)
next: clawpatch show --finding fnd_sig-feat-config-68fc91f4c0-ef1e5_ccb2d2941b

evidence:
- nova/pipeline/core/config.ts:307-310 (validateConfig)
- nova/pipeline/services/dependencies.ts:64-68 (checkDependencies)

Use a progress object with modules.m1.depends_on = ['gate:approval'] and no top-level gates property; validateConfig can pass the shown required progress checks, then checkDependencies(config, progress, 'm1') dereferences progress.gates[gateId].

recommendation:
Either require progress.gates to be a plain object whenever any module declares a gate dependency, or make checkDependencies use progress.gates?.[gateId] and return a normal unmet dependency result. Prefer also validating that each gate dependency references a defined gate during config validation.

test analysis:
No tests were included, and services/dependencies.ts is under @ts-nocheck, so the missing null guard is not enforced by static checks.

suggested regression test:
Add a config validation or dependency-check test where a module depends on gate:missing and progress.gates is absent; assert the pipeline reports an unmet dependency or validation error without throwing.

minimum fix scope:
Harden validateConfig gate dependency validation and add a null-safe gate lookup in checkDependencies.

repro:
Use a progress object with modules.m1.depends_on = ['gate:approval'] and no top-level gates property; validateConfig can pass the shown required progress checks, then checkDependencies(config, progress, 'm1') dereferences progress.gates[gateId].

## medium: Review fix prompt bypasses the prompt result contract

id: fnd_sig-feat-config-8fa77836b1-403f7_665752693b
category: api-contract
confidence: medium
triage: contract-mismatch
status: open
feature: Nova Prompt Templates (feat_config_8fa77836b1)
next: clawpatch show --finding fnd_sig-feat-config-8fa77836b1-403f7_665752693b

evidence:
- nova/pipeline/prompts/shared.ts:7-16 (makePromptResult)
- nova/pipeline/prompts/review.ts:46-64 (buildReviewFixPrompt)
- nova/pipeline/prompts/gate-fix.ts:47-67 (buildGateFixPrompt)

Return makePromptResult(prompt, { phase: 'review-fix', moduleId: gate.id || '', attempt }) from buildReviewFixPrompt, matching buildGateFixPrompt and the shared prompt builder contract.

recommendation:
Return makePromptResult(prompt, { phase: 'review-fix', moduleId: gate.id || '', attempt }) from buildReviewFixPrompt, matching buildGateFixPrompt and the shared prompt builder contract.

test analysis:
No tests are included for prompt return shapes, and ts-nocheck disables static enforcement of the contract.

suggested regression test:
Add a focused test that calls buildReviewFixPrompt and asserts it returns an object with .prompt, .metadata.phase, .metadata.attempt, and a working toString() shim.

minimum fix scope:
Change buildReviewFixPrompt to assemble the string into a prompt variable and wrap it with makePromptResult.

repro:
No concrete reproduction provided.

## medium: Module worker runners reject contract-valid typed pass results without legacy metadata

id: fnd_sig-feat-job-48a562d1e2-7ccdaae1_5e40d68e6f
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Module Runner (feat_job_48a562d1e2)
next: clawpatch show --finding fnd_sig-feat-job-48a562d1e2-7ccdaae1_5e40d68e6f

evidence:
- nova/pipeline/services/contracts/worker-control-result.ts:26-60
- nova/pipeline/services/contracts/worker-control-result.ts:76-108
- nova/pipeline/runners/module-runner-forge.ts:63-66
- nova/pipeline/runners/module-runner-forge.ts:277-282
- nova/pipeline/runners/module-runner-forge.ts:464-514
- nova/pipeline/runners/module-runner/buster-phase.ts:83-106

Return buildTypedWorkerControlResult({ producerType: 'module_forge', nextAction: 'pass', outcomeClass: 'passed', summary: 'ok' }) from a Forge worker. It validates under worker-control-result but runModuleForgePhase cannot derive forgeCompletion and returns an unexpected Forge completion error.

recommendation:
Either make normalizeModuleForgeWorkerResult and normalizeModuleBusterWorkerResult validate the additional module-runner metadata they require, or update the runners to consume the typed worker fields directly and derive/pass through final status for canonical typed pass results.

test analysis:
No tests were included for minimal typed worker control results at the module worker boundary.

suggested regression test:
Add module Forge and Buster worker contract tests using minimal buildTypedWorkerControlResult pass outputs and assert the runner either accepts them or rejects them during normalization with an explicit contract diagnostic.

minimum fix scope:
Align the module worker normalizers and runner pass handling with the typed worker-control-result contract.

repro:
Return buildTypedWorkerControlResult({ producerType: 'module_forge', nextAction: 'pass', outcomeClass: 'passed', summary: 'ok' }) from a Forge worker. It validates under worker-control-result but runModuleForgePhase cannot derive forgeCompletion and returns an unexpected Forge completion error.

## medium: Scheduled validator completion cache is not scoped to the run

id: fnd_sig-feat-job-904fd99950-fcbd166c_ca6c7e0714
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Pipeline Runner Scheduling (feat_job_904fd99950)
next: clawpatch show --finding fnd_sig-feat-job-904fd99950-fcbd166c_ca6c7e0714

evidence:
- nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts:20-24 (scheduledValidatorCompletionPath)
- nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts:26-39 (validatorRunState)
- nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts:71-80 (markScheduledValidatorComplete/isScheduledValidatorComplete)

Call markScheduledValidatorComplete with config.run_id='run-a', then mutate the same config object to run_id='run-b' and call isScheduledValidatorComplete for the same key before any run-b completion file exists. It returns true from the stale in-memory Set.

recommendation:
Key _validatorRunState by run id or scheduledValidatorCompletionPath, or reset it during pipeline startup when the resolved run id/path changes. durableLoaded should apply only to the matching run-scoped file.

test analysis:
No linked tests cover programmatic reuse of a config object across multiple run ids or validate that completion snapshots are isolated per run.

suggested regression test:
Add a validator-completions unit test that marks a key complete for one run id, changes the config run id, and asserts the key is not complete until the second run records it.

minimum fix scope:
pipeline-runner-scheduling/validator-completions.ts cache keying/reset logic.

repro:
Call markScheduledValidatorComplete with config.run_id='run-a', then mutate the same config object to run_id='run-b' and call isScheduledValidatorComplete for the same key before any run-b completion file exists. It returns true from the stale in-memory Set.

## medium: Review re-review infrastructure errors consume Forge fix cycles

id: fnd_sig-feat-job-bb87327e3e-9b2e975e_a8a3647cd3
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Gate Runners (feat_job_bb87327e3e)
next: clawpatch show --finding fnd_sig-feat-job-bb87327e3e-9b2e975e_a8a3647cd3

evidence:
- nova/pipeline/runners/review-gate-task.ts:220-223 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:288-296 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:323-330 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-runner.ts:548-565 (runReviewGateEvaluation)

Only request another Forge fix after a validated NO-GO review. Re-review setup, spawn, polling, and publication errors should return terminal block/error control results with environment issue metadata.

recommendation:
Only request another Forge fix after a validated NO-GO review. Re-review setup, spawn, polling, and publication errors should return terminal block/error control results with environment issue metadata.

test analysis:
No tests are listed, and a normal NO-GO remediation test would not cover re-review infrastructure failures returned from runReviewGateOnce.

suggested regression test:
Run a review remediation attempt with attempt=2 where runOnce returns {ok:false,error:'Reviewer spawn failed: ...'} and assert no request_fix result is produced.

minimum fix scope:
Split the attempt>1 reviewResult.error path from valid NO-GO remediation in runReviewGateEvaluation.

repro:
No concrete reproduction provided.

## medium: Forge fix agents can be left running when session polling throws

id: fnd_sig-feat-job-bb87327e3e-bfce4e85_71f49b3cdd
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Gate Runners (feat_job_bb87327e3e)
next: clawpatch show --finding fnd_sig-feat-job-bb87327e3e-bfce4e85_71f49b3cdd

evidence:
- nova/pipeline/runners/gate-forge-fix-cycle.ts:143-153 (runGateForgeFixCycle)
- nova/pipeline/services/gate-fix-scaffold.ts:101-135 (finishGateForgeFixCycleScaffold)

Wrap pollForSessionEnd and transcript handling in a try/finally that always best-effort kills the Forge agent and clears the active gate session. Use a safe failure value for killAgent when no sessionResult exists.

recommendation:
Wrap pollForSessionEnd and transcript handling in a try/finally that always best-effort kills the Forge agent and clears the active gate session. Use a safe failure value for killAgent when no sessionResult exists.

test analysis:
No tests are listed, and the normal timeout/rate-limit result path returns a sessionResult instead of throwing.

suggested regression test:
Stub pollForSessionEnd to throw and assert killAgent and clearGateActiveSession are still called for the fix label.

minimum fix scope:
Add cleanup finally handling inside finishGateForgeFixCycleScaffold.

repro:
No concrete reproduction provided.

## medium: Auto-continue approval timeouts emit failure telemetry while returning pass

id: fnd_sig-feat-job-bb87327e3e-f5776dab_06404e1866
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Gate Runners (feat_job_bb87327e3e)
next: clawpatch show --finding fnd_sig-feat-job-bb87327e3e-f5776dab_06404e1866

evidence:
- nova/pipeline/runners/approval-gate-runner.ts:67-77 (emitApprovalGateVerdict)
- nova/pipeline/runners/approval-gate-runner.ts:168-200 (resolveTimeout)
- nova/pipeline/runners/approval-gate-control.ts:66-77 (approvalGateDecisionForResult)

Move verdict emission inside the timeout-policy branches, and emit pass/continued telemetry for CONTINUE while keeping failure telemetry for BLOCK.

recommendation:
Move verdict emission inside the timeout-policy branches, and emit pass/continued telemetry for CONTINUE while keeping failure telemetry for BLOCK.

test analysis:
No tests are listed, and this requires asserting telemetry side effects against the returned typed control result.

suggested regression test:
Test an approval timeout with on_timeout=CONTINUE and assert the control result passes and onGateFail is not emitted for that timeout.

minimum fix scope:
Adjust resolveTimeout telemetry branching for the CONTINUE case.

repro:
No concrete reproduction provided.

## medium: Telemetry sink builder can emit inputs its own validator rejects

id: fnd_sig-feat-library-4059ed201e-fd8f_e9dd93f4aa
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Result And Event Contracts (feat_library_4059ed201e)
next: clawpatch show --finding fnd_sig-feat-library-4059ed201e-fd8f_e9dd93f4aa

evidence:
- nova/pipeline/services/telemetry-sink-contract.ts:59-78 (normalizeTelemetrySinkPresentation)
- nova/pipeline/services/telemetry-sink-contract.ts:80-96 (buildTelemetrySinkInput)
- nova/pipeline/services/telemetry-sink-contract.ts:126-132 (validateTelemetrySinkInput)

Make the builder and validator agree: either drop embeds from telemetry sink presentation during normalization or stop accepting them at the builder boundary with a clear error before producing the input object.

recommendation:
Make the builder and validator agree: either drop embeds from telemetry sink presentation during normalization or stop accepting them at the builder boundary with a clear error before producing the input object.

test analysis:
No tests were included, and the mismatch is between builder output and validator rules rather than a TypeScript type error.

suggested regression test:
Add a telemetry sink contract test that calls buildTelemetrySinkInput with presentation.discord.embeds and asserts the chosen behavior: either embeds are omitted and validation passes, or the builder throws before returning an invalid input.

minimum fix scope:
Adjust normalizeTelemetrySinkPresentation or validateTelemetrySinkInput and add one focused contract test.

repro:
No concrete reproduction provided.

## medium: Discord webhook timeout is disabled when a caller signal is supplied

id: fnd_sig-feat-library-fc78cddf11-03ad_fb20a60f45
category: performance
confidence: high
triage: risk
status: open
feature: Common Pipeline Runtime Primitives (feat_library_fc78cddf11)
next: clawpatch show --finding fnd_sig-feat-library-fc78cddf11-03ad_fb20a60f45

evidence:
- common/pipeline/integrations/discord-webhook.ts:46-50 (timeoutSignal)
- common/pipeline/integrations/discord-webhook.ts:68-76 (postDiscordWebhook)

Compose the caller signal with the timeout signal, for example with AbortSignal.any when available or a small manual controller/timer bridge, so timeoutMs is enforced even when options.signal is present.

recommendation:
Compose the caller signal with the timeout signal, for example with AbortSignal.any when available or a small manual controller/timer bridge, so timeoutMs is enforced even when options.signal is present.

test analysis:
No tests were listed for this feature, and no included test covers a provided AbortSignal with a fetch implementation that never resolves.

suggested regression test:
Use a fetchImpl that never settles, pass a non-aborted caller AbortSignal and timeoutMs=10, and assert postDiscordWebhook rejects with DiscordWebhookDeliveryError shortly after the timeout.

minimum fix scope:
common/pipeline/integrations/discord-webhook.ts.

repro:
No concrete reproduction provided.

## medium: Rate-limit liveness probes overwrite configured gateway credentials with null

id: fnd_sig-feat-service-0904c19cb1-8535_1c286efac4
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Transport Rate Limit And Telemetry (feat_service_0904c19cb1)
next: clawpatch show --finding fnd_sig-feat-service-0904c19cb1-8535_1c286efac4

evidence:
- buster/pipeline/services/rate-limit.ts:188-195 (probeSessionLiveness)
- buster/pipeline/services/rate-limit.ts:245-252 (recoveryActionForLiveness)
- buster/pipeline/services/rate-limit.ts:254-276 (handleRateLimit)

Call handleRateLimit with acpMonitorConfig containing gatewayUrl and gatewayToken, but omit top-level gatewayUrl and gatewayToken. The object passed to getAcpMonitorState contains null gateway fields.

recommendation:
Build the monitor options so nullish top-level gateway values do not overwrite acpMonitorConfig. Only assign gatewayUrl/gatewayToken when the top-level values are non-empty, or apply acpMonitorConfig after defaults according to the intended precedence.

test analysis:
No linked tests exercise the acpMonitorConfig-only gateway path, and the bug is a runtime merge-order issue that typechecks will accept.

suggested regression test:
Add a rate-limit recovery test with gatewayUrl/gatewayToken supplied only through acpMonitorConfig and assert getAcpMonitorState receives those values.

minimum fix scope:
Change the option merge in probeSessionLiveness in buster/pipeline/services/rate-limit.ts.

repro:
Call handleRateLimit with acpMonitorConfig containing gatewayUrl and gatewayToken, but omit top-level gatewayUrl and gatewayToken. The object passed to getAcpMonitorState contains null gateway fields.

## medium: Degraded telemetry artifact mirrors bypass redaction

id: fnd_sig-feat-service-0904c19cb1-abe5_3d8e368090
category: security
confidence: medium
triage: risk
status: open
feature: Buster Transport Rate Limit And Telemetry (feat_service_0904c19cb1)
next: clawpatch show --finding fnd_sig-feat-service-0904c19cb1-abe5_3d8e368090

evidence:
- buster/pipeline/services/telemetry.ts:202-221 (appendFallbackEvent)
- buster/pipeline/services/telemetry.ts:280-301 (recordTelemetryPayloadInvalid)
- buster/pipeline/services/telemetry.ts:317-336 (markTelemetryDegradedOnce)

Make telemetry payload validation fail with validation_errors containing a secret-like value, then call emitEvent with pipeline_log_path set. The fallback event is sanitized, but the pipeline artifact degraded envelope is built from the raw payload.

recommendation:
Sanitize the degraded payload before every appendPipelineArtifactEvent call, including validation failure and Redis degraded signals. Prefer building one sanitized degraded envelope and using it for both artifact and Redis paths.

test analysis:
No linked tests were included for degraded telemetry artifact output, and TypeScript cannot verify whether diagnostic objects have passed through the redaction helper.

suggested regression test:
Add a telemetry test that injects secret-looking values into validation_errors and Redis error detail, emits degraded telemetry, and asserts pipeline artifacts contain only redacted values.

minimum fix scope:
Update recordTelemetryPayloadInvalid and markTelemetryDegradedOnce in buster/pipeline/services/telemetry.ts to pass sanitized payloads into buildEnvelope for pipeline artifacts.

repro:
Make telemetry payload validation fail with validation_errors containing a secret-like value, then call emitEvent with pipeline_log_path set. The fallback event is sanitized, but the pipeline artifact degraded envelope is built from the raw payload.

## medium: Telemetry restoration can be marked complete before Redis records it

id: fnd_sig-feat-service-0904c19cb1-aff6_77cdd7f54b
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Transport Rate Limit And Telemetry (feat_service_0904c19cb1)
next: clawpatch show --finding fnd_sig-feat-service-0904c19cb1-aff6_77cdd7f54b

evidence:
- buster/pipeline/services/telemetry.ts:339-370 (emitRestoredIfNeeded)

Use a Redis mock where the normal event write succeeds, but the subsequent observability.restored multi().exec fails. After emitEvent returns, ctx._health.redis.degraded is false and a second emitEvent will not retry observability.restored.

recommendation:
Move the health reset until after the restored event has been successfully written to Redis, or keep an explicit pending-restore state and retry until the restored signal is committed.

test analysis:
No linked tests cover partial failure during degraded-to-restored transition, and the ordering bug is valid TypeScript.

suggested regression test:
Add a telemetry test that fails only the restored-event Redis write and asserts the context remains degraded or retries restoration on the next successful emit.

minimum fix scope:
Reorder state mutation in emitRestoredIfNeeded in buster/pipeline/services/telemetry.ts.

repro:
Use a Redis mock where the normal event write succeeds, but the subsequent observability.restored multi().exec fails. After emitEvent returns, ctx._health.redis.degraded is false and a second emitEvent will not retry observability.restored.


## Consolidated final medium findings from 2026-06-02

## medium: Review output is published before validation and before the canonical gate output is copied

id: fnd_sig-feat-job-bb87327e3e-5a3d1d4c_c256675270
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Nova Gate Runners (feat_job_bb87327e3e)
next: clawpatch show --finding fnd_sig-feat-job-bb87327e3e-5a3d1d4c_c256675270

evidence:
- nova/pipeline/runners/review-gate-task.ts:310-331 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:333-343 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-task.ts:345-367 (runReviewGateOnce)
- nova/pipeline/runners/review-gate-output.ts:63-115 (parseReviewOutputContent)

Parse and validate the reviewer output first, copy the canonical gate output before publication, then commit/push the validated reviewer and merged gate output together. Invalid output should remain a local diagnostic or archived artifact, not an authoritative published output.

recommendation:
Parse and validate the reviewer output first, copy the canonical gate output before publication, then commit/push the validated reviewer and merged gate output together. Invalid output should remain a local diagnostic or archived artifact, not an authoritative published output.

test analysis:
No tests are listed, and typechecks cannot catch filesystem/Git operation ordering.

suggested regression test:
Create a runReviewGateOnce test where pollForFile succeeds with invalid JSON and assert gitCommitAndPush is not called; add a valid-output case where gate.output_file differs and assert the merged file exists before gitCommitAndPush runs.

minimum fix scope:
Reorder runReviewGateOnce phases so validation and merged-output copy happen before gitCommitAndPush.

repro:
No concrete reproduction provided.

## medium: isSessionTerminal has a truthy Promise path for label checks

id: fnd_sig-feat-library-fc78cddf11-f82b_7f0f38e14d
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Common Pipeline Runtime Primitives (feat_library_fc78cddf11)
next: clawpatch show --finding fnd_sig-feat-library-fc78cddf11-f82b_7f0f38e14d

evidence:
- common/pipeline/agents/acp-monitor.ts:570-584 (isSessionTerminal)

Make the API return one type consistently. Prefer declaring it async and always returning the terminal result object/boolean via Promise, or split the synchronous state predicate from the asynchronous monitor lookup.

recommendation:
Make the API return one type consistently. Prefer declaring it async and always returning the terminal result object/boolean via Promise, or split the synchronous state predicate from the asynchronous monitor lookup.

test analysis:
No tests were listed for this feature, and type checking is weak here because the function arguments and return flow are all any/inferred JavaScript-style values.

suggested regression test:
Add a test that calls isSessionTerminal with a nonterminal label without awaiting it and verifies the API shape prevents truthiness misuse, or add a type/API test that the label path is explicitly async.

minimum fix scope:
common/pipeline/agents/acp-monitor.ts.

repro:
No concrete reproduction provided.

## medium: Redis CLI can drop Discord notifications and leave rejections unhandled

id: fnd_sig-feat-service-0904c19cb1-cdd0_f174801b2b
category: bug
confidence: medium
triage: risk
status: open
feature: Buster Transport Rate Limit And Telemetry (feat_service_0904c19cb1)
next: clawpatch show --finding fnd_sig-feat-service-0904c19cb1-cdd0_f174801b2b

evidence:
- buster/pipeline/tools/redis.ts:63-91 (logToDiscord)
- buster/pipeline/tools/redis.ts:126-128 (publishTask)
- buster/pipeline/tools/redis.ts:193-207 (CLI send action)

Stub sendDiscord to return a delayed rejecting promise, then run the send action. publishTask completes and the CLI reaches process.exit while the Discord send is still pending; if it rejects first, the rejection is not caught by logToDiscord's try/catch.

recommendation:
Await sendDiscord inside the try/catch, or wrap it with Promise.resolve(sendDiscord(...)).catch(...) and only return once the noncritical failure has been handled for CLI usage.

test analysis:
No linked tests cover asynchronous Discord failure or CLI process-exit timing, and the missing await is not caught by the current detected toolchain.

suggested regression test:
Add a redis tool publish test with sendDiscord mocked as a delayed rejection and assert publishTask still returns without unhandledRejection and without exiting before the notification promise settles.

minimum fix scope:
Update logToDiscord in buster/pipeline/tools/redis.ts to await or explicitly catch the sendDiscord promise.

repro:
Stub sendDiscord to return a delayed rejecting promise, then run the send action. publishTask completes and the CLI reaches process.exit while the Discord send is still pending; if it rejects first, the rejection is not caught by logToDiscord's try/catch.

## medium: Invalid serialized resume_at values bypass durable cooldowns

id: fnd_sig-feat-service-0c53714583-3148_fa37d90f31
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Rate Limiting (feat_service_0c53714583)
next: clawpatch show --finding fnd_sig-feat-service-0c53714583-3148_fa37d90f31

evidence:
- nova/pipeline/services/rate-limit.ts:372-385
- nova/pipeline/services/rate-limit.ts:387-418

Persist an open lifecycle cooldown with resume_at set to a non-date string and call resumeDurableCooldownForStep. It skips sleeping, writes rate_limit.cooldown_completed, and returns resumed true.

recommendation:
Parse resume_at into a number and require Number.isFinite before comparing or closing the cooldown. On invalid data, keep the cooldown open and emit a durable operator alert or return an explicit error instead of resuming.

test analysis:
No linked tests were supplied for malformed lifecycle cooldown serialization, and the files are ts-nocheck so this persisted-data case is not typechecked.

suggested regression test:
Seed getLifecycleCooldown with { open: true, resume_at: 'not-a-date' } and assert resumeDurableCooldownForStep does not append cooldown_completed or call resume sync without reporting the invalid cooldown.

minimum fix scope:
Add resume_at validation in resumeDurableCooldownForStep before calculating remainingMs and before appending cooldown_completed.

repro:
Persist an open lifecycle cooldown with resume_at set to a non-date string and call resumeDurableCooldownForStep. It skips sleeping, writes rate_limit.cooldown_completed, and returns resumed true.

## medium: stop can return while the start loop creates a new Redis client

id: fnd_sig-feat-service-11ed88a7cb-8a6d_e9db4556e6
category: concurrency
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Ingester (feat_service_11ed88a7cb)
next: clawpatch show --finding fnd_sig-feat-service-11ed88a7cb-8a6d_e9db4556e6

evidence:
- nova/pipeline/services/agent-observability-ingester/consumer.ts:278-286 (AgentObservabilityIngester.processEntry)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:292-299 (AgentObservabilityIngester.ack)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:396-414 (AgentObservabilityIngester.start)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:416-424 (AgentObservabilityIngester.stop)

Use start with a fake entry and an emitEvent promise that is held open. Call stop while emitEvent is pending, then resolve emitEvent. The subsequent ack path creates a new Redis client because stop already nulled this.redis.

recommendation:
Track the loop promise created by start and have stop await it before clearing and closing the Redis client, or add a closing state that prevents ensureRedisClient from creating clients after stop begins while still allowing deterministic cleanup of in-flight work.

test analysis:
No lifecycle tests were included, and this race requires interleaving stop with an in-flight async emit, which typechecking cannot detect.

suggested regression test:
Add a start/stop test with a controlled emitEvent promise and a redisClientFactory spy; assert stop waits for the in-flight loop and no new Redis client is created after stop begins.

minimum fix scope:
Modify AgentObservabilityIngester start/stop state management and add one controlled lifecycle regression test.

repro:
Use start with a fake entry and an emitEvent promise that is held open. Call stop while emitEvent is pending, then resolve emitEvent. The subsequent ack path creates a new Redis client because stop already nulled this.redis.

## medium: Default Redis command timeout races the blocking read timeout

id: fnd_sig-feat-service-11ed88a7cb-f50b_c8f4b81ed8
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Ingester (feat_service_11ed88a7cb)
next: clawpatch show --finding fnd_sig-feat-service-11ed88a7cb-f50b_c8f4b81ed8

evidence:
- nova/pipeline/services/agent-observability-ingester/config.ts:118-120 (resolveAgentObservabilityIngesterConfig)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:181-183 (AgentObservabilityIngester.redisCall)
- nova/pipeline/services/agent-observability-ingester/consumer.ts:227-234 (AgentObservabilityIngester.readNext)

Use default config and a Redis xreadgroup implementation that resolves null just after the 1000ms block interval. readNext rejects with the command timeout instead of returning an empty entry list.

recommendation:
Make the command timeout for blocking reads larger than pollBlockMs by a fixed cushion, or use a separate read timeout derived from pollBlockMs plus redisCommandTimeoutMs. Validate configuration so redisCommandTimeoutMs cannot be less than or equal to pollBlockMs when used for blocking reads.

test analysis:
No tests were included for idle polling behavior, and both defaults are valid positive integers, so the configuration type checks cleanly.

suggested regression test:
Add a readNext test with default config and an xreadgroup mock that resolves after pollBlockMs plus a small delay; assert the ingester does not classify the idle poll as a timeout under the fixed configuration.

minimum fix scope:
Adjust timeout calculation or defaults in config/consumer and add one idle-read regression test.

repro:
Use default config and a Redis xreadgroup implementation that resolves null just after the 1000ms block interval. readNext rejects with the command timeout instead of returning an empty entry list.

## medium: Forge completion ignores legitimate files with control-like basenames

id: fnd_sig-feat-service-3a655efb45-eb90_d809f85b0b
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Observability Runtime (feat_service_3a655efb45)
next: clawpatch show --finding fnd_sig-feat-service-3a655efb45-eb90_d809f85b0b

evidence:
- nova/pipeline/services/agent-observability-forge-completion.ts:27-30 (CONTROL_FILE_NAMES)
- nova/pipeline/services/agent-observability-forge-completion.ts:70-78 (isForgeCompletionControlPath)
- nova/pipeline/services/agent-observability-forge-completion.ts:132-153 (collectMeaningfulForgeDiffEvidence)
- nova/pipeline/services/agent-observability-forge-completion.ts:173-179 (buildForgeCompletionStatusFromDiff)

Create a forge run whose only git change is a tracked application file named status.json outside the module runtime/control location. statusPaths() feeds that path to addPath(), isForgeCompletionControlPath() classifies it as ignored by basename, and the resulting diff evidence has hasMeaningfulChanges false.

recommendation:
Narrow the ignore rule to known runtime/control locations, such as the module-relative control paths built by moduleRelativePath and the .swarm/log prefixes. Do not ignore arbitrary repository files solely by basename.

test analysis:
No linked tests were included for meaningful diff classification, and this false negative depends on runtime git path contents rather than static typing.

suggested regression test:
Add a collectMeaningfulForgeDiffEvidence test with a changed non-runtime path ending in status.json and assert it is counted in meaningful paths.

minimum fix scope:
Remove or scope the global CONTROL_FILE_NAMES basename check in isForgeCompletionControlPath.

repro:
Create a forge run whose only git change is a tracked application file named status.json outside the module runtime/control location. statusPaths() feeds that path to addPath(), isForgeCompletionControlPath() classifies it as ignored by basename, and the resulting diff evidence has hasMeaningfulChanges false.

## medium: Approval emitExisting can turn an absent state file into a fatal signal

id: fnd_sig-feat-service-43984fffc4-98b9_730b744e17
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Completion And Control Services (feat_service_43984fffc4)
next: clawpatch show --finding fnd_sig-feat-service-43984fffc4-98b9_730b744e17

evidence:
- nova/pipeline/services/approval-signal-event-adapter.ts:116-118 (createApprovalSignalEventAdapter)
- nova/pipeline/services/approval-signal-event-adapter.ts:137-150 (emitCurrentState)
- nova/pipeline/services/approval-signal-event-adapter.ts:212-220 (start)
- nova/pipeline/services/approval-signal-event-adapter.ts:237-237 (start)

Guard emitExisting with fs.existsSync(statePath), or treat ENOENT from loadState as pending rather than fatal. Reserve fatal.error for corrupted or unreadable files that actually exist and should be operator-visible.

recommendation:
Guard emitExisting with fs.existsSync(statePath), or treat ENOENT from loadState as pending rather than fatal. Reserve fatal.error for corrupted or unreadable files that actually exist and should be operator-visible.

test analysis:
No linked tests cover approval watcher startup with emitExisting true and a missing state file; the behavior depends on filesystem timing, not static types.

suggested regression test:
Start createApprovalSignalEventAdapter with emitExisting true while the state file is absent but the parent directory exists. Assert no fatal.error is emitted, then create the state file and assert the approval.signal event is emitted.

minimum fix scope:
Change createApprovalSignalEventAdapter start or emitCurrentState ENOENT handling and add one adapter startup test.

repro:
No concrete reproduction provided.

## medium: discordEmbeds bypasses level-based alert gating

id: fnd_sig-feat-service-5696822083-731d_74e24b5616
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Notifications And Integrations (feat_service_5696822083)
next: clawpatch show --finding fnd_sig-feat-service-5696822083-731d_74e24b5616

evidence:
- nova/pipeline/integrations/discord.ts:281-283 (discord)
- nova/pipeline/integrations/discord.ts:349-355 (discordEmbeds)
- nova/pipeline/services/notification-contract.ts:198-204 (observeDiscordNotification)

Set config.discord_alerts.info to false, provide config.discord_webhook_url, and dispatch a notification with presentation.discord.embeds and level INFO. discordEmbeds still calls postDiscordWebhook.

recommendation:
Apply the same level gate in discordEmbeds before webhook delivery, using opts.level defaulting to INFO. Keep audit behavior separate if audit entries should still be recorded for disabled delivery.

test analysis:
No tests were included for Discord delivery gating, and typechecking cannot detect a missing runtime config check.

suggested regression test:
Mock postDiscordWebhook and assert discordEmbeds does not call it when the requested level is disabled, while still allowing enabled levels.

minimum fix scope:
Add the config.discord_alerts level check to discordEmbeds' webhook delivery branch.

repro:
Set config.discord_alerts.info to false, provide config.discord_webhook_url, and dispatch a notification with presentation.discord.embeds and level INFO. discordEmbeds still calls postDiscordWebhook.

## medium: Git sync verifies a shortened hash instead of the requested commit

id: fnd_sig-feat-service-86a35b1a93-7380_ef998afe50
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Task Lifecycle And Queue (feat_service_86a35b1a93)
next: clawpatch show --finding fnd_sig-feat-service-86a35b1a93-7380_ef998afe50

evidence:
- buster/pipeline/services/git-workflows.ts:96-111
- buster/pipeline/services/task-lifecycle/git-sync.ts:38-47

After reset, resolve the full HEAD hash with rev-parse HEAD and compare it to the requested target hash, allowing only an explicit prefix match if abbreviated input is supported. Store both full target and full actual hashes, or clearly separate display_short_hash from the machine-verified commit hash.

recommendation:
After reset, resolve the full HEAD hash with rev-parse HEAD and compare it to the requested target hash, allowing only an explicit prefix match if abbreviated input is supported. Store both full target and full actual hashes, or clearly separate display_short_hash from the machine-verified commit hash.

test analysis:
No linked tests are included for gitSync hash verification or telemetry commit_hash shape.

suggested regression test:
Add a gitSync unit test with a full 40-character target hash and assert the success result actual_hash is the full resolved HEAD and matches the target, not a shortened value.

minimum fix scope:
Change gitSync to use rev-parse HEAD for verification and return the verified full actual hash.

repro:
No concrete reproduction provided.

## medium: Timeout monitor results are republished as non-timeout agent outcomes

id: fnd_sig-feat-service-86a35b1a93-dc6d_da073075a1
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Buster Task Lifecycle And Queue (feat_service_86a35b1a93)
next: clawpatch show --finding fnd_sig-feat-service-86a35b1a93-dc6d_da073075a1

evidence:
- buster/pipeline/services/session-monitor.ts:126-164
- buster/pipeline/services/task-lifecycle/session.ts:268-288
- buster/pipeline/services/task-lifecycle/session.ts:298-357

Normalize monitor timeout reasons before publishTaskOutcome, for example map session_timeout_kill_confirmed/session_timeout_kill_unconfirmed to an explicit agentResult outcome of TIMEOUT with the monitor reason preserved as detail. Assert the completion record carries outcome TIMEOUT for hard-deadline kills.

recommendation:
Normalize monitor timeout reasons before publishTaskOutcome, for example map session_timeout_kill_confirmed/session_timeout_kill_unconfirmed to an explicit agentResult outcome of TIMEOUT with the monitor reason preserved as detail. Assert the completion record carries outcome TIMEOUT for hard-deadline kills.

test analysis:
No linked tests are included for hard timeout monitor results flowing through killTaskSession and publishTaskOutcome into completion signaling.

suggested regression test:
Add a lifecycle test where monitorSession returns session_timeout_kill_confirmed and assert publishTaskOutcome returns outcome TIMEOUT and sends the timeout path, not a generic session-monitor outcome.

minimum fix scope:
Add timeout normalization in publishTaskOutcome or in monitorTaskSession before the result reaches resolveBusterAgentResult.

repro:
No concrete reproduction provided.

## medium: Gate truth drift skips malformed completion entries with missing status

id: fnd_sig-feat-service-899c764b9b-3b26_63e2ff26dc
category: bug
confidence: medium
triage: risk
status: open
feature: Nova Failure Semantics And Remediation (feat_service_899c764b9b)
next: clawpatch show --finding fnd_sig-feat-service-899c764b9b-3b26_63e2ff26dc

evidence:
- nova/pipeline/services/truth-drift.ts:38-50 (projectModuleTruthDrift)
- nova/pipeline/services/truth-drift.ts:70-82 (projectGateTruthDrift)

Call projectGateTruthDrift with a gate whose scheduler projection has no drift and redisEntry: { status: '' }; completion_adjudication is null and no completion drift can be reported.

recommendation:
Invoke adjudicateCompletionEvidence whenever a gate redisEntry is present, or emit an explicit missing-status drift entry for malformed completion records. Reserve null adjudication for the case where no completion evidence exists at all.

test analysis:
No linked tests were provided, and the branch only fails for malformed completion payloads that still exist as Redis entries but lack a truthy status.

suggested regression test:
Add a gate truth-drift test with an otherwise clean scheduler projection and redisEntry objects whose status is missing, empty string, and null, asserting drift_detected is true and completion_adjudication records the malformed evidence.

minimum fix scope:
nova/pipeline/services/truth-drift.ts

repro:
Call projectGateTruthDrift with a gate whose scheduler projection has no drift and redisEntry: { status: '' }; completion_adjudication is null and no completion drift can be reported.

## medium: Tracked gate identity is not used for session rate-limit handling

id: fnd_sig-feat-service-8a1f59ceda-1b62_4babdf9b34
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Polling And Session Coordination (feat_service_8a1f59ceda)
next: clawpatch show --finding fnd_sig-feat-service-8a1f59ceda-1b62_4babdf9b34

evidence:
- nova/pipeline/services/polling-identity.ts:34-47 (resolveSessionPollIdentity)
- nova/pipeline/services/polling-session-end.ts:173-181 (pollForSessionEnd)
- nova/pipeline/services/polling-session-end.ts:190-200 (pollForSessionEnd)
- nova/pipeline/services/polling-session-end.ts:372-397 (pollForSessionEnd)

Use a tracked agent with telemetry_gate_id and telemetry_gate_type, call pollForSessionEnd without opts.gateId, and force acpState.rateLimited with exhausted pauses. The branch at lines 372-386 is skipped and buildModuleSessionRateLimitStatus is used.

recommendation:
Build _rateLimitIdentity from _telemetryIdentity, not from raw opts alone. Also preserve tracked.telemetry_gate_type in resolveSessionPollIdentity when gateType is omitted.

test analysis:
No linked tests cover tracked-agent-derived gate sessions or exhausted ACP rate-limit behavior.

suggested regression test:
Add a session-end rate-limit test where getTrackedAgent returns telemetry_gate_id/telemetry_gate_type and opts.gateId is omitted; assert the exhausted result is gate-scoped with gate_id and gate_type.

minimum fix scope:
nova/pipeline/services/polling-session-end.ts identity construction, and likely nova/pipeline/services/polling-identity.ts gate_type fallback.

repro:
Use a tracked agent with telemetry_gate_id and telemetry_gate_type, call pollForSessionEnd without opts.gateId, and force acpState.rateLimited with exhausted pauses. The branch at lines 372-386 is skipped and buildModuleSessionRateLimitStatus is used.

## medium: Rate-limit lifecycle mutation is dropped by the generic poller

id: fnd_sig-feat-service-8a1f59ceda-1c2e_797d72bf18
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Nova Polling And Session Coordination (feat_service_8a1f59ceda)
next: clawpatch show --finding fnd_sig-feat-service-8a1f59ceda-1c2e_797d72bf18

evidence:
- nova/pipeline/services/polling.ts:189-192 (pollGeneric)
- nova/pipeline/services/polling.ts:423-427 (pollStatus)
- nova/pipeline/services/status-store.ts:252-271 (assertLifecycleGuardAllowsSave)
- nova/pipeline/services/status-store.ts:365-370 (saveStatus)

Make getAcpMonitorState return acpState.rateLimited during pollStatus. The inner check returns lifecycleMutation, but the public PollResult has ok=false, reason='rate_limited', status set, and no lifecycleMutation.

recommendation:
Preserve rate-limit metadata when pollGeneric wraps check.rate_limited, for example by passing lifecycleMutation through pollResult extra fields, or require rate-limit checks to return an already-built result object.

test analysis:
No linked tests are included, and these files are under @ts-nocheck, so the dropped ad-hoc field is not type-checked.

suggested regression test:
Unit-test pollGeneric with a check function returning { rate_limited: true, status, lifecycleMutation } and assert the returned PollResult includes lifecycleMutation. Add a pollStatus ACP-rate-limit test that persists the returned status without guard failure.

minimum fix scope:
nova/pipeline/services/polling.ts rate-limit wrapping, plus a focused regression test.

repro:
Make getAcpMonitorState return acpState.rateLimited during pollStatus. The inner check returns lifecycleMutation, but the public PollResult has ok=false, reason='rate_limited', status set, and no lifecycleMutation.

## medium: Session timeout reports no changes even after observed work

id: fnd_sig-feat-service-8a1f59ceda-71e9_68e0a486ef
category: data-loss
confidence: medium
triage: risk
status: open
feature: Nova Polling And Session Coordination (feat_service_8a1f59ceda)
next: clawpatch show --finding fnd_sig-feat-service-8a1f59ceda-71e9_68e0a486ef

evidence:
- nova/pipeline/services/polling-session-end.ts:302-313 (pollForSessionEnd)
- nova/pipeline/services/polling-session-end.ts:427-450 (pollForSessionEnd)
- nova/pipeline/services/polling-session-end.ts:492-508 (pollForSessionEnd)

Set a short timeout, let the session move HEAD near the end of the budget so lastHeadChangeTime is set but POST_CHANGE_GRACE_MS has not elapsed, then exhaust the budget. The timeout result is { completed:false, hasChanges:false, reason:'timeout' }.

recommendation:
On timeout, perform the same final HEAD/worktree-signature check used after session-end grace and return hasChanges accordingly, with a distinct reason such as timeout_with_changes if needed. Mirror the subagent transcript on this path as well.

test analysis:
No linked tests exercise timeout after late HEAD movement or dirty worktree changes.

suggested regression test:
Add a pollForSessionEnd test that simulates HEAD changing shortly before budget exhaustion and asserts the timeout result preserves hasChanges:true.

minimum fix scope:
nova/pipeline/services/polling-session-end.ts timeout handling.

repro:
Set a short timeout, let the session move HEAD near the end of the budget so lastHeadChangeTime is set but POST_CHANGE_GRACE_MS has not elapsed, then exhaust the budget. The timeout result is { completed:false, hasChanges:false, reason:'timeout' }.

## medium: Gate active-session cleanup can delete a newer session record

id: fnd_sig-feat-service-a85bf60e69-8c51_f94d00d26e
category: concurrency
confidence: medium
triage: risk
status: open
feature: Nova Agent Lifecycle And Orchestration (feat_service_a85bf60e69)
next: clawpatch show --finding fnd_sig-feat-service-a85bf60e69-8c51_f94d00d26e

evidence:
- nova/pipeline/services/gate-active-session.ts:140-170 (persistGateActiveSession)
- nova/pipeline/services/gate-active-session.ts:174-180 (clearGateActiveSession)
- nova/pipeline/services/session-authority.ts:8-13 (STRONG_ACTIVE_SESSION_IDENTITY_FIELDS)

Persist gate session A, persist replacement session B for the same gate, then let cleanup for A call clearGateActiveSession; B's active-session file is unconditionally removed.

recommendation:
Make cleanup identity-aware: pass the expected session identity to clearGateActiveSession, read the current file, and unlink only when the stored strong identity matches the session being cleared. Leave mismatched newer records intact.

test analysis:
No tests are included for gate active-session replacement or stale cleanup races.

suggested regression test:
Persist two different strong identities for the same gate and assert clearing the first identity does not remove the second identity's file.

minimum fix scope:
Extend clearGateActiveSession in nova/pipeline/services/gate-active-session.ts to validate expected identity before unlinking, and update its callers accordingly.

repro:
Persist gate session A, persist replacement session B for the same gate, then let cleanup for A call clearGateActiveSession; B's active-session file is unconditionally removed.

## medium: Unknown buster poll failures build an invalid control result and throw

id: fnd_sig-feat-service-b1adbcd40d-94ea_03f1c9a982
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Module Workers (feat_service_b1adbcd40d)
next: clawpatch show --finding fnd_sig-feat-service-b1adbcd40d-94ea_03f1c9a982

evidence:
- nova/pipeline/agents/module-workers.ts:72-83 (resolveModuleBusterFailureClass)
- nova/pipeline/agents/module-workers.ts:103-129 (busterControlForPollResult)
- nova/pipeline/agents/module-workers.ts:409-412 (runModuleBusterWorker)
- nova/pipeline/agents/module-worker-control-results.ts:105-112 (buildModuleBusterWorkerControlResult)

Make pollDualWithRateLimitRecovery return an unclassified failure such as { ok: false, reason: 'redis_missing', status: { status: 'BLOCKED' } } with no failure_class. runModuleBusterWorker reaches buildModuleBusterWorkerControlResult and throws the explicit failureClass error instead of returning a block result.

recommendation:
Give the buster fallback path a non-null failure class such as unknown, poll_error, or unclassified_failure, and include it in the typed result metadata. Keep the explicit failureClass requirement, but ensure every control path satisfies it.

test analysis:
No tests are listed for this feature, and the included excerpts do not show a regression case for unrecognized buster poll failure reasons.

suggested regression test:
Add a buster worker test where the poll dependency returns ok:false with an unrecognized reason and no failure_class, then assert the worker returns a typed module_buster block/error result with a non-null failure_class.

minimum fix scope:
nova/pipeline/agents/module-workers.ts buster failure-class fallback.

repro:
Make pollDualWithRateLimitRecovery return an unclassified failure such as { ok: false, reason: 'redis_missing', status: { status: 'BLOCKED' } } with no failure_class. runModuleBusterWorker reaches buildModuleBusterWorkerControlResult and throws the explicit failureClass error instead of returning a block result.

## medium: One failed Discord audit target prevents writes to remaining targets

id: fnd_sig-feat-service-bef2f303ad-1996_4417af292e
category: data-loss
confidence: high
triage: confirmed-bug
status: open
feature: Buster Integrations And Notifications (feat_service_bef2f303ad)
next: clawpatch show --finding fnd_sig-feat-service-bef2f303ad-1996_4417af292e

evidence:
- buster/pipeline/services/discord.ts:184-189
- buster/pipeline/services/discord.ts:323-358

Handle mkdir/append failures per target, continue attempting the remaining targets, and report which targets failed after the loop.

recommendation:
Handle mkdir/append failures per target, continue attempting the remaining targets, and report which targets failed after the loop.

test analysis:
No tests are included that simulate mixed writable and unwritable Discord audit targets.

suggested regression test:
Mock fs so the first audit target append fails and the second succeeds, then assert the second target still receives a JSONL entry and the failure is reported once.

minimum fix scope:
Change persistDiscordArtifact to isolate errors inside the per-target loop.

repro:
No concrete reproduction provided.

## medium: Gate wait refs ignore attempt and collapse retries

id: fnd_sig-feat-service-bf7d898157-9d53_780dfe29e2
category: api-contract
confidence: high
triage: contract-mismatch
status: open
feature: Nova Status Store (feat_service_bf7d898157)
next: clawpatch show --finding fnd_sig-feat-service-bf7d898157-9d53_780dfe29e2

evidence:
- nova/pipeline/services/status-store-lifecycle/appenders.ts:140-158 (appendWaitLifecycleEvent)
- nova/pipeline/services/status-store-lifecycle/refs.ts:98-107 (buildWaitRefs)
- nova/pipeline/services/status-store-lifecycle/refs.ts:115-125 (buildResumeSignalRefs)
- nova/pipeline/services/status-store-lifecycle/idempotency.ts:59-64 (buildLifecycleIdempotencyKey)

Open and close an approval wait for gate g at attempt 1, then call appendWaitLifecycleEvent(config, 'wait.opened', { gateId: 'g', attempt: 2, waitKind: 'approval' }). The generated wait_ref is the same as attempt 1, so idempotency treats it as the existing wait.opened event.

recommendation:
Include attempt in wait_ref and resume_signal_ref, or explicitly remove attempt from the public wait lifecycle API if waits are single-shot. Keep gate_evaluation_ref, wait_ref, resume_signal_ref, and idempotency keys aligned.

test analysis:
No wait retry or multi-attempt approval tests were included. Typechecking cannot catch the semantic mismatch because the attempt parameter is accepted and propagated into some refs but omitted from the persisted identifiers.

suggested regression test:
Add a lifecycle test that opens, signals, and closes attempt 1 for a gate, then opens attempt 2 and asserts a distinct wait_ref, resume_signal_ref, events, and read-model entry are produced.

minimum fix scope:
buildWaitRefs, buildResumeSignalRefs, and any compatibility/read-model expectations for wait identifiers.

repro:
Open and close an approval wait for gate g at attempt 1, then call appendWaitLifecycleEvent(config, 'wait.opened', { gateId: 'g', attempt: 2, waitKind: 'approval' }). The generated wait_ref is the same as attempt 1, so idempotency treats it as the existing wait.opened event.

## medium: Kubernetes namespace construction uses unsanitized project names

id: fnd_sig-feat-test-suite-77bede17d2-1_287f872294
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner And Suites (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-1_287f872294

evidence:
- buster/pipeline/suites/k8s.ts:329-348
- buster/pipeline/runners/suite-runner.ts:299-312

Run the k8s suite with payload.project = 'My_App'; the generated namespace includes that string and kubectl create namespace rejects it.

recommendation:
Normalize the project segment to a Kubernetes DNS label, collapse invalid characters to hyphens, trim leading/trailing hyphens, and truncate the full namespace to the Kubernetes length limit while preserving the random suffix.

test analysis:
The included k8s suite has prefix validation coverage in code but no project-name normalization test, and suite-runner identity validation only checks presence.

suggested regression test:
Create a k8s suite context with project names like My_App and a very long project string, then assert the generated namespace is lowercase DNS-safe and <=63 characters.

minimum fix scope:
Add a namespace-safe project segment helper in buster/pipeline/suites/k8s.ts.

repro:
Run the k8s suite with payload.project = 'My_App'; the generated namespace includes that string and kubectl create namespace rejects it.

## medium: Build secret injection can satisfy a secretKeyRef from the wrong Secret

id: fnd_sig-feat-test-suite-77bede17d2-3_814d773684
category: security
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner And Suites (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-3_814d773684

evidence:
- buster/pipeline/suites/build.ts:146-160
- buster/pipeline/suites/build.ts:175-183

Use a deployment env valueFrom.secretKeyRef name 'prod-secret', key 'TOKEN', and provide serve.secret_yaml for metadata.name 'other-secret' with data.TOKEN; buildServer injects TOKEN instead of failing.

recommendation:
Parse and validate the provided Secret metadata.name against each secretKeyRef.name, or support an explicit map/list of secret YAML files by name and fail unmatched refs.

test analysis:
No included build-suite regression covers mismatched secretKeyRef.name with a same-key secret_yaml; the current code only exercises key presence.

suggested regression test:
Add a deployment fixture referencing one secret name and a secret_yaml with a different metadata.name but same key, then assert buildServer returns a critical serve-secret-ref failure.

minimum fix scope:
Update extractEnvFromManifest in buster/pipeline/suites/build.ts.

repro:
Use a deployment env valueFrom.secretKeyRef name 'prod-secret', key 'TOKEN', and provide serve.secret_yaml for metadata.name 'other-secret' with data.TOKEN; buildServer injects TOKEN instead of failing.

## medium: Default API headers are neither interpolated nor checked for missing template variables

id: fnd_sig-feat-test-suite-77bede17d2-b_2cf3c5c8b9
category: bug
confidence: high
triage: confirmed-bug
status: open
feature: Buster Suite Runner And Suites (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-b_2cf3c5c8b9

evidence:
- buster/pipeline/suites/api.ts:123-130
- buster/pipeline/suites/api.ts:177-180
- buster/pipeline/suites/api.ts:398-421

Use auth setup that returns a token and put Authorization: Bearer {{token}} in spec.defaults.headers; the request receives the unexpanded placeholder instead of the token.

recommendation:
Interpolate defaults.headers with the auth variables before merging, and include defaults.headers in the missing-template-variable validation path.

test analysis:
The included API suite logic has no regression covering templated defaults.headers; the existing missing-variable check is limited to per-test fields.

suggested regression test:
Add an API spec fixture with auth setup plus defaults.headers.Authorization using {{token}}, assert the outgoing request uses the resolved token, and assert missing default variables fail with api-template-variable.

minimum fix scope:
Update missingTemplateVarsForTest/runHttpTest in buster/pipeline/suites/api.ts.

repro:
Use auth setup that returns a token and put Authorization: Bearer {{token}} in spec.defaults.headers; the request receives the unexpanded placeholder instead of the token.

## medium: Lighthouse reports can be corrupted by concurrent perf suites

id: fnd_sig-feat-test-suite-77bede17d2-e_7671149f5b
category: concurrency
confidence: medium
triage: risk
status: open
feature: Buster Suite Runner And Suites (feat_test-suite_77bede17d2)
next: clawpatch show --finding fnd_sig-feat-test-suite-77bede17d2-e_7671149f5b

evidence:
- buster/pipeline/suites/perf.ts:50-50
- buster/pipeline/suites/perf.ts:72-79
- buster/pipeline/suites/perf.ts:141-150

Start two perfSuite calls concurrently with different target pages and testsLogDir values; both Lighthouse invocations target the same scratchPath before copying to their final report paths.

recommendation:
Use a per-run scratch path, preferably under testsLogDir with module/attempt/run id or a mkdtemp directory, and remove any stale scratch file before invoking Lighthouse.

test analysis:
The included perf suite has no parallel execution test and only derives a unique finalPath, not a unique scratchPath.

suggested regression test:
Run two perfSuite instances concurrently with stubbed Lighthouse writes to different JSON payloads and assert each final report and parsed scores match its own invocation.

minimum fix scope:
Update resolvePerfReportPaths and perfSuite scratch file handling in buster/pipeline/suites/perf.ts.

repro:
Start two perfSuite calls concurrently with different target pages and testsLogDir values; both Lighthouse invocations target the same scratchPath before copying to their final report paths.


## Triage decisions

### 2026-06-02 high batch 1

reviewer: Raven
status: recorded

1. fnd_sig-feat-agent-tool-0f7714ee2a-2_6899b44e95 — keep, fix
   Decision: real bug. Non-zero or timed-out tsc runs can produce no file-shaped diagnostics and still be summarized as clean.
   Fix direction: type the lint-report path where practical, including safeExec and tool runner result contracts; enforce that non-zero exitCode or timedOut produces either at least one finding or tools_failed, and make pre-check fail on tools_failed > 0.

2. fnd_sig-feat-agent-tool-0f7714ee2a-a_fbb79232b7 — keep, fix
   Decision: real contract mismatch.
   Fix direction: normalize service tier buster to CLI tier full, or add buster as a full-tier alias.

3. fnd_sig-feat-agent-tool-0f7714ee2a-b_b711bc0427 — keep, fix
   Decision: real bug.
   Fix direction: pre-check passes only when total_errors === 0 and tools_failed === 0; include failed-tool details in the result.

4. fnd_sig-feat-agent-tool-76a5edb417-6_f6c5cb652f — keep, fix
   Decision: real hang risk.
   Fix direction: replace ready-only Redis waits with bounded readiness that rejects on error, end, close, or timeout and always cleans up.

5. fnd_sig-feat-agent-tool-c8cc1151d6-c_0e2e66a26e — keep, fix
   Decision: real data-loss/scope bug.
   Fix direction: parse git porcelain -z or v2 and validate both rename source and destination before push.

6. fnd_sig-feat-job-1186ca0ebf-aa2664bd_8b69f3e8ae — keep, fix
   Decision: keep, but rewrite around the simplified status model.
   Fix direction: retire GO/NO-GO in this path. Accept only PASS, FAIL, WAIT, TIMED_OUT. Map GO to PASS during migration if needed. PASS must not contain critical_issues or critical_blockers; false-positive reasoning belongs outside critical blockers.

7. fnd_sig-feat-job-1186ca0ebf-f61bd766_c7a714f380 — keep, fix
   Decision: real stale-output bug.
   Fix direction: unlink stale review output independently from archival and fail or retry setup if stale output cannot be removed.

8. fnd_sig-feat-job-48a562d1e2-816d980e_937c8d6dbd — keep, fix
   Decision: real typed-result consumer bug.
   Fix direction: guard poll_result/status access and use typed diagnostics fallback fields for terminal failure metadata.

9. fnd_sig-feat-job-48a562d1e2-81f0c042_0fd12caa56 — keep, fix
   Decision: keep as contract mismatch; verify during implementation.
   Fix direction: populate producerType in validator input, or update built-in validator producer-type lookup to accept existing validator fields.

10. fnd_sig-feat-job-5e93532101-00693775_41b7750953 — keep, fix
    Decision: keep; verify quickly but treat as real loop-risk.
    Fix direction: enforce monotonic remediation cycle progress after re-evaluation, otherwise return exhausted or contract-error instead of looping.

### 2026-06-02 high batch 2

reviewer: Raven
status: recorded

11. fnd_sig-feat-job-7ffa522006-0b412907_3a131d4719 - keep, fix
    Decision: real contract bug. Non-verdict completion failures should not enter the Forge remediation loop.
    Fix direction: add explicit terminal failure classes for completion/archive/adapter failures and only request Forge fixes for real Buster verdict failures.

12. fnd_sig-feat-job-904fd99950-7a595249_b04590f293 - keep, fix
    Decision: real split-brain concurrency bug.
    Fix direction: make lock ownership authoritative: refresh with owner/token compare-and-swap semantics and abort the runner loop when lock ownership is lost.

13. fnd_sig-feat-library-2d10436c9e-52fa_6620c82459 - keep, fix
    Decision: keep as contract-risk; verify whether project/run identifiers are already constrained.
    Fix direction: encode each Redis telemetry key component or reject delimiter/control characters before key construction.

14. fnd_sig-feat-library-2d10436c9e-58ee_f2d64b2431 - keep, fix
    Decision: real secret-redaction bug.
    Fix direction: apply SECRET_KEYS before value-type branching and preserve parent-key context when sanitizing arrays.

15. fnd_sig-feat-library-2d10436c9e-7a16_c27edca6a4 - keep, fix
    Decision: real Discord outbound secret-leak bug.
    Fix direction: build sanitized embeds from an explicit allowlist or recursively sanitize every supported embed string field, including secret-named fields.

16. fnd_sig-feat-library-2d10436c9e-c98b_d865f50aae - keep, fix
    Decision: real scoped-path security bug.
    Fix direction: use realpath-based validation for existing paths and validate real parent directories or reject symlink traversal for writes.

17. fnd_sig-feat-service-28093c6232-d63d_72c315307e - keep, fix
    Decision: keep as runtime tracking risk; validate while implementing.
    Fix direction: do not clear tracked ACP sessions unless termination is confirmed; distinguish placeholder shutdown context from real session tracking.

19. fnd_sig-feat-service-3bf2d9bd7f-48bb_aebd5eb62f - keep, fix
    Decision: real task-boundary security bug.
    Fix direction: canonicalize and validate session.cwd against the intended workspace/repo root before repo sync or session spawn.

20. fnd_sig-feat-service-3bf2d9bd7f-e20e_3bcce06399 - keep, fix
    Decision: real completion-stream bug.
    Fix direction: before ACK, synthesize a terminal FAIL to payload.completion_stream when completion was attempted but no terminal completion was published; dead-letter remains secondary fallback evidence.

### 2026-06-02 high batch 3

reviewer: Raven
status: recorded

21. fnd_sig-feat-service-3c4f1855c4-5b9c_aecde17ed0 - keep, fix
    Decision: real observability data-loss bug. Payload-stream events are routed but not consumed.
    Fix direction: add payload-stream consumer group/read/ack/dead-letter handling, or stop routing promoted telemetry events to the payload stream; make processing stream-kind-aware.

22. fnd_sig-feat-service-3c4f1855c4-6c52_548b3a7ca0 - keep, fix
    Decision: real reader-cursor bug. Ignored non-agent events can prevent progress to matching completion events.
    Fix direction: advance the Redis cursor for every entry read, then separately filter for matching agent.ended completion events.

23. fnd_sig-feat-service-3c4f1855c4-ea0c_69688b66c7 - keep, fix
    Decision: real budget enforcement bug. Corrupt usage JSONL can make hard-budget checks fail open.
    Fix direction: parse JSONL per line and surface corruption, or use strict aggregation for budget checks so corrupt usage data fails closed.

24. fnd_sig-feat-service-8348e0b688-9bbd_1e2b09effb - keep, fix
    Decision: real session-end data-loss bug. Edits to already-dirty paths can be missed.
    Fix direction: make worktree change signatures content-sensitive by hashing tracked diffs and untracked file contents or metadata.

25. fnd_sig-feat-service-bf7d898157-25b3_e3c416bac7 - keep, fix
    Decision: real status projection bug. Canonical failed gate output can be projected as pending.
    Fix direction: handle output.isFail before generic completion normalization and preserve the failure status/source.

26. fnd_sig-feat-service-bf7d898157-298b_8beab30935 - keep, fix
    Decision: real lifecycle read-model recovery bug. Canonical events can remain unprojected after crash or concurrent append.
    Fix direction: use canonical-events.jsonl as recovery source, verify read models on idempotency matches, replay/catch up when stale, serialize appends, and use unique temp files for atomic writes.

27. fnd_sig-feat-service-c85e781af1-a24d_7b09c7d86a - keep, fix
    Decision: real telemetry durability bug. External sink delivery can block durable local append.
    Fix direction: append core durable telemetry first, then dispatch sinks with bounded timeout/isolation and record degradation.

28. fnd_sig-feat-test-suite-77bede17d2-3_4c566114b7 - keep, fix
    Decision: real high-priority Kubernetes safety bug. Cluster-scoped resources are not contained by the ephemeral namespace.
    Fix direction: reject cluster-scoped resources by default, or require explicit allowlist/capability plus deterministic cleanup before apply.
### 2026-06-02 high batch 4 review2 new

reviewer: Raven
status: recorded
source: 2026-06-02-clawpatch-pipeline-review

28. fnd_sig-feat-cli-command-3049d169af-_8d0513b589 - keep, fix
    Decision: Real stale-output/data-loss bug. Existing output_file results can be accepted without proving they belong to the current task.
    Fix direction: Write task/run/session identity into output artifacts and validate it before reuse, or reserve/delete the output path at task start.

29. fnd_sig-feat-config-68fc91f4c0-64f49_51a6472ae7 - keep, fix
    Decision: Real managed-path escape bug. Identifier path segments can include traversal and escape managed directories.
    Fix direction: Add a shared safe identifier validator and assert final computed paths remain inside the expected root.

30. fnd_sig-feat-job-48a562d1e2-ad4b3ce8_720b66606e - keep, fix
    Decision: Real state-persistence bug. Blocked Buster outcomes can return EXIT_BLOCKED without persisting BLOCKED state.
    Fix direction: Persist the module BLOCKED transition and terminal telemetry before returning blocked.

31. fnd_sig-feat-job-48a562d1e2-f222d891_cd9341481b - keep, fix
    Decision: Real Redis completion identity bug. Candidate Redis entries can supply the expected session identity used to validate themselves.
    Fix direction: Resolve expected session identity only from active status, worker session, completion identity, or poll status; never from the candidate Redis entry.

32. fnd_sig-feat-job-904fd99950-2dbc68ea_292e616200 - keep, fix
    Decision: Real lock cleanup bug. Observer setup or stop failures can skip run-lock release.
    Fix direction: Put lock release under an outer guaranteed finally and catch observer cleanup failures so they cannot prevent lock release.

33. fnd_sig-feat-service-0c53714583-8d60_2be1330c14 - keep, fix
    Decision: Real durable cooldown bug. Cooldowns can be marked complete before resume state is persisted.
    Fix direction: Persist module resume state before cooldown_completed; keep cooldown open or emit an operator alert if resume sync fails.

34. fnd_sig-feat-service-11ed88a7cb-2f4e_c639ca4a96 - keep, fix
    Decision: Real observability ACK bug. Non-throwing emit failures can be acknowledged as success.
    Fix direction: Normalize emitEvent result handling and ACK only successful or intentionally dead-lettered entries.

35. fnd_sig-feat-service-333c4ffda9-af64_cad6982104 - keep, fix
    Decision: Real architecture validation contract bug if gate dependencies are supported syntax.
    Fix direction: Special-case gate: dependencies, validate referenced gates against progress.gates, and keep module dependency checks unchanged.

36. fnd_sig-feat-service-43984fffc4-076b_9d67ce4fc1 - keep, fix
    Decision: Real Redis routing identity bug. Entries missing routing fields can inherit the active waiter identity.
    Fix direction: Build routing identity only from Redis entry fields and drop or dead-letter entries missing required identity.

37. fnd_sig-feat-service-43984fffc4-0c4f_f76f4553b1 - keep, fix
    Decision: Real terminal conflict bug. Redis terminal verdicts can resolve without checking current local terminal truth.
    Fix direction: Project local status before Redis adjudication and compare against current terminal state before resolving.

38. fnd_sig-feat-service-5696822083-3f69_04689c8fef - keep, fix
    Decision: Real user-data risk. Runtime stash restoration can pop an older user stash because ordinal stash refs renumber.
    Fix direction: Track stashes by stable object id/message and apply/drop only the exact runtime stash.

39. fnd_sig-feat-service-5696822083-f1ec_db7bab607a - keep, fix
    Decision: Real linked-worktree bug. Rebase detection checks repo_root/.git and misses gitfile-based worktree rebase state.
    Fix direction: Use git rev-parse --git-path rebase-merge/rebase-apply for rebase state paths.

40. fnd_sig-feat-service-86a35b1a93-d5eb_27d58f032b - keep, fix
    Decision: Real lifecycle outcome bug. Final cleanup can throw after success and turn the task into a queue failure.
    Fix direction: Preserve the determined task outcome and report cleanup failures as best-effort diagnostic metadata.

41. fnd_sig-feat-service-a85bf60e69-7896_fbcbe2f259 - keep, fix
    Decision: Real session cleanup bug. Single-session reaper can kill unrelated orphan ACP sessions in the same project.
    Fix direction: Filter orphan victims by target session identity, or require explicit global shutdown mode for project-wide orphan cleanup.

42. fnd_sig-feat-service-b1adbcd40d-0401_3fed6161ad - keep, fix
    Decision: Real worker-session cleanup bug. Dispatch/finalize hook failures can skip kill and clear cleanup after spawn.
    Fix direction: Put spawned-agent lifetime under an outer try/finally and isolate hook failures from session cleanup.

### 2026-06-02 medium batch 1

reviewer: Raven
status: recorded

1. fnd_sig-feat-agent-tool-0f7714ee2a-3_36ea3642d3 - keep, fix
   Decision: real lint coverage bug. Kubeconform JSON resources can be ignored.
   Fix direction: parse kubeconform stdout as a JSON document and iterate resources, with NDJSON fallback only if needed.

2. fnd_sig-feat-agent-tool-0f7714ee2a-4_06771f8087 - keep, fix
   Decision: real lint discovery bug. Nested Helm charts can be missed before recursive tool discovery.
   Fix direction: use recursive Chart.yaml discovery in project type detection, matching helm-lint/kubeconform detection.

3. fnd_sig-feat-agent-tool-0f7714ee2a-8_371eff9bbb - keep, fix
   Decision: real parser bug. ShellCheck JSON shape is parsed incorrectly.
   Fix direction: normalize ShellCheck diagnostics from parsed.comments or parsed array before mapping findings.

4. fnd_sig-feat-agent-tool-76a5edb417-e_1a1d18e16f - keep, fix
   Decision: real CLI contract bug. Missing identity prints null instead of a usage error.
   Fix direction: validate required read-completion identity fields or explicitly document an unscoped read mode.

5. fnd_sig-feat-agent-tool-96bf37285e-9_d916c2b67c - keep, fix
   Decision: real Discord contract risk. Project summary embeds can exceed field limits.
   Fix direction: clamp or chunk every Discord embed field with a shared safe formatter.

6. fnd_sig-feat-agent-tool-c8cc1151d6-1_1484352bcd - keep, fix
   Decision: real Redis readiness hang; same bug class as earlier ready-only waits.
   Fix direction: use shared bounded Redis readiness that rejects on failure events or timeout.

7. fnd_sig-feat-agent-tool-c8cc1151d6-3_47cd50af99 - keep, fix
   Decision: real visual-reg artifact collision bug. Duplicate names can overwrite screenshots and match wrong results.
   Fix direction: reject duplicate names or separate unique artifact IDs from display names.

8. fnd_sig-feat-agent-tool-c8cc1151d6-4_82ee83ddfb - keep, fix
   Decision: real visual audit concurrency bug. Date-based temp dirs can collide.
   Fix direction: use atomic mkdtemp directories under outputRoot.

9. fnd_sig-feat-agent-tool-c8cc1151d6-b_65a1ea4387 - keep, fix
   Decision: real visual-reg route contract bug. Baselines can invent URL paths from names.
   Fix direction: require explicit path in route manifests and preserve it in paths.json.

10. fnd_sig-feat-cli-command-380ac2f9fb-_62dc8c6cbd - keep, fix
    Decision: real docs gap. Documented resume commands omit required Nova channel.
    Fix direction: update docs/help and optionally add a docs smoke test for the resume command.

### 2026-06-02 medium batch 2

reviewer: Raven
status: recorded

11. fnd_sig-feat-cli-command-380ac2f9fb-_9501cc0fab - keep, fix
    Decision: real CLI output data-loss risk. Immediate process.exit can truncate piped JSON output.
    Fix direction: return exit codes from main and set process.exitCode, or wait for stdout drain before exiting.

13. fnd_sig-feat-cli-command-cd67a577ef-_7b84f83cd3 - keep, fix
    Decision: real CLI bug. Unknown Buster CLI args can start the full pipeline.
    Fix direction: add explicit argument parsing and reject unknown args before startup side effects.

14. fnd_sig-feat-job-1186ca0ebf-1ba769f7_f2f8a8dfb0 - keep, fix
    Decision: real telemetry reliability bug. Failure telemetry can be fired without awaiting the async call.
    Fix direction: await onGateFail in setup-error and invalid-contract paths, or use an explicit observed fire-and-forget helper.

15. fnd_sig-feat-job-1186ca0ebf-b9b3f528_4c1c8c83e5 - keep, fix
    Decision: real publication bug. Canonical merged review output can be copied after the publication commit.
    Fix direction: copy the canonical gate output before gitCommitAndPush, or publish a second commit/step and treat copy failure as degraded.

16. fnd_sig-feat-job-48a562d1e2-18b0a65b_e2d718af1f - keep, fix
    Decision: real stale active-agent state bug. Worker exceptions after dispatch can leave active_agent persisted.
    Fix direction: clear and save active_agent in post-dispatch catch/finally paths.

18. fnd_sig-feat-job-5e93532101-0661252b_dd1a768a6e - keep, fix
    Decision: real gate correlation contract bug. Remediable/waitable normalization can drop plugin correlation metadata.
    Fix direction: pass moduleId and pluginInvocation through all normalize paths, including post-wait and post-remediation.

19. fnd_sig-feat-job-7ffa522006-61a385c0_19a61d5acb - keep, fix
    Decision: real prompt shell-safety bug. Prompted cd commands do not quote workspace paths.
    Fix direction: use shared shell quoting such as cd -- <escaped path>, or avoid executable shell snippets.

20. fnd_sig-feat-job-7ffa522006-95d7089e_6a34783b38 - keep, fix
    Decision: real telemetry loss risk. Gate telemetry promises can be fired without await on terminal paths.
    Fix direction: await telemetry calls or collect promises with rejection handlers consistently.

21. fnd_sig-feat-job-7ffa522006-cf4a39a4_8916a14d3b - keep, fix
    Decision: real cleanup bug. Completion adapters can be started outside their cleanup try/finally.
    Fix direction: start adapters inside the try and stop any successfully started adapters in finally.

22. fnd_sig-feat-job-904fd99950-05b13daf_810fe3b307 - keep, fix
    Decision: real terminal side-effect recovery bug. Completed resume can skip terminal generators forever.
    Fix direction: track generator completion separately or idempotently run missing terminal generators on completed resume.

23. fnd_sig-feat-job-904fd99950-1146e653_6d6d32d214 - keep, fix
    Decision: real resume detection bug. Started-module detection ignores module:-prefixed execution entries.
    Fix direction: normalize module ids in hasAnyStartedModules before lookup.

24. fnd_sig-feat-job-904fd99950-2b6b9203_f80eee681a - keep, fix
    Decision: real scheduled-gate identity contract bug. Plugin context can carry a mismatched gate id.
    Fix direction: validate pluginInvocation identity fields against asserted identity before handler execution.

25. fnd_sig-feat-job-b7b4461340-c037e750_aab73cdef5 - keep, fix
    Decision: real approval resume fail-closed bug. Invalid persisted timeout policies can throw before typed handling.
    Fix direction: convert persisted-state normalization failures into fail-closed invalid-state control results.

26. fnd_sig-feat-library-1d0d18c75c-a764_a89f1715a5 - keep, fix
    Decision: real public API contract mismatch. Hook enumeration omits model_usage although mappings require it.
    Fix direction: expose model_usage in the public payload-hook enumeration.

27. fnd_sig-feat-library-2d10436c9e-18ed_4e01dfbca2 - keep, fix
    Decision: real budget signal semantics bug. Budget signals do not automatically abort when deadlines pass.
    Fix direction: schedule/reschedule deadline timers and abort the signal at exhaustion.

28. fnd_sig-feat-library-2d10436c9e-24c0_76103a8d6b - keep, fix
    Decision: real CLI parser contract bug. Prototype-property flags can be accepted as known flags.
    Fix direction: use hasOwnProperty for flag lookup and null-prototype parsed maps.

29. fnd_sig-feat-library-2d10436c9e-2c71_2fb81bbe05 - keep, fix
    Decision: real noncritical reporting bug. Custom sinks can throw through noncritical reporting.
    Fix direction: wrap sink invocations and fall through to next sink/stderr; mark reported only after success or intentional suppression.

30. fnd_sig-feat-library-2d10436c9e-e14d_91f963178b - keep, fix
    Decision: real telemetry crash/data-loss bug. Cycle handling is incomplete for reporting payloads.
    Fix direction: add cycle tracking for arrays and objects and return controlled redacted summaries/errors for cycles.

### 2026-06-02 medium batch 3 partial

reviewer: Raven
status: recorded

31. fnd_sig-feat-library-67301c61e0-6db1_da00b8f36d - keep, fix
    Decision: real termination concurrency bug. The grace timeout can race the same kill operation it is waiting to confirm.
    Fix direction: use one termination deadline/budget and observe or abort the in-flight kill operation cleanly.

32. fnd_sig-feat-library-67301c61e0-829b_94c49f7ccf - keep, fix
    Decision: real session-state semantics bug. Parser outputs states that terminal/unreachable predicates do not recognize.
    Fix direction: canonicalize parser outputs or expand predicates for failed/cancelled/aborted/unknown states.

33. fnd_sig-feat-library-ef5973cc96-6fbc_da61d433c8 - keep, fix
    Decision: real fix-cycle contract bug. Missing fail_summaries should not produce a blind Forge retry.
    Fix direction: if a fix-cycle lacks usable fail_summaries, route to NEEDS_NOVA so Nova can intervene and respawn Forge with the actual failure context. Also update the pipeline core status contract to include PASS, FAIL, WAIT, TIMED_OUT, NEEDS_NOVA, and BLOCKED with their distinct meanings.

34. fnd_sig-feat-service-17a690f465-4740_edcdd7d85c - keep, fix
    Decision: real Redis task transport contract mismatch. Queue reads return a shape that the validator rejects.
    Fix direction: return canonical flat decoded entries or add a shared normalizer used by both validators and consumers.

35. fnd_sig-feat-service-17a690f465-6d02_b1bd830a95 - keep, fix
    Decision: real formatting robustness bug. Malformed cooldown values can throw while building rate-limit embeds.
    Fix direction: normalize and validate cooldownMs before Date formatting and return a safe fallback or explicit contract error.

37. fnd_sig-feat-service-17a690f465-b8bc_dc74b8a1d6 - keep, fix
    Decision: real gateway invoke contract bug. timeoutMs options leak into request bodies instead of affecting timeout behavior.
    Fix direction: destructure timeoutMs, use it for timeout selection, and exclude it from request body fields.

38. fnd_sig-feat-service-28093c6232-4bea_a533cfbe7b - keep, fix
    Decision: real Buster worker error-containment bug. Module Buster archive errors can escape typed control handling.
    Fix direction: wrap archive calls and return typed completion_archive_failed block results with cleanup.

39. fnd_sig-feat-service-2b3077a806-55dc_d9e2fe5155 - keep, fix
    Decision: real noncritical delivery bug. Project summary should not fail only because Discord posting failed.
    Fix direction: retry Discord delivery up to 3 times, then record notification degradation while preserving successful summary artifact status.

40. fnd_sig-feat-service-2b3077a806-8087_204b227870 - keep, fix
    Decision: real cleanup retry bug. Failed session termination can be marked cleaned and never retried.
    Fix direction: track termination and untracking separately and retry failed cleanup operations.

41. fnd_sig-feat-service-2b3077a806-82eb_27768fcf5d - keep, fix
    Decision: real plugin artifact path traversal bug. Lane segments can allow dot-dot traversal.
    Fix direction: reject dot-only path segments and assert resolved artifact paths remain under plugin-artifacts root.

42. fnd_sig-feat-service-2b3077a806-d5e7_8ff71a16f9 - keep, fix
    Decision: real prompt boundary bug. Operator remediation prompt can escape its XML-like fence.
    Fix direction: escape or encode prompt content before embedding in operator_remediation_directive.

43. fnd_sig-feat-service-3bf2d9bd7f-2dd4_fd93ad33a0 - keep, fix
    Decision: real task-scope cleanup bug. Task cleanup can affect global nginx and shared sandbox outputs.
    Fix direction: restrict task-scoped cleanup to task-labeled resources and reserve global cleanup for startup/shutdown.

44. fnd_sig-feat-service-3c4f1855c4-dd0f_5e429b1184 - keep, fix
    Decision: real telemetry data-loss bug. Tool/model end reasons are overwritten by outcomes.
    Fix direction: preserve reason from payload.reason and keep outcome as a separate field.

45. fnd_sig-feat-service-434742cac2-4bd4_5fc957b297 - keep, fix
    Decision: real git ref safety bug. Unvalidated push branch can be interpreted as options or invalid refspecs.
    Fix direction: validate branch/ref names before git calls, rejecting option-looking and invalid refs.

47. fnd_sig-feat-service-8348e0b688-6137_660bb6d96d - keep, fix
    Decision: real Redis completion selection bug. Malformed ignored-source completions can override canonical completions.
    Fix direction: filter/classify trusted current sources before fatal schema adjudication.

48. fnd_sig-feat-service-8348e0b688-808d_c842e3ab23 - keep, fix
    Decision: real local evidence watcher bug. Target creation under a missing parent can be missed.
    Fix direction: treat ancestor-of-target events as relevant and re-check or re-arm watcher specs.

49. fnd_sig-feat-service-a0fe81756f-1c58_ef995c1a55 - keep, fix
    Decision: real health monitor lifecycle bug. Gateway health monitor cannot be cancelled because it drops the interval handle.
    Fix direction: return the setInterval handle so callers can clear it.

50. fnd_sig-feat-service-a0fe81756f-613a_d623d9ee0e - keep, fix
    Decision: real facade export contract bug. Discord fields facade exports the contract module instead of implementation.
    Fix direction: re-export the canonical common Discord fields implementation from the Buster facade.

### 2026-06-02 medium batch 3 additions

reviewer: Raven
status: recorded

46. fnd_sig-feat-service-571bdaa394-3a5d_9b9ef5e8ef - keep, fix
    Decision: real image provenance/cache policy bug. Base images must pull from the deployment registry/mirror, not implicit public/default registries.
    Fix direction: require explicit approved registry references for base images, aligned with the deployment-local registry/cache policy; reject implicit registry references such as team/image:tag or library/python:tag.

### 2026-06-02 medium batch 3 verdict

reviewer: Raven
status: recorded

36. fnd_sig-feat-service-17a690f465-9932_625e3f3077 - keep, fix
    Decision: real Redis completion contract bug. verdict is required to be valid JSON, but validation accepts arbitrary non-JSON strings.
    Fix direction: parse verdict during validation and reject invalid JSON strings while accepting representative structured JSON verdicts.

### 2026-06-02 medium batch 4

reviewer: Raven
status: recorded

51. fnd_sig-feat-service-a0fe81756f-c550_50f43ab6e4 - keep, fix
    Decision: real gateway readiness robustness bug. Timeout handling can call a missing shutdown callback and throw TypeError.
    Fix direction: make shutdown required or provide guarded default shutdown behavior for controlled gateway failure handling.

52. fnd_sig-feat-service-c85e781af1-0ca9_3d2a610ab2 - keep, fix
    Decision: real telemetry identity bug. Payload fields can override authoritative event identity.
    Fix direction: treat runtime/options identity and eventType as authoritative; strip reserved envelope keys or write canonical fields last.

53. fnd_sig-feat-service-dfaaf2ccbc-e65c_bb65fe3184 - keep, fix
    Decision: real notification correlation bug. Discord observer drops correlation metadata before delivery.
    Fix direction: forward input.ids as opts.correlation for discord and discordEmbeds delivery.

54. fnd_sig-feat-service-e31a42903c-90ca_f4d41e7508 - keep, fix
    Decision: real failure-classification robustness bug. Non-object pre-test verdicts can crash classification/presentation.
    Fix direction: validate parsed verdict shape and default to { suites: {} } on malformed/non-object values.

55. fnd_sig-feat-service-e31a42903c-be88_dbc7aa77c6 - keep, fix
    Decision: real cross-sink status bug. Gateway injection success can be overwritten by Discord notification failure.
    Fix direction: separate gateway delivery status from Discord notification degradation.

56. fnd_sig-feat-service-e49e423db1-41c3_5580c29da8 - keep, fix
    Decision: real rate-limit finalization bug. A failing beforeReturn hook can suppress gate-failure telemetry.
    Fix direction: isolate custom beforeReturn failures and always run gate-failure telemetry in a separate/finally path.

57. fnd_sig-feat-service-e49e423db1-4896_25dc2d7f1d - keep, fix
    Decision: real durable cooldown budget bug. Replay does not extend/pass the run budget consistently.
    Fix direction: add budget handling to resumeDurableCooldownForStep and pass the budget through sleep calls.

58. fnd_sig-feat-service-e49e423db1-fc99_4ce3870f80 - keep, fix
    Decision: real rate-limit telemetry delivery bug. Exhaustion telemetry is fired without returning promises.
    Fix direction: return or await telemetry promises from rate-limit exhaustion finalizers and record delivery failures.

59. fnd_sig-feat-test-suite-77bede17d2-1_447f5230a0 - keep, fix
    Decision: real suite timeout bug. Synchronous suite work cannot be interrupted by the runner timeout.
    Fix direction: use async abortable subprocesses or killable worker/child process execution, capped by suite timeout.

60. fnd_sig-feat-test-suite-77bede17d2-6_0abd1679c0 - keep, fix
    Decision: real suite artifact data-loss bug. Shared result/report paths can be overwritten across module runs.
    Fix direction: namespace artifacts by module/run/attempt and use per-run scratch paths.

61. fnd_sig-feat-test-suite-77bede17d2-b_67d06bd867 - keep, fix
    Decision: real suite logging data-loss bug. JSONL logs can be dropped when the tests log directory is new.
    Fix direction: create results/log directories before constructing log sinks.

62. fnd_sig-feat-test-suite-77bede17d2-b_b9e9799258 - keep, fix
    Decision: real visual-reg contract bug. Optional Discord media capability can block visual validation.
    Fix direction: treat Discord media delivery as noncritical/skipped and continue visual comparison.

63. fnd_sig-feat-test-suite-77bede17d2-f_438985f1e3 - keep, fix
    Decision: real manifest parsing bug. Multi-document Kubernetes YAML can be ignored after the first document.
    Fix direction: parse all YAML documents and select supported workload documents for validation.

### 2026-06-02 low batch 1

reviewer: Raven
status: recorded

1. fnd_sig-feat-agent-tool-76a5edb417-f_f51c233b4c - keep, fix
   Decision: real CLI output data-loss risk, same class as medium #11 but specific to Nova Redis tool.
   Fix direction: fix with the same process-exit/stdout-drain handling as the broader CLI truncation issue.

2. fnd_sig-feat-service-2b3077a806-8c7a_3c67976fb5 - keep, fix
   Decision: real serialization data-loss bug. Repeated array references are incorrectly marked circular.
   Fix direction: balance seen.add/delete for arrays, ideally with try/finally, while preserving true cycle detection.

3. fnd_sig-feat-service-e31a42903c-4021_920847f3ed - keep, fix
   Decision: real shell-command rendering bug. Resume commands interpolate project names without shell escaping.
   Fix direction: shell-quote every dynamic arg or render argv-style commands through a safe command formatter.

### 2026-06-02 medium batch 5

reviewer: Raven
status: recorded

64. fnd_sig-feat-agent-tool-031bde43ff-9_1689c1aa71 - keep, fix
    Decision: Real concurrency bug. Shared visual-reg log sink state can attribute one run's logs to another concurrent run.
    Fix direction: Make visual-reg logging per-run by capturing ctx.logSink in a closure and passing that logger into helpers instead of using shared mutable state.

65. fnd_sig-feat-agent-tool-f8325826e1-2_2c5a2fc608 - keep, fix
    Decision: Real machine-output correctness bug. Case-study summaries can report incorrect code file and duration metrics.
    Fix direction: Use the actual code.codeFiles count and compute duration_seconds from normalized test duration data.

66. fnd_sig-feat-agent-tool-f8325826e1-9_43f48d9867 - keep, fix
    Decision: Real machine-output contract bug. Redis send CLI stdout is not clean JSON because a human log is printed before the JSON result.
    Fix direction: Move diagnostics to stderr or add a quiet/machine mode so stdout contains exactly one parseable JSON document.

67. fnd_sig-feat-cli-command-1c32f81ffb-_1c562c6cca - keep, fix
    Decision: Real documented contract bug. REPO_ROOT is advertised as a fallback but ignored by CLI flag normalization.
    Fix direction: Set repo from rawFlags.repo || env.REPO_ROOT and add a normalization regression test.

68. fnd_sig-feat-cli-command-3049d169af-_45b982ccdf - keep, fix
    Decision: Real lifecycle safety bug. Startup cleanup failures are ignored before the worker advertises readiness.
    Fix direction: Treat failed startup cleanup like failed shutdown cleanup: emit diagnostics and fail closed or stop before readiness/polling.

69. fnd_sig-feat-cli-command-3049d169af-_ae5a17fd4e - keep, fix
    Decision: Real filesystem-boundary bug. Capability alerts can write to unscoped context-derived paths outside the intended repo/log root.
    Fix direction: Resolve alert targets through scoped path helpers or a repo/log-root allowlist; reject absolute paths and parent traversal.

70. fnd_sig-feat-cli-command-4ba4c52231-_8b53872882 - keep, fix
    Decision: Real Discord reliability bug. Message fetch 429s abort purge instead of honoring retry_after.
    Fix direction: Handle fetch 429 before generic failure, parse retry_after, sleep, and retry the fetch loop.

71. fnd_sig-feat-config-68fc91f4c0-30b45_ad85e47057 - keep, fix
    Decision: Real integration contract bug. loadConfig returns a plugin registry but the config API cannot consistently resolve it from loaded.config.
    Fix direction: Bind the startup registry onto loaded config or make pipeline context consistently expose the loaded registry.

72. fnd_sig-feat-config-68fc91f4c0-ef1e5_ccb2d2941b - keep, fix
    Decision: Real dependency-check bug. Gate dependencies can crash when progress.gates is omitted.
    Fix direction: Validate gate dependencies against defined gates or safely return unmet dependency when progress.gates is absent.

73. fnd_sig-feat-config-8fa77836b1-403f7_665752693b - keep, fix
    Decision: Real prompt contract bug. Review fix prompt returns a raw prompt instead of the structured prompt result contract.
    Fix direction: Return makePromptResult with review-fix phase metadata, module/gate id, attempt, and toString compatibility.

74. fnd_sig-feat-job-48a562d1e2-7ccdaae1_5e40d68e6f - keep, fix
    Decision: Real typed contract mismatch. Module runners can reject contract-valid typed pass results unless legacy metadata is also present.
    Fix direction: Either validate the extra runner metadata during normalization or update runners to consume canonical typed worker fields directly.

75. fnd_sig-feat-job-904fd99950-fcbd166c_ca6c7e0714 - keep, fix
    Decision: Real run-scoping bug. Scheduled validator completion cache can leak completion state across run ids.
    Fix direction: Key validator completion cache by run id or completion path, or reset it when the resolved run id/path changes.

76. fnd_sig-feat-job-bb87327e3e-9b2e975e_a8a3647cd3 - keep, fix
    Decision: Real remediation lifecycle bug. Re-review infrastructure errors can consume Forge fix cycles; infrastructure errors should become BLOCKED.
    Fix direction: Only request Forge fix after a validated NO-GO review. Re-review setup/spawn/polling/publication errors should return BLOCKED with infrastructure metadata.

77. fnd_sig-feat-job-bb87327e3e-bfce4e85_71f49b3cdd - keep, fix
    Decision: Real session cleanup bug. Forge fix agents can be left running when polling or transcript handling throws.
    Fix direction: Wrap polling/transcript handling in try/finally and always best-effort kill/clear the gate session.

78. fnd_sig-feat-job-bb87327e3e-f5776dab_06404e1866 - keep, fix
    Decision: Real telemetry/control-flow mismatch. Auto-continue approval timeouts emit failure telemetry while returning pass.
    Fix direction: Emit pass/continued telemetry for CONTINUE timeout policy and failure telemetry only for BLOCK.

79. fnd_sig-feat-library-4059ed201e-fd8f_e9dd93f4aa - keep, fix
    Decision: Real telemetry contract mismatch. Telemetry sink builder can produce inputs its own validator rejects.
    Fix direction: Make builder and validator agree by stripping unsupported embeds during normalization or rejecting embeds at builder boundary.

80. fnd_sig-feat-library-fc78cddf11-03ad_fb20a60f45 - keep, fix
    Decision: Real timeout bug. Discord webhook timeout is disabled when a caller AbortSignal is supplied.
    Fix direction: Compose caller signal and timeout signal so timeoutMs is enforced even with options.signal.

81. fnd_sig-feat-service-0904c19cb1-8535_1c286efac4 - keep, fix
    Decision: Real rate-limit recovery bug. Liveness probes can overwrite configured gateway credentials with null.
    Fix direction: Only override acpMonitorConfig gateway credentials when top-level values are non-empty.

82. fnd_sig-feat-service-0904c19cb1-abe5_3d8e368090 - keep, fix
    Decision: Real telemetry redaction bug. Degraded telemetry artifact mirrors can bypass redaction and leak secret-like values.
    Fix direction: Build one sanitized degraded envelope and use it for every artifact and Redis degraded path.

83. fnd_sig-feat-service-0904c19cb1-aff6_77cdd7f54b - keep, fix
    Decision: Real telemetry restoration bug. Redis degradation can be marked restored before Redis records the restored event.
    Fix direction: Reset health only after restored event write succeeds, or keep pending-restore state and retry until committed.

### 2026-06-02 medium batch 6

reviewer: Raven
status: recorded

84. fnd_sig-feat-job-bb87327e3e-5a3d1d4c_c256675270 - keep, fix
    Decision: Real review publication ordering bug. Review output can be published before validation and before canonical gate output is copied.
    Fix direction: Parse and validate reviewer output first, copy canonical gate output before publication, then commit/push validated reviewer and merged gate output together.

85. fnd_sig-feat-library-fc78cddf11-f82b_7f0f38e14d - keep, fix
    Decision: Real async API shape bug. isSessionTerminal has a Promise-returning label path that can be misused as a truthy sync value.
    Fix direction: Make the API consistently async or split synchronous state predicates from asynchronous monitor lookup.

86. fnd_sig-feat-service-0904c19cb1-cdd0_f174801b2b - keep, fix
    Decision: Real notification delivery bug. Redis CLI can exit before Discord notification promises settle, causing dropped sends or unhandled rejections.
    Fix direction: Await Discord send inside try/catch, catch delayed rejections, and keep Discord delivery noncritical but observed.

87. fnd_sig-feat-service-0c53714583-3148_fa37d90f31 - keep, fix
    Decision: Real durable cooldown bug. Invalid serialized resume_at values can bypass cooldown protection.
    Fix direction: Parse resume_at strictly, require a finite timestamp/date, and keep cooldown open with operator alert on invalid persisted data.

88. fnd_sig-feat-service-11ed88a7cb-8a6d_e9db4556e6 - keep, fix
    Decision: Real shutdown race. Observability ingester stop can return while an in-flight start loop creates a new Redis client.
    Fix direction: Track and await the loop promise during stop, or add closing state that prevents new Redis clients after shutdown begins.

89. fnd_sig-feat-service-11ed88a7cb-f50b_c8f4b81ed8 - keep, fix
    Decision: Real timeout configuration bug. Default Redis command timeout can race the blocking read timeout and classify idle polls as command failures.
    Fix direction: Make blocking-read command timeout exceed pollBlockMs by a cushion and validate incompatible timeout configs.

90. fnd_sig-feat-service-3a655efb45-eb90_d809f85b0b - keep, fix
    Decision: Real authority/ignore-rule bug, adjusted by reviewer guidance. status.json-style authority must be removed from code completely because pipeline-owned authority is the only accepted source of truth; basename ignores must not hide legitimate repo changes.
    Fix direction: Remove status.json-style authority from the codebase entirely and route authority through pipeline-owned state only. Then restrict any remaining runtime/control ignore rules to actual pipeline-owned locations so arbitrary repo files named status.json are still counted as meaningful changes.

91. fnd_sig-feat-service-43984fffc4-98b9_730b744e17 - keep, fix
    Decision: Real approval signal bug. emitExisting can turn an absent approval state file into a fatal signal.
    Fix direction: Treat ENOENT as pending/absent and reserve fatal signals for corrupted or unreadable files that actually exist.

92. fnd_sig-feat-service-5696822083-731d_74e24b5616 - keep, fix
    Decision: Real alert-gating bug. discordEmbeds can bypass configured level-based Discord alert gating.
    Fix direction: Apply the same level gate in discordEmbeds before webhook delivery, while keeping audit behavior separate if needed.

93. fnd_sig-feat-service-86a35b1a93-7380_ef998afe50 - keep, fix
    Decision: Real git verification bug. Git sync verifies/stores shortened hash instead of comparing full actual HEAD to requested commit.
    Fix direction: Resolve full HEAD after reset, compare to full target hash, and keep shortened hashes only for display.

94. fnd_sig-feat-service-86a35b1a93-dc6d_da073075a1 - keep, fix
    Decision: Real timeout classification bug. Timeout monitor results can be republished as non-timeout agent outcomes.
    Fix direction: Normalize hard-deadline monitor reasons to explicit TIMEOUT outcomes while preserving monitor reason details.

95. fnd_sig-feat-service-899c764b9b-3b26_63e2ff26dc - keep, fix
    Decision: Real truth-drift bug. Malformed completion entries with missing status can be skipped instead of reported as drift.
    Fix direction: Adjudicate whenever Redis completion evidence exists, or emit explicit malformed-completion drift for missing/empty/null status.

96. fnd_sig-feat-service-8a1f59ceda-1b62_4babdf9b34 - keep, fix
    Decision: Real rate-limit identity bug. Tracked gate identity is not used when raw poll opts omit gate id.
    Fix direction: Build rate-limit identity from resolved telemetry/tracked identity, preserving gate id and gate type.

97. fnd_sig-feat-service-8a1f59ceda-1c2e_797d72bf18 - keep, fix
    Decision: Real lifecycle metadata bug. Generic poller drops rate-limit lifecycle mutation metadata.
    Fix direction: Preserve lifecycleMutation through PollResult wrapping or require rate-limit checks to return full result objects.

98. fnd_sig-feat-service-8a1f59ceda-71e9_68e0a486ef - keep, fix
    Decision: Real timeout evidence bug. Session timeout can report no changes even after observed work.
    Fix direction: On timeout, perform final HEAD/worktree signature check and return hasChanges true when work was observed.

99. fnd_sig-feat-service-a85bf60e69-8c51_f94d00d26e - keep, fix
    Decision: Real active-session race. Cleanup for an old gate session can delete a newer session record.
    Fix direction: Make cleanup identity-aware and unlink only when stored strong identity matches the session being cleared.

100. fnd_sig-feat-service-b1adbcd40d-94ea_03f1c9a982 - keep, fix
    Decision: Real failure-handling bug. Unknown Buster poll failures can build an invalid control result and throw; unknown infrastructure/poll failures should become BLOCKED.
    Fix direction: Assign fallback failures a non-null failure class such as unclassified_failure and return a typed BLOCKED/error result.

101. fnd_sig-feat-service-bef2f303ad-1996_4417af292e - keep, fix
    Decision: Real audit durability bug. One failed Discord audit target can prevent writes to remaining targets.
    Fix direction: Handle append failures per target, continue writing remaining targets, and report failed targets after the loop.

102. fnd_sig-feat-service-bf7d898157-9d53_780dfe29e2 - keep, fix
    Decision: Real wait lifecycle bug. Gate wait refs ignore attempt and collapse retries through shared idempotency keys.
    Fix direction: Include attempt in wait_ref/resume_signal_ref/idempotency keys or make waits explicitly single-shot.

103. fnd_sig-feat-test-suite-77bede17d2-1_287f872294 - keep, fix
    Decision: Real Kubernetes test bug. Namespace construction uses unsanitized project names.
    Fix direction: Normalize project segment to lowercase DNS-safe label, collapse invalid chars, trim hyphens, and enforce Kubernetes length limits.

104. fnd_sig-feat-test-suite-77bede17d2-3_814d773684 - keep, fix
    Decision: Real secret reference bug. Build secret injection can satisfy a secretKeyRef from the wrong Secret.
    Fix direction: Validate provided Secret metadata.name against secretKeyRef.name or support an explicit Secret map and fail unmatched refs.

105. fnd_sig-feat-test-suite-77bede17d2-b_2cf3c5c8b9 - keep, fix
    Decision: Real API suite templating bug. Default API headers are not interpolated or checked for missing template variables.
    Fix direction: Interpolate defaults.headers with auth variables and include them in missing-template validation.

106. fnd_sig-feat-test-suite-77bede17d2-e_7671149f5b - keep, fix
    Decision: Real concurrent artifact bug. Lighthouse reports can be corrupted by concurrent perf suites sharing scratch paths.
    Fix direction: Use per-run scratch paths under testsLogDir or mkdtemp and clean stale scratch before each Lighthouse run.
