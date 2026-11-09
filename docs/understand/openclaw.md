# OpenClaw Integration: Host Plugins And Agent Dispatch

Status: implemented with separate host-plugin and pipeline-adapter boundaries
Audience: OpenClaw operator, integration maintainer, plugin author, security reviewer
Owner: OpenClaw integration maintainers
Evidence: skills/prism/openclaw-plugin; skills/common/plugins/openclaw-agent-observer; skills/common/plugins/openclaw-agent-events; skills/common/plugins/runtime-dispatch
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: OpenClaw plugin API 2026.9.1 or later and current runtime-dispatch targets
Last verified: source, manifest, schema, package, and focused test inspection on 2026-09-20

## Two Integration Surfaces

KubeClaw uses two integration classes. They contain three active request paths:
host tools, host observation, and agent dispatch. Agent dispatch includes a
generic HTTP registration, a Gateway-based Forge/Echo adapter, and a separate durable Prism path.

| Surface | Runs inside | Purpose | Authority |
| --- | --- | --- | --- |
| Host plugin | OpenClaw Gateway | Add Prism tools or observe agent lifecycle hooks. | Only the tools or hooks declared by that package. |
| Pipeline or service adapter | KubeClaw plugin runtime or Prism agent bridge | Dispatch a bounded Forge/Echo request, or run a persisted Prism agent job. | The current runtime grant or the fenced Prism job. OpenClaw never owns Nova or Prism Control state. |

Do not combine these surfaces. An OpenClaw host plugin is not a Nova pipeline
plugin. A runtime-dispatch adapter does not become a general OpenClaw extension
loader.

## Shipped Host Plugins

### Prism tools

`@kubeclaw/openclaw-prism` exposes `prism_create_design_set` and
`prism_apply_revision`. It activates at startup and accepts only `controlUrl`.
Both tools call Prism Control. They do not write Prism's database directly.
The package declares a minimum Gateway and plugin API version of `2026.9.1`.

`controlUrl` has this precedence: plugin execution configuration, then
`PRISM_CONTROL_URL`, then `http://127.0.0.1:28080`. Tool calls send JSON to
`/v1/agent/design-sets` or `/v1/agent/revisions`. Prism Control checks the
proxied SPIFFE identity, job ID, fence, generation, project ownership, revision,
and document before it commits one transaction.

The host tool client has an important limit: its `fetch` has no client timeout,
response-size limit, or retry. A process stop or network failure can therefore
leave the caller without a result after Prism Control committed the change. If the client timed out or disconnected, do not repeat the tool call. First
read the durable Prism job by `jobId`. A matching job/fence and payload digest
returns the recorded result. A conflicting payload fails. If the job is
`needs_nova`, stop for reconciliation.

> **Source evidence — Prism tool effect and uncertainty**
>
> **Claim:** A Prism host-tool fetch can lose its response after Control commits. The durable job identity governs reconciliation.
>
> **Implementation:** The host client, Control admission and stored-result checks below trace the effect boundary.
>
> [The host tool selects `controlUrl` and performs an unbounded, non-retrying fetch](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/openclaw-plugin/index.mjs#L10-L19).
>
> [Prism Control authenticates the peer and validates both effect requests before storage](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/server/control-server.ts#L243-L278).
>
> [The job result lock returns an identical committed result and rejects conflicting or unresolved work](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/control/agent-jobs.ts#L84-L100).
>
> **Contract or setting:** Control validates peer/job/fence/payload bindings. The host client adds no timeout, byte bound or retry.
>
> **Test evidence:** [Prism host-tool shape check](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/openclaw-plugin/index.test.mjs#L1-L16) contains tool-registration and exact three-design input assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** The host-tool test does not exercise the network or committed-result replay. No successful live request is established here.

### Agent observer

`@kubeclaw/openclaw-agent-observer` registers OpenClaw hooks and writes
normalized observability records to Redis. It has no pipeline authority. Its
configuration controls Redis connection, TLS, queue and event limits, command
timeouts, retention length, retry bounds, and hook timing. The password has a
sensitive UI hint. The built runtime entry is `dist/index.js`. Source loading
uses `src/index.ts` during development.

Observer values from a later source override an earlier source in this order:
environment, registration configuration, service-start configuration, then
hook configuration. Within the final merged object, an explicit plugin value
has precedence over its environment variable. The shipped Buster chart supplies all
required queue, timeout, retention, retry, and hook values. Invalid or missing
required values cause the observer to drop and log an event. They do not block the agent request.

### Agent event adapter

`kubeclaw.openclaw-agent-events` is a KubeClaw adapter, not an OpenClaw host
package. It provides `agent.events.subscribe`. Its allowlist can contain the 12
supported hooks from `agent_end` through `session_end`. The default queue holds
256 events or 1 MiB, including an active emit. Status and shutdown wait for up
to 5 seconds by default. This wait deadline does not cancel an active emit.
A full queue is an explicit pressure boundary, not durable storage.

#### Inspect source pressure and drain progress

Use the granted adapter's `agent.events.subscribe` capability with operation
`status`. This is a source-adapter operation, not a Redis consumer query or an
Observer Runtime checkpoint repair. The ordinary request payload `{}` waits
for admitted events to drain. Payload `{"waitForDrain": false}` returns the
current snapshot with no wait. Only the literal boolean `false` selects
that branch. An already-aborted invocation still fails with `ADAPTER_CANCELLED`.

| Status fields | Meaning in this activation |
| --- | --- |
| `activeSubscriptions`, `shuttingDown` | Current retained hook subscriptions and whether shutdown or failed startup stopped admission |
| `emitted`, `failures`, `rejected` | Successful emit calls, failed emit calls, and count/byte-capacity rejections. These are not external sink acknowledgements |
| `queued`, `queuedBytes` | Admitted entries still retained, including the active emit. Bytes count serialized `{hook, normalized}` entries, not raw hook payloads |
| `lastError` | Latest capacity or emit failure. A later success does not clear this field |
| `maxQueueEvents`, `maxQueueBytes`, `drainTimeoutMs` | Effective configured admission and wait limits |

The hook callback throws `AGENT_EVENT_INGRESS_CAPACITY` when the next normalized
entry would exceed either queue bound and increments `rejected`. Hook
registration does not promise that OpenClaw acknowledges or replays rejected
input. If `context.emit` rejects, the queue increments `failures`, records
`AGENT_EVENT_EMIT_FAILED:<cause>` in `lastError`, removes that entry and continues.
The source queue does not retry it. Do not confuse this with downstream
Observer Runtime retries after a canonical event has already been committed.

Shutdown marks the adapter with a stop state, releases subscriptions, then waits for the admitted queue. A subscription-release error can interrupt that sequence.
Do not infer complete cleanup from a shutdown request alone.

Drain cancellation
or `AGENT_EVENT_DRAIN_TIMEOUT:pending=<count>` ends the wait, not the activation
API's non-abortable emit. It neither erases admitted entries nor proves that an
emit failed. A later drain with a fresh signal can observe completion.

A process restart loses volatile entries that did not reach the actual Core journal commit.
Counters and an empty queue do not establish durable end-to-end delivery.

For a positive and negative **Source-level example**, the maintained ingress
fixture admits three entries while emit is blocked, then rejects 97 further
hook calls under its three-entry test limit. Immediate status reports the
three retained entries. Cancellation of a status or shutdown call does not remove them.
After the blocked emitter is released, a later drain observes three emits and
zero queued entries. Separate cases assert a byte-capacity rejection, a drain
timeout with the entry still retained, and an emit failure visible in status.
These are descriptions of test assertions, not a fresh test or Gateway result.
For an actual integration, inspect the original journal and the selected sink's
receipts separately before you claim delivery or retry safety.

> **Source evidence — hook ingress status and drain**
>
> **Claim:** Source admission is bounded and volatile. Status exposes pressure and failures, but drain cancellation does not cancel an admitted emit.
>
> **Implementation:** [Adapter lifecycle/status](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-events/src/adapter.ts#L67-L119), [Queue limits/admission](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts#L1-L35), and [Emit/status/drain outcomes](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts#L38-L76) define these separate outcomes.
>
> **Contract or setting:** [The closed source configuration schema](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-events/schemas/config.schema.json#L1-L49) declares the hook allowlist and queue/wait defaults and maxima. The status payload above selects waiting, not a new capacity or replay policy.
>
> **Test evidence:** [Original-journal pressure/status/drain assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/tests/verification/reliability/agent-source-ingress.test.ts#L23-L48). [Byte/deadline and emit-error assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/tests/verification/reliability/agent-source-ingress.test.ts#L51-L75). Source-read only, not executed for this correction.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. Whole linked objects equal current Source. This ingress explanation was Source-checked on 2026-10-22. Other page review scopes are not relabeled.
>
> **Limit:** These local fixture assertions do not prove live OpenClaw admission, end-to-end no-duplicates, Redis delivery or replay of volatile/rejected events.

> **Source evidence — package declarations**
>
> **Claim:** OpenClaw host packages and the pipeline event adapter have distinct declarations and configuration ownership.
>
> **Implementation:** The host manifest, package entries, event schema and observer merge below describe those boundaries.
>
> [The Prism host manifest declares both tools and its only configuration field](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/openclaw-plugin/openclaw.plugin.json#L1-L17).
>
> [The observer package declares source/runtime entries, compatibility, and its complete test command](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/openclaw-agent-observer/package.json#L1-L32).
>
> [The event adapter schema defines the hook allowlist and queue limits](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-events/schemas/config.schema.json#L1-L49).
>
> [The observer merges registration, service, and hook configuration before it resolves environment fallbacks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-observer/src/index.ts#L176-L199).
>
> **Contract or setting:** The linked manifests/schemas govern compatibility, hooks and queue limits. Observer merge order precedes environment fallback.
>
> **Test evidence:** The linked observer package declares its maintained test command, not its result. No Gateway activation or Redis delivery result is established by these declaration links.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Package entry metadata does not establish installed compatibility, registered hooks or durable delivery of queued events.

## Discovery, Installation, And Activation

OpenClaw discovers a host package through `package.json.openclaw.extensions`
and `openclaw.plugin.json`. Install the package into an OpenClaw-managed plugin location.
Include its ID in the host allowlist. Then supply configuration under that ID. The Gateway checks the declared compatibility before activation.

Activation is an OpenClaw host action. Nova does not discover or activate these
host packages through the pipeline registry. Conversely, the pipeline runtime
discovers `runtime-dispatch/plugin.json` as a pipeline package and validates its
configuration through the plugin-v2 registry.

On upgrade, build the observer first.
Keep `openclaw.plugin.json` and package compatibility in sync.
Run package tests. Then restart the Gateway. A restart
can lose events still in an in-memory ingress queue. Redis records already
accepted by the writer remain subject to Redis retention and durability.

Remove the package in two steps:

1. Disable the package in OpenClaw configuration.
2. Remove its files.

 If you remove a host plugin, that action does not delete Prism data or Redis streams. Use only the system that owns the stored data to remove that data.

## Prism Dispatch Path

Prism dispatch does not use the general OpenClaw runtime-dispatch adapter.
Nova routes `runtime.dispatch` through the Prism capability provider and mTLS
Envoy listener to the local bridge. The bridge forwards `/v1/dispatch` to Prism
Control. Prism Control first persists an agent job with a request digest and
stable project session key. The local bridge claims only `accepted` work. That
claim writes a new fence, runner identity, attempt envelope, and expiry before
the bridge crosses the external-action boundary. Jobs in `running` or
`needs_nova` block another job for the same session.

The bridge starts `openclaw agent` in its own process group with the persisted
session key and a 900-second CLI timeout. Worker Core records logs and the local
process result. A successful local exit is not product success. Prism Control
accepts only the fenced worker receipt and a tool result already committed to
the job. If the bridge stops, the CLI fails, or the claim expires after launch,
the job becomes `needs_nova`. It is never put back in the launch queue.

The inbound `/v1/dispatch` path uses a 2 MB request limit and a 30-second
bridge-to-Control timeout. Claim, status, and finish calls use 10-second
timeouts. Envoy terminates mTLS on the Prism dispatch port and admits the
declared Nova, Prism Control, and Prism test-runner SPIFFE identities. The bridge sends HTTP to its pod's loopback Envoy listener. In the selected
production path, Envoy reaches Control over mTLS. This access path is separate from the
Gateway bearer token used by the general adapter.

> **Source evidence — persisted launch before OpenClaw execution**
>
> **Claim:** Prism persists and fences a launch before the bridge starts OpenClaw. Uncertain running work becomes needs_nova.
>
> **Implementation:** Job admission, bridge routes, runner and provider/trust wiring below trace that separate dispatch path.
>
> [Prism admission persists request identity and changes expired running work to `needs_nova`](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/control/agent-jobs.ts#L15-L52).
>
> [The bridge applies request and Control-call timeouts and exposes only job-bound routes](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/server/agent-bridge.mjs#L4-L30).
>
> [The runner launches one claimed OpenClaw job and reports all failures to Control](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/server/agent-job-runner.mjs#L16-L46).
>
> [Nova selects the Prism runtime capability provider and its authenticated dispatch port](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/my-values/nova-values.yaml#L109-L116).
>
> [The Prism Envoy listener requires a client certificate and exact SPIFFE identities](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/configmap-worker-trust.yaml#L84-L117).
>
> **Contract or setting:** The job state/fence and selected provider/SPIFFE settings control admission. A zero child exit alone is insufficient.
>
> **Test evidence:** [Durable Prism job checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/tests/agent-jobs.test.mts#L40-L59) contains database-reopen, duplicate request and running-uncertainty assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** These tests use PGlite and controlled local processes, not a live model, mTLS deployment or external Gateway.

## Generic HTTP Runtime Registration

`kubeclaw.runtime-dispatch` exports two different registrations for the same
`runtime.dispatch` capability. The `:runtime` registration uses `src/adapter.ts`
and a generic JSON-over-HTTP contract. The `:openclaw` registration uses the
Gateway/session implementation described in [Runtime Dispatch Target](#runtime-dispatch-target).
Selecting the package does not select a registration, activate it, supply a
target, or prove a remote service. Check the platform provider binding first.
A generic dispatch is not an OpenClaw `sessions_spawn`, ACP poll, result-file
collection, or cancellation protocol.

### Configuration and request admission

The generic configuration is a closed `targets` map with at least one entry.
Each target has `endpoint`, optional `authentication` (default `hmac`),
conditional `tokenSecret`, and optional `maxRequestBytes` / `maxResponseBytes`. Both byte
ceilings default to 1,048,576 and accept integers from 1 to 8,388,608.

Target
and HMAC secret names are 1–128 characters. The first and last character must
be a lowercase letter or digit. Interior characters may be lowercase letters,
digits, period, underscore, colon or hyphen. A single lowercase letter or digit
is valid. They are names, not raw credentials.

The endpoint must be HTTP(S), without URL
credentials or a fragment. External HMAC endpoints require HTTPS. Loopback
HTTP remains allowed.

Schema-admitted `spiffe-proxy` targets use loopback HTTP
with an explicit port and no `tokenSecret`. The adapter checks loopback, but
the configured proxy/peer policy supplies remote mTLS identity. A mode string
is not proof that a proxy exists.

Only `runtime.dispatch` / `dispatch` / `runtime.agent` and an exact configured
target are admitted. Unknown targets fail `RUNTIME_TARGET_DENIED`. Bad operation,
resource or configuration fails before transport. Non-confidential calls check
the current fence. Shutdown or pre-cancelled calls stop before dispatch.
The adapter checks payload JSON recursively for:

- Depth at most 20
- At most 1,000 entries per array/object
- Finite numeric scalars
- Non-empty keys at most 128 characters
- No `__proto__`, `constructor` or `prototype` keys.

 Serialized UTF-8 bytes
must fit the target ceiling.

Optional invocation metadata
`runtimeDispatchProfile` must match the frozen SDK profile exactly. A same-named
key inside the payload remains data, not profile authority. This adapter does
not manufacture a task schema or reinterpret its payload as Gateway tools.

### Wire contract, result and uncertainty

HMAC mode confidentially resolves the named `secrets.read` value and requires a
non-empty string. It computes HMAC-SHA-256 over `idempotencyKey`, a literal
period, then `JSON.stringify(payload)`, encoded as UTF-8. Through confidential
`network.http` it sends one POST to the configured endpoint, with the original
payload as body and headers `content-type: application/json`,
`idempotency-key`, and `x-kubeclaw-signature: v1=<hex>`. Proxy mode sends the same
POST and key but no HMAC header or secret resolution. Neither mode sends a
Gateway bearer or invents a remote session identity.

The selected network adapter must grant the origin/method and allow these
headers. It owns request cancellation, timeout, redirect and wire-response
limits. The generic dispatcher adds no independent timer, polling or retry.
For the common HTTP adapter the defaults are 30 seconds and 1 MiB each way,
which can be stricter than a generic target's configured ceiling. The response status must be an integer 200–299. The body must be a non-array object.
Its JSON must pass the same shape checks. Its serialized bytes must fit `maxResponseBytes`. The dispatcher returns a frozen shallow copy of that body.

There is no required `accepted`, job ID, publication receipt, signed response,
or specialist result schema here. A valid response is transport success.
The consumer that owns the result must validate its business meaning.

The target map is captured at activation. The generic adapter has no durable
job/session/result store or receiver-side deduplication implementation. Core's
effect journal and the receiving service own uncertain outcomes.

A lost POST response, cancellation after send, or `RUNTIME_RESPONSE_*` failure can follow remote acceptance.
Preserve the same effect/key. Before another send, reconcile with that receiver. Unlike the OpenClaw registration there is no session-stop
or cleanup handshake to call.

Repair a denied target, HMAC secret/proxy identity,
network policy, response shape or byte ceiling at its actual owner. Do not
replace the key or enable blind retries.

Before you change endpoint/authentication/grants, drain affected consumers.
Recreate the adapter from validated configuration.
Retain the original configuration for pinned-run recovery.

If you change the protocol or response meaning, a versioned receiver/consumer contract and focused tests are necessary. A new URL is not enough.

> **Source evidence — generic registration, not Gateway spawn**
>
> **Claim:** The generic runtime registration sends bounded JSON-over-HTTP and does not implement Gateway session lifecycle.
>
> **Implementation:** The manifest, generic adapter, shared invocation/profile helpers and selected HTTP adapter below establish the request/result path.
>
> [The manifest separates generic runtime and OpenClaw registrations and their capability dependencies.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/plugin.json#L7-L36)
> [Exact target/authentication/size configuration and invocation admission.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L60-L105)
> [Schema-closed authentication modes and conditional proxy/HMAC fields.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/schemas/config.schema.json#L1-L29)
> [Recursive JSON and key bounds.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L35-L59)
> [Confidential HMAC/POST, response checks and returned object.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/adapter.ts#L107-L147)
> [Shared activation/shutdown/fence/cancellation and target selection, without a session store.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts#L14-L38)
> [Exact invocation profile binding. Payload keys are not control metadata.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L1-L29)
> [Selected common HTTP policy and one-request cancellation/timeout boundary.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/network-http/src/adapter.ts#L18-L71)
>
> **Contract or setting:** The linked target schema and frozen runtime-dispatch profile govern mode, target and bounds. Payload metadata does not grant control authority.
>
> **Test evidence:** The HTTP error reference describes generic-adapter and common-HTTP checks. [Runtime-dispatch live-function assertions](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/runtime-dispatch/tests/live-function.test.ts#L14-L26) include external-plaintext rejection and loopback admission. No execution result is inferred from this link.
>
> **Revision:** `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Transport success is not a signed receipt, business completion, receiver deduplication or terminal session proof.

## Runtime Dispatch Target

The OpenClaw adapter accepts only capability `runtime.dispatch`, operation
`dispatch`, resource type `runtime.agent`, and a valid configured target ID.
Target selection is an allowlist lookup. An unknown ID returns
`RUNTIME_TARGET_DENIED`.

Important target fields are:

| Group | Fields and rules |
| --- | --- |
| Endpoint and secret | HTTP(S) endpoint and a named token secret. The secret value does not enter ordinary plugin input. |
| Runtime identity | `runtime` is `acp` or `subagent`. Target also fixes agent ID, role, model, and thinking level. |
| Workspace | Absolute working and repository roots. Optional workspace root enables verified per-attempt worktrees. |
| Polling | Defaults: 1 s first poll, 15 s maximum poll, 1,800 polls, 30-minute session timeout. |
| Result collection | Relative result prefix and optional paired result endpoint/secret. Both optional fields must appear together. |
| Prompt budget | Exactly 900,000 bytes, 120,000 input tokens, 6,000 output tokens, and 128,000 context tokens in the current parser. |

The fixed prompt limits are deliberate. The runtime profile binds the accepted
budget so a caller cannot increase it in one request. The input and output token
budgets must fit inside the context budget.

> **Source evidence — target admission**
>
> **Claim:** The OpenClaw target parser admits complete allowlisted targets and rejects unsupported invocation shapes.
>
> **Implementation:** The target parser and adapter entry below define accepted fields, defaults and operation admission.
>
> [The target parser defines accepted fields, URL rules, and timing validity](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L1-L48).
>
> [It applies defaults and rejects an invalid target as one complete unit](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L51-L82).
>
> [The adapter rejects every operation outside the exact runtime-dispatch shape](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts#L1-L24).
>
> **Contract or setting:** Target configuration fixes endpoint, runtime identity, workspace, timing and prompt budgets. Each complete target must pass validation.
>
> **Test evidence:** [Runtime dispatch admission assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/tests/live-function.test.ts#L14-L26) contains HMAC endpoint rejection and loopback admission cases. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Those assertions cover transport admission only, not every target field, live target readiness, result collection or session cancellation.

## Session Lifecycle

For a `subagent` target, the adapter spawns a labeled task, records its task
identity, polls the Gateway, and reads the terminal result. For an `acp` target,
it uses an ACP session.

Poll delay grows to `maxPollMs`. The `sessionTimeoutMs` timer starts when result polling begins after the spawn.
It does not bound queue residence or spawn time.
The caller's invocation signal and declared attempt deadline remain the outer
cancellation boundary. The adapter validates current MCP result
envelopes and legacy Gateway wrappers and rejects error statuses before it
parses success content.

Cancellation is not a local flag only. A subagent receives a `cancel` action.
An ACP session receives a stop message. After a failed or aborted spawn, cleanup
tries to recover the accepted session identity, sends cancellation, and polls
until terminal state. If it cannot prove terminal state, it returns
`OPENCLAW_SESSION_CLEANUP_UNRESOLVED`. This fail-closed result prevents Nova
from starting duplicate work after an uncertain response.

## State, Ordering, Retry, And Pressure

These state, ordering, retry, and pressure rules apply:

- One dispatch owns one OpenClaw session identity and one idempotency key.
- Poll results describe the same session. They are not independent attempts.
- Runtime dispatch does not treat a lost response as proof that spawn failed.
- Session cleanup must finish or remain explicitly unresolved before retry.
- The general adapter stores result bytes below the configured result prefix or
  reads them from the paired result endpoint. OpenClaw owns session history.
  The adapter does not create a second durable session database.
- Prism Control PostgreSQL is the authority for Prism jobs, fences, committed
  tool results, and reconciliation state. The OpenClaw session is execution
  state, not Prism product authority.
- Host hook queues are bounded by event count and bytes. Redis transport has
  separate retention and retry rules. Queue contents are lost on Gateway
  restart. Accepted Redis records follow Redis retention and durability. See
  [Communication](communication.md).
- Model output is untrusted until the Forge or Echo parser validates it.

| Failure | Observable result | Safe recovery |
| --- | --- | --- |
| Host plugin is absent, incompatible, or not allowlisted | Its tools or hooks do not register. | Correct the package version, allowlist, and configuration. Then restart the Gateway. Do not infer that observation or Prism writes occurred. |
| Prism tool response is lost | The model sees a tool failure or no result. Control might already contain the committed change. | Query the durable job by `jobId`. Reuse only the identical fenced payload after the stored state proves that action safe. Escalate `needs_nova`. |
| General spawn response is lost | Cleanup tries to recover the label and accepted session. | Wait for terminal reconciliation. Do not dispatch another attempt while `OPENCLAW_SESSION_CLEANUP_UNRESOLVED` remains. |
| Session exceeds poll or wall limit | Adapter returns `OPENCLAW_SESSION_TIMEOUT` and enters cleanup. | Confirm cancellation and terminal state before Nova decides on a new attempt. |
| Result is absent, malformed, too large, or from another model | Result collection or specialist parsing fails closed. | Preserve session identity and result bytes. Correct the producer or target. Then create a new Nova attempt. |
| Observer queue or Redis write fails | Status counters and warning logs show rejection, write failure, or dead-letter failure. | Restore Redis or reduce event pressure. Lost in-memory events cannot be reconstructed from this plugin. |

## Diagnosis

Check boundaries in this order:

1. Host compatibility and plugin allowlist
2. Plugin activation and exact configuration ID
3. Runtime target endpoint and secret availability
4. Target allowlist, workspace proof, and prompt profile
5. Session identity, polling deadline, result collector, and cleanup status
6. Forge or Echo output validation.

For Prism dispatch, start with the durable job state and fence.
Then inspect:

- The bridge runner
- The Worker Core receipt
- The OpenClaw CLI log
- The committed tool result.


A healthy Gateway or a zero CLI exit does not prove a completed Prism job. For
observation, inspect `registered_hooks`, Redis connection state, queued counts,
drop counters, retry counters, and the last error.

## Extension And Design Boundary

A new host tool must be a reviewed OpenClaw package change with a manifest
declaration, strict input schema, explicit Control endpoint, access check,
bounded transport, effect reconciliation, and tests. A new hook must update the
hook contract, normalizer, redaction, event adapter allowlist, queue behavior,
consumer, and retention documentation. A new general dispatch backend must
implement `runtime.dispatch`. It must not load as a host plugin. A new Prism
launcher must preserve durable admission, one-way `accepted` to `running`
transition, fencing, and `needs_nova` on uncertainty.

The historical reason for these separate extension boundaries is not recorded.
The current assessment is an inference: they prevent Gateway code, pipeline
adapters, and Prism product state from sharing one broad authority. The cost is
duplicate transport and lifecycle mechanisms. Reconsider the split when one
versioned interface can preserve each identity, timeout, state owner, and
uncertain-effect stop rule.

Run the package `test` command for each host plugin and runtime adapter. The
tests cover configuration, package boundaries, live functions, remediation,
session parsing, and cancellation logic. They do not prove an external Gateway,
model provider, Redis service, or network route unless those live dependencies
are present.
