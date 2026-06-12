# Common Failures

Status: current
Audience: operator

## Purpose

Map current failure messages and likely next checks.

## Current Behavior

`Gateway URL is required`

The common gateway helper needs `gatewayUrl` or `OPENCLAW_GATEWAY_URL`.

`Gateway token policy is required`

The common gateway helper needs `gatewayToken` or `OPENCLAW_GATEWAY_TOKEN`.

`GATEWAY_READY_TIMEOUT`

Buster waited 120 seconds for gateway readiness and initiated structured shutdown.

`GATEWAY_HEALTH_FAILED`

Buster gateway health failed three consecutive periodic checks.

`BUSTER_TASK_MALFORMED`

Buster rejected a task payload for missing identity, unknown task type, unknown capabilities, invalid `test_config`, or unsafe paths. Required identity includes `task_type`, `module_id`, `project`, `run_id`, `attempt`, `dispatch_id`, `commit_hash`, `output_file`, `stage_id`, `timeout_seconds`, session runtime/model/agent/cwd/label, `suites`, and `test_config.suite_timeout_ms`. `skills/buster/pipeline/services/task-validation.ts` writes malformed-task evidence and `task-completion.ts` dead-letters before ACK.

`BUSTER_CAPABILITY_DENIED`

A Buster suite/tool requested a capability not present in the task context. Check the task `capabilities` list and suite requirements.

`BUSTER_TASK_TERMINAL_GUARANTEE_FAILED`

Buster could not prove completion or dead-letter evidence before acknowledging a task. Treat this as a Redis/task reliability incident.

`Pipeline runtime lock lost`

Nova's pipeline lock heartbeat was lost while work was in flight.

`Recovery blocked: stale session identity was not confirmed`

Nova found stale module or gate state but lifecycle read models did not provide strong active-session identity, or monitor/gateway confirmation did not match. The required fields are `run_id`, `attempt`, `dispatch_id`, and `session_key`. Inspect `.swarm/logs/pipeline/runs/<run_id>/lifecycle/read-models.json` and `canonical-events.jsonl`; do not reset from age alone.

`redis_terminal_conflicts_with_terminal_status`

Redis completion evidence disagrees with local terminal lifecycle state. Treat Redis as candidate evidence only. Inspect completion drift diagnostics, active dispatch identity, and run-scoped lifecycle events before rerunning.

`Illegal lifecycle append`

`status-store-lifecycle/legality.ts` rejected an impossible transition, such as closing a wait that is not open, completing a run that did not start, or applying a module attempt event to the wrong attempt. Preserve the run directory and escalate with `canonical-events.jsonl`, `read-models.json`, and the command that produced the append.

## Troubleshooting Blocks

| Symptom | Check first | Recovery or next action |
| --- | --- | --- |
| Agent pod stuck in init | `kubectl logs -n "$NAMESPACE" deployment/agent-nova -c init-kubeclaw`; `kubectl describe pod` | fix Git deploy key, persisted config JSON, protected custom-skill overlay, or missing swarm config |
| Gateway ready but pipeline stalled | `.swarm/logs/pipeline/latest.json`; run-scoped `pipeline.jsonl`; `read-models.json` | determine whether scheduler is waiting, blocked, rate-limited, or missing terminal evidence before restarting |
| Buster not consuming tasks | `BUSTER_TASK_STREAM`; `kubectl logs deployment/agent-buster -c buster-pipeline`; Redis `XPENDING` | inspect malformed/dead-letter streams before ACK/requeue decisions |
| Redis completion conflicts | completion stream, `canonical-events.jsonl`, `read-models.json` | keep lifecycle read model authoritative unless strong Redis identity matches the active dispatch |
| Live deployment differs from docs | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"`; Helm render output | update chart/source docs together, then rerun deployment truth |

Escalation bundles should include the failing command, pod/event output if live, and run-scoped lifecycle artifacts. Avoid deleting `.swarm/logs/pipeline/runs/<run_id>` before deciding whether recovery is possible.
