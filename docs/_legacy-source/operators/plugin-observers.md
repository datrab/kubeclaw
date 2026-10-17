# Operating Plugin Observers

Pipeline-v2 observers consume immutable canonical events. They do not control
scheduling or lifecycle state.

## Delivery

Core derives a stable delivery ID from observer registration and event ID.
Every attempt is appended to `observer-deliveries.jsonl`. A successful
delivery advances that observer's per-run checkpoint in
`observer-checkpoints.jsonl`.

Delivery is at least once. After a crash, an event without a committed
checkpoint is delivered again. Sinks must therefore be idempotent. Capability
effects use the stable delivery identity, so adapters can return an existing
receipt instead of repeating an externally visible operation.

## Failure policies

Best-effort observers retry according to their registration policy. Exhaustion
blocks later events for the same observer and run, preserving order, but does
not block other runs or lifecycle truth.

Required observers retry within the same bounds and then fail the host
operation. `kubeclaw.notification-observer:audit` is the required audit sink.
Do not enable it without a healthy `artifacts.write` provider and a grant for
the `kubeclaw.pipeline-audit` namespace.

## Recovery

On startup, core validates:

- event identity and per-run sequence order;
- checkpoint observer ownership and pinned package provenance;
- checkpoint event identity, sequence, run, and subscription;
- monotonic checkpoint progression;
- delivery-record ownership and attempt numbers.

Invalid or conflicting records fail closed. Do not manually edit observer
journals. Restore the exact pinned run state or reconcile it through an
operator-approved recovery procedure.

## Troubleshooting

Inspect, in order:

1. `observer-deliveries.jsonl` for the latest started/failed attempt;
2. `observer-checkpoints.jsonl` for the last committed event per observer/run;
3. the selected capability adapter's effect journal and receipt;
4. adapter readiness and grant configuration;
5. the pinned registry snapshot for package version/digest mismatches.

Secret values must not appear in events, delivery records, checkpoints,
telemetry envelopes, notification payloads, or audit artifacts.

