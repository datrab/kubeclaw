# kubeclaw.coverage-budget

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/coverage-budget`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:lcov` → `src/provider.js#provider`; benötigte Capabilities: 

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/coverage-budget/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-unit-operator-guide.md`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md`
- `skills/buster/plugins/coverage-budget/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:105`
- `contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json:30`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:65`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:96`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:130`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:29`
- `docs/architecture/pipeline-test-gate-unit-operator-guide.md:189`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md:264`
- `docs/architecture/plugin-system-current-inventory.md:24`
- `docs/site/extend/plugin-catalogue/README.md:62`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:33`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:74`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:75`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:76`
- `docs/site/extend/plugin-catalogue/kubeclaw.coverage-budget.md:77`
- `package.json:71`
- `packaging/runtime/roles/buster.json:39`
- `skills/nova/core/test-gates/resolver.ts:566`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts:56`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts:73`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
