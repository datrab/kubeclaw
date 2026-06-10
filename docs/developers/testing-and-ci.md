# Testing and CI

Status: current
Audience: developer, maintainer

## Purpose

Document the verification commands and CI surfaces visible in this repository.

## Local commands

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

Render deployment manifests before deployment-related checks:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
```

## Image publishing

CI/image documentation is in `../deployment/ci-and-image-publishing.md`. The current docs record a tag/pinning gap: Dockerfiles and values use `latest` style references while CI base digest checks use a pinned OpenClaw base tag. Track any fix in `../open-issues.md`.
