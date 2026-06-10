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
- Add NetworkPolicies outside this repo if deploying into a shared cluster.
- Use private security reporting for Buster sandbox escape, privilege escalation, credential exposure, gateway bypass, and zero-day reports.

Useful checks:

```bash
kubectl auth can-i create secrets -n kubeclaw --as=system:serviceaccount:kubeclaw:agent-buster
kubectl auth can-i patch deployments -n kube-system --as=system:serviceaccount:kubeclaw:agent-buster
kubectl get validatingadmissionpolicy buster-namespace-fence
kubectl get svc -n "$NAMESPACE"
```
