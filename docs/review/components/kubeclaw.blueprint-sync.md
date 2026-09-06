# kubeclaw.blueprint-sync

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/blueprint-sync`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:sync` → `src/stage.ts#execute`; benötigte Capabilities: git.sync, git.commit, state.append, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts`
- `skills/nova/plugins/blueprint-sync/tests/package-boundary.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/blueprint-sync/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:521`
- `docs/architecture/plugin-system-current-inventory.md:54`
- `docs/architecture/plugin-system-implementation-plan.md:759`
- `docs/architecture/plugin-system-phase9-changelog.md:108`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:87`
- `docs/site/extend/plugin-catalogue/README.md:19`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.blueprint-sync.md:67`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:25`
- `docs/site/reference/capabilities.md:28`
- `docs/site/reference/capabilities.md:41`
- `packaging/runtime/roles/nova.json:41`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
