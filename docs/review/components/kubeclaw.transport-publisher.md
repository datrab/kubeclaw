# kubeclaw.transport-publisher

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/transport-publisher`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:publisher` → `src/adapter.ts#activate`; benötigte Capabilities: network.http, secrets.read

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/transport-publisher/tests/config-validation.test.mjs`
- `skills/common/plugins/transport-publisher/tests/live-function.test.ts`
- `skills/common/plugins/transport-publisher/tests/package-boundary.test.mjs`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/transport-publisher/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:476`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:183`
- `docs/architecture/plugin-system-current-inventory.md:51`
- `docs/architecture/plugin-system-implementation-plan.md:705`
- `docs/architecture/plugin-system-phase5-capabilities.json:23`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:449`
- `docs/site/extend/plugin-catalogue/README.md:54`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.transport-publisher.md:68`
- `docs/site/reference/capabilities.md:35`
- `docs/site/reference/capabilities.md:38`
- `docs/site/reference/capabilities.md:45`
- `packaging/runtime/roles/nova.json:38`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:73`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
