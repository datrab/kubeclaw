# prism.storage

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/prism/storage`

Entrypoints: `storage/index.ts bzw. control/session.ts`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-deploy-prism-command.mts`
- `tests/verification/contracts/check-prism-postgres-transactions.mts`

Dokumentationsstatus: fehlend (Zuordnung offen).

- Noch keine direkte Zuordnung.

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/implementation/prism/completion-status.json:7`
- `docs/implementation/prism/integration-traceability.json:9`
- `docs/implementation/prism/integration-traceability.json:16`
- `tests/verification/contracts/check-deploy-prism-command.mts:23`
- `tests/verification/contracts/check-prism-postgres-transactions.mts:4`
- `tests/verification/contracts/check-prism-postgres-transactions.mts:11`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
