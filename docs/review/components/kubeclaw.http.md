# kubeclaw.http

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/http`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:request` → `src/provider.js#provider`; benötigte Capabilities: network.http

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/http/tests/live-function.test.ts`
- `tests/skills/nova/project_setup/progress-scaffold.test.mjs`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/contracts/check-pipeline-http-baseline.mjs`
- `tests/verification/contracts/check-pipeline-http-implementation.mts`
- `tests/verification/contracts/check-pipeline-http-live.mts`
- `tests/verification/contracts/check-pipeline-http-parity.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/e2e/nova-api-production-preflight.mts`
- `tests/verification/e2e/nova-http-production-preflight.mts`
- `tests/verification/e2e/nova-tailscale-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-api-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-http-cutover-final-audit.md`
- `docs/architecture/pipeline-test-gate-http-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-http-operator-guide.md`
- `docs/architecture/pipeline-test-gate-http-user-guide.md`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.http.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/http/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:129`
- `contracts/pipeline-test-gate/v1/examples/http.json:4`
- `contracts/pipeline-test-gate/v1/examples/tailscale-exposure.json:12`
- `contracts/pipeline-test-gate/v1/suites/api.v1.json:6`
- `contracts/pipeline-test-gate/v1/suites/http.v1.json:3`
- `docs/architecture/pipeline-test-gate-api-implementation-plan.md:5`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:19`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:25`
- `docs/architecture/pipeline-test-gate-http-baseline.json:4`
- `docs/architecture/pipeline-test-gate-http-cutover-final-audit.md:11`
- `docs/architecture/pipeline-test-gate-http-cutover-final-audit.md:17`
- `docs/architecture/pipeline-test-gate-http-cutover-inventory.json:4`
- `docs/architecture/pipeline-test-gate-http-cutover-inventory.json:19`
- `docs/architecture/pipeline-test-gate-http-cutover-inventory.json:20`
- `docs/architecture/pipeline-test-gate-http-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-http-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-http-documentation-manifest.json:24`
- `docs/architecture/pipeline-test-gate-http-implementation-plan.md:10`
- `docs/architecture/pipeline-test-gate-http-operator-guide.md:46`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:4`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:26`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:28`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:29`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:30`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:31`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:32`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:35`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:38`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:40`
- `docs/architecture/pipeline-test-gate-http-parity-ledger.json:42`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
