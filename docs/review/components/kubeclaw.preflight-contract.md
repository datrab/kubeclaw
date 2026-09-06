# kubeclaw.preflight-contract

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/preflight-contract`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:validate` → `src/stage.ts#execute`; benötigte Capabilities: git.repository.read, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/preflight-contract/tests/declarations.unit.test.mjs`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts`
- `skills/nova/plugins/preflight-contract/tests/package-boundary.test.mjs`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/preflight-contract/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:619`
- `docs/architecture/plugin-system-current-inventory.md:62`
- `docs/architecture/plugin-system-implementation-plan.md:624`
- `docs/architecture/plugin-system-phase9-changelog.md:43`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:221`
- `docs/site/extend/plugin-catalogue/README.md:27`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.preflight-contract.md:68`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:27`
- `packaging/runtime/roles/nova.json:49`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts:31`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts:32`
- `tests/verification/contracts/quality-provider-runtime.mts:68`
- `tests/verification/contracts/quality-provider-runtime.mts:81`
- `tests/verification/contracts/quality-provider-runtime.mts:83`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
