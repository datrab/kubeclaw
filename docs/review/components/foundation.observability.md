# foundation.observability

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugin-runtime/foundation/observability`

Entrypoints: `package.json Subpath-Exports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts`
- `tests/verification/contracts/check-pipeline-observability-durable-delivery.mts`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/reliability/blob-budget.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/blueprint/04-evidence-matrix.md`
- `skills/common/plugin-runtime/foundation/observability/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:141`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:118`
- `docs/blueprint/04-evidence-matrix.md:43`
- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts:6`
- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts:11`
- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts:12`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts:17`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts:22`
- `tests/verification/contracts/check-pipeline-observability-durable-delivery.mts:6`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:10`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts:13`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts:14`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts:30`
- `tests/verification/reliability/blob-budget.test.mts:16`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
