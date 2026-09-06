# contract.observability

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/pipeline-observability/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `ajv`, `ajv-formats`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts`
- `tests/verification/contracts/check-pipeline-observability-contracts.mts`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts`
- `tests/verification/contracts/check-pipeline-observability-durable-delivery.mts`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `contracts/pipeline-observability/v1/README.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `contracts/pipeline-test-gate/v1/package.json:19`
- `contracts/pipeline-test-gate/v1/src/remote.ts:2`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:118`
- `docs/blueprint/04-evidence-matrix.md:43`
- `docs/blueprint/05-decision-record-catalogue.md:39`
- `package.json:9`
- `packaging/runtime/package-ownership.json:25`
- `skills/buster/engine/package.json:11`
- `skills/buster/engine/test-gates/remote-plan-service.ts:22`
- `skills/buster/engine/test-gates/runner.ts:53`
- `skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts:6`
- `skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:15`
- `skills/common/plugin-runtime/foundation/observability/durable-delivery.ts:14`
- `skills/common/plugin-runtime/foundation/observability/durable-records.ts:4`
- `skills/common/plugin-runtime/foundation/package.json:16`
- `skills/nova/core/observability/reconciler.ts:3`
- `skills/nova/core/package.json:11`
- `tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts:5`
- `tests/verification/contracts/check-pipeline-observability-contracts.mts:6`
- `tests/verification/contracts/check-pipeline-observability-contracts.mts:8`
- `tests/verification/contracts/check-pipeline-observability-contracts.mts:50`
- `tests/verification/contracts/check-pipeline-observability-contracts.mts:51`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts:12`
- `tests/verification/contracts/check-pipeline-observability-durable-delivery.mts:5`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts:9`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs:31`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
