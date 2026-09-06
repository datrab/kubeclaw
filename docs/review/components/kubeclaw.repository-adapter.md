# kubeclaw.repository-adapter

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/repository-adapter`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:repository` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts`
- `skills/nova/plugins/repository-adapter/tests/live-function.test.ts`
- `skills/nova/plugins/repository-adapter/tests/package-boundary.test.mjs`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`
- `tests/verification/contracts/check-plugin-system-v2-e2e.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/review-candidate.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/echo-review-phase-3-design.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/repository-adapter/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:667`
- `docs/architecture/echo-review-phase-3-design.md:27`
- `docs/architecture/plugin-system-current-inventory.md:66`
- `docs/architecture/plugin-system-implementation-plan.md:634`
- `docs/architecture/plugin-system-phase5-capabilities.json:9`
- `docs/architecture/plugin-system-phase9-changelog.md:109`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:384`
- `docs/site/extend/plugin-catalogue/README.md:49`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.repository-adapter.md:67`
- `docs/site/reference/capabilities.md:27`
- `packaging/runtime/roles/nova.json:53`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:227`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:265`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:331`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:389`
- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts:38`
- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts:57`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts:38`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts:57`
- `skills/nova/plugins/review/tests/live-function.test.ts:198`
- `skills/nova/plugins/review/tests/live-function.test.ts:203`
- `skills/nova/plugins/review/tests/live-function.test.ts:221`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
