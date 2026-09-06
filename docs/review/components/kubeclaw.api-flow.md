# kubeclaw.api-flow

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/api-flow`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:flow` → `src/provider.js#provider`; benötigte Capabilities: network.http

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/api-flow/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/e2e/nova-api-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-api-cutover-plan.md`
- `docs/architecture/pipeline-test-gate-api-error-reference.md`
- `docs/architecture/pipeline-test-gate-api-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-api-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.api-flow.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/api-flow/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:69`
- `contracts/pipeline-test-gate/v1/suites/api.v1.json:10`
- `docs/architecture/pipeline-test-gate-api-baseline.json:12`
- `docs/architecture/pipeline-test-gate-api-cutover-inventory.json:11`
- `docs/architecture/pipeline-test-gate-api-cutover-plan.md:11`
- `docs/architecture/pipeline-test-gate-api-error-reference.md:9`
- `docs/architecture/pipeline-test-gate-api-flow-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-api-flow-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-api-flow-documentation-manifest.json:6`
- `docs/architecture/pipeline-test-gate-api-implementation-plan.md:5`
- `docs/architecture/pipeline-test-gate-api-implementation-plan.md:10`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:7`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:9`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:10`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:11`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:12`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:13`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:14`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:17`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:20`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:21`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:23`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:24`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:25`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:26`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:27`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:34`
- `docs/architecture/pipeline-test-gate-api-user-guide.md:5`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
