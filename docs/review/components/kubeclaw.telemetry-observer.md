# kubeclaw.telemetry-observer

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Code-Trace und lokale Tests; kein Produktions-/OpenClaw-E2E-Nachweis.

## 1. Verantwortung, Registrierung, Nutzung

`skills/common/plugins/telemetry-observer/src/observer.ts` registriert über
plugin.json einen telemetry-Observer für 27 Lifecycletypen, nur in Rolle nova
ausgeliefert. `skills/nova/core/telemetry/observers.ts` wählt Registrierungen mit
Grants und passenden Subscriptions; die Projektion wird über deliverObserver
aufgerufen. Tests/E2E-Fixtures konfigurieren die Auswahl, Rollenpaket allein
belegt keinen laufenden Produktionssink.

## 2. Ein-/Ausgabe und Gegenstellen

ObserverDelivery mit Coreidentität wird zu telemetry-envelope.v2, stabiler
deliveryId und Observerprovenienz; event enthält ID/Sequenz/Typ, redigierte
Identität/payload, Zeit und causationId. `observe` ruft telemetry.emit/append
für telemetry.event/Eventtyp auf. Provider sind Filetelemetry oder Redistransport;
Fileadapter akzeptiert dieses offene Payloadobjekt. Kein eigener v1-Exporter
oder Dashboardconsumer. Core filtert obserververursachte effect.*-Events in
isObserverDeliveryInput, um rekursive Telemetrieeffekte zu vermeiden.

## 3. Persistenz/Commit

Keine eigene Persistenz; awaited effect und anschließende Corecompleted-/
Checkpointjournale. Sinkbestätigung ist nicht bereits der Observercheckpoint.
DurableRecordStore übernimmt Snapshot/Digest/fsync/Verzeichnis-ACK; Redis hat
separate externe Dauerhaftigkeitsannahmen.

## 4. Korrektheit/Fehler

Alle Eventdispositionen bleiben als ursprünglicher Typ erhalten. Sinkfehler
werden geworfen, nicht als Erfolg gemeldet. Manifest best_effort/fünf Versuche
lässt bei dauerhaftem Fehler den Run im Observerdrain blockiert, ohne den
fachlichen Lifecycle-Erfolg rückwirkend zu verändern.

## 5. Wiederholung, Timeout, Parallelität

Per-run ordering, 10s je Versuch, 1s Backoff und fünf Versuche. Kein eigener
Timer/Retry. Kein attemptNumber/deliveredAt im Sinkpayload; Retries erzeugen
identische Bytes und stabilen Effektkey. Corezustellung setzt keine hier
messbare harte CPU-/RSS-Grenze durch.

## 6. Restart

Sinkcommit vor completed erlaubt Redelivery unter demselben Key. completed vor
Checkpoint wird in observer-recovery rekonstruiert; keine plugininternen
Stage-/Waitprojektionen. Voller SIGKILL-End-to-end-Nachweis fehlt ausdrücklich.

## 7. Authentifizierung/Provenienz

telemetry.emit-Grant mit Eventpräfixscope; Observer kann keinen Schedulerzustand
ändern. `sdk/src/values.ts` redigiert Feldnamen; Core liefert Registrierung und
kanonische Identität. Redaction ist keine Freitextgeheimnisprüfung. Keine
Autorität aus dem Payload ableiten.

## 8. Ressourcen/Retention

Kein eigener Cache. SDK: Tiefe16, 1000 Einträge pro Container, 65536 Zeichen
pro String, kein globales Traversalbudget; Object.entries/Getters werden vor
Kürzung ausgewertet. Sinklimits sind getrennt und können Envelopegröße ablehnen.
Aufbewahrung ist [PCR-OBS-002](foundation.observability.md), kein neuer Duplikatbefund.

## 9. Architektur

30 Zeilen Projektor halten Providerdetails draußen; doppelte historische
Telemetriepfade sind kein Grund, hier Redis einzubauen. Provenienz und stabile
causationId sind sinnvoll, der doppelte Quelltextpfad im Boundarytest erhöht
hingegen nicht die Abdeckung.

## 10. Untersuchte und ausgeführte Tests

`npm test` im Paket bestanden: [Protokoll](../evidence/observers-telemetry-observer-tests.txt).
Parity geht über alle Manifesttypen und Retrybytes; live-function ist trotz
Namen ein originaler Projektor mit aufgezeichnetem invoke und künstlichem
TELEMETRY_SINK_CRASH, keine echte Netz-/Speicherzustellung. Package-boundary
prüft Importmuster. Diese Tests wurden vollständig gelesen. Reale Sinks werden
in deren Reviews separat geprüft; kein Last-/Restart-/OpenClaw-Nachweis hier.

## 11. Dokumentation

README vorhanden und passend zu Herkunft, Eventmapping und stabiler Retrypayload.
Katalog/Manifest stimmen in Rolle und Capability überein. Unvollständig: konkrete
produktive Auswahl, globale Ressourcenmessung und sinkabhängige Retention.

## 12. Befunde und offene Verifikation

Kein neuer Defekt dieses dünnen Projektors nachgewiesen. Gemeinsame Grenzen:
[nova.telemetry](nova.telemetry.md), [telemetry-store](kubeclaw.telemetry-store.md),
[redis-transport](kubeclaw.redis-transport.md). Als nächstes originale Runtime mit
beiden austauschbaren Providern und verlorenem Sink-ACK prüfen; bestandene
Projektorfixtures sind kein solcher Nachweis.
