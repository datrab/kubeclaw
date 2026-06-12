# Resiliency, Telemetry, & Error Handling Review

## 1. Domain Health Assessment

The resiliency surface is partially strong: many authority-changing paths fail closed, including approval corrupt/invalid state (`P12-R002`, `P12-R003`, `P12-R004`), Redis/local completion conflicts (`P17-R010`, `P17-R015`), status lifecycle guard violations (`P14-R003`), and registry/contract boundaries (`P02-R001`, `P13-R002`, `P13-R006`, `P13-R007`). Observability is also deliberately non-blocking in most sinks: filesystem mirrors, Redis telemetry, Discord telemetry, usage/cost reporting, and completion archiving all return degraded/error results rather than blocking core orchestration (`P16-R003`, `P16-R014`, `P16-R015`, `P16-R016`, `P16-R017`, `P16-R022`, `P17-R014`).

The current structural risk is that the architecture treats telemetry as optional even for several terminal paths. ACP transcript terminal objects now have a mapped source sanitization guarantee through the common redaction facade, and contract-invalid diagnostics are source-redacted by `contract-diagnostics.js`, so raw/coerced plugin values are not allowed to cross those boundaries. Timeout management is also distributed: module/gate/session waits receive relative `timeoutMinutes`, rate-limit cooldowns can extend deadlines, transcript activity can extend session deadlines, and the pipeline lock has no lease/absolute deadline (`P05-LL001`, `P05-LL002`, `P09-LL003`, `P17-LL002`, `P17-R023`, `P18b-R001`, `P06-LL002`). This creates an “immune system” that usually avoids blocking work, but can silently lose the evidence needed to diagnose failure, leak unsanitized transcript data, or hold the single run lock while nested sleeps continue.

## 2. Critical Structural Flaws (Must Fix)

### 2.1 ACP transcript terminal egress is source-sanitized

Contract-invalid diagnostic payloads are no longer raw carriers: scheduled validator/generator, gate, validator, worker, and remediation normalizers route through `contract-diagnostics.js`, which emits redacted summaries and safe identifiers only (`P06-R006`, `P06-R007`, `P13-R002`, `P13-R003`, `P13-R006`, `P13-R007`). ACP terminal polling now follows the same source-redaction rule: polling terminal paths return redacted `transcript.summary` evidence when ACP sessions end without output or without HEAD movement (`P17-R004`, `P17-R008`).

The observability maps show protections around other surfaces: known telemetry payloads are schema-validated before delivery (`P16-R012a`, `P16-X001`), Redis stream emission sanitizes payload before XADD (`P16-R022`), redacted prompt/transcript artifact writers and terminal-summary sanitizer exist (`P00b-X003`, `C00a-PROMPT-001`, `P11-PR001`, `P17-R022`), Discord integration owns redaction for its payloads (`P03-R003`, `P16-R015`), and contract diagnostics redact before caller projection. Terminal ACP rows state that returned transcript evidence is sanitized before core logs, pipeline JSONL, Discord, or returned control results consume it.

Systemic impact: an ACP no-output terminal path can become the highest-value diagnostic payload in the run, exactly when operators will inspect logs/Discord/JSONL. Secret hygiene is now enforced by the polling/redaction layer instead of depending on each caller to remember to sanitize.

### 2.2 Terminal telemetry can be lost behind “non-critical,” DEBUG-only, or optional-hook paths

The maps repeatedly classify observability failures as soft, which is correct for best-effort mirrors but unsafe for terminal operator awareness when no alternate alert is guaranteed. `emitEventNonBlocking` resolves undefined on any emit failure (`P16-R026`), disk append failure is only a noncritical incident (`P16-R025`), Redis constructor and Redis emit failures return soft/null/error results (`P16-R020`, `P16-R022`, `P16-X003`), and sink listener failures merely degrade and continue (`P16-R017`). For polling/session flows, timeout nudge delivery is swallowed with no telemetry (`P17-R020`, `P17-T020`, `P17-PR001`). For rate-limit flows, pause/resume Discord failures remain non-blocking (`P18b-R004`), and RV-24 now routes terminal rate-limit exhaustion through a central finalizer that writes durable local operator evidence before guarded telemetry/Discord hooks (`P18b-R002`, `P18b-R003`, `P18b-R007`, `P18b-R008`, `P18b-X003`).

This conflicts with the fail-closed intent of terminal conditions. Session timeout and completion adapter fatal results are control-flow significant (`P17-R011`, `P17-R015`), and rate-limit exhaustion is now covered by RV-24's local-first finalizer (`P18b-R002`, `P18b-R007`). A returned result is not enough if the pipeline caller also hits a telemetry sink failure; terminal operator evidence must be locally durable before network delivery is attempted.

Systemic impact: rate-limit exhaustion no longer depends on optional caller hooks for terminal evidence; remaining observability consolidation work focuses on broader degraded/restored sink state. Terminal state may be safe only when an operator can locally inspect why the run stopped and how to recover.

### 2.3 Nested timeout and cooldown budgets are not governed by one absolute run deadline

Timeouts are scattered across relative loops and wrappers. Worker helpers receive `timeoutMinutes` and then kill/finalize only after the delegated poll/wait returns (`P05-LL001`, `P05-LL002`). Gate fix-cycle scaffolds poll for session end with `timeoutMinutes` and kill after the session result (`P09-LL003`). Review/Buster gate attempts wrap work in rate-limit recovery whose pause budget does not consume attempt count (`P10-LL002`, `P11-LL002`). The session-end poll can extend its deadline for rate-limit cooldowns and active transcript grace (`P17-LL002`, `P17-R021`, `P17-R023`), while rate-limit handling can sleep for required platform cooldown hours per pause and replay persisted cooldown sleeps after restart (`P18b-R001`, `P18b-R006`).

At the same time, the top-level pipeline state machine has no local deadline (`P06-LL001`). The run lock now has a strict heartbeat lease (`P06-LL002`, `P06-R002`, `P06-R003`), but the maps still do not define a parent budget that prevents child waits from extending beyond a run-level SLA while the lease is being refreshed. The maps show cleanup after worker waits (`P05-LL001`, `P05-LL002`) and adapter cleanup on abort for event waits (`OI42-LL001`, `OI42-LL004`).

Systemic impact: children may not be orphaned in the happy path, but the lock and operator experience can still be starved by unbounded parent duration. A rate-limited child can effectively turn a module/gate timeout into “timeout plus cooldown hours plus transcript grace,” with the pipeline lock held and no map-defined global abort budget.

### 2.4 The run lock uses leased staleness recovery and CRITICAL operator telemetry

The run lock is the per-swarm concurrency authority (`P06-LB010`). It now writes a schema-versioned leased record with heartbeat, expiry, and stale timestamps (`P06-LL002`). Acquisition fails closed for malformed/corrupt/non-lease evidence, reclaims only expired leased locks, and writes CRITICAL durable operator evidence with manual cleanup instructions (`P06-R002`, `P06-T002`). Release stops the heartbeat timer first; mismatched or malformed/non-lease release writes CRITICAL durable evidence and throws without deleting the lock (`P06-R003`, `P06-T003`).

Systemic impact: crash recovery no longer depends on same-host PID liveness, and cross-host stale locks are recoverable by lease expiry. Corrupt lock files still block safely for manual cleanup rather than crashing the recovery mechanism.

## 3. Simplification & Consolidation Targets (Should Fix)

### 3.1 Contract-diagnostic redaction is centralized at the builder

`contract-diagnostics.js` now owns contract-invalid redaction for validator/generator/gate/worker normalizers. Raw/coerced preview fields are deleted; callers receive a redacted diagnostic envelope with validation errors, safe ids/refs/invocation, and redacted raw/coerced summaries only (`P06-R006`, `P06-R007`, `P13-R002`, `P13-R003`, `P13-R006`, `P13-R007`). The implementation reuses the existing redaction facade instead of adding a separate scrubber (`C00a-L005`, `C00a-PROMPT-001`, `P16-R022`).

### 3.2 Replace relative timeout plumbing with one absolute deadline/abort budget object

Merge `timeoutMinutes`, poll deadlines, rate-limit cooldown extension, transcript grace extension, and event-wait abort into a shared run/step budget object. Child waits should receive the remaining parent budget and an `AbortSignal`; only explicitly policy-approved cooldown replay should extend it (`P05-LL001`, `P05-LL002`, `P09-LL003`, `P10-LL002`, `P11-LL002`, `P17-LL002`, `OI42-LL001`, `OI42-LL004`, `P18b-R001`, `P18b-R006`).

### 3.3 Degraded observability reporting uses one circuit-breaker controller

Structured event mirror, Redis telemetry stream, sink dispatch, notification sink, and Discord integration degraded/restored transitions now route through central `recordObservabilityDegraded` / `recordObservabilityRestored` in `observability.js` (`P16-R003`, `P16-R016`, `P16-R017`, `P16-R024`, `P16-R026`, `P21-L005`, `P21-L006`, `P18b-R004`, `P18b-R008`). The controller owns the only health map for these surfaces, emits degraded only on healthy→degraded transitions, emits restored only after prior degradation, and writes the shared durable operator-alert format for accepted transitions. Rate-limit exhaustion terminal alerts remain centralized by RV-24.

### 3.4 Delete or retire pass-through observability shims after import migration

Several rows describe shim or forwarding surfaces that add no resiliency semantics: P00b scoped files are static common import/re-export surfaces (`P00b-R001`), Nova exposes common redaction/telemetry helpers through re-exported boundaries (`P00b-X003`, `P00b-X004`, `P00b-X005`), and P03 common webhook/gateway helpers are used via shims (`P03-R001`, `P03-R005`). Consolidate callers on the common owners and remove shim-only layers from the active maps once imports are migrated.

## 4. Traceable Action Items

| Priority | Task Title | Acceptance Criteria | Map Evidence Citations |
| --- | --- | --- | --- |
| P0 | Redact contract diagnostics at source | Resolved: contract diagnostic builders no longer expose raw input/result/coerced objects; diagnostics contain only redacted summaries, stable validation paths/messages, and safe identifiers. | `P06-R006`, `P06-R007`, `P13-R002`, `P13-R003`, `P13-R006`, `P13-R007`, `C00a-L005`, `P16-R022` |
| P0 | Sanitize ACP transcript terminal results before any caller can log or emit them | Resolved: `pollForFile`, `pollStatus`, Forge completion polling, and `pollForSessionEnd` return redacted transcript summaries/detail markers, never raw transcript objects; terminal telemetry/Discord/control results consume only sanitized transcript evidence. | `P17-R004`, `P17-R008`, `P17-T004`, `P17-T008`, `P17-R022`, `P00b-X003`, `C00a-PROMPT-001` |
| P0 | Add durable terminal-alert fallback for telemetry sink failure | Resolved: timeout, rate-limit exhaustion, completion adapter fatal/error, and lock conflict paths write local durable operator alerts even when Redis/Discord/event sinks fail; `emitEventNonBlocking` failure cannot make terminal alerts disappear silently. | `P16-R020`, `P16-R022`, `P16-R025`, `P16-R026`, `P17-R011`, `P17-R015`, `P17-R020`, `P18b-R002`, `P18b-R008`, `P06-T002` |
| P0 | Add lock lease/staleness recovery and CRITICAL lock telemetry | Resolved: lock records include lease/heartbeat/stale metadata; expired leased locks are reclaimed; malformed/non-lease evidence emits CRITICAL durable operator evidence and manual cleanup instructions; mismatched/malformed release is no longer silent. | `P06-LB010`, `P06-LL002`, `P06-R002`, `P06-R003`, `P06-T002`, `P06-T003` |
| P1 | Introduce shared absolute deadline and abort-budget object | Module workers, gate fix cycles, polling, rate-limit recovery, transcript grace, and event waits receive a common budget object; child waits cannot exceed remaining parent budget unless a documented cooldown policy explicitly extends it. | `P05-LL001`, `P05-LL002`, `P09-LL003`, `P10-LL002`, `P11-LL002`, `P17-LL002`, `P17-R021`, `P17-R023`, `P18b-R001`, `P18b-R006`, `OI42-LL001`, `OI42-LL004` |
| P1 | Make rate-limit exhaustion observability non-optional | **Resolved by RV-24.** Generic rate-limit wrappers route through `finalizeSessionRateLimitExhaustion`; the duplicate `appendDurableRateLimitExhaustionAlert` path was deleted; durable local operator evidence is written before telemetry/Discord hooks; hook failures are caught, WARN logged, and mirrored as `rate_limit_exhaustion_delivery_failed` durable alerts. | `P18b-R002`, `P18b-R003`, `P18b-R004`, `P18b-R007`, `P18b-R008`, `P18b-X003`, `P10-LL002`, `P11-LL002`; `tests/verification/contracts/check-rate-limit-slice-surface.mjs`; `tests/verification/contracts/check-operator-alert-surface.mjs` |
| P1 | Consolidate degraded/restored observability paths | **Resolved by RV-25.** Structured-event mirror, Redis stream, telemetry sink dispatch, notification sink dispatch, and Discord delivery use central `observability.js` degraded/restored state and shared durable operator-alert records; duplicate degraded/restored transitions are suppressed. | `P16-R003`, `P16-R004`, `P16-R014`, `P16-R015`, `P16-R016`, `P16-R017`, `P16-R024`, `P21-L005`, `P21-L006`, `P03-R003` |
| P2 | Remove shim-only telemetry/redaction boundary layers | Runtime imports target common owners directly; P00b/P03 shim rows that only re-export or forward common helpers are retired from active implementation maps. | `P00b-R001`, `P00b-X003`, `P00b-X004`, `P00b-X005`, `P03-R001`, `P03-R005`, `P03-X001`, `P03-X003` |
