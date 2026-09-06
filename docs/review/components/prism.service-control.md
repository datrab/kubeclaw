# prism.service-control

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/prism/server/control.ts`

Entrypoints: `skills/prism/server/control.ts`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-deploy-prism-command.mts`

Dokumentationsstatus: fehlend (Zuordnung offen).

- Noch keine direkte Zuordnung.

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/implementation/prism/completion-status.json:8`
- `docs/implementation/prism/completion-status.json:11`
- `docs/implementation/prism/completion-status.json:14`
- `docs/implementation/prism/integration-traceability.json:7`
- `docs/implementation/prism/integration-traceability.json:8`
- `docs/implementation/prism/integration-traceability.json:16`
- `docs/implementation/prism/integration-traceability.json:17`
- `docs/implementation/prism/integration-traceability.json:19`
- `tests/verification/contracts/check-deploy-prism-command.mts:20`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
