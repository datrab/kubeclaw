# Automatic agent bundle and image deployment

After a code PR merges into `main`, the runtime workflow runs the required
checks and packages Nova, Buster and Prism agent bundles. Ordinary Nova/Buster
agent and plugin source changes reuse the selected environment images. Docker
files, tools, native launchers, image-installed dependency locks, and embedded
service code trigger image builds. The same input classifier controls PR image
acceptance, main publication and image/bundle compatibility. A manual runtime
workflow dispatch deliberately requests a complete image build.

`scripts/updates/runtime-inputs.mjs` owns the classification. Prism Control,
Studio, Worker and Ingestion still embed their service code in images; changes
there require image publication. Shared worker/runtime code and compiled
gateway extensions used by those images are also image inputs. The agent bundle
mechanism does not hot-replace these services. Chart/value changes produce a
new deployment without requiring a new image. Generated release files do not
trigger another bundle publication. Infra-only fields in `versions.json` are
excluded from the runtime image compatibility digest.

## Selection and integrity

- `releases/runtime-images.json` retains the original verified image-build
  receipt, source commit and immutable image digests.
- `releases/runtime-code.json` records the independently selected code commit,
  successful source run/attempt, and each role's URL, SHA256 and bundle contract.
- Bundles are stored under `code-bundles-RUN-ATTEMPT`, without overwrite uploads.
  The publisher verifies their GitHub asset digests against the code receipt.
- The Pod bootstrap checks the selected SHA256 before extracting the archive,
  then checks role, commit and contract. Private downloads use the existing
  `github-bundle-reader` Secret. Git contains only its reference.
- Reusing an image requires identical image inputs at the image commit and code
  commit. This includes tools and dependency changes; a matching string such as
  `v2` alone is not accepted as proof of compatibility.
- Generated values enable bundles for all three agents. Deployment validation
  rejects disabled bundles and changed images, bundle URLs, hashes or commits.

The `Publish production deployment` workflow accepts only a successful runtime
workflow from this repository's `main`. It verifies receipts, materializes values
and generates the existing Argo child applications, then pushes the deployment
selection to `main`. No second manual release-selection PR is needed. The owner
authorizes the rollout by merging the source PR. Argo watches Git and performs
the cluster update; GitHub Actions does not receive a cluster kubeconfig.

The publisher is serialized. It rejects a source if newer deployment inputs are
already on main, and refuses older selected commits/attempts. A concurrent Git
push causes a normal push rejection, never a force push or automatic rebase.
If main advanced only in unrelated files, rerun the publication workflow; if
deployment inputs changed, wait for their successful source workflow. A failed
build never publishes a production selection. Generated pushes use
`GITHUB_TOKEN`, so they do not recursively start a new Actions build.

## Initial adoption and prerequisites

Production naming is configured in `gitops/production/config.json`: the root
Application is `kubeclaw`, and the workload AppProject is `kubeclaw`. The three
independently syncable child Applications are `kubeclaw-buster`,
`kubeclaw-prism` and `kubeclaw-nova`. Prism groups its agent and service resources;
it does not collapse them into a single Kubernetes Deployment. The administrative
root uses a separate `kubeclaw-bootstrap` AppProject so workload permissions do
not include management of Argo Applications. Naming changes do not rename live
applications automatically; production runtime adoption has not yet occurred.

Initial adoption still requires selected image/bundle receipts, reviewed AX41
overlays and explicit migration of existing Helm ownership without deleting
persistent data. Creating empty Applications or bypassing these checks is not
a deployment. Deferred registry mTLS does not remove Buster's existing HTTPS
registry requirement for its full build/scan pipeline.

Automatic publication is gated by repository variable `GITOPS_ENABLED=true`.
Enable it only after the production overlays, existing Secrets, namespace
ownership and native-worker host prerequisites have been verified and the
runtime Argo root application has been bootstrapped. Platform/infra and Codex
Ops keep their separate manual sync policies. Empty production overlays do not
supply AX41's native binding or private registry settings automatically.

The Actions token needs permission to push generated selections to `main` under
the repository's rules. If branch protection denies that push, publication fails;
the workflow does not bypass protections. Configure an explicitly authorized
publisher identity if the repository requires one. Enabling the variable alone
does not install or adopt Argo applications.

An initial verified image selection is required; without one, a deployment input
change builds the complete image family. Bundle-only runs retain that receipt.
The detector also compares against the selected image source, so a failed or
superseded environment build cannot be silently skipped by the next code push.
`deploy.sh code nova` remains the manual Helm path and uses the selected bundle;
do not use it to mutate an Argo-owned deployment. Change Git instead. The runtime
rollback planner restores both selections and the prior rendered manifests,
including removal of the code receipt when returning to a legacy image-only
selection. Database and persistent application data are not rolled back.

Local selection/render tests do not establish that the live cluster has adopted
these applications. Record the first successful publication and Argo rollout
separately during the AX41 migration.

## Register all runtime Applications before starting workloads

`runtimeAutoSync: false` in `gitops/production/config.json` is the initial adoption
stage. The production generator creates all three child Applications in the same
wave, with no automatic workload sync. The parent can reconcile their definitions
even while their workloads are not healthy. This is temporary: after reviewing
the resource diffs and completing adoption, set `runtimeAutoSync: true` in Git
and regenerate the production Applications through the release workflow.

Once `gitops/production/selection.json`, `bootstrap.yaml` and
`apps/applications.yaml` have been prepared and committed, run on the Controlnode:

```sh
export KUBE_CONTEXT="$(kubectl config current-context)"
node scripts/install/register-runtime-argo.mjs check
node scripts/install/register-runtime-argo.mjs apply
```

The registration step validates the committed bundle and generated definitions,
rejects conflicting existing Application/Project owners, and performs an API
dry-run before applying only Applications and AppProjects. It does not apply
workloads, delete Helm releases, modify Secrets/PVCs, or verify host pools.
Use Argo diffs to review the first workload sync. Registration alone is not a
completed ownership migration, functioning auto-deployment or pipeline test.

CI checks previously selected values against their recorded source using
`materialize-release.mjs --check --check-selected-source`. This allows a new
chart candidate to build without pretending the previous release contains it.
The option is read-only; ordinary materialization and deployment retain strict
matching of the current configuration to the selected successful release.
