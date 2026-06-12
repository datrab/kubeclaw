# Networking

Status: current
Audience: operator, security reviewer

## Purpose

Document current service exposure and namespace NetworkPolicy state.

## Current Behavior

The agent chart default service type is `ClusterIP`. Production values keep agent gateways cluster-internal.

Nova Prism preview is temporarily exposed through a dedicated NodePort Service on `30456`.

LiteLLM is a raw NodePort service on `30050`.

Registry-local is a writable ClusterIP service on port `5001`. It is not exposed at the node boundary by default.

Registry mirror is a ClusterIP service on port `5000`.

When the Tailscale Kubernetes Operator is installed, final-preview Buster k8s leases expose the kept deployment through a Kubernetes `Ingress` using `ingressClassName: tailscale`. The operator owns the tailnet proxy workload and MagicDNS HTTPS endpoint; KubeClaw only creates the app namespace, Service, and final-preview Ingress.

`scripts/deploy.sh infra` applies `my-values/infra/network-policies.yaml` after the infrastructure services and Buster namespace fence. The manifest sets default-deny ingress and egress for namespace pods, then adds explicit allowances for required traffic.

Current standard Kubernetes NetworkPolicy allowances:

- all pods can reach kube-dns on TCP/UDP `53`
- agent pods can reach Redis, Qdrant, LiteLLM, registry-local, registry-mirror, and outbound TCP `22`, `80`, and `443`
- Clawdeck pods labeled `app.kubernetes.io/name: clawdeck` can reach Redis on TCP `6379`
- agent gateway, bridge, and Prism preview ports accept ingress on TCP `18789`, `18790`, and `3456`
- LiteLLM accepts TCP `4000`, reaches PostgreSQL on TCP `5432`, and keeps outbound TCP `80` and `443` for model/provider access
- registry-mirror accepts cluster-private and agent traffic on TCP `5000`, and keeps outbound TCP `80` and `443` for upstream registry pulls
- Redis, PostgreSQL, Qdrant, and registry-local do not receive general internet egress allowances

The policy is deliberately portable and does not attempt hostname restrictions. Future Cilium policy can narrow the broad web egress to explicit FQDNs such as GitHub, GHCR, Docker Hub, and model provider endpoints.

## Exposure Summary

Cluster-internal DNS names used by values:

- Redis: `redis-master.kubeclaw.svc.cluster.local:6379`
- Qdrant: `qdrant.kubeclaw.svc.cluster.local:6333`
- LiteLLM: `litellm.kubeclaw.svc.cluster.local:4000`
- Registry-local: `registry-local.kubeclaw.svc.cluster.local:5001`
- Registry mirror: `registry-mirror.kubeclaw.svc.cluster.local:5000`

Node boundary exposure in current production values:

- `agent-nova` Prism preview: `30456`
- LiteLLM: `30050`

Tailnet-only exposure:

- Final-preview k8s deployments: Tailscale L7 Ingress URL from ingress status

The gateway and bridge service ports exist on ClusterIP Services for both agents, so in-cluster clients can still use stable Kubernetes DNS without node exposure.

Clawdeck deployments that need Redis must run in the `kubeclaw` namespace with pod label `app.kubernetes.io/name: clawdeck`; otherwise the namespace default-deny policy blocks Redis traffic.

## Operator Notes

Treat the remaining NodePorts as temporary operator exposure until Cilium/gateway routing or Tailscale-only paths replace them. A private deployment should review whether LiteLLM and Prism preview still need node-level reachability, then change service values and rerun:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Open Issues

- LiteLLM and Prism preview still use temporary NodePorts.
- NetworkPolicy egress is intentionally broad for agents, LiteLLM, and registry-mirror until Cilium/FQDN policy is available.

## NetworkPolicy Proof And Limits

`my-values/infra/network-policies.yaml` is applied by `scripts/deploy.sh infra`. Deployment truth currently verifies the policy set and expected count, but it does not prove live CNI enforcement. A live cluster can still behave differently if the CNI ignores Kubernetes NetworkPolicy or if node-level firewall/routing rules differ.

| Check | Command | Expected signal |
| --- | --- | --- |
| Source policy count and shape | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` | NetworkPolicy validation passes with the expected baseline resources |
| Policies installed | `kubectl -n "$NAMESPACE" get networkpolicy` | default-deny and app-specific ingress/egress policies are present |
| Service exposure | `kubectl -n "$NAMESPACE" get svc -o wide` | gateway/bridge are ClusterIP; explicit extra ports show only where values request them |
| Tailscale ingress | `kubectl get ingressclass tailscale && kubectl -n "$NAMESPACE" get ingress` | final-preview Ingress uses Tailscale only after the operator is installed |

If Redis, Qdrant, PostgreSQL, or LiteLLM traffic fails after policies are applied, inspect pod labels first. The policies select labels such as `app.kubernetes.io/name` and `app.kubernetes.io/instance`; a label drift can look like a network outage.
