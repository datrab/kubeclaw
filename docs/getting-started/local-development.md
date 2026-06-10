# Local Development

Status: current
Audience: developer, maintainer

## Purpose

Set up enough local confidence to edit docs, chart files, values, pipeline code, or verification scripts.

## Prerequisites

The repository verification scripts are Node-based. Deployment checks also require Helm. Some image and runtime paths use tools installed into the runtime containers, but local documentation and chart checks do not require the full container toolchain.

## Basic checks

From the repository root:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

For behavior areas:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
```

## Working rules

- If you change Helm templates or production values, render Nova and Buster.
- If you change deployment documentation, run the deployment truth check.
- If you change docs layout, run `docs-surface`.
- If you change pipeline behavior, choose the narrow behavior area that covers the modified surface and add coverage when needed.
