# kubeclaw.telemetry-store

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/telemetry-store`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:telemetry` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/agent-observability/tests/live-function.test.ts`
- `skills/common/plugins/telemetry-store/tests/live-function.test.ts`
- `skills/common/plugins/telemetry-store/tests/package-boundary.test.mjs`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/telemetry-store/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:464`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:197`
- `docs/architecture/plugin-system-current-inventory.md:50`
- `docs/architecture/plugin-system-implementation-plan.md:656`
- `docs/architecture/plugin-system-phase5-capabilities.json:17`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:437`
- `docs/site/extend/plugin-catalogue/README.md:53`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.telemetry-store.md:67`
- `docs/site/reference/capabilities.md:43`
- `packaging/runtime/roles/buster.json:37`
- `packaging/runtime/roles/nova.json:37`
- `packaging/runtime/roles/prism.json:19`
- `skills/common/plugins/agent-observability/tests/live-function.test.ts:30`
- `skills/common/plugins/agent-observability/tests/live-function.test.ts:46`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:66`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:26`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:50`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:88`
- `tests/verification/e2e/run-v2-production-pipeline.mts:265`
- `tests/verification/e2e/run-v2-production-pipeline.mts:507`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
