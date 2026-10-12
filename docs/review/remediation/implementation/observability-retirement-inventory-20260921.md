# PCR-OBS-002: aktuelle Storeinventur und nächster Executor-Scope

Status: **lesende Codeinventur, keine R1-/R2-Abnahme**. Keine Produktionsänderung,
kein Storezugriff auf Betriebsdaten, kein Testlauf und keine Statushochsetzung.
Maßgeblich bleiben [R1–R4 und R-DOC](../acceptance-20260920.md).
Die [strukturierte Inventur](observability-retirement-inventory-20260921.json)
enthält 25 Ressourcenklassen mit Autor, Writerfence, Quote, Consumer,
Referenz-/Idempotenzvertrag, vorhandenem Retirement und verbleibender Lücke.
55 tatsächlich vorhandene Produktions-/Executorquellen sind mit SHA-256 gebunden.
Das ist ein Lesestand während paralleler Buster-Änderungen, kein eingefrorener
Gesamtbuild. Vor Implementierung muss der betroffene Quellstand erneut gebunden werden.
Die abschließende leichte Hashprüfung fand tatsächlich eine parallele Änderung
an `preparation-ledger.ts`; beide beobachteten Hashes stehen in
`concurrentChangesObserved`. Dieser Buster-Slice ist ausdrücklich nicht eingefroren.

## Abdeckung und bereits vorhandene Umsetzung

Ausgangspunkt waren die konkreten `FileDurableRecordStore`-, Blob-, Admission-,
Attempt- und Journal-Erzeuger unter `skills`, deren Produktionsconsumer und alle
manuellen `scripts/retire-*.mjs` beziehungsweise `compact-buster-job.mjs`.
Direkte Journal-/Snapshot-/Evidencewriter sowie native Besitz- und
Fixtureabhängigkeiten sind separat erfasst. Bibliotheken ohne gefundenen
Produktionskonstruktor sind ausdrücklich so gekennzeichnet.

| Gruppe | Ressourcenklassen in der JSON-Inventur | Tatsächlich verbleibende Grenze |
|---|---|---|
| Foundation | Recordenvelopes/Tombstones, CAS-Blobs, Telemetrie, Admission, Attemptresults/Closures, Evidence, Outbox | Endliche Referenz-/Receiptmetadaten und bestätigte Evidence bleiben. Bibliotheks-Outbox ist kein belegter angeschlossener Engpass. |
| Nova Core | Run-/Plugin-/Signal-/Adminhistorie und Snapshot, Effects samt Resultblobs/Dependencyindex, Observercheckpoints/-deliveries, Ressourcenlocks, Reconciliation | Kanonische Wiederaufnahme- und Idempotenzautoritäten besitzen keinen vollständigen End-of-reopening-/Historyrelease-Vertrag. FileJournal selbst hat keine Gesamtquota. |
| Remote Gates | Dispatch samt Archiven/Interruptions, vollständige Imports/Evidence | Dispatchprojektion ist bereits implementiert; Originalblobs und Importautorität bleiben auch Quellen anderer akzeptierter Projektionen. |
| Gemeinsame Adapter | Artifacts, Statehistory, Waits, Operatorzustellung, Transportpublikation, Demo-handoff | Unterschiedliche Leser-/Recoveryverträge; ownerlose Records nicht durch Run-ID-Vermutung zu Telemetrie machen. D07 schützt Projektmaterialien. |
| Buster/Core-Abhängigkeiten | Historische Jobs, aktuelle prepared Jobs, Sourceledger/Runtime/Evidence, Nativejournal/Ownership, Nativefixtures | Historische Kompaktion deckt den aktuellen prepared Store nicht. Lebende Fixture-/Rootbesitzer und verspätete Requests müssen erhalten bleiben; laufende Buster-Arbeit nicht parallel überschreiben. |

Bereits vorhanden und zu übernehmen sind:

- `retire-telemetry.mjs`: gezielte bestätigte Projektionen; kanonische Historie bleibt.
- `retire-admission.mjs`: Completionreferenz statt redundanter Admissionnutzlast.
- `retire-attempt-result.mjs` und `retire-attempt-closure.mjs`: rekonstruierbare Projektionen aus ursprünglicher Importautorität.
- `retire-nova-dispatch.mjs`: redundantes eingebettetes Archiv; Originalblob bleibt.
- `retire-operator-request.mjs`: enger bestätigter Human-approval-v1-Request; Waitwert und Zustellreceipt bleiben.
- `compact-buster-job.mjs`: **HistoricalBusterPlanJobStore**, nicht der aktuelle `PreparedBusterPlanJobStore` unter `metadata-v2`.

Die alte Aussage in [run3-observability-next-package](run3-observability-next-package.md),
dass Nova-Dispatch noch keinen angebundenen Retirementpfad habe, gilt nicht mehr.
Auch das alte [Operator-Design](run7-operator-retention-design.md) beschreibt einen
inzwischen implementierten Teilpfad. Beide historischen Berichte bleiben unverändert.
Das bestehende globale Inventarskript bleibt absichtlich nicht ausführbar; daraus
folgt nicht, dass die genannten gezielten Executor fehlen.

Eine während der Suche erwogene Artifact-Leckhypothese wurde verworfen:
`artifact-store/src/adapter.ts` schreibt **zuerst Metadaten, danach den Blob**.
Ein abgewiesener Recordappend erzeugt dort keinen Blob. Get/latest-Consumer und
gemeinsam referenzierte Blobs schließen ein pauschales Tombstone-/Unlink-Verfahren aus.

## Kleinster noch nicht implementierter verbundener Kandidat

**Vorschlag zur Scopeentscheidung: manuelle Projektion des redundant gespeicherten
Wait-Werts eines vollständig bestätigten Human-approval-v1-Ablaufs.** Noch kein
Codeauftrag und kein Beleg positiver Nettoersparnis für alle Waitgrößen.

Der aktuelle Waitadapter speichert `wait-value.v1` vollständig in `waits/all`.
`signal.wait/read` liefert alle ursprünglichen Waits; exaktes Duplicate-create
vergleicht den gesamten ursprünglichen Wert. Die ursprüngliche Core-Historie
enthält die Waitautorität ebenfalls. Der vorhandene Operatorretirementpfad hält
den Waitstore zwar gefenced, lässt dessen Wert aber vollständig unverändert.
Damit ist die verbleibende Duplikation konkret und unabhängig vom laufenden
Buster-Produktionspfad. Es braucht keine neue allgemeine Plannerarchitektur.

Der minimale **gekoppelte** Scope umfasst:

1. Eine versionierte Waitprojektion mit ursprünglichem Payloaddigest,
   Idempotenzkey/Waitidentität, bounded Quellreferenz und manuellem Intentreceipt.
   Originale Core-Snapshot-/Effect-/Wait-/Signalbelege bleiben an ihrem Ort.
2. Einen einzigen originalgetreuen Resolver für Wait-read und Duplicate-create
   sowie den direkten Leser `originalWaitValue` in
   `scripts/observability-retirement/operator-authority.mjs`. Der vorhandene
   Operatorexecutor muss davor und danach dieselbe Autorität erhalten; historische
   `wait-value.v1` bleiben unverändert lesbar. Kein Schattenmodell nur für Tests.
   Die Quellauflösung muss im vertrauenswürdigen Owner bleiben: kein frei vom
   Plugin wählbarer Dateipfad und keine neue pauschale Dateisystemberechtigung.
   Ob die aktuelle Adaptergrenze diese enge Authority ohne größeren Umbau tragen
   kann, ist vor Zustimmung zum Implementierungsscope zu prüfen.
3. Einen expliziten manuellen Applypfad unter originalem Runmutationfence →
   Waitstorewriter. Er bindet die konfigurierte Storequelle aus dem gepinnten
   Lauf, prüft aktuelle Digests/Identitäten direkt vor CAS und zählt alle neuen
   Metadaten gegen die bisherigen Quoten. Derselbe Resolver darf keinen Storelock
   rekursiv erwerben und keinen Runlock innerhalb eines gehaltenen Waitlocks nehmen.
4. Tatsächliche **Netto-Metadatenbytes** als Ergebnis; wiederholtes Apply meldet
   null neu freigegebene Bytes. Kleine Werte ohne positive Ersparnis werden
   atomar abgelehnt. Recordcount, kanonische Logs, Artefakte, Receipts und
   Projektmaterialien bleiben ausdrücklich außerhalb dieser Freigabe.

Das ist nur der kleinste noch unverbundene Bytefreigabeschritt, **keine Lösung
aller R2-Klassen**. Für Count-/Unique-Blob-Freigabe und die gesamte bestätigte
Historie bleibt ein dauerhafter domänenspezifischer Abschluss der Wiederaufnahme
mit gemeinsamem Referenzabschluss nötig. Ein terminales Runevent allein liefert
diese Autorität nicht. Sollte der reale Originalconsumer keine positive
Nettoersparnis tragen, wird dieser Kandidat verworfen; Quoten werden nicht erhöht.

## Vor Code festgelegte Abnahmefälle für diesen Kandidaten

Alle Fälle sind **noch nicht ausgeführt**. Erst Scopefreigabe und feste
Quellenbindung, dann Originalfixture und Umsetzung; kein Test während Startup-VM.

| Fall | Pflichtbeobachtung |
|---|---|
| WP1 · Originaler Ablauf | Installierte Human-approval-/Wait-/Operatoradapter durch Nova Core, echter Receiver, autorisierter Originalsignalpfad bis zum bestätigten Terminalrun; kein synthetischer Journalersatz. |
| WP2 · Alle Originalconsumer | Vorher/nachher identische Wait-read-Antwort und Duplicate-create-Antwort, geänderte Nutzlast weiterhin Konflikt; vorhandener Operatorretirementpfad funktioniert mit beiden Waitformaten ohne zweiten POST. |
| WP3 · Echter Quoteneffekt | Kleine unveränderte Bytequote; messbare Nettoersparnis ermöglicht weiteren echten Write. Recordcount bleibt unverändert; zu kleine Ersparnis/Metadatenreserve scheitert unverändert. |
| WP4 · Autorität | Falscher Runroot bei gleicher textual ID, fremder konfigurierte Store, falscher Effect/Attempt/Issuer/Signal/Wait, fehlender oder doppelt verwendeter Signalbeleg, ungültige rekonstruierte Werte und manipulierte Quelle werden abgelehnt. |
| WP5 · Schutzklassen | Aktiver, wartender, ungewisser oder unvollständig bestätigter Run; weitere nicht unterstützte Waittypen/-produzenten; fremde/ownerlose Zuordnung ohne exakte Corebindung bleiben unverändert. |
| WP6 · Parallelität/Crash | Echte getrennte Writerprozesse, stale CAS, geänderter Runhead/Receipt, Root-/Symlinkwechsel; SIGKILL vor und nach persistenter Transition. Restart sieht originalen oder vollständig rekonstruierbaren Zustand, nie halbe Autorität. |
| WP7 · Späte Wiederholung | Nach Restart mehrfach identischer manueller Intent und verspätetes Original-create: keine Reinflation, keine neue externe Aktion; anderer Intent/anderer Originaldigest konfligiert. |
| WP8 · Negativkontrollen und Doku | Weglassen von Quell-/Digestprüfung muss echte Assertions verletzen; alle bisherigen betroffenen Consumerfälle unverändert ausführen. Operatorbeschreibung nennt Scope, Quotenwirkung, Wiederholung und alle nicht freigegebenen Klassen. Frischer Nichtautor bindet finale Quellen. |

## Verbleibende R1-Vervollständigung vor Gesamt-Abnahme

Die JSON-Inventur bildet die Produktionscodeklassen des ursprünglichen
Foundation/Nova/Buster-Befunds ab. Sie ist keine Aufzählung tatsächlicher
Deploymentinstanzen: aktive Adapterroots/effektive Quoten müssen aus den jeweiligen
gepinnten Produktionsprofilen und Run-Snapshots aufgelöst werden. Beliebige neue
Pluginpakete können weitere Stores registrieren; ein unbekannter Store oder
Consumer bleibt ein Freigabeblocker. Für konkrete Betriebsdaten muss die
Scope-Inventur alle Geschwisterruns und gemeinsam genutzten Roots einschließen;
der bisherige Runplanner beweist das ausdrücklich nicht.

Prism-Anwendungsdatenbanken/Backups, Kubernetes-Controllerobjekte und externe
Receiver gehören nicht durch Typgleichheit zum Foundation-RecordStore. Deren
eigene Retentionsverträge bleiben angrenzende Autoritäten, insbesondere
[Prism-Backup/Restore](prism-retirement-matrix-20260920.md) und D07-Projektlöschung.
Eine Gesamt-R1-Abnahme benötigt die explizite Abgrenzung dieser Authorities plus
Review der tatsächlichen aktiven Konfiguration. Diese Lücke wird nicht als
fehlender Hostzugang oder bestandener Inventurtest umetikettiert.
