# contract.test-gate

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/pipeline-test-gate/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `@kubeclaw/pipeline-observability-contract`, `ajv`, `ajv-formats`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-a11y-cutover.mts`
- `tests/verification/contracts/check-pipeline-a11y-implementation.mts`
- `tests/verification/contracts/check-pipeline-api-cutover.mts`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/contracts/check-pipeline-committed-source-snapshot.mts`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/check-pipeline-container-build-implementation.mts`
- `tests/verification/contracts/check-pipeline-container-build-production.mts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-implementation.mts`
- `tests/verification/contracts/check-pipeline-http-cutover.mts`
- `tests/verification/contracts/check-pipeline-http-implementation.mts`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-cutover.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-implementation.mts`
- `tests/verification/contracts/check-pipeline-manifest-lint-cutover.mts`
- `tests/verification/contracts/check-pipeline-phase10-cutover.mts`
- `tests/verification/contracts/check-pipeline-phase10-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase9-parity.mts`
- `tests/verification/contracts/check-pipeline-phase9-vertical.mts`
- `tests/verification/contracts/check-pipeline-remote-plan-contracts.mts`
- `tests/verification/contracts/check-pipeline-remote-plan-runtime.mts`
- `tests/verification/contracts/check-pipeline-remote-process-restart.mts`
- `tests/verification/contracts/check-pipeline-remote-real-provider.mts`
- `tests/verification/contracts/check-pipeline-remote-result-import.mts`
- `tests/verification/contracts/check-pipeline-report-adapter-runtime.mts`
- `tests/verification/contracts/check-pipeline-security-cutover.mts`
- `tests/verification/contracts/check-pipeline-security-implementation.mts`
- `tests/verification/contracts/check-pipeline-size-budget-cutover.mts`
- `tests/verification/contracts/check-pipeline-size-budget-implementation.mts`
- `tests/verification/contracts/check-pipeline-size-budget-production.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/contracts/check-pipeline-test-gate-contracts.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-pipeline-visual-cutover.mts`
- `tests/verification/contracts/check-pipeline-visual-implementation.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/nova-buildkit-production-preflight.mts`
- `tests/verification/e2e/nova-unit-production-preflight.mts`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/decisions-and-snapshots.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `contracts/pipeline-test-gate/v1/README.md`
- `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md`
- `docs/architecture/pipeline-test-gate-a11y-user-guide.md`
- `docs/architecture/pipeline-test-gate-e2e-user-guide.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-lighthouse-configuration-reference.md`
- `docs/architecture/pipeline-test-gate-unit-user-guide.md`
- `docs/architecture/pipeline-test-gate-visual-configuration-reference.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/security/worker-trust.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md:34`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:6`
- `docs/architecture/pipeline-test-gate-a11y-documentation-manifest.json:7`
- `docs/architecture/pipeline-test-gate-a11y-user-guide.md:24`
- `docs/architecture/pipeline-test-gate-api-cutover-inventory.json:12`
- `docs/architecture/pipeline-test-gate-api-flow-documentation-manifest.json:7`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:8`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:18`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:26`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:35`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:37`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:38`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:40`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:43`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:51`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:56`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:60`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:63`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:66`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:80`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:81`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:82`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:84`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:85`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:86`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:87`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:89`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:90`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:91`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:94`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
