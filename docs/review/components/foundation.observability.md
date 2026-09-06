# foundation.observability — dauerhafte Records, Blobs und Observability

Review-Status: teilweise geprüft. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Vollständig gelesen: `skills/common/plugin-runtime/foundation/observability/
durable-records.ts`, `durable-delivery.ts`, `README.md`. Noch ungeprüft:
`durable-attempts.ts` (767 Zeilen) und `clawdeck-view.ts`; sämtliche übrigen
Vertragstests der Delivery-/Attempt-Pfade. Die Komponente darf noch nicht als
abgeschlossen gelten; sinnvolle Aufteilung in Records/Delivery/Attempts/Projection
beim Fortsetzen prüfen, ohne bereits vergebene Befund-IDs umzubenennen.

## Verantwortung, Nutzung und Schnittstellen

FileDurableRecordStore: append/read/transition mit stream + idempotencyKey,
kanonischem Payload-Digest, Sequenz pro Stream und globalen Limits.
FileDurableBlobStore: content-addressed put/get, optionale aggregierte Bytequote.
Aktive Konsumenten: state-store, telemetry-store, artifact-store, wait-store,
operator-messaging, transport-publisher sowie Nova Remote-Dispatch/-Import und
Buster Remote-Plan-Service. Exakte Importpfade im maschinenlesbaren Inventar.

FileProducerOutbox: kanonischen Record vor Transport speichern; pending,
acknowledge, compact. FileObservabilityAdmissionStore: ingress validieren,
Identity/Digest deduplizieren, Cursor vergeben, ungültige/konfliktbehaftete
Records quarantänisieren, Gaps und unresolved items verwalten. Redis ist kein
Ersatz für diese Bestätigung. DurableAttemptStore besitzt eine weitere Grenze
für Evidence/Result/Closures, noch zu untersuchen.

## Gelesene Zustands-/Nebenwirkungspfade

Record-Store serialisiert Payload unabhängig, prüft beim Replay jeden Digest,
Streamsequenz und Identitätsduplikate. transition ist CAS auf erwartetem
Payload-Digest. Neue Datei wird mit mode0600 geschrieben, fsynced, umbenannt,
Verzeichnis fsynced. Directory-Erzeugung fsynct Eltern; keine Symlink-Verzeichnisse.
Kernel-flock wird durch Kindprozess gehalten; Prozessende/geschlossene stdin
beendet Halter. Timeout 5 Sekunden. Tempdateien der Zustandsdatei werden unter
Sperre entfernt. Store-Lock gilt pro Verzeichnis, nicht pro Stream.

Blob-put prüft bestehende Bytes, legt temporäre Datei fsynced an, veröffentlicht
per Hardlink und fsynct das Verzeichnis. Get prüft finalen Dateityp und tatsächlichen
Digest. Aggregierte Quote zählt Dateien unter blobs und wird mit flock serialisiert.
Nach SIGKILL liegengebliebene Blob-Tempdateien/Verzeichnisrennen noch verifizieren;
der Record-Temp-Cleanup ist nicht automatisch Blob-Cleanup.

## Grenzen und offene Review-Pfade

- Globaler JSON-Store wird für Reads/Änderungen vollständig geladen und validiert;
  keine inkrementelle Datenbank. Globale Records-/Bytegrenze; kein Record-GC/API
  zur Freigabe bei ausgeschöpftem Store. W6 des Reliability-Berichts damit am Code
  bestätigt als verbleibende Architektur-/Retention-Arbeit.
- Blob get liest vollständig; der Konstruktor begrenzt put, get hat vor readFile
  keine stat.size-Prüfung gegen maxBytes. Geschütztes Storage ist Voraussetzung;
  Verhalten bei extern vergrößertem/korruptem Blob noch real prüfen.
- Outbox/Admission laden JSON über readDurableState ohne dieselbe vollständige
  Replay-Validierung wie RecordStore. Integrität bereits persistierter Admission-
  Daten und Konsumentenprüfung noch nachvollziehen; kein unbelegter Defektabschluss.
- Keine Abort-Signale an Store-Operationen. Abbruch während Queue/flock kann nicht
  allein aus Adapter-Eintrittsprüfung abgeleitet werden; state-store-Review nennt
  konkrete Verifikation an der Core-Grenze.
- Ausstehend: host crash, ENOSPC, mehrere lange Queue-Waiter, beschädigte
  Admission-Datei, Nonce/Closure-Recovery, Aufbewahrung mit Idempotenz-Tombstones.

## Tests / Dokumentation

Unverändert ausgeführter `tests/verification/reliability/blob-budget.test.mts`
bestanden: echte Blobs, Rekonstruktion, Idempotenz und konkurrierende Prozesse.
Testdatei vollständig gelesen; sie verwendet Original-Store und echte konkurrierende
Node-Prozesse, keine Dateisystem-Mocks. State-store- und Blueprint-
Tests bestanden; letztere nutzen echte Git-/Dateioperationen. Diese Ergebnisse
beweisen keine Admission-/AttemptStore- oder Cluster-Abnahme.

README nennt Embedded-Profil, flock, Limits, ausdrücklich fehlende Admission-
Kompaktierung und zukünftigen DB-Treiber. Diese Aussagen entsprechen den gelesenen
Pfaden. Konkrete Paketabhängigkeiten: Linux-flock/sh/cat, geschütztes persistentes
Filesystem mit verlässlichem fsync/rename/Hardlink. Crash-/Quoten-/Recovery-
Betriebsanleitung und gesamter Attempt-Pfad bleiben unvollständig dokumentiert.

Nächster Schritt: DurableAttemptStore vollständig lesen, seine Blob-/Result-
Commitreihenfolge gegen Buster-Completion und Nova-Reconciler prüfen; anschließend
alle direkt zugehörigen echten Tests samt Negativkontrollen untersuchen.
