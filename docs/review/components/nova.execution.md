# nova.execution

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/core/execution`

Entrypoints: `skills/nova/core/src/index.ts / interne Imports`.

Nutzung: Aufrufpfade noch zu prüfen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `scripts/tests/repository-review-operations.test.mjs`
- `tests/verification/contracts/check-nova-run-root.mts`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`
- `tests/verification/contracts/check-plugin-system-v2-external-engine.mjs`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs`
- `tests/verification/contracts/check-plugin-system-v2-resume.mjs`
- `tests/verification/reliability/decisions-and-snapshots.test.mts`
- `tests/verification/reliability/external-effect-recovery.test.mts`
- `tests/verification/reliability/lifecycle.test.mts`
- `tests/verification/reliability/observer-recovery.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/implementation/prism-production-integration-plan.md`
- `docs/site/understand/request-to-result.md`
- `skills/nova/core/execution/CAPABILITIES.md`
- `skills/nova/core/execution/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `docs/blueprint/04-evidence-matrix.md:22`
- `docs/blueprint/05-decision-record-catalogue.md:25`
- `docs/implementation/prism-production-integration-plan.md:556`
- `docs/site/understand/request-to-result.md:6`
- `scripts/tests/repository-review-operations.test.mjs:8`
- `tests/verification/contracts/check-nova-run-root.mts:5`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs:9`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs:10`
- `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs:11`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:5`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs:6`
- `tests/verification/contracts/check-plugin-system-v2-external-engine.mjs:8`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:11`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:14`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:17`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:22`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:23`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:648`
- `tests/verification/contracts/check-plugin-system-v2-resume.mjs:8`
- `tests/verification/reliability/decisions-and-snapshots.test.mts:9`
- `tests/verification/reliability/decisions-and-snapshots.test.mts:34`
- `tests/verification/reliability/external-effect-recovery.test.mts:9`
- `tests/verification/reliability/lifecycle.test.mts:11`
- `tests/verification/reliability/lifecycle.test.mts:12`
- `tests/verification/reliability/lifecycle.test.mts:13`
- `tests/verification/reliability/lifecycle.test.mts:14`
- `tests/verification/reliability/observer-recovery.test.mts:6`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
