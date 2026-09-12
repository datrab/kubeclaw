# INF-28 — Ops-Pod, lokale MCP-Seite und Recovery-Grenzen

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Prozess-/Credentialgrenzen
`charts/ops-pod`, `ops/pod/{Dockerfile,bootstrap.py,supervisor.py,config.toml,shell.sh,verify.py}`, Deploymenthelper und `docs/architecture/ops-pod.md`, `docs/ops/ops-pod.md`. StatefulSet mit einer Identität, home-PVC 2Gi und workspace 20Gi, UID/GID/fsGroup1000, read-only RootFS und keine Capabilities. Codex 100m/256Mi Request bis 2CPU/3Gi, MCP 25m/64Mi bis 500m/512Mi. Images müssen Digestreferenzen sein.

Nur MCP mountet API-Token/CA; Codex erhält Bearer für localhost:8080 und optional GitHub-Credential, keine direkte Kubeconfig. Namespaced RoleBindings get/list für entdeckte Plattformnamespaces, Clusterrechte nur Nodes/CCNP lesen. Netzwerk deny ingress, DNS, explizit entdeckte API-Endpunkte sowie öffentliches HTTPS. Userspace-Tailscale optional, eigenes PVC/localhost SOCKS, kein Operator-/NET_ADMIN-Zwang.

## Review und Befund IFR-28-001
**Mittel; offene Recovery-Voraussetzung.** Auslöser: CNI, Node oder Cluster-DNS fällt aus. Dieser Pod hängt trotz „Remote“ an Cluster-Scheduling/PVC/CNI/API; optionaler Tailscale-Sidecar teilt diese Grenze. Der zusätzliche Hostzugang ist laut Auftrag vorhanden, aber kein vom Chart bereitgestellter unabhängiger Wiederherstellungsweg.

Ursachenbehebung: Ops-Pod als beobachtenden Komfortzugang und den separaten Host-/KVM-/externen Recoveryweg mit getrennten Voraussetzungen dokumentieren/prüfen. Echter Test später: Argo/Tailscale/CNI getrennt ausfallen lassen, Zugang über unabhängigen Hostpfad herstellen, gewünschte Konfiguration wiederherstellen; niemals nur Remote-Pairing-Status als DR-Test zählen.

## Rotation, Updates und Verifikation
MCP-Kube-Token rotiert pro Request. Bearer und Supervisor-Environment werden beim Start gelesen; Rotation benötigt koordinierten Neustart beider Prozesse. Supervisor behält Auth/config auf PVC, nennt pairingVerified ausdrücklich false; Readiness „remote-process-running“ beweist keine erfolgreiche Relay-Paarung. Fehlende Loginbereitschaft führt absichtlich nicht zum Liveness-Restart.

Drei echte Helmtests für Standard-, Tailscale-/Cilium-Option und Ablehnung ungebundener API-/mutable Images bestanden. Tatsächliche Codex-CLI-Paarung, Dockerimage-Smoke, API-403-Negativkontrolle und PVC-Restore nicht ausgeführt. Ausführliche Ops-Doku beschreibt Backup-/Rollbackgrenzen bereits korrekt; externe Voraussetzungen, tatsächlicher Host-Recoverypfad und Bearer-Rotation ergänzen. Kein Ausbau von Schreibrechten im Review vorgenommen.
