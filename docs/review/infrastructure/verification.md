# Lokales Prüfprotokoll

Datum 2026-09-06; Codebaseline und Zusatzbranch siehe [Leitfaden](README.md). Ausschließlich lokal/statisch; keine CI-Anforderung, Clusterverbindung, Deployment-, Build-/Release-Veröffentlichung oder kostenpflichtige Ressource. Vorhandene Tools/Dependencies wiederverwendet; kein grüner Ersatzdienst eingerichtet.

## Ausgeführt

| Echter Befehl / Prüfung | Ergebnis | Aussagegrenze |
|---|---|---|
| `node tests/verification/deployment/check-role-chart.mjs` | bestanden | echtes Helm-Rendering der Rollen; kein Podstart |
| `node tests/verification/deployment/check-deployment-truth.mjs` | bestanden | echter Helm-/kubeconform-Teil; enthaltene Shell-Secret-Test-Doubles sind kein API-/Secret-Livenachweis |
| `node scripts/versions.mjs --check` | bestanden,21 geprüft,0 Änderungen | lokale Versionssynchronität, keine Upstream-Kompatibilität |
| `node --test tests/verification/deployment/release-images.test.mjs tests/verification/deployment/versions.test.mjs` | 4 bestanden | Receiptvalidierung und echtes Helm generierter Values; synthetische Receipt-Eingaben sind keine realen veröffentlichten Images |
| `node scripts/check-workflow-yaml.mjs .github/workflows/*.yaml` | 10 Dateien bestanden | YAML/Workflowstruktur, keine GitHub-Ausführung; erster Aufruf ohne Dateiparameter war ungültig und wurde korrigiert |
| Ops-Pod selektierte Helmtests (exakter Aufruf unten) | siehe exakter Aufruf unten | nur die konkret gewählten drei Helmtests gezählt |
| `node --test tools/ops-mcp/test/local.test.mjs tools/ops-mcp/test/http.test.mjs tools/ops-mcp/test/diagnostics.test.mjs tools/ops-mcp/test/bootstrap.test.mjs` | 7 bestanden | realer lokaler MCP-Prozess/HTTP und Diagnose; fehlende Kubernetescredentials ergeben echte Fehler, keinen Clustererfolg |
| `bash -n` für18 Shell-Dateien; `ast.parse` für4 Python-Dateien | bestanden | Syntax einschließlich separat gelesener Cilium-Skripte; Skripte nicht installiert/ausgeführt |
| 8 reale Helmvarianten | bestanden | Default, Nova, Buster, Prism-Agent, Prism, Ingestion an, SPIFFE aus, Nova2Replicas; Objekt-/Ressourcenauswertung |
| `helm template optional-git charts/kubeclaw -n kubeclaw --set agent.git.enabled=false` | Render bestanden, Defekt reproduziert | Pflicht-SSH-Secret bleibt: IFR-19-002 |

Exakter Ops-Renderaufruf:
```sh
node --test --test-name-pattern='real Helm|optional Tailscale|mutable images' ops/pod/test/deployment.test.mjs
```
Drei Tests bestanden; keine tatsächliche CLI-Anmeldung. Helm/kubeconform waren über den lokalen PATH verfügbar, Node v24.19.0. Bereits vorhandene Node-Dependencies wurden lesend über lokale Symlinks genutzt. Die sechs tatsächlichen MCP-Paketversionen wurden gegen den Repo-Lock geprüft und stimmen überein (core/node/server2.0.0, hono4.12.9, @hono/node-server2.0.12, zod4.5.4). Der Dependency-Gesamtbaum wurde nicht frisch mit npm-ci aufgebaut; kein Image-Reproduzierbarkeitsnachweis.

Die Render-Matrix verwendete `helm template agent-<variante> charts/<chart> -n kubeclaw` mit passendem `-f my-values/<rolle>-values.yaml`; optionale Abweichungen: `--set ingestion.enabled=true`, `--set workerTrust.spiffe.enabled=false`, `--set replicaCount=2`. Roh-Render enthalten Betreiberkonfiguration und werden nicht in Review-Dateien kopiert. [Bereinigte Ergebnisse](verification-results.json) enthalten nur technische Summen/Prüfstatus.

## Nicht ausgeführt oder nicht verfügbar
Docker-/Containerimage-Smokes, echte BuildKit-Isolation, Redis-/PostgreSQL-/Qdrant-Integration, CLI-Pairing, Kubernetes-RBAC/VAP, CNI-Durchsetzung, vollständiges Upstream-Chart-Rendering, Tailnet-ACLs, Envoy/SPIRE-Rotation, Backup/Restore und sämtliche Live-E2E. Docker/kubectl standen hier nicht als nutzbare lokale Laufzeit zur Verfügung; keine Ersatzdienste installiert. Fehlende Voraussetzungen zählen nicht als bestanden.

Versionsgenaue offizielle Quellen: BuildKit v0.26.2 und SPIRE-Chart0.30.0, verlinkt in deren Reviews. Ein erster Webabruf war blockiert; der nachfolgende GitHub-Dateiabruf war erfolgreich. Ungepinnte Charts wurden nicht anhand beliebiger aktueller Defaults bewertet. Syntax-/Schemaerfolg ersetzt keine Versions-/K3s-Kompatibilitätsprüfung.
