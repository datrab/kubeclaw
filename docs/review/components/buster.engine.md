# buster.engine

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/engine`

Entrypoints: `src/index.ts; remote-plan-service.ts`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `@axe-core/playwright`, `@kubeclaw/pipeline-observability-contract`, `@kubeclaw/pipeline-test-gate-contract`, `@kubeclaw/pipeline-worker-core-contract`, `@kubeclaw/plugin-command-runner`, `@kubeclaw/plugin-foundation`, `@kubeclaw/plugin-sdk`, `@kubeclaw/worker-core`, `js-yaml`, `lighthouse`, `playwright`, `pixelmatch`, `pngjs`, `ws`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/api-flow/tests/live-function.test.ts`
- `skills/buster/plugins/axe/tests/live-function.test.ts`
- `skills/buster/plugins/http/tests/live-function.test.ts`
- `skills/buster/plugins/lighthouse/tests/live-function.test.ts`
- `skills/buster/plugins/openapi/tests/live-function.test.ts`
- `skills/buster/plugins/playwright/tests/live-function.test.ts`
- `skills/buster/plugins/security-providers/tests/live-function.test.ts`
- `skills/buster/plugins/visual/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-a11y-implementation.mts`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/contracts/check-pipeline-container-build-implementation.mts`
- `tests/verification/contracts/check-pipeline-container-build-production.mts`
- `tests/verification/contracts/check-pipeline-container-build-recovery.mts`
- `tests/verification/contracts/check-pipeline-container-build-runtime.mts`
- `tests/verification/contracts/check-pipeline-direct-command-provider.mts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-implementation.mts`
- `tests/verification/contracts/check-pipeline-e2e-remote-vertical.mts`
- `tests/verification/contracts/check-pipeline-http-implementation.mts`
- `tests/verification/contracts/check-pipeline-http-live.mts`
- `tests/verification/contracts/check-pipeline-http-parity.mts`
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-live.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-implementation.mts`
- `tests/verification/contracts/check-pipeline-lighthouse-remote-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase10-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase8-vertical.mts`
- `tests/verification/contracts/check-pipeline-phase9-vertical.mts`
- `tests/verification/contracts/check-pipeline-remote-plan-runtime.mts`
- `tests/verification/contracts/check-pipeline-remote-process-restart.mts`
- `tests/verification/contracts/check-pipeline-remote-real-provider.mts`
- `tests/verification/contracts/check-pipeline-remote-runtime-config.mts`
- `tests/verification/contracts/check-pipeline-report-adapter-runtime.mts`
- `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts`
- `tests/verification/contracts/check-pipeline-security-implementation.mts`
- `tests/verification/contracts/check-pipeline-security-remote-vertical.mts`
- `tests/verification/contracts/check-pipeline-size-budget-implementation.mts`
- `tests/verification/contracts/check-pipeline-size-budget-production.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-implementation.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-live.mts`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-pipeline-visual-implementation.mts`
- `tests/verification/contracts/check-pipeline-visual-legacy-comparison.mts`
- `tests/verification/contracts/check-pipeline-visual-remote-vertical.mts`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs`
- `tests/verification/deployment/check-deployment-truth.mjs`
- `tests/verification/reliability/http-authority.test.mts`
- `tests/verification/reliability/lighthouse-startup.test.mts`
- `tests/verification/reliability/result-reservation.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/pipeline-runtime-packaging.md`
- `docs/architecture/pipeline-test-gate-a11y-operator-guide.md`
- `docs/architecture/pipeline-test-gate-a11y-security-model.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/security/worker-trust.md`
- `skills/buster/engine/BOUNDARIES.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:59`
- `docker/buster-runtime-entrypoint.sh:319`
- `docker/buster-runtime-entrypoint.sh:325`
- `docs/DOCUMENTATION_TOPIC_MAP.md:5`
- `docs/DOCUMENTATION_TOPIC_MAP.md:6`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:57`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:127`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:297`
- `docs/architecture/pipeline-runtime-packaging.md:104`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:5`
- `docs/architecture/pipeline-test-gate-a11y-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-a11y-operator-guide.md:6`
- `docs/architecture/pipeline-test-gate-a11y-security-model.md:6`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:36`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:12`
- `docs/architecture/pipeline-test-gate-container-build-documentation-manifest.json:13`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:21`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:23`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:24`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:25`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:27`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:28`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:29`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:30`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:31`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:32`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:33`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:36`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:37`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
