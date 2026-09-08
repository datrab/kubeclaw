# kubeclaw.artifact-store

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Registrierung und Verträge

Vollständig gelesen: `skills/common/plugins/artifact-store/src/adapter.ts`, Manifest,
Config-Schema, Paketdatei, README und beide eigenen Tests. Manifest registriert
`artifact-store` für `artifacts.read/write`; Rollen nova/buster/prism liefern das Paket.
Core `execution/adapter-startup.ts` validiert Config und startet ausgewählte Provider;
`execution/authorization.ts` bindet den Namespace an den Grant. Keine eigene
Benutzer-/Run-Autorisierung im Store. Root und lokales Dateisystem sind vertrauenswürdig.

Sender etwa SDK `src/source-revision.ts:readImplementation`: exact get mit ID,
Namespace und Digest; Empfänger sucht dieselben Metadaten und prüft Blob-SHA256.
Der SDK-Empfänger vergleicht zusätzlich Digest, Größe und erneut serialisierten Inhalt.
Put verlangt JSON-Medientyp und Namespace bis 246 Zeichen (plus `artifacts/` = 256).
Output `{artifact}` enthält ID, Namespace, SHA256, Bytegröße und Core-Attempt.
`get_latest_json` filtert zusätzlich producer.runId, nicht Stage/Attempt; fachliche
Auswahl bleibt beim Aufrufer. Exact get darf bewusst innerhalb erlaubter Namespaces
runübergreifend lesen. Das Artefakt ist Inhaltsnachweis, kein Herkunftssignaturnachweis.

## 3–4. Persistenz, Commit und Fehlerpfade

`invokeArtifact` schreibt zuerst immutable Metadaten mit request.idempotencyKey,
dann Blob. `FileDurableRecordStore.append` bildet unabhängigen JSON-Snapshot,
prüft identischen Digest bei Wiederholung und liefert Clone. Gesamter Recordstore
liegt in `records/store.json`; Blob unter `blobs/sha256/<prefix>/<hash>`.
Backend `durable-delivery.ts` schreibt exklusive 0600-Tempdatei, fsync, rename,
Verzeichnis-fsync; neu angelegte Elternverzeichnisse werden synchronisiert.
Blob: Tempdatei/fsync, Hardlink, Verzeichnis-fsync, Tempdatei entfernen.
Erfolg nach beiden Schreibbestätigungen. Physisches ENOSPC/fsync-Versagen propagiert;
fehlgeschlagene Metadatenaufnahme erzeugt keinen Blob. Metadaten nach erfolgreicher
Aufnahme, aber fehlendem Blob bleiben als Intent bestehen.

`findArtifact` geht rückwärts und überspringt nur ARTIFACT_NOT_FOUND, niemals
Integritätsfehler. Älterer vollständiger Inhalt bleibt bei neuestem offenen Intent
sichtbar. Fehler unterscheiden missing/integrity/size/operation; Backend-Konflikte
werden nicht in vermeintlichen Erfolg umgewandelt.

## 5–7. Parallelität, Recovery, Abbruch und Vertrauensgrenze

Metadatenqueue plus echter Kernel-flock, Blobbudget eigener flock; kein PID-basiertes
Stale-Reclaim. Kernel gibt Lock nach Schließen des flock-Prozesses frei; Host-PID-
Namespaces sind keine eigene Reclamation-Heuristik. Voraussetzungen `/usr/bin/flock`,
`/bin/sh`, `/bin/cat`, Linux-Dateisystem mit Hardlinks/rename/fsync. Flock wartet 5 s;
Queue selbst hat keine Deadline/Abortübergabe. Fence/Signal werden nur am Adapter-
Eintritt geprüft. Abbruch danach beweist nicht das Ausbleiben des Commits; siehe
analoge Grenze in [state-store](kubeclaw.state-store.md).

Crashpräfixe: vor Metadaten kein Intent; danach fehlender Blob = unsichtbar und durch
gleiche Wiederholung vervollständigbar; danach Blob = lesbar, auch vor äußerem
Effect-Receipt. Adapter implementiert kein receipt(), daher Backend-Idempotenz
nicht mit automatischem Core-Recovery gleichsetzen. Core-Präfixverluste bei Stage-
Artefaktprojektion gehören [nova.execution](nova.execution.md), PCR-EXEC-001/002.
Keine echten SIGKILL-/Powerloss-Tests dieses Adapters ausgeführt.

## 8–9. Ressourcen, Retention und Architektur

Default 16 MiB Artefakt, 100000 Records, 256 MiB Metadaten und separat 256 MiB
Blobbudget; kein gemeinsames 256-MiB-Gesamtmaximum. Metadatenaufnahme 64 KiB.
Alle Reads validieren den vollständigen Recordstore; wiederholte Puts serialisieren
und hashen vor Größencheck. SDK-canonicalJson akzeptiert problematische Nicht-JSON-
Werte und hat kein Tiefen-/Knotenlimit: [PCR-SDK-001](lib.sdk.md), keine neue ID.
Backend nutzt strengeren Observability-Serializer für die Metadaten, nicht für den
bereits erzeugten Blob. Keine sichere automatische Retention/GC; offene Intents
verbrauchen Platz, Blob-Tempdateien nach hartem Crash können Budget verbrauchen.
Gemeinsame Retentionsgrenze siehe PCR-OBS-002. Künftiger Entwurf sollte das
Intent/Blob-Protokoll beibehalten und sichere GC mit Idempotenzfenster vereinbaren.

## 10. Untersuchte und ausgeführte Tests

`node tests/package-boundary.test.mjs && node tests/live-function.test.ts` im
Paketverzeichnis bestanden (Node 24.19.0). Originalbefehle aus package.json;
keine neuen Mocks. Live-Test: echter Store/fsync/Blobs, idempotentes JSON,
exact get, künstlich eingespielter Metadatenpräfix ohne Blob, runbezogenes latest,
Recordlimit ohne orphan blob, Namespacegrenze, Manipulation/Integritätsfehler und
bereits abgebrochenes Signal. Fence ist leeres Testobjekt, kein echter Core-Lease.
Präfix ist modelliert, kein Prozessabbruch. Boundarytest ist Textprüfung.
Workspace-npm-Sammelaufruf wurde durch die Ausführungsumgebung unterbrochen;
die expliziten Original-Node-Befehle liefen erfolgreich. Kein Cluster-/Powerlossnachweis.

## 11–12. Dokumentation und Ergebnis

README inhaltlich zutreffend zum Intent-before-Blob-Verfahren; Katalog bestätigt
Manifest/Tests, beschreibt keine Laufzeitgarantie. Unvollständig bei getrennten
Quoten, langfristiger Retention, Lockwerkzeugen und äußerem Receiptverlust.
Kein zusätzlicher bestätigter eigener Defekt; bekannte SDK-/Core-/Retentionbefunde
verlinkt. Nächste Verifikation: echte Prozessabbrüche an beiden Commitgrenzen und
Core-Reconciliation bei verlorener Antwort; nicht als bestanden ausgewiesen.
