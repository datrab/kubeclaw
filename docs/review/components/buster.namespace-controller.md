# buster.namespace-controller

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `cmd/buster-namespace-controller`

Entrypoints: `main.go`.

Nutzung: Pipeline-Fixture-Dienst; Installation nicht im Umfang. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `cmd/buster-namespace-controller/main_test.go`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-parity.mts`
- `tests/verification/contracts/check-pipeline-security-implementation.mts`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-implementation.mts`
- `tests/verification/e2e/CHANGELOG.md`

Dokumentationsstatus: fehlend (Zuordnung offen).

- Noch keine direkte Zuordnung.

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/lint-policy.json:58`
- `charts/kubeclaw/files/config/lint-policy.json:332`
- `charts/kubeclaw/files/config/lint-policy.json:588`
- `charts/kubeclaw/files/config/lint-policy.json:613`
- `charts/kubeclaw/files/config/lint-policy.json:638`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:28`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:30`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:31`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:48`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:10`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:18`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:20`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:23`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:33`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:39`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:44`
- `docs/architecture/pipeline-test-gate-tailscale-exposure-parity-ledger.json:45`
- `package.json:129`
- `tests/verification/contracts/check-pipeline-container-build-cutover.mts:76`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts:10`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts:23`
- `tests/verification/contracts/check-pipeline-kubernetes-fixture-parity.mts:37`
- `tests/verification/contracts/check-pipeline-security-implementation.mts:48`
- `tests/verification/contracts/check-pipeline-security-implementation.mts:51`
- `tests/verification/contracts/check-pipeline-tailscale-exposure-implementation.mts:22`
- `tests/verification/e2e/CHANGELOG.md:49`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
