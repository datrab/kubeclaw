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

The deployment values currently reference `ghcr.io/forgestackai/kubeclaw-general:latest` and `ghcr.io/forgestackai/kubeclaw-sandbox:latest`, while the workflow publishes under `ghcr.io/${{ github.repository_owner }}/...`. Keep owner/repository assumptions aligned before public release or when forking.
