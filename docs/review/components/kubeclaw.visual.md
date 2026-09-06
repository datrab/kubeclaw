# kubeclaw.visual

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/visual`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:visual` → `src/provider.js#provider`; benötigte Capabilities: browser.visual

Paketabhängigkeiten: `@kubeclaw/buster-engine`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/visual/tests/live-function.test.ts`
- `skills/prism/tests/e2e.test.mts`
- `skills/prism/tests/pipeline-adapter.test.mts`
- `tests/verification/contracts/check-pipeline-visual-baseline.mjs`
- `tests/verification/contracts/check-pipeline-visual-cutover.mts`
- `tests/verification/contracts/check-pipeline-visual-implementation.mts`
- `tests/verification/contracts/check-pipeline-visual-remote-vertical.mts`
- `tests/verification/e2e/fixtures/nginx-project/.swarm/visual/baselines.json`
- `tests/verification/e2e/nova-visual-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-suites-8-13-state-and-issues.md`
- `docs/architecture/pipeline-test-gate-visual-cutover-plan.md`
- `docs/architecture/pipeline-test-gate-visual-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-visual-operator-guide.md`
- `docs/architecture/pipeline-test-gate-visual-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.visual.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/visual/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:253`
- `contracts/pipeline-test-gate/v1/examples/visual-baselines.json:2`
- `contracts/pipeline-test-gate/v1/schemas/visual-baselines.v1.schema.json:5`
- `contracts/pipeline-test-gate/v1/suites/visual.v1.json:2`
- `contracts/pipeline-test-gate/v1/suites/visual.v1.json:3`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:50`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:54`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:55`
- `docs/architecture/pipeline-test-gate-suite-migration-status.json:15`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md:27`
- `docs/architecture/pipeline-test-gate-suites-8-13-state-and-issues.md:45`
- `docs/architecture/pipeline-test-gate-visual-baseline.json:2`
- `docs/architecture/pipeline-test-gate-visual-cutover-inventory.json:2`
- `docs/architecture/pipeline-test-gate-visual-cutover-inventory.json:3`
- `docs/architecture/pipeline-test-gate-visual-cutover-inventory.json:14`
- `docs/architecture/pipeline-test-gate-visual-cutover-plan.md:5`
- `docs/architecture/pipeline-test-gate-visual-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-visual-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-visual-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-visual-implementation-plan.md:5`
- `docs/architecture/pipeline-test-gate-visual-operator-guide.md:9`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:2`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:5`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:6`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:7`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:8`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:9`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:10`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:11`
- `docs/architecture/pipeline-test-gate-visual-parity-ledger.json:12`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
