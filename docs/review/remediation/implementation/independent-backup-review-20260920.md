# Unabhängige Backup-Teilprüfung — 2026-09-20

Scope: manueller Retention-Slice im bestehenden `prism-backup.sh`, beide
Backup-Testdateien, Retention-Runbook, Pflichtmatrix und ursprüngliche Rohbelege.
Der Reviewer hat diese Implementierung nicht erstellt. Keine IFR-26-001-Abnahme.
Ausgangscommit: `cd9f235345f5fd8736a2ffe75d806288e4d538db`, uncommitteter Stand,
Node v24.21.0 auf Linux; native Werkzeuge/Server wie in der Implementierungsmatrix.

Die normale Freigabe prüft Copy und Original, schützt die lexikalisch letzte
Gruppe und explizite Marker und serialisiert kooperierende Schreiber. Reale
Dateisystemtests bestehen. Die Wiederaufnahme bindet jedoch nicht an die vor
Unterbrechung freigegebene Inhaltsidentität. Der native Nachweis hatte außerdem
einen ungeklärten Fehlversuch vor erfolgreicher Wiederholung.

## B1 — P2: Resume akzeptiert eine andere Copyidentität

In `retire_group` wird beim vorhandenen `.retiring-<name>` lediglich die neu
übergebene Copy gegen den neu übergebenen Digest geprüft. Der Digest der vor
Rename geprüften Originalgruppe wird nirgends außerhalb der teilweise löschbaren
Tombstone gespeichert. Eine Wiederholung kann deshalb eine andere gleichnamige,
in sich gültige Copy autorisieren, obwohl diese das ursprüngliche Recoveryset
nicht enthält. Das ist eine fehlende Recoveryinvariante, keine Behauptung eines
Angriffs durch einen ohnehin vollständig privilegierten Operator.

Eigenständig ausgeführtes Gegenbeispiel:

1. Gültige Gruppen `backup-001`, `backup-002` und identische Copy von `001` erzeugen.
2. Den echten Produktionsbefehl `retire` direkt am ersten rekursiven `rm` per
   SIGKILL unterbrechen, nachdem Rename und Sync tatsächlich erfolgt sind.
3. Die Copy durch eine andere, vollständig gültige gleichnamige Gruppe ersetzen;
   deren neuer Dump enthält andere Bytes, Manifest und erwarteter Digest passen.
4. Resume mit dem neuen Digest: Exit 0 und `PRISM_BACKUP_RETIRED:backup-001`.
   Die Originaltombstone ist gelöscht, obwohl keine identische Copy mehr existiert.

[Reproduzierbarer Prüfcode](../../evidence/independent-backup-20260920/independent-backup-resume.py)
und [Ausgabe](../../evidence/independent-backup-20260920/resume-counterexample.txt)
liegen vor. Der Prüfcode erzeugt nur private temporäre Gruppen und nutzt die echte
Produktionsfunktion; die Dumpbytes sind bewusst Fixtures für die Inhaltsbindung,
kein SQL-Nachweis. Der bestehende Resume-Test erkennt diesen Fall nicht, da er
nur einen falschen erwarteten Digest gegen die unverändert richtige Copy prüft.

Abhilfe: ursprüngliche Auswahl und Inhaltsidentität crashfest außerhalb der
Löschmenge festhalten, bei jeder Wiederaufnahme damit vergleichen und widersprüchliche
Zustände erhalten. Gezielter Test muss den Wechsel auf eine andere gültige Copy
abweisen. Der eigene Recoveryzustand benötigt ebenfalls klar geprüfte Crashgrenzen.
Ein bloßer zusätzlicher Copy-Hash ohne Bezug zur ursprünglichen Auswahl genügt nicht.

## B2 — P2 für Abnahme: Native Wiederholung hat ungeklärten Fehlversuch

Erster unabhängiger Lauf mit exakt dem dokumentierten Environment endete nach
etwa 2,7 Sekunden mit `terminating connection due to administrator command`.
Vier weitere gleichartige Exceptions wurden als asynchrone Aktivität nach
Testende gemeldet. Ergebnis: 0 bestanden, 1 fehlgeschlagen. Der nächste Lauf
bestand 1/1 nach etwa 2,1 Sekunden. Die Server liefen durch; ihre Logs zeigen
keinen Neustart, sondern fünf FATAL-Verbindungsbeendigungen auf dem Quellserver
um 19:55:43 UTC. Root bestätigte, die Datenbanken nicht verändert zu haben.

Das `DROP DATABASE ... WITH (FORCE)` im Testcleanup ist ein möglicher Zusammenhang,
aber keine bewiesene Ursache. Vor lokaler Abnahme den ursprünglichen Fehler und
noch laufende Poolarbeit sichtbar machen und Ursache klären. Insbesondere darf
Cleanup den ursprünglichen Fehler nicht verdecken. Ein grüner Wiederholungslauf
allein erfüllt A5 nicht. Die ursprüngliche Toolausgabe liegt im Reviewdialog;
[Quellserverlog](../../evidence/independent-backup-20260920/source-server.log) und
[Zielserverlog](../../evidence/independent-backup-20260920/target-server.log) sind
archiviert; die vollständige erste Testausgabe wurde nicht separat in eine Datei
umgeleitet. Diese Beleggrenze bleibt ausdrücklich sichtbar.

## Bestätigte Wirkung und Grenzen

- Dateisystemsuite unabhängig erneut ausgeführt: 10/10, keine Skips. Die Tests
  verwenden echte Dateisystemoperationen, Lockkonflikt, Timeout und SIGKILL;
  PostgreSQL-Kommandos darin sind ehrlich gekennzeichnete Fixtures. Helm rendert
  das tatsächliche Skript in den bestehenden ConfigMap-/CronJobpfad. Es entsteht
  kein paralleler Produktivpfad und keine automatische Löschroutine.
- Normalfall prüft beide Manifestinhalte und Original-/Copyobjekte. Falscher
  Digest, falsche Wurzel, Corruption, Marker und aktuelle Gruppe werden geschützt.
  Der Code nimmt den Copylock nichtblockierend, sodass gegensätzliche
  Freigaberichtungen keinen gegenseitigen endlosen Lockwait erzeugen. Das beweist
  keine Sicherheit gegen unkoordinierte Änderungen privilegierter Dateieigentümer;
  die Doku verlangt korrekt kooperierende Writer und Markerpflege unter Lock.
- Wiederaufnahme einer unverändert ausgewählten Copy funktioniert einschließlich
  partiell fehlender Tombstonedateien. Erfolgreich abgeschlossene Freigabe hat
  keinen zusätzlichen Erfolg beim erneuten Aufruf: fehlender Zustand scheitert.
  Incomplete-Cleanup verwirft nur explizit gewählte private Namen, nicht nach Alter.
- Der erfolgreiche native Wiederholungslauf verwendet zwei echte PostgreSQL-18.6-
  Server mit unterschiedlichen Systemidentitäten und Datenverzeichnissen, originale
  Migrationen, RevisionRepository und ArtifactStore. Er erzeugt mehrere Backups,
  erreicht Kapazitätsfehler, gibt Platz frei, erstellt neu und führt echten
  pg_restore aus. Tabellenzeilen werden verglichen und die wiederhergestellte
  Revision wird durch die Original-API bearbeitet. Die Quellobjekte werden vor
  dem Lesen der wiederhergestellten Kopien entfernt. Das ist substanzielle
  Storagewirkung; der vorherige Fehler bleibt dennoch ungeklärt.
- Die Nativefixture bindet das große Objekt nicht über einen realen DB-Consumer;
  sie beweist Dateikopie/Adressierbarkeit und Revisionsdaten jeweils getrennt.
  Viele Session-/Job-/Pipeline-Tabellen können leer sein. Quieszenz, Testimagedigest
  und vorbereitete Rollen/Extension machen daraus keinen vollständigen
  Recoveryset-, Concurrent-Writer- oder Applikationsneustartnachweis. Die aktuelle
  Doku bezeichnet dies entsprechend als begrenzten Storage-Roundtrip.
- Runbook behandelt Quoten, manuelle Auswahl, Markerlock, Copyanforderungen,
  Beispiele, benötigte Tools, Unterbrechung und Grenzen verständlich. Getrennte
  Verzeichnisse werden zutreffend nicht als unabhängige physische Fehlerdomäne
  verkauft. Vollständige Q1–Q4, Schlüssel-/Journalbindung, RPO/RTO und Q-DOC zum
  vollständigen Disaster-Recoveryvertrag bleiben offen. Die aggregierte Matrix
  benötigt vor Abschluss weiterhin einzelne A1/A5-Fälle, wie im ersten Review.

## Prüfnachweise

Die dokumentierten Tool-Environmentvariablen wurden verwendet. Dateisystemlauf:
`TMPDIR=/dev/shm node --experimental-transform-types --test tests/verification/deployment/prism-backup.test.mts`.
Nativ: `node --experimental-transform-types --test tests/verification/deployment/prism-backup-native.test.mts`
mit den zwei dokumentierten loopback URLs, GNU/util-linux/PostgreSQL-Tools,
LD_LIBRARY_PATH, ICU_DATA und PGOPTIONS. Kein Deployment oder externer Dienst.

[Dateistand](../../evidence/independent-backup-20260920/identities.json),
[Diff](../../evidence/independent-backup-20260920/reviewed.patch),
[neue Dateien](../../evidence/independent-backup-20260920/new-files/),
[Filesystemlauf](../../evidence/independent-backup-20260920/independent-backup-fs.txt) und
[nativer erfolgreicher Wiederholungslauf](../../evidence/independent-backup-20260920/independent-backup-native.txt)
sind gespeichert. Spätere Änderungen benötigen gezielte erneute Prüfung.

## Gezielte unabhängige Wiederprüfung der Korrekturen

B1: Die Freigabeidentität liegt jetzt in einer separaten Datei außerhalb der
rekursiven Löschmenge. Veröffentlichung und `sync -f` erfolgen vor dem Rename;
Resume verlangt denselben Digest und schützt fehlende/widersprüchliche Identitäten.
Die Autorisierung wird erst nach bestätigter Tombstoneentfernung und Sync entfernt.
Das ursprüngliche unabhängige Gegenbeispiel wurde unverändert erneut ausgeführt:
Die andere gültige Copy mit neuem Digest scheitert jetzt an
`PRISM_BACKUP_RETIRE_AUTHORIZATION_MISMATCH`; die Originaltombstone bleibt bestehen.
Der neue Dateisystemlauf besteht 10/10. **B1 ist im geprüften Stand behoben.**
Dies ist kein physischer Stromausfallnachweis. Die dokumentierten Lock- und
Writerannahmen bleiben Voraussetzung.

B2: Die Erklärung in `prism-native-cleanup-20260920.md` wurde am installierten
pg-pool-Verhalten geprüft. Den dortigen realen Reproducer habe ich unabhängig
wiederholt: `Pool.end()` ist aufgelöst, während ein Backend weiter verbunden ist;
der historische FORCE-Drop erzeugt tatsächlich `57P01`. Die jetzige Suite wartet
auf die echten remove-Callbacks, bewahrt Primär-/Cleanupfehler und droppt ohne
FORCE. Die ursprüngliche konkrete Socketreihenfolge ist nicht nachträglich
bewiesen; der passende Fehlermechanismus ist jedoch deterministisch reproduziert
und in der Testimplementierung beseitigt.

Die erste neue Regression war noch unzureichend: Bei isoliert entferntem
`await Promise.all([...connections.values()].map(connection => connection.removed))`
bestand der Test unverändert. Die frühe Assertion beobachtete nur die Microtask-
Reihenfolge. Dieser Fehlversuch wurde gemeldet und aufbewahrt. Nach zusätzlicher
Assertion **nach** dem echten pg_stat_activity-Roundtrip scheitert derselbe
gezielte Mutant an `close must remain pending while the actual backend is held open`.
Der unveränderte korrekte Stand besteht anschließend 2/2, ohne asynchrone
Testfehler oder Skips. **B2 ist für den nachgewiesenen Cleanupfehler behoben und
die Regression erkennt dessen gezielten Wiedereinbau.** Der ursprüngliche
Fehlversuch wird dadurch nicht aus der Historie entfernt.

[Finale Dateidigests, eingefrorene Dateien, Mutant-/Positivläufe und reproduzierte Gegenbeispiele](../../evidence/independent-backup-20260920/final-recheck/)
binden diese Entscheidung. `.md`-Snapshots sind als `.md.snapshot` abgelegt,
damit historische Dokumentbytes nicht als gepflegte aktuelle Dokumente erscheinen.
Die zuvor beschriebenen Q1–Q4-/IFR-26-001-Grenzen bleiben vollständig bestehen.
