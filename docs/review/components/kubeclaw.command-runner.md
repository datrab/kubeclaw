# kubeclaw.command-runner

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/command-runner`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:command` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/command-runner/tests/live-function.test.ts`
- `skills/common/plugins/command-runner/tests/package-boundary.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/command-runner/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:306`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:126`
- `docs/architecture/plugin-system-current-inventory.md:38`
- `docs/architecture/plugin-system-implementation-plan.md:638`
- `docs/architecture/plugin-system-phase5-capabilities.json:20`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:296`
- `docs/site/extend/plugin-catalogue/README.md:41`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.command-runner.md:67`
- `docs/site/reference/capabilities.md:23`
- `package.json:71`
- `packaging/runtime/roles/buster.json:32`
- `skills/buster/engine/package.json:14`
- `skills/buster/engine/test-gates/direct-command-runtime.ts:4`
- `tests/verification/e2e/run-v2-production-pipeline.mts:254`
- `tests/verification/e2e/run-v2-production-pipeline.mts:448`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
