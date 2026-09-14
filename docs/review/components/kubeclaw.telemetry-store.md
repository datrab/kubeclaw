# kubeclaw.telemetry-store

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Lokale Originaltests/Code-Trace, kein produktiver E2E-Nachweis.

## 1. Verantwortung und Nutzung

`skills/common/plugins/telemetry-store/src/adapter.ts#activate` stellt
telemetry.emit bereit; Rolle nova/buster/prism. Beide Agent-/Lifecycleprojektoren
senden append, nachgewiesen im Agent-live-function über Originalruntime.
Diese Komponente ist Fileprovider, kein ClawDeck-/Redisconsumer. Aktivierung
setzt root voraus; ready liest und validiert den bestehenden Stream.

## 2. Vertrag beider Seiten

AdapterInvocation bringt Coreeffektidentität, Signal und Fence. capability/
operation werden geprüft, Nutzlast offen. Sink legt alle append-Events in
`telemetry/plugin-events` ab, idempotencyKey ist der Corekey; resource.canonicalId
ist kein physischer Streamname. Antwort accepted bedeutet neu appended, false
bei identischem Duplikat, plus monotone sequence. Sender ignorieren den bool
und behandeln beide korrekterweise als erfolgreich erledigt. Geändertes
sanitisiertes Payload bei gleichem Key wird im Originalstore abgewiesen.

## 3. Persistenz und Commit

`foundation/observability/durable-records.ts` snapshotet mittels strengem
Observability-canonicalJson, prüft Digest/Sequenz/Identität auch beim Replay und
liefert strukturgeklonte Objekte. writeDurableState schreibt temporär0600,
fsync, rename, fsync des Verzeichnisses; erst dann ACK. Elternverzeichnisse
werden dauerhaft angelegt. Kein Aliasing des Storezustands durch Rückgabewerte.

## 4. Fehlerpfade

Falsche Operation und initialer Abort werden abgewiesen; Fence vor Write.
DURABLE_RECORD_SIZE_EXCEEDED wird gezielt zu TELEMETRY_RECORD_SIZE_EXCEEDED,
Konflikt/Vollspeicher/korruptes Replay bleiben unterscheidbare geworfene Fehler.
Eigene sanitize läuft jedoch vor striktem Storevalidator und ist schwächer
(PCR-TSTORE-001/002). Keine Bestätigung fehlgeschlagener Speicherung.

## 5. Timeout/Parallelität

Append wird pro Store serialisiert und durch Kernel-flock pro Datei über
Prozesse geschützt (5s Lockwartezeit). Signal wird nur vor sanitize geprüft,
kein Abbruch wartender Locks/Dateischritte; Coretimeout verhindert nicht
späteren Commit. Kein manueller PID-Lockreclaimer/PID-Namensraumfehler hier;
Kernel-/Dateisystemsemantik vorausgesetzt. Keine Workerclaim-Deadline.

## 6. Restart und ACK-Verlust

ready validiert Replay. ACK-Verlust nach rename/fsync erlaubt identischen
append mit accepted:false und derselben sequence. Abbruch vor rename hält
alten Snapshot; temporäre Crashdateien werden unter Storelock beseitigt.
Kein eigenes mehrstufiges Abschlussprotokoll. Stromausfall-/Mehrprozessnachweise
liegen nicht in der lokalen Paketsuite.

## 7. Vertrauen

telemetry.emit wird vor Adapteraufruf durch Coregrants gescopt. Kein Secretresolver
oder Netzwerk. root ist vertrauenswürdige Plattformkonfiguration; Storepfade
werden gegen Symlinks geprüft. Eigene Feldredaction verspricht Secretfreiheit,
erkennt aber api_key/credential nicht, anders als direkte Projektoren (s.u.).
Eine beliebige neue telemetry.emit-Quelle darf daher nicht auf diese Promise vertrauen.

## 8. Ressourcen/Retention

Defaults 1MiB Record,100000 Records,256MiB Store; konfigurierbare positive sichere
Integer. Vollspeicher schlägt geschlossen fehl, kein Ringpuffer oder Retention.
Gemeinsame Ursache [PCR-OBS-002](foundation.observability.md), nicht dupliziert.
Vollständige Snapshotreads und Serialisierung kosten Speicher/CPU vor Byteprüfung;
sanitize besitzt nicht einmal Tiefen-/Zyklengrenze. shutdown ist leer und
wartet nicht selbst auf in-flight append.

## 9. Architektur

Dünner Provider auf gemeinsamem DurableRecordStore ist sinnvoll; eigene schwache
Redaction verdoppelt den SDKvertrag und erzeugt reale Abweichungen. Gemeinsame
beschränkte JSON-/Redactionpolitik vor Storezugriff, dabei Duplikatsemantik
bewahren und keine Ersatzpersistenz einführen.

## 10. Tests/Evidenz

Beide Originaltests gelesen, `npm test` bestanden:
[Log](../evidence/observers-telemetry-store-tests.txt). Live-function benutzt
Originaladapter und echten temporären Store mit Dedupe, Konflikt, Sequenz,
0600, Größenfehler und Vorab-Abort; Fence ist Fixture. Kein tatsächlicher
Prozesscrash oder Timeout während fsync. [Grenzprobe — historischer Stand](https://github.com/datrab/kubeclaw/blob/667669da6a67262b725508a0f0328f7f10f57da4/docs/review/evidence/observers-boundaries.mjs)
und [Ausgabe](../evidence/observers-boundaries.txt) zeigen Originalpersistenz
synthetischer API-Key/Credentialmarker und RangeError beim Zyklus. Keine Module ersetzt.

## 11. Dokumentation

README vorhanden; Dedupe/Durable-ACK sind codegedeckt. 'Secret-bearing fields
remain redacted' ist für api_key/credential falsch; 'cancellation bounds' nur
für initialen Abort, kein laufendes Dateiwait. ClawDeck-/Highvolume-Driver wird
zutreffend als spätere Arbeit benannt. Retention fehlt.

## 12. Befunde

### PCR-TSTORE-001 — Secretfeldpolitik des Sinks lässt API-Schlüssel durch

**Hoch, nachgewiesener Defekt:** `src/adapter.ts:4–14,38–42` sanitize erkennt
nur authorization/cookie/password/secret/token. Originalprobe schreibt
api_key und credential im Klartext in den echten0600-Store, password wird
redigiert. Trigger: autorisierter telemetry.emit-Caller verlässt sich auf die
Sinkredaction; bestehende redigierende Observer mindern ihren eigenen Pfad,
beheben aber die Providergrenze nicht. Auswirkung: dauerhaft gespeicherte
Credentials statt zugesicherter Redaction. Ursache: abweichende Regexpolitik.
Behebung: gemeinsamen begrenzten Redaktionsvertrag an allen Telemetriesinks;
Regression über originale append-Persistenz mit api_key/apiKey/credential und
verschachtelten Varianten plus harmlosem Kontrollfeld.

### PCR-TSTORE-002 — Redaction rekursiert vor validiertem JSONbudget

**Mittel, nachgewiesener Defekt:** `src/adapter.ts:6–13,42`. Zyklisches Objekt
verursacht RangeError vor Storevalidator; tiefes gültiges JSON besitzt denselben
unbeschränkten Rekursionspfad. Bytebudget greift zu spät. Direkte Probe ist
Adapter-API-Evidenz; Corewire kann Zyklen zuvor ablehnen, keine Remoteexploit-
behauptung daraus. Auswirkung: unkontrollierte Ausnahme/CPU- und Stacklast
statt gezieltem Ablehnen. Ursache beheben durch globales Tiefen-/Knotenbudget,
Zyklus-/Getterprüfung bereits vor Traversal. Regression mit tiefem JSON, Zyklus,
geteilten nichtzyklischen Referenzen, Gettern und gültigem Grenzpayload am
Originaladapter; kontrollierter Fehler, keine Teilspeicherung.
