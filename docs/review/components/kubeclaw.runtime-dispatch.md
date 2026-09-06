# kubeclaw.runtime-dispatch

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/runtime-dispatch`

Entrypoints: `src/adapter.ts#activate; src/openclaw-adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:runtime` → `src/adapter.ts#activate`; benötigte Capabilities: network.http, secrets.read
- `adapters:openclaw` → `src/openclaw-adapter.ts#activate`; benötigte Capabilities: git.repository.read, network.http, secrets.read

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `tiktoken`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/common/plugins/runtime-dispatch/tests/package-boundary.test.mjs`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/case-study/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/external-effect-recovery.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/developers/replacing-agent-runtime.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/runtime-dispatch/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:415`
- `docs/architecture/plugin-system-current-inventory.md:46`
- `docs/architecture/plugin-system-implementation-plan.md:729`
- `docs/architecture/plugin-system-phase5-capabilities.json:8`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:396`
- `docs/developers/replacing-agent-runtime.md:8`
- `docs/site/extend/plugin-catalogue/README.md:50`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:78`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:79`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:81`
- `docs/site/extend/plugin-catalogue/kubeclaw.runtime-dispatch.md:82`
- `docs/site/reference/capabilities.md:27`
- `docs/site/reference/capabilities.md:35`
- `docs/site/reference/capabilities.md:37`
- `docs/site/reference/capabilities.md:38`
- `packaging/runtime/roles/buster.json:35`
- `packaging/runtime/roles/nova.json:33`
- `packaging/runtime/roles/prism.json:18`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts:49`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts:59`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts:69`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:59`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:72`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:87`
- `skills/nova/plugins/case-study/tests/live-function.test.ts:12`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
