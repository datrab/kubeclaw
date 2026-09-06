# kubeclaw.openapi

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/openapi`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:operations` → `src/provider.js#provider`; benötigte Capabilities: network.http

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/openapi/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-api-implementation.mts`
- `tests/verification/e2e/nova-api-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-api-implementation-plan.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/openapi/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:177`
- `contracts/pipeline-test-gate/v1/suites/api.v1.json:14`
- `docs/architecture/pipeline-test-gate-api-cutover-inventory.json:11`
- `docs/architecture/pipeline-test-gate-api-implementation-plan.md:5`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:28`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:29`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:30`
- `docs/architecture/pipeline-test-gate-api-parity-ledger.json:31`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:56`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:59`
- `docs/architecture/pipeline-test-gate-openapi-documentation-manifest.json:2`
- `docs/architecture/pipeline-test-gate-openapi-documentation-manifest.json:3`
- `docs/architecture/pipeline-test-gate-openapi-documentation-manifest.json:6`
- `docs/architecture/plugin-system-current-inventory.md:30`
- `docs/site/extend/plugin-catalogue/README.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:29`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:33`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:61`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:68`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:69`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:70`
- `docs/site/extend/plugin-catalogue/kubeclaw.openapi.md:71`
- `docs/site/reference/capabilities.md:35`
- `package.json:106`
- `packaging/runtime/roles/buster.json:34`
- `scripts/deploy.sh:2195`
- `tests/verification/contracts/check-pipeline-api-implementation.mts:14`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
