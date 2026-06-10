# Pipeline

Status: current
Audience: operator, developer

## Purpose

This section documents Nova's pipeline orchestration and Buster's worker integration.

## Guides

- [Architecture](architecture.md)
- [Technical implementation map](technical-implementation-map.md)
- [End-to-end flow](end-to-end-flow.md)
- [Runtime flow](runtime-flow.md)
- [Modules and gates](modules-and-gates.md)
- [Workers and Buster](workers-and-buster.md)
- [Failure and recovery](failure-and-recovery.md)
- [Telemetry and artifacts](telemetry-and-artifacts.md)
- [Progress JSON interpretation](progress-json.md)
- [Configuration](configuration.md)

## Source boundaries

Nova owns scheduling, state, gates, lifecycle, and terminal outcomes. Buster owns task execution and test artifacts for accepted Redis tasks. Redis task and completion messages are transport data and are validated before they influence lifecycle or operator evidence.
