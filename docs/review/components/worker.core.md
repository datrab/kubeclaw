# worker.core

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/worker/core`

Entrypoints: `src/index.ts`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: `@kubeclaw/pipeline-worker-core-contract`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts`
- `tests/verification/contracts/check-pipeline-worker-attempt-executor.mts`
- `tests/verification/contracts/check-pipeline-worker-local-runtime.mts`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs`
- `tests/verification/contracts/check-worker-trust-spiffe.mts`
- `tests/verification/deployment/check-deployment-truth.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/pipeline-runtime-packaging.md`
- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/architecture/pipeline-worker-core-phase-5-5-d-audit.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/security/worker-trust.md`
- `docs/site/understand/worker-trust.md`
- `skills/worker/core/BOUNDARIES.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:692`
- `docs/DOCUMENTATION_TOPIC_MAP.md:5`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:43`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:57`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:71`
- `docs/architecture/pipeline-runtime-packaging.md:103`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:109`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:115`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:116`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:117`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:121`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:321`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:322`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:424`
- `docs/architecture/pipeline-worker-core-phase-5-5-d-audit.md:28`
- `docs/blueprint/04-evidence-matrix.md:34`
- `docs/blueprint/05-decision-record-catalogue.md:26`
- `docs/security/worker-trust.md:6`
- `docs/security/worker-trust.md:487`
- `docs/site/understand/worker-trust.md:6`
- `package.json:18`
- `packaging/runtime/package-ownership.json:13`
- `scripts/check-runtime-package-ownership.mjs:78`
- `scripts/docs-blueprint-generate.mjs:138`
- `scripts/generate-knip-config.mjs:119`
- `scripts/plugin-system-inventory.mjs:23`
- `skills/buster/engine/package.json:17`
- `skills/buster/engine/src/index.ts:1`
- `skills/buster/engine/test-gates/remote-plan-http.ts:6`
- `skills/buster/engine/test-gates/runner.ts:45`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
