# kubeclaw.implementation-agent

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verwendung und Grenzen

Manifest implementation / kubeclaw.agent.implementation → src/stage.ts, aktiv
im Projectcompiler pro Modul. Protokoll, Repairoverride und Gitworktreeintegration
sind plugin-owned; Agentlauf/Gitoperationen/Store sind Capabilities. Alle drei
Sourcefiles, Manifest, Input-/Config-/Resultschemas, README, Pakettests und
separate repair-evidence-Regression gelesen.

## 2. Verträge und Gegenstellen

Stage überschreibt runId/attempt aus Corelease, moduleId/task/headBefore sowie
optionale Workspaceparameter stammen aus Graph. Compiler erzeugt individuellen
Worktree je Run/Modul. Gitadapter create liefert reale Baserevision;
commit/merge liefern neue sourceRevision, die SDK resolveSourceRevision und
Lint/Review/Quality konsumieren. Completion verlangt ready_for_testing oder
blocked, Summary, geänderte Pfade, Checks und Runtime-Sessionevidenz. ready
verlangt completed Session und erfolgreiche Checks; blocked verbietet
widersprüchliche erfolgreiche Evidenz. Gegenstelle Runtimeinput übernimmt
**Worktree nicht** (PCR-IMPLEMENTATION-001).

Repairrequest muss Zielstage, Requesterstage, Generation, request_fix und
rungebundene JSONrefs enthalten. Originale Artefaktinhalte werden mit Namespace,
Digest und Größenprüfung als Guidance geladen, nicht nur Pfadnamen weitergereicht.

## 3. Zustand und Nebenwirkungen

Repairprüfung → Worktreecreate → Dispatch → Commit geänderter Pfade → Merge ins
Zielrepo → Cleanup → Completionartefakt. Integration veröffentlicht vor den
nachfolgenden Lint/Review/Testgates. Worktree wird nur nach bestätigtem Merge
entfernt; bei ungewissem Ausgang bleibt er erhalten. Cleanupfehler erzeugt
separates immutable cleanup-Artefakt und wiederholt fertige Implementation nicht.

## 4. Korrektheit und Fehler

Workspace-/Dispatch-/Completionfehler werden blocked, EFFECT-Präfix gibt
reconciliation_required. Keine naive Wiederholung nach verlorener Antwort.
Mergeerfolg plus Cleanupfehler bleibt passed mit zusätzlichem Bericht, absichtlich.
Completion-Checks sind Agentenbehauptungen; tatsächliche Tests folgen unabhängig.
ChangedPaths-Parser ist nicht die letzte Pfadgrenze: Gitadapter validiert erneut.
Ohne Workspace kann passed ohne sourceRevision entstehen; revisionabhängige
Consumer müssen dies blockieren, Compilerroute nutzt immer Workspace.

## 5. Abbruch, Wiederholung und Konkurrenz

Corelease/Effects/Gitrunner begrenzen Aufrufe. Keine eigene Retryloop. Repair
beginnt bewusst bei HEAD; tatsächliche neue Worktreebase wird als headBefore
übernommen. Merge-/Repoparallelität außerhalb der Compilerlane bleibt Risiko
anderer Aufrufer. Cleanup läuft unter derselben Lease; abgelaufene Lease kann
Cleanup verhindern, Restworktree bleibt sichtbar. Agententerminierung ist
Runtimeadapterpflicht, nicht mit Promiseabbruch erledigt.

## 6. Wiederanlauf und Commitfenster

Zwischen create/dispatch/commit/merge liegen externe Actions. Bei Mergeantwort-
verlust darf Arbeit nicht gelöscht werden; vorhandene Resultreceipts/
Gitzustand müssen reconciliiert werden. Crash nach Merge vor Completionwrite
veröffentlicht Code ohne zugehöriges Completionartefakt. Core-/Effectsfenster
zentral in nova.execution/nova.effects. Im Plugin keine separate Recoveryengine.

## 7. Vertrauen

Agent/Workspaceroots/Commit/Merge/Artefaktnamespaces durch Grants. Handshake-
Sessiondaten müssen vom Runtimeadapter kommen, nicht autonomer Modellautorität;
HTTPworkerpfad vertraut entsprechend dem konfigurierten Workerendpoint.
Repairoptions sind core-owned und digestgebunden. ownedPaths stehen im
Compilerrequest als Aufgabenprosa und werden durch nachgelagerten Review geprüft;
der Implementationstageparser erzwingt keine eigene Ownershipprefixliste.

## 8. Limits und Aufräumen

512 geänderte Pfade je <=512 Zeichen, 128 Checks, Summary 8192; Repair maximal
32 Artefakte und gesamter JSONhandoff 256 KiB. Große/cross-run/korrupte Evidenz
blockiert vor Worktreecreate. Keine lokale Tempquote für zurückbehaltene
Worktrees: Opscleanup erforderlich. Node, Git, verfügbare Host-/Agentworkspaces,
Runtime und persistente Stores sind Voraussetzungen.

## 9. Architektur

Saubere Agent-vs-deterministische-Integrationsgrenze und Erhalt ungewisser
Arbeit sinnvoll. Fehlende Arbeitsverzeichnisübergabe verletzt aber die gesamte
Worktreeidee. Eine einzige autorisierte Workspaceidentität muss Erzeugung,
Agentlauf, Commit und Cleanup verbinden; kein Promptshim zum Erraten des Pfads.

## 10. Tests

`npm test` **bestanden**:
[Protokoll](../evidence/nova-batch-implementation-agent-tests.txt).
Original-HTTPserver erzeugt echte Datei, führt echten Nodeassertionstest aus und
liefert feste Completion/Transcriptdaten. Real-Gitcase bestätigt Commit/Merge,
locked-worktree Cleanupfailure und verlorene HTTPantwort → retain/no retry.
**Kein echter Forgeagent**: Test setzt workerWorkspace außerhalb des Requests.
`node --test tests/verification/reliability/repair-evidence.test.mts` **bestanden**
mit Originalartefaktstore, handverdrahtetem Context; echte Inhalte, tamper/cross-run/
Limitfälle. Originalbuilderprobe
`node docs/review/evidence/nova-batch-implementation-request-probe.mjs` bestätigt
fehlenden Worktree im Request. Kein behaupteter produktiver Agent-Ende-zu-Ende-Test.

## 11. Dokumentation

Plugin-README nennt Agent-/Gitdiff-/Recoveryparität offen; Project-README
beschreibt Worktreeworkflow detaillierter. **Unvollständig** zur tatsächlichen
Arbeitsverzeichnislücke und benötigter gemeinsamer Nova/Workerpfadidentität.
Cleanupbericht/Sourcerevision gehören in spätere Betriebsdokumentation.

## 12. PCR-IMPLEMENTATION-001 — Erzeugter Worktree erreicht Forge nicht

**Hoch; nachgewiesener Schnittstellendefekt durch beide Originalseiten.**
`src/stage.ts:10–30` erzeugt input.workspace.workspacePath und dispatcht
buildRequest; `src/protocol.ts:37–72` übernimmt weder Workspace noch dessen Pfad.
`runtime-dispatch/src/openclaw.ts:207–222` startet ausschließlich mit statischem
target.cwd. SDK runtime-agent-task.ts erklärt dieses Runtimecwd zusätzlich als
einzigen mutierbaren Workspace. Compiler erzeugt dagegen wechselnde Pfade.
Auslöser: reguläres Compilerprojekt mit target.cwd ungleich modularem Worktree.
Auswirkung: Forge arbeitet am falschen Ort oder kann seinen erzeugten Worktree
nicht bearbeiten; nachfolgender Commit im leeren Worktree scheitert, ggf. werden
Dateien im statischen CWD geändert. Live-Test verdeckt dies durch externe
workerWorkspace-Zuweisung, nicht durch tatsächlich übertragene Identität.
Rootfix: typisierte, root-/leasegebundene Workspacereferenz im Dispatchvertrag,
Runtime validiert und setzt tatsächliches CWD; Source-/Commit-/Mergegrenzen nutzen
dieselbe Referenz. Kein ungeprüfter freier caller-CWD. Regression: zwei echte
Compilerworktrees über Original-OpenClawgatewaypfad; Spawnpayload muss den jeweils
autorisierten Pfad enthalten, Agent/Worker schreibt ausschließlich dort und
Originalgit integriert exakt diese Datei. Negative fremde Root-/Runfälle ergänzen.
