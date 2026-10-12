# OpenClaw agent-event source

Bridges an explicit allowlist of OpenClaw agent hooks into canonical namespaced
plugin events. It normalizes run/stage/attempt identity and retains the existing
metric-only projection and sensitive-field policy.

Ingress is bounded by `maxQueueEvents` (default 256) and `maxQueueBytes` (default
1 MiB), including the active emit. Capacity rejection throws
`AGENT_EVENT_INGRESS_CAPACITY` to the hook caller and increments `rejected`.
This is explicit backpressure; subscription registration alone does not establish
an upstream acknowledgement or durable replay contract.

Status reports emitted/failed/rejected events, queued count/bytes, configured
limits and the latest concrete error. It waits for admitted events by default;
`payload.waitForDrain=false` returns status immediately. Status/shutdown drain
honors cancellation and `drainTimeoutMs` (default 5 seconds). Shutdown first
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
