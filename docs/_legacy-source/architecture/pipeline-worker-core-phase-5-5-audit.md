# Pipeline Worker Core Phase 5.5 Audit

Status: complete
Date: 2026-08-09

## Outcome

Phase 5.5 separates the neutral worker lifecycle from the Buster test engine.

The worker core now owns one immutable attempt. It validates the attempt,
applies limits, handles cancellation, records logs and evidence, requests
cleanup, and returns one typed result.

Buster still owns test scheduling, dependencies, matrices, retries, typed
links, and node results. Nova still owns pipeline policy and final decisions.

## Completed Work

- Phase 5.5-A defines language-neutral worker contracts.
- Phase 5.5-B implements the neutral attempt executor.
- Phase 5.5-C connects the local Buster runner to that executor.
- Phase 5.5-D implements the local worker lifecycle.
- Phase 5.5-E proves the extracted path and the existing Buster behavior.
- Phase 5.5-F connects real Buster attempts to the local lifecycle and defines
  role-specific runtime surfaces.

No distributed queue, remote dispatch, worker authentication, claim renewal,
or multi-replica scheduling is implemented. Those items remain deferred.

## Architecture Audit

The implementation matches D-096 through D-104:

- One neutral worker core supports specialist engines.
- One immutable attempt is the work unit.
- Worker messages use versioned JSON contracts.
- The first implementation remains in TypeScript.
- The local runtime has no suite, gate, design, or security policy.
- Buster keeps local plan scheduling.
- Nova remains the future authority for distributed work and final policy.

The final closeout also confirms these ownership rules:

- Error evidence is independent from normal evidence.
- The first expired deadline controls the terminal result.
- Replay protection is bounded and expires with claims.
- Provider termination has one owner.
- One physical evidence file has one evidence identity.

## Closeout Findings

A post-phase audit found four gaps.

### Buster bypassed the local worker lifecycle

The Buster runner called the attempt executor directly. The local worker state,
capacity, draining, and replay checks did not control real Buster attempts.

The runner now owns one persistent local worker runtime. Every Buster attempt
uses that runtime. A lifecycle proof starts a real Buster attempt, checks active
capacity, drains the worker, and checks the cancelled result.

### Worker results omitted Buster evidence

Buster stored evidence after the neutral result was complete. The worker result
did not cover final reports, screenshots, logs, or their byte count.

The specialist operation now has one bounded evidence-finalization step. Buster
uses it to store selected evidence before the neutral result digest is created.
The worker result and final Buster attempt use the same evidence records.

### Direct comparison proof was absent

The runner proof now runs the same provider facts through a direct attempt
runtime and the local worker lifecycle. It compares terminal state, outcome,
summary, counts, exit facts, and evidence facts.

### Cancellation proof used a timer

The old proof cancelled after a fixed delay. It could cancel before the
provider was ready on a busy machine.

The provider now writes a ready signal. The proof waits for that signal before
it cancels the run.

### Worker-runtime rejection could stop the full plan

The first closeout review found that a rejected local worker operation could
escape from the Buster runner. This could stop the full test plan and retain
temporary staging files.

The runner now converts this rejection into one errored or cancelled attempt.
It removes staging files in all cases. Evidence completed before claim loss
remains available. A focused proof covers the result and cleanup behavior.

## Runtime Packaging Finding

The audit also confirmed that `skills/common` is still copied as one broad
overlay into Nova and Buster bundles. This is not the final authority boundary.

D-105 defines one shared source with role-specific runtime package sets. This
phase adds explicit Nova, neutral-worker, and Buster export surfaces. The
bundle builder still needs a later dependency-set assembly phase. See
`docs/architecture/pipeline-runtime-packaging.md`.

## Proof

Run:

```bash
npm run verify:contracts
npm run docs:check
git diff --check
```

The contract suite includes:

- Worker-core contract validation.
- Neutral attempt-executor behavior.
- Local worker lifecycle behavior.
- Existing Buster plan-runner behavior.
- Plugin-system boundaries and inventory.
- Decision traceability.
- Direct-versus-local Buster comparison.
- Integrated Buster lifecycle and draining.
- Buster evidence in the neutral worker result.
- Nova, neutral-worker, and Buster export boundaries.

## Independent review

The closeout review used only `gpt-5.6-terra` with high reasoning. One accepted
finding was fixed. A later concern about the queue-deadline check was clarified
with one authoritative start timestamp and focused proof.

Final result:

```text
independent review clean: no accepted/actionable findings reported
overall: patch is correct (0.78)
```
