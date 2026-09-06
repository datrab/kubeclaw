# kubeclaw.notification-observer

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/notification-observer`

Entrypoints: `src/observer.ts#deliverPreview; src/observer.ts#observe`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `observers:notifications` → `src/observer.ts#observe`; benötigte Capabilities: operator.request
- `observers:preview-delivery` → `src/observer.ts#deliverPreview`; benötigte Capabilities: operator.request

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/notification-observer/tests/live-function.test.ts`
- `skills/common/plugins/notification-observer/tests/observer.unit.test.mjs`
- `skills/common/plugins/notification-observer/tests/package-boundary.test.mjs`
- `skills/common/plugins/notification-observer/tests/parity.test.ts`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase10-observer-assessment.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/operators/plugin-observers.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/notification-observer/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:343`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:183`
- `docs/architecture/plugin-system-current-inventory.md:41`
- `docs/architecture/plugin-system-implementation-plan.md:749`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:48`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:61`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:71`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:503`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:517`
- `docs/operators/plugin-observers.md:25`
- `docs/site/extend/plugin-catalogue/README.md:35`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:78`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:79`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:81`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:82`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:83`
- `docs/site/extend/plugin-catalogue/kubeclaw.notification-observer.md:84`
- `docs/site/reference/capabilities.md:36`
- `packaging/runtime/roles/nova.json:29`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts:93`
- `skills/common/plugins/operator-messaging/tests/live-function.test.ts:100`
- `tests/verification/e2e/real-run-evidence.mjs:314`
- `tests/verification/e2e/run-v2-production-pipeline.mts:333`
- `tests/verification/e2e/run-v2-production-pipeline.mts:516`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
