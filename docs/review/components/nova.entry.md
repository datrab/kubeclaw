# nova.entry

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/pipeline.ts`
- `skills/nova/core/cli.ts`
- `skills/nova/core/src`
- `skills/nova/project`

Entrypoints: `pipeline.ts → core / project CLI`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `@kubeclaw/nova-core`, `@kubeclaw/plugin-sdk`, `@kubeclaw/plugin-foundation`, `@kubeclaw/pipeline-test-gate-contract`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/agent-observability/tests/live-function.test.ts`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts`
- `skills/common/plugins/openclaw-agent-events/tests/live-function.test.ts`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/case-study/tests/live-function.test.ts`
- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/lint/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-nova-journal-scale.mts`
- `tests/verification/contracts/check-pipeline-a11y-cutover.mts`
- `tests/verification/contracts/check-pipeline-api-cutover.mts`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-http-cutover.mts`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-cutover.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-cutover.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase10-cutover.mts`
- `tests/verification/contracts/check-pipeline-phase9-parity.mts`
- `tests/verification/contracts/check-pipeline-report-adapter-registry.mts`
- `tests/verification/contracts/check-pipeline-report-adapter-runtime.mts`
- `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts`
- `tests/verification/contracts/check-pipeline-security-cutover.mts`
- `tests/verification/contracts/check-pipeline-size-budget-cutover.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-pipeline-test-provider-registry.mts`
- `tests/verification/contracts/check-pipeline-test-suite-resolver.mts`
- `tests/verification/contracts/check-pipeline-visual-cutover.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs`
- `tests/verification/contracts/check-plugin-system-v2-e2e.mjs`
- `tests/verification/contracts/check-plugin-system-v2-import-safety.mjs`
- `tests/verification/contracts/check-plugin-system-v2-installation.mjs`
- `tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs`
- `tests/verification/contracts/check-plugin-system-v2-live-crashes.mts`
- `tests/verification/contracts/check-plugin-system-v2-phase11.mts`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs`
- `tests/verification/contracts/check-plugin-system-v2-phase7.mjs`
- `tests/verification/contracts/check-plugin-system-v2-platform-config.mjs`
- `tests/verification/contracts/check-plugin-system-v2-registry.mjs`
- `tests/verification/deployment/check-deployment-truth.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/e2e/scenario-proof.mts`
- `tests/verification/reliability/external-effect-recovery.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/README.md`
- `docs/architecture/nova-project-runtime.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-manifest-lint-parity-report.md`
- `docs/architecture/plugin-system-phase12-changelog.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/developers/contributing.md`
- `docs/operators/running-the-pipeline.md`
- `docs/pipeline/architecture.md`
- `docs/site/use/README.md`
- `docs/site/use/quickstart.md`
- `docs/site/use/recovery.md`
- `skills/nova/project/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/eslint.config.mjs:29`
- `charts/kubeclaw/files/config/eslint.config.mjs:31`
- `charts/kubeclaw/files/config/eslint.config.mjs:48`
- `charts/kubeclaw/files/config/knip.json:40`
- `charts/kubeclaw/files/config/knip.json:41`
- `charts/kubeclaw/files/config/knip.json:46`
- `charts/kubeclaw/files/config/knip.json:47`
- `docs/DOCUMENTATION_TOPIC_MAP.md:11`
- `docs/architecture/README.md:17`
- `docs/architecture/nova-project-runtime.md:3`
- `docs/architecture/nova-project-runtime.md:5`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:6`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:27`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:28`
- `docs/architecture/pipeline-test-gate-api-cutover-inventory.json:12`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:24`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:25`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:27`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:31`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:40`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:117`
- `docs/architecture/pipeline-test-gate-http-cutover-inventory.json:28`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:423`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:426`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:18`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:19`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:27`
- `docs/architecture/pipeline-test-gate-manifest-lint-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-manifest-lint-parity-report.md:27`
- `docs/architecture/pipeline-test-gate-size-budget-cutover-inventory.json:13`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
