# kubeclaw.human-approval

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/human-approval`

Entrypoints: `src/architecture-approval.ts#execute; src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:approval` → `src/stage.ts#execute`; benötigte Capabilities: operator.request, signal.wait
- `stages:architecture-approval` → `src/architecture-approval.ts#execute`; benötigte Capabilities: artifacts.read, operator.request, signal.wait

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/human-approval/tests/approval.unit.test.mjs`
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts`
- `skills/nova/plugins/human-approval/tests/live-function.test.ts`
- `skills/nova/plugins/human-approval/tests/package-boundary.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/human-approval/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:569`
- `docs/architecture/plugin-system-current-inventory.md:58`
- `docs/architecture/plugin-system-implementation-plan.md:688`
- `docs/architecture/plugin-system-phase9-changelog.md:73`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:146`
- `docs/site/extend/plugin-catalogue/README.md:23`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:78`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:79`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:81`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:82`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:83`
- `docs/site/extend/plugin-catalogue/kubeclaw.human-approval.md:84`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:36`
- `docs/site/reference/capabilities.md:40`
- `packaging/runtime/roles/nova.json:45`
- `skills/nova/plugins/architecture-validator/README.md:10`
- `tests/verification/e2e/run-v2-production-pipeline.mts:296`
- `tests/verification/e2e/run-v2-production-pipeline.mts:303`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
