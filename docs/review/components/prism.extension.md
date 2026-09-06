# prism.extension

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/prism/openclaw-plugin`

Entrypoints: `index.mjs`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/prism/openclaw-plugin/index.test.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/reference/workflows.md`
- `docs/site/extend/plugin-catalogue/kubeclaw-prism.md`
- `skills/prism/openclaw-plugin/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/reference/workflows.md:26`
- `docs/site/extend/plugin-catalogue/kubeclaw-prism.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw-prism.md:62`
- `docs/site/extend/plugin-catalogue/kubeclaw-prism.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw-prism.md:64`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
