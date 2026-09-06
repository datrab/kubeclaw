# kubeclaw.security-providers

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/buster/plugins/security-providers`

Entrypoints: `src/dependency.js#provider; src/headers.js#provider; src/image.js#provider; src/kubernetes-policy.js#provider; src/kubernetes-runtime.js#provider`.

Nutzung: Ausgeliefert in: buster; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `testProviders:headers` → `src/headers.js#provider`; benötigte Capabilities: network.http
- `testProviders:dependency-trivy` → `src/dependency.js#provider`; benötigte Capabilities: security.scan
- `testProviders:image-trivy` → `src/image.js#provider`; benötigte Capabilities: security.scan
- `testProviders:kubernetes-policy` → `src/kubernetes-policy.js#provider`; benötigte Capabilities: security.scan
- `testProviders:kubernetes-runtime` → `src/kubernetes-runtime.js#provider`; benötigte Capabilities: kubernetes.runtime-security

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/buster/plugins/security-providers/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-security-cutover.mts`
- `tests/verification/contracts/check-pipeline-security-implementation.mts`
- `tests/verification/contracts/check-pipeline-security-parity.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/reference/workflows.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md`
- `docs/site/reference/capabilities.md`
- `skills/buster/plugins/security-providers/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:201`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:43`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:44`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:45`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:46`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:48`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:49`
- `docs/architecture/pipeline-test-gate-security-cutover-inventory.json:3`
- `docs/architecture/pipeline-test-gate-security-cutover-inventory.json:5`
- `docs/architecture/pipeline-test-gate-security-documentation-manifest.json:4`
- `docs/architecture/pipeline-test-gate-security-documentation-manifest.json:5`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:6`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:7`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:8`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:9`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:12`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:16`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:17`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:19`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:21`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:24`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:25`
- `docs/architecture/pipeline-test-gate-security-parity-ledger.json:26`
- `docs/architecture/plugin-system-current-inventory.md:32`
- `docs/reference/workflows.md:22`
- `docs/site/extend/plugin-catalogue/README.md:69`
- `docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.security-providers.md:133`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
