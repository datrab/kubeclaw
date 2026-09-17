# Build A Plugin That Uses External State Or Effects

Status: implemented to the locally verified platform limits
Audience: stage and adapter author, runtime maintainer, reviewer
Owner: plugin-foundation
Evidence: skills/nova/plugins/blueprint-sync/src/stage.ts; skills/nova/core/effects/coordinator.ts; skills/nova/core/effects/journal.ts; skills/nova/core/execution/effect-recovery.ts; skills/common/plugins/state-store/src/adapter.ts; skills/common/plugin-runtime/sdk/src/runtime.ts
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Reference implementation: `kubeclaw.blueprint-sync` with `kubeclaw.state-store` and `kubeclaw.git-workspace`
Applies to: stages and adapters that create external state or effects
Last verified: focused effect, recovery, state, and cleanup checks on 2026-09-16

## Objective

Build a stage that requests controlled external work without hiding authority or
uncertain outcomes inside the stage module. Make duplicate delivery, interruption,
retry, cancellation, resume, and cleanup explicit.

This guide uses the existing Blueprint Sync stage as its concrete implementation.
It synchronizes files, can create a Git commit, appends durable state, and writes a
summary artifact through capability adapters. The guide does not copy that production code.
Each step links to the relevant implementation.

This is plugin documentation. It does not define `.swarm/pipeline.json` and does not
claim an end-to-end deployed pipeline run.

## Why The Minimal Plugin Is Not Enough

The first plugin returns a value and creates no external state. Retrying that pure
calculation is simple. An effectful stage can stop after an external system accepts a
request but before KubeClaw records the receipt. Repeating the mutation can then
create a second commit, notification, deployment, or state entry.

The selected design separates four responsibilities:

- the stage describes intent and interprets the result;
- the adapter owns credentials and external protocol behavior;
- the effect coordinator records request, acceptance, lock ownership, and receipt;
- recovery refuses to guess when durable evidence cannot determine the outcome.

**Benefit:** A stage cannot silently acquire authority, and recovery can distinguish
a safe repeat from an uncertain mutation.

**Cost:** Authors must design stable resource identity, idempotency, reconciliation,
and cleanup. A simple API call becomes a documented protocol.

**Alternative:** A stage could import filesystem, Git, database, or HTTP libraries
directly. That would bypass grants, effect journals, fencing, and central recovery.
KubeClaw does not support that shortcut.

**Reconsider when:** The platform provides a higher-level transactional workflow
contract that owns a complete multi-effect unit.

In this guide, an effect is a requested change outside stage memory. A receipt is
the durable adapter result for that request. A fence proves that the current owner
still holds the resource lock when it performs the mutation.

## Use An Existing Capability Before You Add An Adapter

Check the closed capability vocabulary first. If an installed adapter already owns
the required operation, create only the stage registration and request that
capability. Blueprint Sync follows this pattern:

- `artifacts.read` verifies bound approval and lineage evidence when it exists;
- `artifacts.write` stores immutable result evidence;
- `state.append` records durable sync history;
- `git.sync` changes selected files;
- `git.commit` records the repository result.

Add a capability adapter only when no supported adapter owns the external protocol.
Adding a new capability name is a Core and policy change, not a package-only change.

> **Declared authority:** [Blueprint Sync declares five capabilities instead of importing their implementations](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/plugin.json#L1-L24).
>
> **Closed vocabulary:** [Foundation defines allowed operations, resource types, and constraint fields for each known capability](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts#L24-L54).

## Follow One Effectful Stage From Package To Test

Blueprint Sync is the maintained reference. Follow its structure, but select only
the capabilities that your operation needs.

1. Define strict configuration, input, and result schemas.
2. Add one stage registration and list every capability call.
3. Keep credentials and adapter configuration out of stage input.
4. Validate input before the first capability call.
5. Order mutations and evidence writes deliberately.
6. Return `passed` only after all required effects complete.
7. Define a stable canonical resource ID for each effect.
8. Test real registry discovery, provider selection, grants, and activation.
9. Test the stage with real adapters when the host supplies their prerequisites.
10. Inspect effect, state, artifact, and lifecycle records after the run.

The reference manifest shows the package identity, schemas, and five declared
capabilities. The stage shows the mutation order. Its package test assembles the real
registry, grants, adapters, effect journal, runner, and result inspection.

> **Package contract:** [The Blueprint Sync manifest connects its stage export, schemas, and five capabilities](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/plugin.json#L1-L24).
>
> **Integration test:** [The package test creates a Git repository, resolves grants, starts adapters, runs Nova, and inspects all outputs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/tests/live-function.test.ts#L7-L94).

Do not copy the reference grants without review. Its repository roots and namespaces
belong to Blueprint Sync. A new stage needs its own minimum resource constraints.

## Design The Effect Identity

Every request needs three stable ideas:

1. capability and operation describe the authority;
2. resource type and canonical ID identify the external object;
3. payload describes the requested value or transition.

Nova creates the runtime effect ID and idempotency key from the run, stage, attempt,
and invocation sequence. Replaying the same recorded invocation uses the same key.
A new stage attempt uses a new key. Therefore, effect-journal idempotency does not
make two logical attempts equivalent.

This distinction is essential:

| Situation | What KubeClaw prevents | What the plugin or external service must prevent |
| --- | --- | --- |
| Same accepted request re-enters effect coordination | A second adapter invocation for the same key | Nothing additional for that exact key |
| New retry attempt requests the same business action | Nothing automatically | Duplicate commit, message, deployment, or append |
| Two runs target the same resource concurrently | A stale fenced owner mutating after lock loss | Business-level conflict between valid current owners |
| Receipt exists but attempt completion is missing | Silent automatic continuation for external mutation | Reconciliation or an explicit continuation decision |

Do not describe this as exactly-once execution. The platform provides durable
deduplication for one effect identity. Business idempotency remains protocol-specific.

> **Generated invocation key:** [The stage executor derives the adapter delivery key from run, stage, attempt number, and call sequence](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/stage-executor.ts#L75-L99).
>
> **Duplicate suppression:** [The effect journal accepts one request per idempotency key and rejects conflicting reuse](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/effects/journal.ts#L35-L79).

## Order Multiple Effects Deliberately

Blueprint Sync validates its inputs, synchronizes selected Git paths, creates a
commit when files changed, appends state, and writes the summary artifact. That order
narrows ambiguity but cannot make the whole sequence atomic.

Choose an order with these questions:

- Which output can prove what the stage intended?
- Which mutation is easiest to reconcile?
- Which later mutation must not occur if an earlier one fails?
- Can a retry detect and reuse an already completed result?
- Which partial result remains after each possible interruption?

The stage should persist or reference enough identity to reconcile the next effect.
It must not report `passed` until all required mutations and evidence writes have
completed.

> **Concrete sequence:** [Blueprint Sync performs Git synchronization, optional commit, state append, and artifact write in visible order](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/src/stage.ts#L18-L64).

## Understand The Effect State Machine

An ordinary effect has three durable milestones:

- `requested`: Core knows the complete intended request;
- `accepted`: one owner may execute the mutation;
- `completed` or `failed`: Core has an adapter receipt.

A request recorded without acceptance can be tried safely by the coordinator.
Acceptance without a receipt is uncertain. The external mutation can have happened.
A receipt records the adapter result, but a later missing stage-completion event can
still require an explicit continuation for external effects.

Local checkpoint operations have a narrower recovery rule. Current Core classifies
artifact read/write, Git repository read, and state read as repeatable checkpoint
operations. Other capabilities require explicit continuation after an interrupted
attempt, even when a receipt exists.

> **Durable coordination:** [The coordinator delegates ordinary calls to the durable effect protocol and keeps confidential calls separate](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/effects/coordinator.ts#L13-L52).
>
> **Recovery stop:** [Recovery rejects accepted effects without receipts and external effects whose attempt did not finish](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/effect-recovery.ts#L14-L28).

## Retry And Resume

A retry is a new execution attempt. Use it only when all earlier effects are known to
be absent, safely repeatable, or reconcilable. Return `retry` for a transient problem
only after this check. Do not convert uncertainty into a retry.

Resume continues a recorded run. Before Nova resumes stage work, effect recovery
checks durable request, acceptance, receipt, and attempt completion. If it reports
`RECOVERY_EFFECT_OUTCOME_UNRESOLVED`, inspect the external system using the recorded
resource identity and effect ID. Preserve the evidence and stop automatic retries.
Do not edit journals. This checkout provides no documented effect-reconciliation
operation that clears this recovery stop.

If recovery reports `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED`, the receipt exists but
the original attempt did not reach its terminal lifecycle event. Decide whether the
recorded result needs reconciliation or compensating work. This is an operator
decision requirement, not an implemented result-import procedure. Administrative
retry and remediation call `executePrepared`, which applies the same recovery
guard. They do not bypass this stop. A supported reconciliation API and its
reader procedure are still required before this path can pass acceptance.

> **No retry bypass:** [Execution checks effects before starting adapters](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/engine-run.ts#L21-L32); [administrative retry returns to the same execution path](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/engine-admin.ts#L90-L98).

## Cancellation

Core passes an abort signal to the stage and adapter. Cancellation revokes the stage
lease and aborts the active call. The adapter must stop starting new work, terminate
owned child activity, and wait for cleanup during shutdown.

Cancellation is not proof that an external request had no effect. An HTTP request can
reach the server before the local abort. A Git or filesystem operation can cross its
commit point. Use the effect journal and the external resource identity to determine
the result.

The stage must not catch cancellation and return `passed`. The adapter must not
detach work that can continue beyond its lease unless a separate durable service owns
that work and supplies reconciliation.

## Cleanup And Compensation

Cleanup removes temporary state that the adapter or provider owns. Compensation is a
new external mutation that reverses or mitigates an earlier mutation. They are not
the same action.

An adapter factory can use its bounded cleanup phase during failed activation.
Runtime shutdown calls every active adapter with an abort signal and a deadline.
Cleanup does not receive additional capabilities. If compensation needs authority,
model it as an explicit supported operation with its own effect identity and receipt.

Do not delete artifacts, journals, package bytes, or external evidence that an active
or recoverable run still needs.

> **Bounded cleanup context:** [The public SDK exposes cleanup without adding capabilities](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/sdk/src/runtime.ts#L43-L75).
>
> **Bounded shutdown:** [The adapter runtime aborts pending and active instances and enforces one shutdown deadline](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/adapters.ts#L69-L88).

## State Store Example And Its Limit

The state-store adapter provides `state.read` and `state.append`. Append uses the
effect request idempotency key. Repeating the same key and payload returns the
existing entry. Reusing the key with different content fails with
`STATE_IDEMPOTENCY_CONFLICT`.

This makes crash replay of one accepted effect safe. It does not merge two new
attempts, because they have different effect keys. A read-before-append pattern also
does not provide atomic compare-and-set across concurrent attempts. If the business
rule requires one record across runs, use an external system and adapter operation
that supports an atomic business key. The current state-store interface does not
provide that guarantee.

> **State append behavior:** [The adapter returns an existing equal entry, rejects conflicting key reuse, and appends otherwise](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/state-store/src/adapter.ts#L44-L85).

## Failure And Recovery Table

| Observation | Meaning | Safe next action |
| --- | --- | --- |
| Grant resolution rejects the stage | Required authority was not selected or bounded | Correct provider and caller grant; do not weaken the vocabulary |
| Adapter readiness fails | No complete adapter runtime started | Correct configuration; verify cleanup; start again |
| Request exists, acceptance absent | Mutation did not receive coordinator ownership | Retry through the same recovery path |
| Acceptance exists, receipt absent | External outcome is unknown | Reconcile externally; do not repeat automatically |
| Completed receipt exists, attempt terminal event absent | Mutation result exists but lifecycle import is incomplete | Stop; the reconciliation/import procedure is not available in this checkout |
| Adapter returns a normal failure receipt | External operation failed with recorded evidence | Apply the operation-specific retry rule |
| Stage times out or is cancelled | Local execution stopped | Inspect effect records before retry or cleanup |
| Same state key has different payload | Caller reused identity for different intent | Stop and correct identity; never overwrite history |

## Verification

Run the focused effect and state checks:

```bash
npm run docs:extensions:effectful:check
node tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs
node tests/verification/contracts/check-plugin-system-v2-phase7.mjs
node tests/verification/reliability/external-effect-recovery.test.mts
npm test --prefix skills/common/plugins/state-store
npm test --prefix skills/nova/plugins/blueprint-sync
```

The documentation check invokes the real Blueprint Sync stage with a controlled capability
context. It verifies the capability order, duplicate suppression for one effect
identity, and reuse of the resource after lock release. It also verifies that a
recorded failure does not repeat the mutation. It creates an accepted effect without
a receipt, then resumes it through the adapter receipt lookup. The final exercise
verifies cancellation without filesystem locks.

The remaining checks cover persistent identity, durable receipts, recovery,
cancellation, state append behavior, and package integration. They need GNU `flock`.
This local BusyBox environment cannot execute those persistent-journal paths. Record
the host limitation separately; do not report those checks as passed or as plugin
failures.

## Author Review

Before you accept an effectful plugin, answer all of these questions:

- What exact external resource does each effect target?
- Which actor grants the capability and its constraints?
- What stable identity survives process restart?
- What happens when the same effect key returns?
- What happens when a new attempt repeats the same business request?
- How does the adapter find an external receipt?
- Which journal states require operator reconciliation?
- What does cancellation stop, and what can already have happened?
- Which temporary state does cleanup remove?
- Which evidence must remain after disablement or package removal?

If one answer is unknown, the plugin is not ready for automatic retry.
