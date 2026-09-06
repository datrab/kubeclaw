# kubeclaw.axe

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/axe`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:axe` → `src/provider.js#provider`; benötigte Capabilities: browser.axe

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/axe/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-a11y-cutover.mts`
- `tests/verification/contracts/check-pipeline-a11y-implementation.mts`
- `tests/verification/e2e/nova-a11y-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md`
- `docs/architecture/pipeline-test-gate-a11y-cutover-plan.md`
- `docs/architecture/pipeline-test-gate-a11y-error-reference.md`
- `docs/architecture/pipeline-test-gate-a11y-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-a11y-security-model.md`
- `docs/architecture/pipeline-test-gate-a11y-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-suites-8-13-state-and-issues.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.axe.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/axe/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:81`
- `contracts/pipeline-test-gate/v1/suites/a11y.v1.json:6`
- `docs/architecture/pipeline-test-gate-a11y-baseline.json:2`
- `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md:6`
- `docs/architecture/pipeline-test-gate-a11y-configuration-reference.md:7`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:2`
- `docs/architecture/pipeline-test-gate-a11y-cutover-inventory.json:5`
- `docs/architecture/pipeline-test-gate-a11y-cutover-plan.md:12`
- `docs/architecture/pipeline-test-gate-a11y-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-a11y-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-a11y-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-a11y-error-reference.md:7`
- `docs/architecture/pipeline-test-gate-a11y-implementation-plan.md:6`
- `docs/architecture/pipeline-test-gate-a11y-implementation-plan.md:7`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:2`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:5`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:6`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:8`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:10`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:13`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:14`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:15`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:17`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:19`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:20`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:21`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-a11y-parity-ledger.json:24`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
