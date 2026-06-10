# Architecture Decisions

Status: current
Audience: maintainer

## Two-agent swarm

Decision: KubeClaw deploys Nova and Buster as separate agent releases using the same Helm chart.

Reason: Nova owns orchestration and lifecycle authority, while Buster owns destructive test execution in a sandbox image and can be granted a different runtime/security posture.

## Redis as transport

Decision: Redis carries Buster task/completion traffic and pipeline telemetry streams.

Reason: The pipeline already uses Redis task, completion, replay, and telemetry services, and Buster's worker loop is built around Redis consumer groups and pending recovery.

## Source-backed documentation

Decision: Active docs must follow current source and verification instead of archived plans.

Reason: The repository contains substantial historical material under `docs/archive/`; keeping current docs separate prevents old implementation maps from becoming accidental authority.
