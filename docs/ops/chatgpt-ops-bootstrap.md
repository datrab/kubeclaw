# ChatGPT Ops bootstrap

This runbook bootstraps a private, read-only ChatGPT operations path for the KubeClaw cluster.

For Cilium architecture, the first K3s/Flannel cutover, policy ownership and Hubble operations, see `docs/ops/cilium-networking.md`. That document is the networking source of truth; this runbook focuses on the ChatGPT/MCP path.

## Target flow

Before Cilium is installed, the MCP can inspect Argo and Kubernetes:

```text
ChatGPT (web)
      |
      | OpenAI Secure MCP Tunnel
      v
ops-mcp-tunnel (Kubernetes)
      |
      | cluster-local HTTP
      v
ops-mcp:8080/mcp
      |
      | Kubernetes ServiceAccount + read-only RBAC
      +--> Argo CD Applications
      +--> workloads / pods
      +--> events
      `--> bounded pod logs
```

After the Cilium PR is deployed, the same MCP additionally has a tightly bounded read-only Hubble path:

```text
ChatGPT
   |
Secure MCP Tunnel
   v
KubeClaw Ops MCP
   |-- Argo CD
   |-- Kubernetes API / events / bounded logs
   `-- Hubble Relay :4245
          |
          v
       Cilium/eBPF flows
```

The MCP server has no Kubernetes write verbs, no Secret/ConfigMap access and no pod exec capability.

## 1. Merge the Argo / MCP bootstrap PR

After merge to `main`, GitHub Actions builds and publishes:

```text
ghcr.io/datrab/kubeclaw-ops-mcp:latest
```

`latest` is published only from `main`. Pull requests are validation-only and manual builds from other refs receive the immutable SHA tag rather than replacing `latest`.

The image build uses the committed `tools/ops-mcp/package-lock.json` and `npm ci`. Once Argo manages this component, prefer pinning the Deployment itself to an immutable SHA/digest rather than relying on `latest`.

## 2. Deploy Argo CD

```bash
./scripts/deploy-argocd.sh
```

Verify:

```bash
kubectl get pods -n argocd
kubectl get ingress -n argocd argocd
```

The Argo UI is exposed privately through the existing Tailscale Kubernetes Operator.

## 3. Deploy the read-only Ops MCP server

```bash
kubectl apply -f my-values/infra/ops-mcp.yaml
kubectl rollout status deployment/ops-mcp -n kubeclaw --timeout=180s
kubectl get ingress -n kubeclaw ops-mcp
```

Basic health check without opening an additional NetworkPolicy path:

```bash
kubectl -n kubeclaw port-forward svc/ops-mcp 18080:8080
```

In a second terminal:

```bash
curl -fsS http://127.0.0.1:18080/healthz
```

Expected response:

```json
{"ok":true,"service":"kubeclaw-ops-mcp"}
```

Stop the temporary port-forward after the check. The service remains private and the network policy does not need a diagnostic exception.

The private Tailscale Ingress is also restricted at the policy layer to the Tailscale proxy generated for exactly the `ops-mcp` Ingress; the entire operator namespace is not trusted as an MCP client.

## 4. Create an OpenAI Secure MCP Tunnel

Create a Secure MCP Tunnel in OpenAI Platform and record:

- the tunnel ID (`tunnel_...`)
- a restricted runtime API key for the tunnel client

Do not commit either value to Git and do not paste the API key into chat.

Create the Kubernetes Secret:

```bash
kubectl -n kubeclaw create secret generic kubeclaw-openai-tunnel \
  --from-literal=api_key='YOUR_OPENAI_RUNTIME_API_KEY' \
  --from-literal=tunnel_id='YOUR_TUNNEL_ID'
```

Deploy the outbound-only tunnel client:

```bash
kubectl apply -f my-values/infra/ops-mcp-tunnel.yaml
kubectl rollout status deployment/ops-mcp-tunnel -n kubeclaw --timeout=180s
kubectl logs -n kubeclaw deployment/ops-mcp-tunnel --tail=100
```

The tunnel client connects outbound to OpenAI and forwards requests to the cluster-local MCP URL. No public ingress for the MCP server is required by ChatGPT. The tunnel Pod deliberately has `automountServiceAccountToken: false`.

## 5. Attach the MCP server in ChatGPT

Custom MCP setup is performed in the supported ChatGPT web developer-mode surface.

1. Enable Developer mode.
2. Open Apps / connection settings.
3. Add a custom MCP connection using the Secure MCP Tunnel.
4. Select/configure the same tunnel.
5. Scan tools.
6. Create the connection.
7. Record the generated technical app ID (`plugin_asdk_app_...`).

The repository plugin intentionally does not invent a fake `.app.json`. Wire the real generated app ID only after registration.

Before Cilium, the expected core tools are:

```text
list_argocd_applications
namespace_overview
get_pod
get_events
get_pod_logs
```

After deploying the Cilium/Hubble PR and rebuilding the MCP image, expect additionally:

```text
get_hubble_flows
```

If the tool list changes after an MCP image update, rescan/refresh the custom MCP connection before troubleshooting the missing tool as a cluster fault.

## 6. First checks

Useful first prompts:

```text
Use KubeClaw Ops and summarize what is unhealthy in the cluster.
```

```text
Use KubeClaw Ops to show the current Argo CD application state.
```

```text
Use KubeClaw Ops to investigate why Prism is unhealthy. Start with Argo and Kubernetes events before reading logs.
```

After Hubble is available:

```text
Use KubeClaw Ops to investigate why Prism cannot reach PostgreSQL. Correlate Argo and Kubernetes state with dropped Hubble flows before reading application logs.
```

## 7. Hubble integration after Cilium

Do not attempt to validate Hubble through the MCP until the Cilium migration has completed and `hubble-relay` is healthy.

Verify locally first:

```bash
kubectl -n cilium get pods
kubectl -n cilium get svc hubble-relay
kubectl -n cilium rollout status deployment/hubble-relay
```

The Ops MCP connects to:

```text
hubble-relay.cilium.svc.cluster.local:4245
```

The Relay remains `ClusterIP`. Cilium policy permits the Relay client port only from the Ops MCP, Hubble UI and required host/node identities.

`get_hubble_flows` intentionally does not provide an unbounded cluster dump. It constrains:

- namespace
- optional pod
- optional verdict
- time window
- maximum 50 returned flows
- subprocess timeout
- 2 MiB raw-output buffer

Full endpoint label sets are discarded before the MCP response. The goal is small evidence queries for troubleshooting rather than copying the Hubble stream into ChatGPT or a second logging pipeline.

For the complete Cilium/Hubble verification checklist, use `docs/ops/cilium-networking.md`.

## 8. Recommended troubleshooting order

Use evidence in this order unless the symptom clearly points elsewhere:

1. Argo CD sync/health state.
2. Kubernetes desired vs. ready state.
3. Kubernetes events.
4. Pod details/readiness/restarts.
5. Hubble flows for connectivity or policy symptoms.
6. Bounded current/previous pod logs.

This ordering helps distinguish GitOps drift, scheduling/lifecycle faults, network-policy drops and application failures without reading unnecessary logs.

## Safety boundary

The Ops MCP is deliberately read-only.

Allowed:

- Argo CD Application health/sync state
- deployments/statefulsets/pods/jobs/services/ingresses
- Kubernetes events, fully paginated by the MCP
- pod readiness from Kubernetes `Ready` condition
- bounded pod logs, with the byte limit applied at the Kubernetes API and again locally
- after Cilium: bounded Hubble flow observations

Not allowed:

- Secrets or ConfigMaps
- pod exec
- restart/scale/delete/patch/update/create
- Argo sync or rollback
- direct deployment mutations

ServiceAccount tokens are read from the projected token file for each Kubernetes request so kubelet token rotation is respected.

Deployment changes remain GitOps changes through GitHub + Argo CD.
