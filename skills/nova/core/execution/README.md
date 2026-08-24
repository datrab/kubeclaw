# Execution ownership

Generic graph scheduling, attempts, leases, budgets, cancellation, and
concurrency only.

Capability grants, adapter selection, resource constraints, revocation, and
auditing are documented in [CAPABILITIES.md](CAPABILITIES.md).

At run creation, core validates and freezes:

- all configured nodes and their plugin-defined stage types;
- ordinary dependency edges, including fan-out and fan-in;
- declared remediation edges;
- stage configuration, input, attempt/remediation budgets, and timeouts;
- maximum run concurrency.

The canonical graph is sorted and digest-pinned in `graph-snapshot.json`.
`registry-snapshot.json` records the same digest with the frozen stage owners.
Resume fails closed when either package provenance or graph identity differs.

Scheduling is registration-driven. This directory contains no Forge, Buster,
gate, validator, generator, or fixed-stage dispatch table.

## Durable artifact checkpoints

Every successful `artifacts.write` invocation that explicitly requests
`checkpoint: true` is validated against the exact serialized payload and its
producing attempt, then recorded immediately as an `artifact.created`
lifecycle event. The checkpoint does not wait for the stage to return. If a
process or container dies mid-attempt, `recoverPipelineV2` supplies those
certified artifacts to the next attempt and deduplicates them when the
recovered stage eventually returns its result.

This is the recovery boundary for long-running fan-out stages. Repository
review uses one immutable cache artifact per completed review or verification
batch, so recovery reuses completed batches and dispatches only cache misses.
Conflicting content for one artifact ID and producer attempt fails closed.
