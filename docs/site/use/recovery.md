# Pipeline Recovery

Status: implemented
Audience: operator
Owner: nova-core
Evidence: skills/nova/core/lifecycle/recovery.ts; skills/nova/core/cli.ts
Applies to: pipeline-plugin-v2
Last verified: generated during publication

## Objective

Resume a durable pipeline without hiding an incomplete attempt or changing its frozen graph.

## Prerequisites

- Keep the original durable run state.
- Identify the run and its current terminal or waiting condition.
- Preserve the frozen source revision and graph identity.

## Procedure

1. Inspect the pipeline command interface for the current resume syntax.

```bash
npm run pipeline -- --help
```

2. Resolve the reported infrastructure, evidence, or operator condition.
3. Resume through the supported command or typed signal path.
4. Inspect the new attempt identity and terminal result.

## Expected Result

Recovery creates a legal continuation. It does not overwrite the earlier attempt or accept a stale result.

## Verification

Confirm that the durable journal contains the recovery decision. Confirm that each resumed execution uses a new attempt identity.

## Common Failures

- A digest mismatch means the source, graph, registry, or policy changed.
- An expired signal cannot resume a wait.
- A stale completion belongs to an older attempt generation.

## Recovery

Do not edit durable state by hand. Start a new run when the frozen configuration must change.
