# nova.effects — externe Effekte, Receipts und Ressourcenlocks

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Alle acht Dateien unter `skills/nova/core/effects` gelesen (772 Zeilen einschließlich
README); originale File-Journal-/Lockreproduktion und Capabilitytest ausgeführt.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

EffectCoordinator vermittelt Adapteroperationen zwischen Capabilityruntime und
journalisiertem externem Ergebnis. `execution/engine-runtime.ts:75–84` erzeugt
pro Run ein FileEffectJournal, einen Audit-Sink auf Lifecycleevents und einen
FileResourceLockManager im gemeinsamen `platform.storageRoot/resource-locks`.
`execution/adapters.ts:48–62` und `adapter-startup.ts:81` rufen ihn für direkte
und abhängige Adapteroperationen auf. Öffentliche Exports stehen in
`core/src/index.ts:36–38`. MemoryEffectJournal/MemoryResourceLockManager werden
in vielen vorhandenen Tests eingesetzt; der normale Enginepfad benutzt Dateien.
Memoryvarianten sind daher keine ungenutzten Kopien, aber kein Beleg für
Crossprozess-Durability oder identische Lockablaufregeln.

Direkte Grenzen vollständig gelesen: AdapterRuntime und effect-recovery;
Engineverdrahtung und Stagefehlerklassifikation gezielt geprüft. Als echte
Adaptergegenstelle wurde artifact-store/src/adapter.ts vollständig untersucht:
Fenceprüfung, Abortprüfung, lokale Metadaten-/Blobschreibfolge. Die separate
Komponentenprüfung [kubeclaw.artifact-store](kubeclaw.artifact-store.md) ist abgeschlossen.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

EffectInvocation trägt IdempotencyKey, AttemptIdentity, Capability/Operation,
kanonische Ressource und Payload. `identity.ts:7–16` bildet Effect-ID aus allen
Identitätsfeldern außer Payload; `assertMatchingRequest:18–23` vergleicht
zusätzlich kanonisierte Payloads. Eine Wiederverwendung desselben Keys mit
anderem Attempt, Ziel oder Payload scheitert. Kanonisierung kommt aus dem SDK;
Sparse-/undefined-Abweichung siehe [PCR-SDK-001](lib.sdk.md).

Adapter.invoke erhält request, kombiniertes AbortSignal, confidential, Lock
und Fence mit `assertCurrent`. Ergebnis wird als completed/failed EffectReceipt
mit Paketprovenienz gespeichert. Bereits vorhandenes Receipt wird unverändert
zurückgegeben, sofern seine effectId zum Request passt. Der Coordinator macht
keine erneute JSON-Schemavalidierung der kompletten Request-/Receiptobjekte;
die Registry-/Contextgrenzen liefern die typisierten Eingaben.
Optionales `adapter.receipt(request)` dient Recovery bereits akzeptierter
Aufträge; undefined oder fehlende Funktion führt zu expliziter Reconciliation.
Repositorysuche fand keine aktive Standardadapter-Implementierung dieser
Methode; der Phase7-Recoverytest verwendet eine eigene Testfixture.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

Reihenfolge: Request/Receipt lesen → kanonische Ressource sperren → erneut
prüfen → requested persistieren → accepted atomar persistieren → Adapter
aufrufen oder Receipt nachschlagen → completed persistieren → Audit → freigeben.
`FileEffectJournal` synchronisiert fremde Anhänge innerhalb FileJournal.transact;
accepted wird pro IdempotencyKey nur einmal hinzugefügt. Journalcaches behalten
Objektaliasse, siehe [PCR-STATE-001](nova.state.md); keine doppelte Befundführung.

Resultate über 64 KiB werden vor der Abschlusszeile als SHA-256-Sidecar
externalisiert (`journal.ts:132–181`): temporäre Datei 0600, fsync, Hardlink,
Inhaltsvergleich bei EEXIST, Directory-fsync. Replay prüft Größe und Digest
und hydriert den JSON-Inhalt. Kleine Results bleiben inline. Bereits
bekannte Resultate mit abweichendem Inhalt/Zeitstempel erzeugen Konflikt.
Audit ist eine zweite Persistenzgrenze: Scheitern nach gespeicherter Receipt-
Zeile macht den Adaptereffekt nicht rückgängig; späteres Replay gibt das
Receipt zurück, ohne Audit erneut auszuführen. Audit-Reconciliation gesondert
in [nova.observability](nova.observability.md) berücksichtigen.

## 4. Korrektheit und Fehlerbehandlung

Requestkonflikte und verwaiste Receipts scheitern explizit. Adapter muss die
Fence mindestens einmal assertieren; Core prüft sie nach erfolgreicher Rückkehr
noch einmal. Adapterausnahmen werden als failed-Receipt gespeichert. Das
bedeutet nicht, dass extern nichts passiert ist: AdapterRuntime macht daraus
für externe Capabilities `EFFECT_OUTCOME_UNRESOLVED`, StageExecutor:125 daraus
blocked. Keine automatische Wiederholung eines unsicheren externen Schreibens
allein aufgrund des failed-Feldes behauptet.

Ein konkreter fehlender finally-Bereich liegt zwischen Lockakquise und
`#executeLocked`; PCR-EFFECT-001 unten. Fehler aus release können außerdem den
ursprünglichen Fehler verdecken; keine zusätzliche konkrete Reproduktion oder
separater Befund. `#complete`-Promise wird zurückgegeben: asynchrone
Journalfehler sind nicht pauschal als Adapterfehler umklassifiziert.

## 5. Timeouts, Abbruch, Wiederholungen, Zustellung und Parallelität

Lockdefault fünf Minuten, aus Plattformkonfiguration übersteuerbar.
Nach Pre-dispatch-Bookkeeping erneute volle Lease, danach Renewal alle TTL/3.
Renewalfehler abortieren das Adapter-Signal. Normale invocations kombinieren
Caller-/Renewalsignal; Durchsetzung bleibt kooperativ im Adapter. Der
Coordinator selbst besitzt keinen separaten Promise-Timeout. `receipt(request)`
bekommt kein AbortSignal; für künftig receiptfähige Netzwerkadapter muss der
Vertrag eine begrenzte Abfrage vorgeben. Aktuell keine solche Standardmethode
gefunden, daher kein behaupteter produktiver Hänger dieses Pfades.

Normale Ressourcenlocks serialisieren gleiche type/canonicalId über alle Runs
im gemeinsamen Root. `runtime.dispatch` sperrt dagegen `runtime.invocation`
mit Effect-ID, damit unterschiedliche Jobs zum gleichen Agenten parallel
laufen können; Phase7 prüft diese Unterscheidung. Doppelte abgeschlossene
Zustellung liefert das gespeicherte Receipt. Unabgeschlossene Annahme wird
nicht blind neu aufgerufen. Lockidentitäten/TTL sind kein verteiltes
Exactly-once-Protokoll für externe Systeme.

## 6. Neustart, Wiederaufnahme und externe Teilaktionen

Accepted ohne Receipt benötigt Adapter-Receipt oder explizite Entscheidung.
`effect-recovery.ts:14–28` blockiert Run-Recovery bei solchen offenen Effekten;
auch gespeicherte externe Resultate in unterbrochenen Attempts verlangen
Continuation. Checkpointfähige lokale Artefakt-/Gitread-/Statereadoperationen
sind explizit ausgenommen. Stagefehlerklassifikation verhindert, dass ein
verlorenes HTTP-Ergebnis einfach als normaler Retry behandelt wird.

Filelocks bewerten Besitzer-PID: lebender Besitzer wird auch nach TTL nicht
ersetzt, damit asynchrones Unwinding exklusiv bleibt. Tote Prozesse erlauben
Übernahme mit höherem Fencingtoken. Fehlende/torn Ownerdatei hat zunächst eine
60-Sekunden-Provisionierungsfrist; danach kann sie ersetzt werden. Diese
Regeln setzen einen gemeinsamen lokalen Prozess-/Dateisystemkontext voraus.
PID-Wiederverwendung und separate PID-Namespaces müssen bei späterem
Infrastrukturreview berücksichtigt werden; hier keine Clusterbehauptung.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

Coordinator prüft keine Grants; AdapterRuntime/Plugincontext selektieren den
registrierten Provider und setzen autorisierte Invocation voraus. Paketowner
wird aus Registryprovenienz übernommen. Fencing ist eine interne
Kooperationspflicht: ein Adapter kann die Prüfung vorzeitig ausführen und
anschließend einen externen Dienst mutieren; ohne serverseitigen Token-/
Idempotenzvertrag schützt die bloße Methode keinen externen Commit atomar.

`invokeConfidential` verwendet zufällige Effekt-ID, keinen Effektjournal-
Payload und keinen Ressourcenlock. Audit bekommt redigierte Ressource,
`{confidential:true}` und generischen Fehler; Ergebnis wird nur an den
Aufrufer zurückgegeben. Produktionsauswahl erfolgt über die Registrydefinition
vertraulicher Capabilities. Fehlerobjekt selbst wird weitergeworfen; Aufrufer
müssen Secretwerte aus ihren Fehlermeldungen heraushalten. Tests bestätigen
Redaktion im Audit, nicht beliebige Downstream-Logs.

## 8. Ressourcenbegrenzung, Aufräumen und Aufbewahrung

File-/Memoryjournale und Lockhistorie wachsen ohne eigene GC; bekannte
Aufbewahrungsfrage [PCR-OBS-002](foundation.observability.md) als gemeinsame
Folgeaufgabe, konkrete Limits des Basisjournals siehe [nova.state](nova.state.md).
Result-Sidecars haben keinen eigenen Gesamtquota-/Retentionsmechanismus.
Ein vor Journalabschluss persistierter Sidecar kann bei Konflikt oder Crash
unreferenziert bleiben. Fehlender Sidecar verhindert Replay statt stiller
Ersetzung. In dieser Komponente kein Recovery-Cleanup für verwaiste Sidecars.

Timer wird im normalen finally entfernt und unref gesetzt; Confidential
verwendet keinen Renewal-Timer. FileResourceLockManager serialisiert Metadaten
über den FileMutex; dessen nachgewiesene Stale-Übernahmerace ist
[PCR-STATE-002](nova.state.md), hier als Abhängigkeit verlinkt. Lockjournal-
Suche bei renew/assert/release ist rückwärts linear zur Historie; große
Historien verursachen zusätzliche Allokation und I/O, kein Lastbenchmark.

## 9. Architektur und Vereinfachungsmöglichkeiten

Einziger Lockbesitzer sollte den gesamten Bereich nach erfolgreichem acquire
in genau einem finally kapseln, einschließlich zweiter Journalprüfung.
Keine TTL-Verkürzung oder periodische Fremdlocklöschung als Symptombehandlung:
sie würde die bewusste Live-PID-Exklusivität gefährden.
Memory- und Filelocks unterscheiden sich bei Ablauf/Erneuerung/Validierung;
Tests für Produktionsgarantien müssen originale Filelocks verwenden.
Receiptwiederaufnahme, externe Continuation und Confidential haben sinnvoll
unterschiedliche Semantik, benötigen aber eine gemeinsame dokumentierte
Fehlertaxonomie. Keine Schicht soll failed mit „extern sicher nicht erfolgt“
gleichsetzen.

## 10. Tests, Aussagekraft und fehlende Nachweise

Phase7-Test relevante Effects-/Lock-/Journalpfade erneut gelesen; der bereits
im State-Review gespeicherte Originallauf `evidence/phase7.txt` bestand.
Er prüft echte Journale/Locks, idempotenten Receiptreplay, >64-KiB-Sidecar,
Crossinstanz-accepted, Konflikt, Fencing/TTL/Provisional-Recovery. Adapter-
Ausführung/Receiptantworten und Dispatchparallelität sind eigene Testfixtures;
daraus keine echte externe Idempotenz ableiten.

`check-plugin-system-v2-capability-runtime.mjs` vollständig gelesen und lokal
Exit 0: Context-/Leaseprüfungen, Memoryjournal-Receiptreplay, Confidential-
Redaktion, Adapterstart-/Shutdownraces einschließlich verspäteter Fabrik.
Die synthetischen Adapter bleiben im Nachweis ausdrücklich Testfixtures;
keine Ersatzimplementierungen neu eingeführt.

Neue Reproduktion `evidence/effect-lock-leak.mjs` verwendet zwei originale
FileEffectJournal-Instanzen, originalen FileResourceLockManager und echten
aktivierten artifact-store. Konflikt entsteht durch die natürliche await-
Unterbrechung; weder Journal/Lock noch Adapter werden ersetzt. Nach 20 ms
bei 5-ms-TTL verhindert verbliebener Live-PID-Lock eine neue Akquise.

`external-effect-recovery.test.mts` vollständig gelesen: echter lokaler
HTTP-Dienst mit fsync-Mutation, tatsächliche runtime/network/secret-Adapter,
SIGKILL vor/nach Receipt und verlorene Antwort. Lauf bereits an Sandbox-/EPIPE-
Voraussetzung blockiert, siehe [foundation.isolation](foundation.isolation.md);
nicht nochmals gestartet und nicht als bestanden gewertet. Fehlende Nachweise:
reale externe Crash-Recovery im aktuellen Umfeld, Sidecarverlust/Quota,
Auditfehler nach Receipt, große Lockhistorien und Prozess-/PID-Neustartmatrix.

## 11. Dokumentation und frühere Befunde

Effects-README ist vorhanden und überwiegend zutreffend für persistierte
Annahme, Sidecars, Live-PID-Exklusivität und bewusst geschlossene Recovery.
Unvollständig: Lockfehlerfenster, Confidentialausnahme, Memory/File-Unterschiede,
Receipt-Signalsemantik, fehlende Standard-Receiptimplementierungen,
Retention/Quotas und doppelte Receipt-/Auditpersistenz. „Every mutable
invocation holds a lock“ muss die tatsächlich gewählte Confidentialgrenze
explizit erklären. Lockgarantien werden durch PCR-EFFECT-001 und den schon
nachgewiesenen FileMutexbefund eingeschränkt. Alte State-/SDK-Befunde wurden
an diesen konkreten Import-/Speicherpfaden erneut abgeglichen, nicht kopiert.

## 12. Befunde und verbleibende Unsicherheiten

### PCR-EFFECT-001 — Konflikt nach Lockakquise lässt Ressourcenlock zurück

- **Schweregrad: mittel.** Die Ressource bleibt für andere Attempts blockiert,
  solange der Coreprozess lebt; TTL allein heilt den Zustand nicht. Keine
  Datenkorruption oder unautorisierte Mutation in der Reproduktion.
- **Einordnung: nachgewiesener Defekt**, mit Originalimplementierungen reproduziert.
- **Belege:** `durable-invocation.ts:36–45` akquiriert in Zeile 40, prüft
  anschließend Request/Receipt außerhalb eines finally. Erst
  `#executeLocked:62–74` schützt Freigabe. `locks.ts:101–105` verweigert
  Ersatz bei lebendem Besitzer unabhängig von der abgelaufenen TTL.
- **Auslöser:** erster Journalread liefert keinen Request; eine zweite Instanz
  schreibt denselben Key mit anderer Payload; Core akquiriert Lock, erkennt
  beim zweiten Read den Konflikt und wirft. `#release` wird nicht erreicht.
- **Auswirkung:** konkurrierende Zugriffe auf dieselbe kanonische Ressource
  scheitern weiter mit RESOURCE_LOCKED. Ein Neustart kann Dead-PID-Übernahme
  ermöglichen, ist aber keine dauerhafte Ursachenbehebung.
- **Ursachenbehebung:** unmittelbar nach acquire zentralen try/finally-Bereich
  über alle weiteren Reads, Validierungen, Replay- und Invokewege legen;
  Doppel-Freigabe durch eine klare Besitzerzuständigkeit vermeiden.
- **Regression:** vorhandene Reproduktion nach Reparatur mit erfolgreicher
  Folgeakquise und höherem Fencingtoken, beide echten Journalinstanzen erhalten.
  Ergänzend echter korrupter Journal-/Receiptread nach Akquise: Primärfehler
  sichtbar, keine aktive Lockdatei zurückgelassen.

Nicht dupliziert: PCR-STATE-001/002, PCR-SDK-001 und gemeinsame Retentionsfrage.
Externe automatische Wiederaufnahme bleibt bewusst begrenzt; fehlender echter
Sandboxlauf ist eine sichtbare Testblockade, kein abgeschlossener E2E-Nachweis.

## Nachprüfung — Schema Revision 6

Originaler Observer-/Effect-/Operatorpfad erneut abgeglichen: deliveryAttempt
erhöht nicht die Effectattemptidentität; vorhandene failed-Receipts verhindern
neuen Send. [PCR-OPERATOR-001](kubeclaw.operator-messaging.md) führt diesen
Integrationsdefekt zentral samt Original-HTTP503-Reproduktion. Der bestehende
Recoverytest allein belegt keine erneute externe Zustellung. Kein doppelter Befund.
