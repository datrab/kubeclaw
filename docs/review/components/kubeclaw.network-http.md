# kubeclaw.network-http

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/network-http`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:http` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/network-http/tests/live-function.test.ts`
- `skills/common/plugins/network-http/tests/package-boundary.test.mjs`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/common/plugins/transport-publisher/tests/live-function.test.ts`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/case-study/tests/live-function.test.ts`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/external-effect-recovery.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/network-http/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:331`
- `docs/architecture/plugin-system-current-inventory.md:40`
- `docs/architecture/plugin-system-implementation-plan.md:651`
- `docs/architecture/plugin-system-phase5-capabilities.json:19`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:340`
- `docs/site/extend/plugin-catalogue/README.md:44`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.network-http.md:67`
- `docs/site/reference/capabilities.md:35`
- `packaging/runtime/roles/buster.json:33`
- `packaging/runtime/roles/nova.json:28`
- `packaging/runtime/roles/prism.json:18`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts:47`
- `skills/common/plugins/notification-observer/tests/live-function.test.ts:74`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts:96`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts:149`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:230`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:257`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:334`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:381`
- `skills/common/plugins/transport-publisher/tests/live-function.test.ts:99`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts:50`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts:72`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
