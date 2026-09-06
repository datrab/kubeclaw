# kubeclaw.buster-quality-gate

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/buster-quality-gate`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:quality` → `src/stage.ts#execute`; benötigte Capabilities: test.plan.execute, runtime.dispatch, artifacts.write, artifacts.read

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `@kubeclaw/pipeline-test-gate-contract`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/package-boundary.test.mjs`
- `skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts`
- `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `tests/verification/contracts/check-pipeline-phase10-cutover.mts`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/buster-quality-gate/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:533`
- `docs/architecture/plugin-system-current-inventory.md:55`
- `docs/architecture/plugin-system-implementation-plan.md:801`
- `docs/architecture/plugin-system-phase9-changelog.md:143`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:102`
- `docs/site/extend/plugin-catalogue/README.md:20`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:68`
- `docs/site/extend/plugin-catalogue/kubeclaw.buster-quality-gate.md:69`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:37`
- `docs/site/reference/capabilities.md:44`
- `package.json:74`
- `packaging/runtime/roles/nova.json:42`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts:56`
- `skills/nova/plugins/project-summary/src/summary.ts:49`
- `skills/nova/plugins/project-summary/src/summary.ts:50`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts:10`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs:35`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs:36`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs:46`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
