# foundation.isolation

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugin-runtime/foundation/isolation`

Entrypoints: `package.json Subpath-Exports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-e2e-cutover.mts`
- `tests/verification/contracts/check-plugin-system-v2-isolation.mjs`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/security-model.md`
- `docs/blueprint/04-evidence-matrix.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/eslint.config.mjs:28`
- `charts/kubeclaw/files/config/eslint.config.mjs:49`
- `charts/kubeclaw/files/config/eslint.config.mjs:50`
- `docs/DOCUMENTATION_TOPIC_MAP.md:9`
- `docs/architecture/plugin-system-phase11-evidence.json:7`
- `docs/architecture/security-model.md:6`
- `docs/blueprint/04-evidence-matrix.md:26`
- `scripts/build-plugin-sandbox.mjs:5`
- `scripts/build-plugin-sandbox.mjs:6`
- `scripts/build-runtime-role-bundle.mjs:21`
- `scripts/plugin-system-inventory.mjs:50`
- `tests/verification/contracts/check-pipeline-e2e-cutover.mts:9`
- `tests/verification/contracts/check-plugin-system-v2-isolation.mjs:8`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs:96`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs:113`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs:142`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs:156`
- `tests/verification/contracts/check-runtime-bundle-isolation.mjs:169`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
