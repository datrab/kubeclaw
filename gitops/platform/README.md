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

Child registration does not sync workloads. Review the Application's DIFF before the
first manual Sync. Keep PRUNE and FORCE disabled. Resolve render/permission errors
before syncing; review changes to Secrets, CRDs, selectors, Services and Pod specs.
The existing app-of-apps Lua check targets the generated runtime directory apps;
this multi-source infrastructure Application is not placed under that runtime root.

After a successful sync, Argo owns ongoing changes to these resources. Do not run
`deploy-argocd.sh`, Helm upgrade/rollback or Helm uninstall for this release after
handover. Helm history remains as historical evidence, not an active reconciler.
Do not remove release Secrets or live resources as an adoption step.

No deletion finalizer and no automatic sync/prune are enabled for this first step.
The root `platform.yaml` can now be created once using Argo's NEW APP / EDIT AS YAML
screen. It watches only `gitops/platform/bootstrap` on main and automatically syncs
the project and child Application definitions, with prune disabled. It lives outside
that directory so it does not manage itself. The existing `infra` project permits
its Git source and destination. Subsequent child definition changes flow through Git;
the individual service syncs remain manual. UI edits to child definitions will be
reverted by the root's self-heal.

`platform` health describes definition delivery, not service availability. Its child
Applications explicitly use `argocd.argoproj.io/ignore-healthcheck: "true"` for parent
aggregation only. Check service health in each Application. This avoids blocking the
root on a pending manual service sync or the runtime-only Lua health customization.

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

## Codex Ops + MCP

`bootstrap/codex-ops.yaml` adopts Helm release `codex-ops` in `kubeclaw-ops`.
Chart revision and both image digests are generated from the selected verified
`releases/ops-images.json` receipt. Non-secret cluster settings are recorded in
`values/codex-ops.yaml` and embedded into the generated Application, because the
chart is pinned to the image source commit rather than moving with main.
When intentionally selecting a new Ops release or editing these cluster settings,
regenerate and review the Application with `node scripts/argocd-self-management.mjs`.

The platform root installs the definition automatically. Review the child DIFF and
manually sync without Prune or Force. The existing home/workspace PVCs, bearer,
registry credentials and persistent Codex/GitHub logins must be retained. This
chart renders no Secrets. No network migration is included (`cilium: false`).
Verify child health and `scripts/deploy-ops-pod.sh verify` after adoption. The helper's
login, pair, shell, status and verify commands remain useful; stop using its Helm
deploy action after adoption. Future Cilium migration must update the Ops network
policy values in Git as well.

## Redis

Application `redis` belongs to project `data-services`. It uses OCI Helm chart
`registry-1.docker.io/bitnamicharts/redis` 25.3.9 and the live release's standalone,
authentication, resource and 2Gi persistence values in `values/redis.yaml`.
The observed running Redis digest replaces the mutable `latest` reference.
This Pod template image change can restart the single Redis Pod at the first sync,
even though the image contents are the same; plan for a brief Redis interruption.

Release name `redis`, StatefulSet `redis-master` and claim template `redis-data`
retain PVC `redis-data-redis-master-0`. The existing Secret `redis-secrets` with
key `redis-password` stays external. Do not use the larger/newer bootstrap values
in `my-values/infra/redis-values.yaml` for this adoption. No automatic sync or prune
is enabled. Review the live diff before manually syncing, without Force or Prune.
After adoption, manage Redis through Git/Argo rather than `deploy.sh infra`.
