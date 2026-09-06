# kubeclaw.artifact-store

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/artifact-store`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:artifact-store` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `scripts/tests/repository-review-operations.test.mjs`
- `skills/common/plugins/agent-observability/tests/live-function.test.ts`
- `skills/common/plugins/artifact-store/tests/live-function.test.ts`
- `skills/common/plugins/artifact-store/tests/package-boundary.test.mjs`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/nova/plugins/architecture-validator/tests/live-function.test.ts`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/case-study/tests/live-function.test.ts`
- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/lint/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/preflight-contract/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-manifest-lint-vertical.mts`
- `tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`
- `tests/verification/contracts/check-plugin-system-v2-e2e.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/durable-evidence.test.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/repair-evidence.test.mts`
- `tests/verification/reliability/review-candidate.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/implementation/prism/phase-0-audit.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/artifact-store/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:294`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:141`
- `docs/architecture/plugin-system-current-inventory.md:37`
- `docs/architecture/plugin-system-implementation-plan.md:629`
- `docs/architecture/plugin-system-phase5-capabilities.json:6`
- `docs/architecture/plugin-system-phase5-capabilities.json:7`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:283`
- `docs/implementation/prism/phase-0-audit.md:115`
- `docs/site/extend/plugin-catalogue/README.md:40`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.artifact-store.md:67`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:18`
- `packaging/runtime/roles/buster.json:25`
- `packaging/runtime/roles/nova.json:26`
- `packaging/runtime/roles/prism.json:17`
- `scripts/repository-review-status.mjs:90`
- `scripts/tests/repository-review-operations.test.mjs:34`
- `skills/common/plugins/agent-observability/tests/live-function.test.ts:31`
- `skills/common/plugins/agent-observability/tests/live-function.test.ts:47`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:228`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:229`
- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts:269`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
