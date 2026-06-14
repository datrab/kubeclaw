export async function registerRepoDocsArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
await record('behavior verification doc reflects the live repo-based workflow', async () => {
  const behaviorDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'behavior-verification.md'), 'utf8');
  const verificationReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'README.md'), 'utf8');
  const statusArtifactsReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'reference', 'status-and-artifacts.md'), 'utf8');
  const modulesAndGatesDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline', 'modules-and-gates.md'), 'utf8');

  assert.equal(behaviorDoc.includes('use the live repo root as the source of truth'), true);
  assert.equal(statusArtifactsReference.includes('`.swarm/<gate_id>-gate-status.json`'), true, 'status/artifact reference must list approval gate persisted state');
  assert.equal(modulesAndGatesDoc.includes('persist approval state in `.swarm/<gate_id>-gate-status.json`'), true, 'modules/gates docs must list approval gate persisted state');
  assert.equal(behaviorDoc.includes('`<repo-root>/docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`'), true);
  assert.equal(behaviorDoc.includes('treat `docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` as the authoritative inventory, stream-identity, and contract-boundary spec'), true);
  assert.equal(behaviorDoc.includes('treat `docs/archive/legacy-root-docs/telemetry-event-schema.md` as the authoritative event-by-event payload reference, kept in exact inventory parity with that contract'), true);
  assert.equal(behaviorDoc.includes('`pipeline:telemetry:<project>:<run_id>`'), true);
  assert.equal(behaviorDoc.includes('latest repo-truth rerun against live repo root passed for the no-launch verification stack used during harness recovery'), true);
  assert.equal(behaviorDoc.includes('default behavior harness coverage currently spans `33` areas'), true);
  assert.equal(behaviorDoc.includes('exact pass totals should be taken from the live JSON output of `tests/verification/behavior/verify.mjs`, not from a stale static doc snapshot'), true);
  assert.equal(behaviorDoc.includes('`tests/verification/run-full-verification.sh` is the canonical fail-fast local wrapper'), true);
  assert.equal(behaviorDoc.includes('it includes deployment truth, runtime collision, live subagent launch smoke, telemetry contract, focused contract guards, and the default behavior harness'), true);
  assert.equal(behaviorDoc.includes('ACP launch reachability is local/provider-specific and is run explicitly with `tests/verification/run-local-acp-verification.sh`'), true);
  assert.equal(behaviorDoc.includes('ACP failures mean local ACP agent/provider/gateway status setup needs attention; they do not by themselves make deterministic repo verification red'), true);
  assert.equal(behaviorDoc.includes('because the wrapper stops on the first red surface, rerun the underlying entrypoints directly when you need the full downstream failure set'), true);
  assert.equal(behaviorDoc.includes('contract and telemetry schema now pin an explicit authority split: contract owns canonical inventory and boundaries, schema owns event-by-event payload reference'), true);
  assert.equal(behaviorDoc.includes('deprecated no-op event surfaces `memory.recalled`, `buster.result`, and `redis.message` are removed from canonical runtime and contract expectations'), true);
  assert.equal(behaviorDoc.includes('live webhook delivery muted during generic verification runs'), true);
  assert.equal(behaviorDoc.includes('lifecycle contract docs no longer keep stale explicit `buster:telemetry:<project>:<run_id>` compatibility literals after the single-canonical-stream decision'), true);
  assert.equal(behaviorDoc.includes('stale session recovery alerts keep the recovered child `session_key` on operator Discord surfaces so restart cleanup stays cross-surface joinable'), true);
  assert.equal(behaviorDoc.includes('Nova injection sent/failed alerts keep the owning child `session_key` on operator Discord surfaces so escalation and channel-injection audit trails stay joinable'), true);
  assert.equal(behaviorDoc.includes('Failure-service module retry, BLOCKED, NEEDS_NOVA, and Nova injection Discord alerts now also preserve the tracked or cached `gateway_label`, keeping those escalation/operator surfaces label-joinable with the owning module session telemetry'), true);
  assert.equal(behaviorDoc.includes('Pipeline-runner single-module completion, resumed-BLOCKED, and generic halt Discord alerts now also preserve resolved `gateway_label` values from returned results or persisted module state, keeping terminal operator surfaces label-joinable with the owning module or gate session telemetry'), true);
  assert.equal(behaviorDoc.includes('Resumed-BLOCKED module-runner returns now also preserve resolved `gateway_label` alongside the persisted `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova re-enters a module that was already blocked earlier'), true);
  assert.equal(behaviorDoc.includes('Blueprint-release `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key` when present, so terminal pipeline-runner stop alerts stay joinable on architecture-branch release failures too'), true);
  assert.equal(behaviorDoc.includes('Forge-phase `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when rate-limit pauses are exhausted after Forge has already claimed session ownership'), true);
  assert.equal(behaviorDoc.includes('Pre-dispatch Buster config-validation `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova refuses to queue tests because project config is invalid'), true);
  assert.equal(behaviorDoc.includes('Buster-phase `EXIT_RATE_LIMITED` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when rate-limit pauses are exhausted during Buster polling'), true);
  assert.equal(behaviorDoc.includes('Buster crash-exhausted `EXIT_BLOCKED` returns now also preserve canonical `dispatch_id` alongside the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, and the integrated `module-failures.mjs` runtime harness now pins that stop payload plus neighboring FAIL/BLOCKED/`retry.exhausted` telemetry correlation end to end, so terminal pipeline-runner stop alerts stay joinable when repeated Buster infrastructure crashes block the module before Forge can help without relying on brittle source-text assertions'), true);
  assert.equal(behaviorDoc.includes('Buster pre-test infra/config `EXIT_NEEDS_NOVA` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova preserves Forge output and stops before another code cycle'), true);
  assert.equal(behaviorDoc.includes('Repeated Buster pre-test `EXIT_NEEDS_NOVA` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when the same pre-test suite fails again and Nova escalates before another Forge cycle'), true);
  assert.equal(behaviorDoc.includes('Dependency-check EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when module execution is refused before any attempt starts'), true);
  assert.equal(behaviorDoc.includes('Corrupt lifecycle-state load EXIT_ERROR returns now also preserve salvaged `gateway_label` and `session_key` from the unreadable lifecycle-backed module state, so terminal pipeline-runner stop alerts stay joinable even when Nova aborts to avoid overwriting existing work'), true);
  assert.equal(behaviorDoc.includes('Module-runner Forge and Buster spawn-failed exits now preserve returned `gateway_label` and `session_key`, so the terminal pipeline-runner stop alerts stay joinable with the owning module attempt even when the failure happens before normal polling begins'), true);
  assert.equal(behaviorDoc.includes('Forge and Buster prompt-build EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts keep canonical module correlation even when execution fails before any child session is spawned'), true);
  assert.equal(behaviorDoc.includes('Validation-milestone refusal before Buster dispatch now also preserves resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts keep canonical module correlation when Nova aborts before the Git handoff'), true);
  assert.equal(behaviorDoc.includes('Git sync before Buster EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable with the owning module attempt when the Forge to Buster handoff fails'), true);
  assert.equal(behaviorDoc.includes('Forge-phase polling git EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Forge fails closed during post-spawn git synchronization'), true);
  assert.equal(behaviorDoc.includes('Buster-phase polling git EXIT_ERROR returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster fails closed during polling-side git synchronization'), true);
  assert.equal(behaviorDoc.includes('Fallback unexpected-status EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable even when the module ends in an unrecognized persisted state'), true);
  assert.equal(behaviorDoc.includes('Buster gate config-invalid `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when gate execution is refused before any Buster child session is spawned'), true);
  assert.equal(behaviorDoc.includes('Buster gate spawn-failed `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the gate cannot launch its Buster worker at all'), true);
  assert.equal(behaviorDoc.includes('Buster gate parse-corrupted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the gate status file is permanently unreadable'), true);
  assert.equal(behaviorDoc.includes('Buster gate timeout `EXIT_TIMEOUT` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Buster gate times out after session ownership is known'), true);
  assert.equal(behaviorDoc.includes('Buster gate git-error `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when polling-side git synchronization fails closed during gate execution'), true);
  assert.equal(behaviorDoc.includes('Buster gate rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster gate cooldown pauses are exhausted'), true);
  assert.equal(behaviorDoc.includes('Buster gate no-fix-loop `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when a Buster gate fails without an auto-fix cycle configured'), true);
  assert.equal(behaviorDoc.includes('Buster gate fix-loop-exhausted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster gate retries consume every configured fix attempt'), true);
  assert.equal(behaviorDoc.includes('Buster gate fix rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Forge auto-fix session itself exhausts cooldown pauses'), true);
  assert.equal(behaviorDoc.includes("Full-pipeline BLOCKED halt/escalation surfaces resolve the blocked module's persisted `session_key` from lifecycle-backed module state, so operator Discord alerts and stop-path telemetry stay joinable even when the runner only knows it is resuming a previously BLOCKED module"), true);
  assert.equal(behaviorDoc.includes('Buster agent-test failure paths now preserve the cached child `session_key` through failure-service Discord, retry, escalation, and returned result payloads even after `active_agent` cleanup, so Buster-owned FAIL / NEEDS_NOVA surfaces remain joinable with the completed child session'), true);
  assert.equal(behaviorDoc.includes('Approval gates normalize lower-case config `on_timeout` into canonical uppercase `timeout_policy` across gate state, approval audit artifacts, and emitted `approval.requested` telemetry so runtime behavior matches the published contract'), true);
  assert.equal(behaviorDoc.includes('Service-owned pipeline review and case-study ACP cooldown exhaustion now also emit structured `retry.exhausted` telemetry with preserved `session_key`, so those post-run operator-facing failures no longer fall back to pause telemetry plus Discord/log text alone'), true);
  assert.equal(behaviorDoc.includes('Gate-owned pause-budget and fix-budget exhaustion paths now also emit structured gate-scoped `retry.exhausted` telemetry with preserved `gate_id`, `gate_type`, and `session_key`, so Buster/Review gate cooldown exhaustion and fix-loop exhaustion no longer end at `gate.verdict` plus exit code alone'), true);
  assert.equal(behaviorDoc.includes('Service-owned pipeline review now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: pipeline_review`, preserved `session_key`, and terminal `status` / `reason` on cooldown-budget exhaustion and no-output failure paths, so that post-run review surface no longer drops back to Discord/log text alone outside the `retry.exhausted` branch'), true);
  assert.equal(behaviorDoc.includes('Service-owned case study now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: case_study`, preserved `session_key`, and terminal `status` / `reason` on cooldown-budget exhaustion and no-output failure paths, so that post-run case-study generation no longer drops back to Discord/log text alone outside the `retry.exhausted` branch'), true);
  assert.equal(behaviorDoc.includes('Service-owned project summary now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: project_summary`, terminal `status` / `reason`, and emitted artifact paths when written, so that local summary generation no longer disappears into log text and side files alone on success or failure'), true);
  assert.equal(behaviorDoc.includes('Service-owned case-study no-output and generic failure alerts now also flow through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring, preserved `run_id`, tracked `gateway_label`, and `session_key` correlation, so post-run case-study failures no longer fall back to logs plus summary telemetry alone once the child session finishes without a usable report'), true);
  assert.equal(behaviorDoc.includes('Local project-summary generation failures now also emit a canonical operator Discord alert with persisted `discord.jsonl` mirroring, preserved `run_id`, and run-scoped artifact-path context, so local summary failures no longer disappear into `summary.completed` plus warn logs without an operator-facing audit surface'), true);
  assert.equal(behaviorDoc.includes('The standalone `tools/project-summary.ts --discord` path now also routes through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring and preserved `run_id` correlation when a run context is available, instead of bypassing the hardened audit and observability path with a raw webhook-only fetch'), true);
  assert.equal(behaviorDoc.includes('Redis-dispatched Buster task alerts now also route through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring and preserved `run_id`, `module`, `attempt`, and `dispatch_id` correlation when that task context is known, instead of bypassing the shared audit path with a raw webhook-only fetch'), true);
  assert.equal(behaviorDoc.includes('Shared pipeline Discord webhook delivery failures now also emit explicit `observability.degraded` telemetry on the `webhook` surface with preserved module, gate, and session correlation when known, so live operator-visibility loss no longer collapses into warn-only logging when `discord.jsonl` keeps writing but Discord posting fails'), true);
  assert.equal(behaviorDoc.includes('That same shared pipeline Discord delivery path now emits matching `observability.restored` telemetry after a later successful webhook post for the same run, so recovery of the live operator surface is explicit instead of being inferred only from resumed message flow'), true);
  assert.equal(behaviorDoc.includes('Shared pipeline Discord webhook degraded/restored observability now also preserves tracked `gateway_label`, `attempt`, and `dispatch_id` when those join keys are already present on the owning operator alert, so visibility incidents stay directly joinable with the same Discord and telemetry surfaces instead of collapsing back to module or gate identity alone'), true);
  assert.equal(behaviorDoc.includes('Shared pipeline Discord audit-log mirroring now also emits explicit `observability.degraded` / `observability.restored` telemetry on the `audit_log` surface with preserved gate, session, gateway-label, attempt, and dispatch correlation when known, so silent `discord.jsonl` write failures no longer break replay joins without an explicit operator-visible visibility incident'), true);
  assert.equal(behaviorDoc.includes('Shared ACP observability degraded/restored telemetry now also preserves tracked `gateway_label`, `attempt`, and `dispatch_id` across polling, health-check, and stale-recovery paths when known, so gateway and transcript visibility incidents stay directly joinable with the owning session attempt instead of forcing operators to infer that correlation from neighboring events'), true);
  assert.equal(behaviorDoc.includes('Gate-owned session-backed `agent.spawned` / `agent.killed` lifecycle telemetry now also preserves canonical `gate_type` and `dispatch_id` when orchestration knows them, so reviewer and Forge gate-fix lifecycle events stay joinable with the surrounding gate-owned observability and operator surfaces instead of dropping that identity back to label plus `gate_id` alone'), true);
  assert.equal(behaviorDoc.includes('Gate-backed orchestration-owned Forge and reviewer spawn/spawn-failure Discord alerts now also preserve canonical `gate_type` and `dispatch_id` when known, so those lifecycle audit surfaces stay joinable with the same gate-owned telemetry and webhook-observability incidents instead of flattening back to run plus `gate_id` alone'), true);
  assert.equal(behaviorDoc.includes('Gate-owned ACP health-check and teardown-monitor `observability.degraded` / `observability.restored` events now also preserve canonical `gate_type`, so gateway and transcript visibility incidents stay joinable with gate-owned verdict, Discord, and lifecycle surfaces instead of flattening back to `gate_id` alone'), true);
  assert.equal(behaviorDoc.includes('Gate-owned session-backed `agent.transcript` / `agent.progress` telemetry now also preserves canonical `gate_type` and `dispatch_id` when orchestration already knows them, so live review and gate-fix monitoring stays directly joinable with gate lifecycle, observability, and Discord audit surfaces instead of dropping back to `gate_id` plus session only'), true);
  assert.equal(behaviorDoc.includes('Session-backed ACP `rate_limit.detected` telemetry and polling-owned pause/resume Discord alerts now also preserve canonical `gate_type` and `dispatch_id` for gate-owned work when known, so operator-facing cooldown incidents stay directly joinable with the same gate lifecycle and live-session surfaces instead of flattening back to gate plus session alone'), true);
  assert.equal(behaviorDoc.includes('Gate-backed ACP session transcript and progress telemetry now preserve canonical `gate_id` plus `session_key` without overloading `module_id` with gate labels during live gate-fix monitoring, so those high-frequency live surfaces stay joinable with gate-scoped telemetry, Discord, and audit artifacts'), true);
  assert.equal(behaviorDoc.includes('Shared `pollForFile(...)` ACP sessions now emit live `agent.transcript` and `agent.progress` telemetry with preserved `session_key` and gate context when available, so review gates, pipeline review, and case-study runs no longer stay log-only until the output file appears or the session ends'), true);
  assert.equal(behaviorDoc.includes('Shared Forge completion polling now emits live `agent.transcript` and `agent.progress` telemetry with preserved `module_id`, `session_key`, and tracked session label correlation while Nova waits on the typed `forge-completion.json` artifact instead of any module-local status file'), true);
  assert.equal(behaviorDoc.includes('Restart-time stale module and gate reconciliation now also emits explicit gateway `observability.degraded` events when `session_status` is unreachable during stale-session recovery, so recovery-time visibility loss no longer collapses into silent kill-or-retry behavior'), true);
  assert.equal(behaviorDoc.includes('Session-backed `agent.spawned` and `agent.killed` lifecycle telemetry now both reuse the tracked ACP gateway label instead of the internal tracking key, keeping Forge and Echo session lifecycle labels aligned across spawn, live telemetry, and teardown'), true);
  assert.equal(behaviorDoc.includes('Session teardown now routes through a shared termination controller with an isolated hard-capped grace period and strict canonical `{confirmed, unconfirmed, terminal, cleanup*}` result schema, so orchestration, recovery, Buster monitors, and summary cleanup no longer synthesize split-brain kill state locally'), true);
  assert.equal(behaviorDoc.includes('Restart-time stale module and gate recovery Discord alerts plus persisted `discord.jsonl` audit entries now preserve the recovered ACP `gateway_label`, keeping operator recovery surfaces joinable with the same authoritative label already tracked in session state'), true);
  assert.equal(behaviorDoc.includes('Restart-time stale module recovery alerts now also preserve canonical `attempt`, while stale gate recovery alerts preserve canonical `attempt` plus `dispatch_id`, keeping recovery-time Discord and `discord.jsonl` surfaces joinable with the exact interrupted retry instead of only the recovered session label'), true);
  assert.equal(behaviorDoc.includes('Pipeline halt and escalation telemetry now also preserves canonical `attempt` plus `dispatch_id` when the terminal module or gate result already knows them, keeping stop-path live stream events directly joinable with the exact retry or gate dispatch instead of only the stopped step and session'), true);
  assert.equal(behaviorDoc.includes('The mirrored pipeline halt Discord and `discord.jsonl` stop surfaces now also preserve that same canonical `attempt` plus `dispatch_id` correlation on blocked, single-module, and gate-owned stop paths, keeping operator stop alerts aligned with the same retry identity already present in the authoritative stream'), true);
  assert.equal(behaviorDoc.includes('Those same stale gate recovery `observability.degraded` events now also preserve canonical `attempt` plus `dispatch_id` when the interrupted gate session already knew them, keeping recovery-time visibility loss directly joinable with the exact gate retry and dispatch instead of only the gate/session pair'), true);
  assert.equal(behaviorDoc.includes('Session-backed Forge and Echo spawn Discord alerts now also preserve the tracked ACP `gateway_label`, so operator-facing lifecycle alerts and persisted `discord.jsonl` audit entries stay label-joinable with the corresponding spawn telemetry'), true);
  assert.equal(behaviorDoc.includes('Session-backed ACP rate-limit pause/resume Discord alerts now also preserve the tracked gateway label, so operator cooldown surfaces stay label-joinable with the corresponding polling and lifecycle telemetry'), true);
  assert.equal(behaviorDoc.includes('Generic module rate-limit pause/resume Discord alerts now also preserve the tracked gateway label when active agent state already knows it, keeping cooldown surfaces aligned with the owning module session telemetry'), true);
  assert.equal(behaviorDoc.includes('Pipeline-review spawn, cooldown, completion, and failure Discord alerts now also preserve the tracked review label, keeping those operator surfaces joinable with the review session lifecycle and persisted audit entries'), true);
  assert.equal(behaviorDoc.includes('Case-study spawn, cooldown, completion, and exhaustion Discord alerts now also preserve the tracked case-study label, keeping those operator surfaces joinable with the case-study session lifecycle and persisted audit entries'), true);
  assert.equal(behaviorDoc.includes('Forge-owned module Discord alerts now also preserve the tracked gateway label when active module state already knows it, keeping module operator surfaces aligned with the owning Forge session telemetry'), true);
  assert.equal(behaviorDoc.includes('Buster-owned module Discord alerts now also preserve the dispatch-backed gateway label, keeping those operator surfaces aligned with the owning Buster dispatch/session telemetry'), true);
  assert.equal(behaviorDoc.includes('Approval-gate `approval.requested` and `approval.resolved` telemetry now also preserve canonical `gate_type`, so approval-specific live stream events stay joinable with the matching gate-owned verdict, Discord, and audit surfaces instead of dropping back to `gate_id` alone'), true);
  assert.equal(behaviorDoc.includes('Approval-gate authoritative state plus `approval-request.json` and `approval-decision.json` now also preserve canonical `gate_type`, so approval replay artifacts stay joinable with the matching live telemetry, Discord, and gate verdict surfaces instead of forcing operators to infer approval identity from path plus `gate_id` alone'), true);
  assert.equal(behaviorDoc.includes('Approval-gate `approval-transitions.jsonl` entries now also persist canonical `run_id`, `project`, `gate_id`, and `gate_type`, so state-change replay stays directly joinable with the rest of the approval audit bundle instead of relying on surrounding files for correlation'), true);
  assert.equal(behaviorDoc.includes('Buster gate pass, failure, rate-limit, blocked, and auto-fix Discord alerts now also preserve the dispatch-backed or tracked Forge fix gateway label, keeping those operator surfaces aligned with the owning Buster dispatch and Forge fix session telemetry'), true);
  assert.equal(behaviorDoc.includes('Review-gate lifecycle, GO/NO-GO, re-review, and blocked Discord alerts now preserve the tracked reviewer label, while review-fix loop alerts preserve the tracked Forge fix label, keeping those operator surfaces joinable with the owning Echo and Forge session lifecycles'), true);
  assert.equal(behaviorDoc.includes('Review gate rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Echo review cooldown pauses are exhausted'), true);
  assert.equal(behaviorDoc.includes('Review gate post-start failure `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Echo reviewer fails after session ownership is known'), true);
  assert.equal(behaviorDoc.includes('Review gate fix rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Forge review-fix session exhausts cooldown pauses'), true);
  assert.equal(behaviorDoc.includes('Review gate fix-loop-exhausted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when review fix cycles are exhausted and the gate remains NO-GO'), true);
  assert.equal(behaviorDoc.includes('Passed: `263`'), false);
  assert.equal(behaviorDoc.includes('Failed: `0`'), false);
  assert.equal(behaviorDoc.includes('kubeclaw-main-updated.zip'), false);
  assert.equal(behaviorDoc.includes('_audit_lifecycle_unification/rebuilt-artifact'), false);
  assert.equal(behaviorDoc.includes('/home/node/.openclaw/workspace/git-repo/TELEMETRY_CONTRACT_V1.md'), false);
  assert.equal(behaviorDoc.includes('`memory.recalled` verified compatibility-only and still a no-op exporter'), false);
  assert.equal(behaviorDoc.includes('Passed: `9`'), false);
  assert.equal(behaviorDoc.includes('Passed: `193`'), false);

  assert.equal(verificationReadme.includes('`docs/archive/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` remains the authoritative telemetry contract for canonical inventory, stream identity, and compatibility boundaries'), true);
  assert.equal(verificationReadme.includes('`docs/archive/legacy-root-docs/telemetry-event-schema.md` remains the event-by-event payload reference and stays in inventory parity with that contract'), true);
});

await record('verification docs and hardening trackers point at tests-owned verifier entrypoints, not stale scripts wrappers', async () => {
  const verificationReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'README.md'), 'utf8');
  const behaviorDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'behavior-verification.md'), 'utf8');
  const deploymentReadme = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'deployment', 'README.md'), 'utf8');
  const pipelineReadme = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'README.md'), 'utf8');
  const phase4Tracker = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PHASE4_EXECUTION_TRACKER.md'), 'utf8');
  const readinessChecklist = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_PRODUCTION_READINESS_CHECKLIST.md'), 'utf8');
  const openPoints = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_OPEN_POINTS.md'), 'utf8');
  const executionPlan = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'phase3', 'PHASE3_PHASE4_EXECUTION_PLAN.md'), 'utf8');
  const phasePlan = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PIPELINE_HARDENING_PHASE_PLAN.md'), 'utf8');
  const phaseCompletionChecklist = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'root-docs', 'archive', 'pipeline-hardening', 'pre-plugin', 'PHASE_COMPLETION_REVIEW_CHECKLIST.md'), 'utf8');

  assert.equal(fs.existsSync(path.join(sourceRoot, 'scripts', 'phase8-verify.mjs')), false);
  assert.equal(verificationReadme.includes('there is no remaining `scripts/*.mjs` verifier wrapper surface in this repo'), true);
  assert.equal(verificationReadme.includes('`scripts/` remains the home for operator utilities like `deploy.sh` and `setup.sh`, not the canonical verification entrypoints'), true);
  assert.equal(verificationReadme.includes('`scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface'), true);
  assert.equal(verificationReadme.includes('`tests/verification/run-full-verification.sh` is intentionally fail-fast; it exits on the first red surface'), true);
  assert.equal(verificationReadme.includes('if you need the full downstream failure set after a red wrapper run, rerun the canonical entrypoints directly'), true);
  assert.equal(verificationReadme.includes('subagent launch is part of the default clean-checkout wrapper'), true);
  assert.equal(verificationReadme.includes('ACP launch is a local-only provider/gateway smoke; failures remain real failures in `run-local-acp-verification.sh`, but do not fail the default clean-checkout wrapper'), true);
  assert.equal(verificationReadme.includes('`tests/verification/run-local-acp-verification.sh` is the explicit local ACP/provider smoke wrapper'), true);
  assert.equal(fs.existsSync(path.join(sourceRoot, 'tests', 'verification', 'run-local-acp-verification.sh')), true);
  assert.equal(verificationReadme.includes('live launch smokes are explicit gate surfaces, not implicit proof hidden inside the repo-only behavior harness'), false);
  assert.equal(verificationReadme.includes('`scripts/deploy.sh` remains tracked executable so that the canonical live deployment commands are directly runnable from the repo checkout'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/pipeline/latest.json` is the canonical pointer into the run-scoped replay bundle under `.swarm/logs/pipeline/runs/<run_id>/`'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` is the canonical replay/audit bundle for deploy, replay, and operator handoff evidence'), true);
  assert.equal(verificationReadme.includes('`.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus `.swarm/logs/pipeline/runs/<run_id>/redis/` remain the canonical Redis audit artifact layout'), true);
  assert.equal(verificationReadme.includes('the small verifier shims under `scripts/` are retired in this cleanup slice'), false);
  assert.equal(behaviorDoc.includes('treat `.swarm/logs/pipeline/latest.json` plus `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` as the canonical replay/audit bundle, with Redis audit artifacts also mirrored under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}`'), true);
  assert.equal(deploymentReadme.includes('live deployment/build/smoke commands live under `scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>`'), true);
  assert.equal(deploymentReadme.includes('destructive teardown commands live under `scripts/deploy.sh teardown`, `scripts/deploy.sh teardown-agents`, and `scripts/deploy.sh teardown-all`'), true);
  assert.equal(deploymentReadme.includes('`teardown` and `teardown-all` share one destructive implementation surface and differ only on whether the namespace is preserved or deleted'), true);
  assert.equal(deploymentReadme.includes('`scripts/deploy.sh` remains tracked executable so that canonical live deployment commands are directly runnable from the repo checkout'), true);
  assert.equal(deploymentReadme.includes('replay/audit artifacts live under `.swarm/logs/pipeline/latest.json` and the run-scoped `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` bundle'), true);
  assert.equal(deploymentReadme.includes('Redis audit artifacts remain under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}` plus the run-scoped `.swarm/logs/pipeline/runs/<run_id>/redis/` mirror'), true);
  assert.equal(pipelineReadme.includes('`scripts/deploy.sh build-local-images [tag]`, `scripts/deploy.sh verify-live [tag]`, and `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` are the canonical live deployment command surface; `.swarm/logs/pipeline/latest.json` plus the run-scoped audit bundle are the canonical replay/audit surface for that deployment path.'), true);
  assert.equal(phase4Tracker.includes('node scripts/phase8-verify.mjs'), false);
  assert.equal(phase4Tracker.includes('tests/verification/behavior/verify.mjs'), true);
  assert.equal(phase4Tracker.includes('Verification explainers and the pipeline README now also describe one canonical operator evidence split'), true);
  assert.equal(phase4Tracker.includes('Accepted Phase 4 items so far: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`.'), true);
  assert.equal(phase4Tracker.includes('Remaining Phase 4 blockers: `OP-DEP-03`.'), true);
  assert.equal(phase4Tracker.includes('Remaining Phase 4 blockers: `OP-PERF-01`, `OP-PERF-03`, `OP-DEP-03`, `OP-DEP-05`.'), false);
  assert.equal(phase4Tracker.includes('`OP-DEP-05` is accepted: deploy, replay, and audit evidence paths are now documented, aligned, and verifier-pinned on one canonical layout.'), true);
  assert.equal(openPoints.includes('**Decision:** Completed in current hardening round'), true);
  assert.equal(openPoints.includes('`OP-DEP-05` is accepted because deploy, replay, and audit provenance now point at one canonical layout across active operator docs, verification docs, and the main hardening trackers, with behavior verification still green.'), true);
  assert.equal(openPoints.includes('Accepted Phase 4 items so far: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(openPoints.includes('### Next focus after Phase 3 acceptance, remaining Phase 4 blockers\n- `OP-DEP-03`'), true);
  assert.equal(openPoints.includes('- `OP-DEP-05` artifact-path and docs provenance cleanup landed'), false);
  assert.equal(executionPlan.includes('Accepted Phase 4 items: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(phasePlan.includes('`OP-PERF-01` inefficient transcript polling (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('`OP-PERF-03` poll cadence / loop efficiency still needs hardening (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('`OP-DEP-05` source-to-artifact provenance cleanup (accepted 2026-04-16)'), true);
  assert.equal(phasePlan.includes('Remaining blocker before full Phase 4 acceptance: `OP-DEP-03`'), true);
  assert.equal(phasePlan.includes('`OP-DEP-05` messy source-to-artifact provenance'), false);
  assert.equal(phaseCompletionChecklist.includes('Accepted inside this Phase 4 scope already:\n- `OP-PERF-01`\n- `OP-PERF-02`\n- `OP-PERF-03`\n- `OP-DEP-02`\n- `OP-DEP-05`'), true);
  assert.equal(readinessChecklist.includes('retained only as a compatibility shim'), false);
  assert.equal(readinessChecklist.includes('`kubeclaw-main/scripts/*.mjs` wrappers remain in place as the stable operator and automation command surface'), false);
  assert.equal(readinessChecklist.includes('there is no remaining `scripts/phase8-verify.mjs`'), true);
  assert.equal(readinessChecklist.includes('`tests/verification/behavior/verify.mjs`'), true);
  assert.equal(readinessChecklist.includes('`tests/verification/deployment/check-deployment-truth.mjs`'), true);
  assert.equal(readinessChecklist.includes('Verification explainers and the pipeline README now describe the same canonical operator evidence split'), true);
  assert.equal(readinessChecklist.includes('Accepted items already covered inside Phase 4 scope: `OP-PERF-01`, `OP-PERF-02`, `OP-PERF-03`, `OP-DEP-02`, `OP-DEP-05`'), true);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: `OP-DEP-03`'), true);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: broader `OP-PERF-01`, `OP-PERF-03`, plus `OP-DEP-03`'), false);
  assert.equal(readinessChecklist.includes('Still blocking Phase 4 acceptance: broader `OP-PERF-01`, `OP-PERF-03`, plus `OP-DEP-03` and `OP-DEP-05`'), false);
});

await record('packaging verification doc reflects the live repo-based workflow', async () => {
  const packagingDoc = fs.readFileSync(path.join(sourceRoot, 'tests', 'verification', 'packaging-verification.md'), 'utf8');

  assert.equal(packagingDoc.includes('use the live repo root as the source of truth'), true);
  assert.equal(packagingDoc.includes('stale unpacked audit artifacts as historical reference only, not authoritative evidence'), true);
  assert.equal(packagingDoc.includes('`check-runtime-collisions.mjs` against the current repo, not historical rebuilt-artifact trees'), true);
  assert.equal(packagingDoc.includes('general image collisions: `0`'), true);
  assert.equal(packagingDoc.includes('broken packaged relative imports: `0`'), true);
  assert.equal(packagingDoc.includes('kubeclaw-main-updated.zip'), false);
  assert.equal(packagingDoc.includes('_audit_lifecycle_unification/rebuilt-artifact'), false);
  assert.equal(packagingDoc.includes('/home/node/.openclaw/workspace/git-repo/kubeclaw-main'), false);
});

await record('active suite and summary defaults use shared repo and config authority', async () => {
  const projectSummary = readOverlayText(sourceRoot, overlayRoot, 'skills/nova/pipeline/tools/project-summary.ts');
  const repoPaths = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/suites/repo-paths.ts');

  assert.equal(projectSummary.includes('function discoverDefaultRepoDir() {'), false);
  assert.equal(projectSummary.includes('function discoverDefaultConfigPath(repoDir) {'), false);
  assert.equal(projectSummary.includes('const SOURCE_REPO_DIR ='), false);
  assert.equal(projectSummary.includes("import { getRepoRoot } from '../core/git-context.ts';"), true);
  assert.equal(projectSummary.includes("import { loadPlatformSwarmConfig } from '../core/platform-config.ts';"), true);
  assert.equal(projectSummary.includes("const repoDir    = validateAllowedPath(resolveRepoDir(opts.repoDir), 'project-summary.repoDir');"), true);

  assert.equal(repoPaths.includes("import { getRepoRoot } from '../git-primitives.ts';"), true);
  assert.equal(repoPaths.includes('export function resolveRepoDir(startDir: unknown = null): string {'), true);
  assert.equal(repoPaths.includes('return startDir ? getRepoRoot(startDir) : getRepoRoot();'), true);
  assert.equal(repoPaths.includes('export const REPO_DIR = resolveRepoDir();'), true);
  assert.equal(repoPaths.includes('function discoverDefaultRepoDir()'), false);

  for (const relPath of [
	    'skills/buster/pipeline/suites/api.ts',
	    'skills/buster/pipeline/suites/build.ts',
	    'skills/buster/pipeline/suites/e2e.ts',
	    'skills/buster/pipeline/suites/manifest.ts',
	    'skills/buster/pipeline/suites/unit.ts',
	    'skills/buster/pipeline/suites/visual-reg.ts',
	  ]) {
    const fileText = readOverlayText(sourceRoot, overlayRoot, relPath);
    assert.equal(fileText.includes('/home/node/.openclaw/workspace/git-repo'), false);
	    assert.equal(fileText.includes("./repo-paths.ts"), true);
	  }
	  const healthSuite = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/pipeline/suites/health.ts');
	  assert.equal(healthSuite.includes('/home/node/.openclaw/workspace/git-repo'), false);
	});

await record('project-summary fallback stays source-relative while Buster suite root is canonical', async () => {
  const repoPaths = fs.readFileSync(path.join(sourceRoot, 'skills', 'buster', 'pipeline', 'suites', 'repo-paths.ts'), 'utf8');
  const projectSummary = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'project-summary.ts'), 'utf8');

  assert.equal(repoPaths.includes('export const REPO_DIR = resolveRepoDir();'), true);
  assert.equal(repoPaths.includes("import { getRepoRoot } from '../git-primitives.ts';"), true);
  assert.equal(repoPaths.includes('/home/node/.openclaw/workspace/git-repo'), false);
  assert.equal(projectSummary.includes('/home/node/.openclaw/workspace/git-repo'), false);
  assert.equal(repoPaths.includes('fileURLToPath(import.meta.url)'), false);
  assert.equal(projectSummary.includes('fileURLToPath(import.meta.url)'), true);
});

await record('operator-facing visual regression docs avoid host-specific baseline evidence paths', async () => {
  const busterReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'buster-test-platform-reference-v2.md'), 'utf8');

  assert.equal(busterReference.includes('"baseline_path": "<project-root>/.swarm/modules/15/baselines/baseline.png"'), true);
  assert.equal(busterReference.includes('"baseline_path": "/home/node/.openclaw/workspace/git-repo/.swarm/modules/15/baselines/baseline.png"'), false);
});

await record('pre-check semgrep config docs and defaults pin OpenClaw home platform paths', async () => {
  const lintReportOutput = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'output.ts'), 'utf8');
  const lintReportDiscovery = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'discovery.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const swarmConfig = fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8');

  assert.equal(lintReportOutput.includes('default: auto-detect'), true);
  assert.equal(lintReportDiscovery.includes("'/home/node/.openclaw/.semgrep.yml'"), true);
  assert.equal(lintReportOutput.includes('default: /home/node/.openclaw/.semgrep.yml'), false);
  assert.equal(pipelineConfigReference.includes('/home/node/.openclaw/.semgrep.yml'), true);
  assert.equal(pipelineConfigReference.includes('| `semgrep_config_path` | `auto-detect` |'), true);
  assert.equal(swarmConfig.includes('/home/node/.openclaw/.semgrep.yml'), false);
});

await record('portable semgrep docs match runtime discovery order', async () => {
  const lintReportRegistry = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'tool-registry.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');

  assert.equal(lintReportRegistry.includes('/home/node/.openclaw/.semgrep.yml'), true);
  assert.equal(lintReportRegistry.includes('SWARM_CONFIG-adjacent .semgrep.yml fallback'), true);
  assert.equal(lintReportRegistry.includes('Semgrep config missing or invalid'), true);
  assert.equal(lintReportRegistry.includes('<repo>/.semgrep.yml (tooling-only legacy repo config fallback)'), false);
  assert.equal(pipelineConfigReference.includes('Suche zuerst unter `/home/node/.openclaw/.semgrep.yml`, dann neben `SWARM_CONFIG`'), true);
  assert.equal(pipelineConfigReference.includes('`~/.openclaw/.semgrep.yml`'), false);
  assert.equal(pipelineConfigReference.includes('`<repo>/.semgrep.yml`'), false);
  assert.equal(pipelineConfigReference.includes('`charts/kubeclaw/files/config/.semgrep.yml`'), true);
  assert.equal(pipelineConfigReference.includes('`.swarm/.semgrep.yml`'), false);
});

await record('platform swarm config discovery is runtime-config first with explicit SWARM_CONFIG override', async () => {
  const coreConfig = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'config.ts'), 'utf8');
  const platformConfig = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'platform-config.ts'), 'utf8');
  const lintReportDiscovery = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'tools', 'lint-report', 'discovery.ts'), 'utf8');
  const cli = fs.readFileSync(path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'cli.ts'), 'utf8');
  const pipelineConfigReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'PIPELINE-CONFIG-REFERENCE.md'), 'utf8');
  const configurationReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'configuration-reference.md'), 'utf8');
  const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'archive', 'legacy-root-docs', 'pipeline-reference-v10.md'), 'utf8');
  const swarmConfig = fs.readFileSync(path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json'), 'utf8');
  const configMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/config.ts');

  assert.equal(coreConfig.includes('loadPlatformSwarmConfig'), true);
  assert.equal(platformConfig.includes('export function discoverPlatformSwarmConfigCandidates() {'), true);
  assert.equal(platformConfig.includes("'/home/node/.openclaw/swarm.config.json'"), true);
  assert.equal(platformConfig.includes('SOURCE_SWARM_CONFIG'), false);
  assert.equal(platformConfig.includes('Swarm config missing:'), true);
  assert.equal(platformConfig.includes('Swarm config invalid:'), true);
  assert.equal(lintReportDiscovery.includes("import { discoverPlatformSwarmConfigCandidates } from '../../core/platform-config.ts';"), true);
  assert.equal(lintReportDiscovery.includes('SOURCE_SWARM_CONFIG'), false);
  assert.equal(cli.includes('/home/node/.openclaw/swarm.config.json (SWARM_CONFIG secondary candidate)'), true);
  assert.equal(pipelineConfigReference.includes('`/home/node/.openclaw/swarm.config.json`'), true);
  assert.equal(pipelineConfigReference.includes('`SWARM_CONFIG` als Fallback'), false);
  assert.equal(configurationReference.includes('| `SWARM_CONFIG` | fallback for `/home/node/.openclaw/swarm.config.json` |'), false);
  assert.equal(pipelineReferenceV10.includes('/home/node/.openclaw/swarm.config.json'), true);
  assert.equal(pipelineReferenceV10.includes('auto-detected swarm.config.json'), false);
  assert.equal(swarmConfig.includes('/home/node/.openclaw/swarm.config.json'), true);
  assert.equal(swarmConfig.includes('portable platform auto-detect'), false);

  const previousSwarmConfig = process.env.SWARM_CONFIG;
  const overrideConfigPath = path.join(os.tmpdir(), `swarm-config-override-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
	    process.env.SWARM_CONFIG = overrideConfigPath;
	    const candidates = configMod.discoverPlatformSwarmConfigCandidates();
	    assert.deepEqual(candidates, [path.resolve('/home/node/.openclaw/swarm.config.json'), path.resolve(overrideConfigPath)]);
	    assert.equal(candidates.some(candidate => candidate.includes('charts/kubeclaw/files/config/swarm.config.json')), false);
  } finally {
    if (previousSwarmConfig === undefined) delete process.env.SWARM_CONFIG;
    else process.env.SWARM_CONFIG = previousSwarmConfig;
  }

  const firstMissing = path.join(os.tmpdir(), `swarm-config-missing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const firstExisting = path.join(os.tmpdir(), `swarm-config-existing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(firstExisting, '{"ok":true}\n');
  try {
    assert.equal(configMod.discoverSwarmConfigPath([firstMissing, firstExisting]), path.resolve(firstExisting));
    fs.rmSync(firstExisting, { force: true });
    assert.equal(configMod.discoverSwarmConfigPath([firstMissing, firstExisting]), path.resolve(firstMissing));
  } finally {
    fs.rmSync(firstExisting, { force: true });
  }
});
}
