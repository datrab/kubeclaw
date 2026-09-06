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

The default Debian snapshot applies to the OpenClaw images. Buster's worker retains its explicitly named snapshot override. Changing OpenClaw does not automatically advance an unrelated OS snapshot. Changing a downloaded binary requires updating its corresponding architecture checksums as well as its version. Several upstream tools still supply their checksum files at build time; those are not equivalent to a committed checksum pin.

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

The checked-in agent values still use the existing `latest` deployment convention. Pinning the upstream inputs does not make that output tag immutable. Operators must select the tested output digest for a controlled release; the Promote image release workflow now prepares the reviewed digest selection. No deployment or live cluster acceptance is performed by the image test workflow. The production workflow now publishes candidate tags only; the promotion workflow prepares digest-selected release values.

Preserve the previous release's image and code-bundle digests for rollback. Keep active runs on the runtime and protocol version that created their snapshots, or use an explicit verified migration. An image rollback alone does not undo changes to persistent data formats. Prism's application services retain their independent images and release responsibilities.

## Automated maintenance policy

`renovate.json` is the executable policy. A daily GitHub Actions run discovers updates. Routine PRs are created on Monday before 06:00 UTC after a seven-day minimum release age. Security-alert PRs bypass that window and settling period, but never bypass acceptance tests. Major updates require explicit dashboard approval. Neither Renovate nor release promotion automatically merges or deploys.

Node image upgrades stay on the currently supported 22/24 lines until a reviewed LTS migration. kubectl stays on each consumer’s existing minor (1.34 or 1.35) until the operator verifies the live API-server version and updates the constraint. Go controller/compiler major upgrades and Helm major upgrades require their own migration review. Debian snapshots and Kubernetes schema commits require coordinated manual updates; a newer date or commit is not enough to establish compatibility. Review unsupported release lines in the dependency dashboard; there is no automatic EOL proof yet.

Renovate discovers native npm/Go dependencies, GitHub Actions, Helm dependencies/values and custom central pins. It ignores centrally generated Envoy chart fields and our own runtime image tags, which are release outputs. OpenClaw numbered correction releases remain eligible, while alpha/beta tags are excluded. Lockfile changes and version changes trigger real role-image acceptance.

The administrative Renovate configuration permits one exact post-update command. The workflow mounts the updater and version generator read-only from the trusted main checkout. It does not execute updater code supplied by an update PR. The updater resolves the OpenClaw image and checks that both official npm plugins exist. For downloaded Go, kubectl, shfmt, Terraform, TFLint and Trivy binaries it updates both architecture checksums and verifies actual downloaded bytes before generating native files. Registry digest changes are checked against actual manifest bytes. Unknown checksums, unavailable upstream releases or failed generation stop the update; stale checksums are never retained to produce a green PR.

### Activate the updater

Create a GitHub App installed only on this repository. Grant repository Contents, Pull requests and Issues read/write; Workflows write for action/version workflow updates; Dependabot alerts read for vulnerability-driven PRs; Metadata read. Configure repository variable `DEPENDENCY_APP_ID` and secret `DEPENDENCY_APP_PRIVATE_KEY`. Enable GitHub dependency graph and Dependabot alerts for native dependency vulnerability discovery. The app is separate from an operator/cluster credential. App-authored PRs trigger normal CI; a plain workflow token would suppress many follow-up workflow events.

After this PR is merged, run Dependency updates manually once and inspect the dependency dashboard and a generated PR. Missing credentials fail explicitly. No credentials have been created by this change. Renovate security alerts do not consume Trivy reports automatically: container findings are tracked by the rescan workflow and need a corresponding base/tool update reviewed in Renovate or prepared manually.

### Acceptance and release selection

Update policy acceptance uses the actual pinned Renovate executable and its real extraction/replacement engine, verifies actual downloaded bytes for all six checksum-managed tools on both architectures, version propagation and receipt-validation regressions, and real Envoy TLS handshakes. Envoy must accept the expected signed URI identity and reject a missing certificate or wrong URI identity. This static-certificate test does not replace SPIRE issuance, SDS rotation, network policy or the existing live worker-trust acceptance.

Role acceptance builds Nova, Prism and Buster images. Buster’s image test runs the actual container-build provider against rootless BuildKit and a real local registry, verifies the pushed manifest digest and persistent replay, rejects a defective Dockerfile, and launches actual Chromium. Nested rootless namespaces run in an isolated privileged CI container; this does not prove the production Pod security context or cgroup delegation. Those remain operator-owned live checks.

Production builds run only after reliability, role and update-policy checks. Nova/Prism/Buster gateway artifacts are then pulled by their just-published digest and re-exercised directly before their build receipts are uploaded. Other runtime images receive the build and applicable source gates; this is not full deployed service acceptance.

Run **Promote image release** with a successful main-branch Build Runtime Images And Skill Bundles run ID. The workflow validates the source run, requires all ten runtime receipts from the same commit, and opens a PR containing `releases/runtime-images.json` plus generated `releases/values/*.yaml`. The generated values preserve current role configuration and select every runtime image by digest, including bridge, runtime and architecture-viewer sidecars. Controller and gateway templates support digest references. Each selection records its source run ID and attempt. Successful builds preserve complete receipts as versioned GitHub Release assets, independent of expiring CI artifacts. PR acceptance checks that exact source attempt and requires the selected digests to match its preserved receipt; a manually substituted digest fails. Deleting source releases or workflow history removes required evidence and fails closed. Promotion scans the selected digests for high/critical findings before opening its PR. No image is rebuilt and no cluster is contacted. The operator reviews and merges the release-selection PR, then deploys the generated values. For ops, keep using `scripts/deploy-ops-pod.sh deploy` so live API-server CIDRs and namespaces are discovered; set `OPS_CODEX_IMAGE` and `OPS_MCP_IMAGE` from the selected ops manifest and optionally `OPS_POD_VALUES=releases/values/ops.yaml`. The ops overlay contains image choices, not guessed cluster networking. Previous selections remain in Git for rollback; data migrations still require their own rollback plan. Choose the `ops` family with a successful Build Ops Images run to select both ops digests into `releases/ops-images.json` and generate `releases/values/ops.yaml`. Each family requires its complete same-commit receipt set; the two families can advance independently. The ops workflow tests the exact published Codex and MCP containers before uploading receipts. MCP image acceptance checks actual health, missing-token rejection and authenticated protocol initialization without calling Kubernetes.

Daily Release security rescan scans selected runtime and ops digests and pinned bases/Envoy/updater images against current advisory data. High/critical findings, including unfixed findings, fail. Reports are preserved and a single open repository issue tracks a failing rescan. A scanner error and a missing initial release selection also fail and require inspection; they are not classified as known vulnerabilities. The issue is updated on subsequent failures and closed manually after resolution. Before the first successful build for each family is promoted, the rescan explicitly reports the missing release selection. It never scans `latest` and claims that proves a selected release.

The initial dependency inventory still contains older pins. Enabling automation prepares reviewable upgrade candidates; it does not certify that every dependency is already current or vulnerability-free.
