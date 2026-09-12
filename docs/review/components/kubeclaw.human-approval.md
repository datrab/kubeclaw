# kubeclaw.human-approval

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Zwei Nova-Registrierungen: approval / kubeclaw.decision.human-approval und
architecture-approval / kubeclaw.decision.architecture-approval. Manifest routet
auf stage.ts und architecture-approval.ts; gemeinsamer strikter approval.ts.
Alle Sourcefiles, Schemas, Manifest, README und Pakettests gelesen. Nur explizite
Graphauswahl; Architecturefactbedingung ist Graphverantwortung, kein automatischer
Trigger im Plugin. Aktueller Projectcompiler enthält keine dieser Stages.

## 2. Verträge und Gegenstellen

Summary, config target/issuerId/timeoutMinutes; Guidance pending oder
approved/rejected mit passendem operator-Issuer. Pending erstellt signal.wait
und prüft zurückgegebenen Wait vollständig, danach operator.request. Wait-ID,
Typ approval.resolved, Issuer, Expiry und Summary müssen übereinstimmen.
wait-store/src/adapter.ts erzeugt durable/idempotente Waits; operator-messaging
publiziert an konfigurierte Ziele. Core engine-snapshots.ts#validateSignal prüft
Wait/Signal/Issuer, Expiry und issuedAt; danach reicht engine-run.ts Payload als
Guidance durch. Terminalguidance erzeugt keine neuen Capabilityaufrufe.

Architecturevariante selektiert genau einen neuesten Attempt eines Producers im
aktuellen Run, prüft JSON, <=256 KiB, Digest/Bytes und verdict=passed. Leere
Findings passieren, sonst digestgebundene gekürzte Zusammenfassung an dieselbe
Approvalstage. Gegenstelle architecture-validator schreibt genau dieses Format.

## 3. Zustand und Nebenwirkungen

Durable Wait vor Operatornachricht verhindert eine Nachricht ohne bereits
existierenden Adapterwait. Danach Stage-Waitcommit im Core ist ein separater
Schritt. Approval-ID enthält Run+Stage, konkrete Wait-ID folgt Effectidentität.
Kein eigener Journalstore; Response-/Inputwerte eingefroren. Architecturelesen
verändert keine Evidenz, Reporttrunkierung betrifft nur Benachrichtigungstext.

## 4. Fehlerbehandlung

Ungültiger Issuer/Guidance/Input wirft; Core blockiert nach seinen Regeln.
Ablehnung ergibt blocked mit Grund, Zustimmung passed. Waitabweichung verhindert
Benachrichtigung. Konfigurationsschema und Runtimeparser unterscheiden sich bei
agentRole: PCR-APPROVAL-001. Große gültige Architekturberichte können am
256-KiB-Empfängerlimit blockieren; kein gemeinsames Producerbudget zugesichert.

## 5. Timeout, Abbruch und Wiederholung

1–525600 Minuten, Default 60; berechnet aus aktuellem Prozesszeitpunkt. Keine
aktive Timerwarteschleife; Expiry wird durch Core beim Resume geprüft. Neue
Versuche berechnen neue Expiry, bestehende Effectreceipts benötigen daher
konsistente Wiederaufnahme statt blindem Neuaufruf. Keine Cancellationnachricht
im Plugin. Operatorzustellung/Retry und Duplikate sind Adapter-/Coreverantwortung.

## 6. Crash und Resume

Crash nach Waitadapter oder Nachricht, vor Corewaitcommit lässt mehrere
persistierte Ebenen unterschiedlich weit zurück. Coredefekt PCR-EXEC-001 und
Wait-/Messagingrecovery zentral verlinken; nicht hier nochmals beanspruchen.
Architectureapproval prüft nach Neustart wieder exakte Artefaktrefs. Kein eigener
Replay, der externe Zustimmung erfindet.

## 7. Authentifizierung und Autorisierung

Plugin vergleicht Issuer-ID, authentifiziert aber keine Person kryptographisch.
Transport-/CLIgrenze muss die Signalherkunft authentifizieren. README-Begriff
„operator-issuer authentication“ ist deshalb ohne Kontext überstark. Grants
beschränken Targets, Signalklassen und Issuerlisten. Architectureartefakte sind
an Run/Producer/Digest gebunden; keine bloße Suche nach neuestem Storeobjekt.

## 8. Limits und Retention

Summary 10000 Zeichen, Configtexte 1024, Grund 4096; Architectureinput 4096 und
Report maximal 256 KiB. Findingszusammenfassung kürzt mit Verweis auf Original-
artefakt. Wait-/Deliveryretention gehört den Stores; kein autonomes Löschen.
Voraussetzungen: persistente Wait-/Effects-/Artefaktstorage, Operatorendpoint,
korrekte Uhr und authentifizierter Resumezugriff.

## 9. Architektur

Gemeinsamer Approvalpfad plus kleine Evidencevariante hält Zuständigkeit klar.
Schema-/Parserregeln aus gemeinsamer Definition ableiten. Durable Wait und
Nachricht bleiben eine dokumentierte mehrstufige Transaktion, keine behauptete
Atomarität. Große Berichtbudgets mit Architekturproducer abstimmen.

## 10. Tests

`npm test` **bestanden**:
[Protokoll](../evidence/nova-batch-human-approval-tests.txt).
Unitprüfungen zu Guidance/Issuer/Expiry/Wait; Architecturetest mit echtem
Artefaktadapter (handverdrahteter Context, keine volle Corelease), gefälschten
Refs und späteren Storeversionen; Live-Test echter Runner/Waitstore/HTTP/HMAC und
Nachweis Wait existiert vor Receipt. Terminalguidance wird im Test direkt dem
Runner gegeben: kein authentifizierter vollständiger Resume-CLItest.
Zusätzliche Originalparser-/Schema-Gegenprobe
`node docs/review/evidence/nova-batch-approval-config-probe.mjs` reproduziert
schemaAccepted=true/runtimeRejected=APPROVAL_CONFIG_UNKNOWN_FIELD:agentRole.

## 11. Dokumentation

README zu Stageaufteilung, durable Wait und terminalem No-call-Verhalten stimmt.
**Unvollständig** zur externen Authentifizierungsgrenze, Expiry-/Crashfenstern;
Schema bietet nicht verwendbares agentRole an. Abhängiger Architekturreview
enthält genaue Budget-/Factgrenzen.

## 12. PCR-APPROVAL-001 — Schema akzeptiert unerlaubte Runtimekonfiguration

**Mittel; nachgewiesener Vertragsdefekt.** `schemas/config.schema.json` erlaubt
agentRole, `src/approval.ts:73–75` erlaubt ausschließlich target, issuerId,
timeoutMinutes. Beide Stageregistrierungen verwenden diese Kombination.
Auslöser: config {target:'ops',issuerId:'operator:ops',agentRole:'nova'} passiert
Schema und scheitert sofort im Originalparser. Auswirkung: formal valide
Approvalkonfiguration kann niemals ihren Wait/Zustimmungsprozess ausführen.
Keine Rechteausweitung. Rootfix: agentRole aus diesem nichtagentischen
Approvalvertrag entfernen oder begründete Semantik konsistent implementieren;
kein stilles generisches Wegfiltern. Regression: echte Registryaktivierung und
Stageinvocation mit allen erlaubten Schemafeldern, vor Capabilitycalls denselben
Vertrag erzwingen. Crash-/Operatorauthentifizierung bleiben separate Folgeprüfungen.
