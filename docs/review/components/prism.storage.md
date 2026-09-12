# prism.storage — PostgreSQL-Revisionen und lokale Artefakte

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Schnittstellen, Commit

Gesamtes storage/index.ts und zehn SQL-Migrationen gelesen; Control verwendet Repository und ContentAddressedArtifactStore direkt. Migration CLI nutzt preprovisioned, Tests embedded PGlite/pgvector. migrate reserviert bei Pool eine Verbindung, BEGIN/Advisory-xact-lock vor Schema-Metadaten, führt bisher nicht registrierte Dateien lexikalisch aus und COMMIT; Name ohne Inhaltschecksum ist Versionsidentität. Infrastruktur-DDL im embedded-Modus getrennt von produktivem Bootstrap. Migration 010 archiviert unsourced Duplicates vor Uniqueindex.

Queryable erlaubt Pool oder einzelne Verbindung; inTransaction pinnt vorhandenen Poolconnect und releast finally. createDocument/createDirectionSet schreiben Revision und Pointer atomar. createDirectionSet sperrt Projekt, bindet active design request, verlangt drei verschiedene Keys/Projektidentität; Replay vergleicht Dokumentdigests, nicht Titel/Evidence. current/revision geben JSONB-Dokument ohne Digest-Neuberechnung zurück. apply/replace speichern neue Revision und CAS-update current_revision_id; Konflikt rollt Insert zurück. restore liest alte Revision und schreibt neue Nummer statt alte Zeile zu verändern. Uniqueness auf document/revision und document/digest; DB-runtime kann alte Zeilen dennoch technisch UPDATE/DELETE, also API-Unveränderlichkeit, keine privilegienerzwungene Append-only-DB.

## 4–6. Fehler, Konkurrenz, Restart

SQL-Fehler propagieren nach ROLLBACK; verlorenes COMMIT-ACK bleibt ungewiss. Retry apply auf alter Revision scheitert, createDocument auf gleichem Key ebenfalls; createDirectionSet besitzt eigens Digest-Replay. Optimistische Parallelupdates verlieren keine bestätigte Revision, aber keine automatischen Retries. Pool/SQL haben hier keine Statement-/Lockdeadlines. DB-WAL/fsync sind Postgres-Konfiguration, in diesem Review nicht als geprüft behauptet. Keine PID-/Dateilock-Reclamation erforderlich; Advisorylocks gehören DB-Transaktion. Artefakte liegen außerhalb SQL: Objekt zuerst, DB danach, Crash kann Orphans hinterlassen; umgekehrt ACK vor Dateidauerhaftigkeit siehe 001. Kein Wiederanlaufscanner für pending/Orphans. Mutable Uint8Array wird nicht vor dem ersten await kopiert; Ownership muss Aufrufer halten. Aktuelle Control-Aufrufer bauen private Buffer; kein konkreter konkurrierender Aufrufermutationstrace gefunden.

## 7–9. Vertrauen, Limits, Vereinfachung

CAS-get akzeptiert nur strikte SHA256-ID, prüft echte Inhaltsintegrität. SQL ist parametrisiert; Schema-/Actor-/Projektprüfung liegt vor Repository und Domain, replace selbst validiert kein komplettes Schema. Contentdateien und Datenbank benötigen geschützte Roots/Rollen. get/put puffern ganze Objekte; keine Storequota, Retention, freien-Speicher-Prüfung oder Garbagecollection. ENOSPC wirft, pending kann bleiben. Wiederholte große Workerinputs werden vor Replay geschrieben. Gemeinsame dauerhafte Artifact-Schnittstelle würde lokale Sonderimplementierung ersetzen (Implementationplan 3.4 verlangt Plattforminterface), statt weitere Reparaturpfade pro Service zu ergänzen.

## 10–11. Tests und Dokumentation

Originalbefehl `node --test skills/prism/tests/engine.test.mts skills/prism/tests/storage.test.mts skills/prism/tests/control.test.mts`: 13/13 bestanden. Storage: zwei recording-query-Doubles prüfen Reihenfolge/DDL-Auswahl, zwei echte eingebettete PGlite/pgvector-Fälle prüfen Migration 010, Revisionen, Restore, stale apply und lokale CAS-Runde. Kein externer Postgres, Mehrverbindungswettlauf, Powerloss oder verlorenes Commit-ACK nachgewiesen. Eigene Originalfunktionsprobe [prism-service-review-probe.mjs](../evidence/prism-service-review-probe.mjs) prüft korruptes vorhandenes CAS-Objekt, Ausgabe in zugehöriger txt. Implementationplan 3.4/3.5 vorhanden, unvollständig und bezüglich Plattformartifactintegration abweichend; keine versionierte Dateirecovery hier.

## 12. Befunde

### PCR-PRISM-STORAGE-001 — Artifact-ACK ohne dauerhaften und überprüften Inhalt

**Hoch; Evidenzklasse: nachgewiesener Defekt für korruptes Existing-ACK (Originalprobe); begründeter Verdacht für Powerlossverlust (fehlendes fsync per Code-Trace, kein Crashversuch).** index.ts:90–107 bildet Digest, schreibt pending und renamt ohne file-/directory-fsync. Existiert Ziel bereits, reicht stat ohne Inhaltsprüfung. Control kann danach SQL-Baseline/Evidence bestätigen. Auslöser: Host-/Speicherausfall nach ACK, oder vorher beschädigtes Objekt. Folge: DBreferenz zeigt fehlendes/korruptes Objekt; erneutes put korrekter Bytes bestätigt weiter denselben kaputten Bestand. Originalprobe bestätigt den zweiten Fall (put Erfolg, get digest mismatch), kein simulierter Powerloss als echter Crash ausgegeben. Ursache ist die Gleichsetzung von Nameexistenz/rename mit dauerhafter Integrität. Reparatur: unveränderlichen Input snapshotten, bestehende Bytes verifizieren, persistentes write/fsync/atomic-install/directory-fsync-Protokoll und definierte Quarantäne defekter Objekte; ACK erst danach. Regression: Originalstore auf echtem temporärem Dateisystem, vorhandene Korruption, Parallelput, Fehler zwischen write/rename/fsync und Neustart; bestätigte IDs müssen lesbar sein, fehlerhafte Writes ohne ACK und mit aufräumbarem pending enden.

Ausführungsprotokoll der ersten Testgruppe: [prism-core-review-tests.txt](../evidence/prism-core-review-tests.txt) (aus Originalausgabe transkribierte Zusammenfassung, kein nachträglich erzeugtes TAP).

Direkte Probeausgabe: [prism-service-review-probe.txt](../evidence/prism-service-review-probe.txt).

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](../prism-spikes.md).
