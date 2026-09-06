# kubeclaw.prism-design

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/prism-design`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:design` → `src/stage.ts#execute`; benötigte Capabilities: runtime.dispatch, artifacts.read, artifacts.write, operator.request, signal.wait

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `@kubeclaw/prism-contracts-v1`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/prism-design/tests/archive.test.ts`
- `skills/nova/plugins/prism-design/tests/live-function.test.ts`
- `skills/nova/plugins/prism-design/tests/wait.test.ts`
- `skills/prism/tests/e2e.test.mts`
- `skills/prism/tests/engine.test.mts`
- `tests/verification/contracts/check-prism-nova-stage.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/prism-design-engine-contract-v1.md`
- `docs/implementation/prism-production-integration-plan.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/prism-design/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:631`
- `contracts/prism/v1/src/index.ts:26`
- `docs/architecture/plugin-system-current-inventory.md:63`
- `docs/architecture/prism-design-engine-contract-v1.md:31`
- `docs/architecture/prism-design-engine-contract-v1.md:57`
- `docs/implementation/prism-production-integration-plan.md:555`
- `docs/implementation/prism/completion-status.json:7`
- `docs/implementation/prism/integration-traceability.json:11`
- `docs/implementation/prism/integration-traceability.json:16`
- `docs/site/extend/plugin-catalogue/README.md:28`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.prism-design.md:68`
- `docs/site/reference/capabilities.md:17`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:36`
- `docs/site/reference/capabilities.md:37`
- `docs/site/reference/capabilities.md:40`
- `packaging/runtime/roles/nova.json:50`
- `skills/prism/engine/index.ts:15`
- `skills/prism/engine/index.ts:55`
- `skills/prism/engine/worker-binding.ts:21`
- `skills/prism/engine/worker-binding.ts:37`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
