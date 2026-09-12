# INF-03 — Policies, DNS, API und externe Erreichbarkeit

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und beidseitige Prüfung
Pipeline- und allgemeine Infrastruktur. `my-values/infra/network-policies.yaml` setzt namespaceweiten Ingress-/Egress-Deny, UDP/TCP 53 zu kube-dns und explizite Dienstregeln. `charts/prism/templates/networkpolicy.yaml` ergänzt Prism-Peers und DB-/Studio-Pfade. Installation: `deploy.sh:1177–1178`, Prism über Helm. Kubernetes-NetworkPolicy-API ist implementiert; tatsächlicher Enforcer und API-DNAT-Verhalten sind extern.

Agenten kommunizieren auf 18789/18790, Nova→Buster auf 18891, Nova→Prism-Agent auf Backend 18082. Redis 6379, Qdrant 6333/6334, LiteLLM 4000 und Registry 5000/5001 sind beidseitig zugeordnet. Prism-Service 8443 wird per identitätsabhängigen Regeln zugeordnet; DNS ist explizit erlaubt. Policies gelten für Pods, nicht für containerd-Host-Pulls. Buster-Namespace-Controller trägt ebenfalls `app.kubernetes.io/name=kubeclaw` und wird von der Agent-Egress-Regel erfasst.

## Befund IFR-03-001
**Mittel; begründeter Verdacht.** Auslöser: API-Service 443 wird vor Policy-Prüfung auf einen Host-/Endpoint-Port 6443 übersetzt. Beleg: allgemeines Agent-Egress `network-policies.yaml:110–121` und eigenständiges MCP-Egress `ops-mcp.yaml:157–171` erlauben nur 443, keinen expliziten API-Endpoint-Port. Lease-Controller und MCP benötigen API-Zugriff. Das Verhalten hängt vom tatsächlich eingesetzten Enforcer und DNAT-Pfad ab; kein bewiesener Live-Ausfall.

Ursachenbehebung: API-Endpunkt und Vor-/Nach-DNAT-Policy-Vertrag explizit modellieren; bei Cilium `kube-apiserver`-Entity statt pauschaler Internet-Allow. Test: echte API-Aufrufe mit jeweiligem SA aus Controller, Nova und MCP, dazu negative private Ziele; Paket-/Drop-Evidenz unter altem und neuem CNI.

## Isolation, Ausfälle und Dokumentation
Agent-Egress `0.0.0.0/0` auf 22/80/443 enthält private Adressen; keine FQDN-Isolation. LiteLLM/Archviewer und Registry erlauben breite Quellbereiche; Zielzugriff ist nicht gleich Authentifizierung. Relevante Risiken sind bei [INF-14](litellm.md), [INF-18](namespace-broker.md) und [INF-27](ops-mcp.md) geführt. Keine globale Host-Firewall wird eingerichtet. IPv6-Vertrag fehlt.

Bei Redis-/DNS-Ausfall helfen Allow-Regeln nicht; Readiness und Wiederaufnahme separat prüfen. Cilium-Branch nutzt andere Policy-Arten und muss mit main zusammengeführt/nachgeprüft werden, kein impliziter vollständiger Ersatz.

Vorhandene Deployment-Prüfung mit echtem Helm und Schema-Gate bestanden; Source-Regelprüfungen und darin enthaltene Test-Doubles beweisen keine Enforcer-Semantik. Keine Pakete im Cluster gesendet. Doku braucht vollständige Verbindungsmatrix einschließlich Host, Tailscale-Proxy, API und öffentlicher Dienste. [Kommunikationstrace](paths/pipeline-communication.md).

## Befund IFR-03-002 — Archviewer außerhalb des Tailnet-Authentifizierungspfads
**Mittel; begründeter Expositionsverdacht.** Auslöser: Node-Port ist für nicht vertraute Clients erreichbar und `/designs` enthält schützenswerte Projektartefakte. `my-values/nova-values.yaml:92–94` setzt NodePort30456; `service-extra-nodeports.yaml` erzeugt einen separaten NodePort-Service auch bei primärem ClusterIP. `network-policies.yaml:141–149` erlaubt Backend3456 aus 0.0.0.0/0. `docker/archviewer.nginx.conf:1–12` aktiviert Directory Listing, ohne TLS oder Authentifizierung. Damit ist im Repository ein eigener ungeschützter Artefaktzugang vorgesehen; eine öffentliche Internet-Erreichbarkeit oder vertraulicher Liveinhalt ist nicht nachgewiesen.

Ursachenbehebung: beabsichtigte Lesergruppe festlegen und Archviewer über denselben authentifizierten Zugang führen bzw. den NodePort bei fehlendem Bedarf entfernen; externes Host-Firewallvertrauen ausdrücklich dokumentieren. Echter Test: zulässiger Client kann Artefakte lesen, unzulässiger LAN-/Tailnet-/externer Client erhält keinen Zugriff auf Listing oder Dateien, einschließlich direktem NodePort.

Die offizielle [NetworkPolicy-Referenz](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors) lässt die Reihenfolge von Adressübersetzung und Policy-Prüfung implementationsabhängig. Daraus wird keine konkrete CNI-Version oder Live-Regeldurchsetzung abgeleitet.
