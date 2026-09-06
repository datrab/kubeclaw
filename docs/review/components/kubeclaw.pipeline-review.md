# kubeclaw.pipeline-review

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/pipeline-review`

Entrypoints: `src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:review` → `src/stage.ts#execute`; benötigte Capabilities: runtime.dispatch, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/nova/plugins/pipeline-review/tests/live-function.test.ts`
- `skills/nova/plugins/pipeline-review/tests/package-boundary.test.mjs`
- `skills/nova/plugins/pipeline-review/tests/protocol.test.mjs`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/echo-review-phase-1-baseline.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/pipeline-review/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:607`
- `docs/architecture/echo-review-phase-1-baseline.md:67`
- `docs/architecture/plugin-system-current-inventory.md:61`
- `docs/architecture/plugin-system-implementation-plan.md:774`
- `docs/architecture/plugin-system-phase9-changelog.md:75`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:208`
- `docs/site/extend/plugin-catalogue/README.md:26`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:56`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:66`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:67`
- `docs/site/extend/plugin-catalogue/kubeclaw.pipeline-review.md:68`
- `docs/site/reference/capabilities.md:18`
- `docs/site/reference/capabilities.md:37`
- `packaging/runtime/roles/nova.json:48`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts:32`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
