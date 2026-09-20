# OpenClaw Integration: Host Plugins And Agent Dispatch

Status: implemented with separate host-plugin and pipeline-adapter boundaries
Audience: OpenClaw operator, integration maintainer, plugin author, security reviewer
Owner: OpenClaw integration maintainers
Evidence: skills/prism/openclaw-plugin; skills/common/plugins/openclaw-agent-observer; skills/common/plugins/openclaw-agent-events; skills/common/plugins/runtime-dispatch
Evidence revision: `549dfe003d41fca50b85c3040029a74a817715d6`
Applies to: OpenClaw plugin API 2026.9.1 or later and current runtime-dispatch targets
Last verified: source, manifest, schema, package, and focused test inspection on 2026-09-20

## Two Integration Surfaces

KubeClaw uses OpenClaw in two different ways.

| Surface | Runs inside | Purpose | Authority |
| --- | --- | --- | --- |
| Host plugin | OpenClaw Gateway | Add Prism tools or observe agent lifecycle hooks. | Only the tools or hooks declared by that package. |
| Pipeline adapter | KubeClaw plugin runtime | Dispatch a bounded Forge or Echo request to an OpenClaw runtime target. | Only `runtime.dispatch` for a configured target and current capability grant. |

Do not combine these surfaces. An OpenClaw host plugin is not a Nova pipeline
plugin. A runtime-dispatch adapter does not become a general OpenClaw extension
loader.

## Shipped Host Plugins

### Prism tools

`@kubeclaw/openclaw-prism` exposes `prism_create_design_set` and
`prism_apply_revision`. It activates at startup and accepts only `controlUrl`.
Both tools call Prism Control; they do not write Prism's database directly.
The package declares a minimum Gateway and plugin API version of `2026.9.1`.

### Agent observer

`@kubeclaw/openclaw-agent-observer` registers OpenClaw hooks and writes
normalized observability records to Redis. It has no pipeline authority. Its
configuration controls Redis connection, TLS, queue and event limits, command
timeouts, retention length, retry bounds, and hook timing. The password has a
sensitive UI hint. The built runtime entry is `dist/index.js`; source loading
uses `src/index.ts` during development.

### Agent event adapter

`kubeclaw.openclaw-agent-events` is a KubeClaw adapter, not an OpenClaw host
package. It provides `agent.events.subscribe`. Its allowlist can contain the 12
supported hooks from `agent_end` through `session_end`. The default queue holds
256 events or 1 MiB and drains for at most 5 seconds. A full queue is an
explicit pressure boundary, not durable storage.

> **Source evidence — package declarations**
>
> [The Prism host manifest declares both tools and its only configuration field](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/prism/openclaw-plugin/openclaw.plugin.json#L1-L17).
>
> [The observer package declares source/runtime entries, compatibility, and its complete test command](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/openclaw-agent-observer/package.json#L1-L32).
>
> [The event adapter schema defines the hook allowlist and queue limits](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/openclaw-agent-events/schemas/config.schema.json#L1-L49).

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
> [The target parser defines every accepted field, default, identity rule, timing bound, and prompt budget](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/runtime-dispatch/src/openclaw-config.ts#L1-L84).
>
> [The adapter rejects every operation outside the exact runtime-dispatch shape](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/runtime-dispatch/src/openclaw-adapter.ts#L1-L24).

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
- Host hook queues are bounded by event count and bytes. Redis transport has
  separate retention and retry rules; see [Communication](communication.md).
- Model output is untrusted until the Forge or Echo parser validates it.

## Diagnosis

Check boundaries in this order:

1. Host compatibility and plugin allowlist.
2. Plugin activation and exact configuration ID.
3. Runtime target endpoint and secret availability.
4. Target allowlist, workspace proof, and prompt profile.
5. Session identity, polling deadline, result collector, and cleanup status.
6. Forge or Echo output validation.

Run the package `test` command for each host plugin and runtime adapter. The
tests cover configuration, package boundaries, live functions, remediation,
session parsing, and cancellation logic. They do not prove an external Gateway,
model provider, Redis service, or network route unless those live dependencies
are present.
