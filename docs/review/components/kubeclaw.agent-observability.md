# kubeclaw.agent-observability

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/agent-observability`

Entrypoints: `src/observers.ts#ingest; src/observers.ts#recordEvidence`.

Nutzung: Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `observers:ingester` → `src/observers.ts#ingest`; benötigte Capabilities: telemetry.emit
- `observers:evidence` → `src/observers.ts#recordEvidence`; benötigte Capabilities: artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/agent-observability/tests/live-function.test.ts`
- `skills/common/plugins/agent-observability/tests/observers.unit.test.mjs`
- `skills/common/plugins/agent-observability/tests/package-boundary.test.mjs`
- `skills/common/plugins/agent-observability/tests/parity.test.ts`
- `tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase10-observer-assessment.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/agent-observability/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:282`
- `docs/architecture/plugin-system-current-inventory.md:36`
- `docs/architecture/plugin-system-implementation-plan.md:744`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:26`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:37`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:480`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:491`
- `docs/blueprint/04-evidence-matrix.md:42`
- `docs/site/extend/plugin-catalogue/README.md:34`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:78`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:79`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:81`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:82`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:83`
- `docs/site/extend/plugin-catalogue/kubeclaw.agent-observability.md:84`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:43`
- `packaging/runtime/roles/buster.json:24`
- `packaging/runtime/roles/nova.json:25`
- `packaging/runtime/roles/prism.json:17`
- `tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs:188`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
