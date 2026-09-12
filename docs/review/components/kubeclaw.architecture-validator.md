# kubeclaw.architecture-validator

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Manifest `skills/nova/plugins/architecture-validator/plugin.json` registriert
`architecture` / `kubeclaw.validate.architecture` → `src/stage.ts#execute` mit
runtime.dispatch und artifacts.write. In Nova ausgeliefertes, explizit durch einen
Stagegraphen ausgewähltes Plugin; kein automatisch immer laufender Validator.
Der neue Projectcompiler erzeugt diese Stage nicht. Es bewertet Domainmodell und
Integrationsgrenzen durch einen Agenten; deterministische Graph-/Dateiprüfungen
liegen außerhalb. Alle drei Quelldateien, drei Schemas, Manifest und Pakettests
wurden gelesen.

## 2. Verträge und Gegenstellen

Input verlangt task und erlaubt architecture-Objekt; Konfiguration agent und
optional agentRole, letzteres wird im Request nicht verwendet. `protocol.ts`
sendet `kubeclaw.architecture-validation.v2`, Agent, Aufgabeninstruktion,
Architekturobjekt und Outputcontract über runtime.dispatch. `output.ts` erwartet
den transportseitigen `response.result`, geschlossene Ausgabe und Findings mit
Scope domain_model/integration_boundary. passed verlangt checkedFiles und keine
blocking-Findings; blocked verlangt mindestens ein blocking-Finding.
**error/warn/info dürfen passed ergeben**, absichtlich mit
`architecture.review=approval_required`. Das ist kein Clean-Befund.
Gegenstelle `human-approval/src/architecture-approval.ts` liest digest-/größen- und
producergebundene Architekturartefakte und fordert bei Findings eine separate
Genehmigung. Der Graph muss diese Stage und Factbedingung ausdrücklich verdrahten;
das Validatorplugin erzwingt kein nachfolgendes Approval.

## 3. Persistenz und Nebenwirkungen

Dispatch zuerst, anschließend unveränderlicher JSON-Bericht unter Namespace
kubeclaw.architecture-validator und ID architecture-validation; erst danach
StageResult und Fact. Keine direkte Dateimanipulation, kein eigener Journalstore.
Durch Crash nach Dispatch kann ein externes Ergebnis ungewiss sein; nach
Artefaktschreiben, vor Resultcommit kann ein unreferenziertes Objekt bleiben.
Effects-Idempotenz und Core-Recovery sind Voraussetzung, nicht zusätzliche
Garantien des Plugins.

## 4. Korrektheit und Fehler

Parsefehler oder Dispatchfehler werden zu blocked/architecture.invalid_output
mit leerer Artefaktliste; Artefaktfehler propagieren zum Core. Damit bleiben
unklare Agentenantworten blockierend, allerdings werden Transportfehler unter
einem unpräzisen Outputfehlercode berichtet. Findings mit blocking und passed
werden abgewiesen. checkedFiles sind Agentenbehauptungen, kein gelesener
Dateibeweis; die Semantik verlangt ein Architekturreview, keinen deterministischen
Codecoveragebeleg. Kein nachgewiesener zusätzlicher Defekt dieser Reduktion.

## 5. Timeout, Abbruch und Parallelität

Kein eigener Timer, keine Schleife und kein Retry im Stagecode. Corelease und
Adapterdeadline begrenzen Dispatch/Schreiben; blockierende Ausgabe fordert keine
Reparaturschleife. Parallelität und doppelte Zustellung sind an Attemptidentität
und Effects gekoppelt. Ein abgebrochenes Await bestätigt keine Beendigung eines
externen Agenten. Siehe runtime-dispatch-/Effectsreviews für deren Protokoll.

## 6. Wiederanlauf

Kein Checkpoint zwischen Agentenantwort und Bericht. Ein Wiederanlauf benötigt
die gespeicherten Core-/Effectsreceipts oder eine neue ausdrückliche Ausführung.
Die nachgelagerte Artefaktprojektion unterliegt PCR-EXEC-002 aus
[nova.execution](nova.execution.md). Dieses Plugin besitzt keine gesonderte
Recoverylogik und heilt verlorene Coreprojektionen nicht selbst.

## 7. Authentifizierung und Vertrauen

Agentenauswahl wird über runtime.dispatch-Grants und konfigurierten Transport
begrenzt; das Plugin verwaltet keine Secrets. Agentenoutput wird strukturell
validiert, nicht inhaltlich bewiesen. Architectureobjekt und helperPrompt sind
Instruktions-/Dateninput, keine höhere Autorität. Approval muss im Graphen stehen;
Namespace und Digest schützen bei dessen Empfänger vor versehentlich anderem
Inhalt, ersetzen aber keine Agentenqualität.

## 8. Ressourcen und Aufbewahrung

Maximal 128 Findings, IDs 256 Zeichen, Erklärungen/Remediation je 8192.
Summary, checkedFiles und einzelne Pfadarrays haben hier keine vollständigen
Längen-/Anzahllimits. Transport-/Artefaktlimits begrenzen das äußere Ergebnis;
die Approvalgegenstelle begrenzt Referenzen auf 256 KiB und Zusammenfassung auf
10000 Zeichen. Größere, sonst gültige Berichte können deshalb dort blockieren.
Das ist ein offener Größengrenzen-Abgleich, kein erfolgreich reproduzierter
Happy-Pathfehler. Retention/Quota gehören artifact-store; kein eigener Cleanup.

## 9. Architektur und Vereinfachung

Kleine Trennung von Prompt, Outputparser und Stage sinnvoll. Outputschema wird
im Prompt teilweise separat beschrieben und anschließend handvalidiert; gemeinsame
Schemaableitung könnte Divergenz reduzieren. Explizite Factsteuerung ist einfach,
setzt aber überprüfte Graphverdrahtung voraus. Kein weiterer verwaister
Produktionspfad festgestellt; fehlende Nutzung im neuen Compiler ist kein Beleg
für globale Obsoleszenz.

## 10. Tests und tatsächliche Aussage

Gelesen: protocol.unit.test.ts (positive/advisory/error/blocking/Widerspruch und
fremder Scope), live-function.test.ts und package-boundary.test.mjs.
Ausgeführt im Paket: `node tests/protocol.unit.test.ts` **bestanden**;
`node tests/live-function.test.ts` **bestanden**. Letzterer nutzt echte Registry,
Adapterruntime, HTTP, Secretresolver und Artefaktspeicher, aber einen lokalen
Server mit fester Agentenantwort. Kein LLM-/Deployment-/Approval-Ende-zu-Ende-Test.
Boundarytest ist eine einfache Importsuche, kein Sicherheitsnachweis; nicht
zusätzlich ausgeführt. Fehlend: echter Agent, Crash zwischen Dispatch/Artefakt/
Stagecommit, vollständiger Approvalgraph, große gültige Berichte.

## 11. Dokumentation

Plugin-README korrekt zu Outcomes, immutable report und Approvalfact; es nennt
finales E2E ausdrücklich offen. Unvollständig zur maximal interoperablen
Berichtsgröße, tatsächlicher Graphbedingung und Transportfehlerklassifikation.
Pakettestname live-function darf nicht als echter Agententest gelesen werden.

## 12. Befunde und Verifikation

Keine eigene neue Defekt-ID. Gemeinsame Core-/Effectsrisiken nur verlinkt.
Konkrete Folgeprüfung: unveränderten Validator mit knapp unter/über 256 KiB
Bericht durch echte Artefakt-/Approvalgegenstelle führen; Parser-/Wire- und
Approvalbudget an einer gemeinsamen Ursache vereinheitlichen, falls die
Produktanforderung diese Berichte zulässt. Echte Agentenverifikation muss sowohl
clean als auch advisory → approval_required und blocking → blocked abdecken.
