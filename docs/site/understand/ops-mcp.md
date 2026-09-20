# Ops MCP: Read-Only Cluster Evidence Service

Status: implemented; optional to pipeline execution
Audience: operator, Codex integrator, Ops MCP maintainer, security reviewer
Owner: Ops MCP maintainers
Evidence: tools/ops-mcp/src; tools/ops-mcp/test; charts/ops-pod; scripts/deploy-ops-pod.sh
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
Applies to: `kubeclaw-ops` MCP service version 0.2.0
Last verified: service, chart, policy, and focused test inspection on 2026-09-20

## Purpose And Safety Boundary

Ops MCP collects bounded operational evidence. It can read Argo CD
applications, Kubernetes workload state, events, pod logs, and Hubble flows.
It cannot deploy, restart, delete, patch, change a Secret, or execute a command.
The service registers every tool with read-only, non-destructive, idempotent
annotations.

Ops MCP is an optional analysis surface. Nova, Buster, and Prism do not depend
on it for pipeline lifecycle authority.

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
> [The HTTP router exposes only health and MCP and applies bearer and origin checks](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/server.mjs#L490-L553).

## Tool Reference

| Tool | Input | Output and limit |
| --- | --- | --- |
| `platform_cluster_state` | `nodes` or `ciliumclusterwidenetworkpolicies`; optional continuation token. | One page of at most 50 summaries. Registered only in local-only mode. |
| `platform_network_state` | Allowed namespace; daemonsets, NetworkPolicies, or CiliumNetworkPolicies; optional continuation token. | One page of at most 50 objects. Registered only in local-only mode. |
| `list_argocd_applications` | Limit 1–200, default 50; optional continuation token. | Sync, health, revision, destination, and operation state plus next token. |
| `namespace_overview` | Allowed namespace. | Deployments, StatefulSets, pods, jobs, Services, and Ingresses. Each list follows pagination. |
| `get_pod` | Allowed namespace and non-empty pod name. | Pod and container state, conditions, and init-container state. |
| `get_events` | Allowed namespace, optional object name, limit 1–100, default 40. | Newest matching events after all pages are scanned; page size 500. |
| `get_pod_logs` | Namespace, pod, optional container, 1–500 tail lines, absolute `sinceTime`, and `previous`. | At most 64 KiB of log text plus observation metadata. Default is 200 recent lines when no time is given. |
| `get_hubble_flows` | Namespace, exact pod, verdict, absolute time window, node, and limit 1–50, default 20. | Normalized flows, warnings, partial reasons, returned window, and continuation advice. |

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
> [Kubernetes transport fixes HTTPS, CA, token rotation, 10-second timeout, 8 MiB ceiling, and narrow oversized-page retry](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/kubernetes.mjs#L1-L98).
>
> [Hubble transport fixes concurrency, time window, byte limits, exact filtering, and partial-result semantics](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tools/ops-mcp/src/hubble.mjs#L1-L118).

## Authorization And Data Exposure

The chart grants `get` and `list` for selected workload, network, Argo, and
event resources. It does not grant Secret reads. Cluster-wide reads are limited
to nodes and Cilium cluster-wide policies. RoleBindings constrain namespaced
reads to configured namespaces.

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
| Response too large | Even reduced page size could not stay below 8 MiB. | Narrow the resource query. Do not increase the global ceiling first. |
| Hubble `partial` | One or more explicit completeness limits applied. | Split the time window or narrow namespace, pod, node, or verdict. |
| Hubble CLI fails | Relay, binary, policy, DNS, or process problem. | Check returned reasons and stderr; do not report the network as healthy. |

Run the Ops MCP local, HTTP, authentication, Kubernetes, Hubble, diagnostics,
bootstrap, and policy-contract tests after a change. These checks simulate and
validate boundaries. A live claim needs a real API server and, for flow data, a
real Hubble Relay with retained observations.
