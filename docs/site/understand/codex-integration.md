# Codex Integration: Ops Plugin And Runtime Boundary

Status: implemented as a local plugin package and an optional Ops Pod
Audience: Codex operator, plugin maintainer, platform operator, security specialist
Owner: Codex integration maintainers
Evidence: plugins/kubeclaw-ops; .agents/plugins/marketplace.json; charts/ops-pod; tools/ops-mcp
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Upstream source scope: Ops changes on main at `34cf38ef53ee41381543785d0ffae90a37fac9ca`; runtime source adoption into this documentation branch remains separate
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
   this is the internal HTTPS Service `codex-ops-mcp.kubeclaw-ops.svc:8080/mcp`. Every request carries that client's own bearer token.
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
> **Claim:** The Codex package supplies troubleshooting instructions, not a Nova registration, embedded MCP server or mutation authority.
>
> **Implementation:** The package manifest, marketplace entry and skill below define installation and instruction scope.
>
> [The plugin manifest declares one skill directory and the `Read` interface capability](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/plugins/kubeclaw-ops/.codex-plugin/plugin.json#L1-L26).
>
> [The local marketplace makes installation available and requests authentication on install](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/.agents/plugins/marketplace.json#L1-L20).
>
> [The skill defines the evidence order and forbids mutation claims](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md#L1-L33).
>
> **Contract or setting:** The manifest Read capability describes the plugin interface; the separately configured Ops MCP credential and deployment define usable process authority.
>
> **Test evidence:** No executed Codex-host installation or troubleshooting session accompanies these manifest/skill links. The [Ops service method fixture](https://github.com/datrab/kubeclaw/blob/54a535b6046bc54e9aeeebee9c4cd24388477115/tools/ops-mcp/test/local.test.mjs#L43-L50) checks the separate MCP interface, not plugin activation.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Installing instructions neither grants Kubernetes access nor proves a connected Codex host, service readiness or successful diagnosis.

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

The `codex-ops` release in `kubeclaw-ops` contains a persistent Codex StatefulSet
and a separate central Ops MCP Deployment. The MCP has its own ServiceAccount,
internal HTTPS Service, TLS material, probes, credential policy and network
boundary. Codex reaches `https://codex-ops-mcp.kubeclaw-ops.svc:8080/mcp`
with its own bearer. Nova and Buster use distinct credentials against the same
service. There is no MCP sidecar in the Codex Pod.

Codex and Nova have no Kubernetes token or kubeconfig. Only MCP mounts the
observer/exec credential. Buster's worker retains its separate namespace-
controller lease exception. `rbac.execNamespaces` bounds MCP authority; it
never enables a Codex API credential. Global Ops reads do not grant global exec.

The Codex troubleshooting plugin remains guidance. Its Read capability does
not install the MCP or grant execution. The server also exposes an independently
authorized `exec_pod` tool; the diagnostic skill must not silently turn a read
request into a mutation. Review the central grant and the requested effect.

Nova and Buster already receive [native MCP integration](ops-mcp.md#native-agent-connection)
through their selected chart/runtime bundles. They need no manual plugin or CLI
installation for these tools. Discovery, schemas, authentication and every
operation go through the central service.

> **Source evidence — process and credential layout**
>
> **Claim:** Codex and MCP run in separate Pods and ServiceAccounts; exec rights stay at the MCP.
>
> **Implementation:** [Codex StatefulSet and mounts](https://github.com/datrab/kubeclaw/blob/34cf38ef53ee41381543785d0ffae90a37fac9ca/charts/ops-pod/templates/workload.yaml#L28-L82) [MCP Deployment and mounts](https://github.com/datrab/kubeclaw/blob/34cf38ef53ee41381543785d0ffae90a37fac9ca/charts/ops-pod/templates/mcp.yaml#L37-L91) [MCP authorization](https://github.com/datrab/kubeclaw/blob/34cf38ef53ee41381543785d0ffae90a37fac9ca/tools/ops-mcp/src/access-policy.mjs#L50-L107) [Native OpenClaw connector](https://github.com/datrab/kubeclaw/blob/34cf38ef53ee41381543785d0ffae90a37fac9ca/charts/kubeclaw/templates/configmap-gateway.yaml#L202-L223)
>
> **Contract or setting:** Per-client MCP grants remain bounded by the MCP ServiceAccount RBAC.
>
> **Test evidence:** See the scoped 2026-10-22 results and remaining limits in [Ops MCP verification](ops-mcp.md#verification).
>
> **Revision:** `34cf38ef53ee41381543785d0ffae90a37fac9ca`; upstream main, separate from documentation-branch source adoption.
>
> **Limit:** Native Nova discovery was observed; mobile pairing and a separate Buster gateway probe remain outside that proof.


## Workspace And Network Boundaries

The StatefulSet has one replica because one persistent Codex identity and
workspace must not have concurrent writers. The home claim is 2 GiB. The
workspace claim uses `persistence.size`, 20 GiB by default. A rolling update
must release the old writer before the new writer uses the claim.

Codex egress includes its configured MCP Service, DNS and approved remote-service paths. The separate MCP policy permits configured clients and its Kubernetes/Hubble dependencies. Effective CNI enforcement still needs live proof. Optional userspace Tailscale adds its UDP paths
and a loopback SOCKS endpoint without `NET_ADMIN` or host networking.

## Configuration And Precedence

Helm values are the deployment authority. The template writes the resulting
environment variables and mounts; the processes consume those rendered values.
There is no later plugin-level override for Kubernetes namespaces or bearer
source.

| Value | Default or rule |
| --- | --- |
| `codexImage`, `mcpImage` | Required `image@sha256:digest`; Helm render fails for a tag or empty value. |
| `bearerSecret` | `codex-ops-bearer`; key `token` identifies Codex to the central MCP. Other agents receive their own token Secret. |
| `githubSecret` | Empty; when set, key `token` becomes `GH_TOKEN` in Codex only. |
| `persistence.size` | 20 GiB workspace; Codex home is fixed at 2 GiB. |
| `rbac.namespaces` | Caps scoped MCP reads; selected production also enables global Ops observation with separate service/client flags. |
| `rbac.execNamespaces` | Bounds the MCP exec identity in exact namespaces. Client exec additionally requires explicit Pod-label/container grants; it never mounts a Kubernetes credential into Codex. Dynamic `test*` access is managed separately. |
| `argoNamespace`, `defaultNamespace` | `argocd` and `kubeclaw`. |
| Network policy | Enabled; Cilium mode false until deployment discovery enables it; API server port 6443. |
| `tailscale.enabled` | `false`. When enabled, the default image is mutable tag `ghcr.io/tailscale/tailscale:v1.102.3`; the chart does not require a digest for this optional image. Pin a tested digest for a controlled deployment. |

The immutable-image guard therefore covers the two required application
containers only. It does not cover the optional Tailscale default. Enabling
Tailscale without replacing that tag weakens release reproducibility.

> **Source evidence — deployment defaults and the image exception**
>
> **Claim:** The chart requires digests for the two application images but leaves optional Tailscale disabled with a mutable default image tag.
>
> **Implementation:** The values below define storage, namespaces, network policy and the optional image exception.
>
> [Values define storage, namespace, network, and disabled Tailscale defaults](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/ops-pod/values.yaml#L1-L46).
>
> **Contract or setting:** The linked values are deployment defaults, not a live image-selection or release observation.
>
> **Test evidence:** No executed deployment/image-acquisition check accompanies this values evidence. A controlled rollout must separately verify the selected digests and optional Tailscale configuration.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** Default values do not prove the running image identity, single-writer handoff, external login, Tailscale route or Kubernetes access.

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

Change troubleshooting guidance with the selected MCP contract. A new tool
needs a service release, input/effect contracts, central client grants, matching
RBAC/network scope, audit behavior, tests and client-discovery proof. The
troubleshooting skill remains a read-oriented workflow; execution is a separate
explicitly authorized request. A lost exec response requires effect
reconciliation before any retry. Keep host/control-plane recovery outside this
cluster. See [the central MCP contract](ops-mcp.md) for current grants and limits.
