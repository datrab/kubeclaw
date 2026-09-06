# kubeclaw.operator-messaging

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/operator-messaging`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:operator` → `src/adapter.ts#activate`; benötigte Capabilities: network.http, secrets.read

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/notification-observer/tests/live-function.test.ts`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts`
- `skills/common/plugins/operator-messaging/tests/package-boundary.test.mjs`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/operator-messaging/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:379`
- `docs/architecture/plugin-system-current-inventory.md:44`
- `docs/architecture/plugin-system-implementation-plan.md:697`
- `docs/architecture/plugin-system-phase5-capabilities.json:16`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:367`
- `docs/site/extend/plugin-catalogue/README.md:46`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.operator-messaging.md:67`
- `docs/site/reference/capabilities.md:35`
- `docs/site/reference/capabilities.md:36`
- `docs/site/reference/capabilities.md:38`
- `packaging/runtime/roles/nova.json:31`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts:46`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts:57`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts:70`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts:67`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts:80`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts:96`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs:72`
- `tests/verification/e2e/run-v2-production-pipeline.mts:261`
- `tests/verification/e2e/run-v2-production-pipeline.mts:329`
- `tests/verification/e2e/run-v2-production-pipeline.mts:486`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
