# Verification Commands

Status: generated reference
Audience: operator, developer
Owner: platform-maintainers
Evidence: docs/generated/inventory/deploy-script.json; scripts/docs-generate.mjs
Applies to: local and deployment verification
Last verified: generated from current inventory

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

## Command Effects And Authority

The deployment commands above are not all read-only verification. Run them from
the repository root with the intended Kubernetes context and namespace selected.
The platform maintainer owns this deployment route; use the [CLI reference](cli.md)
and [operator procedure](../use/operate.md) for prerequisites and recovery.

| Command family | Effect and required authority | Expected observation and stop boundary |
| --- | --- | --- |
| `image`, `image <name>` | Mutates the selected agent deployment through `cmd_image` → `deploy_agent` in image mode. Requires deployment write authority, not only permission to inspect pods. | Applies selected image/runtime values and waits for deployment health. A failure can follow partial mutation; inspect the selected release before recovery. Do not run as a read-only check. |
| `nova-production-preflights <image>` | Runs live production-suite preflights after source-cutover checks. Requires the individual preflights' cluster, execution and external-service authority; can create workloads, images and receipts. | Each required proof must succeed. Stop on failure; do not equate partial results with whole-suite acceptance or retry unknown external effects blindly. |
| `smoke`, `smoke-agent <name>` | Inspects deployed workloads, waits for readiness and executes gateway/health/file checks inside containers. Requires cluster read and pod-exec authority. `smoke` also checks Prism when enabled. | Successful checks establish only the tested pod/health boundary, not a full pipeline run. Diagnose a failed check before changing deployments. |
| `status` | Reads resource status; includes Prism status when enabled. Requires resource-read authority in the selected namespaces. | Displays observed resources, not functional pipeline acceptance. Missing or unhealthy resources require diagnosis, not an automatic redeploy. |

These effects follow the dispatch and `cmd_image`, `cmd_smoke_agent`, `cmd_smoke`,
`cmd_status` and `cmd_nova_production_preflights` implementations in
[scripts/deploy.sh](../../../scripts/deploy.sh). No command here has been executed
against a live deployment as part of this documentation correction.

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
| The complete real model-backed workflow works | `node tests/verification/e2e/run-real-pipeline-e2e.mjs --mode full` |
| Proposed doc edits have no whitespace errors | `git diff --check` |
| Referenced source paths/config keys exist | Use a targeted `test -e`/ `rg -q` sanity check for newly cited paths and keys before closing the docs pass. |

## Generated from

- `../generated/inventory/deploy-script.json`
- `../../scripts/docs-generate.mjs`
