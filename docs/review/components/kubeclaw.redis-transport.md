# kubeclaw.redis-transport

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/redis-transport`

Entrypoints: `src/adapter.ts#activatePublisher; src/adapter.ts#activateTelemetry`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:publisher` → `src/adapter.ts#activatePublisher`; benötigte Capabilities: secrets.read
- `adapters:telemetry` → `src/adapter.ts#activateTelemetry`; benötigte Capabilities: secrets.read

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/redis-transport/tests/live-function.test.ts`
- `skills/common/plugins/redis-transport/tests/package-boundary.test.ts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/redis-transport/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:403`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:211`
- `docs/architecture/plugin-system-current-inventory.md:45`
- `docs/architecture/plugin-system-phase9-changelog.md:168`
- `docs/architecture/plugin-system-phase9-changelog.md:181`
- `docs/site/extend/plugin-catalogue/README.md:47`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:78`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:79`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:81`
- `docs/site/extend/plugin-catalogue/kubeclaw.redis-transport.md:82`
- `docs/site/reference/capabilities.md:38`
- `docs/site/reference/capabilities.md:43`
- `docs/site/reference/capabilities.md:45`
- `packaging/runtime/roles/nova.json:32`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
