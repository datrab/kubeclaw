# nova.lifecycle — Resultzustände, Remediation und Journalreplay

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Alle fünf Dateien (441 Zeilen einschließlich README) und direkte Coregegenstellen
untersucht. Lokale Reducer-/Recorder-/Replayprüfungen bestanden; zwei gemeinsame
Crashfenster sind bei nova.execution geführt.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

`skills/nova/core/lifecycle` besitzt keine Dienstregistrierung. Aktive Exports
applyStageResult/recoverStageStates werden von StageExecutor, Engine-Recovery,
Resume und Adminreopen verwendet. `run-decisions.ts` verwendet repairRequest/
applyRepair live; `recovery-state.ts` dieselben Funktionen beim Replay.
Initialzustände dienen Core-Recovery und Reliabilitytests. Keine abgelöste
Parallelimplementation gefunden. Lifecycle entscheidet, führt aber selbst
keine Plugins, Dateischreiboperationen oder externen Aktionen aus.

Direkte Aufrufketten und beide Seiten gelesen: StageExecutor → Resultreducer →
DecisionRecorder → FileJournal → recoverStageStates → PipelineLoop.
Remediation-Guidance wird über PluginContext an implementation-agent weiter-
gegeben; dessen `repair-evidence.ts` wurde als Verbraucher vollständig gelesen.
Der getrennte [nova.execution](nova.execution.md)-Review beschreibt die
administrative-/Authentisierungs- und Persistenzgrenze.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

Resultreducer nimmt StageDefinition, StageRuntimeState im Zustand running und
validiertes StageResult. Er liefert neuen State plus eine von acht Aktionen:
complete, schedule_attempt, schedule_remediation, persist_wait,
pause_for_orchestrator, request_orchestrator, stop, cooldown.
StageStatus umfasst pending/scheduled/running/waiting/retrying/skipped/
succeeded/failed/blocked/cancelled. State hält Attemptnummer, verbrauchte
Versuche/Remediationzyklen, Guidance, Fakten, Wait/Cooldown und Remediationkante.

Zehn Resultdispositionen sind explizit unterschieden: passed, retry,
request_fix, wait, orchestrator_required, rate_limited, blocked, failed,
timed_out, cancelled. Nicht-passed verlangt Reason. Vollständige Schema-
validierung geschieht zuvor in StageExecutor; der Reducer ist kein unabhängiger
Parser für untrusted JSON. recoverStageStates nimmt geordnete FileJournal-
Records, filtert Lifecycleversion/Run-ID und ignoriert unbekannte Stage-IDs.
RepairRequest.v1 enthält Requester, Target, Generation, ursprüngliches
StageResult und explizite Liste invalidierter Stages.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

applyStageResult erzeugt neue Stateobjekte, erhöht bei jedem Ergebnis
Attemptnummer/AttemptsUsed und entfernt verbrauchte Wait-/Cooldownfelder.
Facts werden auf pass eingefroren. applyRepair mutiert die vom Core besessene
Map: Requester waiting, betroffene Nachfolger pending, alte Fakten/Waits/
Guidance/Remediationmarkierungen weg; Target pending mit RepairRequest-Guidance.
Budgets bleiben erhalten. Es schreibt selbst keinen Journalrecord.

Live-DecisionRecorder persistiert repairRequest in stage.waiting vor Anwendung.
Replay verarbeitet denselben Request; fehlt die Stageentscheidungszeile nach
attempt.completed, wird die Remediation aus dem gespeicherten Result erneut
abgeleitet. Diese gemeinsame Ableitung verhindert unterschiedlich implementierte
Live-/Replayinvalidierung. Finale Recoveryausgabe wird geklont, tief gefroren
und über FrozenMap bereitgestellt. FileJournalintegrität und Objektaliasproblem
bleiben Aufgaben von [nova.state](nova.state.md).

## 4. Korrektheit und Fehlerbehandlung

passed schließt ab. retry stoppt bei ausgeschöpftem Budget, pausiert optional
an orchestratorAfterAttempt oder plant neuen Versuch. request_fix verlangt
vordeklariertes Target, erhöht Zykluszahl und blockiert bei einem der Limits.
wait/orchestrator_required/rate_limited benötigen verbleibendes Attemptbudget.
blocked/failed/timed_out/cancelled haben explizite Stopdispositionen; Timeout
ist failed, kein generischer retry. Graphprüfungen verhindern unauflösbare
Remediationkanten vor Ausführung.

Replay zählt attempt.created mit max(current,attemptNumber), wendet terminales
Attemptresult ohne Doppelzählung an und ergänzt Stageentscheidungsereignisse.
Unfertige running States werden am Ende pending; konsumierte Versuche bleiben.
Ungültige Budgetfelder werden über count() auf den Budgetwert 0 normalisiert;
keine Behauptung, dass Replay semantisch fremde/manipulierte Lifecycleevents
vollständig validiert. Erwartet wird der vertrauenswürdige Corewriter hinter
validiertem Hashjournal, nicht beliebiges Pluginmaterial.

## 5. Timeouts, Abbruch, Wiederholungen und Parallelität

Keine Timer oder Abortcontroller in dieser Komponente. Sie interpretiert
bereits festgestellte timed_out/cancelled/rate_limited-Ergebnisse. Engine
prüft Cooldownfälligkeit; vor Fälligkeit keine Ausführung. Live-Recorder sortiert
Batchabschlüsse vor Remediationinvalidierung, damit parallel beendete
Geschwister nicht auf alte Fakten zurückfallen. RepairTarget mit anderem
remediationReturnTo wird als busy abgewiesen. Reihenfolge und exklusiver
Runmutationsbesitz bleiben Anforderungen an den aufrufenden Core.

Keine Deduplizierung beliebiger mehrfach angelieferter Events nach eventId:
Replay faltet die vom Journal gelieferte kanonische Reihenfolge. Separate
Eventsink-/Observerdeliveryduplikate gehören nicht in diesen Input.
Wenn externe Writer jemals diese Grenze erreichen, sind Schema-, Identitäts-
und Übergangsprüfungen erforderlich; derzeit kein solcher Aufrufpfad gefunden.

## 6. Neustart, Wiederaufnahme und externe Teilaktionen

Rekonstruktion basiert auf durable Attemptresult und zusätzlichen Stage-/
Waitereignissen. Nach wait.resolved bleibt die genaue freigegebene
Signalpayload als continuationGuidance erhalten. Orchestratorwait kann aus
Attemptresult mit deterministischer Ersatz-ID rekonstruiert werden.
Die nächste Resumegrenze akzeptiert diesen Zustand jedoch nicht ohne separate
Waitzeile: [PCR-EXEC-001](nova.execution.md). Kein doppelter Befund hier.

Erfolgreiches Attemptresult rekonstruiert Stageerfolg vor Artifactprojektion;
fehlende normale Resultartefakte werden nicht hier wiederhergestellt:
[PCR-EXEC-002](nova.execution.md). Explizite vorgezogene Checkpoints sind davon
getrennt. Extern akzeptierte Effekte werden vor Wiederaufnahme im Enginepfad
geprüft; dieses Modul kann deren Ausgang nicht aus der Lifecyclefolge erraten.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

Keine eigene Authentisierung. Orchestrator-ID wird aus Plattformkonfiguration
übergeben; Actor-/Signalberechtigungen liegen bei Engine/Host. Plugins liefern
Resultvorschläge, dürfen keine Lebenszyklusereignisse direkt als Core erzeugen.
RepairRequest wird vom Core erzeugt; er enthält Agent-/Providerbefunde als
Daten, keine zusätzliche Autorität für Dateipfade oder Fähigkeiten.
Implementation-agent-Verbraucher prüft Zielstage, Run-/Requester-Provenienz,
Artefaktidentität/-größe/-digest und liest über artifacts.read; vorhandener
Reasontext erteilt keine zusätzlichen Grants.

Wiederaufnahme nach Signal verlangt eine vertrauenswürdige Signalquelle,
nicht nur strukturell passende issuer-Felder. Das vollständige ursprüngliche
StageResult im RepairRequest kann große Befunddaten enthalten; Verbraucher
setzt eigene Grenzen. Keine Secrets oder private Betriebsdaten übernommen.

## 8. Ressourcenbegrenzung, Aufräumen und Aufbewahrung

Lineares Eventfolding mit zusätzlicher Stage-/Nachfolgersuche, Graphtraversal
für Invalidierung; Sets verhindern wiederholtes Traversieren derselben Stage.
Laufzeit-/Speicherverbrauch wächst mit Eventhistorie, Graph und geklonten
StageResulten. Keine eigene Aufbewahrung, Datenbank oder temporären Dateien.
Attempt-/Remediationbudgets sind fachliche Zähler, kein CPU-/Memorylimit.
Der gelesene RepairEvidence-Verbraucher begrenzt auf 32 Artefakte/256 KiB und
verifiziert tatsächliche Rückgabebytes. Das beweist keine generelle Begrenzung
aller Lifecycleevents. Basisjournalgrenzen siehe nova.state.

## 9. Architektur und Vereinfachungsmöglichkeiten

Reiner Reducer und gemeinsame repairRequest/applyRepair-Funktionen sind gut
abgrenzbar. Die separate Stage-/Attempt-/Waitprojektion ist komplexer: an
jedem Schreibpräfix müssen Zähler, Faktinvalidierung, Guidance und Artefakte
zusammenpassen. Ursachenbehebung der Corebefunde sollte dieselbe deterministische
Abschlussableitung live und im Replay verwenden, statt mehr Spezialfälle zur
Fortsetzung einzelner defekter Zustände anzuhängen.

Manuelle Statecasts und tolerant normalisierte Zähler erschweren Diagnose
inkonsistenter, aber formal gehashter Historien. Zukünftige Änderung kann eine
präzise Versions-/Übergangsvalidierung am Replayeingang vorsehen; kein Shim für
alte unbekannte Stateformen. Bestehende Budget- und Dispositionsregeln erhalten.

## 10. Tests und Aussagekraft

Alle direkten Reducer-/Replaytests und Consumersuchen untersucht:

- `check-plugin-system-v2-lifecycle.mjs` vollständig gelesen und Exit 0:
  Graphzyklus, erfolgreiche Resultate/Fakten, unzulässige Fakten, Retryschwelle,
  ausgeschöpftes Budget und deklarierte Remediation.
- `reliability/lifecycle.test.mts` vollständig gelesen und Exit 0: originaler
  DecisionRecorder/FileJournal/Replay invalidiert Lint vor Echo/Buster, erhält
  Fehlerguidance; echter Kindprozess-SIGKILL nach wait.resolved bewahrt Signal.
- phase6 im Executionreview gelesen/ausgeführt: Bedingungen, Fan-out,
  Remediation, Terminalpräfix, Admincounter/Replay und Abbruch.
- repair-evidence.test.mts gelesen: echter Artifactadapter hinter Testcontext,
  Inhalte, Cross-run-/Größen-/Digest-/Duplikat-/Zielprüfung. Der Test ruft nicht
  den Lifecycle-Reducer auf; wird beim implementation-agent separat gewertet.

Evidenz `nova-lifecycle-tests.txt`, ergänzend vorhandene foundation-tests und
nova-execution-tests. Zwei neue Corepräfixproben sind tatsächliche
Originalreproduktionen, aber keine an diesen zwei Stellen getöteten Prozesse.
Fehlt: exhaustive Result-/Budget-/Replaymatrix einschließlich jedem
Präfixfenster, große Graph-/Historienlast und echter Projekt-E2E-Durchlauf.
Ein bestandener kleiner Reducertest beweist nicht alle Crashpfade.

## 11. Dokumentation und früherer Stand

README vorhanden und für Resultdispositionen/Budgets weitgehend korrekt.
Crossprozesslocks sind bereits implementiert, nicht mehr zukünftige Phase7.
Aussage über nicht übersprungene/duplizierte Remediation ist durch gezielte
Tests gestützt, aber keine universelle Garantie aller Abschlussprojektionen.
Detailbeschreibung der Invalidierung alter Fakten/Geschwister, Guidance,
synthetischen Orchestratorwait-ID und Provenienzgrenze fehlt.
Phase6-Lifecycleledger im Executionreview erneut abgeglichen; keine bloße
Übernahme historischer complete-Markierung. Dokumentationsstatus unvollständig
mit veralteten Phasenformulierungen.

## 12. Befunde, Ursachenbehebung und offene Verifikation

Zentrale Defekte: [PCR-EXEC-001](nova.execution.md) für Wait-Recovery-/Resume-
Sackgasse und [PCR-EXEC-002](nova.execution.md) für fehlende Artefaktprojektion.
Auslöser, Schweregrad, exakte Belege, echte Reproduktionen und Regressionen
stehen beim Coreeigentümer. Lifecycle muss an deren Ursachenbehebung beteiligt
werden; bloßes Lockern der Resumeprüfung oder nachträgliches Erzwingen aller
Plugincheckpoints würde die Verträge auseinanderziehen.

Kein zusätzlicher eigenständiger bestätigter Defekt aus den verbleibenden
untersuchten Pfaden. Offene Verifikation: normale wait- und Retryschwellen-
Präfixe ergänzen, alle Dispositionen/Budgetgrenzen mit Live-/Replayvergleich
prüfen, Actor-/Signalherkunft außerhalb des Reducers erhalten. Diese Grenzen
sind sichtbar und verhindern die Aussage „Laufzeitverhalten vollständig bestätigt“.
