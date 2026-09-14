# contract.telemetry — zurückgebliebener Telemetrievertrag v1

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Code-/Schema-/Generatorreview und lokale Schemaverifikation; Goausführung blockiert.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

`contracts/telemetry/v1` enthält keinen Dienst und kein package.json: Katalog,
53 Payload- und 53 Eventschemas,16 Bundleschemas, Identity/Envelope, TS-/Go-Typen,
Fixtures und Hashmanifest. Generator `scripts/generate-telemetry-contracts.mjs`
(206 Zeilen vollständig untersucht) erzeugt Events/Bundles/Typen/Manifest.
Alle53 Payloads anhand deduplizierter vollständiger Propertydefinitionen samt
Requiredlisten untersucht; keine ausgelassenen zusätzlichen Top-Level-Regeln.
Alle122 Payload-/Event-/Bundleschemas tatsächlich kompiliert. Generierte Typen
über Generator sowie gezielte Envelope-/Union-/Projectionausgaben abgeglichen;
Hashmanifest prüft alle132 referenzierten Dateien.

Repositoryweite Suchläufe nach Pfad, Typdateinamen und Wireversionsstrings in
skills/cmd/tests/scripts finden keine produktive Import-/Validierungsstelle.
`packaging/runtime/package-ownership.json:21` führt Vertrag aber als Assets in
Nova/Busterrollen, nicht Prism. Somit **ausgeliefert, Laufzeitnutzung im Repository
nicht gefunden; abgelöster Vertragsbestand**, nicht mit aktiver Ingestion verwechseln.
Externe Leser unbekannt, vor späterem Entfernen außerhalb des Repositorys klären.
Agent-observability README behauptet Promotion in diesen Vertrag, zugehöriger
Produktconsumer ebenfalls nicht gefunden (siehe contract.agent-events).

Gegenprobe: `telemetry-observer/src/observer.ts:7–21` erzeugt
telemetry-envelope.v2 mit deliveryId/observer/event, `telemetry-store/src/adapter.ts`
legt diesen Payload per FileDurableRecordStore unter telemetry/plugin-events ab.
Keiner liest diesen flachen v1-Envelope. Worker/Admission verwenden wiederum den
getrennten [contract.observability](contract.observability.md). Keine automatische
Kompatibilität dieser drei Begriffe behauptet.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

V1-Envelope mischt Identität und typabhängigen Payload auf oberster Ebene.
Pflicht: schema_version/event_id/source_event_id/type, zwei Zeiten, seq/cursor,
project/run_id/source/producer/authority_class/extensions. Seq integer≥1 ohne
Safe-integermaximum; cursor darf im Schema null sein, obwohl README einen
semantischen Cursor beschreibt. Extensions müssen evidence_provenance aus
production/recorded/synthetic enthalten, weitere Inhalte bleiben offen.
53 Eventtypen decken Pipeline/Modul/Gate, Agent, Kosten/Budget, Qualität/Git,
Commands, Lifecycle, Artefakt, Producerhealth und Terminalabschluss ab.

16 Bundleschemas beschreiben Manifest, Archiv/Katalog, Artefakt, Producerhealth,
Closure, Lifecycleevent/-readmodel, Evaluation, Commandevidence/-request,
RuntimeLog, Quarantine, Export, erwartete Quellen und composed_prompt.
Readmodels besitzen Modul/Gate/Generator/Validator/Step/Attemptmaps; viele weitere
Objekte und Arrays sind absichtlich offen. Hashes ohne sha256:-Präfix, Gitrevision
40 oder64 Hex. Correlation-$ref braucht eine passende URI-/Dateiauflösung beim
Validator; kein implementierter Loader hier. Kein heutiger Sender-/Empfängerpfad
mit diesem Contract gefunden, deshalb keine durchgängige Wiregarantie.

## 3. Zustand, Persistenz und Nebenwirkungen

Contract selbst besitzt keinen Statewriter, Sequenzallocator, Quarantinehandler
oder Archiver. README fordert diese Eigenschaften nur. Generator schreibt direkt
in Vertragsdateien, kein transaktionales Bundleupdate; --check liest und vergleicht
nur. Manifest bindet Pfad, Länge und sha256 jeder Datei, aber nicht sich selbst.
Generator braucht vorher bestehende Payloads, Envelope, Identity, README und
Goldenfixture. Seine Konstanten sind weitere Generierungsquelle: README nennt
catalog.json allein zu ungenau.

## 4. Korrektheit und Fehlerbehandlung

Closed Top-Level-Schemas lehnen unbekannte Felder ab, eingebettete offene Objekte
und extensions bleiben frei. Payloadüberschreibung der Envelopeproperties schwächt
Identitätsregeln (001). Go-/TS-Typen sind statische Modelle, keine Validatoren;
Generator vereinfacht Unions und required/null unterschiedlich (002).
CLI wirft bei Drift, JSON-/gofmtfehler; kein strukturierter Laufzeitfehlervertrag.
53Event-/16Bundle-Generatorvergleich läuft im vorhandenen --check vor dem Go-
Formatierungsblock, ebenso telemetry-types.ts. Gesamter Check dennoch fehlgeschlagen.

## 5. Timeouts, Abbruch, Wiederholungen und Parallelität

Keine Laufzeitaufrufe oder Retries. Geforderte seq-Eindeutigkeit pro project/run
und Cursorordnung werden nicht durch Schema erzwungen. Concurrent Generator-
Schreibläufe besitzen keinen Lock; --check ist read-only, hier verwendet.
Synchrones gofmt ohne Timeout ist Buildvoraussetzung; kein Remoteaufruf. Dedupe-
Identitäten und verlorene Transport-ACKs brauchen einen Ingestionowner, der fehlt.

## 6. Neustart und teilweise abgeschlossene Aktionen

Kein Wiederaufnahmecode. Archiv-/Terminal-/Commandzustände sind Datenbeschreibungen,
keine Implementierung für Crashkonsistenz, einmalige externe Aktionen oder Replay.
Teilweise Generierung vor Fehler kann im Schreibmodus Artefakte gemischt hinterlassen;
Review führte ausschließlich --check aus. Bei einer späteren Ablösung darf die
bloße Existenz dieser Dateien nicht als vorhandener Archiv-/Commandbetrieb gelten.

## 7. Authentifizierung, Autorisierung und Trust

actor/capability/authority_class sind Strings, keine verifizierten Berechtigungen.
Commandrequest enthält issued_at/expires_at/expected_lifecycle_version, prüft aber
weder aktuelle Zeit noch Versions-CAS oder Actoridentität. Evidenceprovenance ist
angegebene Quelle, kein kryptographischer Beleg. Das Manifest ist Integritätsliste,
keine Signatur. Quarantine-/Redaktionsgarantien sind nicht implementiert; Felder
wie transcript/authorization/error sind freie Inhalte. Kein privater Betriebsinhalt
wurde aus Produktdaten übernommen; Goldenfixture ist synthetisch.

## 8. Ressourcen, Cleanup und Aufbewahrung

Keine Byte-/Tiefe-/Knotenlimits für viele Payload-/extensions-Werte, keine TTL,
keine Garbage Collection. V1 definiert Recordformen, Betrieb müsste Limits selbst
setzen. Da hier kein aktiver Leser gefunden ist, keine aktuelle DoS-Auswirkung
unterstellt. Das Mitliefern ungenutzter Assets erzeugt Dokumentations- und
Wartungsaufwand, keine kostenpflichtige Ressource.

## 9. Architektur und Vereinfachung

Drei ähnlich benannte Telemetrie-/Observabilityverträge sind schwer unterscheidbar.
Später den tatsächlichen v2-Observer- und Workerrecordfluss dokumentieren und
verwaiste v1-Assets einschließlich Generator/Packagingreferenzen gezielt entfernen,
wenn externe Consumer ausgeschlossen sind. Kein neuer Kompatibilitätsadapter zur
künstlichen Wiederbelebung. Falls v1 noch vertraglich benötigt wird, muss seine
Schema-/Typgenerierung ein explizit begrenztes Format korrekt abbilden.

## 10. Tests, Aussagekraft und offene Nachweise

Keine dedizierten aktuellen Laufzeittests per Pfad-/Wire-/Typreferenz in tests
gefunden; Golden- und Missing-run-Fixture geprüft. Originalgenerator --check
Exit1: gofmt fehlt. Go-Typkompilierung und Schema/Go-Roundtrip nicht ausgeführt.
[telemetry-contract-tests.txt](../evidence/telemetry-contract-tests.txt) trennt dies
von [telemetry-contract-check.mjs — historischer Stand](https://github.com/datrab/kubeclaw/blob/d8aec76ac4733106f13a0695773235b44bd499d3/docs/review/evidence/telemetry-contract-check.mjs):
132 Manifestdateihashes/Längen stimmen;122 Originalschemas mit installiertem Ajv
und formats kompiliert; Golden-Agenttool-event gültig; fehlende Identity verworfen;
Gateevent akzeptiert null-run, Basis-Envelopeschema lehnt genau diese Identity ab.
Die erste Reviewprobe hatte einen falsch registrierten relativen Ref und wurde
berichtigt; kein Produktvalidator ersetzt und kein Schema zum Bestehen verändert.

Kein bestandener Publish-/Ingestion-/Redis-/Archivtest, keine Go-Parität, keine
vollständige Generierungsdriftfreiheit. Ein unabhängiger Nachweis für aktive externe
Nutzung bleibt offen; lokale Abwesenheit ist anhand angegebener Suchräume belegt.

## 11. Dokumentationsabweichungen

README „canonical machine-readable pipeline observability contract“ ist für den
aktuellen Runtimecode irreführend. Agentcontract behauptet Promotion ohne gefundenen
Ingestionspfad. Katalog ist nicht alleinige Generierungsquelle, und Quarantine/
Ordering/Clockskewtext beschreibt keine hier existierende Implementierung.
Phase5.7-A-Inventar referenziert terminal_closure.v1 als Ursprung, heutiger
Workercontract nutzt eigenen Terminalabschluss. Dokumentationsstatus **veraltet
und unvollständig**, nicht fehlend. Alte Bestandsreferenzen sind kein Aktivitätsbeweis.

## 12. Befunde

### PCR-TELEMETRY-CONTRACT-001 — Payload schwächt Envelopeidentität

- **Niedrig, nachgewiesener Defekt im aktuell ungenutzten Vertrag.** Würde der
  Eventvalidator als alleinige Admissionprüfung verwendet, könnte Identität fehlen;
  kein aktiver heutiger Admissiondefekt daraus abgeleitet.
- **Codebeleg:** generate-telemetry-contracts.mjs:164–174 merged zuerst
  envelopeSchema.properties, danach schema.properties. payloads/gate.verdict und
  rate_limit.detected deklarieren run_id nullable, andere überschreiben attempt
  mit number ohne Integer-/Minimumregel; generierte events übernehmen dies.
- **Auslöser/Auswirkung:** gültiger Gateevent mit run_id:null wird akzeptiert,
  derselbe Basis-Envelope mit null-run abgewiesen. Originalschema-Repro oben.
  Correlation-/Dedupe-Schlüssel wären nicht zuverlässig, falls ein Leser entsteht.
- **Ursachenbehebung:** bei Ablösung Bestand entfernen. Falls bewusst behalten,
  gemeinsame Identitätsfelder nur einmal definieren und Payloadkollisionen beim
  Generieren ablehnen; keine nachgelagerte Reparatur leerer Identitäten.
- **Regression:** alle53 Eventschemas müssen sämtliche Envelopepflichten für
  projizierte Basisfelder erhalten; echte Schemafälle null/negative/gebrochene
  attempts und fehlende run_id systematisch prüfen, zulässige Werte unverändert.

### PCR-TELEMETRY-CONTRACT-002 — Generierte Typen verlieren erlaubte Wireformen

- **Niedrig, nachgewiesene statische Vertragsabweichung; Go-Laufzeittest blockiert.**
  Dormante Clients bekämen falsche Typzusagen oder Decodefehler bei gültigen Werten.
- **Belege:** Generator:139–158 wählt bei oneOf ersten nicht-null-Zweig bzw.
  ersten type. telemetry_types.go:305 Reviewers ist nur Array, Schema gate.started
  lässt Object/Array zu; :745/778 Transcript lässt nur Array zu, Schema auch Object.
  bundle_types.go:214 LifecycleVersion *int64, Schema auch string/null.
  Generator:184 hardcodiert TS cursor:string, extensions optional; Envelope lässt
  cursor:null zu und verlangt extensions mit evidence_provenance. Go:36/39 hat
  ebenfalls string-Cursor und omitempty-Extensions.
- **Auslöser/Auswirkung:** zulässiges Objekt als reviewers bzw. stringbasierte
  Lifecycleversion passt nicht zur Goform; TS kann fehlende Extensions typisieren,
  die Schema zurückweist. Keine heutige aktive Decoderstörung behauptet.
- **Ursachenbehebung:** zunächst Nutzungs-/Entfernungsentscheidung; bei Erhalt
  Generator unterstützt alle tatsächlich verwendeten Union-/Requiredformen oder
  scheitert explizit bei nicht abbildbarer Form. Keine unbemerkte Zweigauswahl.
- **Regression:** Goldenmatrix aus jedem Unionzweig schema-validieren und durch
  echte Go-/TS-Verbraucher roundtrippen; Pflicht/nullverhalten identisch prüfen.
  Go/gofmt fehlen hier, dieser Verifikationsschritt bleibt blockiert.
