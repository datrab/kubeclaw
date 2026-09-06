# kubeclaw.remote-test-gate

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/remote-test-gate`

Entrypoints: `src/adapter.ts#activate`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `adapters:plan` → `src/adapter.ts#activate`; benötigte Capabilities: secrets.read

Paketabhängigkeiten: `@kubeclaw/nova-core`, `@kubeclaw/pipeline-test-gate-contract`, `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts`
- `skills/nova/plugins/remote-test-gate/tests/live-function.test.ts`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/contracts/quality-provider-runtime.mts`
- `tests/verification/e2e/run-v2-production-pipeline.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/pipeline-test-gate-implementation-plan.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/remote-test-gate/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:655`
- `docs/architecture/pipeline-test-gate-decision-ledger.json:124`
- `docs/architecture/pipeline-test-gate-implementation-plan.md:728`
- `docs/architecture/pipeline-test-gate-unit-cutover-inventory.json:30`
- `docs/architecture/plugin-system-current-inventory.md:65`
- `docs/architecture/plugin-system-phase5-capabilities.json:21`
- `docs/site/extend/plugin-catalogue/README.md:48`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.remote-test-gate.md:66`
- `docs/site/reference/capabilities.md:38`
- `docs/site/reference/capabilities.md:44`
- `package.json:74`
- `packaging/runtime/roles/nova.json:52`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:58`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:76`
- `skills/nova/plugins/buster-quality-gate/tests/live-function.test.ts:107`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts:11`
- `tests/verification/contracts/check-pipeline-legacy-retirement.mts:19`
- `tests/verification/contracts/check-project-compiler.mts:82`
- `tests/verification/contracts/check-project-compiler.mts:93`
- `tests/verification/contracts/check-project-compiler.mts:103`
- `tests/verification/contracts/quality-provider-runtime.mts:72`
- `tests/verification/contracts/quality-provider-runtime.mts:95`
- `tests/verification/contracts/quality-provider-runtime.mts:127`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
