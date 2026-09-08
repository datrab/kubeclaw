# T05 — Einzelmodul: Lint-, Echo- und Buster-Reparaturen

Status: statischer Trace abgeschlossen; Orchestrator-Gegenprüfung abgeschlossen (statisch). Kein Laufzeit- oder E2E-Erfolg. Geprüfter Code-Commit für **alle** folgenden Quellbelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Reviewquellen: `a9e080ab1e1981ec5713e9b742f94280835fd347`, insbesondere `docs/review/findings.md` und Komponentenberichte `kubeclaw.implementation-agent`, `nova.lifecycle`, `kubeclaw.buster-quality-gate`. Historische Testaussagen dieser Berichte sind keine Tests dieses Traces.

## Szenario, Ausgangszustand und Ergebnis

Ein gültiges `nova-project.v1`-Projekt `p`, Run `r`, genau ein Modul `m`, keine Modulabhängigkeiten, gültige Requirements/Ownership, Forge/Echo/Buster-Agentkonfiguration, reale Lintpolicy und digestgültiger Providerplan mit `scope={moduleId:m,gateId:null}`. Der Providerplan enthält mindestens einen nicht übersprungenen blockierenden Test. Autorisierte Adapter, erreichbare Worker, Gitrepository und Artefaktspeicher werden vorausgesetzt. Die konkret ausgewählten Suites sind Eingabe dieses Plans, nicht automatisch sämtliche 13 Suites.

Gewünschte Hauptfolge: Implementation → Lintfehler → Forge-Reparatur → Lintpass → Echofehler → Forge-Reparatur → Lintpass → Echopass → Busterfehler → Forge-Reparatur → Lintpass → Echopass → Busterpass → Modul akzeptiert.

**Erste Bruchstelle:** Beim regulären OpenClaw-Dispatch wird der erzeugte Modulworktree nicht an Forge übertragen: **PCR-IMPLEMENTATION-001**, hier an beiden Seiten erneut nachgelesen. Alle nachfolgenden Übergänge sind deshalb bedingte Fortsetzung unter A1: Forge bearbeitet tatsächlich den vorgesehenen Worktree und Gitoperationen gelingen. A1 ist kein im Code nachgewiesener Normalzustand und keine angewandte Reparatur.

**Zweite, unabhängige Grenze:** Unter A1 kann die kombinierte Hauptfolge nicht bis zur Modulabnahme laufen. Der Projectcompiler gibt jeder Stage `maxAttempts=2`; bereits erfolgreiche Versuche verbrauchen dieses Budget. Nach der ersten Forge-Reparatur ist dessen Budget ausgeschöpft. Die zweite Reparaturanforderung von Echo blockiert deshalb vor dem dritten Forge-Aufruf. Unter unverändertem Compiler werden stattdessen drei getrennte Varianten vom gleichen frischen Ausgangszustand bis zum bedingten Modulabschluss verfolgt:

| Variante | Eingeführter Fehler | Vollständige bedingte Folge | Endzustand |
|---|---|---|---|
| T05-A | Ein reparierbarer Lintbefund | F1 → L1 request_fix → F2 → L2 pass → E1 pass → B1 pass | Alle vier Stages succeeded |
| T05-B | Ein verifizierter, reparierbarer Echo-Blocker | F1 → L1 pass → E1 request_fix → F2 → L2 pass → E2 pass → B1 pass | Alle vier Stages succeeded |
| T05-C | Ein blockierender nativer Buster-Testfehler | F1 → L1 pass → E1 pass → B1 request_fix → F2 → L2 pass → E2 pass → B2 pass einschließlich Agenturteil | Alle vier Stages succeeded |
| T05-D | Kombinierte Hauptfolge | F1 → L1 request_fix → F2 → L2 pass → E1 request_fix → F3 verweigert | Run blocked, keine Modulabnahme |

F/L/E/B bedeuten Implementation/Lint/Review/Quality-Stage, Ziffern deren Attemptnummern. „Pass“ bezeichnet hier ausschließlich den angenommenen Input für die statische Zustandsableitung, kein beobachtetes Testergebnis. T05-A/B/C verlangen jeweils erfolgreiche Reparatur und anschließend keine weiteren Fehler.

## Belegindex: Pfad, Symbol, Zeilen

Zeilen beziehen sich auf den oben festgehaltenen Code-Commit. Die Kürzel in den Übergangstabellen referenzieren konkrete Codebelege, keine alleinigen Dokumentationsbehauptungen.

| Beleg | Datei und Symbol | Zeilen | Nachgewiesene Funktion |
|---|---|---|---|
| C1 | `skills/nova/project/compiler.ts`, `compileProject` | 46–89, 103–136 | Pflichtfelder, Scope/Digest, vier Stages, feste Budgets und serielle Abhängigkeiten |
| C2 | `skills/nova/plugins/implementation-agent/src/stage.ts`, `createWorkspace`, `dispatchImplementation`, `integrateWorkspace`, `execute` | 10–46, 67–122 | Worktree, Dispatch, Leaseidentität, Merge, Ergebnisartefakt |
| C3 | `skills/nova/plugins/implementation-agent/src/protocol.ts`, `buildRequest`, `parseCompletion` | 37–82, 96–138 | Sendervertrag ohne Worktree, Completionprüfung, Identitätsbindung |
| C4 | `skills/common/plugins/runtime-dispatch/src/openclaw.ts`, `spawnSession`, `dispatchOpenClaw` | 207–224, 234–286 | Statisches target.cwd; deterministische Dispatch-/Sessionzuordnung und Import |
| C5 | `skills/common/plugins/git-workspace/src/operations.ts`, `createWorkspace`, `removeWorkspace`, `workspaceOperation` | 10–33, 53–65 | Reale Gitbefehle create/add/commit/merge/remove und SHA-Ausgabe |
| C6 | `skills/common/plugin-runtime/sdk/src/source-revision.ts`, `resolveSourceRevision`, `resolveImplementationRevisions` | 5–48 | Run-/Stagefilter, Digestprüfung, früheste Base und neueste Revision |
| C7 | `skills/nova/plugins/lint/src/stage.ts`, `execute`, `resultForReport` | 23–94 | Lintinput, Revisionsecho, Reportpersistenz und Fehlerdisposition |
| C8 | `skills/nova/plugins/lint/src/candidate.ts`, `withLintCandidate` | 6–19 | Isolierter Checkout der ausgewählten SHA, HEAD-Gleichheit, Cleanup |
| C9 | `skills/nova/core/lifecycle/reducer.ts`, `requestFix`, `applyStageResult`, `retry` | 63–102, 105–122 | Alle Resultate zählen als Attempt; Reparatur- und Retrybudget |
| C10 | `skills/nova/core/lifecycle/remediation.ts`, `repairRequest`, `applyRepair` | 13–51 | Transitive Invalidierung, entfernte Fakten, erhaltene Budgets |
| C11 | `skills/nova/core/execution/run-decisions.ts`, `record`, `#remediate`, `#completeRemediation`, `#stop` | 28–53, 69–80, 110–135 | Artefaktprovenienz, persistierter RepairRequest, Rückweg und Stop |
| C12 | `skills/nova/core/execution/pipeline-loop.ts`, `run`, `#forcedReady`, `#execute`, `#finalize` | 22–39, 97–102, 118–143 | Scheduler, Budgetkontrolle vor Ausführung, Runabschluss |
| C13 | `skills/nova/plugins/implementation-agent/src/repair-evidence.ts`, `repairEvidence` | 3–47 | Requester-/Run-/Digest-/Größenprüfung und tatsächlicher Artefaktinhalt als Guidance |
| C14 | `skills/nova/plugins/review/src/stage.ts`, `dispatchEcho`, `runReview`, `execute` | 73–81, 211–267 | Snapshotdispatch, Semantikprüfung, aktuelle Revisionseinbindung |
| C15 | `skills/nova/plugins/review/src/review-reducer.ts`, `classifyVerifiedReviewFinding`, `blockerResult`, `reduceReviewDecision` | 33–46, 180–208, 212–272 | Nur passende verifizierte Blocker lösen request_fix aus |
| C16 | `skills/nova/plugins/review/src/review-report-flow.ts`, `persistReviewOutcome`, `finalizeReview` | 44–73 | Governor, verpflichtender Report und Artefakt-Rückgabe |
| C17 | `skills/nova/plugins/buster-quality-gate/src/stage.ts`, `execute` | 6–48 | Suite-first, Remoteentscheidung, bedingter Agentdispatch, Verdictpersistenz |
| C18 | `skills/nova/plugins/remote-test-gate/src/adapter.ts`, `execute` | 63–93 | Root/Run/Plan/Grantsprüfung; Produktionsjob mit aktueller Revision |
| C19 | `skills/nova/core/test-gates/production.ts`, `ProductionNovaTestGate.execute` | 61–74 | Committed Source Snapshot → Remotejob → Ausführung |
| C20 | `skills/nova/core/test-gates/remote-result-import.ts`, `verifyCompletedResult`, `decide`, `FileNovaGateImportStore.record`, `NovaRemoteGateImporter.import` | 100–160, 169–208, 226–268, 285–314 | Job-/Plan-/Run-/Attempt-/Scope-/Digestbindung, Evidenceimport, idempotente Persistenz |
| C21 | `contracts/pipeline-test-gate/v1/src/gate-decision.ts`, `gateDecisionStageResult` | 36–46 | failed → request_fix; execution_error/review_required → blocked |
| C22 | `skills/nova/plugins/buster-quality-gate/src/protocol.ts`, `buildRequest`, `parseVerdict` | 16–42 | Suitekurzbelege, geschlossener Agentvertrag, leasegebundene Zuordnung |
| C23 | `skills/nova/core/execution/stage-executor.ts`, `execute`, `#runtime`, `#context`, `#priorArtifacts`, `#recordResult`, `#cleanup` | 34–119, 133–140 | Attempt/Lease, Effekt-ID-Sequenz, Resultrecord vor Reducer, Abbruch |
| C24 | `skills/nova/core/execution/artifact-checkpoints.ts`, `ArtifactCheckpointRecorder` | 61–106 | Append-only Artefaktprojektion und genaue Deduplizierung |

## Vollständige Übergangsfolge

### 1. Plan → Core → Forge

1. `compileProject` validiert Run, Projekt, Modul, absolute Roots, disjunkte Ownershippräfixe und Providerplan. `plan.runId`, `plan.project` und Modulscope müssen passen. `review.agent`, `lint` und `test.agent` sind verpflichtend; „nur Lint“ ist in diesem Entrypoint keine unterstützte Variante. Es erzeugt `implement-m → lint-m → review-m → test-m`, alle `on.request_fix=implement-m`, `maxConcurrency=1` (C1). Die nachfolgende Stage heißt zwar `test-m`/`gateId:test-m`; der tatsächliche Providerplan bleibt **Modulscope**, kein kumulatives Gate.
2. Der Scheduler wählt Implementation. StageExecutor erzeugt `attemptId=attempt:<UUID>`, `attemptNumber=1`, aktive Lease mit Run/Stage/Grants und schreibt `attempt.created`/`attempt.dispatched`; Fähigkeiten werden mit `runId:stageId:attemptNumber:sequence` korreliert (C23). Die Stage ersetzt caller-owned `runId` und `attempt` durch die Leasewerte (C2).
3. `git.workspace.create` erhält Repositoryroot, `workspacePath=<workspaceRoot>/<runHash>/m`, Branch `nova/p/<runHash>/m`, `baseRef=HEAD`. Gitadapter führt `git worktree add -b ...` aus, prüft den kanonischen Workspace und liest `rev-parse HEAD` (C1/C2/C5). Der tatsächliche Ausgangsstand R0 ersetzt `input.headBefore`; der konfigurierten 40-stelligen `baseRevision` entspricht R0 nur, wenn Repository-HEAD tatsächlich dort steht. Keine zusätzliche Gleichheitsprüfung wird hier behauptet.
4. `buildRequest` sendet `protocol=kubeclaw.implementation.v2`, Agent, Identität `{runId,moduleId,attempt}`, `headBefore`, Task/Requirements/Ownershipprosa und Outputcontract. **workspacePath fehlt**. OpenClaw `spawnSession` verwendet `cwd:target.cwd` statt des erzeugten Worktrees (C3/C4). Das ist die erste Bruchstelle PCR-IMPLEMENTATION-001. Ownership im Task ist zudem LLM-Anweisung, keine zusätzliche Gitgrantgrenze.
5. Bedingt unter A1: OpenClaw korreliert Dispatch über Payload-/Dispatch-ID, sucht vorhandene deterministische Session, spawnt oder verbindet erneut, pollt und importiert das Ergebnis nach Modell-/Budgetprüfung. `parseCompletion` akzeptiert nur `ready_for_testing|blocked`, erlaubte Felder, relative ChangedPaths, Checks und Runtime-Sessionevidenz. Für ready verlangt es nichtleere ChangedPaths/Checks, ausschließlich `passed=true` und Sessionabschluss `completed`. Diese Checks sind **Agentenaussagen**, nicht unabhängige Buster- oder Linterbeweise. Run/Modul/Attempt werden nach dem Parsing aus dem Input angehängt (C3/C4).
6. `git.commit` erhält exakt Completion.changedPaths im erzeugten Workspace; Gitadapter führt `git add -- paths`, `git commit ... -- paths` aus. `git.merge` integriert den Branch per `--no-ff` in das Repository und liefert die echte Merge-SHA R1. Dieser Merge findet **vor** Lint/Echo/Buster statt. Nach bestätigtem Merge werden Worktree und Branch entfernt. Cleanupfehler erzeugt Zusatzartefakt und hebt fertige Implementation nicht auf (C2/C5).
7. Persistiertes JSON `implementation:m:1`, Namespace `kubeclaw.implementation-agent`, enthält Completion, `headBefore=R0`, `sourceRevision=R1`; Stage passed liefert zusätzlich `implementation.source_revision=R1`. StageExecutor journalisiert das Resultat, DecisionRecorder prüft Artefakt-Run/Stage und markiert Stage succeeded; erst dann wird Lint freigegeben (C2/C11/C23).

### 2. Lintfehler → Reparaturauftrag → Forge → erneuter Lint

8. Lint konsumiert `sourceStageId=implement-m`; SDK filtert Implementationartefakte nach aktuellem Run/Source-Stage/Namespace, wählt die höchste Attemptnummer und prüft JSONdigest/Bytes/Status/SHA. `lint.execute` erhält R1, Repository, Policy, `tier=full`. Der Lintcandidate ist ein separater detached Checkout von R1 mit geprüftem HEAD. Die Antwort muss R1 zurückgeben; Report wird gespeichert (C6–C8). Dadurch wird im betrachteten Pfad nicht blind das gerade aktuelle Repository-HEAD gelintet.
9. Semantische Lintbefunde (`total_blocking>0`, keine Toolfehler) ergeben `request_fix` plus Lintreport. Toolausfall ergibt dagegen sofort `blocked`; er wird nicht automatisch als Forge-Reparatur behandelt (C7). T05-A wählt ausdrücklich den ersten Fall.
10. Reducer erhöht Lint attemptsUsed auf 1, remediationCyclesUsed auf 1, wählt `implement-m`. Recorder persistiert `stage.waiting` einschließlich vollständigem `repair-request.v1` **vor** `applyRepair`. Request enthält Requester, Target, Generation, ursprüngliches StageResult und transitiv invalidierte Stages. `applyRepair` entfernt Facts/Wait/Guidance der Nachfolger, stellt Requester waiting und weitere Nachfolger pending; Implementation wird pending mit `remediationReturnTo=lint-m` und `continuationGuidance.repairRequest`. Alle Budgets bleiben bestehen (C9–C11).
11. Forge Attempt 2 lädt ausschließlich die vom Core referenzierten Requesterartefakte: gleicher Run/Requester, JSONmediatyp, Digest, Größe, keine doppelten Refs, höchstens 32 Artefakte/256 KiB. Es liest deren tatsächliche Inhalte mit `artifacts.read` und verifiziert sie vor Dispatch. Request plus Evidence werden der Task-Guidance beigefügt (C13/C2). Das ist eine technisch nachvollziehbare Fehlerübergabe, keine bloße Bitte an Nova, den Fehler später selbst zu suchen.
12. Neuer Worktree vom aktuellen HEAD R1; unter A1 repariert Forge, commit/merge erzeugt R2. Artefakt `implementation:m:2` hat `headBefore=R1,sourceRevision=R2`. Alte Artefakte bleiben als Historie erhalten. Der Recorder entfernt den Returnmarker und setzt Lint pending. Lint Attempt 2 wählt jetzt R2 und muss erneut bestehen. Danach startet Echo Attempt 1 (C2/C5/C6/C10–C12).

### 3. Echo-Blocker → Forge → Lint → Echo

13. T05-B beginnt frisch mit F1/R1 und bestandenem L1. Echo bindet `revisions.sourceStageId` über `resolveImplementationRevisions`: **Base aus frühestem Implementationartefakt R0, Head aus neuestem R1**. Der Stagepfad bereitet einen gefrorenen Reviewsnapshot vor, dispatcht Echo, verarbeitet eventuell begrenzte Kontexterweiterung, Semantik und verifizierte Findings und reduziert diese anhand Policy/Governor (C6/C14–C16).
14. Ein bloßes Agenturteil „fail“ ist nicht automatisch Reparaturautorität: `classifyVerifiedReviewFinding` berücksichtigt Priorität, Kategorie, Scope, neue/vorbestehende Befunde, Evidenz und Reparierbarkeit. Verifizierte, reparierbare Scopeblocker führen `request_fix`; unbekannter Scope/Integritätsfehler blockiert oder benötigt Orchestrierung. Reportpersistenz ist verpflichtend; Schreibfehler wird `blocked` (C15/C16). T05-B nimmt einen tatsächlich verifizierten reparierbaren Blocker an, der vom Governor nicht eskaliert wird.
15. Requester ist nun `review-m`; Target bleibt `implement-m`. Die transitive Invalidierung setzt auch den **bereits bestandenen Lint** pending und entfernt dessen Facts. Forge erhält Reviewreport und Reason über denselben geschützten RepairEvidencepfad. F2 integriert R2. `#completeRemediation` setzt Echo pending, **führt es aber nicht an seinen Abhängigkeiten vorbei aus**: Echo hängt weiterhin an Lint, deshalb ist L2 der nächste ausführbare Schritt (C10–C13).
16. L2 prüft R2. Echo E2 bewertet weiterhin die vollständige Moduländerung **R0→R2**, nicht nur den Reparaturdiff R1→R2 (C6). Nach erfolgreicher Policy-/Governorprüfung und Reportpersistenz kann B1 starten. T05-B endet nach dessen vollständigem bestandenen Pfad aus Abschnitt 4 bedingt mit allen Stages succeeded.

### 4. Buster-Modultestfehler → Forge → Lint → Echo → Buster

17. T05-C startet frisch mit F1/L1/E1 bestanden. Qualitystage resolved R1 und ruft `test.plan.execute` mit `providerPlan` und `revision=R1`. Adapter validiert Repositoryroot, Plan, Run und exakte Grantknoten. Produktionspfad baut den committed Source Snapshot von R1 und einen Remotejob mit Idempotency-Key, Pipeline-Stage, Plan, Snapshot, Archiv und Grants (C17–C19). Das Modul kann den vorher integrierten Repositoryinhalt im Snapshot enthalten; der **fachliche Umfang** kommt dennoch aus dem Modulplan, nicht aus einer automatisch hinzugefügten kumulativen Suite.
18. Rückweg: Remoteimport prüft Status.jobId/requestDigest, Result.jobId/planId/planDigest/runId, vollständige Knotenmengen, Attemptdigest/Execution-/Test-/Provider-/Modul-/Gate-/Suiteidentität, finale Attempt-ID, lückenlose Attemptnummern und planseitiges Retrylimit. Evidencebytes werden nach Länge/Digest importiert. Persistenz geht über pending_evidence→complete; Wiederimport derselben Entscheidung ist idempotent, abweichende Identität/Digests führen Konflikt (C20). Die Details der einzelnen Providerprozesse werden hier nicht als erneut voll geprüfter Suite-/Worker-E2E-Trace beansprucht.
19. Ein blockierender nativer Testfehler ergibt Decision `failed`, `gateDecisionStageResult→request_fix`; execution_error/review_required ergeben blocked, cancelled bleibt cancelled (C20/C21). Quality persistiert `buster-quality:test-m:decision:1` und gibt bei jedem nicht-passed **vor Agentdispatch** zurück. Ein Test-Agent kann deshalb einen fehlgeschlagenen deterministischen Test nicht zu passed umdeuten (C17).
20. Core invalidiert bei B1 request_fix wiederum Lint **und Echo**, löscht ihre erfolgreichen Facts und stellt Forge zur Reparatur bereit. Forge erhält die persistierte Gateentscheidung und den Reason über RepairEvidence. Der automatische Handoff enthält hier nur Knotenstatus/Kurzgründe und Result-/Decisiondigest: vollständige Remote-Logs werden nicht als normale Stageartefakte angehängt. Das ist eine begrenzte Diagnosegrundlage, keine behauptete vollständige Evidenceversorgung (C13/C17/C20/C21).
21. Unter A1 und ausreichender Fehlerdiagnose erzeugt F2 R2. Erst L2(R2), dann E2(R0→R2), dann B2(R2) werden freigegeben. B2 verwendet denselben fachlichen Modulplan, jedoch aktuellen Source-Snapshot und neue Core-Attempt-/Effektidentität; erneute Remoteausführung und verifizierter Ergebnisimport sind erforderlich, alte pass-Facts reichen nicht (C6/C10–C12/C17–C20).
22. Bei nativer passed-Decision speichert Quality diese zuerst und dispatcht erst danach `kubeclaw.buster-quality-gate.v2` mit Run/Gate/Attempt und reduzierter suiteEvidence. `parseVerdict` bindet Identität an den aktuellen Aufruf; passed verlangt failureClass=none, leere Findings und keinen übergebenen fehlgeschlagenen Suitebeleg. Das gespeicherte Verdictartefakt enthält R2 und decisionDigest. Erst dann kann die Stage passed zurückgeben. Ein Agent-request_fix würde dieselbe Remediation erneut verlangen und hier an Budgets stoßen (C17/C22).
23. Nach test-m succeeded sind im Einzelmodulprojekt alle vier Stages succeeded; `#finalize` schreibt run.succeeded. Es gibt in dieser kompilierten Definition keinen zusätzlichen Modulabnahmehandler, Operator-Approval, Summary oder Deployment. „Modul akzeptiert“ bedeutet hier nur diesen Corezustand und die zugehörigen überprüften Artefakte; keine Operatorabnahme und keinen behaupteten Laufzeiterfolg (C1/C12).

## Revisions-, Zustands- und Artefaktentwicklung

| Zeitpunkt | Gitstand/Referenz | Corezustand | Artefaktautorität |
|---|---|---|---|
| Vor F1 | Tatsächlicher HEAD R0 | F pending; L/E/B pending | Konfigurationsbase existiert, ist noch kein geprüfter Candidate |
| Nach F1 | Mergecommit R1 | F succeeded; L bereit | implementation:m:1 mit R0/R1 und Runtimecompletion |
| Nach erstem L/E/B-Fehler | R1 bleibt integriert | Requester waiting, F pending, Nachfolger pending; Facts entfernt | Fehlreport bleibt im RepairRequest; alte Artefakte historisch vorhanden |
| Nach F2 | Mergecommit R2 | F succeeded, Requester pending; L muss zuerst laufen | implementation:m:2 mit R1/R2; SDK Reviewbase bleibt R0 |
| Nach neuer Prüfung | L(R2), E(R0→R2), B(R2) | Nur neu bestandene Stages succeeded | Aktuelle Artefakte über höchste Implementationattemptnummer ausgewählt |
| Kombinationsfall vor F3 | R2 | F blockiert wegen attemptsUsed=2 | Kein R3 und keine gültige neue Modulabnahme |

Invalidierung ist hier **State-/Factsinvalidierung**, keine Löschung alter Reports. `ArtifactCheckpointRecorder.artifacts` und `StageExecutor.#priorArtifacts` behalten frühere Artefakte; Sourceverbraucher wählen ausdrücklich die höchste Attemptnummer. Die ursprüngliche Modulbase benötigt gerade das älteste Implementationartefakt (C6/C23/C24). Daher wäre pauschales Löschen aller Altartefakte keine geeignete Ursachenbehebung.

## Befunde

### PCR-IMPLEMENTATION-001 — Erzeugter Worktree erreicht Forge nicht

- **Hoch; bestätigter Schnittstellendefekt; bestehende Kennung bewahrt.** Auslöser: Compilerworktree unterscheidet sich vom statischen OpenClaw-target.cwd.
- Beleg: C1 `compileProject:115–119` und C2 `createWorkspace/dispatchImplementation:10–30` erzeugen und verwenden den dynamischen Worktree; C3 `buildRequest:37–72` überträgt ihn nicht; C4 `spawnSession:207–224` startet mit statischem cwd.
- Auswirkung: Forge schreibt außerhalb des beabsichtigten Worktrees oder kann dort nicht arbeiten; anschließender Gitcommit im erzeugten Worktree scheitert bzw. fremde Workspaceänderungen bleiben zurück. Reparaturpfade erben denselben Fehler.
- Ursachenbehebung: ein autorisierter, run-/leasegebundener Workspacevertrag von Erzeugung über Runtimecwd bis Commit/Merge; keine freie ungeprüfte CWD-Eingabe und kein Prompt zum Erraten des Pfades.
- Geeignete Verifikation: zwei unterschiedliche Compiler-Modulworktrees über den Original-OpenClaw-Spawnpfad; tatsächlich gestartetes cwd, reale Schreibpfade und integrierter Gitdiff müssen übereinstimmen; fremde Roots/Runidentitäten müssen scheitern. Nicht ausgeführt.

### PTR-T05-001 — Compilerbudget verhindert mehr als eine Modulreparatur insgesamt

- **Mittel; bestätigte Zielbild-/Compilerabweichung mit deterministischer statischer Ableitung.** Kein Fehler der Budgetprüfung selbst: sie setzt die vom Compiler gelieferten Grenzen korrekt durch.
- Auslöser: Nach einer erfolgreichen initialen Implementation und einer erfolgreichen Reparatur findet eine nachfolgende Prüfung einen weiteren reparierbaren Fehler. Auch zwei verschiedene Reviewer teilen faktisch dasselbe Forgebudget.
- Codebeleg: C1 Zeile 112 gibt jedem Stage maxAttempts=2/maxRemediationCycles=2; C9 Zeilen 117–120 zählen **jeden** Ausgang einschließlich passed; C10 Zeilen 45–51 erhalten attemptsUsed; C12 Zeilen 118–123 verweigern F3. C9 Zeilen 80–87 blockieren außerdem schon die zweite request_fix-Antwort desselben Requesters, wenn dessen zweiter Attempt verbraucht ist.
- Konkrete statische Ableitung: F1 passed→F.attemptsUsed=1; L1 request_fix; F2 passed→F.attemptsUsed=2; L2 passed; E1 request_fix→erneut F pending; Scheduler vor F3 sieht 2>=2→core.attempt_budget_exhausted→run.blocked. Noch kein Busterlauf. Die deklarierte maxRemediationCycles=2 ist auf diesem Weg nicht voll nutzbar.
- Der Compiler setzt auch kein `orchestratorAfterAttempt`; außerdem führt der request_fix-Erschöpfungspfad direkt stop aus, nicht request_orchestrator. Ein blockierter Run ist daher nicht automatisch ein persistierter Needs-Nova-Wait. Spätere administrative Wiedereröffnung ist ein eigener, hier nicht behaupteter Pfad.
- Ursachenbehebung: fachlich festlegen, ob Budgets pro Candidate, Prüfer oder Modul gelten; Compilerbudget für Implementation und obligatorische Wiederprüfungen aus dieser Policy ableiten bzw. konfigurierbar validieren. Bestehende monotone Sicherheitszähler nicht einfach bei jeder Invalidierung auf null setzen. Eine explizite, autorisierte Nova-Entscheidung bei Erschöpfung vorsehen, falls gewünscht.
- Geeignete Verifikation: echten **Compileroutput** im Original-Runner durch Lintfehler→Echofehler→Busterfehler führen, Budgets und erneute Revisionen nach jedem Schritt prüfen; eigener Test für zweiten Fehler erst in wiederholtem Lint. Ausbleibende Tests/Suiteausführungen müssen sichtbar bleiben. Nicht ausgeführt.

Konkrete Zählerableitung für T05-D; A bezeichnet attemptsUsed, R remediationCyclesUsed. Die Werte sind aus dem Reducer abgeleitet, nicht gemessen:

| Nach Ereignis | F A/R | L A/R | E A/R | B A/R | Nächster Zustand |
|---|---|---|---|---|---|
| Initialisierung | 0/0 | 0/0 | 0/0 | 0/0 | F1 bereit |
| F1 passed | 1/0 | 0/0 | 0/0 | 0/0 | L1 bereit |
| L1 request_fix | 1/0 | 1/1 | 0/0 | 0/0 | F pending, L waiting |
| F2 passed | 2/0 | 1/1 | 0/0 | 0/0 | L2 bereit |
| L2 passed | 2/0 | 2/1 | 0/0 | 0/0 | E1 bereit |
| E1 request_fix | 2/0 | 2/1 | 1/1 | 0/0 | F pending, L pending, E waiting |
| F3 vor Dispatch verweigert | 2/0 | 2/1 | 1/1 | 0/0 | F blocked, Run blocked; kein neuer Attempt gestartet |

Das Beispiel zeigt auch: Forges remediationCyclesUsed bleibt 0, weil **Requester** L/E die Reparaturzyklen zählen. Das erschöpfte Targetbudget ist ein separater Zähler. Selbst eine einzelne administrative F3-Freigabe würde das bereits verbrauchte Lintbudget nicht automatisch erneuern; administrative Weiterführung wird im Eskalationstrace separat geprüft.

### Bekannte Querschnittsbefunde und getrennte Beobachtungen

- **PCR-EXEC-002** aus `nova.execution`: Crashfenster nach attempt.completed vor artifact.created kann einen erfolgreichen Stagezustand ohne normale Resultartefaktprojektion zurücklassen. T05 schreibt Implementationartefakte ohne `checkpoint:true`; C2 97–101, C23 34–49 und C24 23–43 zeigen die betroffenen Grenzen. Der weitere Sourceverbraucher C6 blockiert dann ohne Artefakt. Keine neue Dublette und keine eigene Crashreproduktion.
- **PCR-RUNTIME-001** aus dem zentralen Register: Runtime-Sessioncleanup nach Elternabbruch ist nicht als sicher erfolgreich anzunehmen. C4 260–286 und `openclaw-session.ts:200–210` zeigen best-effort Cancellation. Für T05 wird keine Garantie behauptet, dass ein abgebrochener Forgeprozess nicht später noch Dateien verändert.
- **Diagnosegrenze, kein zusätzlicher bestätigter Defekt:** Nativer Busterfailed-Handoff an Forge enthält Decision/Knoten-Kurzgründe, nicht die importierten vollständigen Logs. Die Möglichkeit, daraus ausreichend zu reparieren, hängt vom konkreten Fehler und weiteren autorisierten Lesepfaden ab. Das Komponentenreview `kubeclaw.buster-quality-gate` nennt dieselbe Grenze. Empfehlenswert ist ein begrenzter digestgebundener Evidencezugriff statt bloßer Logduplikation im Prompt.
- **Implementiertes Schutzverhalten:** Nach Echo-/Buster-Reparatur wird Lint erneut erzwungen; vorhandener Echopass wird nach Busterreparatur ungültig. Unter erfolgreicher Persistenz verhindern Graphabhängigkeiten, dass die alten Freigaben den neuen Candidate passieren lassen. Keine Pflichtlintlücke in diesem Compilerpfad festgestellt.

## Duplikate, verspätete Ergebnisse und Unterbrechungen

Der StageExecutor hat eine aktive Lease je Attempt, bildet Invoke-IDs aus Run/Stage/Attemptnummer/Sequenz und revoke/abort am Abschluss (C23). OpenClaw bildet zusätzlich stabile Dispatch-/Sessionkennungen und prüft Abschluss/Modell (C4); Quelle der angenommenen Completion ist die konfigurierte Runtime, nicht eine im Modelloutput frei gewählte Run-ID. Das beweist keine globale Exactly-once-Eigenschaft.

Bei Fehlern zwischen Worktreecreate/Dispatch/Commit/Merge hält der Implementationstage nicht bestätigte Arbeit zurück und liefert blocked; kein automatischer normaler Forge-Retry bei ungewissem Ausgang. Wenn Merge bereits erfolgt ist, Completionwrite oder Resultprojektion aber noch fehlen, kann der Repositoryzustand dem Core voraus sein. Git-/Effektreconciliation gehört zum separaten Recoverytrace; hier ist die Blockierungs-/Beleggrenze dokumentiert. Erhaltene Worktrees nach Cleanupfehler können die Wiederanlage desselben Namens beim nächsten Repair scheitern lassen; deshalb setzt der bedingte erfolgreiche Repairpfad erfolgreiche vorherige Cleanupoperation voraus.

Ein doppelter identischer Artefaktrecord wird von C24 dedupliziert, Konflikte derselben Artifact-/Attemptidentität werden abgewiesen. Die Remoteimportseite C20 akzeptiert Wiederimport nur bei gleichem Job/Request/Result/Decision/Evidence und prüft finale Attemptidentitäten. Alte Reports sind weiterhin lesbare Historie, erhalten aber durch ihre Existenz keine neue Stagefreigabe. Journal-Replay bei jedem einzelnen Schreibpräfix wurde hier nicht ausgeführt; PCR-EXEC-002 bleibt relevant.

## Tatsächlich ausgeführte Prüfungen und Tests

**Ausgeführt:** ausschließlich Lesen des Originalcodes am festgehaltenen Commit, Gegenstellenvergleich, Lesen der drei genannten Komponentenreviews und des zentralen PCR-Registers, manuelle statische Ableitung der vier Varianten und der Zählerstände. Keine Codeausführung, keine Tests, keine CI, kein Gitmutationsbefehl, kein Deployment. Nur diese Reviewdatei wurde geschrieben.

**Gelesene Tests, sämtlich NOT RUN:**

| Testdatei | Relevante Zeilen / untersuchte Aussage | Aussagegrenze |
|---|---|---|
| `tests/verification/reliability/lifecycle.test.mts` | 17–20, 31–58: realer Recorder/Journal, Echo-Repair invalidiert Lint, Graph wählt erneut Lint | Testdefinition hat maxAttempts=8, nicht Compilerwert 2; feste Resultobjekte, kein Forge-/Echo-/Busterlauf |
| `skills/nova/plugins/implementation-agent/tests/live-function.test.ts` | 19–39, 88–143: HTTPfixture, echte Gitintegration, Cleanupfehler, verlorene Antwort | workerWorkspace wird in 99/125 außerhalb des Dispatchvertrags gesetzt; bestätigt gerade nicht produktive cwd-Übergabe |
| `tests/verification/contracts/check-project-compiler.mts` | 35–71, 110–116: Modulscope, Source-Stage, Repairkanten, Compile-CLI | Explizit executedStages=0; kein Nachweis mehrerer Reparaturzyklen |
| `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts` | 8–20: Schemagrenzen gegen caller-owned Erfolgsevidenz | Schematest; keine deterministische Suite und kein Testagent wird ausgeführt |

Historische „bestanden“-Aussagen aus Komponentenreviews wurden nicht erneut bestätigt. Die dort beschriebene fehlgeschlagene Remoteproviderprobe ist ebenfalls keine eigene Ausführung dieses Traces.

## Offene Laufzeitnachweise und Ursachenbehebungsreihenfolge

1. PCR-IMPLEMENTATION-001 beheben und den dynamischen Workspace durch den tatsächlichen Runtimeweg nachweisen; ohne dies ist keine der Modulfolgen produktiv bewiesen.
2. PTR-T05-001 fachlich entscheiden und Compiler-/Retrypolicy konsistent machen; dann wiederholte Fehler über mehrere Prüfer und verpflichtende Wiederprüfungen mit Compileroutput prüfen.
3. PCR-EXEC-002 und externe Commit-/Merge-/Resultfenster schließen; per echten Prozessunterbrechungen belegen, dass Sourceartefakte, Revisionsauswahl und Freigaben nach Resume konsistent sind.
4. Reale Lintfehler, verifizierte Echoblocker und reale Modulproviderfehler jeweils einmal reparieren lassen; nach jedem Repair tatsächliche R2/R3/... an Lint/Echo/Buster und finalem Modulstatus vergleichen. Volle Busterlogs nur über autorisierte, digestgebundene Lesepfade zugänglich machen, wenn die Kurzentscheidung nicht genügt.

Offen bleiben echte Runtimecwd-/Mountparität, tatsächliche Forge-Reparaturqualität, reale Echo- und Buster-Agententscheidungen, komplette Suite-/Workerprozesse und Crash-/Cancellationnachweise. Diese Offenheit ist kein weiterer ausgeführter Fehllauf. Der statisch betrachtete Endzustand einer einzelnen erfolgreichen Reparatur ist nachvollziehbar; der gewünschte kombinierte Reparaturlauf ist am geprüften Compilerstand konkret blockiert.
