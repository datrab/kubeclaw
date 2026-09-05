# Documentation Topic Map

| Topic | Canonical pages | Source evidence |
| --- | --- | --- |
| Runtime architecture | `docs/architecture/README.md`; `docs/pipeline/architecture.md` | `skills/common/plugin-runtime/foundation/`; `skills/nova/core/`; `skills/worker/core/`; `skills/buster/engine/` |
| Cilium networking | `docs/ops/cilium-quickstart.md`; `docs/ops/cilium-networking.md`; `docs/ops/review-remediation.md` | `my-values/infra/cilium-values.yaml`; `my-values/infra/cilium-cluster-policies.yaml`; `my-values/infra/network-policies.yaml`; `scripts/deploy-cilium.sh`; `scripts/migrate-kubeclaw-network-policies-to-cilium.sh` |
| Test-suite migration | `docs/architecture/pipeline-test-gate-suite-migration-playbook.md`; `docs/architecture/pipeline-test-gate-suite-migration-templates.md`; `docs/architecture/pipeline-test-gate-suite-migration-status.md`; `docs/architecture/pipeline-test-gate-container-build-user-guide.md`; `docs/architecture/pipeline-test-gate-container-build-operator-guide.md` | `contracts/pipeline-test-gate/`; `skills/nova/core/test-gates/`; `skills/buster/engine/test-gates/`; `tests/verification/contracts/check-pipeline-container-build-cutover.mts` |
| Echo review governance | `docs/architecture/echo-review-governance-implementation-plan.md`; `docs/architecture/echo-review-phase-1-baseline.md`; `docs/architecture/echo-review-phase-2-design.md`; `docs/architecture/echo-review-phase-3-design.md`; `docs/architecture/echo-review-phase-4-design.md`; `docs/architecture/echo-review-phase-5-design.md`; `docs/architecture/echo-review-phase-6-design.md`; `docs/architecture/echo-review-phase-7-design.md`; `docs/architecture/echo-review-phase-8-design.md`; `docs/architecture/echo-review-roadmap.md` | `skills/nova/plugins/review/` |
| Plugin inventory | `docs/architecture/plugin-system-current-inventory.md` | `docs/generated/inventory/plugin-system.json` |
| Security and isolation | `docs/architecture/security-model.md`; `docs/operators/external-pipeline-plugins.md` | `skills/common/plugin-runtime/foundation/isolation/`; `skills/common/plugin-runtime/foundation/packages/install.ts` |
| Deployment | `docs/deployment/README.md`; `docs/deployment/agent-deployments.md` | `charts/kubeclaw/templates/deployment.yaml`; `scripts/deploy.sh` |
| Operations | `docs/operators/README.md`; `docs/operators/running-the-pipeline.md`; `docs/operators/recovery-runbook.md` | `skills/nova/core/cli.ts` |
| Extension authoring | `docs/developers/README.md`; `docs/developers/authoring-plugin-pipelines.md`; `docs/developers/authoring-plugin-observers.md` | `skills/common/plugin-runtime/sdk/` |
| Cutover history | `docs/architecture/plugin-system-phase12-changelog.md`; `docs/architecture/plugin-system-implementation-plan.md` | `tests/verification/contracts/check-plugin-system-v2-phase12.mts` |

