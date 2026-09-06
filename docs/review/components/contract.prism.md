# contract.prism

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/prism/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `ajv`, `ajv-formats`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `contracts/prism/v1/tests/contracts.test.mts`
- `skills/nova/plugins/prism-design/tests/archive.test.ts`
- `skills/prism/tests/directions.test.mts`
- `skills/prism/tests/domain.test.mts`
- `skills/prism/tests/e2e.test.mts`
- `skills/prism/tests/engine.test.mts`
- `skills/prism/tests/quality.test.mts`
- `skills/prism/tests/storage.test.mts`
- `skills/prism/tests/studio-adapter.test.mts`
- `tests/verification/contracts/check-prism-postgres-transactions.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/blueprint/04-evidence-matrix.md`
- `docs/implementation/prism-implementation-plan.md`
- `docs/implementation/prism-production-integration-plan.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `docs/blueprint/04-evidence-matrix.md:41`
- `docs/implementation/prism-implementation-plan.md:183`
- `docs/implementation/prism-implementation-plan.md:379`
- `docs/implementation/prism-implementation-plan.md:1060`
- `docs/implementation/prism-production-integration-plan.md:557`
- `package.json:10`
- `package.json:29`
- `packaging/runtime/package-ownership.json:24`
- `skills/nova/plugins/prism-design/package.json:7`
- `skills/nova/plugins/prism-design/src/archive.ts:1`
- `skills/nova/plugins/prism-design/tests/archive.test.ts:19`
- `skills/prism/directions/index.ts:2`
- `skills/prism/domain/index.ts:1`
- `skills/prism/engine/index.ts:2`
- `skills/prism/engine/index.ts:3`
- `skills/prism/engine/worker-binding.ts:5`
- `skills/prism/engine/worker-binding.ts:6`
- `skills/prism/engine/worker-envelope.ts:4`
- `skills/prism/evaluation/index.ts:2`
- `skills/prism/package.json:21`
- `skills/prism/package.json:33`
- `skills/prism/preferences/index.ts:109`
- `skills/prism/renderer/index.ts:1`
- `skills/prism/renderer/index.ts:2`
- `skills/prism/server/control.ts:17`
- `skills/prism/storage/index.ts:11`
- `skills/prism/studio/dev-fixture.ts:1`
- `skills/prism/studio/preview.ts:1`
- `skills/prism/studio/puck-adapter.ts:2`
- `skills/prism/tests/directions.test.mts:3`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
