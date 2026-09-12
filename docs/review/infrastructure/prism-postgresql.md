# INF-15 — Prism PostgreSQL und Datenbankmigration

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Bootstrap
Dedizierte Pipeline-Datenbank; kein gemeinsamer LiteLLM-Dienst. `charts/prism/templates/postgresql.yaml` setzt pgvector/pg17 mit Digest, StatefulSet:1, UID/GID/fsGroup 999, PGDATA als Kindverzeichnis auf 100Gi-RWO. Request 500m/1Gi, Limit 4 CPU/8Gi. Secret enthält Admin-/Runtime-/Migrator-/Readonly-Zugang; Node-Dienste erhalten runtime-url, Migration separat admin-url/migrator-url. Netzwerk 5432 nur von zugeordneten Prism-Pods.

`templates/jobs.yaml:1–67` führt `post-install,pre-upgrade`-Hook aus: erst `bootstrap-database.ts` mit Adminrechten, dann `migrate.ts` mit Schema-Migrator. Rollen werden auch auf bestehender DB korrigiert, nicht nur durch einmalige entrypoint-init. Admin-Bootstrap hat begrenzte Verbindungswiederholungen. Services/SA bestehen beim Post-install-Hook; Worker nutzt deshalb zunächst /health statt schemaabhängiger Readiness.

## Befund IFR-15-001
**Mittel; nachgewiesene Dokumentationsabweichung und Rollback-Risiko.** Auslöser: pre-upgrade-Migration/Passwortänderung gelingt, nachfolgendes Helm-Upgrade scheitert. `jobs.yaml` führt Änderungen vor Rollout aus; `bootstrap-database.ts:24–48` ändert Rollen/Passwörter und Grants. `docs/operations/prism-operator-guide.md` beschreibt atomare Upgrades als Erhalt der letzten gesunden Release. Kubernetes-/Helm-Rollback stellt jedoch weder Datenbankänderungen noch alte Passwörter zurück.

Ursachenbehebung: kompatible Expand/Contract-Migrationen, Credential-Übergangsstrategie und DB-Backup-/Rollbackgrenzen dokumentieren; nicht aus `--atomic` Datenbankatomizität ableiten. Echter Test: reale pgvector-Version, Migration durchführen, absichtlich nachfolgenden Pod-Rollout scheitern lassen, alte Anwendung/alte Credentials gegen veränderte DB und Restorepfad prüfen.

## Betrieb und Verifikation
PGDATA-Unterverzeichnis passt zur nicht-root initialisierten PVC, kann aber providerabhängige fsGroup-/Chown-Prüfung nicht ersetzen. Replica=1 und pg_isready sind keine HA-/Datenintegritätsgarantie. Postgresql.enabled=false schaltet lokale DB, Migration und DB-CronJobs gemeinsam ab; externer Betreiber muss Rollen/Schemas/Backup bereitstellen und Netzwerkregeln anpassen, die standardmäßig weiterhin lokale Pod-Labels verlangen.

Echtes Helm-Rendering der Betreiber-Values und Variante ohne SPIFFE bestanden; kein PostgreSQL-Prozess gestartet. Backups/Restore-Proof bei [INF-26](backup-recovery.md). Doku muss Adminrechte der Jobs (tatsächlich postgres statt bloß separat eingeschränktem Backup-Rollenmodell), externe DB-Option und Major-Upgrades konkretisieren.
