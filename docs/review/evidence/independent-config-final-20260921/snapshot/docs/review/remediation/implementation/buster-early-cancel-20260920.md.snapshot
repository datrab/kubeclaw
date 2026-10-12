# Buster: früher Cancel und RC04-Wiederholungsfehler

Der unabhängige [RC04-Lauf](../../evidence/independent-config-20260920/buster-service.txt)
endete mit `BUSTER_REMOTE_SHUTDOWN_TIMEOUT`. Die damalige Ausgabe enthält keine
Stage-/Attemptinstrumentierung. Eine genaue Zuordnung dieses historischen Hängers
zu einem einzelnen Cancelzeitpunkt ist daher nicht bewiesen. Die folgende
Untersuchung weist einen dazu passenden konkreten Fehlermechanismus nach und
bewahrt weitere aufgetretene Prüffehler; sie erklärt keinen nativen Cutover.

## Produktionsfehler: bereits abgebrochene Jobs starten Arbeit

Der Service schreibt `running`, führt danach asynchrone Verzeichnis-/Archivarbeit
aus und startet den Executor. `runTar` registrierte lediglich einen Abortlistener,
ohne ein schon abgebrochenes Signal zu prüfen. Ein Cancel vor dieser Registrierung
konnte beide Taraufrufe und anschließend den Executor erreichen. Ein erneutes
`AbortController.abort()` erzeugt für ein bereits abgebrochenes Signal kein neues
Event.

Die neue RC05-Regression bindet Cancel an die tatsächliche dauerhafte
`running`-Transition: der Hook ruft zuerst den originalen Store auf und danach
den echten `service.cancel`. Sie ersetzt weder Persistenz noch Executor- oder
Abbruchlogik. Der Jobname enthält absichtlich nicht `cancel`, damit die Assertion
unabhängig vom speziellen wartenden Cancel-Testexecutor bleibt. Gemessen werden
null Executorstarts und der tatsächliche terminale Cancelstatus innerhalb der
bereits verwendeten 5000-ms-Servicefrist. Das Startverbot wird jetzt vor jedem
Tarspawn und nach Extraktion vor Capability-/Executorstart geprüft.

Die unveränderten positiven Fälle derselben Suite extrahieren weiter das echte
Archiv; ihr Executor liest `README.md` mit dem erwarteten Originalinhalt. Sie
belegen, dass der Fix reguläre Arbeit nicht pauschal verhindert.

Nachweise:

- [Vorfix](../../evidence/buster-early-cancel-20260920/before.txt): Executorstartzähler 1 statt 0.
- [Isolierter HEAD-Service](../../evidence/buster-early-cancel-20260920/head-before.txt): derselbe Fehler, kein durch den Factoryrefactor neu eingeführter Startpfad.
- [Mutant mit reparierter Testfixture](../../evidence/buster-early-cancel-20260920/mutant-fixed-fixture.txt): Entfernen beider Produktionschecks lässt dieselbe Startassertion scheitern. Eine alleinige Fixturekorrektur besteht den Test nicht.

Alle isolierten Varianten wurden per proot-Dateibind ausgeführt; der gemeinsame
Worktree wurde dafür nicht zurückgesetzt.

## Getrennte Fixturekorrekturen

Der injizierte Cancel-Executor wartete nur auf ein zukünftiges Abortevent. Bei
schon abgebrochenem Signal blieb diese Promise unbegrenzt offen und konnte den
Shutdown blockieren. Er prüft nun zusätzlich das initiale Signal. Das ersetzt
nicht das unabhängig geprüfte produktive Startverbot.

Der erste kombinierte Lauf nach den Produktionschecks erreichte RC05, scheiterte
aber [an einem anderen Timingfehler](../../evidence/buster-early-cancel-20260920/after.txt):
der Late-Submit-Faulttest fragte den Jobstatus ab, obwohl die absichtlich um
750 ms verzögerte POST unter Parallel-/proot-Last noch nicht dauerhaft angenommen
war. Die 600-ms-Dispatchdeadline plus Cleanupzeit beweist keine Zustellung. Der
Test beobachtet nun die tatsächliche `202`-Antwort der bereits abgeschickten POST,
bevor er unverändert den angenommenen Jobstatus prüft. Die Dispatchdeadline bleibt
600 ms, Cleanup bleibt 300 ms; die getrennte Annahmebeobachtung nutzt die bereits
für normale Servicevorgänge geltende 5000-ms-Grenze. Unerwartete HTTPcodes,
Netzwerkfehler und fehlende Annahme scheitern weiterhin ausdrücklich.

Die gesamte RC04-Regressionssuite ist mit einem injizierten Executor begrenzt.
Kein erfolgreicher Lauf dieser Suite beweist reale Provider, Cgroups, retained
Fixtures oder Live-Recovery. Die einzelnen B-/W-Pflichtfälle bleiben unverändert.

## Korrigierter Prüfstand

[Finaler kombinierter Lauf](../../evidence/buster-early-cancel-20260920/final.txt):
21 Tests bestanden, keine Skips; keine Produktionsdeadline wurde erhöht.
[Dateiidentitäten und exakter Aufruf](../../evidence/buster-early-cancel-20260920/identities.json)
und [finaler Diff](../../evidence/buster-early-cancel-20260920/reviewed-final.patch)
binden diesen Lauf. Der erste `after.txt`-Lauf ist separat an
`identities-before-fixture-fix.json` gebunden. Die unabhängige Wiederholung am
korrigierten Stand ist noch ausstehend; ein einmaliges Grün hebt diese A7-Pflicht
nicht auf.
