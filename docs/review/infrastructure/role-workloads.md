# INF-19 — Nova/Buster/Prism-Agent Laufzeit und Helm-Konfiguration

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Nova, Buster und Prism-Agent teilen `charts/kubeclaw`; Rolle/Values wählen Images, init, Secrets, Services, Sidecars, Volumes und Fähigkeiten. Untersucht: alle Templates, generische Values und drei Betreiber-Values; `scripts/deploy.sh` image/code/agent-/prism-Aufrufer und `docs/deployment/agent-deployments.md`. Recreate und 180s Default-Abschaltfrist; vor Setup führen begrenzte Permissions-/Doctor-Initcontainer Zustandsmigration aus, anschließend Plugin-/Workspace-/Code-Bundle-Materialisierung und Gateway.

Code-Bundles sind optional im Chart, werden durch bestimmte Deploypfade erzwungen und auf erwarteten Commit geprüft. Agent-Konfiguration und Repository-Checkout sind getrennte Quellen. Init-Container können Git/Bundle-/Plugin-/Secret-Voraussetzungen blockieren; ihre Requests werden nicht einfach zu gleichzeitig laufenden Containern addiert. Ressourcen/State bei [INF-16](storage.md), SPIFFE bei [INF-07](envoy.md).

## Befund IFR-19-001
**Hoch; nachgewiesene inkonsistente Standard-Releaseauswahl.** `my-values/nova-values.yaml:24–27`, Buster- und Prism-Agent-Values setzen weiterhin latest; generische Chartdefaults ebenso. `.github/workflows/build-images.yaml:119–123` publiziert nur candidate-Commit-Tags. Defaultdirektdeployment aus den Rollen-Values folgt damit nicht dem neu geprüften Artefakt und kann einen alten latest-Stand ziehen oder auf fehlenden Tag laufen. Readiness-/Source-Tests erzwingen teilweise explizit latest; sie beweisen keine Digestwahl.

Ursachenbehebung: einen verbindlichen Release-Values-Einstieg verwenden und mutable/ungewählte Rollen-Deployments für kontrollierte Releases sperren; aktuelle Konfiguration plus gewählte Runtime-/Bundle-Revision als Einheit reviewen. Regression: echtes Helm-Rendering aller dokumentierten Deployment-Einstiege, jedes Image aus einem verifizierten Receipt, kein latest; anschließend Pod-imageID gegen Receipt prüfen. [INF-23](release-promotion.md) führt Receipt-Kette.

## Sicherheit und Betriebsgrenzen
Root-/nicht-root-Rollen sind bewusst unterschiedlich. Buster-Suite-Supervisor besitzt begrenzte zusätzliche Capabilities, kein pauschales privileged; die eigentliche Buildgrenze bleibt kritisch. Namespace/API-/Registry-/Secret-Optionen sind nicht überall unabhängig parametrisiert. Forge/Echo sind keine zusätzlichen aktuellen Produktionsrollen-Images; Beispiele und Kommentare sind zum Teil historisch.

Echte Default-/Nova-/Buster-/Prism-Agent-Renders und acht Renderingvarianten untersucht; keine Laufzeitmigration ausgeführt. Doku muss Defaulttags, alte General-/Execution-Provider-Aussagen, Rollout-Nebenwirkungen, Startup-Abhängigkeiten und Rollback nach Doctor-Migration korrigieren. Kein Helm-Rollback stellt Dateien automatisch zurück.

## Befund IFR-19-002 — deaktiviertes Git bleibt Secret-Voraussetzung
**Mittel; nachgewiesener Konfigurationsdefekt.** Auslöser: Betreiber setzt `agent.git.enabled=false` und provisioniert deshalb keinen SSH-Key. `charts/kubeclaw/values.yaml:198–203` bietet die Option an; `deployment.yaml:1181–1184,1554–1560` mountet den SSH-Secret dennoch ohne Bedingung mit optional:false. Echtes Default-Helm-Rendering mit deaktiviertem Git bestätigt den weiterhin obligatorischen Secret-Verweis. Der Schalter wird im Deployment nicht ausgewertet.

Auswirkung: Die suggerierte optionale Git-Funktion entfernt ihre Secret-Voraussetzung nicht; ohne Secret kann kubelet den Mount nicht bereitstellen. Kein live gestarteter Pod wurde behauptet. Ursachenbehebung: tatsächlichen Git-/SSH-Bedarf und zugehörige Mounts/Init-Schritte gemeinsam bedingen oder die nicht unterstützte Option nach Vertragsklärung entfernen. Regression: Render mit false darf keinen erforderlichen Git-Key enthalten; später echter Podstart ohne Git-Secret mit ansonsten vollständigen Voraussetzungen.
