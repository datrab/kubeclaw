# contract.telemetry

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/telemetry/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- Noch keine direkte Zuordnung.

Dokumentationsstatus: unvollständig (Abgleich offen).

- `contracts/telemetry/v1/README.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/eslint.config.mjs:15`
- `charts/kubeclaw/files/config/jscpd.json:18`
- `charts/kubeclaw/files/config/jscpd.json:19`
- `charts/kubeclaw/files/config/jscpd.json:20`
- `charts/kubeclaw/files/config/jscpd.json:21`
- `charts/kubeclaw/files/config/knip.json:21`
- `contracts/agent-observability/v1/README.md:3`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:267`
- `docs/blueprint/04-evidence-matrix.md:44`
- `docs/blueprint/05-decision-record-catalogue.md:40`
- `packaging/runtime/package-ownership.json:21`
- `scripts/generate-knip-config.mjs:159`
- `scripts/generate-telemetry-contracts.mjs:184`
- `scripts/generate-telemetry-contracts.mjs:186`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
