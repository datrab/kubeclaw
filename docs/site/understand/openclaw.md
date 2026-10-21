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
Both tools call Prism Control; they do not write Prism's database directly.
The package declares a minimum Gateway and plugin API version of `2026.9.1`.

`controlUrl` has this precedence: plugin execution configuration, then
`PRISM_CONTROL_URL`, then `http://127.0.0.1:28080`. Tool calls send JSON to
`/v1/agent/design-sets` or `/v1/agent/revisions`. Prism Control checks the
proxied SPIFFE identity, job ID, fence, generation, project ownership, revision,
and document before it commits one transaction.

The host tool client has an important limit: its `fetch` has no client timeout,
response-size limit, or retry. A process stop or network failure can therefore
leave the caller without a result after Prism Control committed the change. Do
not repeat the tool call because the client timed out or disconnected. First
read the durable Prism job by `jobId`. A matching job/fence and payload digest
returns the recorded result; a conflicting payload fails. If the job is
`needs_nova`, stop for reconciliation.

> **Source evidence — Prism tool effect and uncertainty**
>
> **Claim:** A Prism host-tool fetch can lose its response after Control commits; the durable job identity governs reconciliation.
>
> **Implementation:** The host client, Control admission and stored-result checks below trace the effect boundary.
>
> [The host tool selects `controlUrl` and performs an unbounded, non-retrying fetch](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/openclaw-plugin/index.mjs#L10-L19).
>
> [Prism Control authenticates the peer and validates both effect requests before storage](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/server/control-server.ts#L243-L278).
>
> [The job result lock returns an identical committed result and rejects conflicting or unresolved work](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/control/agent-jobs.ts#L84-L100).
>
> **Contract or setting:** Control validates peer/job/fence/payload bindings; the host client adds no timeout, byte bound or retry.
>
> **Test evidence:** [Prism host-tool shape check](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/prism/openclaw-plugin/index.test.mjs#L1-L16) contains tool-registration and exact three-design input assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** The host-tool test does not exercise the network or committed-result replay; no successful live request is established here.

### Agent observer

`@kubeclaw/openclaw-agent-observer` registers OpenClaw hooks and writes
normalized observability records to Redis. It has no pipeline authority. Its
configuration controls Redis connection, TLS, queue and event limits, command
timeouts, retention length, retry bounds, and hook timing. The password has a
sensitive UI hint. The built runtime entry is `dist/index.js`; source loading
uses `src/index.ts` during development.

Observer values from a later source override an earlier source in this order:
environment, registration configuration, service-start configuration, then
hook configuration. Within the final merged object, an explicit plugin value
wins over its environment variable. The shipped Buster chart supplies all
required queue, timeout, retention, retry, and hook values. Invalid or missing
required values cause an event to be dropped and logged; they do not block the
agent request.

### Agent event adapter

`kubeclaw.openclaw-agent-events` is a KubeClaw adapter, not an OpenClaw host
package. It provides `agent.events.subscribe`. Its allowlist can contain the 12
supported hooks from `agent_end` through `session_end`. The default queue holds
256 events or 1 MiB and drains for at most 5 seconds. A full queue is an
explicit pressure boundary, not durable storage.

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
> [The observer merges registration, service, and hook configuration before resolving environment fallbacks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/openclaw-agent-observer/src/index.ts#L176-L199).
>
> **Contract or setting:** The linked manifests/schemas govern compatibility, hooks and queue limits; observer merge order precedes environment fallback.
>
> **Test evidence:** The linked observer package declares its maintained test command, not its result. No Gateway activation or Redis delivery result is established by these declaration links.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Package entry metadata does not establish installed compatibility, registered hooks or durable delivery of queued events.

## Discovery, Installation, And Activation

OpenClaw discovers a host package through `package.json.openclaw.extensions`
and `openclaw.plugin.json`. Install the package into an OpenClaw-managed plugin
location, include its ID in the host allowlist, and supply configuration under
that ID. The Gateway checks the declared compatibility before activation.

Activation is an OpenClaw host action. Nova does not discover or activate these
host packages through the pipeline registry. Conversely, the pipeline runtime
discovers `runtime-dispatch/plugin.json` as a pipeline package and validates its
configuration through the plugin-v2 registry.

On upgrade, build the observer first, keep `openclaw.plugin.json` and package
compatibility in sync, run package tests, then restart the Gateway. A restart
can lose events still in an in-memory ingress queue. Redis records already
accepted by the writer remain subject to Redis retention and durability.

Removal has two steps: disable the package in OpenClaw configuration, then
remove its files. Removing a host plugin does not delete Prism data or Redis
streams. Remove stored data only through its owning system.

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
the job becomes `needs_nova`; it is never put back in the launch queue.

The inbound `/v1/dispatch` path uses a 2 MB request limit and a 30-second
bridge-to-Control timeout. Claim, status, and finish calls use 10-second
timeouts. Envoy terminates mTLS on the Prism dispatch port and admits the
declared Nova, Prism Control, and Prism test-runner SPIFFE identities. The
bridge-to-Control hop is pod loopback. This access path is separate from the
Gateway bearer token used by the general adapter.

> **Source evidence — persisted launch before OpenClaw execution**
>
> **Claim:** Prism persists and fences a launch before the bridge starts OpenClaw; uncertain running work becomes needs_nova.
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
> **Contract or setting:** The job state/fence and selected provider/SPIFFE settings control admission; a zero child exit alone is insufficient.
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
ceilings default to 1,048,576 and accept integers from 1 to 8,388,608. Target
and HMAC secret names are 1–128 characters. The first and last character must
be a lowercase letter or digit; interior characters may be lowercase letters,
digits, period, underscore, colon or hyphen. A single lowercase letter or digit
is valid. They are names, not raw credentials. The endpoint must be HTTP(S), without URL
credentials or a fragment. External HMAC endpoints require HTTPS; loopback
HTTP remains allowed. Schema-admitted `spiffe-proxy` targets use loopback HTTP
with an explicit port and no `tokenSecret`. The adapter checks loopback, but
the configured proxy/peer policy supplies remote mTLS identity; a mode string
is not proof that a proxy exists.

Only `runtime.dispatch` / `dispatch` / `runtime.agent` and an exact configured
target are admitted. Unknown targets fail `RUNTIME_TARGET_DENIED`; bad operation,
resource or configuration fails before transport. Non-confidential calls check
the current fence. Shutdown or pre-cancelled calls stop before dispatch.
Payload JSON is checked recursively: depth at most 20, at most 1,000 entries per
array/object, finite numeric scalars, non-empty keys at most 128 characters,
and no `__proto__`, `constructor` or `prototype` keys. Serialized UTF-8 bytes
must fit the target ceiling. Optional invocation metadata
`runtimeDispatchProfile` must match the frozen SDK profile exactly; a same-named
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
limits; the generic dispatcher adds no independent timer, polling or retry.
For the common HTTP adapter the defaults are 30 seconds and 1 MiB each way,
which can be stricter than a generic target's configured ceiling. Response
status must be an integer 200–299, body must be a non-array object, its JSON
must pass the same shape checks, and its serialized bytes must fit
`maxResponseBytes`. The dispatcher returns a frozen shallow copy of that body.
There is no required `accepted`, job ID, publication receipt, signed response,
or specialist result schema here. A valid response is transport success;
its owning consumer must validate business meaning.

The target map is captured at activation. The generic adapter has no durable
job/session/result store or receiver-side deduplication implementation. Core's
effect journal and the receiving service own uncertain outcomes. A lost POST
response, cancellation after send, or `RUNTIME_RESPONSE_*` failure can follow
remote acceptance: preserve the same effect/key and reconcile with that receiver
before another send. Unlike the OpenClaw registration there is no session-stop
or cleanup handshake to call. Repair a denied target, HMAC secret/proxy identity,
network policy, response shape or byte ceiling at its actual owner; do not
replace the key or enable blind retries. Drain affected consumers before
changing endpoint/authentication/grants, recreate the adapter from validated
configuration and retain the original configuration for pinned-run recovery.
Changing protocol or response meaning needs a versioned receiver/consumer
contract and focused tests, not merely a new URL.

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
> [Exact invocation profile binding; payload keys are not control metadata.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts#L1-L29)
> [Selected common HTTP policy and one-request cancellation/timeout boundary.](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/common/plugins/network-http/src/adapter.ts#L18-L71)
>
> **Contract or setting:** The linked target schema and frozen runtime-dispatch profile govern mode, target and bounds; payload metadata does not grant control authority.
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
| Runtime identity | `runtime` is `acp` or `subagent`; target also fixes agent ID, role, model, and thinking level. |
| Workspace | Absolute working and repository roots; optional workspace root enables verified per-attempt worktrees. |
| Polling | Defaults: 1 s first poll, 15 s maximum poll, 1,800 polls, 30-minute session timeout. |
| Result collection | Relative result prefix and optional paired result endpoint/secret; both optional fields must appear together. |
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
> **Contract or setting:** Target configuration fixes endpoint, runtime identity, workspace, timing and prompt budgets; each complete target must pass validation.
>
> **Test evidence:** [Runtime dispatch admission assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/tests/live-function.test.ts#L14-L26) contains HMAC endpoint rejection and loopback admission cases. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Those assertions cover transport admission only, not every target field, live target readiness, result collection or session cancellation.

## Session Lifecycle

For a `subagent` target, the adapter spawns a labelled task, records its task
identity, polls the Gateway, and reads the terminal result. For an `acp` target,
it uses an ACP session. Poll delay grows to `maxPollMs`, and the entire session
is limited by `sessionTimeoutMs`. The adapter validates current MCP result
envelopes and legacy Gateway wrappers and rejects error statuses before it
parses success content.

Cancellation is not a local flag only. A subagent receives a `cancel` action.
An ACP session receives a stop message. After a failed or aborted spawn, cleanup
tries to recover the accepted session identity, sends cancellation, and polls
until terminal state. If it cannot prove terminal state, it returns
`OPENCLAW_SESSION_CLEANUP_UNRESOLVED`. This fail-closed result prevents Nova
from starting duplicate work after an uncertain response.

## State, Ordering, Retry, And Pressure

- One dispatch owns one OpenClaw session identity and one idempotency key.
- Poll results describe the same session. They are not independent attempts.
- Runtime dispatch does not treat a lost response as proof that spawn failed.
- Session cleanup must finish or remain explicitly unresolved before retry.
- The general adapter stores result bytes below the configured result prefix or
  reads them from the paired result endpoint. OpenClaw owns session history;
  the adapter does not create a second durable session database.
- Prism Control PostgreSQL is the authority for Prism jobs, fences, committed
  tool results, and reconciliation state. The OpenClaw session is execution
  state, not Prism product authority.
- Host hook queues are bounded by event count and bytes. Redis transport has
  separate retention and retry rules. Queue contents are lost on Gateway
  restart. Accepted Redis records follow Redis retention and durability; see
  [Communication](communication.md).
- Model output is untrusted until the Forge or Echo parser validates it.

| Failure | Observable result | Safe recovery |
| --- | --- | --- |
| Host plugin is absent, incompatible, or not allowlisted | Its tools or hooks do not register. | Correct the package version, allowlist, and configuration, then restart the Gateway. Do not infer that observation or Prism writes occurred. |
| Prism tool response is lost | The model sees a tool failure or no result; Control may already have committed. | Query the durable job by `jobId`. Reuse only the identical fenced payload after the stored state proves that action safe. Escalate `needs_nova`. |
| General spawn response is lost | Cleanup tries to recover the label and accepted session. | Wait for terminal reconciliation. Do not dispatch another attempt while `OPENCLAW_SESSION_CLEANUP_UNRESOLVED` remains. |
| Session exceeds poll or wall limit | Adapter returns `OPENCLAW_SESSION_TIMEOUT` and enters cleanup. | Confirm cancellation and terminal state before Nova decides on a new attempt. |
| Result is absent, malformed, too large, or from another model | Result collection or specialist parsing fails closed. | Preserve session identity and result bytes, correct the producer or target, then create a new Nova attempt. |
| Observer queue or Redis write fails | Status counters and warning logs show rejection, write failure, or dead-letter failure. | Restore Redis or reduce event pressure. Lost in-memory events cannot be reconstructed from this plugin. |

## Diagnosis

Check boundaries in this order:

1. Host compatibility and plugin allowlist.
2. Plugin activation and exact configuration ID.
3. Runtime target endpoint and secret availability.
4. Target allowlist, workspace proof, and prompt profile.
5. Session identity, polling deadline, result collector, and cleanup status.
6. Forge or Echo output validation.

For Prism dispatch, start with the durable job state and fence, then inspect the
bridge runner, Worker Core receipt, OpenClaw CLI log, and committed tool result.
A healthy Gateway or a zero CLI exit does not prove a completed Prism job. For
observation, inspect `registered_hooks`, Redis connection state, queued counts,
drop counters, retry counters, and the last error.

## Extension And Design Boundary

A new host tool must be a reviewed OpenClaw package change with a manifest
declaration, strict input schema, explicit Control endpoint, access check,
bounded transport, effect reconciliation, and tests. A new hook must update the
hook contract, normalizer, redaction, event adapter allowlist, queue behavior,
consumer, and retention documentation. A new general dispatch backend must
implement `runtime.dispatch`; it must not load as a host plugin. A new Prism
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
