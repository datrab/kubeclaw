# 04 Artifact Message State Model

## Redis Messages

Task entries must use the shared Redis pipeline message schema: `schema_version=v1`, `stream_role=task`, `type=module_test|gate_test`, `project`, `target_kind`, `target_id`, `run_id`, `attempt`, `dispatch_id`, `sender`, `payload JSON`.

Completion entries must use: `schema_version=v1`, `stream_role=completion`, `type=completion`, `status`, `outcome`, `source=buster-pipeline`, `reason`, `summary`, `run_id`, `attempt`, `dispatch_id`, `optional session_key/gate_type/gateway_label/verdict`.

Lifecycle rule: ensure group -> reclaim pending -> read via xreadgroup -> validate payload -> process task -> emit completion or dead-letter -> ack only after terminal guarantee -> trim. The release suite must inspect Redis pending/acked/dead-letter/completion state, not just function return values.

Closure evidence: `tests/verification/contracts/check-redis-task-lifecycle-acceptance.mjs` is the deterministic contract proof for publish/consume/pending/terminal-before-ack/dead-letter/ack/reclaim. `tests/verification/live/redis-backend-smoke.mjs` is the environment proof when live Redis is enabled.

## Artifacts

- Run-scoped replay authority: `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}`.
- Latest pointer: `.swarm/logs/pipeline/latest.json pointer-only, never completion/session authority`.
- Buster output: `repo-relative output_file JSON with artifact_type=buster_output, status PASS|FAIL, run_id, attempt, dispatch_id, optional session_key`.
- Plugin artifacts: `.swarm/logs/pipeline/runs/<run_id>/plugin-artifacts/<module>/<hook>/<stage>/{index.json,data/*}`.
- Diagnostic fallback: `artifact_fallback=true or seq=null is diagnostic evidence only`.

Authority rule: run-scoped replay can support operator reconstruction; latest is pointer-only; diagnostic fallback is never completion/session/scheduler authority. Any identity drift makes the artifact stale evidence.

Closure evidence: `tests/verification/contracts/check-buster-output-artifact-acceptance.mjs` is the current authority proof for Buster `output_file`: canonical repo-relative paths, required identity, missing/invalid/stale/wrong-run rejection, and replacement terminal FAIL artifacts.

## State

- Lifecycle: append-only lifecycle events and read models are canonical progress state.
- Module status: module status files are projections/local working state, not stale evidence authority.
- Active sessions: active_agent/status/gate active-session JSON require gateway identity confirmation for recovery; persisted common active-session file is diagnostic only.
- Locks: active-run.lock.json leased lock with schema_version/token/pid/hostname/heartbeat_at/lease_expires_at/stale_at.
- Degraded/manual evidence: unresolved entries from startup, runtime, progress, or fallback paths block clean terminal completion unless the entry is explicitly resolved or carries `allow_clean_success=true`.

Terminal rule: unresolved degraded/manual fallback evidence maps to BLOCKED/DEGRADED handoff, never clean autonomous success by default. Closure evidence: `tests/verification/contracts/check-manual-degraded-terminal-acceptance.mjs`.

Recovery rule: lifecycle read-model active-session identity is the only restart recovery authority; status files, gate active-session files, and tracked-agent evidence are diagnostic unless they confirm lifecycle authority. Gateway confirmation is required before recovery can be considered confirmed. Closure evidence: `tests/verification/contracts/check-restart-session-recovery-acceptance.mjs`.

## Notifications

Critical notifications require identity fields: `run_id`, `module_id or gate_id when scoped`, `attempt when scoped`, `dispatch_id when session scoped`, `gateway_label when known`, `session_key when known`.

Sinks: telemetry stream, structured event artifact mirror, discord webhook/audit.

Rule: critical path notifications must not be path-only; sink failures emit observability.degraded/restored and do not become clean success.

Closure evidence: `tests/verification/contracts/check-notification-operator-identity-acceptance.mjs` proves critical/actionable Discord presentations require verdict/status/outcome plus next action/action, reject path-only payloads, and require scoped module/gate IDs before sink dispatch.

## Deploy/Runtime Gates

Local release gating must execute deployment truth plus Nova and Buster startup smoke. This catches rendered config, mount/env, entrypoint, and startup CLI drift before deploy. Closure evidence: `tests/verification/contracts/check-deploy-runtime-gate-acceptance.mjs`.
