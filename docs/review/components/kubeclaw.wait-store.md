# kubeclaw.wait-store

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/wait-store`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:waits` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/wait-store/tests/live-function.test.ts`
- `skills/common/plugins/wait-store/tests/package-boundary.test.mjs`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/wait-store/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:488`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:169`
- `docs/architecture/plugin-system-current-inventory.md:52`
- `docs/architecture/plugin-system-implementation-plan.md:713`
- `docs/architecture/plugin-system-phase5-capabilities.json:15`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:462`
- `docs/site/extend/plugin-catalogue/README.md:55`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.wait-store.md:67`
- `docs/site/reference/capabilities.md:40`
- `packaging/runtime/roles/nova.json:39`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts:68`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts:105`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:65`
- `tests/verification/e2e/run-v2-production-pipeline.mts:264`
- `tests/verification/e2e/run-v2-production-pipeline.mts:510`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
