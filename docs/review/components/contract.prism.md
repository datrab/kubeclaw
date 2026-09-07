# contract.prism — Design-, Operations- und Worker-Verträge

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Originalvalidatoren, semantische Prüfungen, Generator und Gegenstellen untersucht;
Originaltests sowie gezielte Fehlerabläufe lokal ausgeführt, kein Prism-Service-E2E.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

Paket @kubeclaw/prism-contracts-v1 exportiert src/index.ts und /digest. Vollständig
untersucht: index.ts296, node-catalog.ts421, digest.ts24, Generatorscript76,
generierte Exportdeklarationen, drei Schemas und Contracttest212 Zeilen. Der
258866-Byte-Ajvoutput wurde aus identischer temporärer Quellkopie mit Original-
generator neu erzeugt und bytegleich geprüft; keine handgeschriebene Ersatz-
validierung, keine Änderung der Produktgenerierung.

Aktive Aufrufer: Prism domain applyOperation/resolveView, Engine vor Ausführung,
worker-binding.ts vor und nach opaque Workeroperation, Controlrouten, Preferences,
Studio und Nova prism-design/archive.ts. Worker-Core bleibt generisch; Prism-
Typen werden nur an Spezialistengrenze interpretiert. Domain- und Archivepfad sowie
Workerbindung vollständig für diese Übergaben gelesen. Andere Komponenten erhalten
eigene Reviews, nicht automatisch Gesamtabschluss durch diesen Vertragsreview.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

Acht validatePrism-Ziele: designRequest, designDocument, operation, baselineManifest,
acceptanceCriteria, previewIndex, preferenceEvent und retrievalQuery. Index liefert
den ursprünglichen Wert als generisches T, keinen tiefgefrorenen oder normalisierten
Snapshot. PrismDocument/Node sind grobe TS-Handtypen; Runtimevalidierung notwendig.
Document: Meta/Theme/Assets/Components/Views/Flows;36 Nodearten, IDpattern2–80 Zeichen,
500 direkte Kinder je Node. Zusätzlicher Nodecatalog prüft artspezifische
Pflichtprops, Childanzahlen, Werte-/Tokenformen und Patchziele. Themefarben/-fonts
werden nach Schema gegen CSS-Injectionformen eingegrenzt; Schatten dürfen keine
Semikolons oder schließenden Klammern enthalten.

Componentreferenzen/Varianten müssen existieren, Komponentengraph darf nicht zyklisch
sein, Componentvariant-/Overridepatches dürfen keine Component-/itemComponent-
Referenz ändern. Viewstate-/Responsivepatches erhalten diese semantische Regel
jedoch nicht vollständig (001). Flows/viewRef beschreiben IDs, keine umfassende
Prüfung aller Zielzustände/Actionreferenzen hier. Solche Lücken gegen spätere Domain/
Evaluation prüfen; kein vollständiger Runtimeflowbeweis allein durch validatePrism.

Engine: fünf Operationen generate/render/evaluate/ingest/publish. Requests streng
auf operation+input geschlossen; document nur object, danach validiert
worker-binding.ts:34–35 ausdrücklich designDocument. Render verlangt View/State/
Viewport, optionale Data-URI-Assets bis16M Zeichen je Wert. Ingesttext1–200000,
Generateinstruction1–20000; publish approved:true. Results sind flach typisiert,
keine vollständigen Document-/Manifestsubschemas. Binding:43 validiert Result,
Engine erzeugt/prüft Dokument über applyOperation. Direkter validateEngineResult-
Aufruf beweist deshalb keine volle semantische Designgültigkeit.

Digest.ts hasht JSON.stringify des Hauptschemas bzw. ausgewählten Operationsdefs.
worker-envelope.ts setzt schemaId/Digest; worker-binding.ts:28–33 vergleicht exakt
mit installiertem Schema. Digest bindet Reihenfolge der Schemaobjektfelder und
nicht den zusätzlichen Nodecatalog-/Indexcode; ausführbarer Enginecode muss durch
seine separate Profil-/Paketidentität gebunden werden. Kein RFC8785-Hash versprochen.

Novaarchive:31 validiert Manifest und :62–72 Document/Criteria/Preview. Weil
baselineManifest-Subobjekte nur wenige required-Felder ohne Werttypen besitzen,
prüft archive.ts zusätzlich echte Pfade, Checksumset,32MiB/4096 Dateien, Projekt,
Revision, Previewreferenzen und Contentdigests. Schema allein reicht dafür nicht;
vorhandener Pfadvalidator lehnt ../ ab, auch wenn previewIndex-Pattern es zuließe.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

Validatoren mutieren keine Nutzdaten; globale Maps halten Ajv-Funktionen mit
veränderlichem errors-Feld, synchron ausgelesen. validatePrism gibt dieselbe
Referenz zurück; Persistenz/Isolation ist Sache des Aufrufers. Domain klont Source,
wendet Änderung an, inkrementiert Revision und prüft Result vor Rückgabe.
Archiveprüfung liest/prüft Inhalte, schreibt hier nichts. Generator schreibt eine
Standalone-Datei direkt; keine Transaktion mehrerer Outputdateien oder Runtime-
Netzwerkzugriffe. In diesem Auftrag Originaloutput unverändert.

## 4. Korrektheit und Fehlerbehandlung

Fehler enthalten Präfix PRISM_INPUT_INVALID bzw. PRISM_ENGINE_REQUEST/RESULT_INVALID
und höchstens8 Ajvfehlermeldungen. Semantische Fehler nennen IDs/Pfade; keine
kompletten Nutzlasten. validatePrism prüft alle Componentwurzeln und Basereferenzen,
Viewpatches nur über zusammengeführte Props mit Nodecatalog. Ein schema-valides
Dokument kann deshalb bei Rendering scheitern (001). Bei sehr tiefer gültiger
Wirestruktur läuft rekursiver Validatorstack über (002), statt kontrolliert zu
verwerfen. Control fängt solche Errors in seiner Requestgrenze :1145–1152 als422;
kein dadurch bewiesener kompletter Dienstcrash.

## 5. Timeouts, Abbruch, Wiederholung und Parallelität

Synchrone Validierung ohne Abbruch/Timeout. Rekursive Documentnodes/Operationbatches
haben kein Gesamtdepth-/Node-/Operationbudget; maxChildren500 begrenzt nur Breite.
ID-/Hash-/Datumprüfung kontrolliert Form, keine zeitliche Frische oder Autorität.
baseRevision in Operation ist integer ohne Mindestwert; Domain vergleicht gegen
aktuelle Dokumentrevision und lehnt Konflikte ab. Bei duplicate ist newNodeId im
Schema optional, Domainresultvalidierung verhindert fehlende neue ID erst später.
IdempotencyKey/Claims liegen in Engine/Worker, nicht in diesem Vertrag.

## 6. Neustart und teilweise abgeschlossene Aktionen

Keine eigene Persistenz oder externe Aktion, daher kein Contract-Replay.
Revision/approved/Digestfelder beschreiben Übergabe; Empfänger muss sie gegen
aktuelle verbindliche Daten prüfen. Validator allein kann keine doppelte
Publication, veraltete Approval oder Crashwiederaufnahme verhindern. Gemeinsame
Workerclaim-/Logstorebefunde bleiben bei Worker/Prism-Diensten, nicht dupliziert.

## 7. Authentifizierung, Autorisierung und Trust

Design/Preference/Requestdaten sind untrusted; userId/projectId/approved:true sind
keine Authentifizierung. Dienste müssen Actor/Projekt-/Approvalrechte prüfen.
Assetreferenzen verlangen contentaddressed artifact:sha256 und vordefinierte
Medienarten; tatsächliche Byte-/Medientyp-/Pfadbindung erfolgt beim Renderer/
Archiveconsumer. Docprops sind absichtlich nur Namen im Schema, zusätzliche
Katalog-/Referenzprüfung darf keine Remotegrenze auslassen. Renderer braucht
weiterhin Escape/CSP; Vertragsregex ersetzt keine HTML-Isolation.

Standalonegenerator nutzt Ajv mit strict/allErrors, registriert die drei Schemas,
ersetzt drei Ajv-CJShelpers durch ESMimports und lehnt verbleibendes require/eval/
Function ab. Test bestätigt Textform, nicht komplette Browser-CSP-Laufzeit.
Abhängigkeit von Ajvhelperoutput kann bei Versionswechsel Buildfehler verursachen,
soll fail-closed bleiben. Paket benötigt Node mit TS-/JSON-Importunterstützung und
Ajv/Ajv-formats im Bundle, keine Netzwerk-/DBressource zur Validierung.

## 8. Ressourcen, Cleanup und Aufbewahrung

Kein eigener Store/Retention. Bytes/Objekte werden nicht vor Ajv begrenzt; offene
Objekte wie mockData/theme/operation.props erhöhen Parse-/Traversalkosten.
3000 verschachtelte gültige Nodes in239726 Bytes reproduzieren RangeError.
Worker-Core hat vorgelagerte Limits, aber Control/Studio nutzen validatePrism auch
direkt; deshalb lässt sich dessen Grenze nicht von Workergrenzen ableiten.
Bei künftigem Budget müssen alle Einstiegspunkte denselben Vertrag anwenden.

## 9. Architektur und Vereinfachung

Eine Prüfung des effektiv aufgelösten View-/Componentgraphen mit festem Budget
würde mehrere getrennte Patch-/Referenzdurchläufe konsistent machen. Gemeinsame
Nodevocabulary steht derzeit in Schema und Nodecatalog; Generator-/Katalogparität
soll mechanisch geprüft bleiben. Kein generischer Custom-CSS-/Kompatibilitätsshim.
Typ-/Schemaabdeckung bewusst spezifizieren, statt breites T als Sicherheitsbeweis
zu behandeln. Resultcontract sollte fachlich verbindliche Grenzen dort schließen,
wo andere Aufrufer sich tatsächlich darauf verlassen.

## 10. Tests und Aussagekraft

Gelesen: Contracttest, Prism domain.test.mts, engine.test.mts und Novaarchive.test.ts.
Contracttest prüft Document/Request/Criteria/Preview, unbekannte Props/Nodes,
CSSwerte, Componentcycle/fehlende Component, rekursive Override, Patchziel,
Responsivepflichten und CSP-Textmuster; keine vollständige Positiv-/Negativmatrix
für alle18 Exports. Domainprüfungen behandeln Unveränderlichkeit, Revision,
atomaren Batchfehler und Responsivepatch. Engine testet echten deterministischen
Provider und reines HTMLrendering, weitere Parallelitätsfixture synthetisch;
kein LLM oder Browsercapture. Archive nutzt echte Contentstorebytes/PNG und
Manipulations-/Traversalfehler, keine tatsächliche Designfreigabe.

[prism-contract-tests.txt](../evidence/prism-contract-tests.txt): Generatorbytegleich,
Originalcontracttest und Typecheck bestanden. Domain-/Enginetests und Archive-
Integrität ebenfalls lokal ausgeführt, Details im Log. Repro
[prism-contract-repro.mjs](../evidence/prism-contract-repro.mjs) bestätigt 001/002
mit Originalvalidator, OriginalresolveView und Originalrenderer. Erster Tiefen-
probeversuch scheiterte bereits an reviewseitigem JSON.stringify; finale Probe
konstruiert gültige Wirebytes iterativ und prüft den Originalvalidator. Beide
Beobachtungen getrennt geloggt, kein Ersatzvalidator.

## 11. Dokumentation und frühere Berichte

Kein eigener Contract-README vorhanden; Implementationplan Phase1 nennt alle
Schemas, Fixtures, Crossreferences und Phase2 Zyklus-/Limitdurchsetzung. Das ist
nicht durch den kleinen aktuellen Fixtureumfang belegt. „All object schemas
reject unknown fields“ trifft offene Metaobjekte und baselineManifest-Subobjekte
nicht universell. Geprüfte tatsächliche Referenz-/Patch-/Depthlücken verhindern
Übernahme einer pauschalen früheren Phase1-Gateaussage. Dokumentationsstatus
unvollständig/teilweise veraltet; Schema- versus semantische Grenzen, Ressourcen
und tatsächliche Archivnachprüfungen dokumentieren. Keine Produktdoc-Neufassung.

## 12. Befunde

### PCR-PRISM-CONTRACT-001 — Viewpatch kann ungültige Komponentenziele einschleusen

- **Mittel, nachgewiesener Defekt.** Als gültig akzeptiertes Design scheitert im
  Originalrenderer, somit können Bearbeitung/Preview ausfallen.
- **Belege:** index.ts:196–214 validiert Viewstate-/Responsivepatch nur per
  validateNodeCatalog; dessen component-Prop prüft IDform, nicht Existenz.
  referencedComponents (:132–161) sieht nur ursprüngliche Wurzel. Domain
  resolveView:99–107 wendet den Patch tatsächlich an, Renderer:155–175/292–293
  sucht die geänderte Component und wirft „component root is missing“.
- **Auslöser:** vorhandene card-item-Component, gültiger Viewnode card, Default-
  statepatch {component:'missing-card'}. validatePrism akzeptiert, resolve/render
  verwirft. Originalrepro im Log; keine bloße Schemahypothese.
- **Ursachenbehebung:** aufgelöste Varianten/States/Responsivekombinationen unter
  denselben Existenz-/Zyklus-/Override-Regeln validieren oder Referenzänderung an
  diesen Stellen ausdrücklich verbieten. Nicht Renderfehler durch Leerbox ersetzen.
- **Regression:** Originaldocumentvalidator und Renderer für gültige/fehlende
  Component/Variant/Overrideziele in allen Patcharten; akzeptierte Ergebnisse
  müssen semantisch auflösbar bleiben, auch bei kombinierter State-/Viewportwahl.

### PCR-PRISM-CONTRACT-002 — Rekursive Validierung ohne Eingangstiefenbudget

- **Mittel, nachgewiesener Defekt.** Kleine gültige Wirepayload verursacht
  Stackoverflow/unnötige synchrone Arbeit an direkten Contractgrenzen; Control
  antwortet bei Catch422, Dienstcrash oder externer Angriff nicht nachgewiesen.
- **Belege:** prism-v1.schema.json $defs.node.children und operation.batch rekursiv;
  index.ts:51 ruft generierten Validator ohne Vorprüfung auf, weitere rekursive
  Node-/Componenttraversalen folgen.3000Nodes/239726Bytes ergeben RangeError.
- **Ursachenbehebung:** vor Ajv iteratives Gesamtbudget für Tiefe/Knoten/Properties/
  Bytes definieren und typisierten Vertragsfehler liefern; semantische Traversalen
  ebenfalls begrenzen. Keine größere Stacksize als Symptombehandlung.
- **Regression:** echte JSONpayloads an allen Direkt-/Worker-/Studioeingängen
  genau unter/über Grenze, breite Bäume und verschachtelte Batchoperationen;
  kontrollierter Fehler ohne RangeError, zulässige Dokumente unverändert nutzbar.
  Worker-spezifischer Vorfilter ersetzt direkte Client-/Serviceprüfungen nicht.


Nachprüfung vorhandener konzeptioneller Bericht: prism-design-document-v1-review.md
vollständig gelesen.36Nodes und direkte Propspatches stimmen, ausdrücklich
akzeptierte {data:...}/{token:...}-Referenzen dagegen nicht mit aktuellem $data- bzw.
Tokenstringcode. Bericht bleibt Konzeptentscheidung, kein Runtimebeweis.
Domainreview führt zusätzliche [PCR-PRISM-DOMAIN-001 bis003](prism.domain.md).
