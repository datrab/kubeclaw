# CI, Images, And Skill Bundles

Status: current
Audience: developer, operator

## Purpose

Document the current GitHub Actions workflow for runtime images and agent skill bundles.

## Current Behavior

`.github/workflows/build-images.yaml` runs on:

- pushes to `main` that touch `docker/**`, `skills/**`, or `scripts/buster-namespace-controller.mjs`
- daily schedule at `03:00 UTC`
- manual `workflow_dispatch`

The image build job publishes a matrix:

- `docker/Dockerfile.general` -> `kubeclaw-general`
- `docker/Dockerfile.sandbox` -> `kubeclaw-sandbox`
- `docker/Dockerfile.namespace-controller` -> `kubeclaw-namespace-controller`
- `docker/Dockerfile.prism-preview` -> `kubeclaw-prism-preview`

Images are pushed to GHCR under the repository owner with `latest`, SHA, and date tags. The workflow has `contents: read` and `packages: write` for images, plus `contents: write` for bundle release assets.

The same workflow also packages durable per-agent `/app/skills` bundles:

- Nova bundle = `skills/nova` overlaid by `skills/common`
- Buster bundle = `skills/buster` overlaid by `skills/common`
- release tag = `agent-code-bundles`
- asset names = `nova-<full_sha>.tgz`, `buster-<full_sha>.tgz`

Open issue: the scheduled base-image check inspects `ghcr.io/openclaw/openclaw:2026.3.7`, but current Dockerfiles build from `ghcr.io/openclaw/openclaw:latest`.

## Build Inputs and Outputs

The workflow rebuilds when Dockerfiles, skills, or the Buster namespace controller script change on `main`. It does not run on documentation-only changes. Manual runs can force a rebuild with `workflow_dispatch.force_rebuild`, although the build job condition already runs all matrix builds for manual dispatch.

For each image matrix entry, `docker/metadata-action` creates:

- `latest`
- a commit SHA tag
- a date tag in `YYYY.MM.DD` format

The deployment values currently reference `ghcr.io/datrab/kubeclaw-general:latest`, `ghcr.io/datrab/kubeclaw-sandbox:latest`, `ghcr.io/datrab/kubeclaw-namespace-controller:latest`, and `ghcr.io/datrab/kubeclaw-prism-preview:latest`. The workflow publishes under `ghcr.io/${{ github.repository_owner }}/...`, so keep the values owner aligned with the repository owner when moving or forking the project.

For bundles, the workflow publishes predictable GitHub release asset URLs:

- `https://github.com/<owner>/<repo>/releases/download/agent-code-bundles/nova-<full_sha>.tgz`
- `https://github.com/<owner>/<repo>/releases/download/agent-code-bundles/buster-<full_sha>.tgz`

Those assets contain the effective `/app/skills` tree, not a second runtime layout. Shared files from `skills/common` already overwrite the repo-local compatibility facades in the matching bundle paths, preserving the current pod behavior.

## Image Contract

| Image | Source | Runtime consumer | Important contents | Verification |
| --- | --- | --- | --- | --- |
| `kubeclaw-general` | `docker/Dockerfile.general` | Nova/Forge/Echo style agents through `my-values/nova-values.yaml` | OpenClaw base image, Nova skills, common skills, TypeScript/lint tooling, Python lint tools, Semgrep, hadolint, kubeconform, Helm, observer plugin, baked `@openclaw/acpx` and `@openclaw/discord` npm cache | deployment truth checks the workflow still builds from `docker/Dockerfile.general`; Dockerfile install commands fail closed |
| `kubeclaw-sandbox` | `docker/Dockerfile.sandbox` | Buster through `my-values/buster-values.yaml` | Podman/buildah, Playwright/Chromium, Lighthouse, k6, nginx, sandbox helpers, Buster skills, common skills, observer plugin, baked `@openclaw/acpx` and `@openclaw/discord` npm cache | deployment truth checks sandbox image, privileged runtime, Podman storage, resource bounds, and Buster container split |
| `kubeclaw-namespace-controller` | `docker/Dockerfile.namespace-controller` | Buster namespace controller through `busterNamespaceBroker.controller.image.*` | `node:22-bookworm-slim`, `scripts/buster-namespace-controller.mjs`, non-root `node` user | deployment truth checks the controller does not inherit the OpenClaw runtime image and live verification preflights its pull path |
| `kubeclaw-prism-preview` | `docker/Dockerfile.prism-preview` | Nova Prism preview sidecar in `my-values/nova-values.yaml` | `node:20-alpine`, `serve`, `/designs`, port `3456` | Helm render proves the sidecar mount and port; live preview behavior depends on files under workspace `prism/designs` |

## Skill Bundle Contract

| Bundle | Source | Runtime consumer | Important contents | Verification |
| --- | --- | --- | --- | --- |
| `nova-<sha>.tgz` | `scripts/package-agent-skill-bundle.sh`; `skills/nova`; `skills/common` | `./scripts/deploy.sh code nova` | `manifest.json` plus the final `/app/skills` tree for Nova with `skills/common` already overlaid | local bundle packaging smoke, deployment truth, live code deploy smoke |
| `buster-<sha>.tgz` | `scripts/package-agent-skill-bundle.sh`; `skills/buster`; `skills/common` | `./scripts/deploy.sh code buster` | `manifest.json` plus the final `/app/skills` tree for Buster with `skills/common` already overlaid | local bundle packaging smoke, deployment truth, live code deploy smoke |

## Failure Modes And Operator Checks

- Scheduled `check-base-image` watches `ghcr.io/openclaw/openclaw:2026.3.7`, but the Dockerfiles currently build from `ghcr.io/openclaw/openclaw:latest`. Treat this as a reproducibility risk until base image pinning is unified.
- If published image owner changes, update `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, the Buster namespace controller image, and the Prism sidecar image together.
- If bundle assets move to another repository or release tag, update `CODE_BUNDLE_GITHUB_REPOSITORY`, `CODE_BUNDLE_RELEASE_TAG`, or explicit `*_CODE_BUNDLE_ARCHIVE_URL` inputs in the operator environment.
- If a build succeeds but pods cannot pull images, use `./scripts/deploy.sh image [target]`, `./scripts/deploy.sh smoke`, and direct `kubectl describe pod` output to debug the cluster pull path. Local deploy no longer builds images.
- If a code deploy fails to download a bundle, inspect the release asset URL, repository privacy, and the optional bundle auth Secret mounted through `codeBundle.auth.*`.
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
| Runtime image selection | `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `charts/kubeclaw/templates/deployment.yaml`; `charts/kubeclaw/templates/buster-namespace-controller.yaml` | Nova uses `ghcr.io/datrab/kubeclaw-general:latest`; Buster uses `ghcr.io/datrab/kubeclaw-sandbox:latest`; the namespace controller uses `ghcr.io/datrab/kubeclaw-namespace-controller:latest` unless values override them |
| Pull credentials | `my-values/setup-secrets.sh`; `imagePullSecrets` in values | `Secret/ghcr-secret` with `.dockerconfigjson` is required for production values |
| Skill bundle publication | `.github/workflows/build-images.yaml`; `scripts/package-agent-skill-bundle.sh` | GitHub release assets under `agent-code-bundles` publish one Nova and one Buster `/app/skills` bundle per commit SHA |
| Code bundle selection | `scripts/deploy.sh`; `charts/kubeclaw/templates/deployment.yaml` | `code` deploy resolves the latest published `refs/heads/main` commit by default, derives `https://github.com/<repo>/releases/download/agent-code-bundles/<role>-<sha>.tgz`, and still allows explicit commit or archive URL overrides |
| Runtime refresh proof | `scripts/deploy.sh image`; `scripts/deploy.sh smoke` | image deploy restarts selected Deployments after Helm apply so mutable runtime tags are re-pulled, then smoke proves the live pod surface |

If CI passes but `ImagePullBackOff` appears in the cluster, do not change the Dockerfile first. Check `ghcr-secret`, repository/tag values, and registry mirror configuration.
