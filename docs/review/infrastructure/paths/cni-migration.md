# Infrastrukturpfad — CNI-Migration mit Paperless-Schutz

Prüfstand: main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; statischer Trace abgeschlossen, **kein Deployment-/Live-E2E-Nachweis**. Quellenpfade beziehen sich auf diesen Commit, sofern anders angegeben. Befunde bleiben in den verlinkten Einzelreviews.

Zusatzstand dieses Pfads: `feat/cilium-networking` / `1313cc3a89d74ce11d93666fad1a4b9a0f48e308`. **Separater Branch**, keine Aussage über gegenwärtigen Cluster oder fertig integrierten main. Quellen: `docs/ops/cilium-networking.md`, `cilium-quickstart.md`, `scripts/deploy-cilium.sh`, `migrate-kubeclaw-network-policies-to-cilium.sh`, `verify-cilium-policies.py` und zugehörige Cilium-Values/Policies.

## Phasen und Voraussetzungen
| Phase | Im Branch vorgesehen | Entscheidung/Nachweis vor späterer Ausführung |
|---|---|---|
| Bestand | Pipeline und Paperless-Baseline, Hostzugang/Backup, Produzenten/Argo pausieren | aktuelle CNI-/K3s-/Pod-/Service-/Policy-/CIDR-Werte erfassen; unbekannter Bestand ist Stopgrund |
| Vorbereitung | genau ein Node; cordon; K3s-/Runtime-Sandboxes koordinieren | separater Hostzugang und lokal verfügbare Recoverykonfiguration/Images müssen funktionieren |
| Cutover | Flannel und bestehende NetworkPolicy-Komponente deaktivieren, alte KUBE-ROUTER-Regeln bereinigen | keine gleichzeitig konkurrierenden Enforcer; bisherige Pod-Sandboxes nicht einfach als migriert behandeln |
| Installation | `CILIUM_K3S_READY`-Gate; nur HostNetwork-Sandboxes bereit; Cilium1.20.1, VXLAN, kubeProxyReplacement=false | CIDR10.42.0.0/16 und Node-/24 nur verwenden, wenn tatsächlicher Bestand passt |
| Policies | SPIRE/Ops-Regeln, Cluster-/Namespace-Policies anwenden und vergleichen | Policy-Revision/ready Endpoint ist kein Traffic- oder Paperless-Test |
| Freigabe | manuelles Uncordon/Anwendungswiederanlauf und Validierung | DNS, API, Storage, Tailscale, Registry, mTLS und Paperless positiv/negativ testen; dann Produzenten/Sync freigeben |

## Schutzgrenze
Der Branch nimmt unter anderem kube-system, cilium, tailscale, argocd und paperless von bestimmten Clusterregeln aus. Diese Ausnahme schützt **nicht** vor unterbrochenem Podnetz, K3s-Neustart, DNS-Ausfall oder gemeinsamem Disk-Druck. Bei einem einzelnen Node ist keine unterbrechungsfreie Migration belegt ([IFR-02-001](../cilium-migration.md)). „Paperless muss geschützt werden“ erfordert abgesicherte Daten und explizite spätere Wartungs-/Abbruchkriterien; keine implizite Freigabe eines Ausfalls aus dem Review ableiten.

Der Verifier vergleicht `spec/specs` mit live nach serverseitigem Dry-run und prüft Agent-/Endpoint-Ready/Revisionszustände. Er beweist weder jede nicht verwaltete Pod-Sandbox noch jede tatsächliche Verbindung. Das Migrationsskript behält alte Default-Deny-Regeln; additive KNP-/Cilium-Allows müssen als Gesamtheit geprüft werden. Main und Branch sind nicht automatisch kompatibel.

## Recovery und echte Verifikation
Rollback hängt von der Cutoverphase ab: K3s-/CNI-Konfiguration, Runtime-Sandboxes und alte Regeln kontrolliert zurücksetzen; ein Helm-Uninstall allein stellt Flannel und bestehende Pods nicht wieder her. Argo-Autosync darf die manuelle Recovery nicht überschreiben. Ein Ops-Pod im gestörten Netz ist keine unabhängige Rettungskonsole; vorhandenen Hostzugang separat testen.

Hier nur Shell-/Python-Syntax und statischer Ablauf geprüft; keine live Policies/Dry-runs ausgeführt. Später zuerst auf passender isolierter Umgebung migrieren und in jeder Phase abbrechen/zurückrollen. Vor/nach Cutover gleiche Paperless-Schreib-/Lese-/Hintergrundjobprobe und echte Pipeline-Kommunikation ausführen. Keine nicht erhobenen Node-/Hostdaten als geprüft eintragen.
