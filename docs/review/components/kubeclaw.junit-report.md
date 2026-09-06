# kubeclaw.junit-report

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/junit-report-adapter`

Entrypoints: `src/adapter.js#adapt`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `reportAdapters:junit` → `src/adapter.js#adapt`; benötigte Capabilities: 

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs`
- `skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts`
- `tests/verification/contracts/check-pipeline-phase9-comparison.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-phase-6-d-audit.md`
- `docs/architecture/pipeline-test-gate-unit-operator-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md`
- `skills/buster/plugins/junit-report-adapter/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:141`
- `docs/architecture/pipeline-test-gate-phase-6-d-audit.md:15`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:28`
- `docs/architecture/pipeline-test-gate-unit-operator-guide.md:190`
- `docs/architecture/plugin-system-current-inventory.md:27`
- `docs/site/extend/plugin-catalogue/README.md:76`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.junit-report.md:67`
- `package.json:63`
- `packaging/runtime/roles/buster.json:41`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts:28`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts:65`
- `tests/verification/contracts/check-pipeline-phase9-comparison.mts:5`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
