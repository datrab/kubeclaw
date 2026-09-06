# nova.telemetry

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/core/telemetry`

Entrypoints: `skills/nova/core/src/index.ts / interne Imports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`
- `tests/verification/reliability/audit-projection.test.mts`
- `tests/verification/reliability/observer-recovery.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `skills/nova/core/telemetry/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:29`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts:7`
- `tests/verification/reliability/audit-projection.test.mts:7`
- `tests/verification/reliability/observer-recovery.test.mts:7`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
