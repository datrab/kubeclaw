# Pipeline Worker Core Phase 5.5-D Audit

Status: complete
Date: 2026-08-09

## Scope

Phase 5.5-D adds the local neutral worker lifecycle.

It does not add a work queue, remote dispatch, leases, heartbeats, or Nova
transport.

## Implementation

The local runtime provides:

- `starting`, `ready`, `draining`, `stopped`, and `unhealthy` states.
- Contract-valid registration and health reports.
- Worker identity, version, protocols, profiles, and capacity.
- Profile, protocol, claim, capacity, and duplicate-attempt checks.
- Active-attempt tracking.
- A generous bounded drain period.
- Bounded cancellation after the drain period.
- No new work after draining starts.

Main implementation:

- `skills/worker/core/worker/local-runtime.ts`
- `tests/verification/contracts/check-pipeline-worker-local-runtime.mts`

## Architecture Audit

The implementation matches D-096 through D-103:

- The runtime is neutral. It has no test, design, or security meaning.
- One immutable attempt is its work unit.
- Specialist engines remain above it.
- Nova policy remains outside it.
- Profiles and protocol versions stay fixed for an attempt.
- Draining stops new work and preserves active work during the grace period.
- Cancellation uses the same attempt signal as the neutral executor.

The local runtime reports capacity. It does not make global scheduling
decisions. Nova will own those decisions when distributed dispatch is added.

## Simplicity Check

The runtime has one in-memory active-attempt map, one bounded replay map, and
one lifecycle state. Replay entries expire with their attempt claims. A fixed
limit prevents replay protection from causing unbounded memory use.

It does not contain a queue client, retry policy, result policy, persistent
journal, or Kubernetes API client.

## Proof

Run:

```bash
npm run verify:worker-core:local-runtime
```

The proof covers:

- All five lifecycle states.
- Registration and health reports.
- Capacity enforcement.
- Active attempt reporting.
- Safe draining.
- Bounded cancellation.
- Rejection of new work while draining or unhealthy.
- Worker claim, profile, protocol, and duplicate checks.
- Bounded duplicate-attempt replay protection.
- Direct TypeScript validation of the proof.

## Independent review

Independent review used only `gpt-5.6-terra` with high reasoning.

Accepted findings were fixed in these areas:

- Rejecting expired, future, and queue-expired claims at admission.
- Rechecking the queue deadline immediately before work starts.
- Cancelling active work when its claim expires.
- Rejecting a result that completes after claim ownership ends.
- Keeping configured error evidence when normal evidence staging fails.
- Selecting the first deadline crossed during synchronous preparation.
- Bounding accepted-attempt replay memory.
- Terminating a provider exactly once when loading finishes after cancellation.

One finding was rejected. It proposed that two evidence declarations can use
one physical file. Existing semantic validation requires one physical file per
evidence identity. This keeps file limits, selection, and storage ownership
unambiguous. The proof now states this rule directly.

Final result:

```text
independent review clean: no accepted/actionable findings reported
```
