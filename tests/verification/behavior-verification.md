# Behavior Verification

## Scope

Behavior verification is backed by a runnable harness plus two guardrail checks.
Canonical verifier implementations live under `tests/verification/`:
- `tests/verification/runtime/check-runtime-collisions.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/behavior/verify.mjs`

Current verification policy:
- use the live repo state in `kubeclaw-main` as the source of truth
- rerun the guards against current source, not historical rebuilt-artifact trees
- treat `kubeclaw-main/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` as the authoritative inventory, stream-identity, and contract-boundary spec
- treat `kubeclaw-main/docs/telemetry-event-schema.md` as the authoritative event-by-event payload reference, kept in exact inventory parity with that contract
- treat `.swarm/logs/pipeline/latest.json` plus `.swarm/logs/pipeline/runs/<run_id>/{pipeline.jsonl,discord.jsonl,nova-injections.jsonl,buster-telemetry-fallback.jsonl,redis/redis-exchanges.jsonl,redis/redis-ops.jsonl,summary.json}` as the canonical replay/audit bundle, with Redis audit artifacts also mirrored under `.swarm/logs/redis/{redis-exchanges.jsonl,redis-ops.jsonl}`

Current source root used for reruns:
- `<repo-root>/kubeclaw-main`

Current contract used for reruns:
- `<repo-root>/kubeclaw-main/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`

Verifier default:
- both `tests/verification/contracts/check-telemetry-contract.mjs` and `tests/verification/behavior/verify.mjs` default `--contract` to `<repo-root>/kubeclaw-main/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`
- `--contract` is only needed when intentionally checking a different markdown contract file

## Prerequisites

- `node`
- `git`
- `python` on `PATH` (Python 3 is fine, but the executable name must be `python` because representative pipeline fixtures invoke `python -m ...`)

On Debian or Ubuntu, the clean setup is:

```bash
apt-get install -y python3 python-is-python3
```

`docker/Dockerfile.general` is expected to satisfy this prerequisite for the general verifier environment.

## Commands

```bash
cd <repo-root>/kubeclaw-main

node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root <repo-root>/kubeclaw-main

node tests/verification/contracts/check-telemetry-contract.mjs \
  --source-root <repo-root>/kubeclaw-main

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root>/kubeclaw-main

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root>/kubeclaw-main \
  --list-areas

node tests/verification/behavior/verify.mjs \
  --source-root <repo-root>/kubeclaw-main \
  --areas foundations,fix-cycles
```

## Latest live repo rerun summary (2026-04-24)

### Current repo-truth baseline
- latest repo-truth rerun against live `kubeclaw-main` passed for the no-launch verification stack used during harness recovery
- verified surfaces in that rerun: deployment truth, runtime collisions, final-gate hardening, telemetry contract, focused contract/slice guards, and the default behavior harness
- total collisions: `0`
- broken packaged relative imports: `0`
- packaged `/app/skills/pipeline.ts`: `OK`
- packaged `/app/skills/pipeline/index.ts`: `OK`
- emitted event names checked across Nova and Buster runtime files: all valid
- canonical live stream ownership remains pinned to `pipeline:telemetry:<project>:<run_id>`
- contract and telemetry schema now pin an explicit authority split: contract owns canonical inventory and boundaries, schema owns event-by-event payload reference
- authoritative contract inventory now includes `observability.degraded` and `observability.restored`
- deprecated no-op event surfaces `memory.recalled`, `buster.result`, and `redis.message` are removed from canonical runtime and contract expectations
- default behavior harness coverage currently spans `33` areas
- exact pass totals should be taken from the live JSON output of `tests/verification/behavior/verify.mjs`, not from a stale static doc snapshot

### Current gate expectations
- `tests/verification/run-full-verification.sh` is the canonical fail-fast local wrapper
- it includes deployment truth, runtime collision, live subagent launch smoke, telemetry contract, focused contract guards, and the default behavior harness
- ACP launch reachability is local/provider-specific and is run explicitly with `tests/verification/run-local-acp-verification.sh`
- because the wrapper stops on the first red surface, rerun the underlying entrypoints directly when you need the full downstream failure set
- `scripts/deploy.sh verify-live [tag]` plus `scripts/deploy.sh smoke` / `scripts/deploy.sh smoke-agent <nova|buster>` remain operator-run live-cluster surfaces and require Docker plus cluster access; they are not executed by the repo-only deployment truth guard

### Final closure-gate snapshot (2026-04-24)
- direct `tests/verification/deployment/check-deployment-truth.mjs` is green
- direct `tests/verification/runtime/check-runtime-collisions.mjs` is green
- direct `tests/verification/behavior/verify.mjs` is green in the documented verifier environment where `python` is present on `PATH` (current live result: `passed: 300`, `failed: 0`, `selectedAreas: 33`)
- the canonical fail-fast wrapper `tests/verification/run-full-verification.sh` keeps subagent launch in the default clean-checkout gate and keeps ACP launch out of that default lane
- direct `tests/verification/runtime/check-subagent-launch.mjs` is the normal launch-health surface for the default wrapper
- direct `tests/verification/runtime/check-acp-launch.mjs` remains a real smoke for local ACP setup, but it is run via `tests/verification/run-local-acp-verification.sh` rather than the default clean-checkout wrapper
- ACP failures mean local ACP agent/provider/gateway status setup needs attention; they do not by themselves make deterministic repo verification red

Foundation-sensitive proof now explicitly includes deterministic registry assembly/rejection checks, packaged helper ownership, explicit Buster crash-recovery path ownership, shared failure normalization, mediated plugin-context scaffolding, and restart-safe lifecycle state handling.

Representative coverage areas:
1. packaged runtime ownership and entrypoint loadability
2. polling cadence, cooldown ownership, and rate-limit recovery across module, gate-fix, review-fix, reviewer, pipeline-review, and case-study paths
3. degraded-observability signaling for transcript, gateway, and Redis failure paths
4. canonical telemetry identity and payload-shape alignment across runtime, docs, and guards
5. Discord correlation and audit-artifact integrity, with live webhook delivery muted during generic verification runs
6. lifecycle state transitions, restart recovery, spawn/kill telemetry, and session-correlation preservation
7. repo-root portability for active suite and summary defaults, avoiding hardcoded host-specific evidence paths in live verification tooling
8. operator-facing visual-regression reference examples stay portable instead of embedding host-specific baseline artifact paths
9. pre-check Semgrep config discovery and docs stay portable, using auto-detect instead of host-specific platform config paths
10. remaining repo-root fallback helpers stay source-relative and portable instead of preserving hardcoded legacy host paths
11. platform swarm config discovery and operator docs use `/home/node/.openclaw/swarm.config.json` first with `SWARM_CONFIG` as fallback, instead of `/app/config` or source-chart fallback discovery
12. lifecycle contract docs keep canonical Redis audit artifact paths instead of reintroducing stale `pipeline/redis.jsonl` provenance
13. lifecycle contract docs no longer keep stale explicit `buster:telemetry:<project>:<run_id>` compatibility literals after the single-canonical-stream decision
14. stale session recovery alerts keep the recovered child `session_key` on operator Discord surfaces so restart cleanup stays cross-surface joinable
15. Nova injection sent/failed alerts keep the owning child `session_key` on operator Discord surfaces so escalation and channel-injection audit trails stay joinable
16. Full-pipeline BLOCKED halt/escalation surfaces resolve the blocked module's persisted `session_key` from lifecycle-backed module state, so operator Discord alerts and stop-path telemetry stay joinable even when the runner only knows it is resuming a previously BLOCKED module
17. Buster agent-test failure paths now preserve the cached child `session_key` through failure-service Discord, retry, escalation, and returned result payloads even after `active_agent` cleanup, so Buster-owned FAIL / NEEDS_NOVA surfaces remain joinable with the completed child session
18. Approval gates normalize lower-case config `on_timeout` into canonical uppercase `timeout_policy` across gate state, approval audit artifacts, and emitted `approval.requested` telemetry so runtime behavior matches the published contract
19. Service-owned pipeline review and case-study ACP cooldown exhaustion now also emit structured `retry.exhausted` telemetry with preserved `session_key`, so those post-run operator-facing failures no longer fall back to pause telemetry plus Discord/log text alone
20. Gate-owned pause-budget and fix-budget exhaustion paths now also emit structured gate-scoped `retry.exhausted` telemetry with preserved `gate_id`, `gate_type`, and `session_key`, so Buster/Review gate cooldown exhaustion and fix-loop exhaustion no longer end at `gate.verdict` plus exit code alone
21. Gate-backed ACP session transcript and progress telemetry now preserve canonical `gate_id` plus `session_key` without overloading `module_id` with gate labels during live gate-fix monitoring, so those high-frequency live surfaces stay joinable with gate-scoped telemetry, Discord, and audit artifacts
22. Shared `pollForFile(...)` ACP sessions now emit live `agent.transcript` and `agent.progress` telemetry with preserved `session_key` and gate context when available, so review gates, pipeline review, and case-study runs no longer stay log-only until the output file appears or the session ends
23. Shared Forge completion polling now emits live `agent.transcript` and `agent.progress` telemetry with preserved `module_id`, `session_key`, and tracked session label correlation while Nova waits on the typed `forge-completion.json` artifact instead of any module-local status file
24. Shared `pollForSessionEnd(...)` gate-fix and review-fix telemetry now reuses the tracked ACP gateway label instead of the internal tracking key, keeping live transcript/progress labels consistent with the other ACP polling surfaces
25. Session-backed `agent.spawned` and `agent.killed` lifecycle telemetry now both reuse the tracked ACP gateway label instead of the internal tracking key, keeping Forge and Echo session lifecycle labels aligned across spawn, live telemetry, and teardown
26. Restart-time stale module and gate recovery Discord alerts plus persisted `discord.jsonl` audit entries now preserve the recovered ACP `gateway_label`, keeping operator recovery surfaces joinable with the same authoritative label already tracked in session state
27. Restart-time stale module recovery alerts now also preserve canonical `attempt`, while stale gate recovery alerts preserve canonical `attempt` plus `dispatch_id`, keeping recovery-time Discord and `discord.jsonl` surfaces joinable with the exact interrupted retry instead of only the recovered session label
28. Pipeline halt and escalation telemetry now also preserves canonical `attempt` plus `dispatch_id` when the terminal module or gate result already knows them, keeping stop-path live stream events directly joinable with the exact retry or gate dispatch instead of only the stopped step and session
29. The mirrored pipeline halt Discord and `discord.jsonl` stop surfaces now also preserve that same canonical `attempt` plus `dispatch_id` correlation on blocked, single-module, and gate-owned stop paths, keeping operator stop alerts aligned with the same retry identity already present in the authoritative stream
27. Session-backed Forge and Echo spawn Discord alerts now also preserve the tracked ACP `gateway_label`, so operator-facing lifecycle alerts and persisted `discord.jsonl` audit entries stay label-joinable with the corresponding spawn telemetry
28. Session-backed ACP rate-limit pause/resume Discord alerts now also preserve the tracked gateway label, so operator cooldown surfaces stay label-joinable with the corresponding polling and lifecycle telemetry
29. Generic module rate-limit pause/resume Discord alerts now also preserve the tracked gateway label when active agent state already knows it, keeping cooldown surfaces aligned with the owning module session telemetry
30. Pipeline-review spawn, cooldown, completion, and failure Discord alerts now also preserve the tracked review label, keeping those operator surfaces joinable with the review session lifecycle and persisted audit entries
31. Case-study spawn, cooldown, completion, and exhaustion Discord alerts now also preserve the tracked case-study label, keeping those operator surfaces joinable with the case-study session lifecycle and persisted audit entries
32. Forge-owned module Discord alerts now also preserve the tracked gateway label when active module state already knows it, keeping module operator surfaces aligned with the owning Forge session telemetry
33. Buster-owned module Discord alerts now also preserve the dispatch-backed gateway label, keeping those operator surfaces aligned with the owning Buster dispatch/session telemetry
34. Review-gate lifecycle, GO/NO-GO, re-review, and blocked Discord alerts now preserve the tracked reviewer label, while review-fix loop alerts preserve the tracked Forge fix label, keeping those operator surfaces joinable with the owning Echo and Forge session lifecycles
35. Buster gate pass, failure, rate-limit, blocked, and auto-fix Discord alerts now also preserve the dispatch-backed or tracked Forge fix gateway label, keeping those operator surfaces aligned with the owning Buster dispatch and Forge fix session telemetry
36. Failure-service module retry, BLOCKED, NEEDS_NOVA, and Nova injection Discord alerts now also preserve the tracked or cached `gateway_label`, keeping those escalation/operator surfaces label-joinable with the owning module session telemetry
37. Pipeline-runner single-module completion, resumed-BLOCKED, and generic halt Discord alerts now also preserve resolved `gateway_label` values from returned results or persisted module state, keeping terminal operator surfaces label-joinable with the owning module or gate session telemetry
38. Resumed-BLOCKED module-runner returns now also preserve resolved `gateway_label` alongside the persisted `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova re-enters a module that was already blocked earlier
39. Blueprint-release `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key` when present, so terminal pipeline-runner stop alerts stay joinable on architecture-branch release failures too
40. Forge-phase `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when rate-limit pauses are exhausted after Forge has already claimed session ownership
41. Pre-dispatch Buster config-validation `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova refuses to queue tests because project config is invalid
42. Buster-phase `EXIT_RATE_LIMITED` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when rate-limit pauses are exhausted during Buster polling
43. Buster crash-exhausted `EXIT_BLOCKED` returns now also preserve canonical `dispatch_id` alongside the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, and the integrated `module-failures.mjs` runtime harness now pins that stop payload plus neighboring FAIL/BLOCKED/`retry.exhausted` telemetry correlation end to end, so terminal pipeline-runner stop alerts stay joinable when repeated Buster infrastructure crashes block the module before Forge can help without relying on brittle source-text assertions
44. Buster pre-test infra/config `EXIT_NEEDS_NOVA` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when Nova preserves Forge output and stops before another code cycle
45. Repeated Buster pre-test `EXIT_NEEDS_NOVA` returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when the same pre-test suite fails again and Nova escalates before another Forge cycle
46. Dependency-check EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when module execution is refused before any attempt starts
47. Corrupt lifecycle-state load EXIT_ERROR returns now also preserve salvaged `gateway_label` and `session_key` from the unreadable lifecycle-backed module state, so terminal pipeline-runner stop alerts stay joinable even when Nova aborts to avoid overwriting existing work
48. Module-runner Forge and Buster spawn-failed exits now preserve returned `gateway_label` and `session_key`, so the terminal pipeline-runner stop alerts stay joinable with the owning module attempt even when the failure happens before normal polling begins
49. Forge and Buster prompt-build EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts keep canonical module correlation even when execution fails before any child session is spawned
50. Validation-milestone refusal before Buster dispatch now also preserves resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts keep canonical module correlation when Nova aborts before the Git handoff
51. Git sync before Buster EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable with the owning module attempt when the Forge to Buster handoff fails
52. Forge-phase polling git EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Forge fails closed during post-spawn git synchronization
53. Buster-phase polling git EXIT_ERROR returns now also preserve the dispatch-backed or resolved `gateway_label` plus the terminal `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster fails closed during polling-side git synchronization
54. Fallback unexpected-status EXIT_ERROR returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable even when the module ends in an unrecognized persisted state
55. Buster gate config-invalid `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when gate execution is refused before any Buster child session is spawned
56. Buster gate spawn-failed `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the gate cannot launch its Buster worker at all
57. Buster gate parse-corrupted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the gate status file is permanently unreadable
58. Buster gate timeout `EXIT_TIMEOUT` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Buster gate times out after session ownership is known
59. Buster gate git-error `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when polling-side git synchronization fails closed during gate execution
60. Buster gate rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster gate cooldown pauses are exhausted
61. Buster gate no-fix-loop `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when a Buster gate fails without an auto-fix cycle configured
62. Buster gate fix-loop-exhausted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Buster gate retries consume every configured fix attempt
63. Buster gate fix rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Forge auto-fix session itself exhausts cooldown pauses
64. Review gate rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when Echo review cooldown pauses are exhausted
65. Review gate post-start failure `EXIT_ERROR` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Echo reviewer fails after session ownership is known
66. Review gate fix rate-limit-exhausted `EXIT_RATE_LIMITED` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when the Forge review-fix session exhausts cooldown pauses
67. Review gate fix-loop-exhausted `EXIT_NEEDS_NOVA` returns now also preserve resolved `gateway_label` and `session_key`, so terminal pipeline-runner stop alerts stay joinable when review fix cycles are exhausted and the gate remains NO-GO
68. Restart-time stale module and gate reconciliation now also emits explicit gateway `observability.degraded` events when `session_status` is unreachable during stale-session recovery, so recovery-time visibility loss no longer collapses into silent kill-or-retry behavior
69. Those same stale gate recovery `observability.degraded` events now also preserve canonical `attempt` plus `dispatch_id` when the interrupted gate session already knew them, keeping recovery-time visibility loss directly joinable with the exact gate retry and dispatch instead of only the gate/session pair
69. Session teardown now routes through a shared termination controller with an isolated hard-capped grace period and strict canonical `{confirmed, unconfirmed, terminal, cleanup*}` result schema, so orchestration, recovery, Buster monitors, and summary cleanup no longer synthesize split-brain kill state locally
70. Service-owned pipeline review now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: pipeline_review`, preserved `session_key`, and terminal `status` / `reason` on cooldown-budget exhaustion and no-output failure paths, so that post-run review surface no longer drops back to Discord/log text alone outside the `retry.exhausted` branch
71. Service-owned case study now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: case_study`, preserved `session_key`, and terminal `status` / `reason` on cooldown-budget exhaustion and no-output failure paths, so that post-run case-study generation no longer drops back to Discord/log text alone outside the `retry.exhausted` branch
72. Service-owned project summary now emits authoritative `summary.started` / `summary.completed` telemetry with `summary_type: project_summary`, terminal `status` / `reason`, and emitted artifact paths when written, so that local summary generation no longer disappears into log text and side files alone on success or failure
73. Service-owned project summary Discord delivery now flows through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring, canonical `run_id` correlation, and emitted artifact-path fields, so the post-run project-summary surface stays joinable with summary telemetry and written artifacts instead of bypassing audit correlation
74. Shared dual-channel Buster polling now emits explicit `observability.degraded` / `observability.restored` on the `completion_stream` surface when Redis completion reads fail and then recover, so completion-stream visibility loss no longer collapses silently into Git fallback plus a debug log
75. Buster gate polling now also emits explicit `observability.degraded` / `observability.restored` on the same `completion_stream` surface when Redis gate-completion reads fail and then recover, so gate-owned completion visibility loss no longer collapses silently into output-file or gate-status fallback plus a debug log
76. Shared dual-channel Buster polling now preserves the exact Redis module import or path-validation failure detail inside `completion_stream` `observability.degraded` events, so completion-stream visibility loss no longer degrades into a generic “reader unavailable” signal when the Redis reader cannot even load
77. Buster gate polling now preserves that same exact Redis module import or path-validation failure detail on its gate-scoped `completion_stream` `observability.degraded` events, so gate-owned completion visibility loss stays operator-actionable even when Redis reader startup fails before any completion read happens
78. Review-gate setup fast-fails with no configured reviewers now also emit canonical operator Discord alerts with preserved `run_id`, `gate_id`, and attempt correlation, so that pre-spawn gate misconfiguration no longer appears only in logs and stream telemetry with no mirrored operator alert surface
79. Buster-gate setup fast-fails when gate instructions cannot be read now also emit canonical operator Discord alerts with preserved `run_id`, `gate_id`, and attempt correlation, so that pre-spawn gate setup failures no longer disappear from the Discord and `discord.jsonl` audit surface even though authoritative `gate.verdict` telemetry already exists
80. Gate-dispatch fast-fails for unknown `gate.type` values now also emit canonical operator Discord alerts with preserved `run_id`, `gate_id`, and `gate_type` correlation, so dispatcher-level gate failures no longer appear only in logs and structured stream telemetry with no mirrored operator alert surface
81. Buster-gate unexpected safety-net failures now also emit canonical operator Discord alerts with preserved `run_id`, `gate_id`, and attempt correlation, so even the last-resort "this should not happen" stop path no longer collapses into log text plus a bare `gate.verdict` alone
82. Approval-gate `approval.requested` and `approval.resolved` telemetry now also preserve canonical `gate_type`, so approval-specific live stream events stay joinable with the matching gate-owned verdict, Discord, and audit surfaces instead of dropping back to `gate_id` alone
83. Approval-gate authoritative state plus `approval-request.json` and `approval-decision.json` now also preserve canonical `gate_type`, so approval replay artifacts stay joinable with the matching live telemetry, Discord, and gate verdict surfaces instead of forcing operators to infer approval identity from path plus `gate_id` alone
84. Approval-gate `approval-transitions.jsonl` entries now also persist canonical `run_id`, `project`, `gate_id`, and `gate_type`, so state-change replay stays directly joinable with the rest of the approval audit bundle instead of relying on surrounding files for correlation
85. `summary.json` now preserves the same governance replay correlation, with `.governance.approval_gates[]` carrying canonical `gate_id`, `gate_type`, `run_id`, `project`, and approval artifact paths so operators can join the summary snapshot directly back to the approval audit bundle
86. `summary.json` now preserves canonical arch-validator run correlation too, with `.governance.arch_validator` carrying `run_id` and `project` so the governance snapshot joins cleanly back to the live stream and replay artifacts
87. Service-owned case-study no-output and generic failure alerts now also flow through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring, preserved `run_id`, tracked `gateway_label`, and `session_key` correlation, so post-run case-study failures no longer fall back to logs plus summary telemetry alone once the child session finishes without a usable report
88. Local project-summary generation failures now also emit a canonical operator Discord alert with persisted `discord.jsonl` mirroring, preserved `run_id`, and run-scoped artifact-path context, so local summary failures no longer disappear into `summary.completed` plus warn logs without an operator-facing audit surface
89. The standalone `tools/project-summary.ts --discord` path now also routes through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring and preserved `run_id` correlation when a run context is available, instead of bypassing the hardened audit and observability path with a raw webhook-only fetch
90. Redis-dispatched Buster task alerts now also route through the canonical pipeline Discord integration with persisted `discord.jsonl` mirroring and preserved `run_id`, `module`, `attempt`, and `dispatch_id` correlation when that task context is known, instead of bypassing the shared audit path with a raw webhook-only fetch
91. Shared pipeline Discord webhook delivery failures now also emit explicit `observability.degraded` telemetry on the `webhook` surface with preserved module, gate, and session correlation when known, so live operator-visibility loss no longer collapses into warn-only logging when `discord.jsonl` keeps writing but Discord posting fails
92. That same shared pipeline Discord delivery path now emits matching `observability.restored` telemetry after a later successful webhook post for the same run, so recovery of the live operator surface is explicit instead of being inferred only from resumed message flow
93. Shared pipeline Discord webhook degraded/restored observability now also preserves tracked `gateway_label`, `attempt`, and `dispatch_id` when those join keys are already present on the owning operator alert, so visibility incidents stay directly joinable with the same Discord and telemetry surfaces instead of collapsing back to module or gate identity alone
94. Shared pipeline Discord audit-log mirroring now also emits explicit `observability.degraded` / `observability.restored` telemetry on the `audit_log` surface with preserved gate, session, gateway-label, attempt, and dispatch correlation when known, so silent `discord.jsonl` write failures no longer break replay joins without an explicit operator-visible visibility incident
95. Shared ACP observability degraded/restored telemetry now also preserves tracked `gateway_label`, `attempt`, and `dispatch_id` across polling, health-check, and stale-recovery paths when known, so gateway and transcript visibility incidents stay directly joinable with the owning session attempt instead of forcing operators to infer that correlation from neighboring events
96. Gate-owned session-backed `agent.spawned` / `agent.killed` lifecycle telemetry now also preserves canonical `gate_type` and `dispatch_id` when orchestration knows them, so reviewer and Forge gate-fix lifecycle events stay joinable with the surrounding gate-owned observability and operator surfaces instead of dropping that identity back to label plus `gate_id` alone
97. Gate-backed orchestration-owned Forge and reviewer spawn/spawn-failure Discord alerts now also preserve canonical `gate_type` and `dispatch_id` when known, so those lifecycle audit surfaces stay joinable with the same gate-owned telemetry and webhook-observability incidents instead of flattening back to run plus `gate_id` alone
98. Gate-owned ACP health-check and teardown-monitor `observability.degraded` / `observability.restored` events now also preserve canonical `gate_type`, so gateway and transcript visibility incidents stay joinable with gate-owned verdict, Discord, and lifecycle surfaces instead of flattening back to `gate_id` alone
99. Gate-owned session-backed `agent.transcript` / `agent.progress` telemetry now also preserves canonical `gate_type` and `dispatch_id` when orchestration already knows them, so live review and gate-fix monitoring stays directly joinable with gate lifecycle, observability, and Discord audit surfaces instead of dropping back to `gate_id` plus session only
100. Session-backed ACP `rate_limit.detected` telemetry and polling-owned pause/resume Discord alerts now also preserve canonical `gate_type` and `dispatch_id` for gate-owned work when known, so operator-facing cooldown incidents stay directly joinable with the same gate lifecycle and live-session surfaces instead of flattening back to gate plus session alone

For the exact live check list, use `tests/verification/behavior/verify.mjs`; the behavior harness is the authoritative executable specification.

## Conclusion

Behavior verification is now reproducible from the current repo state, not from stale historical artifact trees.
The harness and guardrails validate package-level runtime ownership, Nova/Buster lifecycle behavior, telemetry contract alignment, and cross-surface auditability against the live `kubeclaw-main` tree.
Verifier ownership now lives under `tests/verification/`, and the canonical entrypoints are:
- `tests/verification/runtime/check-runtime-collisions.mjs`
- `tests/verification/contracts/check-telemetry-contract.mjs`
- `tests/verification/behavior/verify.mjs`
