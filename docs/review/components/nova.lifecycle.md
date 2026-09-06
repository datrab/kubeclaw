# nova.lifecycle

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/core/lifecycle`

Entrypoints: `skills/nova/core/src/index.ts / interne Imports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs`
- `tests/verification/reliability/lifecycle.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/lifecycle-and-state.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/pipeline/architecture.md`
- `docs/site/understand/request-to-result.md`
- `docs/site/use/recovery.md`
- `skills/nova/core/lifecycle/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `docs/architecture/lifecycle-and-state.md:4`
- `docs/blueprint/04-evidence-matrix.md:22`
- `docs/blueprint/05-decision-record-catalogue.md:25`
- `docs/pipeline/architecture.md:25`
- `docs/site/understand/request-to-result.md:6`
- `docs/site/use/recovery.md:6`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:24`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:25`
- `tests/verification/reliability/lifecycle.test.mts:8`
- `tests/verification/reliability/lifecycle.test.mts:9`
- `tests/verification/reliability/lifecycle.test.mts:10`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
