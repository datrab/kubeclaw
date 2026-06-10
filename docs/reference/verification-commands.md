# Verification Commands

Status: generated reference
Audience: operator, developer

## Summary

This page lists deployment verification commands from the first generated inventory slice plus source-backed local checks used during the documentation rebuild.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `scripts/deploy.sh`

## Deployment Verification Commands

| Command | Description |
| --- | --- |
| `./scripts/deploy.sh build-local-images [tag]` | Build + push verification images to registry-local |
| `./scripts/deploy.sh verify-live [tag]` | Build local images, redeploy agents, run pod smoke |
| `./scripts/deploy.sh smoke` | Run pod-level smoke checks for Nova + Buster |
| `./scripts/deploy.sh smoke-agent <name>` | Run pod-level smoke checks for one agent |
| `./scripts/deploy.sh status` | Show all pods and services |


<!-- END GENERATED -->

## Local Documentation And Deployment Checks

```bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

## Generated from

- `../generated/inventory/deploy-script.json`
- `../../scripts/docs-generate.mjs`
