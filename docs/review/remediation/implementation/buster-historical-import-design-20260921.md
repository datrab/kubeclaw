# Historischer Buster-Import: Vertrag vor Implementierung

Status: Entwurf vor Code und Tests; kein Import ausgeführt. Scope sind
`historical-plan-store.ts`, neue `preparation-historical-*.ts` und eigene Tests.
Gemeinsame Input-/Ledger-/Serviceintegration liegt beim Buster-Autor.

## Eine besessene Importphase

Ein tatsächlicher Native-Envelope, ein belegter Vorbereitungsslot und ein Gate
gehören zur gesamten Importgruppe. Der Host läuft unter dem zugewiesenen
Vorbereitungs-UID innerhalb der bestehenden CPU-/Speicher-/Task-/Zeitgrenzen.
`maximumActivePreparations=1` bleibt gültig; kein verschachtelter Staginghost und
keine synthetischen Einzeljob-Envelopes. Der privilegierte Parent transportiert
höchstens begrenzte Bytes/Metadaten und parst den historischen Store nicht.

Die gewählte Cutovergrenze benötigt eine externe echte Stop-/Quieszenztransaktion
unter den originalen Writerlocks und eine vollständige immutable-ext4-Versiegelung
des alten `plan-jobs`-Baums. Eigentum oder chmod allein verhindern weder offene
Schreibdeskriptoren noch den Neustart des alten root-Entrypoints. Die betreffende
WIP-chmod-Routine wurde entfernt. Der neue read-only Verifier prüft lediglich
Dateisystemeigenschaften; er ersetzt keine Stop-Autorität.

Alle neuen V2-Records, Locks und Ergebnisse gehören in das Geschwisterverzeichnis
`plan-jobs-v2`. Bereits abgeschlossene historische Ergebnisse bleiben ausschließlich
lesbar, ausgewählt durch persistierte `resultOrigin` und verifizierte Importprovenance.
Die separaten ursprünglichen Runtimeartefakte und ihre Ressourcenbuchung bleiben
erhalten. Kein Service darf alte V1-Jobs erneut parsen oder ausführen. Siehe den
[aktuellen Consumervertrag](buster-historical-consumer-boundary-20260921.md).

Der Importhost liest und validiert den V1-Snapshot einmal mit originalem
Recordstore-Replayvalidator, Original-Payloaddigests, Schemas, Sourceattestationen
und Status-/Jobbindung. Überschreitet schon dieser Bestand das zulässige feste
Budget, scheitert der Import geschlossen. Kein Limit wird automatisch erhöht.

## Referenzen, Wahrheit und Persistenz

- Volle V1-Jobs erhalten `buster-historical-input.v1`: importId, Originalsequenz,
  Originalpayloaddigest, echter gemeinsamer attemptSpecDigest und Slot sowie
  Job-/Request-/Header-/Wireidentität. Der einzige Pfad ist
  `<sourceRoot>/<importId>/data/inputs/<sequence>/request.json`; kein frei
  übergebbarer Dateipfad. Die erzeugte JSON-Wire ist eine neue Serialisierung
  des validierten Originaljobs, keine Behauptung über originale HTTP-Wirebytes.
- Kompaktierte historische Jobs haben gerade **keinen** vollständigen Wire.
  Ihr bereits validierter terminaler Status und originales Compactionreceipt
  werden unverändert als terminaler Import übernommen. Dafür braucht V2 einen
  engen diskriminierten Datensatz mit `input:null`, `source:null` und gebundener
  Provenance; er darf nie in Extraction/Execution gelangen. Kein Git-Rebuild
  zur Erfindung eines fehlenden Originals.
- Alle Originalrecords, Envelopes, Status und Receipts bleiben im versiegelten
  V1-Snapshot unverändert. Veränderte V2-Payloads bekommen ihre **echten neuen**
  Payloaddigests. Originaldigests sind Provenance, keine gefälschten V2-CAS-Werte.
- Der Host erstellt den V2-Snapshot einmal als Kandidat. Kein je-Job-
  `append`/`records`-Loop, der ständig ganze JSON-Stores neu liest/schreibt.
  Bestehende fremde V2-Inhalte werden nicht überschrieben. Ein Restart mit
  passender gebundener Importreceipt ist Wiederaufnahme, kein erneuter Import.
- Vor jeder Allokation reserviert der Rootledger den gesamten beanspruchten
  Platz: retained Originalbytes, Wiredateien, V2-Kandidat, Metadaten/Receipt,
  Datei-/Verzeichniseinträge und tatsächlich nötige temporäre Überschneidung.
  Ein bounded Gruppenmanifest ist gezählte Autoritätsmetadaten, kein freier
  Zweitkatalog. Es gibt keine automatische Retirementfreigabe des Altbestands.
- Erst nach nativer Result-/Cleanupbestätigung, leerem Scope, widerrufener
  Hostschreibautorität, validierten Inputdateien und atomarer V2-Publikation wird
  die vollständige Importreceipt dauerhaft veröffentlicht. Sie bindet die
  ursprüngliche Snapshotidentität, V2-Identität, Gruppendigest und Gesamtzahl.
  Erst danach darf der Service starten. Der Slot wird genau einmal freigegeben.

## Gemeinsame Schnittstellen, noch abzustimmen

Die Historical-Module besitzen Referenzvalidator/Resolver, Gruppenbudget und
Importzustand. Der gemeinsame Sourceledger vergibt den echten Slot/Envelope
und hält ihn bis zur endgültigen Gruppenquieszenz. Vorgeschlagen sind
`reserveHistorical(importId, profile, now)` sowie
`retainHistorical(importId, receiptDigest)`; deren persistierter Status muss
Crash-Recovery ohne zweite Slotbelegung erlauben. `resolveHistoricalInput`
prüft root-eigene Gruppenautorität und die ausgewählte Referenz, dann liefert er
den fest berechneten Pfad. Normale Extraction streamt die Bytes; der owned
Extractionhost prüft sie erneut. Service und UID 1000 parsen keinen V1-Bulkstore.

Konkret bestätigte Produktionsgrenze: der EntryPoint und Helmwerte verwenden
`/var/lib/buster-v2/plan-jobs` auf eigenem PVC; der alte Docker-ENV-Default unter
Builder-HOME ist keine vertrauenswürdige Migrationswurzel. Sourcegates liegen
im abgestimmten Ziel `/var/lib/buster-v2/native-sources`. Alle Vorfahren werden
auf root-eigene, nicht gruppen-/weltbeschreibbare Autorität geprüft.

Der Rootparent besitzt ausdrücklich kein DAC_OVERRIDE. Der owned Host erstellt
finale Datenverzeichnisse deshalb als 0755 und vollständige Input-/Metadatendateien
als 0444; ihre UID bleibt die tatsächliche Vorbereitungs-UID. Privatsphäre und
Unveränderbarkeit gegenüber erneut verwendeten Slots entstehen durch das erst
nach Quieszenz widerrufene äußere root:root-0700-Gate. Kein rekursives root-chown
des Bulkbaums und keine zusätzliche DAC-Capability. Nur die drei bekannten
V2-Metadatenknoten erhalten bei Publikation die Service-Schreibautorität.

Für einen vorhandenen V1-Store ist zusätzlich eine extern produzierte,
rootgeschützte Stop-Receipt erforderlich. Der neue Pod erzeugt diese niemals
selbst. Der vom Parent separat erarbeitete Maintained-Host-Preflight muss reale
Workload-/Containeridentitäten, Node/Boot und CRI-/Cgroup-Quieszenz sowie die
ursprüngliche Storeidentität binden; Podabwesenheit, TTL oder ein behauptetes
`ok` reichen nicht. Producer, enger Verifier und deren echte Tests sind noch
offen. Ohne diese Authority bleibt ein nichtleerer Import geschlossen; ein
sauberer neuer Store ist davon unabhängig. Die physische Versiegelung ersetzt
keinen Nachweis, dass ein Altprozess mit vorgeöffnetem Schreib-FD beendet ist.

## Abnahmefälle vor Code

Alle Fälle sind noch nicht ausgeführt. Tests und VM-Ausführung werden mit dem
Parent serialisiert; historische Testergebnisse gelten nicht als neue Beweise.

| Fall | Erforderlicher tatsächlicher Nachweis |
|---|---|
| HI1 · Vollimport | Original erzeugte V1-Jobs aller vorhandenen Zustände; originaler Status/Receipt/Resultzugriff bleibt exakt, neue V2-CAS-Digests sind korrekt, Originalsnapshot bytegleich. |
| HI2 · Kompaktierte Wahrheit | Originale Kompaktion importiert unverändert; kein Wire erzeugt, keine Extraction/Execution, Originalreceipt und Ergebnis bleiben abrufbar. |
| HI3 · Ein Slot | `maximumActivePreparations=1`, mehrere Jobs, ein tatsächlicher Native-Owner; kein zweiter Host oder vorzeitiger Slotrelease. |
| HI4 · Ressourcen | Alte Bytes plus alle neuen/temporären Bytes/Einträge sind gezählt; exakter Fit und eine Einheit zu wenig; CPU/RAM/Task/Deadline unverändert und Überschreitung geschlossen. |
| HI5 · Writer/CAS | Echter konkurrierender alter Writer wartet; nach Versiegelung scheitert sein Write auch nach Lockfreigabe. Digeständerung, Storetausch, Symlink/Hardlink und fremde V2-Inhalte werden abgewiesen. |
| HI6 · Crash | Tatsächlicher Prozessverlust vor/nach Reservierung, Wirepersistenz, V2-Publikation und Receipt. Restart übernimmt ausschließlich exakt gebundene Zustände; kein Teilimportservice, doppelte Reservierung oder zweite Ausführung. |
| HI7 · Keine Bulkflucht | V1-Parsing ausschließlich im owned Host; ein vollständiger Read/Parse pro Importversuch, keine je-Job Vollscans oder ungezählten Kopien. Fehler in Importhost/Protokoll lässt Listener geschlossen. |
| HI8 · Originalconsumer | Produktionsservice startet erst nach vollständiger Receipt; Duplicate/status/recovery lesen nur V2; Resultzugriff folgt ausschließlich der persistierten, verifizierten Quelle. Veränderte alte Zustellung konfligiert; keine alten Produktionsfallbacks. |
| HI9 · Negative Kontrollen | Entfernte Seal-/Digest-/Quieszenz-/Vollständigkeitsprüfung muss jeweilige echte Assertions verletzen; keine Importfehler als Mutanterfolg. Nichtautor prüft finale Quellen und Doku. |
