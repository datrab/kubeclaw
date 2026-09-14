# foundation.observability — Dauerhafte Records, Blobs und Observability

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. Alle fünf Quelldateien und README vollständig gelesen.
Eine Einheit für den gemeinsamen Embedded-Store; Teilflächen unten getrennt.

## 1–2. Verantwortung, Nutzung und Schnittstellen

Code: `skills/common/plugin-runtime/foundation/observability/`.

| Teilfläche | Eingabe → Ausgabe und tatsächliche Aufrufer |
|---|---|
| durable-records.ts | stream/idempotencyKey/payload → sequenzierter Record; read und digest-CAS transition. state-, artifact-, wait-, telemetry-store, Nachrichten-/Transportadapter und Remote-Plan-Persistenz nutzen diese APIs. |
| FileDurableBlobStore | Bytes → Digest/Größe; Digest → geprüfte Bytes. Artifact-Adapter stellt darauf JSON-Artefakte bereit. |
| durable-delivery.ts | Producer-Outbox append/pending/ack/compact; Admission raw canonical record → durable ACK/Cursor; Gap-/Quarantäneauskunft. deliverPending verbindet beide echten APIs. |
| durable-attempts.ts | Evidencebytes → WorkerEvidenceRef; WorkerResult + CompletionIntent/Owner → persistierter Versuch; resumeCompletion → Admission + Closure. Buster.runner:1780–1882 produziert genau diese Reihenfolge. |
| clawdeck-view.ts | Run/Cursor/Closureanforderungen → Rohrecords, Versuche, Evidenz, ClosureIDs, Completeness. Bestehender Vertragstest konsumiert View; kein hier nachgewiesener produktiver HTTP-Viewserver. |

Record-Digestformat ist der strengere Observability-Serializer, nicht SDK.values.
Workerresult wird gegen Worker-Core-Vertrag geprüft; CompletionIntent bindet
Run/Attempt/Claim/Worker/Resultdigest und erforderliche EvidenceIDs. Producer-
Closure wird gegen Observability-Vertrag geprüft. Nova.reconciler liest dieselben
Stores und versucht fehlende Completion nachzuziehen. Diese Gegenstellen wurden
konkret gelesen, kein ganzer Pipeline-E2E-Lauf daraus abgeleitet.

## 3–4. Persistenz, Commitpunkte und Fehler

RecordStore klont über kanonisches JSON, validiert beim Lesen Digest, Sequenzen
und doppelte Identitäten. CAS erhält Recordsequenz und aktualisiert Payloaddigest/
committedAt. Jede Änderung schreibt gesamten Snapshot: temporär mode0600,
Datei-fsync, Rename, Verzeichnis-fsync. Neue Verzeichnisse fsyncen Eltern.

Outbox persistiert vor Zustellung, ACK erst nach Admissionwrite; gleiche Identität/
Digest erhält ursprünglichen Cursor, Konflikt/ungültige Wirebytes gehen in
Quarantäne. Unzuordenbarer Oversize lässt begrenzte globale Overflowmetadaten,
keine behauptete Runzuordnung. Nur quittierte Outboxeinträge werden kompaktierbar.
Replay gespeicherter Snapshotinhalte ist schwächer als Ingressprüfung: PCR-OBS-001.

AttemptStore schreibt Blob vor Evidenzmetadata. Resultaufnahme prüft alle
referenzierten Evidencebytes/Digests, speichert pending mit storedAt=null, dann
Commitmarker; für spätere Zeitzeichenfolge wird vorher Platz reserviert.
Wiederholung beendet pending. Neuere Generation verdrängt keine finalisierte
ältere, ältere Generation kann neue Resultgeneration nicht überschreiben.
resumeCompletion hält Attemptlock während Admission+Closure; Admission und
Attempt müssen getrennte Storeverzeichnisse haben. Buster fängt Admissionfehler
nach dauerhaftem Result ab, damit Provider nicht deshalb erneut ausgeführt wird.

## 5–6. Zeit, Abbruch, Konkurrenz und Neustart

Jede Storeinstanz reiht Operationen, kernel-flock serialisiert Prozesse auf einer
.write-lock pro Verzeichnis. Halter ist flock/sh/cat-Kind mit offener stdin,
Lockwartezeit 5s; kein eigener FileMutex-PID-Reclaimer. PCR-STATE-002 daher nicht
auf diese Sperre übertragen. Aufrufer-AbortSignal wird nicht angenommen;
wartende oder bereits schreibende Operation läuft weiter. Keine automatische
Retry-Schleife für ENOSPC/Locktimeout; aufrufende Komponenten müssen Fehler
behandeln. Keine Unterbrechung zwischen Commit und ACK vortäuschen.

Wiederaufnahme liest echte Dateien. Record-/Attempt-Tempcleanup unter Lock;
Attempt-Evidence ohne Resultreferenz verfällt nach maximumPendingEvidenceAgeMs,
Metadaten werden vor unreferenzierten Blobs gelöscht. Referenzierte Results und
Closures verfallen nicht. Separate BlobStore-Tempdateien nach hartem Crash haben
keinen gezielten Cleanup und zählen in der aggregierten Quote; Crashverifikation
bleibt offen. Pending-Result-Tests setzen gespeicherten Marker manuell zurück,
sie sind keine SIGKILL-an-genau-diesem-Commitpunkt-Prüfung.

## 7–8. Vertrauen, Ressourcen, Aufräumen

Kein Authsystem; Storewurzel muss vor Provider-/Projektzugriff geschützt sein.
fsync/rename/Hardlink und Linux /usr/bin/flock, /bin/sh, /bin/cat erforderlich.
Directory-Komponenten werden auf Symlinks geprüft. Datei-URLs der Attempt-
Evidence sind lokale Handles für berechtigte Leser, keine allgemeine Netzwerk-
freigabe. End-to-End-Pfadschutz unter feindlichem parallelem Dateiaustausch ist
nicht durch diese Einzelchecks bewiesen; Infrastrukturfolgeprüfung.

Anzahl-, Objekt-, Metadaten- und aggregierte Bytequoten sind explizit. Bei voller
Persistenz expliziter Fehler statt unquittiertem Erfolg. Es werden aber komplette
Snapshots geladen und oft mehrfach geklont/serialisiert; Bytebudget wird teils
erst danach geprüft. BlobStore.get liest nach lstat vollständig ohne maxBytes-
Check vor readFile; beschädigte/vergrößerte Datei kann Speicher beanspruchen,
bevor Digestfehler folgt. Schutz vor fremden Speicheränderungen und sinnvolle
RAM-kompatible Quoten bleiben Voraussetzung, kein hier gemessener OOM.

## 9. Architektur und Vereinfachung

JSON-Snapshots mit globalem Lock sind für kleines Embedded-Profil verständlich,
jedoch O(Storegröße) pro Änderung/Read und ohne Record-/Admission-GC nicht
langfristig wachstumsfähig. Ein einheitlicher validierter Snapshotreader würde
inkonsistente Replaygarantien beheben. Ein späterer transaktionaler Datenbank-
treiber kann Lock-/Full-Rewrite-Komplexität ersetzen; keine zusätzlichen Shims.
View liest Admission, Attempts und Completeness parallel ohne gemeinsamen
Snapshotzeitpunkt; ist eine Beobachtungsansicht, kein atomarer Abschlussbeweis.
requiredClosures muss der fachliche Aufrufer vollständig bestimmen.

## 10. Untersuchte und ausgeführte Tests

Vollständig gelesen und unverändert bestanden: durable-delivery.mts (echte
Dateien, verlorenes ACK durch ausgelassenen Ack-Aufruf, konkurrierende Instanzen,
Cursor, Quarantäne/Overflow, Symlinkverzeichnis, volle Outbox, Gaprestoration),
durable-attempts.mts (Originalstores, synthetische Vertragsresults; Blobkorruption,
Generation/Closure-Rennen, Pendingmarker, Budgetreservierung, Evidenceablauf),
clawdeck-view.mts (echte persistierte Cursor/Gap/Quarantäne, kein UIserver).
[Protokoll](../evidence/observability-storage-tests.txt).
Vorher bestandener blob-budget.test.mts erneut vollständig gelesen: echte
konkurrierende Node-Prozesse, Rekonstruktion und Quota; [Log](../evidence/foundation-tests.txt).
Reconciliationtest vollständig gelesen, eigener Lauf im Nova-Review.
E2E durable-evidence.test.mjs gelesen, kein neuer E2E-Lauf behauptet.

Nicht bestätigt: Hoststromverlust, ENOSPC an jedem fsync, Crash-Blobtempcleanup,
unterbrochene Netzwerkaktion, Langzeitretention und parallele View-Snapshotkonsistenz.
Keine neuen Mocks oder Ersatzstores. Kein Go-Cross-Language-Pass/keine CI.

## 11. Dokumentationsabgleich und alte Audits

README beschreibt Atomizität/ACK/Quoten zutreffend, ist unvollständig zu
Resultmarker, Replayvertrauen, Blobtempcleanup, Quoten-/RAMbeziehung und
Aufbewahrung. „Single-writer“ bedeutet serialisierte Writer, nicht nur eine
aufrufende Prozessinstanz. phase-5-7-c-audit.md: überprüfte Ingress-/ACK-/Lock-
Garantien implementiert. final-audit.md:37 pauschale „corruption detection“ gilt
für Record-/Blobpfade, nicht sämtliche Replayzustände (PCR-OBS-001).
Pendingmarker/Platzreservierung, stale-generation-Prüfung, Evidenznachprüfung
und verwaiste Evidence sind vorhanden und in lokalen Tests bestätigt.
W6 in pipeline-reliability-remediation.md bleibt offen: dauerhafte Retention.
Andere Adapterbefunde des historischen Finalaudits erst bei deren Eigentümern
bewerten; die pauschale damalige „clean“-Aussage nicht übernommen.

## 12. Befunde

### PCR-OBS-001 — Persistierte Admission-/Attemptzustände umgehen Replayvalidierung

- **Hoch, nachgewiesener Defekt:** Integritätsverletzung von Belegen beim Lesen;
  keine Behauptung eines unangemeldeten Remote-Schreibzugriffs.
- **Beleg:** durable-delivery.ts:106–125 liest JSON mit Typecast und Defaults;
  #recordViews/admittedRecords/admittedTailSnapshot:624–725 kopieren ungeprüfte
  Recorddaten. durable-attempts.ts:snapshot:746–752 prüft ebenfalls nicht erneut
  Workerresult-/Closure-Digests. RecordStore.assertState hat diese Prüfung.
- **Auslöser/Ablauf:** echten Record aufnehmen, danach in eigener temporärer
  admission.json nur payload.state ändern, Digest und ursprüngliche bytes
  unverändert lassen. Neu erzeugter Originalstore liefert geänderten Payload
  mit falschem Digest ohne Fehler. [Repro — historischer Stand](https://github.com/datrab/kubeclaw/blob/91396dc4975ed05a0cb674b0e1327ddbf3ef1f12/docs/review/evidence/admission-replay.mjs).
- **Auswirkung:** beschädigte gültige JSON-Snapshots können als authentische
  Fakten in ClawDeck/Recovery weitergereicht werden; Eingangsquarantäne greift
  beim Replay nicht. Attemptauswirkung durch Code-Trace, direkt reproduziert
  ist Admission. Kompletter böswilliger Storeaustausch benötigt zusätzlich
  Schutz außerhalb eines unkeyed Hashes.
- **Ursachenbehebung:** beim Öffnen bounded Schema-/Digest-/Identity-/Cursor-
  Integrität samt Übereinstimmung von bytes und Record prüfen; fehlerhafte
  Historie explizit blockieren/quarantänisieren, nicht mit Defaults reparieren.
- **Regression:** Originalstores nach einzelnen korrupten Payloads, Digests,
  Cursor-/Generationänderungen rekonstruieren. Reads und Idempotenz-ACK dürfen
  keine korrupte Historie bestätigen; unveränderte Historie muss weiter lesbar sein.

### PCR-OBS-002 — Aufbewahrungsstrategie für bestätigte Historie fehlt

- **Mittel, offene Architekturfrage:** endliche Quoten verhindern unbeschränktes
  Wachstum, nach Ausschöpfung steht aber kein sicherer Freigabeweg bereit.
- **Beleg:** RecordStore hat append/read/transition ohne Delete; Admission ohne
  Compaction; AttemptStore reclaimExpiredEvidence entfernt nur ohne Result
  referenzierte Evidence. README benennt fehlende Admissioncompaction, W6 ebenso.
- **Auslöser/Auswirkung:** fortlaufende Runs füllen globale Stores; weitere
  notwendige Belege/Writes scheitern, keine automatische Wiederherstellung der
  Kapazität. Manuelles Löschen könnte Idempotenz/Beweisketten verlieren.
- **Ursache lösen:** explizite runbezogene Retention mit Consumercheckpoint,
  referenziertem Evidenceabschluss und nötigen Idempotenz-Tombstones; erst danach
  zusammenhängend freigeben. Größere Quoten allein verschieben das Problem.
- **Verifikation:** mit kleinen echten Quoten abgeschlossene und aktive Runs
  mischen; Retention gibt nur bestätigte Historie frei, Replay von alten
  Zustellungen führt zu keiner erneuten externen Aktion. Policyentscheidung
  und Umsetzung gehören zum späteren Reparatur-/Betriebsauftrag.
