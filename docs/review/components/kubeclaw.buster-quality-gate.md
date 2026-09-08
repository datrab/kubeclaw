# kubeclaw.buster-quality-gate

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Nutzung

Nova-Stage quality/kubeclaw.test.quality-evaluation. Projectcompiler verdrahtet sie nach Implementation und finale Testpläne; Registry capability test.plan.execute wird vom Remoteadapter bedient. Alle Quellen protocol.ts/stage.ts, Manifest, drei Schemas, README und vier Pakettests vollständig gelesen. Keine Busterworkerimplementierung in diesem Paket.

## 2. Verträge und Gegenstellen

Providerplan mit XOR revision/sourceStageId; kein caller-owned suiteEvidence/runId/attempt. SDK resolveSourceRevision bindet an echte Implementationartefakte. Remoteadapter führt Plan aus, parseGateDecision prüft geschlossene Felder, Digest und widersprüchliche Erfolgsevidenz; Run muss Lease entsprechen. Native Entscheidung wird vor optionalem Agenturteil gespeichert. Nur passed erreicht runtime.dispatch mit geschlossenem kubeclaw.buster-test-judgment.v2-Vertrag. project-summary konsumiert Decision/Verdict samt sourceRevision und decisionDigest.

## 3. Zustand und Nebenwirkungen

Externer Busterjob und Agentdispatch laufen über Effektadapter, kein direkter Netzwerk-/Workspacezugriff. Native Decisionartefakt enthält noch keinen Qualityverdict; nichtpassender Providerpfad endet ohne Agent. Qualityartefakt enthält Verdict, Sourcerevision, Decisiondigest und reduzierte Suitebelege. Persistenz/einmalige externe Wirkung sind Core-/Adapterzuständigkeit.

## 4. Korrektheit

Native failed→request_fix, cancelled→cancelled, review_required/execution_error→blocked bleiben erhalten. Agent kann fehlgeschlagenen Provider nicht überschreiben. parseVerdict prüft erlaubte Schlüssel, Begrenzungen, Findings und failureClass; passed verlangt alle übergebenen Suites passed und keine Findings. Advisory_failure/skipped werden durch gateDecisionEvidence bewusst als nichtblockierend übersetzt, nicht als bestandene echte Einzeltests dokumentieren. Der Agent sieht summaries, keine automatisch eingebundenen vollständigen Logs.

## 5. Timeout, Retry und Parallelität

Keine eigene Poll-/Retry-/Zeitsteuerung. Remoteparameter werden unverändert übergeben, Corekontext schützt Calls. Runtimeaufruffehler werden bewusst nicht in gewöhnliche Pluginfehlermeldung umgeformt: die externe Reconciliation bleibt erhalten. Lediglich ungültiger empfangener Verdict wird blocked mit bereits gespeichertem Decisionbeleg. Timeoutlücken PCR-NOVA-GATE-001/002 wirken über Remoteadapter durch.

## 6. Recovery und Teilaktionen

Crash nach native decision vor Agent führt über Core-/Effektjournal zur Wiederaufnahme, kein Pluginjournal. Decision und Verdict sind getrennte Writes: nur Decision ist kein erfolgreicher Qualitätsnachweis; project-summary fordert beide. Gültige Journalpräfixe/fehlende Artefaktprojektion bleiben [nova.execution](nova.execution.md). Vollständiger Remoteprovider/Agentrestart hier nicht erfolgreich verifiziert.

## 7. Authentifizierung und Vertrauen

Run-/Attemptidentität aus Lease; Konfiguration bestimmt Agentziel, Registry autorisiert Capabilities. Native Entscheidung stammt aus verifiziertem Remoteimport, Digest allein wäre keine Autorisierung beliebigen Callerinputs. Inputschema verhindert alte suiteEvidence/plan-Doppelpfade. Runtimeagent bleibt semantische Vertrauenskomponente; ein geschlossener Verdict ersetzt keinen unabhängigen Beleg einer subjektiven Bewertung.

## 8. Ressourcen

Protocol begrenzt Summary auf 8192 Zeichen und Findings auf 128 mit je 4096 Zeichen; Inputtask höchstens32768, GateID128. Busterparallelität und Gatezeit kommen aus Providerplan (max64 und zwei Stunden). Vollständige Logs werden nicht im Verdict dupliziert. Artefaktretention und Remotequoten gehören zu Stores; Agentantwortgröße Runtimeadapter.

## 9. Architektur

Klare suite-first-Trennung bewahrt native Gateentscheidung. Bezeichnungen suiteEvidence/provider-plan und historischer READMEtext können Testbeweise überzeichnen: tatsächliche Daten sind Knotenzustände und Kurzgründe. Für echte agentische Evidenceprüfung explizite digestgebundene Leserechte/Refs und Budget dokumentieren. Keine zweite Bustersteuerung einführen.

## 10. Tests

`npm test` bestanden, `../evidence/nova-batch-buster-quality-gate-tests.txt`. Protocol-/Suite-firsttests prüfen Validatoren und Schema; Packageboundary ist statisch. Live-function baut reale Registry/Git/HTTPfixture, prüft aber nur Zurückweisung des alten Graphinputs; null Provider-/Agentrequests. Zusätzlicher gemeinsamer Originaltest check-pipeline-remote-real-provider.mts separat gestartet, Ergebnisdatei `../evidence/nova-batch-quality-real-provider-tests.txt`; Exit1: Sandbox meldet open task children: No such file or directory, Provider endet execution_error/EPIPE statt passed (Assertion Zeile144). Die späteren Quality-pass/fail-Aufrufe ab154/171 wurden nicht erreicht; nicht als ausgeführte Qualityintegration zählen. Qualitätsevaluator im Integrationshelper ist feste HTTP-Testantwort, kein reales Modell. Helper und service/run/import-Verkabelung gelesen.

## 11. Dokumentation

README nennt geschlossene Identität/Fehlerklassen korrekt, ist aber zu suite-first Produktionspfad und den genauen Provenienzgrenzen unvollständig. Historische Parityblocker müssen getrennt von lokal geprüften Pfaden aktualisiert werden. Fehlende Agentbewertung voller Evidence darf nicht aus Testnamen als bereits gelöst gelten.

## 12. Befunde und Restunsicherheiten

Keine neue doppelte Befund-ID; Remoteprobleme siehe nova.test-gates, Source-/Workspacebindung siehe PCR-IMPLEMENTATION-001. Keine Freigabe echter Agentqualität oder Sandboxparität. Geeignete Folgeprüfung: realer isolierter Provider pass/fail, dabei failed garantiert null Agentrequests; erfolgreiche native Decision plus ungültiger Verdict bewahrt Evidence, Restart zwischen beiden Artefaktwrites.
