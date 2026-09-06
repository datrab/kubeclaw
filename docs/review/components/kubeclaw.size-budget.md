# kubeclaw.size-budget

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/size-budget`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:artifact` → `src/provider.js#provider`; benötigte Capabilities: 

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/size-budget/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-size-budget-baseline.mjs`
- `tests/verification/contracts/check-pipeline-size-budget-implementation.mts`
- `tests/verification/contracts/check-pipeline-size-budget-production.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-size-budget-implementation-final-audit.md`
- `docs/architecture/pipeline-test-gate-size-budget-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-size-budget-operator-guide.md`
- `docs/architecture/pipeline-test-gate-size-budget-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.size-budget.md`
- `skills/buster/plugins/size-budget/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:217`
- `contracts/pipeline-test-gate/v1/examples/size-budget-growth.json:4`
- `contracts/pipeline-test-gate/v1/examples/size-budget-growth.json:37`
- `contracts/pipeline-test-gate/v1/examples/size-budget-growth.json:43`
- `contracts/pipeline-test-gate/v1/examples/size-budget-tar.json:4`
- `contracts/pipeline-test-gate/v1/examples/size-budget-tar.json:25`
- `contracts/pipeline-test-gate/v1/suites/size-budget.v1.json:3`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:40`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:41`
- `docs/architecture/pipeline-test-gate-size-budget-baseline.json:4`
- `docs/architecture/pipeline-test-gate-size-budget-cutover-inventory.json:4`
- `docs/architecture/pipeline-test-gate-size-budget-cutover-inventory.json:10`
- `docs/architecture/pipeline-test-gate-size-budget-cutover-inventory.json:11`
- `docs/architecture/pipeline-test-gate-size-budget-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-size-budget-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-size-budget-documentation-manifest.json:8`
- `docs/architecture/pipeline-test-gate-size-budget-implementation-final-audit.md:8`
- `docs/architecture/pipeline-test-gate-size-budget-implementation-plan.md:7`
- `docs/architecture/pipeline-test-gate-size-budget-operator-guide.md:25`
- `docs/architecture/pipeline-test-gate-size-budget-operator-guide.md:72`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:4`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:11`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:12`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:17`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:19`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:21`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:23`
- `docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json:24`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
