# T10 — Nur Lint, deaktivierte Echo-/Testagent-Prüfungen und minimale Abschlüsse

## Prüfstand, Szenario und Ergebnis

Geprüfter Codecommit: **`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle folgenden Codebelege beziehen sich darauf. Statischer Trace; keine Tests, CI, Agentjobs oder Deployments ausgeführt. Ein hier nachvollzogener Abschluss ist kein bestandener Laufzeit-/E2E-Test.

Ausgangszustand: ein Modul besitzt Task, Ownership, Anforderungen und Forgekonfiguration. Gewünschte Variante ist Implementierung → verpflichtendes Lint → Abschluss, ohne optionalen Echo-Review und ohne Testagent. Zusatzvarianten: nicht anwendbare Tools, fehlendes erforderliches Tool, fachlicher Lintfehler → Forgerückgabe → reparierter Commit → erneutes Lint; optionales Pre-check statt Full; ausschließlich Deliverylint.

**Ergebnis:** Nach jedem Modul ist Full-Lint im Projectcompiler tatsächlich unabhängig vom Echo-Stagecode verdrahtet und liegt vor Echo. Der Compiler unterstützt jedoch weder Echo-off noch Test-Agent-off noch einen Lint-only-Modus. Der explizite Graphentrypoint unterstützt einen Graphen mit ausschließlich Implementierung und Lint; dort muss dessen Autor die Dependencies und Sourcebindung ausdrücklich setzen. Keine globale Corepolicy erzwingt Lint vor jeder beliebigen Reviewstage. „passed“ bedeutet außerdem nicht zwingend, dass mindestens ein natives Tool erfolgreich ausgeführt wurde.

## Abdeckung und Konfigurationsvarianten

| Variante | Projectmodus | Expliziter Graphmodus | Status/Beleg |
|---|---|---|---|
| Full-Lint nach jedem Modul | Immer erzeugt | Explizit zu deklarieren | Compiler 113–131; Lintmanifest 20–32 |
| Echo deaktiviert | Nicht unterstützt | Reviewstage weglassen oder zulässige Activation verwenden | Compiler 60,78,122–126; Core graph.ts 45–46 / pipeline-loop.ts 86–115 |
| Testagent deaktiviert | Nicht unterstützt | Teststage weglassen; deterministische Spezialstages unabhängig wählbar | Compiler 81–89,127–131 |
| Nur Lint nach Forge | Nicht unterstützt | `implement-m → lint-m`, Ende nach Lint möglich | Core CLI 55–74 und pipeline-loop.ts 137–143 |
| Pre-check statt Full | Compiler setzt Full fest | Registrierung `kubeclaw.lint.pre-check` | Compiler 120; lint/plugin.json 5–18 |
| Experimental Tools sichtbar | Compilerlintconfig nimmt nur policyPath/policyProject | includeExperimental boolean vorhanden | Compiler 79–80; lint/schemas/config.schema.json 5–10 |
| Debt sichtbar | Wie oben, kein Projectfeld | includeDebt boolean vorhanden; keine Wiederaktivierung baselinierter Fehler | gleicher Vertrag; engine/report.ts 113–123 |
| Deliverylint allein | Nicht erzeugt | Eigenständige Stage; kein Full-Lint-Ersatz | delivery-lint/src/stage.ts 104–146 |
| Kein anwendbares Tool | Stage kann passed zurückgeben | Gleiches Verhalten | lint/report.ts 162–201; tool-summary.ts 1–25; stage.ts 24–53 |

Diese Tabelle unterscheidet unterstützte Graphmöglichkeiten von tatsächlich vorhandenem/deploytem Produktgraph. Für den minimalen expliziten Graph werden im Trace passende Registrierungen/Grants, echte Git-/Artifactprovider und verfügbare Toolchain vorausgesetzt; ein erfolgreich ausgeführter solcher Run wird nicht behauptet.

## Übergangsfolge mit Aufrufer, Empfänger und Rückweg

### 1. Auswahl des Entrypoints und erste Bruchstelle

`skills/nova/project/cli.ts:19–26` akzeptiert Project-/Platform-/Compile-/Recover-/Signaloptionen und ruft `compileProject` auf. `skills/nova/project/compiler.ts#compileProject:46–60` akzeptiert geschlossene Projekt-/Modulobjekte. Eine erfundene Eigenschaft `skipReview`, `lintOnly` oder `testAgent:false` wird nicht still ignoriert. `review` muss Objekt mit nichtleerem agent sein (78); `test.agent` wird über den Agentparser gefordert (81–82); der Testplan braucht wenigstens einen ungeskippten blockierenden Test (84–89). Fehlende review/test-Konfiguration erreicht deshalb keine Modulausführung. **Erste Bruchstelle der angefragten Projectvariante ist die Eingangsvalidierung.**

Konditionale Fortsetzung: Ein expliziter `pipeline-definition.v2` mit Implementierungs- und Lintstage wird über `skills/nova/core/cli.ts:55–60` geladen und `runPipelineV2` übergeben; dieser Weg verwendet nicht den Projectcompiler. `core/execution/graph.ts#ExecutionGraph.ready:45–46` schedult vorhandene Stages nach Dependencies, ohne Forge/Echo/Testnamen fest einzubauen. Der Graph muss z.B. Lint dependsOn implement und on.request_fix implement setzen. Eine vorhandene Echo-/Teststage wegzulassen ist dort eine Graphentscheidung, kein im Projektmodell unterstützter Schalter.

### 2. Forgeabschluss → Sourceartefakt → Lintbereitschaft

Compiler erzeugt `implement-<id>` mit runId/moduleId/headBefore und Workspace, anschließend `lint-<id>` vom Typ `kubeclaw.lint.full`, abhängig ausschließlich vom Implementierungsabschluss, mit `{workingDirectory:repository, project:projectId, sourceStageId:implementationId}` und `on.request_fix:implementationId` (`compiler.ts:103–121`). Echo wird erst **danach** abhängig von Lint erzeugt (122–126). Das beweist den gewünschten Lintzeitpunkt im tatsächlich generierten Projectgraphen.

`skills/nova/plugins/implementation-agent/src/stage.ts#execute:67–100` überschreibt runId/attempt aus der Corelease, führt Dispatch/Integration aus und schreibt `implementation:<moduleId>:<attempt>`. Der Bericht besitzt status, sourceRevision des Mergeergebnisses und headBefore; ready_for_testing ergibt passed (119–122). `integrateWorkspace:33–46` committet changedPaths und mergt die Workspacebranch, deren zurückgegebene 40-stellige Revision geprüft wird. **Bekannter vorgelagerter Blocker PCR-IMPLEMENTATION-001:** der erzeugte Workspace wird nicht im Agentrequest als Arbeitsverzeichnis übertragen; für diesen Teiltrace wird ein echter gültiger integrierter Implementierungsabschluss ausdrücklich vorausgesetzt. Seine fehlende Lauffähigkeit wird nicht durch die Lintanalyse geheilt.

`skills/common/plugin-runtime/sdk/src/source-revision.ts#resolveSourceRevision:29–38` verlangt genau revision oder sourceStageId, wenn aufgerufen. Bei Sourceartefaktwahl filtert `implementationArtifacts:5–8` aktuellen Run, Producerstage und Namespace; der höchste Attempt wird eindeutig gewählt. `readImplementation:17–26` liest exakt Digest/Bytegröße, prüft JSONhash und ready_for_testing/Revision. Core liefert nur Artefakte eigener und transitiver Vorgängerstages (`core/execution/stage-executor.ts#priorArtifacts:96–105`). Somit führt ein neues Forgeartefakt nach Reparatur zu einer neuen ausgewählten Source-Revision.

Wichtige explizite Graphvariante: `lint/schemas/input.schema.json:5–6,57–75` fordert nur workingDirectory und verbietet gleichzeitige sourceStageId/revision; **beide fehlen zu lassen ist erlaubt**. `lint/src/stage.ts#execute:61–62` überspringt dann den Resolver. Ein solcher Aufruf lintet den lebenden Arbeitsbaum; daraus folgt keine Commitgleichheit zu einem früheren Forgeergebnis. Der Projectcompiler setzt sourceStageId immer und fällt nicht in diese Variante.

### 3. Lintstage → Adapter → isolierter Kandidat

`lint/src/stage.ts#execute:63–82` sendet `lint.execute/run_report`, resource `lint.project` mit Projekt oder Arbeitsverzeichnis und Payload aus workingDirectory, sourceRevision, policyPath/policyProject, tier sowie optionalem Scope/Kubernetes-/Visibilityinput. Kein Agentdispatch erfolgt; dies ist ein lokaler privilegierter Adapter. `lint/plugin.json:5–46` registriert Pre-check, Full und Executor separat.

`lint/src/adapter.ts#activate:61–81` prüft Fence/Abbruch am Eintritt, Capability/Operation, realpath-basierte Repository-/Policyroots und optionale SHA-Revision. `withLintCandidate` aus `candidate.ts:7–19` erzeugt temporären Sharedclone, checkt die explizite Revision detached aus, prüft HEAD und entfernt das Verzeichnis im finally. Die Gitcalls deaktivieren Hooks. Unversioniert arbeitet die Engine stattdessen direkt im freigegebenen workingDirectory. Rückgabe ist `{report,sourceRevision?}`; Stage vergleicht dieselbe Source-Revision (stage.ts 83).

### 4. Toolauswahl, tatsächliche Ausführung und Nichtanwendbarkeit

`lint/src/engine/index.ts#executeLintReport:77–128` lädt kanonische Policy, Projekt, Targetpfade und Discovery, normalisiert Scope, setzt Policy-/Config-/Baselineinformationen und baut Registry. `tool-registry-core.ts#buildToolRegistry:113–133` verlangt für konfigurierte Tools einen Adapter und für jeden registrierten Adapter kanonische Policy; einfach alle Toolobjekte aus einer Policy zu löschen ist kein gültiger Disableweg. Die Detectfunktion verbindet deklarierte Sprachen mit Adapterdetect.

Die ausgelieferte `charts/kubeclaw/files/config/lint-policy.json` ist Policy v7 mit Projekt workspace (1–26); Beispiele für explizite required/tier/scope sind tsc (276–297), go-vet (319–343), eslint/full (441–473), hadolint/full (768–789). Das belegt Konfiguration, nicht Toolinstallation oder erfolgreichen Lauf. Die Stageconfig hat policyPath/policyProject als Pflicht und nur includeDebt/includeExperimental als weitere booleans (`lint/schemas/config.schema.json:4–10`); es gibt dort keinen Echo-/Test-/Lintskip-Schalter.

`engine/report.ts#applicableTools:162–168` filtert Tier, blocking/experimental und detect. Full schließt Pre-check-Tools ein, garantiert jedoch nicht jedes registrierte Tool unabhängig von Anwendbarkeit. `executeTools:176–183` führt die ausgewählten Tools sequenziell aus. `runTool:135–159` erkennt leeren geänderten Scope als not_applicable, prüft Binaryverfügbarkeit, ruft den wirklichen Adapter aus der Registry auf und normalisiert Findings. `engine/execution.ts#safeExec:83–113` verwendet native `execFileSync` mit Tooltimeout/Outputbudget, kein LLM und kein Mock.

Nichtanwendbarkeit ist von Toolfehler getrennt: fehlt ein optionales Binary, not_applicable; fehlt ein required Binary, error (`report.ts#missingBinaryResult:108–111`). Experimentalfindings zählen nicht als blocking; eingeschaltete experimentelle Toolausführungsfehler zählen aber weiter als tools_failed (113–128; tool-summary.ts 14–25). Baselinefindings werden von aktiven Counts abgezogen; includeDebt ändert die sichtbare Liste, nicht ihre Blockingwirkung.

### 5. Report → Artefakt → Entscheidung

`runAllTools:198–234` erzeugt vollständigen Bericht mit Policy-/Config-/Baseline-Digests, Scope, Tier, Tools, Diagnostik und Summen. `report-contract.ts#validateLintReport:223–231` prüft vollständige Struktur und konsistente Summen; ein beliebiges `{summary:{total_blocking:0}}` genügt nicht. Die optionale expectedToolIds-Prüfung greift nur bei übergebenem Erwartungsinventar (`validateToolInventory:198–202`); aktuelle Stagecalls übergeben keine zusätzlichen Erwartungen.

Die Lintstage schreibt unter Namespace kubeclaw.lint die ID `lint:<tier>:<project>` als JSONartefakt; Source-Revision wird bei versionierter Auswahl mit aufgenommen (`stage.ts:83–91`). Resultprojektion bindet Producer an Run/Stage (`core/execution/run-decisions.ts:48–54`); der Core speichert zuerst Attemptresult, danach Artefakt-/Lifecycleprojektion. **PCR-EXEC-002** bleibt deshalb ein Crashfenster für diese Evidenceweitergabe.

`lint/src/stage.ts#resultForReport:24–53` entscheidet in folgender Reihenfolge:

| Bericht | Stageoutcome | Nächster tatsächlicher Schritt |
|---|---|---|
| tools_failed > 0 | blocked, lint.tool_execution_failed | Core stoppt Run; kein automatisches Forgefix |
| Kein Toolfehler, total_blocking > 0 | request_fix, lint.blocking_findings | Deklarierte Remediation zu Forge |
| Keine aktiven Blockingfindings/Toolfehler | passed | Nachfolger bereit, oder Minimalgraph beendet |
| Alle Tools not_applicable / kein Tool ausgewählt | passed, sofern sonst valider Bericht | Kein Mindestwert tools_ok; Toolcoverage muss separat betrachtet werden |
| Report-/Artifact-/Policy-/Quellfehler wirft | Core retry bzw. spezielle Blockdisposition | Budget-/Effectregeln des Core; kein erfundener erfolgreicher Report |

Die letzte Nichtanwendbarkeitsvariante folgt aus `tool-summary.ts#createToolSummary:1–12`, Akkumulation 14–25 und der Ergebnisprüfung ohne tools_ok-Schwelle. Sie wird als **eingeschränkte Erfolgsaussage**, nicht ohne weiteren Produktvertrag als neuer Defekt gewertet. Ebenso gilt „alle Tools im Full-Tier bestanden“ nur für tatsächlich ausgewählte/ausgeführte Tools.

### 6. Fachlicher Fehler → Forge → neuer Commit → erneutes Lint

Core `lifecycle/reducer.ts#requestFix:80–88` braucht on.request_fix und ausreichendes Attempt-/Remediationbudget. `run-decisions.ts#remediate:69–79` erzeugt durable repairRequest einschließlich ursprünglichem StageResult und Artefaktrefs. `lifecycle/remediation.ts#repairRequest:13–34` ermittelt betroffene Descendants; `applyRepair:38–51` invalidiert facts, waits und guidance der Folgeprüfungen und übergibt Forge neue repairRequest-Guidance. Alte Echo-/Testfreigaben werden bei diesem **normalen** Reparaturpfad nicht unverändert wiederverwendet.

`implementation-agent/src/repair-evidence.ts#repairEvidence:7–45` verlangt coreseitige Requeststruktur, korrektes Ziel, Requester/Runbindung, höchstens 32 JSONartefakte und insgesamt begrenzte Evidenz. Es liest jedes Reportartefakt mit Digest-/Größenprüfung und serialisiert Request+Evidence. `implementation-agent/src/stage.ts:23–30,78–83` übergibt diese Evidenz als Helfertext im tatsächlichen Forgepayload; dies fordert LLM-Reparatur, garantiert deren fachlichen Erfolg nicht. Ein Lintreport, der das Reparaturevidencebudget überschreitet, blockiert diesen Weg geschlossen; keine Kürzung mit stiller Beibehaltung einer vollständigen Evidenzbehauptung.

Nach Integration entsteht Implementierungsartefakt Attempt2/sourceRevision C2. `run-decisions.ts#completeRemediation:124–129` setzt Lint erneut pending. Der Source-Resolver selektiert C2, `withLintCandidate` checkt C2 aus. Ein zweites fachliches Ergebnis wird neu ausgewertet. Im Projectcompiler sind maxAttempts=2 und maxRemediationCycles=2 fest (compiler.ts 112); die zweite misslungene Lintbewertung erschöpft damit bereits das Attemptbudget, selbst wenn der deklarierte Remediationzähler nominal mehr suggeriert. Ein unmittelbarer Needs-Nova-Schritt ist hier nicht konfiguriert: orchestratorAfterAttempt fehlt. Terminaler Block benötigt eine ausdrückliche administrative Entscheidung; Details im Retry-/Resume-Trace.

### 7. Abschluss mit und ohne optionale Prüfungen

Im Originalproject folgt nach bestandenem Lint immer Echo und anschließend Teststage (compiler.ts 122–131), danach nächstes Modul über previousGate (132). „Lint-only fertig“ wäre dort eine falsche Erfolgsmeldung.

Im expliziten Minimalgraphen ohne Echo/Test sind nach Implementation und Lint alle aktiven Ordinary-Stages succeeded; `core/execution/pipeline-loop.ts#finalize:137–143` schreibt run.succeeded. CLI gibt Run-/Stagezustände aus und Exit0 nur für succeeded (`core/cli.ts:69–74`). Keine Projectsummary, Anwendungsexposure oder Operator-Testumgebung entsteht aus diesem Minimalgraph automatisch. Dies ist ein Abschluss des konfigurierten Graphs, kein Funktions-/E2E-Nachweis der Anwendung.

Bei optionalen Graph-Activationbedingungen gilt: `pipeline-loop.ts#shouldSkip:105–108` prüft Object.is auf einem Vorgängerfact; bei Nichttreffer wird Stage skipped (110–115). Skipped zählt als completed (86–88). Wer Echo nur aktivierungsbedingt überspringt, muss den nachfolgenden Graphzustand bewusst definieren. Der Core fügt keine globale „Lint muss vor beliebigem Echo stehen“-Kante hinzu; im Projectcompiler besteht die richtige Kante explizit.

## Full-Lint versus Deliverylint

`skills/nova/plugins/delivery-lint/src/stage.ts#execute:104–146` konsumiert `{moduleId,dockerfile,staticPath}` (Schema 5–19). Bei dockerfile=null schreibt es sofort einen Passedreport. Sonst liest es eine Repositorydatei via git.repository.read und prüft mit COPY-Zielparser den statischen Pfad. Es startet weder tsc/ESLint/Hadolint noch die Full-Lintregistry; eine fehlende Dockerfile oder Zielabweichung fordert request_fix, ungültiger Pfad blocked. `copyDestinations:33–38` besitzt den vorhandenen **PCR-DELIVERY-001** für JSON-COPYsyntax. Diese schmale Lieferprüfung ersetzt keine allgemeine Source-Lintprüfung und ist ebenfalls kein Build-/Serve-/E2E-Test.

## Findings, vorhandene Kennungen und Maßnahmen

### F-T10-01 — Optionale Echo-/Testagentabschaltung fehlt im Projectmodell

**Mittel; statisch bestätigte Produkt-/Zielbildabweichung.** Trigger: gewünschte konfigurierte Lint-only- oder Echo-off-/Test-Agent-off-Projektvariante. Compiler 60,78–89 weist die Konfiguration zurück bzw. erzeugt die Stages stets (120–131). Folge: Nur ein manuell autorisierter expliziter Graph kann die gewünschte Variante ausdrücken; keine Behauptung eines unsicheren stillen Bypasses. Rootfix: Optionalität explizit im kanonischen Projektvertrag modellieren und Graphdependencies konsistent kompilieren, wobei Lint unverändert nach jedem Modul erzwungen bleibt. Verifikation: reale Compiler-/Graphprüfung für Echo on/off und Testagent on/off, Lintfehlresultat muss in jeder Variante nachgelagerte Freigabe/Abschluss verhindern. Deduplizierung mit Compileroptionalitätsbefunden anderer Traces erforderlich.

| Bestehende Kennung | Relevanz und hier nachgelesener Code |
|---|---|
| PCR-IMPLEMENTATION-001 | Vorgelagerter fehlender Workspace im Forgepayload; keine Heilung durch nachfolgendes Lint |
| PCR-LINT-001 | Generische Scope-/Targetsymlinkgrenze; Originalkomponentenreview gelesen, hier keine neue eigene Reproduktion |
| PCR-LINT-002 | Adapter reicht laufenden Abort nicht an Engine/Candidate weiter; adapter.ts 65–81, candidate.ts 7–19, execution.ts 83–113 |
| PCR-LINT-003 | Native Timeouterkennung nur error.killed; execution.ts 75–77,106–126; Diagnosefehler trotz geschlossenem Gate |
| PCR-DELIVERY-001 | Dockerfile-JSON-COPY wird durch einfachen Parser falsch interpretiert; delivery-lint/stage.ts 33–38 |
| PCR-EXEC-002 | Resultartefaktprojektion nach durable Attemptresult; relevant für Lintreport-/Reparaturevidenz |

Originale Eigentümerberichte: [kubeclaw.lint](../components/kubeclaw.lint.md), [delivery-lint](../components/kubeclaw.delivery-lint.md), [implementation-agent](../components/kubeclaw.implementation-agent.md), [nova.execution](../components/nova.execution.md). Der Lintkomponentenbericht am Reviewcommit `a9e080ab1e1981ec5713e9b742f94280835fd347` wurde gelesen. Historische fehlende shellcheck/shfmt/helm/kubeconform-Tools werden nicht als aktuelle Messung übernommen.

## Identität, Unterbrechungen und offene Runtimebeweise

Run/Stage/Attempt korrelieren Capabilityeffects; Sourceartefakte binden versioniertes Lint an den neuesten Forgecommit. Projektname im Report ist nicht allein die Identität: artifact.producer und Source-Revision bleiben wesentlich. Gleiche fachliche Lintartefakt-ID über Module/Attempts wird durch Producer/Digest unterschieden. Die Policy wird beim Lint geladen und ihr Digest berichtet; der Commitcandidate allein friert externe Toolchain-/Policydateien nicht für alle späteren Attempts ein.

Doppelte oder verspätete Ausführung unterliegt Corelease/Effectreceipts, doch native synchrone Tools begrenzen die tatsächliche Abbruchwirkung (PCR-LINT-002). Ein Crash vor Artefaktwrite kann Analysewiederholung erfordern; nach Attemptresult bleibt PCR-EXEC-002. Ein neuer Attempt ist nicht mit erneuter Ausführung desselben bereits receiptierten Effects gleichzusetzen. Abbruch/Resume der gesamten Pipeline und administrative Freigabe werden nicht als hier ausgeführt behauptet.

**Durchgeführt:** statische Aufrufer-/Empfänger-/Rückwegprüfung, Line-Reads von Compiler, CLI, SDK, Lintstage/Adapter/Candidate/Engine, Repair-/Implementationcode und Deliverylint; Policy-/Schemainhalte gelesen. **Tests nicht ausgeführt.** Inspektiert wurden `lint/tests/stage.unit.test.mjs:19–24` (unvollständige Reports ablehnen) und `lint/tests/adapter-boundary.test.mjs:44–72` (Rootablehnung, vorab abgebrochenes Signal, falsche Capability). Der Boundarytest nutzt handgebauten Context/Fence und prüft ausdrücklich keinen Abbruch während eines laufenden Tools. Kein Mock als E2Ebeweis gewertet.

Offen: echter Minimalgraph mit Originalforge und Toolchain; Lint-onlyabschluss bei aktivem/übersprungenem Echo; fachlicher Fehler mit zwei echten Gitrevisionen; passende tool-not-applicable-Policy samt klarer Coverageanzeige; native Timeout-/Abbruch-/Crashmatrix; physischer Artifact-/Effectstorefehler. Spätere Reihenfolge: Compileroptionalität klären, bestehende Forge-/Lint-Abbruchdefekte beheben, dann diese Varianten mit echten Tools und Git ausführen.
