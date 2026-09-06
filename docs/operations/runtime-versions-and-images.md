# Runtime versions and role images

## Ownership

`versions.json` is the authoritative source for Docker base references, Docker-installed tool versions, recorded binary checksums, Debian snapshots and the OpenClaw release. Edit this file, then run `npm run versions:sync`. Do not independently edit the generated version fields in Dockerfiles, chart metadata, official plugin specifications, observer build metadata, Kubernetes lint schema paths or the Trivy installer.

The central file is JSON so the build workflow and generator can read it with Node's standard library before installing any dependencies. A Markdown inventory would require a second parser and would not be an executable source of truth.

| Image | Responsibility |
| --- | --- |
| `kubeclaw-nova` | Nova orchestration and the existing Forge/Echo development and verification environment; retains linters, analyzers, browser and BuildKit client |
| `kubeclaw-prism-agent` | Prism OpenClaw gateway, native Prism plugin and request bridge; no Nova toolchain or locally installed browser |
| `kubeclaw-buster-gateway` | Buster OpenClaw gateway and agent integration |
| `kubeclaw-codex-ops`, `kubeclaw-ops-mcp` | Operations access images; retain their separate Node and CLI versions through central references |
| `kubeclaw-buster-runtime` | Buster deterministic suite execution and rootless BuildKit |
| `kubeclaw-prism-control`, `-studio`, `-worker`, `-ingestion` | Separate Prism application, rendering and ingestion services |

There is no `general` image build or fallback alias. Forge and Echo retain their current tools through the Nova image; this rename does not remove their capabilities. The small OpenClaw runtime dependency lock is shared by Buster's gateway and Prism's agent in `docker/openclaw-tools`. Nova's additional dependencies live in `docker/nova-tools`.

## Generated fields and native locks

`scripts/versions.mjs` computes all changes before writing. It derives the OpenClaw base reference and both official plugin versions from the same OpenClaw record. Every external Docker base must reference a managed argument with an immutable digest. Unknown arguments, unused central fields, invalid digests, conflicting OpenClaw overrides and unknown image overrides fail validation.

Generated defaults remain committed in native files. This permits ordinary `docker build -f docker/Dockerfile.prism-agent .` and standalone Helm packaging without a custom preprocessor at deployment time. The defaults are generated output, not independently maintained authorities. `npm run versions:check` fails on drift and never repairs it inside CI. Helm configuration uses the generated chart `appVersion` for OpenClaw metadata.

Application dependencies remain in their native manifests and lockfiles, including the two tool directories. They are not copied into the central file. Helm dependency locks, CI action references, cluster-service versions and persistent protocol/schema versions remain separate authorities; the runtime manifest does not yet manage those ecosystems. Python and Go tool top-level versions are centralized, but that alone does not lock every transitive dependency fetched by their installers.

The ops-pod keeps its existing kubectl/Helm versions in an explicit image override, including the Helm version used by its CI tests. Its Dockerfile and the MCP Dockerfile consume centrally managed, digest-pinned Node bases.

The default Debian snapshot applies to the OpenClaw images. Buster's worker retains its explicitly named snapshot override. Changing OpenClaw does not automatically advance an unrelated OS snapshot. Changing a downloaded binary requires updating its corresponding architecture checksums as well as its version. Several upstream tools still supply their checksum files at build time; those are not equivalent to a committed checksum pin.

## Upgrade procedure

1. Resolve the desired upstream release and obtain the actual registry manifest digest. For downloaded tools, obtain and verify the architecture-specific checksums. Do not invent a digest or retain an old digest under a new release label.
2. Edit `versions.json`. OpenClaw's official `acpx` and `discord` packages must exist at the selected release; they are baked and later installed offline.
3. Run `npm run versions:sync`, `npm run versions:check`, and `node --test tests/verification/deployment/versions.test.mjs`. Review the central change and every generated diff together.
4. Run the mandatory reliability workflow and role image acceptance. The latter builds actual Nova, Prism and Buster gateway images, disables networking during acceptance, exercises offline plugin installation, verifies the installed OpenClaw version and diagnostic SDK, checks role tools and runs the real Prism bridge health endpoint under the image's default non-root user. Missing binaries or failed installations fail the job.
5. Build and publish release images only after both workflows pass. Record the resulting immutable image digests and promote those artifacts for deployment. A version in this manifest identifies a build input; it is not a deployment receipt.

Image acceptance uses Docker's integrated image store so testing does not require a second BuildKit store and tar import. Both acceptance and production image builds use `scripts/prepare-image-build-runner.sh` to remove unused host SDKs and require 30 GiB free before building. The script refuses to run outside a disposable GitHub-hosted runner. Insufficient capacity fails before the expensive work. Nova's Go compilation/module caches are build cache mounts, and the observer compilation workspace is removed after copying its runtime artifacts; installed toolchains and offline plugin caches remain available.

The regression test changes a version in a temporary repository copy and verifies propagation, drift rejection without mutation, idempotent generation and invalid-input rejection. Its synthetic release is only a generator fixture. It is never built and does not count as provider or runtime compatibility evidence.

## Deployment and rollback

Nova values now select `kubeclaw-nova`. Prism values select `kubeclaw-prism-agent` for both the gateway and its bridge. Rebuild and publish these image names before applying the changed values. Existing Pods continue using their existing images until rollout. No compatibility image is published under the retired name.

The checked-in agent values still use the existing `latest` deployment convention. Pinning the upstream inputs does not make that output tag immutable. Operators must select the tested output digest for a controlled release; complete digest promotion for the agent chart remains separate deployment work. No deployment or live cluster acceptance is performed by the image test workflow.

Preserve the previous release's image and code-bundle digests for rollback. Keep active runs on the runtime and protocol version that created their snapshots, or use an explicit verified migration. An image rollback alone does not undo changes to persistent data formats. Prism's application services retain their independent images and release responsibilities.
