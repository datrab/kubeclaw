# Docker Images

Status: current
Audience: operator, developer

## Purpose

Document what the runtime images contain.

## Current Behavior

`docker/Dockerfile.general` builds the Nova/Forge/Echo runtime from `ghcr.io/openclaw/openclaw:latest`. It installs system tools, TypeScript/lint tooling, Python lint tools, semgrep, hadolint `2.12.0`, kubeconform `0.6.4`, Helm when absent, Nova skills, common skills, and the OpenClaw agent observer plugin extension.

`docker/Dockerfile.sandbox` builds the Buster runtime from `ghcr.io/openclaw/openclaw:latest`. It installs Podman/buildah/slirp/fuse-overlayfs, Chromium, nginx, jq, tree, ripgrep, Lighthouse, Playwright, axe, pixelmatch, pngjs, ws, agent-browser, k6 `v0.54.0`, sandbox helper scripts, Buster skills, common skills, and the observer plugin extension.

`docker/Dockerfile.prism-preview` builds a lightweight `node:20-alpine` static server with `serve` and exposes port `3456`.

Current production values use `latest` tags for general and sandbox images. CI publishes `latest`, SHA, and date tags.

The root `.dockerignore` keeps runtime image build contexts narrow. It defaults to excluding repository files, then allows only the image inputs used by the Dockerfiles: runtime skills, the observer plugin source, the namespace controller entrypoint, and the Dockerfiles themselves. Deployment values under `my-values/`, local `.swarm` state, worktrees, local dependencies, logs, and secret-shaped files are excluded from Docker contexts even though `my-values/` remains tracked as the current audited deployment surface.

## Local Image Verification

The canonical local build path is in `scripts/deploy.sh`:

```bash
./scripts/deploy.sh build-local-images [tag]
./scripts/deploy.sh verify-live [tag]
```

`build-local-images` builds `docker/Dockerfile.general` and `docker/Dockerfile.sandbox`, tags them under the host-visible registry target from `LOCAL_REGISTRY_PUSH`, and pushes them. `verify-live` then proves the cluster-visible registry target from `LOCAL_REGISTRY_PULL` by starting temporary pods from both pushed runtime images before redeploying Nova and Buster. Because `registry-local` is ClusterIP by default, live local-image verification needs an explicit private push/pull path before use.

## Pinning Risk

The Dockerfiles and production values currently use `latest` for the OpenClaw base image and KubeClaw runtime images. CI also publishes immutable SHA tags, but the production values do not consume them by default. Operators who need reproducible deployments should override `image.tag` and verify the rendered output before rollout.
