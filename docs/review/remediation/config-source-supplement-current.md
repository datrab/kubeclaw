# Consolidated current source-inventory supplements

C0 remains open. This index brings together the latest additive definitions instead of requiring readers to reconstruct batch history. It covers only the 358 source candidates in the frozen Delivery batch24 queue, not all canonical settings or all project sources. Original inventory and case bodies are unchanged. Counts are navigation, not acceptance.

## Current source definitions

| Area | Original clauses | Latest definition | Independent bounded review |
|---|---:|---|---|
| Prism workloads | 23 | [batch 26](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-26/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-workload-correction-18/REPORT.md) |
| Swarm template | 20 | [batch 28](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-28/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-swarm-cap-correction-20/README.md) |
| Gateway startup | 19 | [batch 30](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-30/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-gateway-attribution-22/README.md) |
| Trust/readiness | 24 | [batch 31](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-31/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-trust-readiness-23/README.md) |
| Runtime role packaging | 28 | [batch 32](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-32/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-role-packaging-24/README.md) |
| Prism services/storage/network | 56 | [batch 34](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-34/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-prism-schema-correction-26/README.md) |
| Ops clients and pagination | 33 | [batch 36](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-36/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-ops-pagination-correction-28/README.md) |
| Ops deployment and permissions | 31 | [batch 38](../evidence/config-acceptance/c0-completion-20261013/delivery/batch-38/source-field-definitions.json) | [report](../evidence/config-acceptance/c0-completion-20261013/independent-ops-dedup-recheck/README.md) |

Ops deployment review originally rejected one namespace claim; [original report](../evidence/config-acceptance/c0-completion-20261013/independent-ops-chart-source-resumed/README.md) and batch37 remain preserved. The latest correction is validate-then-deduplicate, with no whitespace trimming; Helm ranges the original list. Recheck accepts that correction only.

[Machine-readable candidate index](../evidence/config-acceptance/c0-completion-20261013/source-supplement-index.json) maps all 234 concrete rows to source coordinates and latest definitions.

## Exact remaining source work

124 original candidates in 24 sources still require concrete source definitions in this supplement. A fresh independent source enumeration is in progress; do not interpret it as completed review.

| Source | Remaining candidates |
|---|---:|
| `charts/kubeclaw/files/config/swarm.config.json` | 1 |
| `charts/kubeclaw/templates/NOTES.txt` | 11 |
| `charts/kubeclaw/templates/_buster-native.tpl` | 7 |
| `charts/kubeclaw/templates/archviewer.yaml` | 7 |
| `charts/kubeclaw/templates/buster-namespace-fence.yaml` | 2 |
| `charts/kubeclaw/templates/buster-runtime-pvc.yaml` | 1 |
| `charts/kubeclaw/templates/configmap-skills.yaml` | 2 |
| `charts/kubeclaw/templates/configmap-swarm-config.yaml` | 4 |
| `charts/kubeclaw/templates/configmap-workspace.yaml` | 15 |
| `charts/kubeclaw/templates/demo-ready-service.yaml` | 4 |
| `charts/kubeclaw/templates/pvc.yaml` | 2 |
| `charts/kubeclaw/templates/rbac.yaml` | 6 |
| `charts/kubeclaw/templates/secret.yaml` | 3 |
| `charts/kubeclaw/templates/service-extra-nodeports.yaml` | 2 |
| `charts/kubeclaw/templates/service.yaml` | 11 |
| `charts/kubeclaw/templates/serviceaccount.yaml` | 2 |
| `charts/kubeclaw/values.yaml` | 1 |
| `charts/prism/templates/_product-decisions.tpl` | 1 |
| `charts/prism/templates/_swarm-config.tpl` | 1 |
| `charts/prism/values.schema.json` | 4 |
| `skills/buster/engine/test-gates/preparation-config.ts` | 17 |
| `skills/buster/engine/test-gates/preparation-supervisor.ts` | 7 |
| `skills/common/plugins/openclaw-agent-observer/src/config.ts` | 12 |
| `skills/prism/openclaw-plugin/index.mjs` | 1 |

## Work still needed beyond source enumeration

- Reconcile current author/default/consumer facts with the proposed single-author CONFIG fields and canonical inventory, preserving original requirements and cases.
- Join complete role-specific operator profiles and schema/domain constraints to actual packaging, rendering and loaders.
- Make module/run/grant/revision/activation/recovery boundaries and concrete implementation acceptance cases explicit.
- Freeze a bounded C1–C6 change package; distinguish code-based definition review from not-run implementation and externally unavailable live evidence.
- Obtain fresh whole-C0 review before requesting implementation approval. Native execution is not a prerequisite for inventing current-source facts and must not be reported as performed.

No new generic validation framework, production change, deployment, merge or C1–C6 authorization is introduced by this index.
