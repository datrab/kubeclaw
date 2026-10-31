# FamilyClaw Argo registration

`gitops/production/household-applications.yaml` maintains the separate FamilyClaw
AppProject and manual Application. The Application reads `datrab/Familyclaw`,
branch `main`, path `deploy/helm/family-stack` directly. The operator configures
that private repository's Argo access; no chart is copied into Kubeclaw.

`scripts/gitops-continuous.mjs` appends them to
the generated `apps/applications.yaml`; later runtime promotions therefore retain
this household definition rather than erasing an ad-hoc appended block.

The existing administrative root follows that generated file. Its next successful
reconciliation registers `argocd/familyclaw`; registration does not start the
household stack. Existing Kubeclaw runtime/project definitions are unchanged.
FamilyClaw is in the last wave, after existing runtime children, and uses observed
child health because its Helm source does not satisfy the runtime-only immutable
bundle/directory health contract. The child remains manual. Parent sync may wait
for its initial workload sync; do not interpret registration as household health.
The ignore-healthcheck annotation excludes this independent child from aggregate
parent health, not from wave waiting; see the pinned platform Argo
[health documentation](https://github.com/argoproj/argo-cd/blob/v3.5.2/docs/operator-manual/health.md).

Before first FamilyClaw workload sync, on the authorized controlnode:

```bash
git -C /root/Familyclaw fetch origin main
git -C /root/Familyclaw switch --track origin/main
cd /root/Familyclaw
bash tools/deployment/initialize-household.sh
```

If the local main branch already exists, switch to it and fast-forward only;
preserve local changes. The initializer asks once for the Paperless token without
echo and supplies private configuration/Secrets. Do not paste credentials into Git,
Helm values or chat. Then sync only `familyclaw` in Argo, without prune. No personal
model/channel login is required to initialize infrastructure. No public ingress or
model-provider egress is enabled by this registration; those remain onboarding.

To observe registration without credential values:

```bash
kubectl -n argocd get applications familyclaw -o wide
```

This document does not claim that the controller has observed the Git commit,
that images have been pulled by the node, or that a household rollout is healthy.
Those require live observations. The Argo Helm inputs are `values-household.yaml` and `values-production.yaml`,
including a Buster-built immutable Core image. The Core image has its own immutable source build
receipt; bootstrap-only fixes outside its Docker build inputs need not rebuild
that unchanged Core payload.

## Check boundary

The seven `gitops-continuous.test.mjs` tests pass, including real Helm generation
with the additional household and refusal of duplicates/automatic child sync.
The broader 18-case GitOps run has one existing failure in
`gitops-buster-scope.test.mjs:67` (deleting inherited source provenance does not
throw with the currently selected baseline). The same failure was reproduced
against unchanged commit `27af7e8439c1356f059bf97fec0edf10edd8b210`; it is not
introduced or repaired by this household registration. The other 17 cases pass.

## Private repository credentials

The auto-reconciled `familyclaw-repository` platform Application provisions an
Ed25519 deploy key inside `argocd/familyclaw-repository`. The private key never
leaves the Secret or appears in Git/logs. The one-shot nonroot Job may only get
and patch that exact precreated Secret; retries preserve the existing key.
Only its public key and fingerprint appear in the Job log, for registration as
a read-only deploy key on `datrab/Familyclaw`. No personal GitHub token is copied.

The household Application and AppProject use
`ssh://git@ssh.github.com:443/datrab/Familyclaw.git`; host verification uses Argo's
existing GitHub known-host entries. Generated Secret data is ignored during
subsequent reconciliation and protected from pruning/deletion. The workload
Application remains manual; repository access does not initialize private
household configuration or synchronize workloads.

Only this bootstrap Application prunes superseded Jobs/ConfigMaps, after the
replacement has completed (`PruneLast=true`). Its repository Secret is explicitly
excluded from pruning and deletion. No household data or workload is in scope.
