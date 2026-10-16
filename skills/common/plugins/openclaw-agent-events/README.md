# OpenClaw agent-event source

Bridges an explicit allowlist of OpenClaw agent hooks into canonical namespaced
plugin events. It normalizes run/stage/attempt identity and retains the existing
metric-only projection and sensitive-field policy.

Ingress is bounded by required `maxQueueEvents` and `maxQueueBytes`, including
the active emit. Nova injects these and `drainTimeoutMs` from the explicitly
selected central `config/nova/core.config.json` `agentEventSource` policy.
The standard profile preserves 256 events, 1 MiB and 5000 ms. Missing/null
limits reject; competing Platform limits reject even when equal. Effective
limits are captured at activation and retained in original run snapshots.
The hook allowlist remains explicit registration configuration, not a budget. Capacity rejection throws
`AGENT_EVENT_INGRESS_CAPACITY` to the hook caller and increments `rejected`.
This is explicit backpressure; subscription registration alone does not establish
an upstream acknowledgement or durable replay contract.

Status reports emitted/failed/rejected events, queued count/bytes, configured
limits and the latest concrete error. It waits for admitted events by default;
`payload.waitForDrain=false` returns status immediately. Status/shutdown drain
honors cancellation and the required `drainTimeoutMs`. Shutdown first
unsubscribes. Cancellation ends the wait; it does not erase admitted events or
cancel the activation API's non-abortable emit. A later drain may observe their
completion. The queue remains volatile before the actual core journal commit.

The adjacent host observer is a separate integration and contract. Final
no-duplicate-source behavior requires a system E2E gate. No new central log
store or automatic log-retention policy is introduced.

Run the package tests and the original-journal integration test:

```sh
npm test --prefix skills/common/plugins/openclaw-agent-events
node --test tests/verification/reliability/agent-source-ingress.test.ts
```

Event projection caps `maxObservedFields` and `maxObservedFieldCharacters` are required selected Core `agentEventSource` settings (standard: 128 each). The adapter captures these at activation; identity/sensitive-field filtering precedes field truncation. Platform duplicates are rejected; there is no adapter fallback. The supported ceiling remains 128.

Identity admission uses required selected Core `agentEventSource.maxIdentityCharacters` (standard and supported ceiling: 512). The real hook captures the limit at activation; oversized run IDs drop the event, oversized optional stage/attempt IDs are omitted, never truncated. Retained policy reuses its original limit; competing platform authors reject.
