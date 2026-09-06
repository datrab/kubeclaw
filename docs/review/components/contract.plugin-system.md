# contract.plugin-system

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugin-runtime/contracts/plugin-system/v2`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/architecture/plugin-system-vision.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/site/extend/README.md`
- `docs/site/extend/first-plugin.md`
- `skills/common/plugin-runtime/contracts/plugin-system/v2/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `docs/architecture/pipeline-test-gate-decision-ledger.json:66`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:110`
- `docs/architecture/plugin-system-vision.md:572`
- `docs/blueprint/04-evidence-matrix.md:23`
- `docs/site/extend/README.md:6`
- `docs/site/extend/first-plugin.md:6`
- `packaging/runtime/package-ownership.json:11`
- `scripts/docs-blueprint-generate.mjs:183`
- `scripts/docs-publication.mjs:349`
- `scripts/generate-plugin-sdk-types.mjs:5`
- `scripts/generate-plugin-sdk-types.mjs:20`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:6`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
