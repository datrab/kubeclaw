# kubeclaw.git-workspace

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/git-workspace`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:git` → `src/adapter.ts#activate`; benötigte Capabilities: 

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/git-workspace/tests/live-function.test.ts`
- `skills/common/plugins/git-workspace/tests/package-boundary.test.mjs`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugins/git-workspace/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:319`
- `docs/architecture/plugin-system-current-inventory.md:39`
- `docs/architecture/plugin-system-implementation-plan.md:674`
- `docs/architecture/plugin-system-phase5-capabilities.json:10`
- `docs/architecture/plugin-system-phase5-capabilities.json:11`
- `docs/architecture/plugin-system-phase5-capabilities.json:12`
- `docs/architecture/plugin-system-phase5-capabilities.json:13`
- `docs/architecture/plugin-system-phase5-capabilities.json:14`
- `docs/architecture/plugin-system-phase9-changelog.md:180`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:310`
- `docs/site/extend/plugin-catalogue/README.md:42`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.git-workspace.md:67`
- `docs/site/reference/capabilities.md:25`
- `docs/site/reference/capabilities.md:26`
- `docs/site/reference/capabilities.md:28`
- `docs/site/reference/capabilities.md:29`
- `docs/site/reference/capabilities.md:30`
- `package.json:206`
- `packaging/runtime/roles/nova.json:27`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts:41`
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts:56`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts:54`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
