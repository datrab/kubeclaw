# prism.domain — Dokumentoperationen und Viewauflösung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Gesamte Implementierung `skills/prism/domain/index.ts` (115 Zeilen) und bestehende
Domain-/Engineübergabetests gelesen; Originalfunktionen lokal getestet.

## 1. Verantwortung, Grenzen und Verwendung

applyOperation ist aktiver Reducer für generierte Engineänderungen
(engine/index.ts:119–126) und persistierte Nutzeroperationen
(storage/index.ts:304–333). resolveView dient Engine-HTML und Studio preview.ts:10.
Die ebenfalls exportierte transition-Funktion hat im Repository keine gefundenen
Aufrufer: Studio app.tsx:233–234 sucht Übergänge selbst einschließlich nodeId;
Domain.transition berücksichtigt nur Action/View/State. Das ist eine parallele,
aktuell ungenutzte Hilfsimplementierung, kein aktiver Flowexecutor.
Domain ist Untermodul des Prism-Pakets, kein eigener Prozess oder Pluginregistrierung.

## 2. Eingaben, Ausgaben und Schnittstellen

PrismDocument/Node sowie sieben Operationsformen aus contract.prism: insert,
remove, duplicate, move, props.set, responsive.props.set, batch. baseRevision
muss source.meta.revision entsprechen. Result ist tiefgeklonte neue Dokumentrevision;
Zeit wird deterministisch um1ms erhöht. resolveView klont gewählte Root, trägt
State-/Viewportprops ein und liefert PrismNode an renderNode. Fehlender View
wirft; unbekannter State erhält still keine Statepatches, standardmäßig default/
wide. InitialState des Dokuments wird nicht automatisch verwendet.

Storage lädt current revision, ruft Reducer, schreibt neue design_revision und
aktualisiert current_revision_id per CAS im selben Transaktionspfad (:307–333).
Reducer-Return ist somit der Wert, der tatsächlich persistiert werden kann;
001 wird nicht durch Syntax-/Schemaprüfung im Empfänger korrigiert. Kein realer
Postgreslauf in diesem Einzelreview. Engine überschreibt baseRevision pro erzeugter
Operation mit aktuellem Stand; das ist dortige Providerpolicy, keine Domain-Autorität.

## 3. Zustand, Persistenz und Nebenwirkungen

Funktionen besitzen keinen Speicher außerhalb ihres lokalen Klons. applyOperation
validiert Inputoperation, klont Source, verändert Klon, prüft globale Node-ID-
Eindeutigkeit in Views und validiert resultierendes Document. Bei Fehler bleibt
Source unverändert. Componenttemplates werden bei diesem globalen View-IDcheck
nicht besucht. Eigene Locks/Dateien/Netzaufrufe fehlen bewusst; Persistenz und
optimistische Konkurrenz liegen in RevisionRepository.

## 4. Korrektheit und Fehlerbehandlung

findNode verlangt genau einen Treffer über alle Views; findParent sucht erste
passende Childliste. Root lässt sich nicht bewegen/entfernen. Insert-/Moveindex
muss in Zielchildliste liegen. Batch vergleicht alle Kind-baserevisions gegen
Batchrevision und mutiert ausschließlich Klon; erste Ausnahme verhindert Return.
Descendant-Move kann trotzdem einen gesamten Teilbaum aus dem erreichbaren
Dokument verlieren (001). Duplicate setzt nur neue Wurzel-ID und scheitert bei
nichtleeren Subtrees (002). State-/Viewportpatches überschreiben sich auf Node-
statt Propertyebene (003). Contractbefunde zu Patchreferenzen/Depth sind
[contract.prism](contract.prism.md) zugeordnet und gelten hier mit.

## 5. Timeouts, Abbruch, Wiederholungen und Parallelität

Rein synchron, kein Abortsignal/Timeout; Traversalen und structuredClone sind
proportional zum Dokument, mehrere findNode/nodes-Scans je Operation, Batch kann
teuer werden. Kein eigenes Depth-/Batchbudget (PCR-PRISM-CONTRACT-002).
Mehrfachaufruf auf derselben Source ist deterministisch; keine permanente
Idempotencykeyverwaltung. Wiederholung gegen schon erhöhten Stand scheitert an
Revision, zwei Aufrufe auf alter Source brauchen Storage-CAS. Keine eigene
Thread-/Prozesssynchronisierung erforderlich.

## 6. Neustart und teilweise abgeschlossene Aktionen

Reducer kehrt mit vollständigem Result zurück oder wirft. Nach Neustart muss
Aufrufer Source und erwartete Revision erneut laden, bevor er Änderung versucht.
Keine externe Aktion im Reducer und daher kein Unknown-Receiptzustand hier.
Ein semantisch falsches erfolgreiches Result (001/003) kann dauerhaft werden;
Transaktion macht es atomar, nicht fachlich richtig. Undo/Redo/Persistenzrestoration
sind Storage-/Studioverantwortung, nicht in dieser Datei implementiert.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

Keine Identitäts-/Projekt-/Actorprüfung im Reducer. Input ist untrusted Operation,
Source muss zu autorisiertem Dokument gehören; Control/Storagecaller zuständig.
Schemas begrenzen Propertynamen, Referenzsemantik ist nur teilweise geprüft.
Browserpreview benutzt gleiche Sourceformen, liefert dadurch keine neue
Berechtigung. transition besitzt keinen Actor/node/Flowkonfliktcheck; weil ohne
gefundenen aktiven Aufrufer kein produktiver Autorisierungsbefund daraus abgeleitet.

## 8. Ressourcen, Cleanup und Aufbewahrung

Keine Infrastrukturabhängigkeit außer JSruntime/structuredClone und Contractpaket.
Keine Dateicaches, Retention oder Prozesse. Wiederholte vollständige Traversalen
und Klone erhöhen Aufwand bei großem Batch. Später feste Document-/Batchlimits
an Vertrag binden, keine unbeschränkte Inputgröße aus vorgeschaltetem HTTPbudget
ableiten. Lokale Fixtures klein; keine Lastskalierung nachgewiesen.

## 9. Architektur und Vereinfachung

Vor Mutationsschritt einen konsistenten Node-/Parentindex aufbauen und Zielbeziehung
prüfen; IDs und Patchreferenzen bei Duplicate zusammen neu zuordnen. Effektive
Props pro Node in deklarierter Reihenfolge auflösen. Ungenutzte transition-Hilfe
mit tatsächlicher Studio-Flowlogik abgleichen und später obsolete Variante entfernen,
statt zwei ähnliche Regeln dauerhaft zu halten. Nicht durch Rendererfallbacks
oder stilles Löschen unerreichbarer Subtrees reparieren.

## 10. Tests und tatsächliche Aussagekraft

Drei bestehende Domainfälle (Unveränderlichkeit/Revision, Batchrollback,
Responsivepatch) und sieben Enginefälle gelesen und bestanden:
[prism-contract-tests.txt](../evidence/prism-contract-tests.txt). Echte Original-
funktionen, kleine lokale Dokumente; keine Browserinteraktion oder DBtransaktion.
[prism-domain-repro.mjs](../evidence/prism-domain-repro.mjs) reproduziert alle drei
folgenden Defekte mit validiertem Originalfixture und Originalreducer/-resolver;
[prism-domain-tests.txt](../evidence/prism-domain-tests.txt). Kein Mock oder eigener
Reducer. Fehlend: Descendantmove, Subtreeduplikation und kombinierte Patchlayer als
korrekte Regression, nodeId/Flowkonflikte und echte konkurrierende DBänderungen.

## 11. Dokumentation und bestehende Reviews

Implementationplan Phase2 beschreibt Reducer, Resolver, Revisions-/Snapshotbetrieb,
Zyklen/Limits und Mockruntime; Datei implementiert nur schmalen Teil. Studio-
Interaktionsdoc verspricht Move/Duplicate und responsive Overrides; 001–003 zeigen
konkrete Lücken. Alter akzeptierter Design-Document-v1-Simplification-Review wurde
vollständig neu gelesen: Propspatch direkt unter Node-ID und36Nodearten stimmen,
aber seine expliziten {data:...}/{token:...}-Referenzen entsprechen nicht dem
aktuellen $data-/Tokenstring-Katalog. Sein konzeptioneller „sufficient“-Befund
ist kein bestandener Implementierungsreview. Dokumentationsstatus unvollständig
und teilweise veraltet, eigener Domain-README fehlt.

## 12. Befunde

### PCR-PRISM-DOMAIN-001 — Move in eigenen Nachkommen verliert Teilbaum

- **Hoch, nachgewiesener Defekt:** gültige Operation erhöht Revision und entfernt
  bestehende Inhalte aus dem zurückgegebenen/persistierbaren Dokument.
- **Belege:** index.ts:80–85 findet Ziel vor Entfernen der Quelle, prüft nur
  nodeId===parentId, trennt dann Quelle von ihrer alten Root und hängt sie in den
  eigenen nun unerreichbaren Nachkommen. ensureUnique prüft nur erreichbare Nodes;
  resultierender leerer Stack ist schema-valid. Storage.apply :310–333 persistiert
  den Returnwert bei erfolgreichem CAS.
- **Auslöser:** Root→parent→child, node.move(parent,parentId=child,index=0).
  Originalrepro: Revision2 und root.children=[]; Sourceklon unverändert.
  Datenverlust im Reducer nachgewiesen, DBcommit nur nachvollzogener Codepfad.
- **Ursachenbehebung:** Ziel vor Mutation auf Zugehörigkeit zum Quellsubtree prüfen
  und solche Moves abweisen. Danach Erreichbarkeit/IDmenge konsistent prüfen.
- **Regression:** echter Reducer mit direktem/tiefem Nachkommen, Cross-View-Move,
  legalem Geschwistermove und originalem Source; ungültiger Move wirft ohne neue
  Revision, gültiger erhält jeden Node. Zusätzlich echter Storage-Transaktionstest
  belegt keinen Commit bei verworfener Operation.

### PCR-PRISM-DOMAIN-002 — Nichtleere Teilbäume lassen sich nicht duplizieren

- **Mittel, nachgewiesener Defekt:** angebotene Duplicateoperation scheitert für
  Layouts mit Children; Blattkopien funktionieren.
- **Beleg/Ablauf:** index.ts:75–78 structuredClone(node), nur copy.id wird ersetzt;
  ensureUnique findet identische Child-IDs mit Original. Repro parent→child plus
  newNodeId=copy-parent ergibt „duplicate node ID: child“.
- **Ursachenbehebung:** vollständiges deterministisches IDremapping samt internen
  Action-/Patchreferenzen für geklonten Subtree definieren. Contract muss benötigte
  Identitäten/Seed explizit tragen. Nicht Eindeutigkeitsprüfung entfernen.
- **Regression:** Originaloperation dupliziert verschachtelten Layoutbaum; alle
  Kopie-IDs eindeutig und wiederholbar, Inhalte und interne Referenzen erhalten,
  Original unverändert. Snapshot-/Undoverhalten über reale Storagegrenze prüfen.

### PCR-PRISM-DOMAIN-003 — Responsivepatch verwirft andere Stateproperties

- **Mittel, nachgewiesener Defekt:** unabhängige Stateeigenschaften verschwinden
  sobald derselbe Node irgendeinen Responsivepatch hat; Preview zeigt falschen State.
- **Beleg:** index.ts:103 merged zwei Node→Patchmaps per Spread; :104 wendet nur
  den zuletzt erhaltenen Nodepatch auf Baseprops an. Im Originalrepro setzt State
  title.content='State title', wide setzt title.hidden=true; Result enthält
  hidden=true, aber ursprüngliches content='Deployments'.
- **Ursachenbehebung:** pro Node Propertymaps in Reihenfolge Base→State→Viewport
  zusammenführen; nur gleiche Properties sollen durch spätere Layer überschrieben
  werden. Derselbe Layerfehler ist für Renderer-Variant/Override-Patches bei dessen
  Review zu prüfen, hier nicht bereits als ausgeführter Rendererfall behauptet.
- **Regression:** OriginalresolveView mit disjunkten und kollidierenden Properties
  für alle Viewports, fehlenden Layern und unveränderter Source; Kombination muss
  beide disjunkten Werte erhalten und kollidierende gemäß deklarierter Priorität.

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](../prism-spikes.md).
