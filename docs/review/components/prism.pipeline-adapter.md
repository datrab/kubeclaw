# prism.pipeline-adapter

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/prism/pipeline-adapter`

Entrypoints: `pipeline-adapter/index.ts bzw. control/session.ts`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-legacy-retirement.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/implementation/prism-implementation-plan.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/architecture/pipeline-test-gate-visual-cutover-inventory.json:23`
- `docs/implementation/prism-implementation-plan.md:220`
- `docs/implementation/prism/completion-status.json:15`
- `docs/implementation/prism/integration-traceability.json:12`
- `docs/implementation/prism/integration-traceability.json:13`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts:26`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
