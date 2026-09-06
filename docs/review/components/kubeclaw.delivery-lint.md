# kubeclaw.delivery-lint

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/delivery-lint`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:delivery-lint` → `src/stage.ts#execute`; benötigte Capabilities: git.repository.read, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/delivery-lint/tests/live-function.test.ts`
- `skills/nova/plugins/delivery-lint/tests/package-boundary.test.mjs`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`
- `tests/verification/contracts/check-plugin-system-v2-e2e.mjs`
- `tests/verification/contracts/check-plugin-system-v2-engine.mjs`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/delivery-lint/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Vollständige Liste im `../inventory-data.json`.

- `charts/kubeclaw/files/config/knip.json:557`
- `docs/architecture/plugin-system-current-inventory.md:57`
- `docs/architecture/plugin-system-implementation-plan.md:210`
- `docs/architecture/plugin-system-implementation-plan.md:409`
- `docs/architecture/plugin-system-implementation-plan.md:619`
- `docs/architecture/plugin-system-implementation-plan.md:953`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:130`
- `docs/site/extend/plugin-catalogue/README.md:22`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.delivery-lint.md:67`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:27`
- `packaging/runtime/roles/nova.json:44`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:34`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:52`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:57`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:72`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:85`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:96`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:102`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:199`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:214`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs:215`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
