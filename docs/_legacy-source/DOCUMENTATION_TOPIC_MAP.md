# Documentation Topic Map

| Topic | Canonical pages | Source evidence |
| --- | --- | --- |
| Runtime architecture | `docs/site/understand/README.md`; `docs/site/understand/components-and-authority.md`; `docs/site/understand/request-state-recovery.md` | `skills/common/plugin-runtime/foundation/`; `skills/nova/core/`; `skills/worker/core/`; `skills/buster/engine/` |
| Test suites and Buster | `docs/site/extend/buster.md`; `docs/site/product-surfaces.md` | `contracts/pipeline-test-gate/`; `skills/nova/core/test-gates/`; `skills/buster/engine/test-gates/` |
| Echo decisions and current boundary | `docs/site/decisions/echo.md`; `docs/site/understand/components-and-authority.md`; `docs/site/status/current.md` | `skills/nova/plugins/review/` |
| Plugin inventory | `docs/site/extend/plugin-catalogue/README.md`; `docs/site/reference/capabilities.md` | `docs/generated/inventory/plugin-system.json`; `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts` |
| Security and isolation | `docs/site/understand/deployment-and-trust.md`; `docs/site/understand/worker-trust.md`; `docs/site/extend/testing.md` | `skills/common/plugin-runtime/foundation/isolation/`; `skills/common/plugin-runtime/foundation/packages/install.ts` |
| Deployment | `docs/site/use/install.md`; `docs/site/understand/deployment-and-trust.md` | `charts/kubeclaw/templates/deployment.yaml`; `scripts/deploy.sh` |
| Operations | `docs/site/use/README.md`; `docs/site/use/operate.md`; `docs/site/use/diagnose.md`; `docs/site/use/recovery.md`; `docs/site/use/maintenance.md` | `skills/nova/core/cli.ts`; `skills/nova/project/cli.ts`; `charts/prism/files/prism-backup.sh` |
| Extension authoring | `docs/site/extend/README.md`; `docs/site/extend/first-plugin.md`; `docs/site/extend/contracts.md`; `docs/site/extend/testing.md` | `skills/common/plugin-runtime/sdk/` |
| Current implementation and compatibility | `docs/site/status/current.md`; `docs/site/status/open-issues.md`; `docs/site/decisions/README.md` | `docs/status/open-issues.json`; `packaging/runtime/package-ownership.json` |
| Codex operations workspace | `docs/site/understand/platform-and-operations.md`; `docs/site/extend/host-and-engine.md` | `charts/ops-pod/`; `plugins/kubeclaw-ops/`; `tools/ops-mcp/src/`; `scripts/deploy-ops-pod.sh` |

Only paths below `docs/site` are canonical reader documentation. Other files can
remain implementation evidence or temporary migration sources until cleanup.
They do not define a second reader-facing authority.
