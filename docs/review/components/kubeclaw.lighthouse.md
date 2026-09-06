# kubeclaw.lighthouse

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/lighthouse`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:lighthouse` → `src/provider.js#provider`; benötigte Capabilities: browser.lighthouse

Paketabhängigkeiten: `@kubeclaw/buster-engine`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/lighthouse/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-lighthouse-baseline.mjs`
- `tests/verification/contracts/check-pipeline-lighthouse-cutover.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-implementation.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-legacy-comparison.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-remote-vertical.mts`
- `tests/verification/e2e/nova-lighthouse-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-lighthouse-configuration-reference.md`
- `docs/architecture/pipeline-test-gate-lighthouse-cutover-plan.md`
- `docs/architecture/pipeline-test-gate-lighthouse-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-lighthouse-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-suites-8-13-state-and-issues.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.lighthouse.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/lighthouse/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:165`
- `contracts/pipeline-test-gate/v1/examples/lighthouse-settings.json:2`
- `contracts/pipeline-test-gate/v1/schemas/lighthouse-settings.v1.schema.json:5`
- `contracts/pipeline-test-gate/v1/suites/perf.v1.json:2`
- `contracts/pipeline-test-gate/v1/suites/perf.v1.json:4`
- `contracts/pipeline-test-gate/v1/suites/perf.v1.json:5`
- `contracts/pipeline-test-gate/v1/suites/perf.v1.json:6`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:35`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:36`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:38`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:39`
- `docs/architecture/pipeline-test-gate-lighthouse-baseline.json:2`
- `docs/architecture/pipeline-test-gate-lighthouse-configuration-reference.md:20`
- `docs/architecture/pipeline-test-gate-lighthouse-cutover-inventory.json:2`
- `docs/architecture/pipeline-test-gate-lighthouse-cutover-inventory.json:3`
- `docs/architecture/pipeline-test-gate-lighthouse-cutover-inventory.json:11`
- `docs/architecture/pipeline-test-gate-lighthouse-cutover-plan.md:9`
- `docs/architecture/pipeline-test-gate-lighthouse-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-lighthouse-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-lighthouse-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-lighthouse-implementation-plan.md:6`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:2`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:5`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:8`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:10`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:11`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:13`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:14`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:15`
- `docs/architecture/pipeline-test-gate-lighthouse-parity-ledger.json:17`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
