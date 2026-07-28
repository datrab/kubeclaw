# Docker Images

Status: current
Audience: operator, developer

## Purpose

Document what the runtime images contain.

## Current Behavior

`docker/Dockerfile.general` builds the Nova/Forge/Echo runtime from OpenClaw `2026.7.1` pinned by multi-architecture manifest digest. Debian packages resolve from the snapshot matching that base. JavaScript tools install from `docker/general-tools/package-lock.json`; Python and official OpenClaw plugin versions are exact; downloaded verification binaries are architecture-aware and checksum-verified. Playwright owns the single Chromium installation. The image includes the OpenClaw agent observer extension and intentionally excludes Nova/common skills, which arrive through the code-bundle deploy path.

`docker/Dockerfile.buster-gateway` builds Buster's dedicated OpenClaw gateway. Its runtime stage contains OpenClaw, the observer, the official ACPX/Discord plugin cache, `ioredis`, and basic shell/Git inspection utilities. Compilation occurs only in the disposable asset stage. The runtime does not contain linters, browsers, scanners, BuildKit, or Kubernetes tooling.

`docker/Dockerfile.buster-pipeline` builds the dedicated non-root Buster worker from `node:24-bookworm-slim` and copies rootless BuildKit tooling from `moby/buildkit:rootless`. It includes kubectl, browser tooling, Lighthouse, Playwright, k6, manifest/static-analysis tools, and the deterministic suite runtime. It does not include the OpenClaw gateway or agent skills; skills arrive through the code-bundle deploy path.

`docker/Dockerfile.namespace-controller` builds the Buster namespace controller from `cmd/buster-namespace-controller` in a Go build stage, then copies the compiled binary into a distroless non-root runtime image. It does not inherit the OpenClaw runtime image.

`docker/Dockerfile.prism-preview` builds a lightweight `node:20-alpine` static server with `serve` and exposes port `3456`.

Current production values use `latest` tags for the general, Buster gateway, Buster pipeline, namespace-controller, and Prism preview images. CI publishes `latest`, SHA, and date tags.

The root `.dockerignore` keeps runtime image build contexts narrow. It defaults to excluding repository files, then allows only the image inputs used by the Dockerfiles: Dockerfiles, the observer plugin source, `go.mod`, and the namespace controller Go source. Agent skills are excluded from image contexts because code bundles own `/app/skills`. Deployment values under `my-values/`, local `.swarm` state, worktrees, local dependencies, logs, and secret-shaped files are excluded from Docker contexts even though `my-values/` remains tracked as the current audited deployment surface.

## Runtime Image Surfaces

| Image | Copied repo paths | Runtime paths | Important env/defaults | Known failure signal |
| --- | --- | --- | --- | --- |
| General | `docker/general-tools/package.json`; `docker/general-tools/package-lock.json`; `skills/common/plugins/openclaw-agent-observer/` | `/opt/kubeclaw-tools`, Playwright Chromium, empty `/app/skills` mount point, `/app/dist/extensions/kubeclaw-agent-observer`, `/opt/openclaw-plugin-home` | `NODE_PATH=/opt/kubeclaw-tools/node_modules:/app/node_modules`, `NPM_CONFIG_CACHE=/root/.npm`, `HOME=/home/node` | checksum/version verification, locked dependency install, plugin compile, or official plugin install failure during Docker build; deployment truth rejects mutable or unverified inputs |
| Buster gateway | `skills/common/plugins/openclaw-agent-observer/` | empty `/app/skills` mount point, `/app/dist/extensions/kubeclaw-agent-observer`, `/opt/openclaw-plugin-home` | `NODE_PATH=/usr/local/lib/node_modules:/app/node_modules`, `HOME=/home/node` | gateway/plugin startup failure; deployment truth rejects pipeline-owned tools in the final runtime stage |
| Buster pipeline | pipeline source supplied by `/app/skills` | `/home/builder/.local/share/buildkit`, `/home/builder/.openclaw/results`, `/app/skills` | `BUILDKIT_HOST`, `KUBECLAW_LOCAL_REGISTRY`, rootless BuildKit state | worker probe failure, registry push failure, missing suite tool, or namespace-lease deployment failure |
| Namespace controller | `cmd/buster-namespace-controller/**` | `/app/buster-namespace-controller` | Kubernetes ServiceAccount env and token mount, `BUSTER_*` broker settings | controller pod `ImagePullBackOff`, ServiceAccount token/API host errors, or lease reconciliation errors |
| Prism preview | none beyond the Dockerfile | `/designs`, port `3456` | `serve /designs -p 3456 --no-clipboard` | sidecar reachable but no preview files if Nova has not written workspace designs |

## Build Context Contract

`.dockerignore` starts with `**`, then allows only `docker/`, `go.mod`, `cmd/buster-namespace-controller/`, and `skills/common/plugins/openclaw-agent-observer/`. The `docker/` allowance includes the committed general-tool lockfile. Agent skills, deployment values, local state, `.github/`, `node_modules`, logs, `.env` files, key material, and decrypted secret-shaped files must not enter the image build context.

## Operator Deployment Use

The deployment script no longer builds images locally. Runtime image changes should flow through CI-published GHCR images and be applied with:

```bash
./scripts/deploy.sh image both
./scripts/deploy.sh smoke
```

Code-only skill updates should flow through CI-published GitHub release bundles and be applied with:

```bash
./scripts/deploy.sh code nova
./scripts/deploy.sh code buster
```

Set `NOVA_CODE_BUNDLE_EXPECTED_COMMIT` or `BUSTER_CODE_BUNDLE_EXPECTED_COMMIT` only when pinning a specific published bundle SHA instead of taking the latest remote `main`.

Those bundles preserve the existing `/app/skills` runtime contract:

- Nova pod = `skills/nova` plus `skills/common` overlays
- Buster pod = `skills/buster` plus `skills/common` overlays
- shared files from `skills/common` still replace the repo-local re-export facades in matching runtime paths

## Pinning Contract

The OpenClaw base, Debian snapshot, language tools, official plugins, and standalone binaries are pinned in source. The nightly workflow reports when the current OpenClaw release differs from the pinned digest. Production values still consume moving KubeClaw `latest` tags; CI also publishes immutable SHA tags, so operators requiring reproducible rollouts should override `image.tag` and verify the rendered output before rollout.

## Verification

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
./scripts/deploy.sh image both
./scripts/deploy.sh smoke
```

The repository check proves source and rendered-manifest contracts. The deploy script commands prove rollout and smoke behavior in a live environment.
