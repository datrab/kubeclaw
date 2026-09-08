# kubeclaw.api-flow

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden. Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.api-flow@1`, Registration `flow`, Capability `network.http`, retrySafe=false.

## 2. Eingaben, Ausgaben und Gegenstellen

`src/provider.js:1–98` prüft versionierte Flowdatei, erlaubte Felder, Step-/Variablenidentitäten, Header und HTTP-/WebSocket-Assertionstypen. Optionales Deployment/Endpoint oder explizite URL; mehrdeutige Ziele werden verworfen. `execute:120–136` sendet HTTP/WebSocket-RPC an `network-http-runtime.ts:194–261`; Antwortassertionen und Extraktion sind providerseitig. Evidence ist ein JSON-Report ohne Bodies/extrahierte Werte.

## 3. Zustand, Persistenz und Commit-Punkt

Setup, Hauptschritte und Cleanup können POST/PATCH/DELETE und WebSocket-Nachrichten ausführen. Lokaler JSON-Report erst nach allen Schleifen; keine persistierte Schrittbestätigung. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Feldfehler vor Schleifen werfen; Schrittfehler werden Findings, fehlende Hauptschrittvariable wird skipped. Jeder weitere unabhängige Schritt und Cleanup laufen weiter. Nur Findings entscheiden über outcome: deshalb bestanden trotz ausschließlich übersprungener Hauptschritte (PCR-APIFLOW-001). Auch Policyfehler werden als failed materialisiert; siehe gemeinsame Fehlerdispositionsursache in PCR-OPENAPI-002.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Je Schritt min(Requesttimeout, invocation.timeoutMs), keine selbst berechnete absolute Restdeadline; Gesamtzeit begrenzt Worker. Kein eigener Signalcheck zwischen Schritten: Invoker erhält das Contextsignal; harte Beendigung muss Loader/Worker leisten. retrySafe=false senkt Nova-Default auf null Retries und verlangt acceptUnsafeRetry bei expliziter Wiederholung. Kombinationen werden strikt sequenziell ausgeführt.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Keine Checkpoints für extrahierte Variablen und keine restartfähige Cleanupfunktion. Cleanup ist lediglich letzter Teil von execute, bei Prozesskill kann es ausfallen. Verlorener ACK nach Mutation lässt externen Zustand ungewiss; keine automatische Wiederaufnahme/Exactly-once-Zusage. Dafür ist die unsichere Retrydeklaration sachgerecht.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. stepUrl hält interpolierten Pfad auf der Basisorigin. Mutationsmethoden, Header und WebSocket-Freigabe liegen im Invoker; Inhalte des Flowfiles bleiben Projektverantwortung. Fehlerstrings können interpolierte URLs enthalten und müssen bei sensiblen Pfaden bedacht werden.

## 8. Ressourcen, Aufräumen und voller Speicher

Flowdatei 1 MiB erst nach readFileSync geprüft, max. 256 Schritte, Request-/Responsebudgets im Invoker. JSON-Interpolation und Gleichheit rekursiv ohne eigenen Knoten-/Tiefenzähler; tiefes Dateijson kann Stack/CPU beanspruchen, begrenzt nur durch isolierten Prozess/Worker. Keine Filesystemquota vor Reportschreiben; ENOSPC wirft, dann kein gültiges Providerresult. Snapshot-/Evidenzretention im Runner.

## 9. Architektur und Vereinfachung

Ein gemeinsamer brokering Pfad statt eigener Sockets ist sinnvoll. Fehlerklassifikation und Ausführungsabdeckung ausdrücklich modellieren; Flow-Cleanup nicht mit Worker-Recovery verwechseln. Flow-Schema und handgeschriebene Validierung müssen bei Erweiterungen gemeinsam geprüft werden.

## 10. Untersuchte und ausgeführte Tests

`node skills/buster/plugins/api-flow/tests/live-function.test.ts` exit 0, Originalcode und echter lokaler HTTP-/WebSocketserver: Login/Tokeninterpolation, Assertions, Cleanupkontakt, unbekannte Assertion, falsche Protokollfelder, fehlende Datei und WS-Requestbudget. Evidenz `../evidence/buster-provider-api-flow-original.txt`. Zusätzliche Originalprobe in `buster-provider-boundaries.mjs` zeigt all-skipped/pass mit exakt null Serverkontakten. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

README und `docs/architecture/pipeline-test-gate-api-user-guide.md` sind gelesen; sie beschreiben strict sequence und ausdrücklich Skip bei fehlender Variable. Die Dokumentation nennt keinen erfolgreichen komplett unausgeführten Blockinglauf; Cleanup-versprechen gilt im Code nur solange execute fortgesetzt wird, nicht nach Kill.

## 12. Befunde und nächste Verifikation

PCR-APIFLOW-001: Blockingausführung darf ohne ausgeführten fachlichen Schritt nicht erfolgreich sein. Nächster Test zusätzlich gemischte Skip-/Pass-/Setupfehler und Kill nach Mutation vor Cleanup; letzterer hier nicht ausgeführt.

### PCR-APIFLOW-001 — hoch: Blockingflow ohne einen Request besteht

Nachgewiesener Defekt. `skills/buster/plugins/api-flow/src/provider.js:113–117,132` klassifiziert unbekannte Variable im Hauptschritt als skipped ohne Finding und bestimmt outcome nur aus Findings. Ein ansonsten gültiger Flow mit `steps:[{id:"required",path:"/{{missing}}",expect:{status:200}}]` liefert `passed`, counts 1/0/0/1, null HTTP-Kontakte. Runner `validateCounts` verbietet dies nicht. Evidenz: `../evidence/buster-provider-boundaries.{mjs,txt}`, Probe `api-flow-all-skipped`. Auswirkung: erforderliches Gate liefert grünes Ergebnis ohne getestetes Verhalten. Ursachenbehebung: obligatorische Ausführungsabdeckung/erforderliche Schritte als separate Bedingung; Skipsemantik bei abhängigen Schritten erhalten. Regression über echte Resolver-/Runnerkette plus lokalen Kontaktzähler; kein Mockresult.
