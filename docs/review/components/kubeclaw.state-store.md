# kubeclaw.state-store

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/state-store`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:state` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/state-store/tests/live-function.test.ts`
- `skills/common/plugins/state-store/tests/package-boundary.test.mjs`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/state-store/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:440`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:155`
- `docs/architecture/plugin-system-current-inventory.md:48`
- `docs/architecture/plugin-system-implementation-plan.md:645`
- `docs/architecture/plugin-system-phase5-capabilities.json:4`
- `docs/architecture/plugin-system-phase5-capabilities.json:5`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:424`
- `docs/site/extend/plugin-catalogue/README.md:52`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.state-store.md:67`
- `docs/site/reference/capabilities.md:41`
- `docs/site/reference/capabilities.md:42`
- `packaging/runtime/roles/nova.json:35`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts:42`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts:61`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:64`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs:178`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
