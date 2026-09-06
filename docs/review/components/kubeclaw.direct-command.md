# kubeclaw.direct-command

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/direct-command`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:command` → `src/provider.js#provider`; benötigte Capabilities: command.execute

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/direct-command/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts`
- `tests/verification/contracts/check-pipeline-phase10-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase9-parity.mts`
- `tests/verification/contracts/check-pipeline-phase9-vertical.mts`
- `tests/verification/contracts/check-pipeline-size-budget-implementation.mts`
- `tests/verification/contracts/check-pipeline-size-budget-production.mts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/e2e/nova-a11y-production-preflight.mts`
- `tests/verification/e2e/nova-api-production-preflight.mts`
- `tests/verification/e2e/nova-e2e-production-preflight.mts`
- `tests/verification/e2e/nova-http-production-preflight.mts`
- `tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts`
- `tests/verification/e2e/nova-lighthouse-production-preflight.mts`
- `tests/verification/e2e/nova-security-production-preflight.mts`
- `tests/verification/e2e/nova-tailscale-production-preflight.mts`
- `tests/verification/e2e/nova-unit-production-preflight.mts`
- `tests/verification/e2e/nova-visual-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`
- `tests/verification/reliability/result-reservation.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-phase-10-final-audit.md`
- `docs/architecture/pipeline-test-gate-phase-10-plan.md`
- `docs/architecture/pipeline-test-gate-phase-8-plan.md`
- `docs/architecture/pipeline-test-gate-phase-9-final-audit.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-unit-operator-guide.md`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.direct-command.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/direct-command/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:117`
- `contracts/pipeline-test-gate/v1/examples/size-budget-growth.json:7`
- `contracts/pipeline-test-gate/v1/examples/size-budget-growth.json:25`
- `contracts/pipeline-test-gate/v1/examples/size-budget-tar.json:7`
- `contracts/pipeline-test-gate/v1/examples/unit-suite-blocking.json:7`
- `contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json:7`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:63`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:65`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:96`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:126`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:127`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:128`
- `docs/architecture/pipeline-test-gate-phase-10-final-audit.md:44`
- `docs/architecture/pipeline-test-gate-phase-10-final-audit.md:52`
- `docs/architecture/pipeline-test-gate-phase-10-plan.md:46`
- `docs/architecture/pipeline-test-gate-phase-8-plan.md:314`
- `docs/architecture/pipeline-test-gate-phase-8-plan.md:332`
- `docs/architecture/pipeline-test-gate-phase-9-final-audit.md:75`
- `docs/architecture/pipeline-test-gate-suite-migration-status.json:5`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md:17`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:27`
- `docs/architecture/pipeline-test-gate-unit-operator-guide.md:188`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md:93`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md:181`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md:215`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md:229`
- `docs/architecture/plugin-system-current-inventory.md:25`
- `docs/site/extend/plugin-catalogue/README.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.direct-command.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.direct-command.md:5`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
