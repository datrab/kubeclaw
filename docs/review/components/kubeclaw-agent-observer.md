# kubeclaw-agent-observer

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/common/plugins/openclaw-agent-observer`

Entrypoints: `src/index.ts`.

Nutzung: OpenClaw-Extension; Rollen: nova, buster, prism. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Paketabhängigkeiten: Noch keine direkte Zuordnung.

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/openclaw-agent-observer/tests/config.test.mjs`
- `skills/common/plugins/openclaw-agent-observer/tests/live-function.test.ts`
- `skills/common/plugins/openclaw-agent-observer/tests/package-boundary.test.mjs`
- `tests/verification/deployment/check-deployment-truth.mjs`
- `tests/verification/e2e/support/config-profiles/standard.json`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-phase10-observer-assessment.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/developers/hooks-and-plugins.md`
- `docs/reference/openclaw-config.md`
- `docs/reference/workflows.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md`
- `skills/common/plugins/openclaw-agent-observer/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/eslint.config.mjs:41`
- `charts/kubeclaw/files/config/knip.json:367`
- `charts/kubeclaw/templates/configmap-gateway.yaml:269`
- `charts/kubeclaw/templates/configmap-gateway.yaml:292`
- `charts/kubeclaw/templates/deployment.yaml:218`
- `charts/kubeclaw/templates/deployment.yaml:228`
- `charts/kubeclaw/templates/deployment.yaml:229`
- `charts/kubeclaw/templates/deployment.yaml:436`
- `charts/kubeclaw/templates/deployment.yaml:446`
- `docs/architecture/pipeline-observability-phase-5-7-a-inventory.json:225`
- `docs/architecture/plugin-system-current-inventory.md:43`
- `docs/architecture/plugin-system-phase10-observer-assessment.md:93`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:543`
- `docs/developers/hooks-and-plugins.md:7`
- `docs/reference/openclaw-config.md:25`
- `docs/reference/openclaw-config.md:41`
- `docs/reference/workflows.md:26`
- `docs/site/extend/plugin-catalogue/README.md:80`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:28`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:30`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:32`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:55`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:62`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:63`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:64`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:65`
- `docs/site/extend/plugin-catalogue/kubeclaw-agent-observer.md:66`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
