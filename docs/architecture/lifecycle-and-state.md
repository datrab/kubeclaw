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
