# lib.sdk

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugin-runtime/sdk`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `@kubeclaw/pipeline-test-gate-contract`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/common/plugins/wait-store/tests/live-function.test.ts`
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts`
- `skills/nova/plugins/prism-design/tests/live-function.test.ts`
- `skills/nova/plugins/prism-design/tests/wait.test.ts`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `skills/nova/plugins/repository-adapter/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/fixtures/review-governor.mjs`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/protocol.unit.test.mjs`
- `skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs`
- `skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-context-production.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-governor.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-graph.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-slicing.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs`
- `skills/nova/plugins/review/tests/stage.unit.test.mjs`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs`
- `tests/verification/deployment/check-deployment-truth.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/e2e/support/optional-absence.ts`
- `tests/verification/reliability/audit-projection.test.mts`
- `tests/verification/reliability/external-effect-recovery.test.mts`
- `tests/verification/reliability/lifecycle.test.mts`
- `tests/verification/reliability/observer-recovery.test.mts`
- `tests/verification/reliability/repair-evidence.test.mts`
- `tests/verification/reliability/review-candidate.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/README.md`
- `docs/architecture/pipeline-runtime-packaging.md`
- `docs/architecture/plugin-system-vision.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/site/extend/README.md`
- `skills/common/plugin-runtime/sdk/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:273`
- `docs/DOCUMENTATION_TOPIC_MAP.md:12`
- `docs/architecture/README.md:15`
- `docs/architecture/pipeline-runtime-packaging.md:101`
- `docs/architecture/plugin-system-vision.md:488`
- `docs/blueprint/04-evidence-matrix.md:23`
- `docs/site/extend/README.md:6`
- `package.json:13`
- `package.json:156`
- `packaging/runtime/package-ownership.json:9`
- `scripts/check-runtime-package-ownership.mjs:74`
- `scripts/check-runtime-package-ownership.mjs:89`
- `scripts/generate-knip-config.mjs:127`
- `scripts/generate-plugin-sdk-types.mjs:6`
- `scripts/generate-plugin-sdk-types.mjs:29`
- `skills/buster/engine/package.json:16`
- `skills/buster/engine/test-gates/browser-axe-runtime.ts:5`
- `skills/buster/engine/test-gates/browser-lighthouse-runtime.ts:11`
- `skills/buster/engine/test-gates/browser-playwright-runtime.ts:11`
- `skills/buster/engine/test-gates/browser-visual-runtime.ts:8`
- `skills/buster/engine/test-gates/composite-capability-runtime.ts:2`
- `skills/buster/engine/test-gates/container-build-runtime.ts:6`
- `skills/buster/engine/test-gates/direct-command-runtime.ts:5`
- `skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts:6`
- `skills/buster/engine/test-gates/provider-loader.ts:9`
- `skills/buster/engine/test-gates/report-adapter-runtime.ts:9`
- `skills/buster/engine/test-gates/runner.ts:30`
- `skills/buster/engine/test-gates/tailscale-exposure-runtime.ts:4`
- `skills/buster/plugins/axe/package.json:1`
- `skills/common/plugin-runtime/foundation/isolation/runner.ts:6`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
