# contract.observability — Dauerhafte Producer-Zustellung v1

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. Vollständige TS-Typen/Validierung/Schema, Go-Typen und
Validatoren (486 Zeilen), Fixtures, Fixturechecker und Vertragstest untersucht.

## 1–2. Verantwortung, Verwendung und Schnittstellen

`contracts/pipeline-observability/v1/src/index.ts` exportiert sieben öffentliche
Definitionen: ProducerIdentity, Record, AdmissionAck, ReplayRange, GapReport,
Closure, Completeness. Kein eigener Dienst. ProducerId/BootId/PipelineRunId
scopen Reihenfolge; RecordId plus Digest hält Wiederholungen auseinander.
Ack enthält später vergebenen canonicalCursor. Correlationfelder sind vorhanden
und ggf. null, nicht beliebig weggelassen. Zähler sind auf JS safe integer begrenzt.

Aktive TS-Pfade: Buster.runner:1843 bildet ProducerRecordDigest;
Foundation.FileProducerOutbox.append:345–390 klont, signiert nicht, hasht und
validiert kanonische Bytes. AdmissionStore.#admitUnlocked:560–625 dekodiert
identische Wirebytes, vergleicht Identität/Digest und vergibt Cursor erst bei
persistierter Aufnahme. DurableAttemptStore prüft Record/Closure eines
CompletionIntent. Nova.reconciler und ClawDeck-View lesen Completeness-Typen.
Go-Paket ist Referenz-/Interoperabilitätsimplementation; außerhalb Fixturechecker
keine produktiven Go-Aufrufer im Repository gefunden. Nicht mit aktivem
Kubernetes-Namespacecontroller verwechseln.

## 3–6. Zustand, Fehler, Zustellung und Wiederanlauf

Vertrag selbst zustandslos; Speichern vor ACK und Wiederholung nach ACK-Verlust
liegen im Foundationstore. Wiredecoder verlangt exakt kanonisches JSON (auch
kein abschließender Zeilenumbruch), UTF-8 ohne BOM, keine unbekannten äußeren
Felder, sichere Zähler sowie full-record-/closure-Digest. payload ist absichtlich
beliebiges JSON. Recorddigest lässt ausschließlich recordDigest aus; Closure
analog. Es gibt keine kryptographische Signatur oder Sourceauthentifizierung.
TS-Sortierung sprachunabhängig nach UTF-16; ungültiges Unicode, Nicht-JSON-Typen,
Sparsearrays und nichtendliche Zahlen werden abgewiesen. In-process Getter/
Symbols und Zyklen/Tiefe sind keine vollständige Datenobjektvalidierung. Wire
JSON.parse entfernt keine Rohdaten; kanonische Gleichheit lehnt abweichende
Darstellungen ab. Byte-/Tiefenbudget muss der aufrufende Store erzwingen.

Relationen prüfen geordnete Replay-/Gapbereiche, bei Closure leeren 0/0-Bereich
oder lückenlose 1..recordCount-Angabe. Tatsächlich vorhandene Sequenzen/Evidenz
prüft erst der Store. Completeness partitioniert erforderliche Closure-IDs,
verlangt attributable Ursachen bei partial/degraded/unknown und verbietet
unaufgelöste Ursachen bei complete. Eine leere Erwartungsliste kann complete
sein; Vollständigkeit der Erwartungsmenge bleibt Verantwortung ihres Erzeugers.
Keine eigenen Timer, Cancellation, Locks, Retry oder Garbage Collection.

## 7–9. Vertrauen, Ressourcen und Architektur

Validierung bestätigt Form/Integrität, nicht Autorisierung, Besitz des Producer-
namens, Zuverlässigkeit von Messungen oder wirklich durable Speicherung.
Geschützte lokale Storewurzeln bzw. authentifizierter Transport erforderlich.
Infrastrukturprüfung dazu später. Identitäten max256 Zeichen, Evidenz-/Closure-
Listen max10000; payload unbeschränkt im Datenvertrag. Admission hat separate
Ingress-/Metadatengrenzen, Outbox klont/serialisiert vor seinem Gesamtbudget.
Go und TS nutzen unterschiedliche Parser/Validierungen; gemeinsame Vektoren
müssen mehr als einen Happy-Path umfassen. Langfristig gemeinsame generierte
Struktur plus explizite relationale Regeln statt zweier driftender Handlisten.
Keine Kompatibilitätsparser für nichtkanonische Bytes vorschlagen.

## 10. Tests und tatsächliche Aussage

`check-pipeline-observability-contracts.mts` gelesen und unverändert gestartet.
TS-Assertions bis zum Go-Aufruf liefen ohne Fehler: Digestbindung, Pflichtfelder,
Safe-Integer, Reihenfolge, Closure, Completeness, nichtkanonische Zahlen/BOM/
Newline und Golden-Digest. **Gesamtbefehl fehlgeschlagen/blockiert**: fest
verdrahtetes `/usr/local/go/bin/go` fehlt; auch `command -v go` findet kein Go.
Der finally-clean-Aufruf verdeckt den ersten Go-ENOENT im ausgegebenen Stack.
Kein bestandener Cross-Language-Test und keine Ersatzimplementierung.
[Protokoll](../evidence/observability-contract-tests.txt).
Fixturechecker prüft reale Go-Encoder/Decoder, aber wurde hier nicht ausgeführt.

Fehlende Verifikation: breitere TS/Go-Negativmatrix (Kalenderränder/Schaltsekunden,
nullable Felder in verschachtelten Objekten, Unicode-Identifier, Tiefenbudget),
Eigentum an In-process-Werten. Schema verwendet Ajv date-time, Go time.Parse;
gleiche Annahme über sämtliche Zeitrandfälle nicht aus Goldenfixture abgeleitet.

## 11. Dokumentation und historische Befunde

README für Wire-/Zuständigkeitsregeln vorhanden, zu Ressourcen, In-process-
Wertdomäne, Go-Installationspfad und tatsächlicher Consumerabdeckung unvollständig.
`pipeline-observability-phase-5-7-b-audit.md` erneut abgeglichen: vier frühere
Lücken (complete trotz fehlender Evidenz, nicht runbezogene Closure, nur Payload-
Digest, fehlende Goimplementation) sind im heutigen Code behoben. Ein damaliger
„clean“-Review gilt nicht als aktueller Cross-Language-Lauf. Geschlossene Objekte
bezieht sich nicht auf payload. Telemetry-Envelopes werden nicht ersetzt.

## 12. Ergebnis und offene Nachweise

Kein neuer isoliert bestätigter Laufzeitdefekt in diesem Review. Strikte
Wire-/Relationspfade sind implementiert; Auth-, Durability-, Erwartungs- und
Retentiongarantien werden in [foundation.observability](foundation.observability.md)
beurteilt. SDK-Serialisierungsbefund gilt nicht ungeprüft für diese strengere
Implementation. Echte nächste Verifikation: vorhandenen unveränderten
Vertragstest mit Go1.24 und tatsächlich verfügbarer Modulabhängigkeit laufen
lassen, danach gemeinsame Randfallvektoren für beide Originalvalidatoren.
Keine CI angefordert. Alle relevanten Vertragspfade gelesen; Laufzeitparität
und Infrastruktur bleiben ausdrücklich unbestätigt.
