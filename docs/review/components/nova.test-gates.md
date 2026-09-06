# nova.test-gates

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/core/test-gates`

Entrypoints: `skills/nova/core/src/index.ts / interne Imports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-legacy-retirement.mts`
- `tests/verification/contracts/check-pipeline-remote-process-restart.mts`
- `tests/verification/contracts/check-pipeline-remote-real-provider.mts`
- `tests/verification/contracts/check-pipeline-remote-result-import.mts`
- `tests/verification/e2e/manifest-lint-production.mts`
- `tests/verification/reliability/result-reservation.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/blueprint/04-evidence-matrix.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `docs/DOCUMENTATION_TOPIC_MAP.md:6`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:15`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:18`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:25`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:26`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:64`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:81`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:82`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:83`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:84`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:85`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:86`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:87`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:88`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:91`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:97`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:98`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:100`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:103`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:105`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:106`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:121`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:122`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:123`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:124`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:125`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:129`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:138`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:139`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:140`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
