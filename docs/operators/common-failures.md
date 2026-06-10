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

Buster rejected a task payload for missing identity, unknown task type, unknown capabilities, or unsafe paths. It writes malformed-task evidence and dead-letter before ACK.

`BUSTER_CAPABILITY_DENIED`

A Buster suite/tool requested a capability not present in the task context. Check the task `capabilities` list and suite requirements.

`BUSTER_TASK_TERMINAL_GUARANTEE_FAILED`

Buster could not prove completion or dead-letter evidence before acknowledging a task. Treat this as a Redis/task reliability incident.

`Pipeline runtime lock lost`

Nova's pipeline lock heartbeat was lost while work was in flight.
