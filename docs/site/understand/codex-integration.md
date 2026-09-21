# Codex Integration: Ops Plugin And Runtime Boundary

Status: implemented as a local plugin package and an optional Ops Pod
Audience: Codex operator, plugin maintainer, platform operator, security specialist
Owner: Codex integration maintainers
Evidence: plugins/kubeclaw-ops; .agents/plugins/marketplace.json; charts/ops-pod; tools/ops-mcp
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
Applies to: `kubeclaw-ops@0.2.0` and the current local marketplace entry
Last verified: manifest, skill, chart, service, and test inspection on 2026-09-21

## What The Plugin Does

The `kubeclaw-ops` Codex plugin provides one troubleshooting skill. The skill
teaches Codex how to correlate Argo CD state, Kubernetes workloads and events,
bounded pod logs, and Hubble flows. It instructs Codex to report evidence and a
safe next action. It explicitly forbids the agent from claiming that it
performed a mutation.

The plugin is not a Nova pipeline plugin. It loads no Nova stage, adapter, or
observer. It also does not embed an MCP server. The Ops MCP connection must be
available separately in the Codex environment.

## Request, Data, And Error Path

1. An operator asks Codex to diagnose a cluster symptom. The troubleshooting
   skill selects an Ops MCP tool and the narrowest namespace, object, time, and
   result bounds that can answer the question.
2. The Codex host sends an MCP request to the separate service. In the Ops Pod,
   this is loopback `127.0.0.1:8080/mcp`. Every request carries the bearer token.
3. Ops MCP checks the bearer value, optional browser origin, tool schema, and
   namespace allowlist. It then reads the Kubernetes API or starts the fixed
   Hubble CLI. Kubernetes calls use the projected ServiceAccount token and CA.
4. Ops MCP returns reduced JSON text with continuation or partial-result
   metadata where the tool supports it. The namespace and event full-scan tools
   do not have aggregate scan or output bounds. Codex correlates the evidence,
   states these limits, and reports a safe next action. The skill does not
   authorize a repair.
5. Authentication, RBAC, transport, size, timeout, or partial-result failures
   remain visible at their boundary. Codex must not fill a missing result from
   memory or state that a mutation succeeded.

Codex home and workspace data persist on their claims. The MCP server has no
durable result or session store. Kubernetes and Hubble remain the authorities
for live observations. The optional Tailscale container has a separate state
claim; removing the plugin does not remove any of these stores.

> **Source evidence — package and marketplace boundary**
>
> [The plugin manifest declares one skill directory and the `Read` interface capability](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/plugins/kubeclaw-ops/.codex-plugin/plugin.json#L1-L26).
>
> [The local marketplace makes installation available and requests authentication on install](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/.agents/plugins/marketplace.json#L1-L20).
>
> [The skill defines the evidence order and forbids mutation claims](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md#L1-L33).

## Installation And Activation

The personal marketplace points `kubeclaw-ops` to
`./plugins/kubeclaw-ops`. Install that entry in the Codex host and complete the
requested connection setup. Codex discovers the manifest under
`.codex-plugin/plugin.json` and the skill under `skills/`.

Installation makes instructions available. It does not grant Kubernetes
access. Tool calls work only when the host also has a configured Ops MCP
connection and valid bearer credential. Missing tools must stop evidence
collection; the agent must not replace them with guessed cluster state.

For an update, replace the plugin with the selected package revision, reconnect
if its connection requirements changed, and verify that the skill lists only
tools provided by the service. For removal, disconnect the MCP connection and
remove the plugin. Neither action deletes cluster objects, logs, or MCP-side
history.

## Deployed Ops Pod

The optional Ops Pod runs Codex and Ops MCP as separate containers in one
single-replica StatefulSet. They share a pod network, bearer Secret, and Pod
ServiceAccount identity, but have different filesystems and processes. MCP
listens only on `127.0.0.1:8080`; Codex connects over the pod loopback.

The Codex and MCP containers run as user 1000, use the runtime-default seccomp profile,
drop all Linux capabilities, forbid privilege escalation, and have read-only
root filesystems. Codex has persistent home and workspace volumes. MCP always
mounts the projected, one-hour ServiceAccount token and CA. When
`rbac.execNamespaces` is non-empty, Codex mounts that same projected volume and
a generated kubeconfig. This is the default because the default list contains
`kubeclaw`. The bearer Secret is mounted read-only into both containers.

This pod-level boundary matters: the plugin's `Read` label and the MCP tool
annotations describe their user interfaces. They do not reduce ServiceAccount
RBAC. With the default execution namespace, the shared ServiceAccount has
`pods/exec` `create`. The MCP API does not expose an exec tool and its Kubernetes
client sends GET requests only, but the MCP process holds the same credential.
Therefore, interface authority is read-only while effective process authority
is wider.

> **Source evidence — process and credential layout**
>
> [The chart requires immutable digests for the Codex and MCP images and fixes one writer](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L1-L45).
>
> [Codex receives its own environment, persistent mounts, and readiness boundary](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L49-L84).
>
> [MCP receives the loopback, namespace, bearer, Kubernetes, and probe settings](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L85-L112).
>
> [The same projected token volume is always mounted into MCP and conditionally mounted into Codex](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L69-L101).
>
> [The shared volume projects one rotating token, pod namespace, and cluster CA](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L137-L158).
>
> [The optional Tailscale container uses its separately configured image and state](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/workload.yaml#L113-L164).
>
> [RBAC grants cluster reads and creates namespace-scoped bindings separately](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/rbac.yaml#L1-L58).
>
> [Optional pod-exec access is confined to the explicitly listed namespaces](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/templates/rbac.yaml#L60-L91).

## Workspace And Network Boundaries

The StatefulSet has one replica because one persistent Codex identity and
workspace must not have concurrent writers. The home claim is 2 GiB. The
workspace claim uses `persistence.size`, 20 GiB by default. A rolling update
must release the old writer before the new writer uses the claim.

Default NetworkPolicy denies ingress. Egress allows DNS, the discovered API
server addresses, and public TCP 443 while excluding private, Tailnet,
link-local, and loopback ranges. Optional userspace Tailscale adds its UDP paths
and a loopback SOCKS endpoint without `NET_ADMIN` or host networking.

## Configuration And Precedence

Helm values are the deployment authority. The template writes the resulting
environment variables and mounts; the processes consume those rendered values.
There is no later plugin-level override for Kubernetes namespaces or bearer
source.

| Value | Default or rule |
| --- | --- |
| `codexImage`, `mcpImage` | Required `image@sha256:digest`; Helm render fails for a tag or empty value. |
| `bearerSecret` | `codex-ops-bearer`; key `token` is mounted into both containers. |
| `githubSecret` | Empty; when set, key `token` becomes `GH_TOKEN` in Codex only. |
| `persistence.size` | 20 GiB workspace; Codex home is fixed at 2 GiB. |
| `rbac.namespaces` | `[kubeclaw]`; controls MCP namespaced reads. |
| `rbac.execNamespaces` | `[kubeclaw]`; a non-empty list mounts the shared API token and kubeconfig into Codex and grants the Pod ServiceAccount `pods/exec` `create` in each listed namespace. MCP always mounts the same projected token. An empty list removes the Codex mount and exec Roles; it does not remove MCP read access. No setting adds an exec MCP tool. |
| `argoNamespace`, `defaultNamespace` | `argocd` and `kubeclaw`. |
| Network policy | Enabled; Cilium mode false until deployment discovery enables it; API server port 6443. |
| `tailscale.enabled` | `false`. When enabled, the default image is mutable tag `ghcr.io/tailscale/tailscale:v1.102.3`; the chart does not require a digest for this optional image. Pin a tested digest for a controlled deployment. |

The immutable-image guard therefore covers the two required application
containers only. It does not cover the optional Tailscale default. Enabling
Tailscale without replacing that tag weakens release reproducibility.

> **Source evidence — deployment defaults and the image exception**
>
> [Values define storage, namespace, network, and disabled Tailscale defaults](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/ops-pod/values.yaml#L1-L46).

## Connection Failure And Recovery

| Failure | Observable result | Safe recovery |
| --- | --- | --- |
| Plugin is absent or disabled | Skill is unavailable. | Install or enable the declared marketplace package. |
| MCP connection is absent | Instructions exist, but tool calls are unavailable. | Configure the MCP endpoint and bearer token. Do not infer live state. |
| Bearer token is invalid or rotating | MCP returns 401 or readiness becomes false. | Repair the Secret; the server rereads the file on each request. |
| ServiceAccount lacks a resource | Kubernetes returns a bounded API error. | Inspect RBAC. Do not widen all namespaces by default. |
| Logs or Hubble output are partial | Result includes truncation or partial metadata. | Narrow or continue the query and state the evidence limit. |
| Codex process needs login or remote recovery | MCP can remain healthy; Codex readiness can fail. | Use the declared operator access path. MCP never claims Codex is ready. |

## Operation, Change, And Recovery Boundary

Check Codex readiness and MCP readiness separately. Then make one narrowly
scoped tool call and retain its request parameters, response metadata, and
time. Avoid a full namespace or event scan when a single-object or one-page
tool can answer the question. A running pod is not evidence that bearer
authentication, RBAC, the API route, Hubble, or Codex login works. On rollout,
verify that the previous StatefulSet writer has released both claims before the
replacement becomes active.

Change troubleshooting guidance inside the plugin skill only when the existing
Ops MCP contract can support it. A new evidence source or tool is an Ops MCP
service change, not a skill-only extension. It requires server validation,
least-privilege RBAC and network changes, chart wiring, the skill tool list,
service tests, and this guide. In the colocated profile, new RBAC applies to the
shared ServiceAccount and changes the effective authority of both processes
when Codex has the token mount. Adding a mutation tool is outside the supported
`kubeclaw-ops` boundary. Use another separately authorized system for changes.

The historical reason for colocating Codex and MCP is not recorded. The current
design assessment is an inference: loopback MCP avoids a cluster-wide MCP
listener, and separate processes keep instruction packaging apart from the
evidence implementation. Credentials are not separate in the default profile.
The costs are a shared credential boundary, shared pod failure domain, one
persistent writer, and coupled rollout. Set `rbac.execNamespaces=[]` when Codex
does not need direct Kubernetes execution; Codex then has no API token mount and
MCP retains its read path. If Codex must keep exec while MCP must have a strictly
read-only credential, use separate pods and ServiceAccounts. Reconsider
colocation when that isolation, independent scaling, or remote clients justify
the extra authenticated network boundary.

See [Ops MCP](ops-mcp.md) for every tool and service limit. The plugin tests are
manifest and instruction checks. The chart and MCP tests cover their own
boundaries. A live validation still needs a Codex connection, Kubernetes API,
and Hubble Relay for network evidence.
