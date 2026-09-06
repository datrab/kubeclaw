# kubeclaw.implementation-agent

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/implementation-agent`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:implementation` → `src/stage.ts#execute`; benötigte Capabilities: runtime.dispatch, git.workspace.create, git.workspace.remove, git.commit, git.merge, artifacts.read, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/package-boundary.test.mjs`
- `skills/nova/plugins/implementation-agent/tests/protocol.test.ts`
- `skills/nova/plugins/lint/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `tests/verification/contracts/check-pipeline-manifest-lint-vertical.mts`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/repair-evidence.test.mts`
- `tests/verification/reliability/review-candidate.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/blueprint/01-platform-inventory.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/implementation-agent/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:582`
- `docs/architecture/plugin-system-current-inventory.md:59`
- `docs/architecture/plugin-system-implementation-plan.md:766`
- `docs/architecture/plugin-system-phase9-changelog.md:107`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:160`
- `docs/blueprint/01-platform-inventory.md:31`
- `docs/blueprint/04-evidence-matrix.md:38`
- `docs/site/extend/plugin-catalogue/README.md:24`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.implementation-agent.md:68`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:25`
- `docs/site/reference/capabilities.md:26`
- `docs/site/reference/capabilities.md:29`
- `docs/site/reference/capabilities.md:30`
- `docs/site/reference/capabilities.md:37`
- `packaging/runtime/roles/nova.json:46`
- `scripts/docs-blueprint-generate.mjs:140`
- `skills/common/plugin-runtime/sdk/src/source-revision.ts:7`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:68`
- `skills/nova/plugins/lint/tests/live-function.test.ts:95`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
