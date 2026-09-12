# kubeclaw.junit-report

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden (Parser); fehlgeschlagen (isolierte Runtime/EPIPE). Dokumentationsstatus: vorhanden / veraltet (Malformed-XML-Ablehnung).

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. `skills/buster/plugins/junit-report-adapter/plugin.json` registriert `reportAdapters:junit` (format junit, contractVersion=1), `src/adapter.js#adapt`, ausdrücklich keinen Testprovider. Eigentliche Auswahl in Resolver reportAdapterRefs, `runner.ts:1465–1490` ruft RegisteredReportAdapterRuntime mit bereits gespeicherter test-report-Evidenz; der oben beschriebene Providerloader betrifft den Berichtproduzenten, nicht den Adapter.

## 2. Eingaben, Ausgaben und Gegenstellen

`adapter.js:377–402` nimmt UTF-8 XMLbytes, MediaType und Case-/Findinglimits. Eigenparser liefert exakte counts samt errored, Dauer, begrenzte Fälle und omitted-Zähler. `report-adapter-runtime.ts:266–323` verifiziert Sourcegröße/Digest und Adapterpaket, startet `report-adapter-child.mjs`, überschreibt Source-/Adapteridentität mit hostgebundenen Daten und validiert finalen Vertrag. Unitprovider/Gates entscheiden über Pass, Adapter liefert Fakten.

## 3. Zustand, Persistenz und Commit-Punkt

Adapter selbst rein synchron ohne I/O oder Persistenz. Source-XML bleibt unverändert; Runtime schreibt nur verifiziertes Paketsnapshot und entfernt es finally. Reportableitung findet nach Evidenceimport statt, nicht als eigener Commit. Result-/Reportprojektionen und Crashpräfixe gehören Runner/Remote, nicht XMLparser.

## 4. Korrektheit und Fehlerdisposition

UTF-8/BOM/XMLcharacters, DTD/custom entities/PI, Depth/Taglimits und 30-Tage-Dauer sind geprüft. Gemischte Fehler/Skippriorität: error vor failure vor skipped; tatsächliche testcasecounts statt untrusted Suitecounts. Malformedattribute ohne Leerraum werden trotzdem akzeptiert (PCR-JUNIT-001). Beschränkte Capturetexte können spätere Entityprüfung überspringen; keine vollständige XMLparserkonformitätsaussage.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Adapt hat kein Signal und kann synchron laufen; Runtime setzt absoluten Timeout einschließlich Lesen/Snapshot/Kindprozess und harte Limits. Child erhält genau einen Adaptrequest, ganze Base64datei, streamt keine XMLchunks; UTF-8 wird ganz decodiert. Keine providerseitigen Retries; erneute Adaption derselben Bytes identisch außer nicht garantierter Umgebungsänderung.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Reine Wiederberechnung aus unveränderter digestgebundener Source. Keine externe Aktion mit ungewissem Ausgang. Snapshot wird normal entfernt; Runtimecrash kann orphaned temporäre Dateien hinterlassen. EPIPE in fehlgeschlagenem Originalintegrationstest betrifft äußere Runtime, nicht Parser.

## 7. Vertrauensgrenzen und Evidenzherkunft

DTD/Entityexpansion und Dateizugriff gehören nicht zum erlaubten Parserumfang. Adapterprozess hat keine Berechtigung für eigene Quellen, bekommt nur ausdrücklich gebundene Bytes. Source-/Packageidentity kommt hostseitig nach Rückgabe; Adapter kann sie nicht durch Überschreibung als andere Quelle ausgeben. Ein JUnitreport bleibt vom Projekt erzeugte Evidenz, keine unabhängige Testattestation.

## 8. Ressourcen, Aufräumen und voller Speicher

Parser hat XMLtiefe 256/Suitetiefe64, Tag64KiB, Capture8KiB/Text4KiB, Case-/Findingtruncation mit exakten Totals. Gesamtsourcebyte-/Result-/Memory-/CPUlimit außerhalb in ReportAdapterRuntime (hard Source64MiB/Result16MiB). Kein eigener Dateischreib-/ENOSPCpfad; Source/Snapshotfehler sollen Promiseablehnung werden, unhandled EPIPE beweist gegenteilige Randbedingung der Runtime.

## 9. Architektur und Vereinfachung

Kein zweiter Testprovider: klare reine Faktenfunktion. Selbstgebauter XMLtokenizer erfordert explizite Konformitätsregressionen; eine sichere begrenzte Standardparserlösung könnte Grammatiklücken reduzieren, ohne Entities zuzulassen. Grenzen/Lexerchecks müssen vor Capturetruncation wirken.

## 10. Untersuchte und ausgeführte Tests

`node skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts` importiert unveränderten adapter.test.mjs; gelesen und bestanden mit gemischten/nested/Nodeformen, Truncation, Entities, DTD, PI, UTF8, BOM, Duration. Evidenz `../evidence/buster-provider-junit-report-adapter-original.txt`. Original `node tests/verification/contracts/check-pipeline-junit-report-adapter.mts` gelesen/ausgeführt: fehlgeschlagen, unhandled write EPIPE bei Runtime stdin.end:382, keine erfolgreiche Sandboxadaption; `../evidence/buster-provider-junit-isolated-original.txt`. Zusatzprobe echter adapt beweist malformedattribute-Akzeptanz. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README gelesen: Parserfacts/Truncation, Node-Dialekt und keine eigene Pipelineentscheidung stimmen. „rejects ... malformed XML“ ist durch konkrete Lexerprobe widerlegt. Runtimeisolation ist im Code vorgesehen, aber im jetzigen Originalintegrationstest fehlgeschlagen; das Parser-PASS darf diesen Fehler nicht verdecken.

## 12. Befunde und nächste Verifikation

PCR-JUNIT-001 benötigt Lexer-/Grammatikregression. EPIPE gehört PCR-BUSTER-ENGINE-002 (`buster.engine`) und ist dort zu beheben; nächster echter Nachweis Originaladapterintegration nach Runtimevoraussetzungen/Fehlerbehandlung, danach Brokenpipe-/Timeout-/Killtests.

### PCR-JUNIT-001 — niedrig: Fehlender Attributtrenner wird akzeptiert

Nachgewiesener Parserdefekt. `skills/buster/plugins/junit-report-adapter/src/adapter.js:76–106` setzt offset nach dem schließenden Quote fort und verlangt vor dem nächsten Attribut kein Whitespace. XML `<testsuite><testcase name="a"time="1"/></testsuite>` wird als passed testcase akzeptiert. Eigene Originalprobe `../evidence/buster-provider-boundaries.{mjs,txt}` ruft unverändertes adapt auf; kein Mock und kein Runtimeerfolgsclaim. Auswirkung begrenzt auf die versprochene Malformed-XML-Ablehnung und die Verlässlichkeit von Reportdiagnosen, kein nachgewiesener Netzwerk-/Dateizugriff. Ursachenbehebung: XML-Grammatiktrenner beim Tokenisieren prüfen, unabhängig von Texttruncation. Regression valide mehrere Attribute gegen fehlenden Trenner sowie weitere whitespace-/lexikalische Randfälle.
