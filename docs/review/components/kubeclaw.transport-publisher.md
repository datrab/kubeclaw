# kubeclaw.transport-publisher

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Code und Originalpakettests vollständig untersucht.

## 1. Verantwortung, Registrierung und Nutzung

`skills/common/plugins/transport-publisher/src/adapter.ts#activate` bietet
transport.publish, Untercapabilities network.http/secrets.read. Rolle nova
liefert den Provider aus; Auswahl erfolgt durch Registrygrants. Original-
live-function installiert ein explizites test.transport-consumer-Paket zur
Capabilityzuordnung, keine echte produktive Publikationspipeline. Dieser
Adapter ist HTTPfoundation, nicht der alternative Redisprovider.

## 2. Verträge und Gegenstellen

publish für transport.target/canonicalId aus Targetmap; Payload ausschließlich
{message:{...}}. Receiver bekommt POSTbody, idempotency-key, x-kubeclaw-target,
x-kubeclaw-signature=sha256:HMAC(target+'\n'+key+'\n'+exactJSON).
Secret wird vertraulich resolved. network-http setzt tatsächlichen Request ab.
Empfänger muss geschlossen {accepted:true,publicationId} und2xx liefern;
Adapter gibt accepted/target/publicationId/status zurück. Keine Publikations-ID-
Bindung über ein zusätzliches Echo von Key/Digest; Bindung beruht auf dem
zugeordneten HTTPrequest und vertrauenswürdigen konfigurierten Empfänger.

## 3. Persistenz/Commit

Deliveryroot mit FileDurableRecordStore, Stream publications/<target>. Request
wird vor Netzwerk dauerhaft gespeichert und bei Retry auf gleichen Digest
geprüft. Pro Attempt8KiB-Reservation, danach Secret/HTTP, dann CAS-Transition
auf receipt/failure. Sharedstore snapshotet/klont, prüft Replaydigest/Sequenzen;
fsync→rename→Verzeichnisfsync vor ACK. Prozessübergreifender Kernel-flock
anstelle PID-Reclamation; sichere lokale Dateisystemsemantik vorausgesetzt.

## 4. Fehler/Disposition

Geschlossene Config und Payload, Protokoll/Userinfo/Target-/Secret-/Byteprüfungen;
2xx mit accepted:false wird explizit abgelehnt, falscher Body/ID ebenfalls.
Originalfehler wird gehasht und begrenzt im failurerecord gespeichert. Erfolg
gewinnt bei konkurrierendem Terminalkonflikt. Ein bereits gespeicherter failure
im selben Attempt wird sofort wieder geworfen. Receipt-Replay nach Request-
vergleich verhindert Changed-content-Replay, keine stillschweigende Überschreibung.

## 5. Timeout/Abort/Parallelität

Kein eigener Netzdeadline, network-http/aufrufender Core setzen Zeitgrenzen.
Signal vor Beginn/nach Secret/nach HTTP; Filewrites/flock sind nicht interruptibel.
Reservation ist kein exklusiver Sendclaim, zwei direkte Parallelaufrufe können
beide senden; Originalfixture zeigt2 Sends. Core-Ressourcenlock reduziert dies
im regulären Pfad, externe Dedupe bleibt bei ACK-Verlust notwendig.
shutdown setzt stopping, drainiert aktive Aufrufe nicht selbst.

## 6. Restart und gültige Präfixe

Request-only → Terminal reservieren. Reservation-only → externe Wirkung noch
nicht nachgewiesen; nach HTTP vor Transition ebenfalls reservation, aber
Wirkung ungewiss. Receipt vorhanden → unverändert zurückgeben, failure vorhanden
→ gleicher Attempt scheitert, anderer kann im Direktadapter neu senden. Nach
Sinkreceipt vor Core-Receipt fehlen dem Adapter jedoch receipt(request)-Hook
und automatische Reconciliation mit accepted-Coreeffekt. Keine behauptete
Restart-Exactly-once-Garantie. Kein eigener Stage/Waitpräfix. Zentraler
failed-Receipt-Retrybefund [PCR-OPERATOR-001](kubeclaw.operator-messaging.md)
gilt auch bei Aufruf dieses Providers aus einem Observer.

## 7. Vertrauen und Evidenz

Target- und Origin-Allowlist aus Plattformpolicy; Secretname explizit. Nur HMAC,
kein raw signingKey im normalen Effectjournal. Empfängerverifikation und
Dedupe sind Betriebsvertrag; localhosttest berechnet erwartete Signatur,
kein unabhängiger produktiver Empfangsnachweis. Payload wird nicht redigiert,
Caller ist für veröffentlichbare Inhalte verantwortlich. HTTP ist zulässig,
TLS-/Netzvertrauen muss der konfigurierte Endpoint erfüllen.

## 8. Ressourcen und Aufbewahrung

maxPayload≤1MiB (default256KiB); Store default100000/256MiB, Record1MiB+65536;
Reservation verhindert Send bei bereits voller Kapazität. Tatsächliches ENOSPC
nach Send bleibt möglich. assertJson prüft plain records, endliche Zahlen,
Zyklen und Tiefe64; sparse arrays liefern undefined und werden abgelehnt.
Object.entries wertet Getter aus; kein globales Node-/Breadthbudget vor
JSON.stringify. Shared SDK-Nicht-JSON-Grenzen bleiben beim Core relevant.
Keine Retention, siehe [PCR-OBS-002](foundation.observability.md).

## 9. Architektur

Publisher enthält Ziel-/HMAC-/Ackpolicy plus dupliziertes Deliveryprotokoll aus
Operator. Ein gemeinsamer persistierter Deliveryzustandsautomat wäre dauerhaft
wartbarer, konkrete Message-/Receiververträge bleiben getrennt. Nicht mit Redis
kompatibel machen, solange kein fachlicher Consumer das verlangt.

## 10. Tests

Alle config-validation/live-function/package-boundary-Originaltests gelesen;
`npm test` bestanden: [Log](../evidence/observers-transport-publisher-tests.txt).
Configtest prüft unknown fields/Endpoint/Secret/Limit. Live-function: echter
localhost-HTTPserver, originale Registry/Network/Secrets/Adapter, synthetischer
Consumer und MemoryEffectJournal/Memorylocks. Signaturbytes, Replay, Ablehnung,
503, falscher Body, Vorab-Abort, Secretfreiheit. Direkte context.invoke-Fixtures
prüfen neuen Attempt nach503,256-Zeichenkey, Changed-content-Konflikt, Kapazität
vor Send, concurrent failure/success und fast1MiB. Kein SIGKILL, Redis, tatsächlicher
externer Empfänger, Ressourcenlast oder leerer Core-Receipt-Recoverylauf.

## 11. Dokumentation

README vorhanden; geschlossenes Payload/Ack, HMAC und reservierter Deliveryplatz
entsprechen Code. 'stored receipt replayed' stimmt für direkten Adapterzugang,
verschweigt aber den regulären Coreaccepted-ohne-Receipt-Pfad. Explicit HTTP-
foundation statt Redis-/Legacyparität ist korrekt. Retention/Unknown-Outcomes
und tatsächliche Drainsemantik sind unvollständig.

## 12. Befunde und nächste Schritte

Kein zusätzlicher Duplikatbefund zum hier gleichen Deliveryprotokoll:
[PCR-OPERATOR-001](kubeclaw.operator-messaging.md) erklärt unverbrauchbar
gewordene Observer-Retrymöglichkeiten nach failed-Core-Receipt. Eigene genaue
Integrationslücke: Originaladapter besitzt keinen receipt-Export; als nächstes
accepted-Corepräfix mit bereits vorhandenem Sinkreceipt über originalen
AdapterRuntime neu starten und kontrollierte Reconciliation nachweisen. Bei
Ursachenreparatur vollständige Request/Reservation/Receiptpräfixmatrix gegen
realen deduplizierenden HTTPempfänger prüfen. Kein fehlender Quellcodepfad
wird als schon bestandene Crashprüfung ausgegeben.
