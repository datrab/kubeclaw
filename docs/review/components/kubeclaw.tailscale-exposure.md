# kubeclaw.tailscale-exposure

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/tailscale-exposure`

Entrypoints: `src/provider.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:exposure` → `src/provider.js#provider`; benötigte Capabilities: kubernetes.exposure

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-baseline.mjs`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-cutover.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-implementation.mts`
- `tests/verification/e2e/nova-tailscale-production-preflight.mts`
- `tests/verification/e2e/real-run-workspace.mjs`
- `tests/verification/e2e/real-run-workspace.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-suite-migration-status.md`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-implementation-plan.md`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-user-guide.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.tailscale-exposure.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/tailscale-exposure/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:229`
- `contracts/pipeline-test-gate/v1/examples/tailscale-exposure.json:4`
- `contracts/pipeline-test-gate/v1/suites/tailscale-exposure.v1.json:3`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:31`
- `docs/architecture/pipeline-test-gate-suite-migration-status.json:11`
- `docs/architecture/pipeline-test-gate-suite-migration-status.md:23`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-baseline.json:4`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-cutover-inventory.json:4`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-cutover-inventory.json:7`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-cutover-inventory.json:8`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-documentation-manifest.json:14`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-implementation-plan.md:10`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:4`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:14`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:19`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:22`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:26`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:27`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:30`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:34`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:35`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:45`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-user-guide.md:16`
- `docs/architecture/plugin-system-current-inventory.md:34`
- `docs/site/extend/plugin-catalogue/README.md:71`
- `docs/site/extend/plugin-catalogue/kubeclaw.tailscale-exposure.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.tailscale-exposure.md:5`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
