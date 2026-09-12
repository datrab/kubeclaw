# Infrastrukturpfad — Persistenter Schreibvorgang, Neustart und Restore

Prüfstand: main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; statischer Trace abgeschlossen, **kein Deployment-/Live-E2E-Nachweis**. Quellenpfade beziehen sich auf diesen Commit, sofern anders angegeben. Befunde bleiben in den verlinkten Einzelreviews.

## Konkreter Prism-Datenpfad
1. Control verwendet `ContentAddressedArtifactStore` (`skills/prism/server/control.ts:40`) unter `/var/lib/prism/artifacts`. Bei Artefakt-/Baseline-Schreibpfaden (u.a. 419/435 und 980/991) werden Inhalt und DB-Verweis über getrennte Speicheroperationen erzeugt.
2. `charts/prism/templates/workloads.yaml:88–97` mountet den Artefakt-PVC nur im Control; PostgreSQL besitzt eigenen PVC und Secret. App UID1000 und DB UID999 benötigen jeweils korrekt bereitgestellte Volume-Rechte. Datenbankverbindung und Artefaktpfad sind gemeinsam für nutzbare Referenzen erforderlich.
3. Pod-Neustart auf erhaltenem PVC kann Zustand wieder öffnen; emptyDir `/tmp` ist flüchtig. RWO erlaubt mehrere Prozesse auf demselben Node, ist keine Writer-Sperre. Default-RollingUpdate bei Control ist deshalb separat geprüft ([IFR-20-002](../prism-workloads.md)). Neue Node-Platzierung hängt am externen Provisioner.
4. `charts/prism/templates/jobs.yaml:69–190`: pg_dump täglich → Backup-PVC100Gi → Manifest/Checksum/List → Dateien älter30Tage löschen. Wöchentlicher Restore-Proof → zusätzliche DB **im selben PostgreSQL-Dienst** → drei Tabellen lesen → aufräumen. Beide verwenden DB-Admincredential.
5. Dieser Job sichert nicht `/var/lib/prism/artifacts`. Ein restaurierter DB-Verweis kann deshalb ins Leere zeigen. Er überlebt auch nicht automatisch den Verlust des gemeinsamen Hosts/Storage ([IFR-26-001](../backup-recovery.md)).

## Weitere Zustandsverträge
| Zustand | Wiederanlauf und Verlustgrenze |
|---|---|
| Redis Streams/Dedup | Secret + eigener2Gi-PVC; ungepinnte Chartdefaults erlauben keine lokale ACK-Dauerhaftigkeitsgarantie; maxmemory/Eviction nicht explizit |
| Agent config/workspace/Journale | eigene Mounts, teilweise emptyDir je Values; fsGroup1000/gezielte Ownership; kein generischer vollständiger Backupjob |
| Buster Runtime/BuildKit | getrennte State-/Workspace-Pfade, Buildcache nicht autoritativer Release-Store; GC/Restkapazität offen |
| Registry-local | kein persistenter Volume-Mount; Containerverlust kann Images entfernen |
| LiteLLM DB/Qdrant | eigene Chartpersistenz, kein lokal kompletter Offsite-/Restore-Vertrag |
| SPIRE | Server-Quelldefault SQLite/PVC; CA- und effektive Chart-Recovery ungetestet |
| Ops-Pod | home/workspace und optional Tailnet-State getrennt; CLI-Identität nicht parallel aus demselben Restore betreiben |

## Echte Verifikation und dokumentarische Korrektur
Datenbank-Hooks laufen vor Upgrades; Helm atomic rollt externe SQL-Änderungen nicht zurück ([INF-15](../prism-postgresql.md)). Ein SQL-SELECT1-Probe belegt nicht vollständige Schema-/Artefaktkonsistenz. Keep-Annotation ist kein Backup und schützt nicht vor Namespace-/Hostverlust.

Später realen Inhalt schreiben, Digest/DB-Referenz lesen, Pod killen/neu platzieren und denselben Inhalt prüfen. Zusammengehörige Daten an definiertem Konsistenzpunkt sichern, isoliert auf anderem Ausfallbereich wiederherstellen und echten Pipelinepfad fortsetzen. Redis separat mit ACK-Verlust, Prozessabbruch und Speicherdruck prüfen. RPO/RTO, Schlüsselbedarf, Storage-ReclaimPolicy und Paperless-Reserve erst nach realer Erhebung festlegen. Hier wurde kein Dienst gestartet oder Restore ausgeführt.
