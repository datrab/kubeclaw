# Pipeline-Komponenten-Inventar

Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; Tree: `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`.

Erster Erfassungsstand: **93 Einheiten**. Vollständigkeit der Laufzeitzuordnung ist noch offen. Erfassung bedeutet kein abgeschlossenes Review. Alle Codepfade, Entrypoints, Registrierungen, Tests, Dokumentationsquellen und Referenzen stehen in den verlinkten Komponenten und `inventory-data.json`.

Der Dokumentationsstatus ist vorläufig konservativ unvollständig bzw. fehlend. Vorhandene Dateien allein belegen keine korrekte Dokumentation. Aufrufer und Infrastrukturannahmen bleiben bei ungeprüften Einheiten offen.

| Kennung / Review | Nutzung | Dokumentation | Review | Geprüfter Commit |
|---|---|---|---|---|
| [kubeclaw.agent-observability](components/kubeclaw.agent-observability.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.artifact-store](components/kubeclaw.artifact-store.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.command-runner](components/kubeclaw.command-runner.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.git-workspace](components/kubeclaw.git-workspace.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.network-http](components/kubeclaw.network-http.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.notification-observer](components/kubeclaw.notification-observer.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.openclaw-agent-events](components/kubeclaw.openclaw-agent-events.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw-agent-observer](components/kubeclaw-agent-observer.md) | OpenClaw-Extension; Rollen: nova, buster, prism | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.operator-messaging](components/kubeclaw.operator-messaging.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [lib.prompt-contract](components/lib.prompt-contract.md) | Ungenutzt im verfolgten Produktionscode; nur eigene Tests | veraltet / unvollständig | abgeschlossen | `85ddfcbf` |
| [kubeclaw.redis-transport](components/kubeclaw.redis-transport.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.runtime-dispatch](components/kubeclaw.runtime-dispatch.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.secret-resolver](components/kubeclaw.secret-resolver.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.state-store](components/kubeclaw.state-store.md) | Nova: blueprint-sync → state.append; produktiver state.read-Aufrufer nicht gefunden | unvollständig (Abgleich offen) | abgeschlossen | `85ddfcbf` |
| [kubeclaw.telemetry-observer](components/kubeclaw.telemetry-observer.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.telemetry-store](components/kubeclaw.telemetry-store.md) | Ausgeliefert in: nova, buster, prism; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.transport-publisher](components/kubeclaw.transport-publisher.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.wait-store](components/kubeclaw.wait-store.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.architecture-validator](components/kubeclaw.architecture-validator.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.blueprint-sync](components/kubeclaw.blueprint-sync.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.buster-quality-gate](components/kubeclaw.buster-quality-gate.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.case-study](components/kubeclaw.case-study.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.delivery-lint](components/kubeclaw.delivery-lint.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.human-approval](components/kubeclaw.human-approval.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.implementation-agent](components/kubeclaw.implementation-agent.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.lint](components/kubeclaw.lint.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.pipeline-review](components/kubeclaw.pipeline-review.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.preflight-contract](components/kubeclaw.preflight-contract.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.prism-design](components/kubeclaw.prism-design.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.project-summary](components/kubeclaw.project-summary.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.remote-test-gate](components/kubeclaw.remote-test-gate.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.repository-adapter](components/kubeclaw.repository-adapter.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.review](components/kubeclaw.review.md) | Ausgeliefert in: nova; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.api-flow](components/kubeclaw.api-flow.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.axe](components/kubeclaw.axe.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.container-build](components/kubeclaw.container-build.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.coverage-budget](components/kubeclaw.coverage-budget.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.direct-command](components/kubeclaw.direct-command.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.http](components/kubeclaw.http.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.junit-report](components/kubeclaw.junit-report.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.kubernetes-fixture](components/kubeclaw.kubernetes-fixture.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.lighthouse](components/kubeclaw.lighthouse.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.openapi](components/kubeclaw.openapi.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.playwright](components/kubeclaw.playwright.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.security-providers](components/kubeclaw.security-providers.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.size-budget](components/kubeclaw.size-budget.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.tailscale-exposure](components/kubeclaw.tailscale-exposure.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [kubeclaw.visual](components/kubeclaw.visual.md) | Ausgeliefert in: buster; Auswahl und Aufruf offen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.plugin-system](components/contract.plugin-system.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.worker](components/contract.worker.md) | Buster/Prism Envelope + Executor; Binding-/Trust-Helfer nur testgenutzt | veraltet / unvollständig | abgeschlossen | `85ddfcbf` |
| [contract.test-gate](components/contract.test-gate.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.observability](components/contract.observability.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.agent-events](components/contract.agent-events.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.telemetry](components/contract.telemetry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [contract.prism](components/contract.prism.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [lib.sdk](components/lib.sdk.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [foundation.registry](components/foundation.registry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [foundation.config](components/foundation.config.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [foundation.isolation](components/foundation.isolation.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [foundation.packages](components/foundation.packages.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [foundation.observability](components/foundation.observability.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | teilweise geprüft | `85ddfcbf` |
| [nova.state](components/nova.state.md) | Aktive FileJournal-/FileMutex-Nutzung; PluginStateJournal nur Testaufrufer | unvollständig (Abgleich offen) | abgeschlossen | `85ddfcbf` |
| [nova.effects](components/nova.effects.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.execution](components/nova.execution.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.lifecycle](components/nova.lifecycle.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.telemetry](components/nova.telemetry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.observability](components/nova.observability.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.test-gates](components/nova.test-gates.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.entry](components/nova.entry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [nova.scaffold](components/nova.scaffold.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [worker.core](components/worker.core.md) | Buster: Runtime + Executor; Prism: Executor direkt | veraltet / unvollständig | abgeschlossen | `85ddfcbf` |
| [buster.engine](components/buster.engine.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [buster.entry](components/buster.entry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.control](components/prism.control.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.corpus](components/prism.corpus.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.directions](components/prism.directions.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.domain](components/prism.domain.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.engine](components/prism.engine.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.evaluation](components/prism.evaluation.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.pipeline-adapter](components/prism.pipeline-adapter.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.preferences](components/prism.preferences.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.renderer](components/prism.renderer.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.storage](components/prism.storage.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.studio](components/prism.studio.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.service-control](components/prism.service-control.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | teilweise geprüft | `85ddfcbf` |
| [prism.service-worker](components/prism.service-worker.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | teilweise geprüft | `85ddfcbf` |
| [prism.service-ingestion](components/prism.service-ingestion.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.service-studio](components/prism.service-studio.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.service-agent-bridge](components/prism.service-agent-bridge.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.service-common](components/prism.service-common.md) | Aufrufpfade noch zu prüfen | fehlend (Zuordnung offen) | ungeprüft | — |
| [prism.entry](components/prism.entry.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [prism.extension](components/prism.extension.md) | Aufrufpfade noch zu prüfen | unvollständig (Abgleich offen) | ungeprüft | — |
| [buster.namespace-controller](components/buster.namespace-controller.md) | Pipeline-Fixture-Dienst; Installation nicht im Umfang | fehlend (Zuordnung offen) | ungeprüft | — |

## Erfassungsmethode und Vollständigkeitslücken

Quellen: tatsächliche `plugin.json` / `openclaw.plugin.json`, alle drei Plugin-Wurzeln, Vertragsfamilien, Core-Unterpakete, Worker-Core, Buster-Engine, Prism-Bibliotheken/-Dienste/-Extensions und Namespace-Controller. Auslieferung: `packaging/runtime/roles/*.json`; Paketgrenzen: `packaging/runtime/package-ownership.json`; Builder-Aufruf: `scripts/package-agent-skill-bundle.sh`. Import- und Symbolsuchtreffer stehen pro Komponente. Eine fehlende Rollenregistrierung belegt noch keine Obsoleszenz.

Noch offen: dynamische Imports und Plattformauswahl, Hilfsskripte außerhalb der Paketwurzeln, Laufzeitpfade des Namespace-Controllers, Buster-Engine-Unterteilung und historische/Spike-Pfade. Das bestehende generierte Plugin-Inventar ist nur Kontrollquelle. `spikes/prism/` vor Einstufung auf produktive Referenzen prüfen.

Ausgenommen: Infrastrukturinstallation und -betrieb, Argo, Cilium, Tailscale, Ops MCP/Devbox sowie Deployment-/Image-Automation. Konfiguration nur als Verdrahtungsbeleg lesen; keine privaten Werte übernehmen. Pipeline-spezifischer Namespace-Controller-Code bleibt enthalten.
