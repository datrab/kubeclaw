# Documentation Topic Map

| Topic | Canonical pages | Source evidence |
| --- | --- | --- |
| Runtime architecture | `docs/architecture/README.md`; `docs/pipeline/architecture.md` | `skills/common/plugin-runtime/core/`; `skills/nova/pipeline.ts` |
| Plugin inventory | `docs/architecture/plugin-system-current-inventory.md` | `docs/generated/inventory/plugin-system.json` |
| Security and isolation | `docs/architecture/security-model.md`; `docs/operators/external-pipeline-plugins.md` | `skills/common/plugin-runtime/core/isolation/`; `skills/common/plugin-runtime/core/packages/install.ts` |
| Deployment | `docs/deployment/README.md`; `docs/deployment/agent-deployments.md` | `charts/kubeclaw/templates/deployment.yaml`; `scripts/deploy.sh` |
| Operations | `docs/operators/README.md`; `docs/operators/running-the-pipeline.md`; `docs/operators/recovery-runbook.md` | `skills/common/plugin-runtime/cli.ts` |
| Extension authoring | `docs/developers/README.md`; `docs/developers/authoring-plugin-pipelines.md`; `docs/developers/authoring-plugin-observers.md` | `skills/common/plugin-runtime/sdk/` |
| Cutover history | `docs/architecture/plugin-system-phase12-changelog.md`; `docs/architecture/plugin-system-implementation-plan.md` | `tests/verification/contracts/check-plugin-system-v2-phase12.mts` |
