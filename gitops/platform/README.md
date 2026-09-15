# Platform handover

Each service gets its own Application. Future projects (HomeOS, websites, etc.)
get their own AppProjects and explicitly allowed namespaces and repositories.

The first handover is Argo CD itself: existing Helm release `argocd`, namespace
`argocd`, chart `argo-cd` 10.8.0. The Application uses the existing repository
values, the existing Lua health customization and only the Argo Tailscale ingress.
It does not render the other files in `my-values/infra`.

Generate/check registration manifests:

```bash
node scripts/argocd-self-management.mjs
node scripts/argocd-self-management.mjs --check
```

Register on the intended cluster:

```bash
kubectl --context "$KUBE_CONTEXT" apply -f gitops/platform/bootstrap/infra-project.yaml
kubectl --context "$KUBE_CONTEXT" apply -f gitops/platform/bootstrap/argocd.yaml
kubectl --context "$KUBE_CONTEXT" -n argocd get application argocd
```

Registration does not sync workloads. Review the Application's DIFF before the
first manual Sync. Keep PRUNE and FORCE disabled. Resolve render/permission errors
before syncing; review changes to Secrets, CRDs, selectors, Services and Pod specs.
The existing app-of-apps Lua check targets the generated runtime directory apps;
this multi-source infrastructure Application is not placed under that runtime root.

After a successful sync, Argo owns ongoing changes to these resources. Do not run
`deploy-argocd.sh`, Helm upgrade/rollback or Helm uninstall for this release after
handover. Helm history remains as historical evidence, not an active reconciler.
Do not remove release Secrets or live resources as an adoption step.

No deletion finalizer and no automatic sync/prune are enabled for this first step.
Keep the Application definition under Git review and apply reviewed definition
changes explicitly until a separate platform root is introduced.

Next independent applications: Ops (Codex + MCP), Tailscale, Cilium after network
migration, Redis, PostgreSQL, Qdrant, LiteLLM, both registries, Prometheus/Grafana,
Loki, Promtail, SPIRE, SPIRE CRDs and SMB CSI. Preserve each installed release's
name, version and non-secret values during handover. Operator-owned children stay
with their operator. Runtime Buster/Nova/Prism use the existing runtime GitOps
workflow and require a separate review of existing Helm ownership and readiness.

## Tailscale Operator

`bootstrap/tailscale-operator.yaml` adopts release `tailscale-operator` in namespace
`tailscale`, initially at installed chart version 1.98.4. After that handover was
confirmed Synced/Healthy, chart 1.102.3 was selected for a separate manual upgrade.
Its values were recorded from the live Helm release. Image pins in `my-values/infra` are not
used for this handover. The chart references existing Secret `operator-oauth` and
does not generate OAuth credentials. Proxy workloads and identity Secrets remain
operator-owned, not separate Argo resources.

```bash
kubectl --context "$KUBE_CONTEXT" apply -f gitops/platform/bootstrap/infra-project.yaml
kubectl --context "$KUBE_CONTEXT" apply -f gitops/platform/bootstrap/tailscale-operator.yaml
```

Review DIFF, then manually sync without Prune or Force. Server-side apply is enabled
to handle the chart's CRDs without the client-side annotation size limit. Verify
the Application is Synced/Healthy, deployment `operator` is available and existing
tailnet ingresses remain reachable. After handover, update this Application through
Git/Argo instead of the `deploy.sh tailscale` Helm path.

The 1.102.3 render adds the PeerRelay CRD and associated RBAC, extends the Tailnet
schema and grants the operator token creation for its own service account. OAuth
authentication remains selected. Both operator and proxy images use v1.102.3.
Existing single-pod ingress proxies may briefly interrupt connections during their
rollout. Keep the control-node terminal open; verify operator, proxy readiness and
actual tailnet URL access, not only Application health.

References: [release notes](https://tailscale.com/changelog#2026-08-19),
[version compatibility](https://tailscale.com/docs/kubernetes-operator/reference/compatibility).
