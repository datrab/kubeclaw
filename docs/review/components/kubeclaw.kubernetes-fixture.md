# kubeclaw.kubernetes-fixture

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/kubernetes-fixture`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:deployment` → `src/provider.js#provider`; benötigte Capabilities: kubernetes.fixture

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-baseline.mjs`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/e2e/nova-a11y-production-preflight.mts`
- `tests/verification/e2e/nova-api-production-preflight.mts`
- `tests/verification/e2e/nova-e2e-production-preflight.mts`
- `tests/verification/e2e/nova-http-production-preflight.mts`
- `tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts`
- `tests/verification/e2e/nova-lighthouse-production-preflight.mts`
- `tests/verification/e2e/nova-security-production-preflight.mts`
- `tests/verification/e2e/nova-tailscale-production-preflight.mts`
- `tests/verification/e2e/nova-visual-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-final-audit.md`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-implementation-final-audit.md`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-three-phase-audit.md`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/kubernetes-fixture/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:153`
- `contracts/pipeline-test-gate/v1/examples/kubernetes-fixture.json:4`
- `contracts/pipeline-test-gate/v1/suites/kubernetes-fixture.v1.json:3`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:27`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:28`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:30`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-baseline.json:4`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-final-audit.md:10`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-inventory.json:4`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-inventory.json:26`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-cutover-inventory.json:27`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-documentation-manifest.json:28`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-implementation-final-audit.md:10`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-implementation-plan.md:7`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-parity-ledger.json:4`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-three-phase-audit.md:11`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-three-phase-audit.md:47`
- `docs/architecture/pipeline-test-gate-kubernetes-fixture-user-guide.md:17`
- `docs/architecture/pipeline-test-gate-suite-migration-status.json:9`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md:21`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:39`
- `docs/architecture/plugin-system-current-inventory.md:28`
- `docs/site/extend/plugin-catalogue/README.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.kubernetes-fixture.md:33`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
