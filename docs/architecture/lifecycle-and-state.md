# Lifecycle and State

Status: current
Audience: maintainer

## Purpose

Define the current state authority model.

## Current Behavior

Pipeline state is lifecycle-backed. `status-store.ts` exports lifecycle event/read-model helpers and builds module status projections from lifecycle module state. Guarded fields such as `status`, `current_phase`, `fail_count`, `fail_summaries`, `completed_at`, blocked fields, and attempt/phase timestamps cannot be changed through a plain status save without a lifecycle transition.

Module status transitions use `transitionModuleStatus(...)`. Current statuses include `PENDING`, `IN_PROGRESS`, `READY_FOR_TESTING`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`, and `RATE_LIMITED`. Forge maps to `IN_PROGRESS`; Buster maps to `TESTING`; terminal states clear the active phase.

Run state is scoped by a generated run ID. The pipeline writes run-scoped replay artifacts under `.swarm/logs/pipeline/runs/<run_id>/` and updates `.swarm/logs/pipeline/latest.json` with the active or latest run pointer.

Historical status artifacts are diagnostic/operator evidence in current code; scheduler truth comes from lifecycle read models and typed projections.

## Lifecycle Storage

Lifecycle storage lives under each run directory:

```text
.swarm/logs/pipeline/runs/<run_id>/lifecycle/canonical-events.jsonl
.swarm/logs/pipeline/runs/<run_id>/lifecycle/read-models.json
.swarm/logs/pipeline/runs/<run_id>/lifecycle/append.lock/
```

The append path is:

```text
append proposal
  -> require event type and primary ref
  -> acquire append lock
  -> compute idempotency key
  -> reject duplicate event if already recorded
  -> run lifecycle legality checks against read models
  -> append JSON line
  -> rebuild and save read models
```

The lock exists because multiple runtime surfaces can append near the same time during recovery, waits, cooldowns, and task completion. The idempotency key prevents repeated observations from creating multiple equivalent lifecycle events. Legality checks prevent impossible transitions such as closing a wait that is not open, completing a pipeline that never started, or applying a module attempt event to the wrong attempt.

## Read Models

Read models are projections built from `canonical-events.jsonl`. They give the scheduler fast access to:

- pipeline run status
- module current attempt/status/failure state
- gate status and wait state
- open waits by reference
- open cooldowns for modules and gates
- progression counters used in summaries

The scheduler reads these projections through `status-store.ts` and related projection helpers. Operators normally read them through `--status` instead of opening `read-models.json` directly.

## Why Not Just Edit Status JSON

Plain status JSON is still useful as compatibility and diagnostic evidence, but it is not enough for the current runtime because:

- it cannot prove which run and attempt produced a state
- it cannot safely represent concurrent wait/cooldown/recovery events
- it can be overwritten without replay history
- it cannot explain why a transition was legal at the time

The lifecycle log solves this by storing events with refs, timestamps, idempotency keys, and typed data. Read models then provide the convenient current-state view.

## External Evidence

External systems produce evidence that can influence lifecycle only through adapters:

- Redis completions are projected and adjudicated by `completion-adjudicator.ts`.
- Gateway/session observations are checked by stale recovery and session authority helpers.
- Buster task outputs and dead letters explain task execution but do not directly write module state.
- Discord notifications are presentation surfaces and are never scheduler authority.

This authority split is deliberate. It lets Nova recover from restarts without trusting whichever live surface happened to produce the latest message.

## Authority And Evidence Matrix

| State or evidence | File/stream | Code owner | Authority rule |
| --- | --- | --- | --- |
| canonical lifecycle events | `.swarm/logs/pipeline/runs/<run_id>/lifecycle/canonical-events.jsonl` | `status-store-lifecycle/appenders.ts` | append-only scheduler truth; every event needs type, primary ref, idempotency key, and legality check |
| lifecycle read models | `.swarm/logs/pipeline/runs/<run_id>/lifecycle/read-models.json` | `status-store-lifecycle/read-models.ts`; `projections.ts` | scheduler read surface rebuilt from canonical events |
| append lock | `.swarm/logs/pipeline/runs/<run_id>/lifecycle/append.lock/owner.json` | `status-store-lifecycle/storage.ts` | serializes concurrent recovery, wait, cooldown, and completion appends |
| latest pointer | `.swarm/logs/pipeline/latest.json` | `artifact-bundle.ts`; `status-store.ts` | discovery pointer to active/latest run, not full state authority |
| active session authority | read model `active_sessions.modules` and `active_sessions.gates` | `session-authority.ts`; `pipeline-runner-recovery.ts` | requires `run_id`, `attempt`, `dispatch_id`, `session_key`; diagnostic files cannot rehydrate authority |
| Redis completion | `swarm:pipeline:<project>:completions` | Nova completion adjudicator; Buster `task-completion.ts` | accepted only when terminal evidence matches active dispatch identity |
| Redis dead-letter | `swarm:buster:tasks:dead-letter` | Buster `task-completion.ts` | failure evidence for malformed/runtime task failure before ACK |
| Discord and pod logs | `discord.jsonl`, Kubernetes logs | telemetry/notification sinks and runtime containers | presentation and diagnostics only |

## Recovery Invariants

- Stale recovery may reset state only after lifecycle authority confirms the active session identity and monitor/termination evidence proves the session is terminal or stopped.
- `recovery.stale_blocked` preserves active-session evidence when identity is weak or stop confirmation fails.
- Buster must not mutate Nova lifecycle state directly. It emits completion or dead-letter evidence, then Nova adjudicates it.
- Buster task ACK happens only after `ensureTaskTerminalBeforeAck()` proves completion or dead-letter evidence.
- Lifecycle legality rejects impossible append order, including duplicate terminal run completion, closing unopened waits, and attempt mismatch.

Verification:

```bash
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node --test tests/verification/e2e/*.test.mjs
```
