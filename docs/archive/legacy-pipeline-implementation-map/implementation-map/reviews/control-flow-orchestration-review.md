# Control Flow & Orchestration Review

Scope: `function-call-map.md`, `logic-and-algorithms-map.md`, `acp-protocol.md` only. This review cites map rows as structural evidence and does not infer source behavior beyond those maps.

## 1. Domain Health Assessment

The orchestration spine has strong recent structure: the pipeline runner routes through explicit top-level planning/state-machine/terminal seams (`P06-F003`, `P06-F004`, `P06-F005`, `P06-LB002`), module attempts have an explicit loaded-status/phase state machine (`P08-F002`, `P08-LB001`, `P08-LB002`), gate execution is consolidated behind the strategy-owned generic runner (`P09-LB003`), and Buster module/gate completion has been cut over to event-driven Redis/local evidence waits (`P17-F007`, `OI42-F001`, `OI42-F002`, `OI42-F003`, `P11-LL001`).

The main pipeline state machine, gate runtime, and ACP observation layer now have explicit seams: ACP session/transcript observation is event-driven through the common adapter, RV-12 canonicalized the ACP session/transcript payload schemas at the producer boundary, and RV-13 removed direct review/Buster/approval runtime gate wrappers in favor of registry strategy dispatch (`P09-LB003`, `P10-F006`, `P11-F007`, `P10-LL003`, `P11-LL003`).

## 2. Critical Structural Flaws (Must Fix)

### 2.1 ACP push contract is implemented through a common edge adapter

Resolved by RV-11: ACP-specific event names are produced by `createAcpMonitorEventAdapter` behind `pipeline-event-contract.js`, and `waitForSessionIdle`, `pollForSessionEnd`, Buster `monitorSession`, and launch observation consume EventBus waits instead of owning ACP gateway/transcript polling loops. Approval-gate wait polling was replaced by RV-16/OI-46 with strict `approval.signal` EventBus waits (`P12-LL001`, `P12-ACP002`).

### 2.2 Transcript delta and monitor-state shapes are canonicalized

Resolved by RV-12: `acp-gateway-contract.js` owns exact ACP session-state and transcript-delta payload validators, `pipeline-event-contract.js` calls those validators from `assertPipelineEvent`, and `acp-monitor.js` builds payloads that use `transcript_offset`/`byte_offset` for transcript deltas. The event bus rejects malformed or undocumented ACP payload fields synchronously, including legacy transcript-delta `offset`, before consumers can observe poison messages (`P04-ACP003`, `C00b-ACP001`, `P16-ACP003`, `P17-ACP001`, `P17-ACP002`, `B01-ACP001`, `B01-ACP003`).

### 2.3 Gate orchestration is consolidated under the generic GateRunner

Resolved by RV-13: `runGate` is the only runtime gate entrypoint. It resolves gate execution through the registry `gateControl` strategy adapter (`standard`, `remediable`, or `waitable`) rather than a review/Buster/approval dispatch table (`P09-LB003`). Review, Buster, and approval files expose only registry stage functions and adapter/controller factories; direct runtime wrappers (`runReviewGate`, `runBusterGate`, `runApprovalGate`) and compatibility loop exports are gone (`P10-F006`, `P11-F007`, `P10-LL003`, `P11-LL003`).

The generic GateRunner now owns fail-closed execution telemetry for dispatch, adapter, controller, and contract failures. Request-fix orchestration stays in `runRemediableGateControlLoopResult`; approval wait resolution stays in `runWaitableGateControlLoopResult`; concrete gate stages remain execution stages only.

### 2.4 ACP stop/kill lifecycle is centralized behind the RV-14 termination controller

**Resolved by RV-14.** ACP session termination now enters the shared `terminateSession` controller (`P04-LB011`, `C00b-ACP005`) instead of letting orchestration, recovery, shutdown, Buster monitor, and Buster task wrappers synthesize kill state independently. The controller wraps low-level lifecycle `killSession`, owns an isolated hard-capped grace budget, validates the canonical `confirmed/unconfirmed/terminal/cleanup` schema, and returns `unconfirmed:true` when death is not confirmed inside that grace period.

Systemic impact after resolution: orchestration/reviewer untracking, restart recovery blocking, Buster hard-timeout handling, Buster task cleanup, shutdown, and summary cleanup consume the same termination result. Local `killIssued`/`killConfirmed` synthesis and post-kill monitor rechecks were removed from active runtime surfaces (`P05-LB007`, `P05-ACP004`, `P06-ACP002`, `B01-L008`, `B02b-L004`).

## 3. Simplification & Consolidation Targets (Should Fix)

### 3.1 Delete pass-through Nova/Buster compatibility shims once imports are migrated

The maps identify multiple files that contain no logic or state and only `export *`: Nova top-level helper shims (`P00b-F001` through `P00b-F007`, `P00b-LB001`, `P00b-LS001`), Nova gateway/webhook facades (`P03-F010`, `P03-F011`), Nova agent facades (`P04-F001` through `P04-F004a`, `P04-LB001`), Buster shim sets (`B00b-F001`, `B00b-L001`, `B01-F001`), and the module Buster phase compatibility shim (`P07-F008`). These add import-surface area without behavior.

Recommendation: migrate callers to the common owner or real internal owner and delete the shim files in one import-cleanup pass (`P00b-F001`-`P00b-F007`, `P03-F010`, `P03-F011`, `P04-F001`-`P04-F004a`, `B00b-F001`, `B01-F001`, `P07-F008`).

### 3.2 Collapse ACP transcript/progress telemetry aliases into one producer contract

ACP transcript/progress emission is described at common, Nova, Buster, and telemetry layers with different wording and fields (`P04-ACP003`, `P16-ACP003`, `P16-ACP004`, `P17-ACP002`, `P17-ACP003`, `B01-ACP002`, `B01-ACP003`, `C00b-ACP001`).

Recommendation: make common ACP monitor the only producer of normalized transcript/progress events and have Nova/Buster call a typed producer rather than each mapping identity/detail fields locally (`C00b-ACP001`, `P16-ACP003`, `B01-ACP003`).

### 3.3 Replace fixed-sleep retry loops where an event/wait primitive already exists

RV-17 resolved the fixed sleeps in module retry (`P07-LL001`), gateway/network retry (`P03-LL006`, `P04-LL003`), and Git push retry (`P03-LL002`) by routing each retry wait through shared abortable timing utilities with caller budget/signal propagation. Event primitives remain the authority where a local signal exists (`OI42-F001`, `OI42-LL001`, `OI42-LL004`), while external Git/gateway retries remain bounded retry loops because no remote completion event exists.

Recommendation: keep new retry/control paths on shared abortable waits or EventBus waits; do not reintroduce raw fixed sleeps in orchestration paths.

### 3.4 Keep P06/P08 state-machine slices, but remove redundant wrappers around them

The runner extraction itself is intentional and verified (`P06-F003`, `P06-F004`, `P06-F005`, `V04b-F004`), and module attempt routing is explicit (`P08-F002`, `P08-LB002`). The simplification target is not to re-merge the main state machines; it is to remove redundant compatibility wrapper paths around them, especially gate direct helpers and static re-export facades (`P10-F006`, `P11-F007`, `P07-F008`).

Recommendation: preserve the state-machine seams that own decisions, delete wrapper-only routes, and update tests to exercise the owner seams directly (`P06-F004`, `P08-F002`, `P09-LB003`, `P10-LL003`, `P11-LL003`, `P07-F008`).

## 4. Traceable Action Items

| Priority | Task Title | Acceptance Criteria | Map Evidence Citations |
| --- | --- | --- | --- |
| P0 | Implement ACP event adapters for session state and transcript deltas | **Resolved by RV-11.** `acp.session.state` and `acp.transcript.delta` are produced through `pipeline-event-contract.js`; `waitForSessionIdle`, `pollForSessionEnd`, Buster `monitorSession`, and launch observation use event waits with bounded polling fallback; reserved-only ACP event note is removed from the map. | `OI42-ACP001`, `OI42-F001`, `OI42-LL001`, `P04-LL001`, `P17-LL002`, `B01-L007`, `V06b-LL001` |
| P0 | Canonicalize ACP TranscriptDelta and MonitorState schemas | **Resolved by RV-12.** One common schema names transcript offset/count fields exactly once; producer rows and consumer rows use `transcript_offset`/`byte_offset`; schema validation occurs at producer boundary; legacy delta `offset` and undocumented ACP payload fields are rejected synchronously. | `P04-ACP003`, `C00b-ACP001`, `P16-ACP003`, `P17-ACP002`, `B01-ACP003`, `P04-LB004`, `B01-ACP001`, `P17-ACP001` |
| P0 | Make Generic GateRunner the sole runtime gate orchestration path | **Resolved by RV-13.** Review/Buster/approval direct runtime wrappers and compatibility loop exports are deleted; runtime calls enter through generic `runGate` registry strategy dispatch; request-fix/wait loops are covered through generic remediable/waitable engine tests. | `P09-LB003`, `P10-F006`, `P11-F007`, `P10-LL003`, `P11-LL003`, `P09-F004`, `P21-F006` |
| P1 | Centralize ACP session termination result handling | **Resolved by RV-14.** Shared `terminateSession` wraps lifecycle `killSession`; orchestration, recovery, shutdown/Buster monitor, summary cleanup, and Buster task session wrappers consume the same strict `confirmed/unconfirmed/terminal/cleanup` result schema with isolated grace-period confirmation. | `P04-LB007`, `P04-LB011`, `C00b-ACP005`, `P05-LB007`, `P06-ACP002`, `B01-L008`, `B02b-ACP002`, `B02b-ACP003` |
| P1 | Delete wrapper-only compatibility shims after import migration | No runtime imports target shim-only files; files with static `export *` and no branch/state logic are removed or archived; map rows for these shims are retired. | `P00b-F001`-`P00b-F007`, `P00b-LB001`, `P00b-LS001`, `P03-F010`, `P03-F011`, `P04-F001`-`P04-F004a`, `B00b-F001`, `B01-F001`, `P07-F008` |
| P1 | Move approval waits from fixed polling to waitable/event signal flow | **Resolved by RV-16.** Approval gate-state filesystem changes are isolated in `approval-signal-event-adapter.js`; the runner waits on strict `approval.signal` / `fatal.error` EventBus events with the current deadline and no fallback polling loop. | `P12-LB005`, `P12-LL001`, `P12-LL002`, `P12-ACP001`, `P12-ACP002`, `P09-LB007` |
| P2 | Replace fixed sleeps in retry/control paths with abortable wait utilities where possible | **Resolved by RV-17.** Module retry, gateway invoke retry, lifecycle spawn retry, Nova Git push retry, and Buster Git retry backoff use shared abortable `sleep(..., { budget, signal })`; abort/budget errors propagate instead of being treated as another retry. | `P07-LL001`, `P03-LL002`, `P03-LL006`, `P04-LL003`, `OI42-LL001` |
| P2 | Update implementation maps after consolidation | `function-call-map.md`, `logic-and-algorithms-map.md`, and `acp-protocol.md` show one ACP schema, one gate runtime path, one termination controller, and no retired shim rows in active runtime surfaces. | `function-call-map.md`, `logic-and-algorithms-map.md`, `acp-protocol.md` |
