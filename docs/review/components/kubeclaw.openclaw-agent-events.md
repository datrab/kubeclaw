# kubeclaw.openclaw-agent-events

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/openclaw-agent-events`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:source` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/agent-observability/tests/live-function.test.ts`
- `skills/common/plugins/agent-observability/tests/observers.unit.test.mjs`
- `skills/common/plugins/agent-observability/tests/parity.test.ts`
- `skills/common/plugins/openclaw-agent-events/tests/live-function.test.ts`
- `skills/common/plugins/openclaw-agent-events/tests/package-boundary.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/developers/hooks-and-plugins.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/openclaw-agent-events/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:355`
- `docs/architecture/plugin-system-current-inventory.md:42`
- `docs/architecture/plugin-system-implementation-plan.md:736`
- `docs/architecture/plugin-system-phase5-capabilities.json:24`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:352`
- `docs/blueprint/04-evidence-matrix.md:42`
- `docs/developers/hooks-and-plugins.md:8`
- `docs/site/extend/plugin-catalogue/README.md:45`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.openclaw-agent-events.md:67`
- `docs/site/reference/capabilities.md:16`
- `packaging/runtime/roles/nova.json:30`
- `skills/common/plugins/agent-observability/plugin.json:12`
- `skills/common/plugins/agent-observability/plugin.json:13`
- `skills/common/plugins/agent-observability/plugin.json:14`
- `skills/common/plugins/agent-observability/plugin.json:15`
- `skills/common/plugins/agent-observability/plugin.json:16`
- `skills/common/plugins/agent-observability/plugin.json:17`
- `skills/common/plugins/agent-observability/plugin.json:18`
- `skills/common/plugins/agent-observability/plugin.json:19`
- `skills/common/plugins/agent-observability/plugin.json:20`
- `skills/common/plugins/agent-observability/plugin.json:21`
- `skills/common/plugins/agent-observability/plugin.json:22`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
