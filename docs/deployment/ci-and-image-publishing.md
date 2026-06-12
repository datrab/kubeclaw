# CI and Image Publishing

Status: current
Audience: developer, operator

## Purpose

Document the current GitHub Actions image workflow.

## Current Behavior

`.github/workflows/build-images.yaml` runs on:

- pushes to `main` that touch `docker/**` or `skills/**`
- daily schedule at `03:00 UTC`
- manual `workflow_dispatch`

The build job publishes a matrix:

- `docker/Dockerfile.general` -> `kubeclaw-general`
- `docker/Dockerfile.sandbox` -> `kubeclaw-sandbox`
- `docker/Dockerfile.prism-preview` -> `kubeclaw-prism-preview`

Images are pushed to GHCR under the repository owner with `latest`, SHA, and date tags. The workflow has `contents: read` and `packages: write`.

Open issue: the scheduled base-image check inspects `ghcr.io/openclaw/openclaw:2026.3.7`, but current Dockerfiles build from `ghcr.io/openclaw/openclaw:latest`.

## Build Inputs and Outputs

The workflow rebuilds when Dockerfiles or skills change on `main`. It does not run on documentation-only changes. Manual runs can force a rebuild with `workflow_dispatch.force_rebuild`, although the build job condition already runs all matrix builds for manual dispatch.

For each matrix entry, `docker/metadata-action` creates:

- `latest`
- a commit SHA tag
- a date tag in `YYYY.MM.DD` format

The deployment values currently reference `ghcr.io/datrab/kubeclaw-general:latest`, `ghcr.io/datrab/kubeclaw-sandbox:latest`, and `ghcr.io/datrab/kubeclaw-prism-preview:latest`. The workflow publishes under `ghcr.io/${{ github.repository_owner }}/...`, so keep the values owner aligned with the repository owner when moving or forking the project.

## Image Contract

| Image | Source | Runtime consumer | Important contents | Verification |
| --- | --- | --- | --- | --- |
| `kubeclaw-general` | `docker/Dockerfile.general` | Nova/Forge/Echo style agents through `my-values/nova-values.yaml` | OpenClaw base image, Nova skills, common skills, TypeScript/lint tooling, Python lint tools, Semgrep, hadolint, kubeconform, Helm, observer plugin | deployment truth checks the workflow still builds from `docker/Dockerfile.general`; Dockerfile install commands fail closed |
| `kubeclaw-sandbox` | `docker/Dockerfile.sandbox` | Buster through `my-values/buster-values.yaml` | Podman/buildah, Playwright/Chromium, Lighthouse, k6, nginx, sandbox helpers, Buster skills, common skills, observer plugin | deployment truth checks sandbox image, privileged runtime, Podman storage, resource bounds, and Buster container split |
| `kubeclaw-prism-preview` | `docker/Dockerfile.prism-preview` | Nova Prism preview sidecar in `my-values/nova-values.yaml` | `node:20-alpine`, `serve`, `/designs`, port `3456` | Helm render proves the sidecar mount and port; live preview behavior depends on files under workspace `prism/designs` |

## Failure Modes And Operator Checks

- Scheduled `check-base-image` watches `ghcr.io/openclaw/openclaw:2026.3.7`, but the Dockerfiles currently build from `ghcr.io/openclaw/openclaw:latest`. Treat this as a reproducibility risk until base image pinning is unified.
- If published image owner changes, update `my-values/nova-values.yaml`, `my-values/buster-values.yaml`, and the Prism sidecar image together.
- If a build succeeds but pods cannot pull images, use `./scripts/deploy.sh build-local-images [tag]` and `./scripts/deploy.sh verify-live [tag]` to prove `LOCAL_REGISTRY_PUSH` and `LOCAL_REGISTRY_PULL` separately.
- Deployment verification intentionally checks that install commands in Dockerfiles do not continue silently with `|| true` or suppressed install stderr.

Useful commands:

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
./scripts/deploy.sh build-local-images live-smoke
./scripts/deploy.sh verify-live live-smoke
```

## Publication And Runtime Contract

| Contract item | Owner | Reader should expect |
| --- | --- | --- |
| Workflow trigger and tags | `.github/workflows/build-images.yaml` | images tagged by branch/SHA style workflow rules plus whatever release tag the workflow emits; check workflow summary before assuming a tag exists |
| Runtime image selection | `my-values/nova-values.yaml`; `my-values/buster-values.yaml`; `charts/kubeclaw/templates/deployment.yaml` | Nova uses `ghcr.io/datrab/kubeclaw-general:latest`; Buster uses `ghcr.io/datrab/kubeclaw-sandbox:latest` unless values override them |
| Pull credentials | `my-values/setup-secrets.sh`; `imagePullSecrets` in values | `Secret/ghcr-secret` with `.dockerconfigjson` is required for production values |
| Live pull proof | `scripts/deploy.sh verify-live` | the script builds local images, pushes to `LOCAL_REGISTRY_PUSH`, renders image overrides, checks the cluster can pull `LOCAL_REGISTRY_PULL`, redeploys, and runs pod smoke checks |

If CI passes but `ImagePullBackOff` appears in the cluster, do not change the Dockerfile first. Check `ghcr-secret`, repository/tag values, registry mirror configuration, and whether `LOCAL_REGISTRY_PUSH` differs from `LOCAL_REGISTRY_PULL`.
