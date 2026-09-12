# kubeclaw.openapi

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden. Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.openapi@1`, Registration `operations`, Capability `network.http`, retrySafe=false.

## 2. Eingaben, Ausgaben und Gegenstellen

`src/provider.js` liest OpenAPI-JSON 3.x, lokale Pointer, operationId-Katalog mit Path-/Operationsparameter-Override. Explizite Operationen plus Tagselektion, Cleanup zuletzt, höchstens 128; Schema für Konfiguration, eigener Validator für Spezifikationsschemas. Requestheader/Body/URL → Original-NetworkInvoker; Response-Statusrange/default, Medientypwildcards, JSONschema und erforderliche Header → Report.

## 3. Zustand, Persistenz und Commit-Punkt

Operationen können mutieren; Reportdatei erst nach Schleifen. Keine interne Ausführungsjournalisierung. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Lokale Referenzen, Referenzzyklen, Tiefe 64, Primitive/Union/Required/AdditionalProperties werden teilweise geprüft. Boolean false am Schemaroot wird geprüft, `items:false` hingegen übersprungen (PCR-OPENAPI-001). Alle inneren/äußeren Schritt-Ausnahmen werden Findings und failed, auch Originpolicyfehler (PCR-OPENAPI-002).

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Requestbudget min(config timeout, invocation timeout) und Invokerpolicy; absolute Gesamtrestzeit im Worker. Keine automatische Retryfreigabe für mutierende Operationen. Doppelte explizite operationId-Selektionen sind zulässig und werden mehrfach gesendet (Originaltest belegt zwei Kontakte); kein Dedupversprechen. Cleanup wird nur nach weiterlaufenden Schleifen erreicht.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Keine dauerhaften Operationsreceipts; verlorene Antwort nach POST ist ungewiss. Neuversuch kann Aktionen duplizieren. `cleanup:true` ist Sortierflag, kein restartfähiger Worker-Cleanup-Hook. Harte Beendigung vor letzten Operationen verhindert deren Ausführung.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. Externe $refs werden verweigert. Responsefacts stammen vom Originalinvoker; Typ-/Schemaeinschränkungen können dennoch im Provider verlorengehen. Byte/Digestbeweise ersetzen keine Spezifikationsvalidierung.

## 8. Ressourcen, Aufräumen und voller Speicher

4 MiB Dateigrenze nach synchronem Read, 128 Operationen, 32 Parameterfelder; Invoker beschränkt Request-/Responsebytes. Schemaauswertung hat Tiefenlimit, aber keinen Gesamtknoten-/Arbeitszähler; uniqueItems führt quadratische Vergleiche aus. Rekursives same ohne eigene Tiefe. Providerprozess/Worker begrenzen daraus entstehenden Aufwand; Ergebnisdatei kann vor finalem Runnerbudget wachsen.

## 9. Architektur und Vereinfachung

Eigener unvollständiger JSON-Schema-Interpreter ist dauerhafte Fehlerquelle. Unterstützten Dialekt verbindlich definieren und unbekannte Assertions ablehnen oder erprobte, begrenzte Schemaauswertung verwenden; boolesche Kindschemas nicht per Truthiness testen. Statusdisposition von Schemafinding trennen.

## 10. Untersuchte und ausgeführte Tests

Original `node skills/buster/plugins/openapi/tests/live-function.test.ts` exit 0: echter HTTP-Server, lokale refs, Headerkonvertierung, 3.0 exclusiveMinimum, false-Schemaroot, additionalProperties, uniqueItems, Content-Type/Wildcard, Cleanup nach Parameterfehler. Evidenz `../evidence/buster-provider-openapi-original.txt`. Gelesener Schluss prüft tiefe refs und unsichere Regex. Zusatzprobe mit Originalprovider+Invoker belegt items:false/pass und denied-origin/failed. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

README und API-Userguide behaupten Schemaüberprüfung vor und nach Requests; `items:false` widerspricht diesem Verhalten konkret. Cleanupbeschreibung ist auf normale Schleifenfortsetzung begrenzt. Offene vollständige Dialektliste und Klassifikation von Policyfehlern.

## 12. Befunde und nächste Verifikation

PCR-OPENAPI-001/002 bestätigen zwei voneinander unabhängige Ursachen. Nächste Regression: false in allen Schema-Kindpositionen und unbekannte Assertions; Policy-/Cancel-/Limitfehler als execution error von HTTP-Assertionen abgrenzen.

### PCR-OPENAPI-001 — hoch: Verbietendes Array-Itemschema wird ignoriert

Nachgewiesener Defekt. `skills/buster/plugins/openapi/src/provider.js:94–103` benutzt `if (schema.items)` statt Presencecheck. OpenAPI 3.1 Response `{type:"array",items:false}` akzeptiert reale HTTP-Antwort `[1]` mit outcome passed; booleans werden am Schemaroot korrekt behandelt, der Aufruf dorthin entfällt. Evidenz `../evidence/buster-provider-boundaries.{mjs,txt}`. Ursachenbehebung: false explizit auswerten, Dialektunterstützung vollständig oder fail-closed deklarieren. Regression: leer/nichtleer, Request und Response, false/true/Object in allen Kindpositionen.

### PCR-OPENAPI-002 — mittel: Operatorfehler werden fachliches Testergebnis

Nachgewiesener Defekt in der Fehlerdisposition. `provider.js:244–247` fängt jede Ausnahme, daraus werden über `output:177–180` offene `failed` Findings. Der Originalinvoker lehnt fremde Origin vor Kontakt ab; Provider liefert trotzdem abgeschlossenen fehlgeschlagenen Fachtest (`openapi-policy-disposition`, null zusätzliche Kontakte). API-Flow `provider.js:132` besitzt denselben Pattern; Eigentümer dieses gemeinsamen Befunds hier. Die Origin bleibt geschützt, daher kein Autorisierungsdurchbruch; Diagnose, Wiederholungs-/Dispositionregeln verlieren aber Operator-/Ausführungsfehler. Ursachenbehebung: typisierte Capabilityfehlertaxonomie erhalten, nur deklarierte Assertionfehler fachlich einstufen. Regression mit echtem verweigerten Ziel, Responsegrößenüberschreitung und abgebrochener Operation; Worker-Cancel darf weiterhin Vorrang haben.
