# kubeclaw.openclaw-agent-events

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Lokale Originaltests/Code-Trace, kein produktiver E2E-Nachweis.

## 1. Verantwortung, Registrierung und Nutzung

`skills/common/plugins/openclaw-agent-events/src/adapter.ts` ist ein v2-Adapter
source für agent.events.subscribe, Rolle nova. Manifest/Config erlauben zwölf
Hooks; aktivierter Adapter abonniert im ready. Originalexport activate verlangt
`openclaw/plugin-sdk`, die Tests verwenden ausschließlich activateWithSdk mit
Subscriptionfixture. Host-native Extension ist getrennt, keine bewiesene
Produktivumschaltung durch bloße Auslieferung dieses Pakets.

## 2. Eingänge und beide Schnittstellenseiten

SDK on(hook,handler) liefert untypisierte Events. normalizeAgentEvent akzeptiert
runId/run_id aus identity oder Top-Level, optional stage/attempt bis512 Zeichen;
fehlende Run-ID wird verworfen. Projektion ist openclaw-agent-event.v2 mit
observedFields und begrenzter metrischer Whitelist, kein Promptinhalt. context.emit
liefert plugin.kubeclaw.openclaw-agent-events.<hook-mit-bindestrich> an den
Adapterruntime-emitDomainEvent-Pfad. agent-observability subscribiert genau diese
Namen; sein v2-Format ist ausdrücklich verschieden vom v1-Redis-Extensionformat.
Status capability liefert subscriptions/emitted/failures/shuttingDown.

## 3. Zustand/Commit

Subscriptionliste, pending-Promisekette und Zähler sind ausschließlich im RAM.
Commit erst beim awaited context.emit in Corejournal; Statuszähler danach.
Keine Ingress-Outbox oder Hook-ACK-Persistenz. Runtimeemit liefert Registrierung
als Producerprovenienz; Hookinhalt selbst ist nicht dauerhaft authentifiziert.

## 4. Fehlerdisposition

Unbekannte/doppelte Hooks werden bei Aktivierung abgewiesen; partielles ready
räumt schon registrierte Subscriptions auf. Fehlende Run-ID wird ohne Zähler
ignoriert, Emitfehler erhöht failures und verwirft das Event endgültig. Keine
Retrygarantie für die Quelle; die downstream Observer können nur bereits
committete Domainevents wiederholen. Ein werfendes unsubscribe kann weitere
Cleanupoperationen unterbrechen; reale SDK-Lifecyclekompatibilität bleibt offen.

## 5. Timeouts, Abbruch, Parallelität

Emit wird seriell ausgeführt, Produzent wird nicht zurückgebremst (PCR-AGENTSOURCE-001).
status prüft Abort nur vor await pending, shutdown ignoriert einen Abbruch während
des Wartens. Kein eigener Emitdeadline-/Queue-Limit. Wiederholtes ready ist nicht
idempotent, Core muss es einmal aufrufen. Kein Workerclaim/Stageabschluss hier.

## 6. Restart/Ungewissheit

Uncommittete Queue und Fehlerzähler gehen beim Prozessende verloren. Ein Emit
mit verlorenem ACK hat keine stabile quellseitige Event-ID zur deduplizierten
Wiederaufnahme. shutdown stoppt neue Handlerzugänge und wartet auf Queue, kann
bei hängendem Emit unbegrenzt warten. Kein mehrstufiger persistierter Präfix.

## 7. Vertrauen

Sensitive Feldnamen und Identitätsfelder werden aus observedFields entfernt;
nur finite Zahlen/Booleans bekannter Metriken behalten Inhalte. runId ist aus
Hookdaten übernommen, keine Zuordnung zu autoritativem Hostkontext; vertrauens-
würdiger SDK-Produzent vorausgesetzt. observedFields können vom Eingang
beeinflusste Namen enthalten. Keine zusätzliche Scheduler-/Datei-/Netzcapability.

## 8. Ressourcen

128 Felder mit auf128 Zeichen gekürzten Namen; Object.entries/filter materialisiert
vor slice sämtliche Felder und wertet Getter aus. Keine Grenze der pending-Queue
oder globale Payloadtraversalgrenze, kein persistierter Overflowmarker. Diese
Quelle kann den Host mit Memorywachstum belasten, auch wenn der Sink später
Bytebudgets besitzt. Keine lokalen Dateien/Retention zu bereinigen.

## 9. Architektur

Zwei Hostpfade mit verschiedenen Formaten und Freitextpolitiken bleiben offen.
Die src/adapter.ts:128-Root-SDK-Annahme ist besonders fraglich: benachbarter
Extension-boundary-Test bezeichnet den Rootexport als entfernt, reale
openclaw-Abhängigkeit fehlt lokal. Das ist eine explizite Integrationsfrage,
kein bestandenes Hostaktivierungsurteil. Gemeinsamen tatsächlichen Hostadapter
klären, nicht mit zusätzlichem Shim einen Fixtureerfolg produzieren.

## 10. Tests

Beide Originaltests vollständig gelesen; `npm test` bestanden:
[Log](../evidence/observers-openclaw-agent-events-tests.txt). Live-function nutzt
synthetische SDKhandler und echtes temporäres Corejournal: Identitätsaliases,
Dataminimierung, Status, unsubscribe, unbekannter Hook, delivery-target,
partieller Subscriptionfehler. Boundary prüft Quelltextimporte. Kein aufgerufener
activate-Export gegen OpenClaw, keine Backpressure-/Last-/SIGKILLprüfung.

## 11. Dokumentation

README vorhanden, aber 'serializes emission to provide backpressure' ist
sachlich falsch: nur Konsumentausführung wird serialisiert. SDKexport-/
Hostkompatibilität und Verlust vor Corecommit fehlen. Katalog implemented
belegt Registrierung, nicht reale Hookintegration. Dual-source-E2E-Gate wird
im README zutreffend als noch offen bezeichnet.

## 12. PCR-AGENTSOURCE-001 — Unbegrenzte Ingressqueue und nicht abbrechbarer Drain

**Mittel, nachgewiesener Codepfad; Lastlauf nicht ausgeführt.**
`src/adapter.ts:75–100,110–122`: jeder synchrone Hook hängt eine neue Closure mit
normalisiertem Event an pending und gibt void zurück. Ein langsames/hängendes
context.emit hält sämtliche Folgeevents; weder Höchstzahl/-bytes noch Rückdruck
oder Overflowdisposition existieren. Status/Shutdown warten ohne erneute
Signalprüfung. Auswirkung: wachsende Hostspeicherlast und nicht endender Drain,
bei Prozessende Verlust aller noch nicht committeten Events. Ursachenbehebung:
begrenzte explizite Queue mit messbarem Overflow-/Gapnachweis, abbruchfähiger
Drain und klare Quelle-ACK-Grenze. Regression mit originalem Adapter, kontrolliert
verzögertem Emit, Burst über Grenze, überprüftem Queue/Dropbudget und Shutdown-
Deadline; anschließend echten OpenClawhook verwenden. Root-SDK-Frage getrennt
gegen die ausgelieferte OpenClawversion verifizieren.
