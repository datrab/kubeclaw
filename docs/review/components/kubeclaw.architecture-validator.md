# kubeclaw.architecture-validator

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/architecture-validator`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:architecture` → `src/stage.ts#execute`; benötigte Capabilities: runtime.dispatch, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts`
- `skills/nova/plugins/architecture-validator/tests/package-boundary.test.mjs`
- `skills/nova/plugins/architecture-validator/tests/protocol.unit.test.ts`
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/architecture-validator/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:509`
- `docs/architecture/plugin-system-current-inventory.md:53`
- `docs/architecture/plugin-system-implementation-plan.md:754`
- `docs/architecture/plugin-system-phase9-changelog.md:42`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:68`
- `docs/site/extend/plugin-catalogue/README.md:18`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.architecture-validator.md:68`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:37`
- `packaging/runtime/roles/nova.json:40`
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts:12`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts:9`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts:12`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:83`
- `tests/verification/e2e/real-run-evidence.mjs:305`
- `tests/verification/e2e/real-run-evidence.mjs:387`
- `tests/verification/e2e/run-v2-production-pipeline.mts:268`
- `tests/verification/e2e/run-v2-production-pipeline.mts:270`
- `tests/verification/e2e/run-v2-production-pipeline.mts:304`
- `tests/verification/e2e/run-v2-production-pipeline.mts:564`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
