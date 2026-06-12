# Security Operations

Status: current
Audience: operator, security reviewer

## Purpose

Operate KubeClaw with the current security boundaries visible.

## Current Behavior

Checklist before production exposure:

- Replace placeholder or local secrets with production-managed Kubernetes Secrets.
- Keep persistent config edits in `/home/node/.openclaw-persisted` secret-free; token and webhook values should stay in Kubernetes Secrets and the pod-local runtime config.
- Restrict the remaining LiteLLM and Prism preview NodePorts until they move behind Cilium/gateway routing or a private Tailscale path.
- Keep registry-local cluster-internal unless a deliberate private image pull path is configured.
- Review Buster RBAC before enabling Kubernetes suites.
- Verify the Buster namespace fence is installed.
- Verify the repository NetworkPolicy baseline is applied before treating the namespace as isolated.
- Use private security reporting for Buster sandbox escape, privilege escalation, credential exposure, gateway bypass, and zero-day reports.

## Security Surfaces And Owners

| Surface | Code or config owner | When it runs | Security expectation | Failure signal |
| --- | --- | --- | --- | --- |
| Kubernetes Secrets | `charts/kubeclaw/templates/secret.yaml`; `my-values/setup-secrets.sh`; production values | before `./scripts/deploy.sh agents` and during pod env injection | provider tokens, gateway tokens, Redis password, Git key, Discord, Stitch, and Tailscale OAuth stay in Secrets | rollout failure, health probe failure, missing env, `kubectl get secret` absent |
| retained config PVC | `charts/kubeclaw/templates/deployment.yaml` init container | every pod start | persisted `/home/node/.openclaw-persisted` remains placeholder-only for runtime tokens and omits `discord_webhook_url` | deployment truth failure, literal token in persisted files |
| runtime config overlay | `deployment.yaml` `runtime-config` `emptyDir` | every pod start | secret-expanded `openclaw.json` and `swarm.config.json` exist only inside the pod | missing `/runtime-config/openclaw.json`, gateway auth/model failures |
| Buster sandbox privileges | `my-values/buster-values.yaml`; `charts/kubeclaw/templates/deployment.yaml` | Buster pod render/start | both Buster containers are privileged and share `/sandbox`, `/var/lib/containers`, runtime config, workspace, and skills | Podman failures, suite startup failures, verifier missing `privileged: true` |
| Buster namespace fence | `my-values/infra/buster-namespace-fence.yaml`; `scripts/deploy.sh infra` | shared infra install | direct namespace lifecycle by `agent-buster` is denied; controller owns brokered namespace create/delete | `kubectl get validatingadmissionpolicy buster-namespace-fence` missing |
| NetworkPolicy baseline | `my-values/infra/network-policies.yaml`; `scripts/deploy.sh infra` | after shared infra and namespace fence | default-deny ingress/egress plus explicit DNS, agent, Clawdeck, LiteLLM, registry, and temporary ingress allowances | deployment truth reports policy count/selector/port failure |
| NodePort exposure | `my-values/nova-values.yaml`; infra manifests | service render/apply | Nova gateway and Buster gateway stay ClusterIP; Prism preview `30456` and LiteLLM `30050` remain temporary exposure | unexpected NodePort in `kubectl get svc` or verifier |

## Required Checks

Source-backed verification:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
rg -n "kubectl apply -n \"\\$NAMESPACE\" -f \"\\$INFRA_DIR/network-policies.yaml\"" scripts/deploy.sh
rg -n "privileged: true|mountPath: /var/lib/containers|mountPath: /sandbox" charts/kubeclaw/templates/deployment.yaml my-values/buster-values.yaml
```

Cluster checks:

```bash
kubectl -n "$NAMESPACE" get secrets
kubectl auth can-i create secrets -n kubeclaw --as=system:serviceaccount:kubeclaw:agent-buster
kubectl auth can-i patch deployments -n kube-system --as=system:serviceaccount:kubeclaw:agent-buster
kubectl get validatingadmissionpolicy buster-namespace-fence
kubectl -n "$NAMESPACE" get networkpolicy
kubectl -n "$NAMESPACE" get svc
kubectl -n "$NAMESPACE" get deploy agent-buster -o yaml | rg "privileged|SYS_ADMIN|NET_ADMIN|MKNOD|/sandbox|/var/lib/containers"
kubectl -n "$NAMESPACE" exec deploy/agent-nova -c kubeclaw -- rg -n "discord_webhook_url|__LITELLM_API_KEY__|__DISCORD_TOKEN__" /home/node/.openclaw-persisted
```

Expected current exposure from repository values:

- Nova gateway and bridge are ClusterIP service ports.
- Buster gateway and bridge are ClusterIP service ports.
- Nova Prism preview uses temporary NodePort `30456`.
- LiteLLM uses temporary NodePort `30050`.
- registry-local remains ClusterIP and should not expose NodePort `30051`.

## Incident Evidence

For suspected credential exposure, collect evidence before recycling pods:

- `kubectl -n "$NAMESPACE" get secret` names only, not decoded values.
- `kubectl -n "$NAMESPACE" get deploy agent-nova agent-buster -o yaml` with env/valueFrom and mounts.
- `kubectl -n "$NAMESPACE" logs deployment/agent-nova -c kubeclaw --tail=200`.
- `kubectl -n "$NAMESPACE" logs deployment/agent-buster -c kubeclaw --tail=200`.
- `kubectl -n "$NAMESPACE" logs deployment/agent-buster -c buster-pipeline --tail=200`.
- `.swarm/logs/pipeline/latest.json` and the affected run artifact directory.

Do not paste decoded Secret values into issue trackers or Discord. If persisted config contains real tokens rather than placeholders, rotate the Secret first, redeploy agents, then verify the persisted source config normalization with the commands above.

## Open Questions

- The repo verifies Kubernetes NetworkPolicy presence and shape, but not live CNI enforcement in a real cluster.
- Cilium/FQDN policy, Prometheus/Loki/OpenTelemetry resources, and a private replacement for the remaining NodePorts are still future hardening work.
