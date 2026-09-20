# Codex Integration: Ops Plugin And Runtime Boundary

Status: implemented as a local plugin package and an optional Ops Pod
Audience: Codex operator, plugin maintainer, platform operator, security reviewer
Owner: Codex integration maintainers
Evidence: plugins/kubeclaw-ops; .agents/plugins/marketplace.json; charts/ops-pod; tools/ops-mcp
Evidence revision: `549dfe003d41fca50b85c3040029a74a817715d6`
Applies to: `kubeclaw-ops@0.2.0` and the current local marketplace entry
Last verified: manifest, skill, chart, service, and test inspection on 2026-09-20

## What The Plugin Does

The `kubeclaw-ops` Codex plugin provides one troubleshooting skill. The skill
teaches Codex how to correlate Argo CD state, Kubernetes workloads and events,
bounded pod logs, and Hubble flows. It instructs Codex to report evidence and a
safe next action. It explicitly forbids the agent from claiming that it
performed a mutation.

The plugin is not a Nova pipeline plugin. It loads no Nova stage, adapter, or
observer. It also does not embed an MCP server. The Ops MCP connection must be
available separately in the Codex environment.

> **Source evidence — package and marketplace boundary**
>
> [The plugin manifest declares one skill directory and the `Read` interface capability](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/plugins/kubeclaw-ops/.codex-plugin/plugin.json#L1-L26).
>
> [The local marketplace makes installation available and requests authentication on install](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/.agents/plugins/marketplace.json#L1-L20).
>
> [The skill defines the evidence order and forbids mutation claims](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md#L1-L33).

## Installation And Activation

The personal marketplace points `kubeclaw-ops` to
`./plugins/kubeclaw-ops`. Install that entry in the Codex host and complete the
requested connection setup. Codex discovers the manifest under
`.codex-plugin/plugin.json` and the skill under `skills/`.

Installation makes instructions available. It does not grant Kubernetes
access. Tool calls work only when the host also has a configured Ops MCP
connection and valid bearer credential. Missing tools must stop evidence
collection; the agent must not replace them with guessed cluster state.

For an update, replace the plugin with the reviewed package revision, reconnect
if its connection requirements changed, and verify that the skill lists only
tools provided by the service. For removal, disconnect the MCP connection and
remove the plugin. Neither action deletes cluster objects, logs, or MCP-side
history.

## Deployed Ops Pod

The optional Ops Pod runs Codex and Ops MCP as separate containers in one
single-replica StatefulSet. They share a pod network, bearer Secret, and
ServiceAccount identity, but have different filesystems and processes. MCP
listens only on `127.0.0.1:8080`; Codex connects over the pod loopback.

Both containers run as user 1000, use the runtime-default seccomp profile,
drop all Linux capabilities, forbid privilege escalation, and have read-only
root filesystems. Codex has persistent home and workspace volumes. MCP receives
a projected, one-hour ServiceAccount token and CA. The bearer Secret is mounted
read-only into both containers.

This pod-level boundary matters: the plugin's `Read` label describes its user
interface, while Kubernetes RBAC describes actual cluster authority. Codex can
also receive `pods/exec` in explicitly listed namespaces. The MCP service itself
does not expose an exec tool and remains read-only.

> **Source evidence — process and credential layout**
>
> [The workload fixes immutable images, one writer, security contexts, mounts, probes, and loopback MCP](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/ops-pod/templates/workload.yaml#L1-L176).
>
> [RBAC grants read verbs broadly and isolates optional pod exec in named namespaces](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/ops-pod/templates/rbac.yaml#L1-L91).

## Workspace And Network Boundaries

The StatefulSet has one replica because one persistent Codex identity and
workspace must not have concurrent writers. The home claim is 2 GiB. The
workspace claim uses `persistence.size`, 20 GiB by default. A rolling update
must release the old writer before the new writer uses the claim.

Default NetworkPolicy denies ingress. Egress allows DNS, the discovered API
server addresses, and public TCP 443 while excluding private, Tailnet,
link-local, and loopback ranges. Optional userspace Tailscale adds its UDP paths
and a loopback SOCKS endpoint without `NET_ADMIN` or host networking.

## Connection Failure And Recovery

| Failure | Observable result | Safe recovery |
| --- | --- | --- |
| Plugin is absent or disabled | Skill is unavailable. | Install or enable the reviewed marketplace package. |
| MCP connection is absent | Instructions exist, but tool calls are unavailable. | Configure the MCP endpoint and bearer token. Do not infer live state. |
| Bearer token is invalid or rotating | MCP returns 401 or readiness becomes false. | Repair the Secret; the server rereads the file on each request. |
| ServiceAccount lacks a resource | Kubernetes returns a bounded API error. | Review RBAC. Do not widen all namespaces by default. |
| Logs or Hubble output are partial | Result includes truncation or partial metadata. | Narrow or continue the query and state the evidence limit. |
| Codex process needs login or remote recovery | MCP can remain healthy; Codex readiness can fail. | Use the declared operator access path. MCP never claims Codex is ready. |

See [Ops MCP](ops-mcp.md) for every tool and service limit. The plugin tests are
manifest and instruction checks. The chart and MCP tests cover their own
boundaries. A live acceptance still needs a Codex connection, Kubernetes API,
and Hubble Relay for network evidence.
