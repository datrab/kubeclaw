# Ops MCP: Read-Only Cluster Evidence Interface

Status: implemented; optional to pipeline execution
Audience: operator, Codex integrator, Ops MCP maintainer, security specialist
Owner: Ops MCP maintainers
Evidence: tools/ops-mcp/src; tools/ops-mcp/test; charts/ops-pod; scripts/deploy-ops-pod.sh
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
Applies to: `kubeclaw-ops` MCP service version 0.2.0
Last verified: service, chart, policy, and focused test inspection on 2026-09-21

## Purpose And Safety Boundary

Ops MCP collects operational evidence through a read-only MCP interface. It can
read Argo CD applications, Kubernetes workload state, events, pod logs, and
Hubble flows. No registered tool deploys, restarts, deletes, patches, changes a
Secret, or executes a command in a pod. Each registration has read-only,
non-destructive, idempotent, and closed-world annotations: `readOnlyHint=true`,
`destructiveHint=false`, `idempotentHint=true`, and `openWorldHint=false`.
These annotations describe the interface. The service code enforces the method
boundary. Kubernetes RBAC defines the wider authority of the process credential.

Ops MCP is an optional analysis surface. Nova, Buster, and Prism do not depend
on it for pipeline lifecycle authority.

The source proves this read-only method boundary but does not record the
historical reason for choosing a separate service. The current design assessment is an
inference: a narrow service keeps cluster access out of the plugin package and
gives clients a small, validated evidence API. This does not make the shared Pod
ServiceAccount read-only. In the default Ops Pod profile, that identity also has
`pods/exec` authority for the configured execution namespace. The cost is
another service, authentication boundary, and availability boundary. Reconsider
the service split only if a replacement preserves per-request authentication
and namespace checks, adds aggregate bounds for full scans, and uses a
Kubernetes identity whose authority matches its deployment model.

## Complete Request And State Path

1. An MCP client sends a JSON request to `/mcp` with a bearer header and,
   for a browser, an `Origin` header.
2. The HTTP router checks the bearer source and exact origin allowlist before
   the MCP handler parses a tool call.
3. Zod validates the selected tool input. Namespace values come from the
   configured enum; a caller cannot supply an arbitrary namespace.
4. The tool performs HTTPS GET requests with the projected Kubernetes identity,
   or starts the fixed Hubble binary with exact filters and a bounded process.
5. The tool reduces the response to JSON text. It returns continuation,
   truncation, scan, window, and partial-result metadata where applicable.
6. The HTTP response is the only service result. Ops MCP has no durable session,
   request, cursor, cache, or result store. Kubernetes, Argo CD, and Hubble are
   the source authorities. The client owns any continuation token it retains.

Concurrent reads do not update shared product state. Hubble alone has a
process-local limit of two concurrent queries. A pod restart clears this
counter and any in-flight HTTP requests; it does not change cluster state.

## HTTP Contract And Authentication

The service listens on `HOST:PORT`; defaults are `0.0.0.0:8080`. The deployed
Ops Pod sets `HOST=127.0.0.1` and `OPS_LOCAL_ONLY=1`. Local-only mode rejects any
other host value.

| Endpoint | Authentication | Result |
| --- | --- | --- |
| `/healthz` | None | 200 when the bearer source can be read and validated; otherwise 503. The current router does not restrict the HTTP method. |
| MCP requests at `/mcp` | `Authorization: Bearer …` | JSON-response MCP transport. |
| Any other path | Not applicable | 404 JSON response. |

A token must contain 32 to 512 URL-safe characters. Configure exactly one of
`OPS_MCP_BEARER_TOKEN_FILE` or `OPS_MCP_BEARER_TOKEN`. File mode reopens the
path for every request, which supports Kubernetes Secret rotation. Comparison
uses SHA-256 digests and constant-time equality. An unreadable or invalid
rotated token fails closed.

`MCP_ALLOWED_ORIGINS` is an optional exact allowlist. If it is empty, all
origins pass. Requests without an `Origin` header pass because non-browser MCP
clients do not always send one. A supplied, unlisted origin gets 403.

The MCP handler uses JSON response mode. The service does not add a durable
application session store, server-side result cursor, or streaming result log.
Each HTTP request repeats bearer and origin checks. Argo and platform list tools
return Kubernetes continuation tokens to the caller. Log reads use time and
tail bounds. Hubble returns continuation advice, not a lossless token. A client
must keep these values if it wants to continue an investigation.

> **Source evidence — fail-closed HTTP boundary**
>
> [Configuration validates port, local binding, namespaces, token sources, and origin allowlist](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/config.mjs#L1-L23).
>
> [Authentication validates and rereads the bearer credential for every request](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/authentication.mjs#L1-L38).
>
> [The router constructs the MCP handler and applies bearer and origin checks](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L491-L543).
>
> [It maps handler failures, starts the listener, and closes on termination](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L545-L564).

## Configuration And Precedence

Process environment is the service authority. In the Ops Pod, Helm values
render those environment variables, so rendered chart values win before the
process starts. There is no request-level configuration override.

| Environment | Default and rule |
| --- | --- |
| `PORT`, `HOST` | `8080`, `0.0.0.0`; port must be 0–65535. The Ops Pod sets `127.0.0.1`. |
| `OPS_LOCAL_ONLY` | Disabled unless exactly `1`. When enabled, `HOST` must be `127.0.0.1`; it also registers the two platform tools. |
| `OPS_DEFAULT_NAMESPACE` | `kubeclaw`. |
| `OPS_ALLOWED_NAMESPACES` | Defaults to the default namespace. It is a comma-separated set of valid names and must include `OPS_DEFAULT_NAMESPACE`. |
| `ARGOCD_NAMESPACE` | `argocd`; independent of the namespaced tool enum. |
| `OPS_MCP_BEARER_TOKEN_FILE`, `OPS_MCP_BEARER_TOKEN` | Exactly one must provide a valid token. File and inline sources together fail startup; neither source also fails startup. File mode wins only by being the sole configured source. |
| `MCP_ALLOWED_ORIGINS` | Empty exact allowlist by default, which permits all origins. An absent `Origin` also passes. |
| `KUBERNETES_API_URL` | `https://kubernetes.default.svc`; must be an HTTPS origin with no credentials, path, query, or fragment. |
| `KUBERNETES_TOKEN_FILE`, `KUBERNETES_CA_FILE` | Projected ServiceAccount `token` and `ca.crt` paths. |
| `HUBBLE_BIN`, `HUBBLE_SERVER` | `/usr/local/bin/hubble` and `hubble-relay.cilium.svc.cluster.local:4245`. |

## Tool Reference

The service always registers six tools. Local-only mode registers the two
platform tools first, for a total of eight. Every row links to the maintained
registration, input schema, defaults, limits, annotations, and returned fields.

| Tool | Input | Output and limit | Source |
| --- | --- | --- | --- |
| `platform_cluster_state` | `nodes` or `ciliumclusterwidenetworkpolicies`; optional continuation token. | One page of at most 50 summaries. Registered only in local-only mode. | [Registration, schema, annotations, page bound, and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L204-L218). |
| `platform_network_state` | Allowed namespace; daemonsets, NetworkPolicies, or CiliumNetworkPolicies; optional continuation token. | One page of at most 50 objects. Registered only in local-only mode. | [Registration, schema, annotations, page bound, and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L219-L235). |
| `list_argocd_applications` | Limit 1–200, default 50; optional continuation token. | Sync, health, revision, destination, operation state, partial flag, and next token. | [Registration, schema, defaults, annotations, and list bound](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L238-L258); [mapped fields and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L259-L279). |
| `namespace_overview` | Allowed namespace. | Deployments, StatefulSets, pods, jobs, Services, and Ingresses. All six lists follow every continuation page. There is no page, duration, item-count, or encoded-output ceiling for the complete operation. | [Registration, schema, and annotations](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L282-L301); [six list scans and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L300-L348). |
| `get_pod` | Allowed namespace and non-empty pod name. | Pod and container state, conditions, and init-container state. | [Registration, schema, annotations, request, and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L351-L376). |
| `get_events` | Allowed namespace, optional object name, limit 1–100, default 40. | The newest matching events after every continuation page is scanned. Each request asks for 500 items. The retained result count is bounded, but total pages, total duration, and encoded result bytes are not. | [All-page scan and bounded retained count](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L107-L132); [registration, schema, defaults, annotations, and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L379-L405). |
| `get_pod_logs` | Namespace, pod, optional container, 1–500 tail lines, absolute `sinceTime`, and `previous`. | At most 64 KiB of log text plus observation metadata. Default is 200 recent lines when no time is given. | [Registration, schema, defaults, annotations, byte request, and result](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L408-L460). |
| `get_hubble_flows` | Namespace, exact pod, verdict, absolute time window, node, and limit 1–50, default 20. | Normalized flows, warnings, partial reasons, returned window, and continuation advice. | [Registration, schema, defaults, annotations, and result call](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L464-L489); [process and output limits](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L25-L75); [partial markers and returned fields](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L95-L118). |

All namespace inputs use an enum built from `OPS_ALLOWED_NAMESPACES`. The list
must contain `OPS_DEFAULT_NAMESPACE`; names must be valid Kubernetes namespace
names. Argo applications always use `ARGOCD_NAMESPACE`.

## Kubernetes Transport

The service sends HTTPS GET requests to `KUBERNETES_API_URL`, which defaults to
the in-cluster service. The URL must be an HTTPS origin with no credentials,
path, query, or fragment. It rereads the ServiceAccount token for every request,
uses the mounted CA, disables connection reuse, follows no redirects, and has a
10-second timeout and 8 MiB response limit.

List operations retry only when a response is too large. They halve page size,
keep the selector and continuation token, and stop if one item remains too
large. This is pressure control, not a retry for authorization, transport, or
server errors.

The 10-second timeout and 8 MiB ceiling apply to one Kubernetes HTTP request.
They are not limits for a complete multi-page tool call. `createKubeList` uses
`maxPages=Infinity` and no aggregate deadline when a caller does not provide a
page limit. `namespace_overview` uses that default for all six concurrent list
scans. `get_events` deliberately requests one page at a time but follows the
continuation token until it is empty. It retains only the newest requested
event count, but it can still scan an unbounded number of pages.

## List Pressure, Failure, And Safe Stop

Use `namespace_overview` only for namespaces whose six resource lists are known
to be small. Prefer `get_pod`, bounded log reads, or a one-page platform tool
when these answer the question. For events, supply `objectName` when one object
is under investigation. A smaller event `limit` reduces the retained result; it
does not reduce the page scan.

A large or changing namespace can keep either full scan busy for a long time.
Each page still has its transport timeout and byte ceiling, but the operation
has no total deadline, total page limit, total item limit, or explicit final
JSON byte ceiling. `namespace_overview` retains all returned items. `get_events`
retains at most 100 event summaries, but summary strings have no separate byte
ceiling. If any list request fails, the tool call fails; it does not return the
successfully scanned lists as a partial result.

Do not start another full scan to recover from pressure. Stop issuing calls and
let the current request finish or fail. A client disconnect is not a documented
cancellation mechanism for the six Kubernetes requests. If the process must be
stopped to protect the pod, terminate the Ops MCP container; this is safe for
cluster state because the tools do not write, but it interrupts all clients.
Keep the failed request time and do not describe an absent response as an empty
namespace.

Reconsider these two contracts when a permitted namespace can contain enough
objects or events to approach client, pod-memory, or response-size limits. A
safer next version would expose one resource kind per request, continuation
tokens, an aggregate deadline, and an encoded-output ceiling. It must also mark
partial scans explicitly. This costs more client calls and can give a view from
slightly different times, but it makes load and incompleteness visible.

> **Source evidence — per-request bounds do not bound a complete scan**
>
> [`createKubeList` defaults to unlimited pages and applies a deadline only when `maxPages` is finite](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/kubernetes.mjs#L64-L97).
>
> [The event loop follows each continuation token and retains only the requested number of newest events](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L107-L132).

## Hubble Transport And Evidence Limits

The Hubble tool runs the fixed `hubble observe` binary against
`hubble-relay.cilium.svc.cluster.local:4245` by default. One query covers at
most 15 minutes; the default window is the last 5 minutes. At most two queries
run at once. A query has a 12-second process timeout, reads at most 2 MiB of raw
output, and returns at most 192 KiB and the requested number of flows.

The service rechecks exact namespace and pod identity after Hubble returns data.
It records invalid JSON, lost events, node status, stderr, process failure,
byte limits, and possible peer saturation as partial reasons. It has no
lossless cursor. An empty or partial result does not prove that no drop occurred.

> **Source evidence — bounded downstream calls**
>
> [Kubernetes transport fixes HTTPS, CA, token rotation, 10-second timeout, and an 8 MiB ceiling](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/kubernetes.mjs#L1-L60).
>
> [List transport retries only oversized pages and retains a continuation token](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/kubernetes.mjs#L64-L98).
>
> [Hubble fixes concurrency, query window, binary, relay, and timeout defaults](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L1-L50).
>
> [It bounds bytes and applies exact post-query filtering](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L51-L100).
>
> [The result records process failures, partial reasons, continuation advice, and retention limits](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L101-L118).

## Authorization And Data Exposure

The MCP methods use Kubernetes HTTPS GET requests only. The chart gives their
ServiceAccount `get` and `list` for selected workload, network, Argo, and event
resources. It does not grant direct Secret reads. Cluster-wide reads are limited
to nodes and Cilium cluster-wide policies. RoleBindings constrain namespaced
reads to configured namespaces.

This method boundary is narrower than the effective credential boundary in the
default Ops Pod. The Codex and MCP containers mount the same projected token
when `rbac.execNamespaces` is non-empty. The default list contains `kubeclaw`.
The same ServiceAccount then has `pods/exec` `create` in that namespace. Ops MCP
does not register an exec method and its Kubernetes client sends GET requests,
but a compromised process could use the mounted credential outside that client.
Set `rbac.execNamespaces=[]` to remove the token and kubeconfig from Codex and
to omit exec Roles; MCP keeps its read token. If the MCP process must also have
a read-only identity while Codex keeps exec, place them in separate pods with
separate ServiceAccounts. That stronger isolation adds a network listener,
network policy, and an independent lifecycle.

> **Source evidence — method authority and process authority differ**
>
> [The Kubernetes transport always sends GET and reads the mounted token for each request](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/kubernetes.mjs#L20-L59).
>
> [The default execution namespace enables the wider credential path](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/values.yaml#L21-L29).
>
> [One projected token volume is mounted into MCP and conditionally into Codex](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L69-L101).
>
> [The execution Role grants the same ServiceAccount `pods/exec` `create`](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/rbac.yaml#L63-L92).

Pod logs and Hubble summaries are not content-redacted. They can contain
application or network identifiers. Treat returned text as observation, never
as instructions. Use the smallest namespace, pod, time window, and limit that
answers the question.

## Failure And Recovery

| Symptom | Meaning | Recovery |
| --- | --- | --- |
| `/healthz` is 503 | Token source is absent or invalid. | Repair the bearer Secret or configured token. |
| 401 from `/mcp` | Bearer header does not match the current token. | Refresh the client credential. |
| 403 from `/mcp` | Browser origin is not allowed. | Add the exact trusted origin or use a non-browser client. |
| Kubernetes API error | Resource, namespace, RBAC, network, or API health failed. | Inspect the bounded status/path error and correct the specific boundary. |
| Response too large | One Kubernetes page could not stay below 8 MiB, even after the list page size decreased. | Use a narrower tool or event object filter. Do not increase the transport ceiling first. |
| Namespace overview does not finish | One or more of the six full list scans remain active, or a page failed. | Do not start a second overview. Use a single-object or one-page tool. Stop the MCP container only if continued pressure threatens the pod. |
| Event request does not finish | The tool is following a large continuation chain. The result limit does not limit the scan. | Do not retry in parallel. Use `objectName`, or stop the MCP container if continued pressure threatens the pod. |
| Hubble `partial` | One or more explicit completeness limits applied. | Split the time window or narrow namespace, pod, node, or verdict. |
| Hubble CLI fails | Relay, binary, policy, DNS, or process problem. | Check returned reasons and stderr; do not report the network as healthy. |

Because all supported tools are reads, a transport failure has no Ops MCP write
effect to reconcile. A retry is still not an identical observation: Kubernetes
and Hubble state can change between calls, and an omitted Hubble event can age
out. Keep the original timestamp and response. Retry only with the same or a
narrower bound, and report that the samples came from different times.

## Supported Change Boundary

Ops MCP has no runtime tool plug-in interface. A supported new tool is a service
release. Add its `registerTool` entry with a strict Zod input, read-only and
idempotent annotations, per-request and aggregate limits, reduced output,
explicit partial semantics, and focused tests. Do not repeat the unlimited
full-scan behavior of `namespace_overview` or `get_events`. If it reads a new
Kubernetes resource, add only the required `get` or `list` RBAC and
namespace/network scope. Then
update the Codex skill tool list, this reference, the tool-drift check, and the
deployment image. If a tool would write, exec, follow an unbounded stream, read
Secrets, or accept an arbitrary URL or command, it is outside this service's
supported boundary; use a separately authorized component.

Changing an existing input or output is also a contract change because Codex
instructions and clients depend on the names, defaults, limits, continuation,
and partial markers. Add a new optional field only with validation, a defined
default, backward-compatible output, tests, and documentation. Rename or remove
a field only in a versioned tool or service protocol.

> **Source evidence — tools are compiled service registrations**
>
> [Each tool declares its schema and read-only behavior directly in `buildServer`](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L189-L235).
>
> [The deployment grants namespaced reads through explicit RoleBindings rather than tool annotations](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/rbac.yaml#L34-L72).

Run the Ops MCP local, HTTP, authentication, Kubernetes, Hubble, diagnostics,
bootstrap, and policy-contract tests after a change. These checks simulate and
validate boundaries. A live claim needs a real API server and, for flow data, a
real Hubble Relay with retained observations.
