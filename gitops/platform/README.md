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

### Redis version updates

`versions.json` (`redisProduction`) selects the production chart version and immutable image digest, separately from the newer bootstrap defaults in `infrastructureCharts.redis` and `infrastructure.redis`. Renovate proposes updates in PRs and its trusted updater regenerates the Redis Application and image values. For manual changes, edit the central selection and run `node scripts/versions.mjs --write`. CI checks version drift and generated platform manifests. After merging, review the Redis diff and sync manually in Argo. Redis automatic sync remains disabled.

Platform child Applications use `kubeclaw.io/health-mode: observed`: the shared Application health customization reports their workload health independently of manual sync status, while comparison/sync failures remain degraded. Runtime Applications without this annotation retain the strict selected-revision health gate. Sync the `argocd` Application after changes to this customization.

### Registry mirror

`registry-mirror` is a manually synchronized Application in project `infra`. It selects only `my-values/infra/registry-mirror.yaml`; it does not apply the local-registry template. Adoption retains the existing `registry-mirror` Service and Deployment and the 5 GiB `registry-mirror-cache` PVC in `kubeclaw`. The first sync replaces the live floating `registry:2` reference with the centrally managed 2.8.3 digest and rolls the Pod. Review the diff before syncing. A healthy Pod verifies the service probes, not whether clients actually use the Docker Hub cache; client configuration remains separate.

### Existing local registry

`registry-local` is a separate manual Application selecting `gitops/platform/registry-local/resources.yaml`. It adopts the observed Deployment and NodePort Service (5001 to container 5000, NodePort 30051). The observed Pod has no persistent storage. Its `registry:2` image and Pod template are deliberately retained for adoption: replacing the Pod can lose stored images. Before syncing, check that the live diff contains no Pod-template changes and do not use Force/Replace. Image pinning, upgrades and PVC storage require a separate migration that preserves or republishes the existing images. The newer `my-values/infra/registry-local.yaml` template is not used by this Application.

### Monitoring adoption and upgrades

The `monitoring` project contains separate manual Applications: `prometheus` (including Grafana), `loki`, `alloy`, and transitional `promtail`. Only the platform Application automatically registers their definitions. Child syncs and pruning remain manual.

`versions.json` -> `monitoringCharts` selects the chart versions. Renovate discovers Prometheus, the OSS Loki community chart and Alloy there, and its trusted updater propagates changes to the Applications. Promtail is frozen at 6.17.1 for retirement, not updated as an active collector. Chart releases select their bundled component image versions. Run `node scripts/versions.mjs --write` after changing a selection. CI renders all four charts, checks the storage/Secret/port contracts and validates the rendered Alloy configuration with its selected image.

Initial selections: kube-prometheus-stack 91.4.0 (Operator v0.94.0), OSS Loki chart 18.13.1 (Loki 3.7.7), Alloy 1.12.1 (v1.19.2). Loki moved from the Grafana chart repository to the community repository for OSS; the Grafana repository now maintains its Loki chart for Enterprise Logs. Deployment mode is now called Monolithic. Existing Loki schema v13, filesystem storage, retention settings, StatefulSet `loki` and claim template `storage` are retained. Rendering was compared with the old chart 6.52.0 for immutable StatefulSet fields.

Grafana uses the verified existing `prometheus-grafana` Secret keys `admin-user` and `admin-password`; no password is stored or generated in Git. Its PVC `prometheus-grafana` stays at 5 GiB and NodePort remains 30030. Prometheus retains its CR name and 20 GiB storage with 15d retention. The old `kubeStateMetrics.resources`/`nodeExporter.resources` settings were ignored by the chart; their intended limits now use the correct subchart keys. The Prometheus application uses server-side apply, includes the new CRDs and allows the chart's admission webhooks and kube-system scrape resources.

#### First sync and collector cutover

1. Refresh `platform`, wait for the four Application definitions, and review their diffs. Preserve backups of the existing Grafana, Prometheus and Loki data before the major upgrades. Do not use Force/Replace or prune during adoption. The Grafana credential Secret remains externally managed and must not be removed via the old Helm release.
2. Sync `prometheus` and `loki` together, then verify both are Healthy. Existing data volumes are reused; Pods restart for upgrades. Confirm old logs remain queryable through Grafana before changing collectors.
3. The new Alloy app must render successfully before retiring Promtail. Check `kubectl -n monitoring get daemonset promtail -o yaml`: the installed chart normally mounts host `/run/promtail` containing `positions.yaml`. The Alloy manifest mounts that same directory read-only and imports legacy positions on its first start. It stores its new positions in node-local `/var/lib/kubeclaw-alloy` across Pod restarts. Verify no node has label `kubeclaw.io/log-collector=promtail-retired` (`kubectl get nodes -l kubeclaw.io/log-collector=promtail-retired` should return none).
4. Sync **promtail** first: its retirement nodeSelector schedules zero Pods. Wait for the old Promtail Pods to terminate and flush positions. Then sync **alloy** immediately. Do not bulk-sync these two together: simultaneous collectors can duplicate log ingestion. Logs remain in node log files during the short gap, subject to normal kubelet rotation. Validate Alloy readiness and fresh logs in Grafana using the existing `namespace`, `pod`, `container`, `app` and `job` labels. Readiness alone does not prove ingestion.
5. If Alloy cannot ingest, stop its DaemonSet before temporarily removing the retirement selector from Promtail; the Argo applications have no self-heal. Review positions before a later retry because Alloy only imports legacy positions when its own positions do not exist. After successful cutover, Promtail stays as a visible, disabled legacy Application until separately cleaned up. Do not prune/delete Alloy positions or the monitoring PVCs as part of that cleanup.

The collector configuration was converted from the installed Promtail 6.17.1 defaults plus the provided client values using Alloy v1.19.2 and validated with that binary. It retains CRI parsing, relabel rules and log paths. `HOSTNAME` is explicitly the Kubernetes node name to restrict discovery to the local node. Promtail EOL: https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/alloy/set-up/migrate/from-promtail/ . Loki upgrade notes: https://github.com/grafana-community/helm-charts/tree/main/charts/loki#upgrading .
