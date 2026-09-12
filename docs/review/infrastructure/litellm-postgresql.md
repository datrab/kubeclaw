# INF-12 — LiteLLM PostgreSQL

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Pipeline-Abhängigkeit für LiteLLM, getrennt von Prism-PostgreSQL. `my-values/infra/postgresql-values.yaml:1–14`: standalone, DB/Benutzer litellm, externes Secret mit Admin-/Benutzerpasswort, Primary-PVC 1Gi, Request 50m/128Mi und Limit 250m/256Mi. `deploy.sh:1115–1124` optionaler ungepinnter Bitnami-Chart. LiteLLM bekommt DATABASE_URL aus seinem eigenen Secret; die Secret-Erstellung muss dazu passende Werte liefern. Netzwerk: LiteLLM→PostgreSQL 5432, Postgres-Ingress erlaubt LiteLLM.

## Review
Verantwortung ist klar und vom Prism-Schema getrennt. Ungepinntes Chart bedeutet ungeklärte Image-/Major-Version, Probes-/UID-/Storage-Defaults und Updatepfad; zentral [IFR-24-001](updates-security.md). Containerlimit ist kein PostgreSQL-Speicherbudget und 1Gi keine Kapazitätsplanung. Keine HA-/Backup-/Restore-Automatisierung für diese DB im Repository gefunden. Infrastruktur-Option `KUBECLAW_DEPLOY_POSTGRESQL=false` stellt keinen externen Ersatz her: DATABASE_URL bleibt Betreiberpflicht.

## Befund IFR-12-001
**Mittel; offene Frage.** Auslöser: DB-Verlust oder Major-Upgrade mit persistentem Volume. Belege: Values, Installationsblock und fehlender zugeordneter Backup-Pfad im Deployment-Skript. LiteLLM konfiguriert `STORE_MODEL_IN_DB=True`; der gespeicherte Zustand darf daher nicht als verlustfreier Cache betrachtet werden. Ursachenbehebung: Schema-/Version-/Restorevertrag, akzeptierte Datenverlustdauer und separat geprüfte Backups für LiteLLM definieren. Test: echte DB mit repräsentativer LiteLLM-Konfiguration sichern, in kompatiblem frischem DB-Server wiederherstellen und Auth-/Modellkonfiguration prüfen.

## Prüfungen und Doku
Values und Secret-/Netzwerk-Aufrufer untersucht. Kein PostgreSQL/Helm-Upstream-Chart verfügbar gemacht, kein Backup ausgeführt. Doku `docs/deployment/litellm.md`/`infrastructure.md` braucht vollständige DB-Voraussetzungen, Credentialrotation und Upgrade-/Rollbackverfahren. Ein Helm-Rollback migriert kein DB-Majorformat zurück. Auswirkungen auf Paperless entstehen über gemeinsame Disk-/RAM-Kapazität, nicht über eine nachgewiesene gemeinsame Datenbank.
