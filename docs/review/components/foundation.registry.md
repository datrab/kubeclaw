# foundation.registry

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugin-runtime/foundation/registry`

Entrypoints: `package.json Subpath-Exports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `tests/verification/contracts/check-pipeline-test-plan-runner.mts`
- `tests/verification/contracts/check-plugin-system-v2-external-engine.mjs`
- `tests/verification/contracts/check-plugin-system-v2-installation.mjs`
- `tests/verification/contracts/check-plugin-system-v2-phase11.mts`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/site/reference/capabilities.md`
- `skills/common/plugin-runtime/foundation/registry/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/eslint.config.mjs:39`
- `charts/kubeclaw/files/config/eslint.config.mjs:40`
- `charts/kubeclaw/files/config/eslint.config.mjs:51`
- `charts/kubeclaw/files/config/eslint.config.mjs:52`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:66`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:81`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:97`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:111`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:112`
- `docs/blueprint/04-evidence-matrix.md:24`
- `docs/blueprint/04-evidence-matrix.md:25`
- `docs/blueprint/04-evidence-matrix.md:30`
- `docs/blueprint/04-evidence-matrix.md:31`
- `docs/site/reference/capabilities.md:6`
- `scripts/docs-publication.mjs:222`
- `scripts/docs-publication.mjs:238`
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts:29`
- `tests/verification/contracts/check-plugin-system-v2-external-engine.mjs:11`
- `tests/verification/contracts/check-plugin-system-v2-installation.mjs:9`
- `tests/verification/contracts/check-plugin-system-v2-phase11.mts:14`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts:5`
- `tests/verification/contracts/check-plugin-system-v2-phase12.mts:6`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
