# INF-26 — Backup, Restore und Disaster Recovery

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und echte Abdeckung
`charts/prism/templates/jobs.yaml:69–190`: täglicher pg_dump auf prism-backups-PVC, Listing-/Checksum-/Manifestprüfung, Löschung älterer Dateien nach 30 Tagen. Wöchentlicher Restore-Proof legt eine Prüf-DB im selben PostgreSQL-Dienst an, restauriert Dump, liest drei Tabellen und räumt mit Trap auf. Beide Jobs benutzen postgres-Zugang; keine externe Restoreumgebung und kein Offsite-Backup. Backup-PVC 100Gi; gleiche StorageClass-Auswahl wie Artefakte, nicht zwingend wie DB.

Prism-Artefakte sind separater PVC `/var/lib/prism/artifacts`; Nova-/Buster-/Prism-Agent-Journale, Runtime-Receipts, Ops-home/workspace, SPIRE-CA und LiteLLM-DB sind weitere Zustände. `docs/ops/ops-pod.md` verlangt korrekt externes Storage-Backup und keine parallele Wiederherstellung derselben CLI-Identität. K3s-Datastore, Secrets und Paperless-Backups sind extern vorausgesetzt, nicht implementiert/verifiziert.

## Befund IFR-26-001
**Hoch; nachgewiesene unvollständige Wiederherstellungsabdeckung.** Auslöser: Verlust des Artefakt-/Host-Volumes oder Wiederaufbau mit ausschließlich vorhandenem DB-Dump. Belege: Backupjob mountet nur Backup-PVC und liest PostgreSQL; `workloads.yaml` mountet Artefakte ausschließlich im Control. `prism-recovery-observability-v1.md` beschreibt zusätzlich versionierten Artefaktspeicher, der im Chart nicht als entsprechender Backupdienst umgesetzt ist. DB-Referenzen können nach Restore auf fehlende Binär-/Designobjekte zeigen.

Ursachenbehebung: konsistente Backupgruppe aus DB, Artefakten und erforderlichen Schlüsseln/Journals mit dokumentiertem Commit-/Quiesce-Punkt, externem Ausfallbereich und überprüfter Retention. Echter Test: vollständiger Wiederaufbau in anderem Namespace/Host aus gesicherten Artefakten; referenzierte Digests lesen, Sessions/Jobs sinnvoll wiederaufnehmen und Pipeline-/Prism-Pfad ausführen. Nicht nur pg_restore --list.

## Wiederanlauf, Kapazität und weitere Grenzen
Restore-Proof teilt Last und Adminrechte mit Produktions-DB; Namen sind fest. Forbid gilt je CronJob, verhindert nicht Backup/Restore-Überlappung untereinander. Erfolgreiche Tabellen-Counts beweisen keine referenzielle Vollständigkeit aller Artefakte oder Node-DR. 30-Tage-Retention kann 100Gi überschreiten; keine Alarmierung/Dumpgrößenplanung. Ohne verfügbare Kube-/Storage-Secrets kann Helm keine Daten wiederherstellen.

Job-/Template-/Runbookreview abgeschlossen; keine DB-Sicherung oder Restoreprobe ausgeführt. Dokumentation muss RPO/RTO als noch festzulegend markieren, Restore-Reihenfolge und unabhängigen Hostzugang konkretisieren; keine erfundenen zugesicherten Zeiten. [Datenpfad](paths/persistence-restore.md).
