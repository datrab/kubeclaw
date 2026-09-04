# ChatGPT Ops bootstrap

This runbook bootstraps a private, read-only ChatGPT operations path for the KubeClaw cluster.

## Target flow

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
      +--> bounded pod logs
```

The MCP server has no Kubernetes write verbs, no Secret access and no pod exec capability.

## 1. Merge the bootstrap PR

After merge, GitHub Actions builds and publishes:

```text
ghcr.io/datrab/kubeclaw-ops-mcp:latest
```

For the bootstrap this uses `latest`. Once Argo manages this component, pin deployments to an immutable SHA/digest.

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

Basic cluster-local health check:

```bash
kubectl run ops-mcp-check \
  --rm -i --restart=Never \
  --image=curlimages/curl:8.17.0 \
  -- curl -fsS http://ops-mcp.kubeclaw.svc.cluster.local:8080/healthz
```

Expected response:

```json
{"ok":true,"service":"kubeclaw-ops-mcp"}
```

## 4. Create an OpenAI Secure MCP Tunnel

Create a Secure MCP Tunnel in OpenAI Platform and record:

- the tunnel ID (`tunnel_...`)
- a runtime API key for the tunnel client

Do not commit either value to Git.

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

The tunnel client connects outbound to OpenAI and forwards requests to the cluster-local MCP URL. No public ingress for the MCP server is required by ChatGPT.

## 5. Attach the MCP server in ChatGPT

Current Pro support for custom MCP is on ChatGPT web and is read/fetch only.

In ChatGPT web:

1. Enable Developer mode.
2. Open Plugins / app connections.
3. Add a new connection and choose the Secure MCP Tunnel.
4. Select the tunnel created above.
5. Scan the MCP tools and create the app connection.
6. Record the generated technical app ID (`plugin_asdk_app_...`).

The repository plugin intentionally does not contain a fake `.app.json`. Once the real app ID exists, wire that ID into the plugin manifest/app binding.

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

## Safety boundary

Version 0.1 is deliberately read-only.

Allowed:

- Argo CD Application health/sync state
- deployments/statefulsets/pods/jobs/services/ingresses
- Kubernetes events
- bounded pod logs

Not allowed:

- Secrets or ConfigMaps
- pod exec
- restart/scale/delete/patch
- Argo sync or rollback
- direct deployment mutations

Deployment changes remain GitOps changes through GitHub + Argo CD.
