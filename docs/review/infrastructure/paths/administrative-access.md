# Infrastrukturpfad — Externer administrativer Zugriff und Recovery

Prüfstand: main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; statischer Trace abgeschlossen, **kein Deployment-/Live-E2E-Nachweis**. Quellenpfade beziehen sich auf diesen Commit, sofern anders angegeben. Befunde bleiben in den verlinkten Einzelreviews.

## Drei getrennte Wege
| Weg | Verbindung und Berechtigungen | Grenze |
|---|---|---|
| Standalone Ops-MCP | Tailnet ACL/Grant → Operator-Ingress → Service:8080 → MCP HTTP → projizierter SA → API | optionale Bearer-Auth, clusterweite lesende Rechte einschließlich Logs; keine Sync-/Reparaturrechte |
| Ops-Pod | Benutzer-/Remote-Anmeldung → Codex-Supervisor; localhost:8080 Bearer → MCP-Sidecar → API | nur MCP mountet Token/CA; namespaced get/list, Nodes/CCNP lesen; Codex erhält keine direkte kubeconfig |
| Separater Hostzugang | vom Nutzer vorhandener externer Hostzugang → lokale Cluster-/CNI-Recovery | nicht von Helm/Argo/Tailscale bereitgestellt; tatsächlicher Offline-/Netzwerkausfallzugang nicht getestet |

Quellen: `my-values/infra/ops-mcp.yaml` Service/Ingress/RBAC/Policy, `tools/ops-mcp/`, `charts/ops-pod/templates/workload.yaml`, RBAC-/Policy-Templates, `ops/pod/{bootstrap.py,supervisor.py,config.toml}` und Deploymenthelper. Der Ops-Pod läuft mit UID/GID/fsGroup1000; home 2Gi, workspace 20Gi. Optionaler Tailscale-Sidecar nutzt userspace/SOCKS und eigenen State, nicht die Operator-Privilegien.

## Bootstrap, Rechte und Fehler
OAuth-Secret und Tailnet-Regeln sind extern; installierter Operator beweist keine erlaubten Clients. Standalone MCP ohne gesetzten Bearer verlässt sich auf vorgelagerte Erreichbarkeit. Seine Log-Leserechte können auch Paperless-/fremde Anwendungsdaten offenlegen ([INF-27](../ops-mcp.md)). Ops-Pod API-Ziele werden aus realen Endpunkten gebunden; 443-only Standalone-Policy bleibt DNAT-Frage ([INF-03](../network-dns.md)).

Tokenrotation wird im MCP pro Request gelesen; Prozess-Bearerrotation erfordert abgestimmten Neustart. Prozess-Readiness/Pairingstatus ersetzt keinen erfolgreichen Benutzerdurchgriff. Weder Argo noch MCP müssen Schreibrechte erhalten, nur um Host-Recovery zu ermöglichen. Dafür ist der getrennte Hostzugang zuständig ([INF-28](../ops-pod.md)).

## Echte Verifikation
Lokale MCP-Prozess-/HTTP-/Diagnosetests bestanden; fehlende Kubernetescredentials ergaben ehrliche Fehler, keinen simulierten Clustererfolg. Später zulässigen Benutzerzugriff und verbotenen Tailnet-Client testen; API-Lesezugriff sowie verbotene Mutationen/Secretlesezugriffe pro tatsächlicher Rolle prüfen. Argo, Operator/Tailscale, DNS und CNI einzeln ausfallen lassen und unabhängigen Hostzugang demonstrieren. CLI-Anmeldung und Recovery bleiben live offen.
