# OI-42 Event-Driven Completion Refactor Plan

Status: phase 6 complete; Buster module/gate event-driven completion implemented, verified, cleaned up, and closed
Owner: Nova / maintainers
Related issue: `docs/open-issues.md` OI-42

## Purpose

Record the approved planning direction for OI-42 so the execution phase does not regress into small hybrid polling patches.

The goal is to move event-capable completion surfaces out of active orchestration polling and into adapter-driven events. ACP and subagent/session observation may still poll internally because their current external APIs do not expose push semantics.

## Scope becoming event-driven now

These surfaces should transition from sleep/pull loops in orchestration to event waits driven by edge adapters:

1. **Buster module completion**
   - Pre-cutover path: repeated Redis completion reads from the module wait path.
   - Active Phase 4 path: Redis completion evidence emitted as `completion.evidence` and consumed by a central completion controller through `waitForModuleBusterCompletion(...)`.
   - Redis remains the primary completion authority where current behavior already prefers Redis.

2. **Buster gate completion**
   - Replaced path: runner-owned repeated Redis/output checks.
   - Active Phase 4 path: same completion event route as module completion through `waitBusterGateCompletionEvidence(...)`, with gate identity fields preserved.

3. **Local evidence updates**
   - Current path: filesystem evidence is converted into local evidence update events.
   - Target path: local evidence adapter emits `local.evidence.updated` when relevant output/status evidence changes.
   - Local evidence is fallback/wakeup/context unless current gate behavior already allows file evidence to terminally resolve.

## Surfaces remaining polling for now

These boundaries do not currently provide push/SSE/webhook semantics. Polling may remain, but it must be contained inside edge adapters rather than scattered through orchestration logic when those surfaces are refactored.

- ACP session state via gateway `session_status` RPC.
- ACP transcript delta observation.
- Subagent/session cleanup and kill-confirmation loops.

## Phase 1 — Event contract

Add a canonical internal pipeline event/wait contract under the common pipeline contract authority.

Preferred location is a small common service near `skills/common/pipeline/services/task-transport-contract.ts`; avoid bloating the transport contract if a dedicated file is clearer.

### Event envelope

```js
{
  type: 'completion.evidence',
  source: 'redis',
  identity: {
    module_id,
    gate_id,
    run_id,
    attempt,
    dispatch_id,
    session_key,
  },
  payload: {},
  ts: '2026-05-11T00:00:00.000Z'
}
```

### Event types

- `completion.evidence`
- `local.evidence.updated`
- `acp.session.state`
- `acp.transcript.delta`
- `fatal.error`

### Core API

- `emitPipelineEvent(event)`
- `waitForEvent(eventBus, type, identity, { signal, timeoutMs })`
- `waitForAny(eventBus, types, identity, { signal, timeoutMs })`

### Mandatory cleanup rule

Wait APIs must require an `AbortSignal` or equivalent teardown mechanism. When a wait resolves, times out, or reaches a terminal state, all listeners, timers, watchers, and adapter-owned resources associated with the wait must be cleaned up.

This prevents dangling `Promise.race` branches, leaked EventEmitter listeners, leaked `fs.watch` handles, and blocked Redis connections.

## Phase 2 — Edge adapters

Move waiting mechanics to adapters at external boundaries.

### Redis completion adapter

- Use a dedicated Redis client instance for blocking reads.
- Do not share the primary Redis client used for telemetry, task dispatch, normal completion reads, or other commands.
- Use Redis blocking stream reads, e.g. `XREAD BLOCK ...`, to wake on completion-stream entries.
- Emit `completion.evidence` events with the standard envelope.
- On abort, close/unblock the dedicated client.
- Closing the dedicated client while an `XREAD BLOCK` promise is pending will usually throw a connection termination error. During an intentional abort, catch and silence that expected connection error so it does not become an unhandled rejection.

### Local evidence adapter

- Prefer watching specific leaf files/directories needed for Buster completion evidence rather than deep-watching the entire `.swarm` tree.
- Use `fs.watch` only with a debounce of roughly 50–100 ms before emitting `local.evidence.updated`.
- Be aware of native watcher limits such as Linux inotify `ENOSPC`.
- If broad/deep watching becomes necessary, evaluate a robust watcher such as `chokidar` instead of raw `fs.watch`.
- On abort, close watchers and clear debounce timers.

Phase 2 implementation status: `skills/nova/pipeline/services/completion-event-adapters.ts` now provides non-cutover Redis and local evidence adapters. Redis uses a dedicated blocking client and intentional-abort cleanup; local evidence uses `fs.watch` with debounce and watcher cleanup.

No runner cutover should happen in this phase.

## Phase 3 — Buster completion controller

Phase 3 implementation status: `skills/nova/pipeline/services/buster-completion-controller.ts` provides the non-cutover controller that waits for evidence events and delegates Redis terminal decisions to existing adjudication logic.

Conceptual wait:

```js
waitForAny([
  'completion.evidence',
  'local.evidence.updated',
  'fatal.error',
], identity, { signal, timeoutMs })
```

### Race policy

- If valid Redis `completion.evidence` arrives first with terminal PASS/FAIL/RATE_LIMITED/TIMEOUT/conflict evidence, resolve immediately through existing adjudication.
- Do not impose a mandatory 500 ms local filesystem catch-up wait.
- Rationale: current behavior already prefers Redis completion evidence and treats it as the fast canonical path.
- Local evidence remains fallback/wakeup/context unless current gate behavior already allows file evidence to terminally resolve.

## Phase 4 — Runner cutover

Migrate only the Buster completion surfaces first:

- Buster module completion is represented by `waitForModuleBusterCompletion(...)` behind the public `pollDual(...)` / `pollDualWithRateLimitRecovery(...)` call paths.
- Buster gate completion was represented by `buster-gate-completion.js` plus `pollGeneric(...)` runner loops.

Phase 6 removed retired helper surfaces after caller checks proved the active waits use event adapters/controllers.

Phase 4 implementation status: Buster module completion routes through `waitForModuleBusterCompletion(...)` behind the public `pollDual(...)` / `pollDualWithRateLimitRecovery(...)` wrappers, and Buster gate completion routes through `waitBusterGateCompletionEvidence(...)`.

## Phase 5 — Verification and living docs/maps

Phase 5 implementation status: focused contract verification now covers event wait AbortSignal/listener cleanup, `waitForAny` race/timeout cleanup, Redis adapter dedicated-client blocking behavior with a fake Redis adapter, local evidence debounce/watcher cleanup, and Buster module/gate completion controller wrapper behavior. Living implementation maps and OI-42 notes were updated with active event-driven completion and ACP/subagent polling boundaries.

Focused verification should cover:

- event envelope validation and identity matching;
- `waitForEvent` / `waitForAny` timeout and abort cleanup;
- listener cleanup after race resolution;
- Redis adapter dedicated-client behavior and intentional abort error handling;
- local evidence debounce behavior and watcher cleanup;
- Buster module completion controller behavior;
- Buster gate completion controller behavior;
- existing rate-limit, conflict, timeout, and invalid-contract semantics.

Living maps to update during implementation:

- `docs/open-issues.md`
- `docs/pipeline/implementation-map/authority-map.md`
- `docs/pipeline/implementation-map/function-call-map.md`
- `docs/pipeline/implementation-map/logic-and-algorithms-map.md`
- `docs/pipeline/implementation-map/concurrency-and-backpressure.md`
- `docs/pipeline/implementation-map/resiliency-and-error-handling.md`
- `docs/pipeline/implementation-map/external-boundaries.md`
- `docs/pipeline/implementation-map/data-schemas.md`
- `docs/pipeline/implementation-map/dependency-matrix.md`
- ACP-related map notes should state that ACP/subagent observation remains polling until gateway/subagent boundaries support push.

## Phase 6 — Cleanup

Phase 6 is complete. Retired completion-polling helper surfaces were removed after verification proved no active caller remained.

The living implementation maps describe the current event-driven Buster module/gate completion path. Legacy pull/polling references were removed or rewritten for authority, calls, algorithms, concurrency, dependencies, schemas, errors, paths, and ACP boundaries. ACP/subagent observation remains polling by explicit scope decision because current gateway/subagent boundaries do not provide push semantics.

Historical batch notes remain unchanged because this issue did not correct a historical snapshot.
