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

## Claim-To-Test Map

| Claim class | Source or verifier |
| --- | --- |
| Documentation inventory and generated references are current | `npm run docs:inventory:check`; `npm run docs:generate:check`; `node scripts/docs-check.mjs` |
| Deployment manifests, NetworkPolicies, service exposure, PVCs, config mounts, and sandbox surfaces match source | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Documentation surface links and generated docs expectations stay valid | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface` |
| Telemetry docs match the event envelope and sink contracts | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` |
| Restart recovery and runtime monitor behavior remain source-backed | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery`; `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area runtime-monitor` |
| Status store lifecycle, artifacts, and Buster task settlement contracts stay stable | `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"`; `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` |
| Proposed doc edits have no whitespace errors | `git diff --check` |
| Referenced source paths/config keys exist | Use a targeted `test -e`/ `rg -q` sanity check for newly cited paths and keys before closing the docs pass. |

## Generated from

- `../generated/inventory/deploy-script.json`
- `../../scripts/docs-generate.mjs`
