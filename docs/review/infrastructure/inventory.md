# Infrastruktur-Inventar

Baseline und Branchabgrenzung: [Leitfaden](README.md). **29/29 Einheiten statisch abgeschlossen**; 0 live verifiziert. Die verlinkten Einzelreviews enthalten die vollständigen Inventarfelder einschließlich Installations-/Versionsquelle, Verbraucher, Rechte, Netzwerk, Zustand, Ressourcen, Tests und Dokumentationslücken. „Abgeschlossen“ bedeutet untersucht, nicht fehlerfrei.

| ID / Review | Verantwortung | Einordnung | Implementierung | Dokumentation | Review / Commit |
|---|---|---|---|---|---|
| [INF-01](cluster-bootstrap.md) | K3s, Nodes und Bootstrap | allgemein | extern vorausgesetzt | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-02](cilium-migration.md) | Cilium und CNI-Migration | allgemein | separater Branch | vorhanden / unvollständig | abgeschlossen / 1313cc3a |
| [INF-03](network-dns.md) | Policies, DNS, API und externe Erreichbarkeit | beides | implementiert | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-04](tailscale.md) | Tailscale Operator und Ingress | allgemein | implementiert / extern vorausgesetzt | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-05](argocd.md) | Argo CD und GitOps-Zuständigkeit | allgemein | Bootstrap implementiert | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-06](spire.md) | SPIRE, CSI und Identitätsausstellung | Pipeline | implementiert / optional | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-07](envoy.md) | Envoy, mTLS und lokale Vertrauensgrenzen | Pipeline | implementiert / optional | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-08](registry-local.md) | Schreibbare lokale OCI-Registry und Node-Pull-Pfad | Pipeline | implementiert / externer Pull-Pfad | veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-09](registry-mirror.md) | Docker-Hub-Mirror | Pipeline | implementiert | veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-10](buildkit.md) | BuildKit, Build-Isolation und Cache | Pipeline | implementiert / optional | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-11](redis.md) | Redis und Stream-Verträge | Pipeline | implementiert | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-12](litellm-postgresql.md) | LiteLLM PostgreSQL | Pipeline | implementiert / optional | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-13](qdrant.md) | Qdrant | Pipeline | implementiert / optional | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-14](litellm.md) | LiteLLM und Modellzugang | Pipeline | implementiert / optional | veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-15](prism-postgresql.md) | Prism PostgreSQL und Datenbankmigration | Pipeline | implementiert / optional | vorhanden / veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-16](storage.md) | Volumes, StorageClasses, UID/GID und Kapazität | beides | implementiert / Storage extern | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-17](secrets.md) | Secrets, Credentials und Rotation | beides | implementiert / extern provisioniert | unvollständig | abgeschlossen / 85ddfcbf |
| [INF-18](namespace-broker.md) | Namespace-Broker, RBAC, Admission und Quotas | Pipeline | implementiert / optional | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-19](role-workloads.md) | Nova/Buster/Prism-Agent Laufzeit und Helm-Konfiguration | Pipeline | implementiert | vorhanden / veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-20](prism-workloads.md) | Prism-Dienste, Helm-Hooks und Infrastrukturverträge | Pipeline | implementiert | vorhanden / veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-21](runtime-images.md) | Runtime-Dockerfiles, Packaging und Build-Kontexte | Pipeline | implementiert | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-22](ci-build.md) | GitHub Actions und Image-/Bundle-Veröffentlichung | beides | implementiert | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-23](release-promotion.md) | Digest-Receipts und Release-Promotion | beides | implementiert | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-24](updates-security.md) | Versionen, Renovate und Sicherheitsdatenbanken | beides | implementiert | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-25](observability.md) | Monitoring, Logs, Healthchecks und Alarmierung | beides | teilweise implementiert | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-26](backup-recovery.md) | Backup, Restore und Disaster Recovery | beides | teilweise implementiert / extern | vorhanden / veraltet / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-27](ops-mcp.md) | Eigenständiger Ops-MCP und Secure Tunnel | allgemein | implementiert / optional | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-28](ops-pod.md) | Ops-Pod, lokale MCP-Seite und Recovery-Grenzen | allgemein | implementiert / optional | vorhanden / unvollständig | abgeschlossen / 85ddfcbf |
| [INF-29](public-config.md) | Betreiberkonfiguration, Altbestände und Veröffentlichungsvorbereitung | beides | implementiert / dokumentiert | veraltet / unvollständig | abgeschlossen / 85ddfcbf |

[Konkrete Quellen-/Dokumentationsabdeckung](source-coverage.md) · [Ausgeführte Prüfungen und Grenzen](verification.md) · [Übergabe](handoff.md). Alle sechs Infrastrukturpfade statisch abgeschlossen; offene echte Betriebsnachweise sind dort explizit zugeordnet.
