# CI, Images, And Skill Bundles

Status: current
Audience: developer, operator

## Purpose

Document the current GitHub Actions workflow for runtime images and agent skill bundles.

## Current Behavior

`.github/workflows/build-images.yaml` runs image publication on:

- pushes to `main` that touch durable image inputs such as `docker/**`,
  `plugins/openclaw-agent-observer/**`, or
  `cmd/buster-namespace-controller/**`
- manual `workflow_dispatch`

The daily `03:00 UTC` schedule is a drift check only. It compares the digest-pinned OpenClaw base shared by the general and Buster gateway Dockerfiles with `ghcr.io/openclaw/openclaw:latest`. A mismatch fails visibly and requires an intentional version, digest, and Debian snapshot update; scheduled jobs never rebuild a pinned image from mutable input.

The image build job publishes a matrix:

- `docker/Dockerfile.general` -> `kubeclaw-general`
- `docker/Dockerfile.buster-gateway` -> `kubeclaw-buster-gateway`
- `docker/Dockerfile.buster-pipeline` -> `kubeclaw-buster-pipeline`
- `docker/Dockerfile.namespace-controller` -> `kubeclaw-namespace-controller`
- `docker/Dockerfile.prism-preview` -> `kubeclaw-prism-preview`

Images are pushed to GHCR under the repository owner with `latest`, SHA, and date tags. The workflow has `contents: read` and `packages: write` for images, plus `contents: write` for bundle release assets.

The same workflow also packages durable per-agent `/app/skills` bundles on
every push and manual dispatch. Skill-only changes publish new bundles without
rebuilding runtime images:

- Nova bundle = `skills/nova` overlaid by `skills/common`
- Buster bundle = `skills/buster` overlaid by `skills/common`
- release tag = `agent-code-bundles`
- asset names = `nova-<full_sha>.tgz`, `buster-<full_sha>.tgz`

## Build Inputs and Outputs

The workflow rebuilds runtime images when Dockerfiles, baked plugin source, or
the Buster namespace controller Go source changes on `main`. It does not rebuild
images for `skills/**` changes; those are delivered through skill bundles. It
does not run on documentation-only changes. Manual dispatch runs all image
matrix builds and republishes both skill bundles.

For each image matrix entry, `docker/metadata-action` creates:

- `latest`
- a commit SHA tag
- a date tag in `YYYY.MM.DD` format

The deployment values currently reference `ghcr.io/datrab/kubeclaw-general:latest`, `ghcr.io/datrab/kubeclaw-buster-gateway:latest`, `ghcr.io/datrab/kubeclaw-buster-pipeline:latest`, `ghcr.io/datrab/kubeclaw-namespace-controller:latest`, and `ghcr.io/datrab/kubeclaw-prism-preview:latest`. The workflow publishes under `ghcr.io/${{ github.repository_owner }}/...`, so keep the values owner aligned with the repository owner when moving or forking the project.

For bundles, the workflow publishes predictable GitHub release asset URLs:

- `https://github.com/<owner>/<repo>/releases/download/agent-code-bundles/nova-<full_sha>.tgz`
- `https://github.com/<owner>/<repo>/releases/download/agent-code-bundles/buster-<full_sha>.tgz`

Those assets contain the effective `/app/skills` tree, not a second runtime layout. Shared files from `skills/common` already overwrite the repo-local compatibility facades in the matching bundle paths, preserving the current pod behavior.

## Image Contract

| Image | Source | Runtime consumer | Important contents | Verification |
| --- | --- | --- | --- | --- |
| `kubeclaw-general` | `docker/Dockerfile.general` | Nova/Forge/Echo style agents through `my-values/nova-values.yaml` | Digest-pinned OpenClaw base, Debian snapshot, locked JavaScript tools, exact Python tools, checksum-verified multi-architecture binaries, observer plugin, baked pinned `@openclaw/acpx` and `@openclaw/discord` cache | deployment truth checks the pinned/locked inputs, architecture-aware verified downloads, workflow drift check, fail-closed installs, and exclusion of agent skills |
| `kubeclaw-buster-gateway` | `docker/Dockerfile.buster-gateway` | Buster OpenClaw gateway and native/ACP sessions through `my-values/buster-values.yaml` | OpenClaw, observer, ACPX/Discord cache, Redis transport, minimal inspection utilities; no deterministic suite/build/Kubernetes tools | deployment truth checks the dedicated render, required plugins, and absence of pipeline-owned tools from the final runtime stage |
| `kubeclaw-buster-pipeline` | `docker/Dockerfile.buster-pipeline` | Buster pipeline sidecar through `my-values/buster-values.yaml` | Node, kubectl, rootless BuildKit/buildctl, browser and deterministic suite tooling | deployment truth checks the dedicated image, non-privileged split runtime, BuildKit state, probes, and that agent skills are supplied by the code bundle |
| `kubeclaw-namespace-controller` | `docker/Dockerfile.namespace-controller` | Buster namespace controller through `busterNamespaceBroker.controller.image.*` | Go build stage, distroless non-root runtime, `/app/buster-namespace-controller` | deployment truth checks the controller does not inherit the OpenClaw runtime image and live verification preflights its pull path |
| `kubeclaw-prism-preview` | `docker/Dockerfile.prism-preview` | Nova Prism preview sidecar in `my-values/nova-values.yaml` | `node:20-alpine`, `serve`, `/designs`, port `3456` | Helm render proves the sidecar mount and port; live preview behavior depends on files under workspace `prism/designs` |

## Skill Bundle Contract

| Bundle | Source | Runtime consumer | Important contents | Verification |
| --- | --- | --- | --- | --- |
| `nova-<sha>.tgz` | `scripts/package-agent-skill-bundle.sh`; `skills/nova`; `skills/common` | `./scripts/deploy.sh code nova` | `manifest.json` plus the final `/app/skills` tree for Nova with `skills/common` already overlaid | local bundle packaging smoke, deployment truth, live code deploy smoke |
| `buster-<sha>.tgz` | `scripts/package-agent-skill-bundle.sh`; `skills/buster`; `skills/common` | `./scripts/deploy.sh code buster` | `manifest.json` plus the final `/app/skills` tree for Buster with `skills/common` already overlaid | local bundle packaging smoke, deployment truth, live code deploy smoke |

## Failure Modes And Operator Checks

- If the scheduled OpenClaw base check fails, update the shared version and digest in both OpenClaw-derived Dockerfiles and move the Debian snapshot intentionally; do not bypass the digest comparison.
- If published image owner changes, update `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, the Buster namespace controller image, and the Prism sidecar image together.
- If bundle assets move to another repository or release tag, update `CODE_BUNDLE_GITHUB_REPOSITORY`, `CODE_BUNDLE_RELEASE_TAG`, or explicit `*_CODE_BUNDLE_ARCHIVE_URL` inputs in the operator environment.
- If a build succeeds but pods cannot pull images, use `./scripts/deploy.sh image [target]`, `./scripts/deploy.sh smoke`, and direct `kubectl describe pod` output to debug the cluster pull path. Local deploy no longer builds images.
- If a code deploy fails to download a bundle, inspect the release asset URL, repository privacy, and the optional bundle auth Secret mounted through `codeBundle.auth.*`.
- If `/app/skills` contains stale code, deploy the code bundle with
  `./scripts/deploy.sh code [target]` or `./scripts/deploy.sh agent <name>
  --with-code`; do not rebuild runtime images for skill changes.
- Deployment verification intentionally checks that install commands in Dockerfiles do not continue silently with `|| true` or suppressed install stderr.

Useful commands:

```bash
./scripts/package-agent-skill-bundle.sh nova /tmp/nova-bundle.tgz "$(git rev-parse HEAD)"
./scripts/package-agent-skill-bundle.sh buster /tmp/buster-bundle.tgz "$(git rev-parse HEAD)"
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
./scripts/deploy.sh image both
./scripts/deploy.sh smoke
```

## Publication And Runtime Contract

| Contract item | Owner | Reader should expect |
| --- | --- | --- |
| Workflow trigger and tags | `.github/workflows/build-images.yaml` | images tagged by branch/SHA style workflow rules plus whatever release tag the workflow emits; check workflow summary before assuming a tag exists |
| Runtime image selection | `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/buster-namespace-controller.yaml` | Nova uses `ghcr.io/datrab/kubeclaw-general:latest`; Buster uses the dedicated `kubeclaw-buster-gateway` and `kubeclaw-buster-pipeline` images; the namespace controller uses `ghcr.io/datrab/kubeclaw-namespace-controller:latest` unless values override them |
| Pull credentials | `my-values/setup-secrets.sh`; `imagePullSecrets` in values | `Secret/ghcr-secret` with `.dockerconfigjson` is required for production values |
| Skill bundle publication | `.github/workflows/build-images.yaml`; `scripts/package-agent-skill-bundle.sh` | GitHub release assets under `agent-code-bundles` publish one Nova and one Buster `/app/skills` bundle per commit SHA |
| Code bundle selection | `scripts/deploy.sh`; `charts/kubeclaw/templates/deployment.yaml` | `code` deploy resolves the latest published `refs/heads/main` commit by default, derives `https://github.com/<repo>/releases/download/agent-code-bundles/<role>-<sha>.tgz`, and still allows explicit commit or archive URL overrides |
| Runtime refresh proof | `scripts/deploy.sh image`; `scripts/deploy.sh smoke` | image deploy restarts selected Deployments after Helm apply so mutable runtime tags are re-pulled, then smoke proves the live pod surface |

If CI passes but `ImagePullBackOff` appears in the cluster, do not change the Dockerfile first. Check `ghcr-secret`, repository/tag values, and registry mirror configuration.
