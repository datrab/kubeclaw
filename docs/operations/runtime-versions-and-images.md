# Runtime versions and role images

## Ownership

`versions.json` is the authoritative source for Docker base references, Docker-installed tool versions, recorded binary checksums, Debian snapshots and the OpenClaw release. Edit this file, then run `npm run versions:sync`. Do not independently edit the generated version fields in Dockerfiles, chart metadata, official plugin specifications, observer build metadata, Kubernetes lint schema paths or the Trivy installer.

The central file is JSON so the build workflow and generator can read it with Node's standard library before installing any dependencies. A Markdown inventory would require a second parser and would not be an executable source of truth.

| Image | Responsibility |
| --- | --- |
| `kubeclaw-nova` | Nova orchestration and the existing Forge/Echo development and verification environment; retains linters and static analyzers; browser execution and image building belong to Buster |
| `kubeclaw-prism-agent` | Prism OpenClaw gateway, native Prism plugin and request bridge; no Nova toolchain or locally installed browser |
| `kubeclaw-buster-gateway` | Buster OpenClaw gateway and agent integration |
| `kubeclaw-codex-ops`, `kubeclaw-ops-mcp` | Operations access images; retain their separate Node and CLI versions through central references |
| `kubeclaw-buster-runtime` | Buster deterministic suite execution and rootless BuildKit |
| `kubeclaw-prism-control`, `-studio`, `-worker`, `-ingestion` | Separate Prism application, rendering and ingestion services |

There is no `general` image build or fallback alias. Forge and Echo share Nova’s implementation and static-analysis environment. Nova no longer installs BuildKit, Playwright/Chromium, Lighthouse, k6 or browser-only npm dependencies. Buster’s real container-build provider and browser are exercised in image acceptance. The small OpenClaw runtime dependency lock is shared by Buster's gateway and Prism's agent in `docker/openclaw-tools`. Nova's additional dependencies live in `docker/nova-tools`.

## Generated fields and native locks

`scripts/versions.mjs` computes all changes before writing. It derives the OpenClaw base reference and both official plugin versions from the same OpenClaw record. Every external Docker base must reference a managed argument with an immutable digest. Unknown arguments, unused central fields, invalid digests, conflicting OpenClaw overrides and unknown image overrides fail validation.

Generated defaults remain committed in native files. This permits ordinary `docker build -f docker/Dockerfile.prism-agent .` and standalone Helm packaging without a custom preprocessor at deployment time. The defaults are generated output, not independently maintained authorities. `npm run versions:check` fails on drift and never repairs it inside CI. Helm configuration uses the generated chart `appVersion` for OpenClaw metadata.

Application dependencies remain in their native manifests and lockfiles, including the two tool directories. They are not copied into the central file. Envoy and automation container pins also live in the manifest. Helm dependency locks, CI action references and other cluster-service versions remain in their native files and are discovered by Renovate. Persistent protocol/schema versions are migration contracts, not automatically updated software dependencies. Python and Go tool top-level versions are centralized, but that alone does not lock every transitive dependency fetched by their installers.

The ops-pod keeps its existing kubectl/Helm versions in an explicit image override, including the Helm version used by its CI tests. Its Dockerfile and the MCP Dockerfile consume centrally managed, digest-pinned Node bases.

The default Debian snapshot applies to the OpenClaw images. Buster's worker retains its explicitly named snapshot override. Changing OpenClaw does not automatically advance an unrelated OS snapshot. Changing a downloaded binary requires updating its corresponding architecture checksums as well as its version. Nova and Ops binary downloads use committed architecture hashes; builds no longer fetch their checksum files alongside the binaries.

## Upgrade procedure

1. Resolve the desired upstream release and obtain the actual registry manifest digest. For downloaded tools, obtain and verify the architecture-specific checksums. Do not invent a digest or retain an old digest under a new release label.
2. Edit `versions.json`. OpenClaw's official `acpx` and `discord` packages must exist at the selected release; they are baked and later installed offline.
3. Run `npm run versions:sync`, `npm run versions:check`, and `node --test tests/verification/deployment/versions.test.mjs`. Review the central change and every generated diff together.
4. Run the mandatory reliability workflow and role image acceptance. The latter builds actual Nova, Prism and Buster gateway images, disables networking during acceptance, exercises offline plugin installation, verifies the installed OpenClaw version and diagnostic SDK, checks role tools and runs the real Prism bridge health endpoint under the image's default non-root user. Missing binaries or failed installations fail the job.
5. Build and publish release images only after both workflows pass. Record the resulting immutable image digests and promote those artifacts for deployment. A version in this manifest identifies a build input; it is not a deployment receipt.

Image acceptance uses the same isolated BuildKit driver as publication and loads the completed image for execution. Its capacity budget includes the builder store, export and Docker image store. Both acceptance and production image builds use `scripts/prepare-image-build-runner.sh` to remove unused host SDKs and require 30 GiB free before building. The script refuses to run outside a disposable GitHub-hosted runner. Insufficient capacity fails before the expensive work. Nova's Go compilation/module caches are build cache mounts, and the observer compilation workspace is removed after copying its runtime artifacts; installed toolchains and offline plugin caches remain available.

The regression test changes a version in a temporary repository copy and verifies propagation, drift rejection without mutation, idempotent generation and invalid-input rejection. Its synthetic release is only a generator fixture. It is never built and does not count as provider or runtime compatibility evidence.

## Deployment and rollback

Nova values now select `kubeclaw-nova`. Prism values select `kubeclaw-prism-agent` for both the gateway and its bridge. Rebuild and publish these image names before applying the changed values. Existing Pods continue using their existing images until rollout. No compatibility image is published under the retired name.

The canonical chart and role values include development image defaults. Actual runtime deployment commands (`agents`, `agent`, `image`, `code`, `prism`, and `all`) require the selected `releases/runtime-images.json` and byte-matched generated values; they do not deploy those mutable defaults. The production workflow publishes candidate tags, and promotion prepares the reviewed digest selection. No deployment or live cluster acceptance is performed by local rendering tests.

Preserve the previous release's image and code-bundle digests for rollback. Keep active runs on the runtime and protocol version that created their snapshots, or use an explicit verified migration. An image rollback alone does not undo changes to persistent data formats. Prism's application services retain their independent images and release responsibilities.

## Automated maintenance policy

`renovate.json` is the executable policy. A daily GitHub Actions run discovers updates. Routine PRs are created on Monday before 06:00 UTC after a seven-day minimum release age. Security-alert PRs bypass that window and settling period, but never bypass acceptance tests. Major updates require explicit dashboard approval. Neither Renovate nor release promotion automatically merges or deploys.

Node image upgrades stay on the currently supported 22/24 lines until a reviewed LTS migration. kubectl stays on each consumer’s existing minor (1.34 or 1.35) until the operator verifies the live API-server version and updates the constraint. Go controller/compiler major upgrades and Helm major upgrades require their own migration review. Debian snapshots and Kubernetes schema commits require coordinated manual updates; a newer date or commit is not enough to establish compatibility. Review unsupported release lines in the dependency dashboard; there is no automatic EOL proof yet.

Renovate discovers native npm/Go dependencies, GitHub Actions, Helm dependencies/values and custom central pins. It ignores centrally generated Envoy chart fields and our own runtime image tags, which are release outputs. OpenClaw numbered correction releases remain eligible, while alpha/beta tags are excluded. Lockfile changes and version changes trigger real role-image acceptance.

The administrative Renovate configuration permits one exact post-update command. The workflow mounts the updater and version generator read-only from the trusted main checkout. It does not execute updater code supplied by an update PR. The updater resolves the OpenClaw image and checks that both official npm plugins exist. For downloaded Go, kubectl, shfmt, Terraform, TFLint, Trivy, hadolint, Helm and kubeconform binaries, including the separate Ops kubectl/Helm versions, it updates both architecture checksums and verifies actual downloaded bytes before generating native files. Registry digest changes are checked against actual manifest bytes. Unknown checksums, unavailable upstream releases or failed generation stop the update; stale checksums are never retained to produce a green PR.

### Activate the updater

Create a GitHub App installed only on this repository. Grant repository Contents, Pull requests and Issues read/write; Workflows write for action/version workflow updates; Dependabot alerts read for vulnerability-driven PRs; Metadata read. Configure repository variable `DEPENDENCY_APP_ID` and secret `DEPENDENCY_APP_PRIVATE_KEY`. Enable GitHub dependency graph and Dependabot alerts for native dependency vulnerability discovery. The app is separate from an operator/cluster credential. App-authored PRs trigger normal CI; a plain workflow token would suppress many follow-up workflow events.

After this PR is merged, run Dependency updates manually once and inspect the dependency dashboard and a generated PR. Missing credentials fail explicitly. No credentials have been created by this change. Renovate security alerts do not consume Trivy reports automatically: container findings are tracked by the rescan workflow and need a corresponding base/tool update reviewed in Renovate or prepared manually.

### Acceptance and release selection

Update policy acceptance uses the actual pinned Renovate executable and its real extraction/replacement engine, verifies actual downloaded bytes for all six checksum-managed tools on both architectures, version propagation and receipt-validation regressions, and real Envoy TLS handshakes. Envoy must accept the expected signed URI identity and reject a missing certificate or wrong URI identity. This static-certificate test does not replace SPIRE issuance, SDS rotation, network policy or the existing live worker-trust acceptance.

Role acceptance builds Nova, Prism and Buster images. Buster’s image test runs the actual container-build provider against rootless BuildKit and a real local registry, verifies the pushed manifest digest and persistent replay, rejects a defective Dockerfile, and launches actual Chromium. Nested rootless namespaces run in an isolated privileged CI container with a named AppArmor profile permitting user namespaces; this does not prove the production Pod security context or cgroup delegation. Those remain operator-owned live checks.

Production builds run only after reliability, role and update-policy checks. Nova/Prism/Buster gateway artifacts are then pulled by their just-published digest and re-exercised directly before their build receipts are uploaded. Other runtime images receive the build and applicable source gates; this is not full deployed service acceptance.

Run **Promote image release** with a successful main-branch Build Runtime Images And Skill Bundles run ID. The workflow validates the source run, requires all ten runtime receipts from the same commit, and opens a PR containing `releases/runtime-images.json` plus generated `releases/values/*.yaml`. Promotion and PR acceptance require the current family chart and role-value files to match the preserved receipt source commit byte for byte, including the full file set. An unavailable source commit, symlink, or changed configuration fails before materialization; unrelated later documentation commits remain valid. Select a successful build made with the desired chart/values when configuration changed. The workflow fetches full Git history for this comparison. This binds deployment configuration to the tested source without asserting compatibility of untested newer schemas. The generated values preserve that source-matched role configuration and select every runtime image by digest, including bridge, runtime and architecture-viewer sidecars. Controller and gateway templates support digest references. Each selection records its source run ID and attempt. Successful builds preserve complete receipts as versioned GitHub Release assets, independent of expiring CI artifacts. PR acceptance checks that exact source attempt and requires the selected digests to match its preserved receipt; a manually substituted digest fails. Deleting source releases or workflow history removes required evidence and fails closed. Promotion scans the selected digests for high/critical findings before opening its PR. No image is rebuilt and no cluster is contacted. The operator reviews and merges the release-selection PR, then deploys the generated values. For ops, keep using `scripts/deploy-ops-pod.sh deploy` so live API-server CIDRs and namespaces are discovered; the script requires `releases/ops-images.json` and automatically consumes `releases/values/ops.yaml`. Optional `OPS_CODEX_IMAGE` and `OPS_MCP_IMAGE` must equal the selected images; `OPS_POD_VALUES` is an additional private overlay. The ops overlay contains image choices, not guessed cluster networking. Previous selections remain in Git for rollback; data migrations still require their own rollback plan. Choose the `ops` family with a successful Build Ops Images run to select both ops digests into `releases/ops-images.json` and generate `releases/values/ops.yaml`. Each family requires its complete same-commit receipt set; the two families can advance independently. The ops workflow tests the exact published Codex and MCP containers before uploading receipts. MCP image acceptance checks actual health, missing-token rejection and authenticated protocol initialization without calling Kubernetes.

Daily Release security rescan scans selected runtime and ops digests and pinned bases/Envoy/updater images against current advisory data. High/critical findings, including unfixed findings, fail. Reports are preserved and a single open repository issue tracks a failing rescan. A scanner error and a missing initial release selection also fail and require inspection; they are not classified as known vulnerabilities. The issue is updated on subsequent failures and closed manually after resolution. Before the first successful build for each family is promoted, the rescan explicitly reports the missing release selection. It never scans `latest` and claims that proves a selected release.

The initial dependency inventory still contains older pins. Enabling automation prepares reviewable upgrade candidates; it does not certify that every dependency is already current or vulnerability-free.


## Deployment selection and private overlays

After merging the selected family PR, keep the complete source Git history and
install the repository Node dependencies. Run
`node scripts/updates/materialize-release.mjs --family=runtime --check` (or
`--family=ops --check`). If generated values are absent, materialize them without
`--check` from that reviewed receipt, then inspect the output. Missing selections,
invalid source run identities, incomplete image sets, changed source configuration
and generated-value drift stop deployment. Select a successful build using the
intended configuration instead of bypassing the source check.

`deploy.sh` and `deploy-ops-pod.sh deploy` use those generated values automatically.
Final Helm values are rendered before deployment mutations. Each selected image
is bound to its workload and container slot: changing its repository/digest,
substituting another image in the same receipt, or removing/renaming a required
slot fails. Additional first-party images must match their receipt reference.
Tag environment overrides fail explicitly. `all` checks its runtime plans before
setup or infrastructure changes; `agent --with-code` checks the bundle plan before
its first image upgrade.

Private operational values remain separate from the source-bound canonical files:
`NOVA_VALUES_FILE`, `BUSTER_VALUES_FILE`, `PRISM_VALUES_FILE`,
`PRISM_AGENT_VALUES_FILE`, and `OPS_POD_VALUES` supply additional overlays.
Existing non-image environment overrides remain available. Image environment
values may repeat the selected digest/repository, but cannot choose another one.
Each values overlay is checked before later overrides can conceal an incompatible
image choice. Runtime slots remain required even when an overlay disables a
workload. This validates image selection, not arbitrary operational settings or
schema/data migrations introduced by private configuration.

`code`, `agent --with-code`, and Prism use the runtime receipt's source commit for
their published code bundle; a moving `main` or different explicit expected commit
cannot select a second runtime revision. Bundle URL and existing-Secret/auth-key
overrides remain supported, with the original runtime manifest/commit/contract
validation. A custom URL's availability alone is not proof of bundle contents.

For a local render of the actual deployment arguments, use
`./scripts/deploy.sh render nova`, `render buster`, `render nova code`,
`render buster code`, or `render prism`. Ops supports
`KUBE_CONTEXT=render-only OPS_DISCOVERY_VALUES=/absolute/discovered.json ./scripts/deploy-ops-pod.sh render`.
The explicit Ops render file supplies network policy discovery values; deployment
continues to discover actual API-server CIDRs and namespaces itself. Render output
may include private configuration, so handle it accordingly. These commands do
not create namespaces, credentials or releases.

The local checks validate the persisted selection and its configuration. The
existing promotion and PR acceptance authenticate the preserved successful build
receipt; local schema validation does not authenticate an invented receipt.
Actual Pod `imageID` comparison, startup and migration acceptance still require
a separately authorized live deployment. No such proof is claimed by these tests.

## Inspect the selected image's descriptor identity

After the normal release selection and materialization, inspect one named slot:

```sh
node scripts/updates/inspect-release-image.mjs runtime nova linux/amd64
```

The command consumes the existing selected-release validator and performs bounded,
read-only GHCR requests. It verifies raw document hashes and child descriptor
sizes, resolves exactly one platform manifest and checks the corresponding config.
Its JSON distinguishes the optional index digest, manifest digest and config digest.
It does not equate these identifiers, verify layers, inspect a Pod or report an
active code bundle. Multiple matching platforms and nested indexes fail explicitly.

For a private package, an optional fourth argument names a file containing an
already issued GHCR registry bearer token. It is not a GitHub PAT argument; token
contents are never printed. Without a token the reader attempts one anonymous
pull-token exchange scoped to the exact repository. Registry credentials are never
forwarded to the explicitly allowed signed blob CDN. Other redirects fail closed.
The deadline applies to the complete descriptor read sequence, including token
exchange; the default is 30 seconds and each document is capped at 4 MiB.

A successful descriptor inspection remains separate from proof that the fresh
Pod/container runs that image and has loaded the selected code bundle.

## Rebuild contract and remaining inputs

The supported contract is a reviewed software dependency set plus a tested
output image digest. It is not a promise of identical OCI bytes from a Git
commit alone. Build architecture, builder/provenance settings, browser archives
and explicitly refreshed security databases are additional inputs.

Nova and Buster Python tools now consume complete version/hash wheel locks in
`docker/python-tools`. Only binary wheels are accepted, so an unbound source
build backend cannot enter through a missing wheel. The same lock resolution is
checked for Debian12 Python3.11 on AMD64 and ARM64. Nova's Semgrep environment
remains separate; Buster has its own combined lock and selected Semgrep version.
Go analyzers use the committed `docker/go-tools/go.mod` and `go.sum`, read-only
module resolution, the selected local toolchain and `-trimpath`. Automatic Go
toolchain download is disabled. Ops apt and Prism browser OS packages now use
the selected Debian snapshot, including the final image stages.

`npm run versions:sync` generates direct requirements from `versions.json` and
refreshes dependency locks if their recorded inputs or outputs differ. It needs
`uv` and the exact selected Go toolchain in PATH for a refresh. The trusted
Renovate updater uses the same resolver; missing tools, mismatched toolchains,
unavailable wheels or differing ARM64 resolution stop the update. No repository
postinstall script is enabled. `npm run versions:check` validates the input/output
hash receipt without resolving or repairing dependencies. Review all generated
requirements, hashes and module changes together. A deliberate same-version
transitive refresh can remove `docker/runtime-tool-locks.json` before running
`npm run versions:sync`; the receipt is regenerated only after all resolution
and verification succeeds.

Local package reconstruction checks are available as:

```sh
RUNTIME_LOCK_PYTHON="$PYTHON_311" node --test tests/verification/deployment/runtime-tool-locks-native.mjs
RUNTIME_LOCK_GO="$SELECTED_GO" node --test tests/verification/deployment/go-tool-locks-native.mjs
node --test tests/verification/deployment/runtime-tool-locks.test.mjs tests/verification/deployment/versions.test.mjs
```

These tests compare two actual isolated Python installations and two actual Go
builds, and reject deliberately wrong hashes. They are not two complete image
builds. ARM64 wheel resolution/installation does not prove ARM64 execution.
Playwright's npm version fixes browser revisions, but independently verified
browser archive hashes remain unfinished. Trivy's deliberate database refresh
also remains a separate data input: its freshness gate and observed database
hashes do not make two different refreshes identical. IFR-21-001 stays open.

For complete image acceptance, preserve the architecture and builder settings,
selected browser/database bytes, complete package inventory/SBOM and output
manifests for two isolated builds. Compare software identities and classify
metadata/provenance and intentional data-refresh differences. Continue deploying
only the accepted output digest through the existing release-selection path.
