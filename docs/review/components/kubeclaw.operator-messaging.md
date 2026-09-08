# kubeclaw.operator-messaging

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Alle Implementierungsdateien und Pakettests gelesen.

## 1. Verantwortung, Registrierung und Nutzung

`skills/common/plugins/operator-messaging/src/{adapter,config,payload}.ts`
ist der Nova-provider operator.request. Manifest fordert network.http und
secrets.read. Sender sind notification-observer/preview und Operatoranforderungen
fachlicher Plugins; bestehender live-function benutzt originale Registry,
Adapterruntime und HTTP/Secretprovider. Rolle nova liefert aus; konkrete
Productiontargetkonfiguration ist kein Teil dieses Nachweises.

## 2. Eingaben, Resultat, Sender/Empfänger

publish/operator.target muss auf konfiguriertes logisches Target zeigen.
parsePayload validiert geschlossenen Typ/envelope, Strings/JSON/Felder; maxBytes
je Target. JSON oder discord_webhook-Transformation mit mentions.parse=[];
POST über network.http, HMAC über key+'.'+JSONbody. Normalmodus tokenSecret,
Secret-Endpointmodus endpointSecret plus exakter erlaubter Origin und
invokeConfidential. HTTP2xx plus optionale body.messageId/id ergeben accepted/
target/status/messageId. Reale generische Empfänger-HMACprüfung/Dedupe wird
vorausgesetzt; localhost-Test prüft Signaturbytes, ist kein Discorddienst.

## 3. Persistenz/Commitpunkt

Original FileDurableRecordStore unter deliveryRoot; Stream notifications/<target>.
Request mit keydigest zuerst, dann pro Attempt8KiB-Terminalreservation, erst
danach Secret-/Netzaufruf. Nach2xx wird reservation per erwarteten PayloadDigest
in receipt überführt, auf Fehler in failure. ACK an Core erst nach Transition.
Snapshot und Rückgaben sind geklont; Sharedstore fsync→rename→directoryfsync
und Kernel-flock bieten atomare Dateiübergänge, keine atomare HTTPtransaktion.

## 4. Korrektheit/Fehlerdisposition

Target/Operation/Schema/Größe fail closed. Receiptprüfung erfolgt nach Vergleich
des ursprünglichen Requestpayloads, geänderte Wiederholung kollidiert. Gespeicherte
Failure desselben Attempts wird unmittelbar erneut geworfen. Transitionkonflikt
bevorzugt vorhandenen Erfolg und kann späten Erfolg über früheren Fehler stellen.
HTTP503 und ungewisser Timeout werden beide als failure persistiert; tatsächlicher
Remoteoutcome erfordert Empfänger-Dedupe. Zentrale Retrygrenze PCR-OPERATOR-001.

## 5. Timeout, Abbruch, Wiederholung, Parallelität

Signal vor Aufruf/nach Secret/nach Netz geprüft; Netzwerkzeitlimit gehört zum
network-http-Adapter. Dateilockwartezeit und fsync sind nicht signalabbrechbar.
Corefence nur beim Adaptereintritt; nach einem ungewissen Netzaufruf ist eine
positive Receipt trotz inzwischen ungültigem Lease noch reconciliationrelevant.
Parallelität: Reservation ist kein exklusiver Sendclaim; zwei direkte Aufrufe
können beide senden (vorhandener Test erwartet2), Empfänger muss deduplizieren.
shutdown verbietet neue invoke, drainiert aktive nicht selbst.

## 6. Restart und alle Abschlusspräfixe

Vor Request: kein Send. Request-only: Retry reserviert Terminal. Reservation
vor HTTP: Retry darf senden; nach HTTP vor Terminal ist Sendoutcome ungewiss,
noch vorhandene Reservation reicht nicht als Exklusivität/Proof. Terminalreceipt
vor Core-ACK: Receipt wird wiedergegeben ohne zweiten Send. Failure: nur anderer
Attempt kommt am Adaptercache vorbei; beim regulären Observer verhindert schon
failed-Core-Receipt den Wiederaufruf (s.u.). Kein receipt(request)-Recoveryexport,
daher kann Core accepted-ohne-Receipt nicht allein anhand dieses dauerhaften
Sinkjournals rekonstruieren; dies bleibt konkrete Recoveryintegration, nicht
bestandener SIGKILL-Nachweis. Keine zusätzliche Stage/Waitprojektion.

## 7. Vertrauen und Herkunft

Exakte Target-/Origin-/Secret-Allowlist, keine callerbestimmten URLs/Header.
Secret-Endpoint darf im vertraulichen network-Aufruf erscheinen, nicht im
auditierten normalen Effectrequest. HMAC bindet Key/Body, nicht Targetnamen;
Origin-/Targetkonfiguration ist vertrauenswürdig. discord_webhook deaktiviert
Mentions, trifft aber keine vollständige Discordfeld-/Gesamttextgarantie.
Payload darf Freitext enthalten; er wird in der Deliveryrequestdatei gespeichert.

## 8. Limits/Retention

Targetbody≤1MiB, Defaults65536; ganze Deliveryhistorie default100000/256MiB,
Record1MiB+65536,8KiB-Terminalreserve. Voller Store verhindert Netzwerk vor Send.
Reservierung hält Raum für kleinen Terminalrecord; echte Datenträger-ENOSPC
oder fsyncfehler nach HTTP bleiben möglich. validateJson hat Tiefe20 und1000
Einträge pro Container, kein globales Knotenbudget, Getter/Object.entries vor
Bytecheck; Core JSONgrenze bleibt relevant. Retention [PCR-OBS-002](foundation.observability.md).

## 9. Architektur

Deliveryprotokoll ist weitgehend mit transport-publisher dupliziert, aber
Empfängerverträge/HMAC unterscheiden sich. Gemeinsam geprüfte Deliveryzustands-
maschine wäre sinnvoller als weitere ad hoc Retrypfade. Erst stabile
Deliveryidentität von Ausführungsversuchen/Receipt-Reconciliation trennen.

## 10. Tests und Evidenz

Original npm test bestanden: [Log](../evidence/observers-operator-messaging-tests.txt).
Alle Tests gelesen: echte localhost-HTTPzustellung und Abbruch/Closed-Socket,
Originalregistry/-network/-secret; MemoryEffectJournal/MemoryResourceLockManager.
Direkte Adapterfixtures zusätzlich503→anderer Attempt, lange Keys, Konflikt,
volle Recordkapazität ohne Send und paralleler failure/success. Diese letzten
Sends sind aufgezeichnete context.invoke-Fixtures, kein echter HTTPserver.
[Integrationsprobe](../evidence/observers-notification-retry.mts),
[Log](../evidence/observers-notification-retry.txt) modifiziert nur vorhandenes
HTTPfixture auf einmal503, dann gesund: Originalcore/Observer/Adapter/Dateien,
5 gescheiterte Deliveryversuche,1 HTTPrequest,0 Checkpoints. Kein Modul ersetzt.
Kein echter Discord, SIGKILL oder durable-Coreaccepted-Präfixlauf.

## 11. Dokumentation

README vorhanden, aber Aussage 'never places the resolved secret in a
network.http request' ist für endpointSecret/invokeConfidential veraltet;
Geheimhaltung gilt für reguläres Journal, nicht absolut jede interne Invocation.
Dedupe-/Reservebeschreibung passt, Replay setzt erreichbare Core-Sink-Recovery
voraus. Generischer Empfänger muss key/signature prüfen; echter Discord tut
keine hier nachgewiesene HMAC-/Keydedupe. Retention und failed-Observerretry fehlen.

## 12. PCR-OPERATOR-001 — Transienter Sendefehler verbraucht Observer-Retries ohne neuen Send

**Mittel, nachgewiesener Integrationsdefekt.**
Sender `skills/nova/core/telemetry/observer-delivery.ts:17–30` benutzt trotz
steigendem deliveryAttempt immer dieselbe Attemptidentität/Nummer1 und denselben
Effectkey. `core/effects/durable-invocation.ts:46–49,119–126` liefert jedes
bereits gespeicherte Receipt einschließlich failed zurück. Zusätzlich
`operator-messaging/src/adapter.ts:103–108` cached failure pro Attempt.
Originalprobe: einmaliger HTTP503, anschließend gesunder localhost-Empfänger;
alle fünf Observerversuche scheitern, Netzwerk sieht nur1 Request, Checkpoint
bleibt0 und nächster Drain meldet ATTEMPTS_EXHAUSTED. Auswirkung: transienter
Sendausfall wird dauerhaft fehlende Nachricht und blockiert spätere Lifecycle-
Nachrichten desselben Runs. Telemetry-/Transportprovider unter derselben Core-
Retrygrenze ebenfalls betroffen; Eigentümer hier, keine Doppelzählung.
Ursachenbehebung: explizite retrybare Failure-/ungewisse Outcome-Disposition,
stabile externe Delivery-ID getrennt von neuem Ausführungsattempt; Core- und
Sinkreceipts gemeinsam reconciliieren. Nur attemptNumber erhöhen verletzt
bestehende Effectkeyidentität und repariert nichts. Regression: bestehende
Originalprobe nach Fix muss zweiten Send/Checkpoint zeigen, dauerhafte Ablehnung
bleibt begrenzt, verlorenes Remote-ACK erzeugt bei deduplizierendem Empfänger
keine doppelte Wirkung, Restart darf Retrybudget nicht zurücksetzen.
