# kubeclaw.container-build

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/container-build`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:buildkit` → `src/provider.js#provider`; benötigte Capabilities: container.build

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/container-build/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/check-pipeline-container-build-implementation.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-container-build-cutover-plan.md`
- `docs/architecture/pipeline-test-gate-container-build-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-container-build-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.container-build.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/container-build/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:93`
- `contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json:4`
- `contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json:7`
- `contracts/pipeline-test-gate/v1/suites/container-build.v1.json:3`
- `docs/architecture/pipeline-test-gate-container-build-baseline.json:5`
- `docs/architecture/pipeline-test-gate-container-build-cutover-inventory.json:4`
- `docs/architecture/pipeline-test-gate-container-build-cutover-inventory.json:15`
- `docs/architecture/pipeline-test-gate-container-build-cutover-inventory.json:16`
- `docs/architecture/pipeline-test-gate-container-build-cutover-plan.md:5`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:11`
- `docs/architecture/pipeline-test-gate-container-build-implementation-plan.md:28`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:23`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:27`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:28`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:29`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:42`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:45`
- `docs/architecture/pipeline-test-gate-container-build-user-guide.md:26`
- `docs/architecture/pipeline-test-gate-container-build-user-guide.md:29`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:21`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:22`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:24`
- `docs/architecture/pipeline-test-gate-suite-migration-status.json:7`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md:19`
- `docs/architecture/plugin-system-current-inventory.md:23`
- `docs/site/extend/plugin-catalogue/README.md:61`
- `docs/site/extend/plugin-catalogue/kubeclaw.container-build.md:1`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
