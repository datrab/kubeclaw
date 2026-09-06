# contract.worker

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/pipeline-worker-core/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `ajv`, `ajv-formats`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/prism/tests/engine.test.mts`
- `tests/verification/contracts/check-pipeline-observability-durable-attempts.mts`
- `tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-pipeline-worker-attempt-executor.mts`
- `tests/verification/contracts/check-pipeline-worker-core-contracts.mts`
- `tests/verification/contracts/check-pipeline-worker-local-runtime.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `contracts/pipeline-worker-core/v1/README.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/security/worker-trust.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:71`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:108`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:109`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:110`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:111`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:112`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:113`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:114`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:115`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:116`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:278`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:279`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:280`
- `docs/blueprint/04-evidence-matrix.md:33`
- `docs/blueprint/05-decision-record-catalogue.md:26`
- `docs/security/worker-trust.md:488`
- `package.json:8`
- `package.json:139`
- `packaging/runtime/package-ownership.json:23`
- `scripts/docs-blueprint-generate.mjs:138`
- `skills/buster/engine/package.json:13`
- `skills/buster/engine/test-gates/runner.ts:40`
- `skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts:7`
- `skills/common/plugin-runtime/foundation/observability/durable-attempts.ts:20`
- `skills/common/plugin-runtime/foundation/package.json:17`
- `skills/nova/core/observability/reconciler.ts:4`
- `skills/nova/core/package.json:13`
- `skills/prism/engine/worker-binding.ts:4`
- `skills/prism/engine/worker-envelope.ts:2`
- `skills/prism/package.json:31`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
