# Infrastrukturpfad — Pipeline-Kommunikation, Policies und Identitäten

Prüfstand: main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; statischer Trace abgeschlossen, **kein Deployment-/Live-E2E-Nachweis**. Quellenpfade beziehen sich auf diesen Commit, sofern anders angegeben. Befunde bleiben in den verlinkten Einzelreviews.

## Beidseitiger Verbindungsvertrag
| Quelle | DNS/Service → Backend | Schutz und verbleibender Nachweis |
|---|---|---|
| Nova | localhost:28891 → agent-buster:18891 → Envoy → Runtime:28891 | SPIFFE-SAN-Allow, SANITIZE_SET XFCC; Runtime akzeptiert privilegierte Requests nur vom lokalen Proxy mit erlaubtem Peer |
| Nova | localhost:28080 → agent-prism:8080 → Envoy:18082 → Bridge:18080 | Service-Port ist nicht Policy-Backend-Port; identitätsgebundene Proxykonfiguration |
| Prism Control/Worker | jeweiliger mTLS-Service:8443 → worker-trust-Sidecar → lokaler HTTP-Backend:8080 | exakte Peer-IDs via SPIRE-SDS; direkte HTTP-Services existieren, Handler-/Policy-Grenze mitprüfen |
| Rollen/Observer | Redis:6379 | Secret-basierte Auth; kein lokal aktiviertes TLS; Streams/Dedup, kein Ersatz für Journale |
| Modell-/Suchkonsumenten | LiteLLM:4000, Qdrant:6333/6334 | jeweilige Credential-/Netzkonfiguration; kein allein aus Port-Allow ableitbarer Identitätsschutz |
| Buster BuildKit | registry-local:5001 → 5000 | HTTP, kein mTLS; Node-Pulls außerhalb dieser Pod-Verbindung |
| Pods/Controller/MCP | kube-dns UDP/TCP53; Kubernetes-Service443 → möglicher Endpoint6443 | DNS-Allow vorhanden; API-DNAT-/CNI-Semantik offen |

Quellen: `my-values/infra/network-policies.yaml`, Rollen-Values, `charts/kubeclaw/templates/{service,configmap-worker-trust,deployment}.yaml`, `charts/prism/templates/{services,networkpolicy,configmap-worker-trust,workloads}.yaml`; Backend-Prüfung `remote-plan-http.ts:16–29`. Exakte Service-/SPIFFE-Namen hängen am Namespace-/ServiceAccount-Rendering. Keine Betreiber-Tailnet-Namen in diesen Trace übernommen.

## Identitäts- und Ausfallkette
Podlabel/ServiceAccount → ClusterSPIFFEID → SPIRE Agent/Server → CSI-UDS `/run/spire/sockets` → Envoy SDS → Clientzertifikat und Trustbundle → Peer-SAN → Backendautorisierung. Wer unter dem vertrauten ServiceAccount Pods ausführen darf, kann dessen Workloadidentität nutzen. Podinterne Loopback-Kommunikation setzt Vertrauen zwischen colokalisierten Prozessen voraus.

Direkter Buster-Backendaufruf von außen mit gefälschtem XFCC besteht die Loopbackprüfung nicht automatisch. Ein fertiger Bypass ist nicht nachgewiesen. Agent-Proxy TCP19000 bzw. Prism TCP8443 belegt weder aktuellen SDS-Status noch funktionierende Backend-/DB-Verbindung. Statische Envoy-ConfigMap-Änderung löst keinen sicheren automatischen Rollout aus ([IFR-07-001](../envoy.md)). SVID-Ablauf, Rotation, CA-Wiederherstellung und Widerrufsfrist bleiben [INF-06](../spire.md).

Kubernetes-Policies sind additive Allows unter Default-Deny; Agent-Egress auf 22/80/443 ist breit und enthält private Ziele. Cilium-Branch muss separat mit dem aktuellen main abgeglichen werden. [IFR-03-001](../network-dns.md) ist ein DNAT-abhängiger Verdacht, kein bewiesener API-Ausfall.

## Echte Verifikation
Später reale positive Pipelinecalls sowie negative fremde Namespace-/ServiceAccount-, Plaintext-, XFCC- und Direktbackendaufrufe ausführen. DNS UDP/TCP, API, Registry und Modellupstream unter altem und neuem CNI samt Drop-Evidenz testen. SPIRE-Ausfall über die tatsächliche SVID-TTL, Proxyneustart und Konfigurationsänderung prüfen. Statisches Rendering beweist keine Paketzustellung oder Policy-Durchsetzung.
