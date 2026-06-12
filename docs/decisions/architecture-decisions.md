# Architecture Decisions

Status: current
Audience: maintainer

## Two-agent swarm

Decision: KubeClaw deploys Nova and Buster as separate agent releases using the same Helm chart.

Reason: Nova owns orchestration and lifecycle authority, while Buster owns destructive test execution in a sandbox image and can be granted a different runtime/security posture.

## Redis as transport

Decision: Redis carries Buster task/completion traffic and pipeline telemetry streams.

Reason: The pipeline already uses Redis task, completion, replay, and telemetry services, and Buster's worker loop is built around Redis consumer groups and pending recovery.

Source proof: `skills/buster/pipeline/services/task-queue.ts` owns `BUSTER_TASK_STREAM`, consumer group setup, pending reclaim, ACK ordering, and malformed task dead-letter behavior. `skills/buster/pipeline/services/task-completion.ts` owns completion and dead-letter fields. `skills/nova/pipeline/services/telemetry-stream.ts` and `skills/common/pipeline/redis-transport.ts` own telemetry stream writing.

Verification: `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` and `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs`.

## Lifecycle Events As State Authority

Decision: Nova's lifecycle read models and canonical events are the state authority for module/gate progress.

Reason: Status files, Discord messages, Redis completions, and artifact bundles are useful evidence, but scheduler decisions must come from the guarded lifecycle path so recovery can rebuild state consistently.

Source proof: `skills/nova/pipeline/services/status-store.ts` exports lifecycle append/read helpers and guards direct writes to lifecycle-owned fields. `skills/nova/pipeline/services/status-store-lifecycle/appenders.ts` owns event append behavior. `skills/nova/pipeline/services/artifact-bundle.ts` owns `latest.json`, run-scoped replay, operator mirrors, and diagnostic fallback artifact roles.

Verification: `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` and `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery`.

## Source-backed documentation

Decision: Active docs must follow current source and verification instead of archived plans.

Reason: The repository contains substantial historical material under `docs/archive/`; keeping current docs separate prevents old implementation maps from becoming accidental authority.

Source proof: `scripts/docs-check.mjs` excludes `docs/archive/` from active docs link checks, checks generated reference markers, and rejects `Status: current` pages that contain target-state sections. `scripts/docs-inventory.mjs` and `scripts/docs-generate.mjs` own generated inventory/reference pages.

Verification: `npm run docs:check`.

## Decision Change Checklist

Before changing one of these decisions, inspect the owning source file and run the named verifier. If the source does not prove the new behavior, document it as a limitation or future decision instead of changing the decision text.
