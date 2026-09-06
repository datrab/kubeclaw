# kubeclaw.project-summary

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/project-summary`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:summary` → `src/stage.ts#execute`; benötigte Capabilities: artifacts.read, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `@kubeclaw/pipeline-test-gate-contract`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/package-boundary.test.mjs`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-real-pipeline-e2e.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/project-summary/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:643`
- `docs/architecture/plugin-system-current-inventory.md:64`
- `docs/architecture/plugin-system-implementation-plan.md:780`
- `docs/architecture/plugin-system-phase9-changelog.md:76`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:234`
- `docs/site/extend/plugin-catalogue/README.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.project-summary.md:68`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:18`
- `packaging/runtime/roles/nova.json:51`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs:170`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs:173`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs:174`
- `tests/verification/e2e/real-run-evidence.mjs:305`
- `tests/verification/e2e/real-run-evidence.mjs:390`
- `tests/verification/e2e/run-real-pipeline-e2e.test.mjs:234`
- `tests/verification/e2e/run-v2-production-pipeline.mts:317`
- `tests/verification/e2e/run-v2-production-pipeline.mts:319`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
