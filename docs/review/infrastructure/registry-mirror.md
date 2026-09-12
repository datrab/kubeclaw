# INF-09 — Docker-Hub-Mirror

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Pipeline-Abhängigkeit. `my-values/infra/registry-mirror.yaml`: Distribution `registry:2`, Pull-through-Konfiguration `REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io`, ClusterIP:5000, 5Gi RWO-PVC unter `/var/lib/registry`, eine Replik, Request 50m/64Mi, Limit 500m/256Mi. HTTP-/v2-Probes vorhanden. Installation: `scripts/deploy.sh:1161–1165`. Docker-Hub-Upstream, Node-Storage und DNS sind extern. Policy lässt Agenten/private Netze herein und HTTP/HTTPS hinaus.

## Befund IFR-09-001
**Mittel; nachgewiesene Client-/Dokumentationsabweichung.** Auslöser: Erwartung, dass alle Image-Pulls den Mirror verwenden. Kommentar beschreibt einen transparenten Cluster-Cache; aber die überprüfte aktive BuildKit-Konfiguration `docker/buster-runtime-entrypoint.sh:11–18` enthält nur den schreibbaren Registry-Eintrag. Die Node-Konfiguration `k3s-registries.yaml` enthält ebenfalls ausschließlich den Legacy-Local-Registry-Pfad. Ein laufender Mirror allein ändert keinen tatsächlichen Client.

Auswirkung: Cold Pulls, Upstream-Rate-Limits und Ausfälle bleiben auf diesen Pfaden direkt wirksam; GHCR und private Images sind ohnehin nicht durch Docker-Hub-Proxy abgedeckt. Keine Aussage, dass extern kein Client eingerichtet wurde. Ursachenbehebung: alle Clients und Registry-Domänen explizit erfassen und nur tatsächlich genutzte Mirrors dokumentieren/konfigurieren. Test: frischen Build und uncached Node-Pull durchführen, Requests am Mirror belegen, Upstream sperren und Cache-Hit sowie Cache-Miss getrennt prüfen.

## Sicherheit, Zustand und Betrieb
Kein Auth/TLS im Manifest; Cache ist keine private Push-Registry und kein BuildKit-Layer-Cache. Single PVC/Replica begrenzt Verfügbarkeit, 5Gi ohne explizite Cache-Retention/GC-Policy verlangt Disk-Beobachtung. `REGISTRY_STORAGE_DELETE_ENABLED` ist allein kein dokumentierter Garbage-Collection-Lauf. PVC-Restore dient Beschleunigung, darf nicht als Wiederherstellung einer schreibbaren Produktionsregistry dargestellt werden. Registry-Tags sind ungepinnt; [Versionsreview](updates-security.md).

Untersucht: Manifest, Deployment-Aufrufer, aktive BuildKit- und Node-Konfiguration, Netzwerkregeln und knappe Infrastruktur-Dokumentation. Statische Prüfungen; kein echter Pull/Cache-Miss-Test ausgeführt. Doku braucht Client-Matrix, TLS/Auth-Entscheidung, Quota/GC, Upstream-/Private-Image-Verhalten und Backup-Einstufung.
