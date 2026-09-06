# nova.telemetry — Observerzustellung, Wiederaufnahme und Auditansicht

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. Alle vier Implementierungsdateien, README und drei
zugeordnete Testdateien vollständig gelesen.

## 1–2. Verantwortung, tatsächliche Nutzung und Schnittstellen

Codewurzel `skills/nova/core/telemetry/`: observers.ts koordiniert Zustellung,
observer-delivery.ts erzeugt leasegebundenen Plugincontext, observer-recovery.ts
rekonstruiert Delivery-/Checkpointzustand, audit.ts projiziert kanonisches Journal.
Registry liefert aktivierte Observer, Grants, Config-/Checkpointschemata und
subscriptions/failurePolicy. Keine Observerauswahl durch Verzeichnisnamen.
engine-runtime.ts:90–98 baut den Runtimezustand und serialisiert Drains; Adminpfad
ruft Drain ebenfalls unter seiner Runoperation. Core.cli.ts:48–53 liest Audit
über --platform/--audit. Direkte API-Aufrufe haben nicht automatisch Runexklusivität.

Sender liefert ObserverDelivery.v2 mit stabiler deliveryId aus Observer/Event,
Deliveryversuch separat und originalem CanonicalEvent. Context.invoke ruft
AdapterRuntime mit stabiler Observer-Attemptidentität und Aufrufsequenz auf;
Retry muss dieselbe fachliche Aufrufreihenfolge/Payload behalten. AdapterRuntime
übergibt an EffectCoordinator und verlangt completed receipt. Optionales emit
geht als namespaced Plugin-Domainevent ins Originaljournal. Empfängermodule
werden von Registry aktiviert, erhalten Signal und Context; keine generische
Eventbus-Ausführung. Effectevents aus Observerversuchen werden vom nächsten
Drain ausgeschlossen, damit ein Telemetrieeffekt sich nicht selbst speist.

## 3–4. Persistenz und Fehler

Vor Aufruf fsync-backed started in observer-deliveries.jsonl, danach completed
oder failed; erst bei Erfolg Checkpoint in observer-checkpoints.jsonl.
Checkpoint/Delivery validieren Provenance, Run/Event/Sequenz, Subscription und
Übergang. Fehler eines best_effort-Observers blockiert folgende Events dieses
Runs, andere Runs bleiben drainbar. required wirft Hostoperationfehler nach
begrenzten Versuchen; das ist kein Zurückrollen bereits erfolgter Stageeffekte.
engine-runtime verwirft returned best_effort failures; Detailnachweis bleibt
Deliveryjournal. Audit liest events.jsonl, nicht sämtliche Deliveryjournalfehler.

Audit ist unabhängig vom Artefaktstore: Originaljournal hashgeprüft lesen,
Run filtern, sensible Schlüsselnamen rekursiv ersetzen, SourceRecordHash und
Journalhead behalten, Projektion mit SDK canonicalJson hashen. Keine Projection-
Writes oder Auditobserver mehr. Mutable Journalpayload: [PCR-STATE-001](nova.state.md).

## 5–6. Timeouts, Wiederholung und teilweise externe Aktionen

Deliverytimeout abortiert Contextcontroller, revoke im finally. Das stoppt
spätere Contextaufrufe; trusted Plugin-Nebeneffekte außerhalb Context oder
bereits gestartete IO werden dadurch nicht rückgängig. Memory/CPU im Lease sind
Deklaration, keine in-process-Messung dieses Moduls. Backoff/Timeouttimer unref,
kein eigenes dauerhaftes Worker-/Schedulingservice.

Versuchszahl über Neustart aus durable started/completed/failed rekonstruiert.
maxAttempts erschöpft: expliziter Fehler, keine stille Checkpointfortschreibung.
completed ohne Checkpoint rekonstruiert diesen ohne nochmaligen Handleraufruf.
Crash nach externer Wirkung vor completed bleibt ungewiss; stabile Effect-
Idempotenz und adaptereigene Receiptklärung nötig. Direkte Datei-/Netzwerkeffekte
eines trusted Handlers werden nicht automatisch exactly-once. Kein Operator-
Replayprotokoll für erschöpfte/ungewisse Lieferungen vorhanden. Journalmutex
unterliegt [PCR-STATE-002](nova.state.md), kein duplizierter Befund hier.

## 7–9. Vertrauen, Ressourcen und Architektur

Grants werden pro Observer geprüft, Config/Checkpoint gegen registriertes Schema;
Context erzwingt aktives Lease, Eventnamespace und Run. Observer bekommen
Originaleventdaten, keine generell geheimnisfreien Projektionen. Auditredaktion
ist Schlüsselheuristik, entfernt keine Secrets aus freiem message-Text; außerdem
hier ohne Tiefe-/Anzahllimit. Geschütztes kanonisches Journal, beschränkte
Produzentenpayloads und autorisierter Auditleser vorausgesetzt.

Infrastruktur: persistentes Node-Filesystem mit Journal-fsync und konsistenter
Runexklusivität; eventuelle Transport-/Notifyabhängigkeiten gehören zum Sink.
Gesamte Event-/Delivery-/Checkpointhistorie wird rekonstruiert, ohne hier eigenen
History-GC. Jeder Drain erzeugt neue Runtime mit Vollscan. Langfristig gemeinsame
checkpointbasierte Retention und inkrementeller Readpfad statt mehr Caches mit
abweichender Recoverywahrheit. Required-write-Observer bleiben architektonisch
mögliche Ausführungsabhängigkeit, auch wenn der Auditobserver entfernt wurde.
Rebuildable Auditansicht ist bereits die einfachere umgesetzte Lösung.

## 10. Tests und Grenzen

Unverändert bestanden: audit-projection.test.mts (echtes Journal, unbrauchbarer
Artefaktpfad, deterministische redigierte Ansicht, korrupte Historie abgewiesen)
und observer-recovery.test.mts (echtes installiertes Testplugin mit fsync-
Dateischreiben, ENOENT vom OS, echte Registry/Adapter/Journal, Wiederaufbau und
erschöpfte Versuche). Testplugin ist vorhandener Test, keine neue Ersatz-
implementation. Keine tatsächliche Messagingzustellung/Agent-/Clusterprüfung.
Phase12 gelesen und unverändert **fehlgeschlagen** bei Observerzahl 5 statt6;
spätere Rekursionsassertions dieses Befehls wurden nicht erreicht.
[Protokoll](../evidence/nova-telemetry-tests.txt).

## 11. Dokumentation und alte Befunde

README veraltet: „required audit sinks“ existieren im heutigen Auditpfad nicht
mehr. Unvollständig zu ungewissem externem Outcome, erschöpftem Replay, Vollscan,
Heuristikredaktion und In-process-Limits. Reliability-Bericht:146 dokumentiert
persistente Retrybudgets/Checkpointwiederaufbau, :169 Auditentkopplung. Beides
im Code erneut bestätigt und echte vorhandene Regressionen erneut bestanden.
Dort getrennt offenes Operatorreplay/Retention bleibt offen. Kein pauschaler
Nachweis aller Sink-Nebeneffekte durch diese beiden Tests.

## 12. Befund und verbleibende Verifikation

### PCR-TELEM-001 — Release-Verifikation erwartet entfernten Auditobserver

- **Niedrig, nachgewiesener Defekt:** lokaler bestehender Releasecheck scheitert
  an überholter Bestandserwartung, verhindert spätere Assertions; kein
  produktiver Obserververlust daraus abgeleitet.
- **Beleg:** check-plugin-system-v2-phase12.mts:51 erwartet 6 Registryobserver;
  reale discoverPackages/buildRegistry liefern 5. Auditprojektion wurde laut
  aktuellem Code/Entfernung aus Registrierungen und Reliabilitybericht :169
  absichtlich aus Observerzustellung entfernt.
- **Auslöser/Auswirkung:** unveränderter node-Aufruf Exit1, `5 !== 6`; Log oben.
- **Ursachenbehebung:** beabsichtigte genaue Observer-/Surfaceidentitäten gegen
  tatsächliche Rollenregistrierungen prüfen, obsolete Auditerwartung entfernen.
  Keine Dummyregistrierung hinzufügen, nur um Anzahl wieder grün zu machen.
- **Regression:** vorhandenen echten Releasecheck erneut laufen lassen;
  zusätzlich Audit ohne Observer-Persistenzabhängigkeit und tatsächliche
  aktive Observerzuordnung belegen. CI hier nicht erneut anfordern.

Gemeinsame Journal-/Retentionsbefunde bleiben bei nova.state bzw.
foundation.observability. Echte weitere Verifikation nach späterer Umsetzung:
SIGKILL nach bestätigter externer Sendeaktion vor Deliverycommit, Wiederaufnahme
gegen Originaltransport, genau dokumentiertes Unknown-/Receiptverfahren und
kein unbegründetes erneutes Senden. Kein noch ungelesener Implementierungspfad
innerhalb dieser Komponente offen.

Nachprüfung Registry: check-plugin-system-v2-import-safety.mjs:29 scheitert ebenfalls
an 5 statt6 Observern; [registry-tests.txt](../evidence/registry-tests.txt). Gleiche
Ursache PCR-TELEM-001; keine separate Befundzählung.
