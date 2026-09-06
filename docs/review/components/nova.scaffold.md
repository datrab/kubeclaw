# nova.scaffold

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/project_setup`
- `scripts/repository-review-status.mjs`
- `scripts/format-repository-review-status.mjs`
- `scripts/supervise-repository-review.mjs`
- `scripts/lib/repository-review-run-root.mjs`

Entrypoints: `package.json progress:scaffold / review:*`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-a11y-cutover.mts`
- `tests/verification/contracts/check-pipeline-api-cutover.mts`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-http-cutover.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-cutover.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-cutover.mts`
- `tests/verification/contracts/check-pipeline-phase10-cutover.mts`
- `tests/verification/contracts/check-pipeline-security-cutover.mts`
- `tests/verification/contracts/check-pipeline-size-budget-cutover.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/contracts/check-pipeline-visual-cutover.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-manifest-lint-parity-report.md`
- `docs/blueprint/04-evidence-matrix.md`
- `skills/nova/project_setup/SKILL.md`
- `skills/nova/project_setup/module-files.md`
- `skills/nova/project_setup/progress-json.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/eslint.config.mjs:31`
- `charts/kubeclaw/files/config/knip.json:41`
- `charts/kubeclaw/files/config/knip.json:47`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:6`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:27`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:28`
- `docs/architecture/pipeline-test-gate-api-cutover-inventory.json:12`
- `docs/architecture/pipeline-test-gate-container-build-parity-ledger.json:24`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:25`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:27`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:31`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:40`
- `docs/architecture/pipeline-test-gate-http-cutover-inventory.json:28`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:18`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:19`
- `docs/architecture/pipeline-test-gate-manifest-lint-cutover-inventory.json:27`
- `docs/architecture/pipeline-test-gate-manifest-lint-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-manifest-lint-parity-report.md:27`
- `docs/architecture/pipeline-test-gate-size-budget-cutover-inventory.json:13`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:40`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:41`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:42`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:47`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:19`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:20`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:21`
- `docs/architecture/pipeline-test-gate-visual-cutover-inventory.json:24`
- `docs/blueprint/04-evidence-matrix.md:50`
- `package.json:43`
- `package.json:44`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
