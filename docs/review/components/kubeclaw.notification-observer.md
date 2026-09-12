# kubeclaw.notification-observer

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Code-Trace und lokale Tests; kein Produktions-/OpenClaw-E2E-Nachweis.

## 1. Verantwortung, Auslieferung und Nutzung

`skills/common/plugins/notification-observer/src/observer.ts` liefert lifecycle-
Benachrichtigungen und begrenzte Previewmetadaten. Manifest notifications für
14 Lifecycletypen, preview-delivery für artifact.created; Rolle nova. Konkreter
Aufruf über Core ObserverRuntime und Original-operator/network/secret-Adapter
im lokalen live-function-Test. Produktive Auswahl hängt von Plattformgrants ab.

## 2. Verträge beider Seiten

Eingang ist Core ObserverDelivery. `lifecycleNotification` bildet severity,
title, summary, reasonCode, Run-/Stagefelder und Footer ab; Konfigurationslabels
und suppressEventTypes verändern Darstellung/Auswahl. `previewNotification`
übernimmt nur artifactId/digest/mediaType/logicalName. Beide senden
operator.request/publish an operator.target/config.target. Empfänger
`operator-messaging/src/payload.ts#parsePayload` erzwingt geschlossene Felder,
Stringlimits und verbietet Steuerzeichen. Genau diese Grenze ist inkonsistent:
PCR-NOTIFY-001. target ist im Configschema nicht required, wird zur Laufzeit
aber verlangt; fehlendes Target scheitert bei erster Zustellung, nicht Erfolg.

## 3. Zustand und Commit

Keine eigene Persistenz. Operatoradapter speichert Request/Reservation/Receipt;
Core schreibt Deliverycompleted und Checkpoint danach. suppressEventTypes kehrt
absichtlich erfolgreich ohne Send zurück, sodass der Checkpoint fortschreitet.
Preview ist keine Publikation des Artefaktinhalts und bestätigt dessen Empfang nicht.

## 4. Disposition/Fehler

run/stage failed, blocked, cancelled bleiben unterscheidbar; succeeded wird
passed präsentiert. Sinkfehler propagieren. Ein schemawidrig projiziertes Event
wird fünfmal unverändert versucht und blockiert spätere Nachrichten desselben
Runs im Coredrain; best_effort überspringt es nicht automatisch.

## 5. Timeout/Retry

Je Registrierung per_run, fünf Versuche, 1s Backoff, 10s Timeout. Projektor
hat keine eigenen Zeitgeber; unveränderte Konfiguration und identischer Event
ergeben stabile Payload. Operator erhält den Coreeffektkey. Netzabbruch und
extern ungewisses Ergebnis verbleiben beim Operator und Empfänger-Dedupe.

## 6. Neustart/Präfixe

Keine eigenen Wiederanlaufdateien. Sinkcommit vor Corecompleted wird erneut
adressiert, completed vor Checkpoint durch observer-recovery nachgezogen.
Keine atomare Preview-/Lifecyclezustellung. Prozessabbruchtests wurden nicht
ausgeführt; dauerhafte Receipts sind nicht mit externer Exactly-once-Garantie gleichzusetzen.

## 7. Vertrauen

Nur operator.request mit Targetscope. Preview whitelist verhindert beliebige
Artefaktbody-/Secretweitergabe. summary/message und Labels bleiben Freitext,
keine automatische Secretbereinigung. Die unbenutzte sanitize-Funktion ist
kein Sicherheitsbeleg. Inputidentität stammt aus dem Core, kein Operatorrückkanal.

## 8. Ressourcen

maxMessageChars 256–8192; Metadaten einzeln begrenzt, keine eigene Queue/Datei.
Der tatsächliche Gesamtkörper kann dennoch ein kleineres Targetbytebudget
überschreiten. bounded hängt ein zusätzliches Ellipsenzeichen an (s.u.).
Sinks/Observerjournal besitzen eigene Retentions-/Speichervollgrenzen.

## 9. Architektur

Reine Darstellung und unabhängige Previewgrants sind angemessen. Unbenutztes
sanitize kann bei einer späteren Ursachenreparatur entfallen; nicht als
scheinbare zusätzliche Redaktionsschicht behalten. Zentrale Empfängerformate
sollten der gemeinsame Vertrag für Feldlimits/Zeichenregeln werden.

## 10. Tests und Evidenz

Alle Unit-, Parity-, live-function- und Boundarytests vollständig gelesen;
`npm test` bestanden: [Protokoll](../evidence/observers-notification-observer-tests.txt).
Live-function läuft mit originalem Core, Filejournal/Sinks und localhost-HTTP-
Fixture (synthetische Events, MemoryResourceLockManager). Zwei Zustellungen,
zwei Checkpoints und erneuter leerer Drain; kein echter Discord/OpenClaw.
[Originalgrenzprobe](../evidence/observers-boundaries.mjs),
[Ausgabe](../evidence/observers-boundaries.txt) bestanden als Defektbelege:
Projektoroutput wird durch originalen parsePayload abgelehnt. Kein Mockersatz.

## 11. Dokumentation

README vorhanden; Auditobserver wurde nachvollziehbar entfernt und Audit ist
Corejournalprojektion (siehe PCR-TELEM-001 im Coretelemetriereview). Katalog und
README sind hinsichtlich 'bounded' unvollständig: Begrenzung garantiert keine
Kompatibilität mit Operatorfeldlimits/Zeichenregeln. Keine volle Legacy-
Discordparität behauptet.

## 12. PCR-NOTIFY-001 — Projektion erzeugt vom eigenen Provider abgelehnte Nachrichten

**Mittel, nachgewiesener Defekt.** `src/observer.ts:58–61,82–89,117–142`
bounded/reasonCode/lifecycleNotification; Empfänger
`operator-messaging/src/payload.ts:16–22,80–93`. Eine gültige kanonische
summary mit Newline bleibt unverändert und wird OPERATOR_PAYLOAD_INVALID:summary.
reasonCode mit 257 Zeichen wird auf 256 plus Ellipse gekürzt und dadurch
OPERATOR_PAYLOAD_INVALID:reasonCode. Quellprobe führt beide Originalseiten aus.
Auswirkung: Benachrichtigung fehlt, Folgebenachrichtigungen desselben Runs
bleiben nach ausgeschöpften Versuchen zurück; fachlicher Run selbst bleibt intakt.
Ursache ist getrennter, inkompatibler Darstellungs-/Empfängervertrag. Behebung:
zulässige mehrzeilige Textfelder ausdrücklich gemeinsam definieren, sonst
normalisieren; Kürzungsmarker innerhalb des Limits zählen. Regression durch
originalen Observer→Operatorpfad mit Newlines, exakt256/257-Zeichenreason und
maximalen Labels, anschließend nachfolgendes Event erfolgreich zustellen.
