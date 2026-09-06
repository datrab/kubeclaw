# INF-20 — Prism-Dienste, Helm-Hooks und Infrastrukturverträge

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Verbindungsmatrix
`charts/prism` stellt Control, Studio, Worker, optionale Ingestion, PostgreSQL, Hook-Jobs, Artefakt-/Backup-PVCs, SAs, PDBs, Services und Policies bereit. Betreiber-Values wählen Service-Digests und SPIFFE; generische Defaults fehlen bewusst erforderliche Digests/DB-Secret. `deploy.sh prism` installiert Dienste vor Agent. Control besitzt DB-/Artefakt-/Session-/Ingresszugang, Worker DB/Control, Studio nur Control/Ingresssecret, Ingestion eigenes Secret und Quarantäne.

Ports: Studio-Service 80→8080; Control/Worker 8080 öffentlich innerhalb ihrer Policy, geschützte interne Verbindungen via Envoy 8443; Agent-Bridge 18082. Requests/Volumes bei [INF-16](storage.md). Optional postgresql=false benötigt externen Schema-/Networkvertrag. PDB minAvailable:1 bei einer Replik schützt vor freiwilliger Eviction, kann aber Drain blockieren und schützt nicht vor CNI-Ausfall.

## Befund IFR-20-001
**Mittel; nachgewiesene fehlende Ressourcenbegrenzung.** Auslöser: ingestion.enabled=true. `templates/ingestion.yaml` definiert keine CPU-/Memory-Requests/Limits, lediglich 4Gi emptyDir. Render der aktivierten Variante bestätigt 0 angeforderte CPU/Memory. Die Ingestion verarbeitet externe Inhalte; weder Ressourcenplanung noch Begrenzung erfolgt lokal, außer ein externer LimitRange greift.

Ursachenbehebung: sinnvolle konfigurierbare Requests/Limits sowie Liveness/Abbruch- und Quarantäne-Retention passend zum Importvertrag festlegen. Echter Test: große/defekte Inputs mit realem Dienst, maximale RAM-/CPU-/Disknutzung, Ablehnung/Abbruch und Recovery nach OOM beobachten.

## Befund IFR-20-002
**Mittel; begründeter Rollout-Verdacht.** `workloads.yaml:1–13` erzwingt control.replicas=1 wegen RWO, lässt aber Deploymentstrategie ungesetzt. Kubernetes-RollingUpdate kann kurzzeitig alte und neue Control-Pods überlappen bzw. bei anderer Node-Zuordnung am RWO-Attach scheitern. Der Replica-Check beweist keine Einzelwriter-Garantie.

Ursachenbehebung: fachlich entscheiden, ob Control konkurrierende Instanzen unterstützt; sonst einen tatsächlich exklusiven Rollout wählen. Test: echter Upgrade-Rollout mit aktivem Artefaktschreiben, gezieltem Scheduling auf anderen Node und kontrolliertem Scheitern der neuen Instanz. Keine behauptete Korruption ohne diesen Nachweis.

## Verifikation und Doku
Betreiber-Render, ingestion=true und SPIFFE=false bestanden; optionale Netzwerk-/Auth-Kombinationen sind statisch, nicht live geprüft. `docs/operations/prism-operator-guide.md` enthält widersprüchliche Aussagen zu mutable latest bei bereits digestgepinnter Dienstkonfiguration; Architektur beschreibt teils externen versionierten Artefaktspeicher statt lokalem PVC. Backup-/Hook- und Proxy-Rollout-Befunde bei INF-15/26/07. Fehlende Belege: vollständige Erstinstallation, Job-Readiness, PDB-Verhalten, Browser-Ressourcen und Tailscale-Ende-zu-Ende.

[Deployment-Referenz](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy): RollingUpdate/Surge kann zusätzliche Pods während des Updates erzeugen. Das begründet den Rollout-Verdacht, ersetzt aber keinen Test mit der tatsächlich eingesetzten Kubernetes-/Storage-Version.
