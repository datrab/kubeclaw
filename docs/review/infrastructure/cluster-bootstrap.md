# INF-01 — K3s, Nodes und Bootstrap

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und geprüfte Verträge
Allgemeine Infrastruktur. Quellen: `scripts/deploy.sh:65–130,855–898,1082–1185`, `my-values/infra/k3s-registries.yaml`, `docs/deployment/setup-flow.md` und `docs/deployment/infrastructure.md`. Der Einstieg provisioniert Namespaces, Secrets und Helm-Repositories auf einem **bestehenden** Cluster. `scripts/setup.sh` initialisiert Git, nicht Kubernetes. K3s-Version, Node-Anzahl, Host-Betriebssystem, effektive Startparameter, Datastore und Default-StorageClass sind in main nicht reproduzierbar festgelegt. Keine freie Host-Kapazität oder Live-Version ableitbar.

Der Host muss Kubernetes-API, DNS, externe Charts/Images und einen funktionierenden CNI bereitstellen. Die Admission-Datei verwendet `admissionregistration.k8s.io/v1`; der verwendete Cluster muss diese API tatsächlich unterstützen. Buster benötigt zusätzlich cgroup-v2-Delegation und Rootless-BuildKit-Voraussetzungen, siehe [INF-10](buildkit.md). Andere Anwendungen teilen Node, CNI und Disk; Namespaces trennen diese Kapazitätsrisiken nicht.

## Review und Befund IFR-01-001
**Mittel; offene Frage mit nachgewiesener Dokumentationslücke.** Auslöser: frischer Host oder Wiederaufbau nach Hostverlust. Der Name „setup“ kann zu einem vollständig reproduzierbaren Cluster-Bootstrap verleiten, doch `cmd_setup` beginnt mit bestehendem kubectl-Zugriff und richtet keinen Node ein. Folge: Version, Storage und Host-Voraussetzungen müssen extern rekonstruiert werden; für Paperless ist kein Wiederherstellungsvertrag im Repository vorhanden.

Ursachenbehebung im Folgeauftrag: effektive, redigierte Ausgangsumgebung samt Versions-/API-Mindestanforderungen, Storage-Provisioner, Host-cgroup-Vorbereitung und Zuständigkeit für Host-Backups dokumentieren. Keine implizite Übernahme eines generischen K3s-Defaults. Echter Test: später auf isoliertem leeren Host ausschließlich dokumentierten Bootstrap und Restore durchführen; API/Storage/Pipeline prüfen.

## Betrieb, Prüfungen und Dokumentation
Installationsskript statisch verfolgt, keine Befehle daraus ausgeführt. Cluster-Upgrades und K3s-Rollback liegen außerhalb der implementierten Automatisierung. Hostzugang ist laut Auftrag vorhanden, seine Unabhängigkeit von Cluster-DNS/Tailscale bleibt live zu prüfen. Die kurzen Deployment-Seiten enthalten keine vollständigen Node-, Disk-, Backup- oder Kapazitätsvoraussetzungen. [Bootstrap-Trace](paths/bootstrap.md) führt die fehlenden Übergaben.

Offizielle [K3s-Netzwerkoptionen](https://docs.k3s.io/networking/basic-network-options) und [Policy-Controller-Dokumentation](https://docs.k3s.io/networking/networking-services) wurden abgeglichen: Flannel und der eingebettete Policy-Controller sind unterschiedliche Bestandteile. Da K3s ungepinnt ist, ist dies Orientierung, kein versionsgenauer Betriebsnachweis.
