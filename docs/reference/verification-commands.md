# Verification Commands

Status: generated reference
Audience: operator, developer

## Summary

This page lists deployment verification commands plus source-backed local checks.

<!-- BEGIN GENERATED: source-backed reference -->

Generated from: `scripts/deploy.sh`

## Deployment Verification Commands

| Command | Description |
| --- | --- |
| `./scripts/deploy.sh nova-production-preflights <image>` | Run all required proofs after all source cutovers |
| `./scripts/deploy.sh image` | Deploy both agents using image/runtime values |
| `./scripts/deploy.sh image <name>` | Deploy one agent using image/runtime values |
| `./scripts/deploy.sh smoke` | Run pod-level smoke checks for Nova + Buster |
| `./scripts/deploy.sh smoke-agent <name>` | Run pod-level smoke checks for one agent |
| `./scripts/deploy.sh status` | Show all pods and services |


<!-- END GENERATED -->

## Local Documentation And Deployment Checks

```bash
npm run verify:plugin-system-v2
npm run typecheck:skills
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

## Claim-To-Test Map

| Claim class | Source or verifier |
| --- | --- |
| Documentation inventory and generated references are current | `npm run docs:inventory:check`; `npm run docs:generate:check`; `node scripts/docs-check.mjs` |
| Core, package, capability, lifecycle, recovery, isolation, and malicious-package checks pass | `npm run verify:plugin-system-v2` |
| Deployment manifests, NetworkPolicies, service exposure, PVCs, config mounts, and sandbox surfaces match source | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` |
| Documentation surface links and generated docs expectations stay valid | `npm run docs:check` |
| Restart, recovery, retry, crash, and resume behavior remain source-backed | `node tests/verification/contracts/check-plugin-system-v2-phase7.mjs`; `node tests/verification/contracts/check-plugin-system-v2-resume.mjs` |
| The complete real model-backed workflow works | `node tests/verification/e2e/run-real-pipeline-e2e.mts --mode full` |
| Proposed doc edits have no whitespace errors | `git diff --check` |
| Referenced source paths/config keys exist | Use a targeted `test -e`/ `rg -q` sanity check for newly cited paths and keys before closing the docs pass. |

## Generated from

- `../generated/inventory/deploy-script.json`
- `../../scripts/docs-generate.mjs`
