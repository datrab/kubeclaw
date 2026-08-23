# Request To Result

Status: implemented
Audience: architecture reader, maintainer, operator
Owner: nova-core
Evidence: skills/nova/core/execution; skills/nova/core/lifecycle
Applies to: pipeline-plugin-v2
Last verified: generated during publication

## Purpose

This page follows one pipeline run from configuration admission to terminal closure.

## Flow

1. Core validates project configuration and resolves each stage owner.
2. Core freezes the graph, registry, policy, and source revision.
3. Core selects ready stages within the configured concurrency limit.
4. Core creates a unique attempt and a capability-limited context.
5. The selected plugin performs its declared work.
6. Core validates the plugin result and commits the lifecycle event.
7. Core schedules progress, remediation, retry, wait, or closure.
8. Recovery replays durable records and rejects stale attempt results.

## Authority

Core alone advances the scheduler and writes canonical lifecycle state. Plugins return typed results and request bounded effects.

Worker services can execute durable plans. Nova imports their validated results and remains the final pipeline authority.

## Failure Boundary

A failed attempt does not silently become a passed stage. Missing evidence, invalid results, and exhausted budgets remain explicit.
