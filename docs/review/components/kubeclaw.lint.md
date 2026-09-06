# kubeclaw.lint

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/lint`

Entrypoints: `src/adapter.ts#activate; src/stage.ts#executeFull; src/stage.ts#executePreCheck`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:pre-check` → `src/stage.ts#executePreCheck`; benötigte Capabilities: lint.execute, artifacts.write, artifacts.read
- `stages:full` → `src/stage.ts#executeFull`; benötigte Capabilities: lint.execute, artifacts.write, artifacts.read
- `adapters:executor` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `yaml`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/lint/tests/adapter-boundary.test.mjs`
- `skills/nova/plugins/lint/tests/discovery.test.mjs`
- `skills/nova/plugins/lint/tests/eslint-discipline.test.mjs`
- `skills/nova/plugins/lint/tests/live-function.test.ts`
- `skills/nova/plugins/lint/tests/package-boundary.test.mjs`
- `skills/nova/plugins/lint/tests/stage.unit.test.mjs`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-comparison.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-implementation.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-parity.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-production.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-vertical.mts`
- `tests/verification/contracts/check-pipeline-security-cutover.mts`
- `tests/verification/contracts/check-pipeline-security-parity.mts`
- `tests/verification/contracts/check-pipeline-test-suite-resolver.mts`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/contracts/check-plugin-system-v2-e2e.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/e2e/durable-evidence.test.mjs`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/lint-candidate.test.mts`
- `tests/verification/reliability/repair-evidence.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-manifest-lint-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/developers/migrating-pipeline-plugins.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/lint/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/eslint.config.mjs:30`
- `charts/kubeclaw/files/config/eslint.config.mjs:44`
- `charts/kubeclaw/files/config/knip.json:594`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:20`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:45`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:24`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:25`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:26`
- `docs/architecture/pipeline-test-gate-manifest-lint-user-guide.md:18`
- `docs/architecture/plugin-system-current-inventory.md:60`
- `docs/architecture/plugin-system-implementation-plan.md:613`
- `docs/architecture/plugin-system-phase5-capabilities.json:22`
- `docs/architecture/plugin-system-phase9-changelog.md:44`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:178`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:194`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:326`
- `docs/developers/migrating-pipeline-plugins.md:390`
- `docs/site/extend/plugin-catalogue/README.md:25`
- `docs/site/extend/plugin-catalogue/README.md:43`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:33`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:30`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:35`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:49`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:86`
- `docs/site/extend/plugin-catalogue/kubeclaw.lint.md:93`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
