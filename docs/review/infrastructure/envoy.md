# INF-07 — Envoy, mTLS und lokale Vertrauensgrenzen

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Authentifizierung
Pipeline-Abhängigkeit. `charts/kubeclaw/templates/configmap-worker-trust.yaml`, `charts/prism/templates/configmap-worker-trust.yaml`, beide Workload-Templates, `versions.json:infrastructure.envoy`; Image v1.39.0 mit Digest. Eingeschaltet in Betreiber-Values, optional im generischen Chart. Envoy verlangt Client-Zertifikat, exakte URI-SANs und SDS-Trust-Bundle über lokalen SPIRE-Socket.

Nova: loopback 28891 → agent-buster:18891 → Buster-loopback 28891. Nova: loopback 28080 → agent-prism-Service:8080 → Envoy:18082 → Bridge:18080. Prism-Control/Worker tauschen Verkehr via mTLS:8443 aus. Service-Port, targetPort und Policy-Backend müssen unterschieden werden. Ressourcen je Proxy durch Values, tmp als emptyDir; kein eigener dauerhafter Envoy-Zustand.

Buster lauscht technisch auf 0.0.0.0 für kubelet-Probes (`buster-runtime-entrypoint.sh:171`), geschützte Handler verlangen aber `authorizeProxiedSpiffePeer` mit Loopback-Quelladresse und erlaubter XFCC-Identität (`remote-plan-http.ts:16–29`). Envoy setzt XFCC per SANITIZE_SET neu. Ein direkter externer Request mit selbstgesetztem XFCC ist deshalb nicht automatisch ein Bypass. Colokalisierte Prozesse teilen hingegen die Pod-Netzwerk-Vertrauensgrenze.

## Befund IFR-07-001
**Mittel; nachgewiesene Rollout-Lücke.** Auslöser: Änderung der generierten Envoy-Peer-/Routing-Konfiguration bei unverändertem PodTemplate. Agent-Deployment `deployment.yaml:23–35` berechnet Checksums für Gateway/Swarm/Skills/Workspace, aber nicht für Worker-Trust-ConfigMap. Prism-Deployment hat ebenfalls keinen ConfigMap-Checksum. Envoy erhält eine statische Bootstrap-Datei per Mount; SDS rotiert Secrets, nicht diese statischen Listener/Cluster.

Folge: Helm-/GitOps-Konfiguration kann geändert sein, während laufender Proxy alte Vertrauens-/Routing-Konfiguration verwendet. Ursachenbehebung: deterministischen Pod-Rollout an Bootstrap-Inhalt koppeln oder bewusst eine vollständig dynamische Konfigurationsquelle einführen; kein zweiter Reload-Shim. Test: erlaubte Peer-ID ändern, Release aktualisieren, Pod-/Envoy-Konfiguration und Ablehnung der alten Identität prüfen.

## Health, Recovery und Tests
Agent-Proxy-Healthlistener beantwortet 19000 pauschal 200; die kubelet-Probe prüft dort nur TCP; Prism nutzt TCP 8443. Beides belegt keine erfolgreiche SDS-Erneuerung oder funktionierenden Peer. Zentraler Health-Befund [INF-25](observability.md). Envoy-Neustart benötigt verfügbare CSI/SDS; abgelaufene SVIDs sind nicht als funktionierend anzunehmen.

Echtes Helm-Rendering bestanden. Vorhandenes `check-envoy-image.sh` prüft echte Envoy-TLS-Verbindungen, benötigt Docker und wurde hier mangels Docker nicht ausgeführt. Cluster-Test `tests/verification/live/worker-trust-cluster-e2e.sh` nicht ausgeführt. Dokumentation muss Bootstrap-Reload, Ablauf/Widerruf, ausstehende SDS-Readiness und Colokalisierung erläutern.
