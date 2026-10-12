# Retained source continuation — open implementation decision

The current WIP resolver requires exact whole-file identities for retained effects/signals and the original lifecycle head. This has not passed WP7 and is not accepted for irreversible payload replacement.

Current production observations:

- `skills/nova/core/execution/engine-run.ts` rejects ordinary resume/recovery after succeeded/failed/cancelled before recording a signal or entering execution. The original run mutation lease encloses final observer flush and adapter shutdown.
- `skills/nova/core/execution/engine-admin.ts` rejects a fresh administrative reopen for these terminal states. Recorded decision replay can still call the real observer drainer.
- `skills/nova/core/execution/engine-run.ts` runNewPipeline calls writeRunSnapshots before execution. `skills/nova/core/execution/engine-snapshots.ts:106` rejects any existing run/graph/registry snapshot with RUN_ALREADY_EXISTS. Therefore the public new-run entrypoint cannot append a second run to the retained snapshot. An initial review message incorrectly inferred reuse without following this callee; that inference is withdrawn. Actual duplicate-entrypoint rejection remains a required test.
- Direct late Wait and Delivery adapter duplicates write their own stores; they do not themselves append to the old Core run. These must retain their original consumer behavior after projection.
- `skills/common/plugin-runtime/foundation/observability/attempt-projection.ts` already provides readAttemptJournalPrefix: canonical path, regular inode, explicit byte prefix bound, no repair. It supplies a reusable physical prefix read but does not authorize arbitrary Core continuation.

No broad readRunEvidence change has been made. Before selecting a prefix design, the authority rule must distinguish permitted continuation from conflicting/retracting history. A valid hash chain alone is insufficient. New lifecycle creation/resume/attempt/signal activity cannot silently be treated as harmless telemetry. Original terminal effect/request/result identity and wait-resolution authority must remain checked. No claim that arbitrary future appends remain readable is made.

Required decisive proof includes actual late original entrypoint behavior, selected original prefix retention, rejection of conflicting/retracting tails, and genuine late Wait/Delivery duplicates without a second POST. This is a pre-acceptance design gap, not evidence of a passing WP7 test.

Concrete remaining continuation path: ObserverRuntime.drain takes one snapshot of input events. deliverObserver can append plugin-domain-event.v2 records during delivery. An event emitted during the final drain can therefore be absent from that drain's input snapshot and have no delivery row yet. The existing inventory checks latest existing delivery rows, not absence of a row for every subscribed event. Recorded administrative replay may drain this event later, adding observer effects/domain records to a terminal run. This requires a real producer test; it cannot be dismissed as a corrupt raw append.

Proposed review boundary, not implemented: permit only validated observer continuation tied to pinned granted observer registrations, actual source event/delivery identity and complete Core effect audit. Forbid all run/attempt/wait-resolution lifecycle changes and any rewrite/redefinition of selected original effect, wait or signal authority. Full current chains and exact retained prefixes must both validate. Merely accepting any well-formed hash suffix would weaken the contract.
