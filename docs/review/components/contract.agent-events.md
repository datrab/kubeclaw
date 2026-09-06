# contract.agent-events

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `contracts/agent-observability/v1`

Entrypoints: `package.json exports / Schema-Dateien`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `contracts/agent-observability/v1/tests/validation.test.ts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `contracts/agent-observability/v1/README.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/reference/workflows.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:51`
- `docs/blueprint/04-evidence-matrix.md:42`
- `docs/reference/workflows.md:26`
- `package.json:6`
- `packaging/runtime/package-ownership.json:20`
- `scripts/generate-knip-config.mjs:107`
- `skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs:8`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
