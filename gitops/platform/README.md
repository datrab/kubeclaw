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
migration, Redis, PostgreSQL, LiteLLM, both registries, Prometheus/Grafana,
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

## PostgreSQL adoption

`bootstrap/postgresql.yaml` adopts release `postgresql` in namespace `kubeclaw`
with manual sync, no prune and no deletion finalizer. The platform root registers
this Application automatically; inspect its diff before syncing the service.

The chart remains 18.5.15. Its appVersion label says 18.3.0, but the operator
verified `postgres --version` reports 18.1 in the running container. The selected
image digest is therefore the observed running digest, not the newer bootstrap
image. `versions.json` holds the separate `postgresqlProduction` selection;
version generation and Renovate update proposals target the adoption values.
Review database compatibility and backups before accepting future image changes,
particularly updates of the historical `latest` tag. Argo never auto-syncs this
Application.

The values retain standalone mode, the `litellm` database/user, existing Secret
`postgresql-secrets`, its password key names, a 1-GiB `data` claim template and
requests 50m/128Mi with limits 250m/256Mi. The resulting StatefulSet remains
`postgresql`, with Service `postgresql` and headless Service `postgresql-hl`.
The existing claim is `data-postgresql-0`. No password is generated or committed.

Pinning the image changes the Pod template from `:latest` to the same observed
digest and can restart the single database Pod. Review the StatefulSet diff,
then manually sync without Force, Replace or Prune. Verify the Application is
Synced/Healthy, the StatefulSet is Ready, the claim remains bound to its original
volume and LiteLLM still connects. Do not uninstall the old Helm release or use
Helm upgrade/rollback after Argo takes ownership; its history is historical.

### Selected 18.6 update (2026-09-16)

After recording the original 18.1 installation, the selected production chart is
18.11.3 and the image digest is
`sha256:b69d1fca390fb131639e86e820f248acfc5d911339dc884796f8009260c598d7`.
Docker registry image metadata identifies it as 18.6.0; live binary validation
remains required after sync. The registry chart was pulled and rendered; its
StatefulSet selector, serviceName, volumeClaimTemplates and podManagementPolicy
match the original 18.5.15 render. The new chart additionally supplies a Pod-level
RuntimeDefault seccomp profile and the image's FIPS provider configuration path.
The existing secret, 1-GiB claim, database name and resource requests/limits stay.

Run `KUBE_CONTEXT=... bash scripts/prepare-postgresql-production-upgrade.sh`
on the control node before syncing. It saves a private SQL cluster dump and
prints extension/index/replication metadata for the upgrade review. A completed
dump is not a tested restore. Keep the directory outside Git and do not paste its
SQL contents. After inspecting relevant release-note follow-ups, manually sync
PostgreSQL without Force/Replace/Prune and verify the binary version, StatefulSet,
PVC identity and LiteLLM connectivity.

PostgreSQL 18.x does not require pg_upgrade or dump/restore to apply 18.6, but
extension/index follow-up can be required when skipping from 18.1. Review the
[18.2 migration notes](https://www.postgresql.org/docs/18/release-18-2.html) and
[18.6 migration notes](https://www.postgresql.org/docs/release/18.6/).

Renovate discovers production chart and image pins from `versions.json`, and its
trusted updater writes the generated values/Application fields. The workflow
is scheduled daily at 04:15 UTC, with updates proposed for review; this service
has no automatic Argo sync. At inspection on 2026-09-16, both repository variable
`DEPENDENCY_APP_ID` and secret `DEPENDENCY_APP_PRIVATE_KEY` were absent and the
last workflow failed at `Require updater identity`. Configure the updater GitHub
App (installed on this repository with contents/pull-request write permissions),
then rerun `Dependency updates` and verify success before claiming monitoring is
operational. Never commit its private key.
# LiteLLM, SPIRE and SMB adoption

These four Applications use manual sync: `litellm`, `spire-crds`, `spire`,
and `csi-driver-smb`. The `platform` root registers their definitions only.
Identity and storage drivers have separate AppProjects. Cilium is not installed
by this handover.

The installed charts are preserved: SPIRE 0.30.0, SPIRE CRDs 0.6.0, SMB CSI
1.20.0. SPIRE's top-level chart reports appVersion 1.14.5, but its bundled
server/agent charts render 1.15.2; the live server and agent were confirmed as
1.15.2. Controller Manager remains 0.7.0, SPIFFE CSI 0.2.13 and its registrar
v2.15.0. `versions.json` owns the chart selections and LiteLLM image digest;
Renovate proposes changes through the existing dependency workflow. That
workflow requires its configured GitHub App credentials to be operational.

LiteLLM adopts only Deployment and Service, retaining NodePort 30050 and the
observed running image digest. The existing `litellm-config`, `litellm-secrets`
and `google-sa-key` remain externally managed. The repository's older LiteLLM
ConfigMap must not be applied as part of this handover. Pinning the image causes
one Recreate rollout; there is a brief proxy interruption.

SPIRE's existing `spire-data-spire-server-0` PVC remains 1Gi. Helm lifecycle hooks
are disabled for Argo rendering. This chart emits an `Ignore` webhook bootstrap
default even with hooks disabled. Argo therefore preserves the existing
webhook failure policies and controller-maintained CA bundles using scoped
ignoreDifferences plus RespectIgnoreDifferences. This is an **adoption-only**
configuration: it requires existing healthy webhooks with `Fail` policies and
is not a fresh-install recipe. Changes to those policies require a separate
review; Argo does not enforce them while this exception is present.

SPIRE uses server-side diff for API defaulting. The existing webhook list can
still retain its earlier order after server-side apply. If its only remaining
difference is the order of the two entries, run
`python3 scripts/align-spire-webhook-order.py --apply` on the controlnode with
KUBE_CONTEXT set, then hard-refresh SPIRE. This performs an atomic JSON Patch
move guarded by resourceVersion and both webhook names, preserving the entire
entry contents including CA bundles. No Pod restart or resource replacement is
needed. The script is idempotent; an unexpected webhook set fails closed. For the existing
StatefulSet, only `apiVersion` and `kind` inside volumeClaimTemplates are ignored;
PVC names, storage requests and storage classes remain part of the comparison.
After this Application-definition change, refresh `platform`, wait for its
sync, then hard-refresh `spire`. No forced StatefulSet replacement is needed.

On the controlnode, before syncing any of these services:

```bash
cd ~/kubeclaw
git pull --ff-only
export KUBE_CONTEXT="$(kubectl config current-context)"
python3 scripts/check-platform-adoption-live.py
```

If the check fails, stop and investigate its reported prerequisite. Otherwise
refresh `platform` in Argo, then sync `spire-crds` first. After it succeeds,
sync `spire`, `csi-driver-smb` and `litellm` individually; the latter two have no
ordering dependency on SPIRE. Leave Prune, Force and Replace disabled. Review
each diff before sync. Do not uninstall the old Helm releases: that would
delete resources now managed by Argo.

Verify all four Applications are Synced/Healthy, the existing SPIRE PVC is still
Bound, server/agent/CSI Pods are ready, and LiteLLM can serve a request using its
existing database and model configuration. The repository check
`node scripts/check-platform-services.mjs` renders real charts and verifies
resource ownership, project permissions, storage and external config references;
it does not substitute for these live checks.
