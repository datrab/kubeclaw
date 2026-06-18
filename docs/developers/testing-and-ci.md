# Testing and CI

Status: current
Audience: developer, maintainer

## Purpose

Document the verification commands and CI surfaces visible in this repository.

## Local commands

```bash
./tests/verification/run-fast-verification.sh
./tests/verification/run-full-verification.sh
npm run docs:check
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area docs-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area deployment-surface
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area restart-recovery
node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"
node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

The fast/full verification wrappers are silent on clean passes. Passing warning output prints warning lines. Failed steps print the failed step name plus buffered output. Use `--verbose` or `VERIFICATION_VERBOSE=1` to stream step banners and passing output.

Render deployment manifests before deployment-related checks:

```bash
helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml >/tmp/kubeclaw-nova-render.yaml
helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml >/tmp/kubeclaw-buster-render.yaml
```

## Image publishing

CI/image documentation is in `../deployment/ci-and-image-publishing.md`. The current docs record a tag/pinning gap: Dockerfiles and values use `latest` style references while CI base digest checks use a pinned OpenClaw base tag. Track any fix in `../open-issues.md`.

## CI Surface

`.github/workflows/docs-checks.yaml` runs on docs/chart/value/script changes. It uses Node 24, runs `npm run docs:check`, then runs `git diff --check`. Broader behavior, contract, runtime, and deployment verification commands are local/source checks unless another workflow is added.

## Local Verification Matrix

| Area | Command | Use when |
| --- | --- | --- |
| fast local verification | `./tests/verification/run-fast-verification.sh` | local runtime, contract, docs, and selected behavior confidence |
| full verification | `./tests/verification/run-full-verification.sh` | exhaustive local verification with live subagent, ACP, Redis, docs, whitespace, deployment, contract, and behavior surfaces |
| docs inventory and generated references | `npm run docs:check` | any doc, generator, generated inventory, chart/value/script reference changes |
| deployment truth | `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` | chart, values, deploy script, images, secrets, NetworkPolicy, or live operator docs change |
| pipeline behavior | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline` | module/gate scheduling, config, state, or runner behavior changes |
| Buster contract | `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"` | Buster task, Redis, suite, completion, ACK, or dead-letter behavior changes |
| status/recovery contract | `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"` | lifecycle, read model, artifact, recovery, or status docs change |
| telemetry docs/contract | `node tests/verification/behavior/verify.mjs --source-root "$PWD" --area telemetry-docs` and `node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"` | telemetry event, sink, observer, or generated event docs change |

Record any command that remains local-only in the changed doc. Do not imply CI protects a behavior unless a workflow actually runs that verifier.
