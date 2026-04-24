import {
  assertTelemetrySchemaHotspotAuthority,
  extractContractEventNames,
  extractTelemetrySchemaEventNames,
} from '../../lib/lifecycle-audit-lib.mjs';

export async function registerTelemetrySchemaArea({
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
await record('telemetry schema keeps canonical event inventory aligned with lifecycle contract', async () => {
  const telemetrySchemaPath = path.join(sourceRoot, 'docs', 'telemetry-event-schema.md');
  const contractEvents = extractContractEventNames(contractPath);
  const schemaEvents = extractTelemetrySchemaEventNames(telemetrySchemaPath);

  const missingSchemaEvents = [...contractEvents].filter((name) => !schemaEvents.has(name)).sort();
  const staleSchemaEvents = [...schemaEvents].filter((name) => !contractEvents.has(name)).sort();

  assert.deepEqual(
    missingSchemaEvents,
    [],
    `telemetry schema missing canonical event sections: ${missingSchemaEvents.join(', ')}`,
  );
  assert.deepEqual(
    staleSchemaEvents,
    [],
    `telemetry schema documents non-canonical event sections: ${staleSchemaEvents.join(', ')}`,
  );
});

await record('telemetry schema locks authoritative field tables for hotspot payload shapes', async () => {
  const telemetrySchemaPath = path.join(sourceRoot, 'docs', 'telemetry-event-schema.md');
  assert.doesNotThrow(() => assertTelemetrySchemaHotspotAuthority(telemetrySchemaPath));
});

await record('telemetry schema explains effective pipeline.started project model defaults', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('`models` carries the effective project-level per-agent defaults after applying legacy top-level `models` plus `defaults.models`, with `defaults.models` winning for any overlapping agent key.'), true);
});

await record('telemetry schema documents Buster child-session lifecycle under agent.spawned and agent.killed', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  const busterPipeline = readOverlayText(sourceRoot, overlayRoot, 'skills/buster/buster-pipeline.js');
  assert.equal(telemetrySchema.includes('Session-backed agent lifecycle event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawns after a successful task decision. Redis-dispatched Buster work still emits `buster.task_started` / `buster.task_completed` for task-level lifecycle around that child-session work.'), true);
  assert.equal(telemetrySchema.includes('Session-backed agent termination event for ACP/subagent work such as Forge, Echo, and the child session that Buster spawned for a passing task. Redis-dispatched Buster work still emits `buster.task_completed` for task-level lifecycle, while `agent.killed` closes the child-session lifecycle when one existed.'), true);
  assert.equal(telemetrySchema.includes('Redis-dispatched Buster work uses `buster.task_started` / `buster.task_completed` instead of `agent.spawned`.'), false);
  assert.equal(telemetrySchema.includes('Redis-dispatched Buster work uses `buster.task_completed` instead of `agent.killed`.'), false);
  assert.equal(telemetrySchema.includes('When the spawned or terminated session belongs to gate-owned work and Nova already knows that gate identity, both lifecycle events also preserve canonical `gate_type` and `dispatch_id` join keys alongside `gate_id`, `attempt`, and `session_key`.'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "review"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-review-06-1"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:forge:session123"'), true);
  assert.equal(telemetrySchema.includes('When the orchestrator knows the terminated session identity, `agent.killed` preserves the same top-level correlation fields used on `agent.spawned`, especially `session_key`.'), true);
  assert.equal(busterPipeline.includes("await emitEvent(tctx, 'agent.spawned'"), true);
  assert.equal(busterPipeline.includes("await emitEvent(tctx, 'agent.killed'"), true);
});

await record('telemetry schema documents the current pipeline.halted payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "pipeline.halted"'), true);
  assert.equal(telemetrySchema.includes('"reason": "BLOCKED"'), true);
  assert.equal(telemetrySchema.includes('"module_id": "06"'), true);
  assert.equal(telemetrySchema.includes('"gate_id": null'), true);
  assert.equal(telemetrySchema.includes('"attempt": 3'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "buster-dispatch-06-attempt-3"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "buster-dispatch-06-attempt-3"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:forge:session123"'), true);
  assert.equal(telemetrySchema.includes('When the halt is tied to a live module or gate session, `session_key` preserves that cross-surface correlation key.'), true);
  assert.equal(telemetrySchema.includes('When the terminal result already knows the retry identity, the halt also preserves canonical `attempt`, `dispatch_id`, and `gateway_label` so the stop-path event stays joinable with the exact retry or gate dispatch.'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "review"'), true);
  assert.equal(telemetrySchema.includes('When the halt is gate-owned and Nova knows the dispatched gate type, the event also preserves `gate_type`'), true);
  assert.equal(telemetrySchema.includes('"step_type": "arch_validation"'), true);
  assert.equal(telemetrySchema.includes('"step_id": "arch-validation"'), true);
  assert.equal(telemetrySchema.includes('"exit_reason": "NEEDS_NOVA: module 06 failed after 3 attempts"'), false);
  assert.equal(telemetrySchema.includes('"halted_at_module": "06"'), false);
  assert.equal(telemetrySchema.includes('"halted_at_gate": null'), false);
});

await record('telemetry schema documents the current error.escalation payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "error.escalation"'), true);
  assert.equal(telemetrySchema.includes('"attempt": 3'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "buster-dispatch-06-attempt-3"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "buster-dispatch-06-attempt-3"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:forge:session123"'), true);
  assert.equal(telemetrySchema.includes('When escalation is tied to a live module or gate session, `session_key` preserves the same session correlation used on Discord and the surrounding lifecycle events.'), true);
  assert.equal(telemetrySchema.includes('When the terminal result already knows the retry identity, the escalation also preserves canonical `attempt`, `dispatch_id`, and `gateway_label` so the stop-path event stays joinable with the exact retry or gate dispatch.'), true);
  assert.equal(telemetrySchema.includes('When the escalation is gate-owned and Nova knows the dispatched gate type, the event also preserves `gate_type`'), true);
  assert.equal(telemetrySchema.includes('"last_failure": "Review gate needs Nova guidance"'), true);
  assert.equal(telemetrySchema.includes('"last_failure": "forge failed: TypeScript compilation errors in websockets/exec.py"'), true);
  assert.equal(telemetrySchema.includes('"action": "NEEDS_NOVA"'), true);
  assert.equal(telemetrySchema.includes('"step_type": "arch_validation"'), true);
  assert.equal(telemetrySchema.includes('"step_id": "arch-validation"'), true);
  assert.equal(telemetrySchema.includes('"error_type": "NEEDS_NOVA"'), false);
});

await record('telemetry schema documents the current observability.degraded payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "observability.degraded"'), true);
  assert.equal(telemetrySchema.includes('"surface": "gateway"'), true);
  assert.equal(telemetrySchema.includes('"surface": "audit_log"'), true);
  assert.equal(telemetrySchema.includes('"component": "discord"'), true);
  assert.equal(telemetrySchema.includes('"reason": "audit_write_failed"'), true);
  assert.equal(telemetrySchema.includes('"module_id": "06"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "forge-06-1712876400000"'), true);
  assert.equal(telemetrySchema.includes('"attempt": 2'), true);
  assert.equal(telemetrySchema.includes('When degraded visibility is tied to a tracked session or dispatch, the event also preserves the same `gateway_label`, `attempt`, and `dispatch_id` join keys used on the surrounding operator surfaces when known.'), true);
  assert.equal(telemetrySchema.includes('When degraded visibility is tied to a gate-owned session and Nova knows the dispatched gate type, the event also preserves `gate_type`'), true);
  assert.equal(telemetrySchema.includes('"gate_id": "review-01"'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "review"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-review-01-1"'), true);
});

await record('telemetry schema documents the current observability.restored payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "observability.restored"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "buster-gate-review-1712876400000"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-gate-review-3"'), true);
  assert.equal(telemetrySchema.includes('discord audit log writes restored'), true);
  assert.equal(telemetrySchema.includes('When restored visibility is tied to a tracked session or dispatch, the event also preserves the same `gateway_label`, `attempt`, and `dispatch_id` join keys used on the surrounding operator surfaces when known.'), true);
  assert.equal(telemetrySchema.includes('When restored visibility is tied to a gate-owned session and Nova knows the dispatched gate type, the event also preserves `gate_type`'), true);
  assert.equal(telemetrySchema.includes('"component": "redis_completion"'), true);
  assert.equal(telemetrySchema.includes('"surface": "completion_stream"'), true);
  assert.equal(telemetrySchema.includes('"gate_id": "gate:buster"'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "buster"'), true);
});

await record('telemetry schema documents the current pipeline.completed payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "pipeline.completed"'), true);
  assert.equal(telemetrySchema.includes('"exit_reason": "all modules passed"'), true);
  assert.equal(telemetrySchema.includes('"duration_seconds": 19080'), true);
  assert.equal(telemetrySchema.includes('"modules_passed": 13'), true);
  assert.equal(telemetrySchema.includes('"modules_failed": 0'), true);
  assert.equal(telemetrySchema.includes('"modules_total": 13'), true);
  assert.equal(telemetrySchema.includes('"total_cost_usd": 24.50'), true);
  assert.equal(telemetrySchema.includes('"cost_usd": 24.50'), false);
  assert.equal(telemetrySchema.includes('"total_duration_seconds": 19080'), false);
});

await record('telemetry schema documents the current retry event payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "retry.scheduled"'), true);
  assert.equal(telemetrySchema.includes('"max_attempts": 5'), true);
  assert.equal(telemetrySchema.includes('"delay_seconds": 30'), true);
  assert.equal(telemetrySchema.includes('"reason": "rate limit retry"'), true);
  assert.equal(telemetrySchema.includes('"type": "retry.exhausted"'), true);
  assert.equal(telemetrySchema.includes('"phase": "buster"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-buster-06"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "dispatch-buster-06"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:buster:session123"'), true);
  assert.equal(telemetrySchema.includes('"max_attempts": 3'), true);
  assert.equal(telemetrySchema.includes('"reason": "forge failed repeatedly"'), true);
  assert.equal(telemetrySchema.includes('When the exhausted work already has a tracked session label, `gateway_label` preserves that same operator-facing join key across retry, halt, Discord, and replay surfaces.'), true);
});

await record('telemetry schema documents terminal module status correlation fields', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "module.status_changed"'), true);
  assert.equal(telemetrySchema.includes('"new_status": "FAIL"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-buster-06"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "dispatch-buster-06"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:forge:session123"'), true);
  assert.equal(telemetrySchema.includes('When a terminal or retry-driving module transition already knows its dispatch-backed retry identity, `dispatch_id`, `gateway_label`, and `session_key` stay on `module.status_changed` so FAIL and BLOCKED telemetry remains directly joinable with the surrounding retry, Discord, and replay surfaces.'), true);
});

await record('telemetry schema documents canonical summary lifecycle payloads and drops stale case-study-only events', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  const telemetryContract = fs.readFileSync(contractPath, 'utf8');
  assert.equal(telemetrySchema.includes('"type": "summary.started"'), true);
  assert.equal(telemetrySchema.includes('"summary_type": "pipeline_review"'), true);
  assert.equal(telemetrySchema.includes('"gateway_label": "pipeline-review-1712876400000"'), true);
  assert.equal(telemetrySchema.includes('"label": "pipeline-review-1712876400000"'), false);
  assert.equal(telemetrySchema.includes('"runtime": "subagent"'), true);
  assert.equal(telemetrySchema.includes('"type": "summary.completed"'), true);
  assert.equal(telemetrySchema.includes('"summary_type": "project_summary"'), true);
  assert.equal(telemetrySchema.includes('"status": "ok"'), true);
  assert.equal(telemetrySchema.includes('| summary_type | string | Canonical summary surface: `pipeline`, `pipeline_review`, `case_study`, or `project_summary` |'), true);
  assert.equal(telemetrySchema.includes('| session_key | string\\|null | Session-backed summary child-session identity when one existed |'), true);
  assert.equal(telemetrySchema.includes('Pipeline-owned summary writes (`summary_type: pipeline`) also preserve `exit_code`, `exit_reason`, and the artifact join points `summary_json_path`, `pipeline_summary_path`, and `latest_json_path`'), true);
  assert.equal(telemetrySchema.includes('| exit_code | number\\|null | Pipeline exit code when the summary reflects the authoritative pipeline run outcome |'), true);
  assert.equal(telemetrySchema.includes('| exit_reason | string\\|null | Pipeline summary exit label such as `PIPELINE_COMPLETE`, `BLOCKED:01`, or `single_module:01` |'), true);
  assert.equal(telemetrySchema.includes('| summary_json_path | string\\|null | Run-scoped `summary.json` artifact path for `summary_type: pipeline` |'), true);
  assert.equal(telemetrySchema.includes('| pipeline_summary_path | string\\|null | Top-level `.swarm/logs/pipeline/summary.json` artifact path for `summary_type: pipeline` |'), true);
  assert.equal(telemetrySchema.includes('| latest_json_path | string\\|null | Top-level `.swarm/logs/pipeline/latest.json` pointer path for `summary_type: pipeline` |'), true);
  assert.equal(telemetryContract.includes('plus the top-level `.swarm/logs/pipeline/summary.json` and `.swarm/logs/pipeline/latest.json` pointers.'), true);
  assert.equal(telemetrySchema.includes('### case_study.started'), false);
  assert.equal(telemetrySchema.includes('### case_study.completed'), false);
  assert.equal(telemetrySchema.includes('case_study.started, case_study.completed'), false);
  assert.equal(telemetryContract.includes('Session-backed summary flows preserve `gateway_label` as the operator-facing correlation key.'), true);
  assert.equal(telemetryContract.includes('Session-backed summary flows preserve `label` as the operator-facing correlation key.'), false);
});

await record('telemetry schema documents the current budget event payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "budget.warning"'), true);
  assert.equal(telemetrySchema.includes('"current_cost_usd": 0.95'), true);
  assert.equal(telemetrySchema.includes('"budget_usd": 1.00'), true);
  assert.equal(telemetrySchema.includes('"percent_used": 95'), true);
  assert.equal(telemetrySchema.includes('"type": "budget.exceeded"'), true);
  assert.equal(telemetrySchema.includes('"current_cost_usd": 5.12'), true);
  assert.equal(telemetrySchema.includes('"budget_usd": 5.00'), true);
  assert.equal(telemetrySchema.includes('"percent_used": 102.4'), true);
});

await record('telemetry schema documents the current cost.update payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "cost.update"'), true);
  assert.equal(telemetrySchema.includes('"agent_type": "forge"'), true);
  assert.equal(telemetrySchema.includes('"label": "forge-06"'), true);
  assert.equal(telemetrySchema.includes('"cost_usd": 0.85'), true);
  assert.equal(telemetrySchema.includes('"total_cost_usd": 14.20'), true);
  assert.equal(telemetrySchema.includes('"input_tokens": 45000'), true);
  assert.equal(telemetrySchema.includes('"output_tokens": 12000'), true);
});

await record('telemetry schema documents the current approval event payload shape', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "approval.requested"'), true);
  assert.equal(telemetrySchema.includes('"approval_id": "midpoint-review"'), true);
  assert.equal(telemetrySchema.includes('"prompt": "Approval required for gate Midpoint Review"'), true);
  assert.equal(telemetrySchema.includes('"options": ["APPROVE", "REJECT"]'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "approval"'), true);
  assert.equal(telemetrySchema.includes('"timeout_policy": "BLOCK"'), true);
  assert.equal(telemetrySchema.includes('"timeout_policy": "block"'), false);
  assert.equal(telemetrySchema.includes('`"BLOCK"` stops the pipeline (default), `"CONTINUE"` proceeds without approval'), true);
  assert.equal(telemetrySchema.includes('`"block"` stops the pipeline (default), `"continue"` proceeds without approval'), false);
  assert.equal(telemetrySchema.includes('"type": "approval.resolved"'), true);
  assert.equal(telemetrySchema.includes('"choice": "APPROVED"'), true);
  assert.equal(telemetrySchema.includes('"resolved_by": "nova"'), true);
  assert.equal(telemetrySchema.includes('| gate_type | string\\|null | Canonical gate type when the approval event is gate-owned, currently `"approval"` |'), true);
  assert.equal(telemetrySchema.includes('| gate_type | string\\|null | Canonical gate type when the resolution is tied to a gate-owned approval, currently `"approval"` |'), true);
});

await record('telemetry schema documents gate-scoped agent transcript and progress correlation fields', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "agent.transcript"'), true);
  assert.equal(telemetrySchema.includes('"gate_id": null'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "review"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-review-06-2"'), true);
  assert.equal(telemetrySchema.includes('| gate_id | string\\|null | Gate context when the live session belongs to a gate or gate-fix cycle |'), true);
  assert.equal(telemetrySchema.includes('| gate_type | string\\|null | Canonical gate type when the live session is gate-owned and Nova knows that identity |'), true);
  assert.equal(telemetrySchema.includes('| session_key | string\\|null | Owning ACP/subagent session identity when known |'), true);
  assert.equal(telemetrySchema.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the live session belongs to dispatched gate work |'), true);
  assert.equal(telemetrySchema.includes('"type": "agent.progress"'), true);
  assert.equal(telemetrySchema.includes('"status": "active"'), true);
});

await record('telemetry schema documents current Buster task correlation fields', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "buster.task_started"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-buster-06"'), true);
  assert.equal(telemetrySchema.includes('"session_key": "agent:buster:session123"'), true);
  assert.equal(telemetrySchema.includes('`session_key` may be `null` on early `buster.task_started` emits before the child session exists.'), true);
});

await record('telemetry schema documents gate-scoped rate-limit dispatch correlation fields', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"type": "rate_limit.detected"'), true);
  assert.equal(telemetrySchema.includes('"gate_type": "review"'), true);
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-review-06-2"'), true);
  assert.equal(telemetrySchema.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the paused work already has one |'), true);
});

await record('telemetry schema documents gate verdict and retry exhaustion dispatch correlation fields', async () => {
  const telemetrySchema = fs.readFileSync(path.join(sourceRoot, 'docs', 'telemetry-event-schema.md'), 'utf8');
  assert.equal(telemetrySchema.includes('"dispatch_id": "dispatch-gate-quality-1"'), true);
  assert.equal(telemetrySchema.includes('| dispatch_id | string\\|null | Owning dispatch correlation key when the gate verdict belongs to dispatched gate work |'), true);
  assert.equal(telemetrySchema.includes('When retry exhaustion belongs to dispatched module or gate work, `dispatch_id` preserves the same owning correlation key used on the surrounding verdict, rate-limit, Discord, and replay surfaces when known.'), true);
  assert.equal(telemetrySchema.includes('When retry exhaustion belongs to gate-owned work and Nova already knows that identity, the payload also preserves canonical `gate_type` alongside `gate_id`.'), true);
});
}
