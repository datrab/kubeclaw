# kubeclaw.playwright

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/playwright`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:playwright` → `src/provider.js#provider`; benötigte Capabilities: browser.playwright

Paketabhängigkeiten: `@kubeclaw/buster-engine`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/playwright/tests/fixture/playwright.config.ts`
- `skills/buster/plugins/playwright/tests/fixture/specs/home.spec.ts`
- `skills/buster/plugins/playwright/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-implementation.mts`
- `tests/verification/contracts/check-pipeline-e2e-legacy-comparison.mts`
- `tests/verification/contracts/check-pipeline-e2e-parity.mts`
- `tests/verification/contracts/check-pipeline-e2e-remote-vertical.mts`
- `tests/verification/e2e/nova-e2e-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/reliability/provider-completion.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-design.md`
- `docs/architecture/pipeline-test-gate-e2e-configuration-reference.md`
- `docs/architecture/pipeline-test-gate-e2e-error-reference.md`
- `docs/architecture/pipeline-test-gate-e2e-operator-guide.md`
- `docs/architecture/pipeline-test-gate-e2e-phase-8-plan.md`
- `docs/architecture/pipeline-test-gate-e2e-user-guide.md`
- `docs/architecture/pipeline-test-gate-suites-8-13-state-and-issues.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.playwright.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/playwright/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:189`
- `contracts/pipeline-test-gate/v1/examples/e2e-playwright.json:4`
- `contracts/pipeline-test-gate/v1/suites/e2e.v1.json:3`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:60`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:61`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:62`
- `docs/architecture/pipeline-test-gate-design.md:1174`
- `docs/architecture/pipeline-test-gate-e2e-configuration-reference.md:3`
- `docs/architecture/pipeline-test-gate-e2e-configuration-reference.md:58`
- `docs/architecture/pipeline-test-gate-e2e-cutover-inventory.json:3`
- `docs/architecture/pipeline-test-gate-e2e-cutover-inventory.json:5`
- `docs/architecture/pipeline-test-gate-e2e-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-e2e-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-e2e-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-e2e-error-reference.md:60`
- `docs/architecture/pipeline-test-gate-e2e-operator-guide.md:33`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:6`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:7`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:8`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:9`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:12`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:13`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:17`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:21`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:25`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:31`
- `docs/architecture/pipeline-test-gate-e2e-parity-ledger.json:32`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
