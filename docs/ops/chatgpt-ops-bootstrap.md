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

GitHub Actions publishes commit-tagged images and prints the full immutable digest
in the build summary. There is no `latest` deployment path. For an unmerged
candidate, run **Build Ops MCP Image → Run workflow** on its exact branch and
record the source commit plus returned digest. PR checks themselves do not publish.

```bash
export OPS_MCP_IMAGE='ghcr.io/datrab/kubeclaw-ops-mcp@sha256:REPLACE_WITH_REAL_BUILD_DIGEST'
```

The manifest intentionally contains `REQUIRES_DIGEST`; render it using the helper.
For Argo, commit the rendered manifest to the one directory owned by its Application.
Do not let bootstrap scripts and Argo compete over the same resources.

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
./scripts/deploy-ops-mcp.sh apply
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

Stop the temporary port-forward after the check. The service itself remains private and the namespace NetworkPolicy does not need a diagnostic exception.

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


## Ordered rollout and ownership

1. Correct/review both PRs. Deploy Argo from PR #1 (chart pinned to 10.8.0).
2. Register the private repository using a read-only deploy key through Argo;
   keep credentials out of Git. Create a platform AppProject with explicit source
   repositories and destinations; do not delegate its cluster-resource powers.
3. Define explicit Applications for reviewed resource directories. Do not point
   an Application at the whole `my-values/infra` directory: it mixes Helm values,
   Secrets templates and manifests with different owners. Start manual sync and
   no prune; inspect diffs before enabling automation per Application.
4. Deploy/test the #1 MCP and tunnel while Flannel still runs. Confirm actual
   Kubernetes and Argo tools, not just `/healthz`. MCP is read-only; Argo performs
   approved Git-driven changes, never the MCP.
5. Stage the #2 image and Cilium policies separately for the maintenance window.
   #2 Ops bootstrap needs Cilium CRDs and `ops-mcp-network-policies.yaml`; use #1
   until the CNI cutover. Hubble cannot work before Relay exists.
6. Complete the Cilium runbook and then test Hubble. Keep independent host access:
   Argo, the tunnel and MCP can be temporarily unavailable during a CNI change.

## Diagnostic content and continuation

This trusted platform MCP may send requested logs/flows to GPT without content
redaction or Secret scanners. Byte limits are per response, not per investigation.
Pod-log text is at most 64 KiB (JSON metadata is additional). `sinceTime` reads still
available logs from a chosen timestamp; omit `tailLines` for this mode. Otherwise
the default tail is 200 lines. Inspect the returned observation and continue using
supported filters; no `until` or lossless historical cursor is promised. Rotation,
pod deletion and previous-container retention can make data unavailable.

Argo Application lists are paged (default 50, maximum 200 per call). Follow
`nextContinueToken` while `partial` is true; one page is not the whole cluster.

## Existing Tailscale operator namespace

Pass the same `TAILSCALE_OPERATOR_NAMESPACE` used by your existing operator setup
to `deploy-ops-mcp.sh` (default `tailscale`). Both render and apply use it for the
proxy namespace selector while preserving all four exact parent-resource labels.
The Ops namespace itself remains `kubeclaw`. This creates no additional operator.
For GitOps, commit the rendered output so later syncs use the chosen namespace.

```bash
TAILSCALE_OPERATOR_NAMESPACE=private-access ./scripts/deploy-ops-mcp.sh render
```
