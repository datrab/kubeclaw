# Pipeline Observability Foundation

Status: pipeline foundation implemented; ClawDeck deployment pending
Decision: D-106
ClawDeck counterpart: `CLAWDECK-V2-ARCHITECTURE-PROPOSAL.md`

## Purpose

Make every supported pipeline action durable, correlated, and visible in
ClawDeck without routing all raw data through Nova.

The simple rule is:

> If ClawDeck cannot prove that an action or record exists, the evidence is not
> complete.

This does not mean that one ClawDeck database stores every byte. ClawDeck is
the one logical observability system. It can use separate stores for event
metadata, logs, metrics, traces, results, and large artifacts.

## Authority

Nova owns:

- Pipeline scheduling.
- Retry policy.
- Gate policy.
- Final pipeline state.
- Import of durable worker results into the pipeline graph.

ClawDeck owns:

- Durable observability history.
- Raw and normalized record correlation.
- Source health and ingestion health.
- Completeness and gap state.
- Search, replay, comparison, and forensic views.
- Durable identities and references for logs, metrics, traces, and artifacts.

Workers own only their assigned attempts. They can publish attempt facts and
telemetry. They cannot change pipeline state or another attempt.

## Data Paths

```text
Control path
Worker -> durable attempt-result store -> Nova

Observability path
Worker/application -> collector/admission -> durable stores -> ClawDeck

Decision path
Nova journal + durable results + completeness -> gate decision
```

Nova does not proxy raw logs, traces, tool calls, or large evidence.

## Data Classes

### Control facts

Small facts that Nova needs:

- Attempt accepted, started, cancelled, failed, or completed.
- Normalized test result.
- Cleanup result.
- Evidence references and digests.
- Observability completeness state.

### Telemetry

High-volume observations that ClawDeck needs:

- Application and runtime logs.
- Metrics and traces.
- Agent lifecycle and transcripts.
- Model calls and tool calls.
- Provider progress and detailed test events.
- Collector, queue, storage, and worker health.

### Evidence

Large or typed payloads:

- Full logs.
- Test reports.
- Screenshots and visual differences.
- Videos and browser traces.
- Coverage and security reports.
- Run archives and receipts.

Large evidence goes directly to its storage backend. Events contain its typed
identity, digest, size, completeness, and reference.

## Identity and Order

Every producer record needs:

- Project and pipeline run.
- Producer ID and producer boot ID.
- Producer-local sequence.
- Stable source event ID.
- Attempt and current claim when applicable.
- Test plan and node when applicable.
- Agent, model, tool, trace, and artifact identities when applicable.
- Occurrence time and admission time.
- Causation and parent identity when applicable.

The producer-local sequence proves order from one producer. It also exposes a
missing range after restart or transport loss.

A worker boot and an attempt completion are different producers. Worker
lifecycle records use the real worker boot identity. One attempt completion
uses an attempt-scoped producer identity that is bound to the claim and result.
This prevents concurrent attempts on one worker from sharing a false event
sequence. The completion payload still records the worker identity.

The canonical telemetry `seq` remains the admitted run order. It can contain
gaps and is not by itself proof of data loss. ClawDeck determines completeness
from producer closures, acknowledgements, source checkpoints, durable
artifacts, and health records.

There is no honest exact order between unrelated concurrent producers.
ClawDeck preserves each producer order and causal links. It may use timestamps
for display, but timestamps do not decide ownership or causality.

## Durable Delivery

Each producer uses a bounded durable outbox:

1. Create the record.
2. Append it to the outbox.
3. Send it to the admission service or collector.
4. Receive an acknowledgement only after durable admission.
5. Retain data until acknowledgement and safe compaction.
6. Retry the same identity after a temporary failure.

Duplicate delivery is safe. Conflicting content for one identity is rejected.

If the outbox reaches its limit, the producer reports an observability error.
It must not silently discard required evidence.

Local JSONL can remain a diagnostic export. It is not the durable central
store and is not the scalable outbox implementation.

## Pipeline Durable Stores

Pipeline plugins use one replaceable durable-record interface for artifacts,
plugin state, waits, bounded telemetry, and external-delivery records.

The embedded profile provides:

- Atomic state replacement.
- File and directory synchronization before acknowledgement.
- Cross-process write locks.
- Bounded record and byte counts.
- Stable stream-local sequences.
- Idempotent record identities.
- Digest-checked record transitions.
- Content-addressed evidence with digest checks.

Operator messages and transport publications save their intent before the
network action. They reserve terminal-record capacity before the action. They
then transition that reservation to an accepted receipt or a failure.
The remote target must deduplicate the unchanged idempotency key.

This interface is the pipeline boundary. A later ClawDeck or database driver
can replace the embedded driver. The plugin capability contracts do not need
to change.

## Completeness

ClawDeck tracks observability separately from execution outcome:

```text
Execution: passed
Observability: partial
Reason: producer buster-4 is missing records 42 to 46
```

Supported completeness states remain:

- `complete`
- `partial`
- `degraded`
- `unknown`

A terminal producer closure states what the producer expected to publish. A
run closure combines producer closures, accepted records, artifacts, missing
ranges, quarantine, and unavailable capabilities.

A producer cannot clear a reported gap by sending a `restored` label. Admission
clears the gap only after every sequence in the declared range is present in
durable storage for the same complete producer identity and run.

Authoritative final test-gate cutover requires complete observability. An
earlier stage can continue with `partial`, `degraded`, or temporarily `unknown`
observability only when the remaining work is safe and the configured stage
policy permits continuation. A safety-critical earlier stage stops when its
required evidence is unavailable. No policy can relabel missing evidence as
complete, and every continued gap remains visible until it is resolved.

## Restart Recovery

If Nova restarts:

1. Read the durable Nova pipeline journal.
2. Find attempts without a final Nova decision.
3. Query durable attempt results by stable identity.
4. Replay a saved completion intent when the worker did not finish admission.
5. Import completed results idempotently.
6. Reconnect to live claims.
7. Requeue attempts whose claims expired.
8. Reject late results from old claim generations.
9. Match the durable test-plan and node owner before import.

A result must become durable before its claim expiry. Result publication first
writes a pending record. It records the durable time only after that write has
completed. A result stored at or after expiry is requeued with a new claim.
9. Read ClawDeck completeness before the final gate decision.

For the embedded profile, Nova stores the reconciliation plan in the run
observability directory. `recoverPipelineV2` invokes this reconciliation before
normal graph recovery. The production driver can replace the file stores. It
must keep the same startup and idempotency rules.

The embedded Buster runner and Nova recovery use the same paths below the run
artifact root:

```text
observability/attempts
observability/admission
observability/reconciliation-plan.json
observability/reconciliation.jsonl
```

The Buster runner requires an explicit `observabilityRoot`. Phase 7 must pass
the Nova run observability directory as this value. A production shared service
can replace these paths, but Nova and Buster must use the same durable store
identity.

Injected embedded stores must resolve to the declared `attempts` and
`admission` directories. Buster rejects a different location.

Evidence that is staged but never reaches a durable result has a bounded
staging age. After that age, the embedded store removes its metadata and
unreferenced content blob. Evidence referenced by a durable result is never
removed by this recovery cleanup.

Phase 5.7 records imports in the durable reconciliation graph. Phase 7 connects
that graph to the test-gate stage and records the final gate result in the
pipeline lifecycle graph. This separation avoids adding a false stage result
before the Nova-to-Buster gate contract exists.

If admission fails after a provider finishes, Buster keeps the durable result
and completion intent. It does not change the provider result to an error and
does not execute the provider again. Buster startup or Nova recovery retries
admission from the saved intent.

If ClawDeck or its ingress is unavailable, producers retain bounded outbox
records and retry. A final attempt is not proved until its required result,
evidence, and closure records are durable.

## Scalability

Ingestion, storage, projection, and query roles scale separately.

```text
Many producers
      |
      v
Ingestion replicas -> durable stores -> projection workers -> query replicas
```

Source partitions and database leases prevent two ingesters from owning the
same partition. Idempotent identities make replay safe.

Nova resource use grows with pipeline state changes and normalized results. It
does not grow with every raw log line.

## Security

- Workers authenticate to the admission and result services.
- Authorization is limited to the current worker type, run, attempt, and claim.
- Large payload references are content-addressed and verified.
- Invalid records enter quarantine with their raw bytes preserved.
- ClawDeck actions remain separately privileged and disabled by default.
- ClawDeck cannot change scheduler truth through observability ingestion.

## Phase 5.7 Exit State

The pipeline side is ready when:

- Every pipeline and worker producer uses the same versioned delivery contract.
- Required records survive Nova and worker restarts.
- Results and evidence are durable before completion acknowledgement.
- Duplicate delivery and late claims cannot corrupt state.
- Per-producer gaps and unavailable evidence are explicit.
- Nova can reconcile without worker memory or Git writes.
- Raw telemetry bypasses Nova and remains queryable through ClawDeck.
- A 20-worker concurrency proof maps every record to the correct run, attempt,
  claim, producer, and causal chain.
- ClawDeck architecture and fixtures accept the exact same contracts.

The Nova-to-Buster gate mapping is not part of this foundation. It remains the
explicit purpose of Phase 7. No new test provider is active before that
connection is complete.
