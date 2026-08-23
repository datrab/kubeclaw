# Implemented Architecture

KubeClaw has one generic pipeline kernel and independently installable plugin
packages. The kernel discovers inert manifests, freezes a registry snapshot,
validates a generic graph, grants registration-scoped capabilities, commits
lifecycle state, journals effects and waits, and delivers immutable events.

Concrete behavior lives under:

- `skills/nova/plugins/`
- `skills/buster/plugins/`
- `skills/common/plugins/`

Role-neutral source lives under `skills/common/plugin-runtime/foundation/` and
`skills/common/plugin-runtime/sdk/`. Nova, neutral-worker, and Buster source
uses separate packages. Role manifests install only the declared package set.
The stable Nova entrypoint is `skills/nova/pipeline.ts`.

The core starts with zero plugins and imports no concrete package. Operator
configuration selects trusted roots, providers, grants, and registration
configuration. Project input cannot install packages or expand trust.

See [security-model.md](security-model.md) and
[plugin-system-current-inventory.md](plugin-system-current-inventory.md). See
[pipeline-runtime-packaging.md](pipeline-runtime-packaging.md) for role package
assembly.

Planned specialist architecture is documented separately and does not describe
current runtime behavior. See
[prism-design-engine-architecture.md](prism-design-engine-architecture.md) for the
living Prism design-agent, Studio, corpus, learning, and pipeline-integration
specification.

The accepted pipeline handoff is defined in
[prism-baseline-bundle-v1.md](prism-baseline-bundle-v1.md).
The accepted specialist-worker contract is defined in
[prism-design-engine-contract-v1.md](prism-design-engine-contract-v1.md).
The accepted persistence boundary is defined in
[prism-storage-model-v1.md](prism-storage-model-v1.md).
The accepted hybrid retrieval contract is defined in
[prism-retrieval-ranking-v1.md](prism-retrieval-ranking-v1.md).
The accepted contextual preference contract is defined in
[prism-preference-learning-v1.md](prism-preference-learning-v1.md).
The accepted responsive visual-editor experience is defined in
[prism-studio-interaction-v1.md](prism-studio-interaction-v1.md).
The accepted safe and customizable mock runtime is defined in
[prism-prototype-runtime-v1.md](prism-prototype-runtime-v1.md).
The accepted corpus ingestion and rights boundary is defined in
[prism-corpus-ingestion-v1.md](prism-corpus-ingestion-v1.md).
The accepted design validation and review gates are defined in
[prism-quality-gates-v1.md](prism-quality-gates-v1.md).
The accepted adapter from Prism baselines to existing Buster fidelity gates is
defined in
[prism-pipeline-fidelity-adapter-v1.md](prism-pipeline-fidelity-adapter-v1.md).
The accepted Prism backup, restore, and observability rules are defined in
[prism-recovery-observability-v1.md](prism-recovery-observability-v1.md).
The accepted Prism Helm workload, network, and permission boundary is defined in
[prism-helm-deployment-v1.md](prism-helm-deployment-v1.md).
The phased delivery plan is defined in
[../implementation/prism-implementation-plan.md](../implementation/prism-implementation-plan.md).
The active Puck, mobile, rendering-isolation, and PostgreSQL retrieval spikes are
defined in [../spikes/prism-foundation-spikes.md](../spikes/prism-foundation-spikes.md).

See
[pipeline-runtime-packaging-phase-5-6-final-audit.md](pipeline-runtime-packaging-phase-5-6-final-audit.md)
for the completed Phase 5.6 proof and remaining work.

The provider-based test-gate migration is governed by
[pipeline-test-gate-suite-migration-playbook.md](pipeline-test-gate-suite-migration-playbook.md).
Use the required
[migration templates](pipeline-test-gate-suite-migration-templates.md) and the
[generated migration status](pipeline-test-gate-suite-migration-status.md).
The Workflow v2 closeout evidence is in the
[final audit](pipeline-test-gate-suite-migration-workflow-v2-final-audit.md).
The first suite vertical slice is defined in
[pipeline-test-gate-phase-8-plan.md](pipeline-test-gate-phase-8-plan.md).
Use the complete project guide at
[pipeline-test-gate-unit-user-guide.md](pipeline-test-gate-unit-user-guide.md),
the deployment guide at
[pipeline-test-gate-unit-operator-guide.md](pipeline-test-gate-unit-operator-guide.md),
and the closeout evidence at
[pipeline-test-gate-phase-8-final-audit.md](pipeline-test-gate-phase-8-final-audit.md).
Unit parity is proved by the
[Phase 9 plan](pipeline-test-gate-phase-9-plan.md),
[machine parity ledger](pipeline-test-gate-unit-parity-ledger.json),
[generated parity report](pipeline-test-gate-phase-9-parity-report.md), and
[controlled comparison](pipeline-test-gate-phase-9-comparison.md).
The unit cutover and deletion are defined by the
[Phase 10 plan](pipeline-test-gate-phase-10-plan.md),
[machine cutover inventory](pipeline-test-gate-unit-cutover-inventory.json),
and [final Phase 10 audit](pipeline-test-gate-phase-10-final-audit.md).
Container-build users start with the
[user guide](pipeline-test-gate-container-build-user-guide.md). Operators use
the [operator guide](pipeline-test-gate-container-build-operator-guide.md),
[configuration reference](pipeline-test-gate-container-build-configuration-reference.md),
[error reference](pipeline-test-gate-container-build-error-reference.md), and
[security model](pipeline-test-gate-container-build-security-model.md).
