# Docker Images

Status: current
Audience: operator, developer

## Purpose

Document what the runtime images contain.

## Current Behavior

`docker/Dockerfile.general` builds the Nova/Forge/Echo runtime from `ghcr.io/openclaw/openclaw:latest`. It installs system tools, TypeScript/lint tooling, Python lint tools, semgrep, hadolint `2.12.0`, kubeconform `0.6.4`, Helm when absent, Nova skills, common skills, the OpenClaw agent observer plugin extension, and an image-baked npm cache for the official `@openclaw/acpx` and `@openclaw/discord` plugins.

`docker/Dockerfile.sandbox` builds the Buster runtime from `ghcr.io/openclaw/openclaw:latest`. It installs Podman/buildah/slirp/fuse-overlayfs, Chromium, nginx, jq, tree, ripgrep, Lighthouse, Playwright, axe, pixelmatch, pngjs, ws, agent-browser, k6 `v0.54.0`, sandbox helper scripts, Buster skills, common skills, the observer plugin extension, and the same official external plugin cache.

`docker/Dockerfile.namespace-controller` builds the Buster namespace controller from `node:22-bookworm-slim`. It copies only `scripts/buster-namespace-controller.mjs` and runs it as the non-root `node` user. It does not inherit the OpenClaw runtime image.

`docker/Dockerfile.prism-preview` builds a lightweight `node:20-alpine` static server with `serve` and exposes port `3456`.

Current production values use `latest` tags for general, sandbox, namespace-controller, and Prism preview images. CI publishes `latest`, SHA, and date tags.

The root `.dockerignore` keeps runtime image build contexts narrow. It defaults to excluding repository files, then allows only the image inputs used by the Dockerfiles: runtime skills, the observer plugin source, the namespace controller entrypoint, and the Dockerfiles themselves. Deployment values under `my-values/`, local `.swarm` state, worktrees, local dependencies, logs, and secret-shaped files are excluded from Docker contexts even though `my-values/` remains tracked as the current audited deployment surface.

## Runtime Image Surfaces

| Image | Copied repo paths | Runtime paths | Important env/defaults | Known failure signal |
| --- | --- | --- | --- | --- |
| General | `skills/nova/`; `skills/common/`; `plugins/openclaw-agent-observer/` | `/app/skills`, `/app/dist/extensions/kubeclaw-agent-observer`, `/opt/openclaw-plugin-npm` | `NODE_PATH=/usr/local/lib/node_modules:/app/node_modules`, `NPM_CONFIG_CACHE=/root/.npm`, `HOME=/home/node` | missing tool, plugin compile failure, or official plugin install failure during Docker build; deployment truth fails if install commands silently continue |
| Sandbox | `skills/buster/`; `skills/common/`; `plugins/openclaw-agent-observer/` | `/app/skills`, `/sandbox`, `/var/lib/containers/storage`, `/ms-playwright`, `/app/dist/extensions/kubeclaw-agent-observer`, `/opt/openclaw-plugin-npm` | `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, `SANDBOX_TIMEOUT`, Podman storage under `/var/lib/containers/storage` | Buster startup or suite failures, Podman storage pressure, missing browser/tool binary, or official plugin install failure |
| Namespace controller | `scripts/buster-namespace-controller.mjs` | `/app/scripts/buster-namespace-controller.mjs` | Kubernetes ServiceAccount env and token mount, `BUSTER_*` broker settings | controller pod `ImagePullBackOff`, ServiceAccount token/API host errors, or lease reconciliation errors |
| Prism preview | none beyond the Dockerfile | `/designs`, port `3456` | `serve /designs -p 3456 --no-clipboard` | sidecar reachable but no preview files if Nova has not written workspace designs |

## Build Context Contract

`.dockerignore` starts with `**`, then allows only `docker/`, `skills/`, `plugins/openclaw-agent-observer/`, and `scripts/buster-namespace-controller.mjs`. This is intentional: deployment values, local state, `.github/`, `node_modules`, logs, `.env` files, key material, and decrypted secret-shaped files must not enter the image build context.

## Local Image Verification

The canonical local build path is in `scripts/deploy.sh`:

```bash
./scripts/deploy.sh build-local-images [tag]
./scripts/deploy.sh verify-live [tag]
```

`build-local-images` builds `docker/Dockerfile.general`, `docker/Dockerfile.sandbox`, and `docker/Dockerfile.namespace-controller`, tags them under the host-visible registry target from `LOCAL_REGISTRY_PUSH`, and pushes them. `verify-live` then proves the cluster-visible registry target from `LOCAL_REGISTRY_PULL` by starting temporary pods from all deployed images before redeploying Nova and Buster. Because `registry-local` is ClusterIP by default, live local-image verification needs an explicit private push/pull path before use.

## Pinning Risk

The Dockerfiles and production values currently use `latest` for the OpenClaw base image and KubeClaw runtime images. CI also publishes immutable SHA tags, but the production values do not consume them by default. Operators who need reproducible deployments should override `image.tag` and verify the rendered output before rollout.

## Verification

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
./scripts/deploy.sh build-local-images live-smoke
./scripts/deploy.sh verify-live live-smoke
```

The repository check proves source and rendered-manifest contracts. The deploy script commands prove the local Docker daemon, registry push target, cluster pull target, rollout, and smoke path in a live environment.
