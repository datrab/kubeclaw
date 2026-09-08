# T12 — Native Testentscheidung und nachgelagerter Test-Agent

Status: statischer Trace abgeschlossen, Orchestrator-Gegenprüfung ausstehend. Codebaseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Sämtliche Quellen-/Zeilenbelege unten gehören zu diesem Commit. Bestehendes Komponentenreview: `docs/review/components/kubeclaw.buster-quality-gate.md` am Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`, außerdem das dortige zentrale PCR-Register und bereits im T05 geprüfte Implementation-/Lifecycleberichte. Historische Testergebnisse werden nicht als Ergebnisse dieses Traces übernommen.

## Auftrag, Voraussetzungen und Endzustände

Ausgangszustand: Ein aktueller Implementationcandidate R liegt als gültiges, zum Run gehörendes Artefakt vor; vorgelagerter Pflichtlint und Review sind bestanden. Ein gültiger aufgelöster Testplan, dessen Grants, Repositoryroot, registrierter `test.plan.execute`-Provider und ein konfigurierter Quality-Agent liegen vor. Für die reguläre Projectcompilerroute ist dies eine bedingte Fortsetzung nach der in T05 dokumentierten ersten Bruchstelle **PCR-IMPLEMENTATION-001**. Es wird kein funktionsfähiger Forge-Worktree angenommen, ohne diese Bedingung offenzulegen.

Der Trace beginnt an `kubeclaw.test.quality-evaluation`, verfolgt die native Providerentscheidung, den nachfolgenden Agentdispatch, Rückgabe, Remediation und den zusätzlichen Summaryverbraucher im ausdrücklich konfigurierten Graph. Die verschiedenen Varianten sind jeweils Alternativen desselben Ausgangszustands, keine behauptete Folge real ausgeführter Tests.

| Variante | Native Entscheidung | Agent-/Transportvariante | Statisch abgeleiteter Endzustand |
|---|---|---|---|
| A | passed | Gültiger passed-Verdict | Quality passed, Decision+Verdict für R; Summary nur bei zusätzlicher Graphstage |
| B | passed | request_fix mit nichtleerem Fehlerbefund | Zurück zu Forge; Pflichtprüfungen neu; pass nur nach erfolgreicher Reparatur und erneutem Provider-/Agentpass |
| C | passed | blocked mit nichtleerem Fehlerbefund | Quality/Run blocked; keine automatische Forgereparatur |
| D | passed | Widersprüchlicher oder strukturell ungültiger Verdict | buster_quality.invalid_verdict → blocked, native Decision bleibt Ergebnisartefakt |
| E | failed | Beliebiges vermeintliches Agent-pass | Agent wird gar nicht aufgerufen; request_fix aus nativer Entscheidung |
| F | execution_error / review_required / cancelled | Agent konfiguriert | Kein Agentdispatch; blocked / blocked / cancelled |
| G | passed | Agentdispatch fehlgeschlagen, Session fehlt oder Timeout | Kein Quality-pass; externe Reconciliation bzw. Coretimeout/Abbruch |
| H | passed | Summary bekommt falsche Source/Digests oder unvollständiges Artefaktpaar | Summary blocked, kein Deliverymanifest |
| I | passed | Kein Quality-Agent gewünscht | Andere Produktionsroute ohne Qualitystage möglich; diese Stage und der Projectcompiler verlangen den Agent |

„Agent“ bedeutet hier die tatsächlich implementierte **Bewertung reduzierter Providerbelege**. Der Stagecode führt damit nicht automatisch explorative Anwendungstests eines Agenten gegen R aus. Providerknoten mit `reviewAgent` sind ein anderer Mechanismus; ein daraus entstehendes `review_required` wird in dieser Stage nicht abgearbeitet.

## Exakte Codebelege

| Kürzel | Pfad, Symbol und Zeilen | Aussage |
|---|---|---|
| Q1 | `skills/nova/plugins/buster-quality-gate/plugin.json:5–19`, Stage quality | Registriert quality-evaluation und benötigt Testplan, Runtime sowie Artefaktread/write |
| Q2 | `skills/nova/plugins/buster-quality-gate/src/stage.ts:6–48`, `execute` | Native Prüfung vor Agent, Artefaktfolge, Resultdisposition |
| Q3 | `skills/nova/plugins/buster-quality-gate/src/protocol.ts:1–42`, `buildRequest`, `parseVerdict` | Agentpayload, erlaubte Ergebnisse, Identitätsbindung und Widerspruchsprüfung |
| Q4 | `contracts/pipeline-test-gate/v1/src/gate-decision.ts:36–83`, `gateDecisionStageResult`, `parseGateDecision`, `gateDecisionEvidence` | Native Disposition, Digest-/Shapeprüfung, reduzierte Belege |
| Q5 | `skills/common/plugin-runtime/sdk/src/source-revision.ts:5–48`, Sourceauflöser | Aktueller Run/Implementationstage, frühester/spätester Attempt, geprüfte Artefaktbytes |
| Q6 | `skills/nova/plugins/remote-test-gate/src/adapter.ts:63–93`, `execute`; `skills/nova/core/test-gates/production.ts:61–74`, `ProductionNovaTestGate.execute` | Plan/Run/Grants/Root, Snapshot R und Produktionsjob |
| Q7 | `skills/nova/core/test-gates/remote-result-import.ts:100–160,169–208,226–268,285–314`, Importprüfung/Entscheidung/Persistenz | Native Job-/Plan-/Scope-/Attempt-/Digestautorität und Evidenceimport |
| Q8 | `skills/common/plugins/runtime-dispatch/plugin.json:7–34`; `src/openclaw-adapter.ts:6–22`, `activate` | Zwei registrierte Runtimeprovider; tatsächlicher Provider wird von Plattform gewählt |
| Q9 | `skills/common/plugins/runtime-dispatch/src/openclaw.ts:168–180,207–224,234–286`, `resultLocation`, `spawnSession`, `dispatchOpenClaw` | Deterministische Resultpfade/Sessions, statisches cwd, Modell-/Budget-/Abbruchprüfung |
| Q10 | `skills/common/plugins/runtime-dispatch/src/openclaw-session.ts:55–87,121–146,180–210`, Registrierung/Collector/Gateway/Poll/Cancel | Sessionzuordnung, vertraulicher HTTPtransport und best-effort Cancellation |
| Q11 | `skills/common/plugins/runtime-dispatch/src/openclaw-result.ts:26–31,48–59,80–123`, Evidenceattachment/Outputimport | Historischer anderer Protokollzweig, terminaler Output, lokale/Remoteergebnisse |
| Q12 | `skills/common/plugins/runtime-dispatch/src/adapter.ts:98–144`, `activate`; `src/dispatch-adapter.ts:25–32` | Alternative HTTP-Runtime, Signatur, Größen-/JSONgrenzen und Targetprüfung |
| Q13 | `skills/nova/core/execution/stage-executor.ts:34–91,117–140`, Attemptausführung | UUID/Lease, Capabilitiesequenz, Result-/Timeout-/Abbruchbehandlung |
| Q14 | `skills/nova/core/execution/adapters.ts:49–61`; `effect-recovery.ts:8–11`; `context.ts:40–51` | Capabilityautorität und fehlgeschlagener Runtimeeffekt → Reconciliation |
| Q15 | `skills/nova/core/effects/durable-invocation.ts:35–74,86–126`, DurableInvocation | Persistierte Effekte/Receipts, Gleichheitskontrolle, Recoverygrenze |
| Q16 | `skills/nova/core/lifecycle/reducer.ts:69–102,105–122`; `remediation.ts:13–51`; `skills/nova/core/execution/run-decisions.ts:69–80,121–135` | Ergebnis → Reparatur/Block/Pass, Invalidierung und Rückweg |
| Q17 | `skills/nova/project/compiler.ts:77–89,112–136`, `compileProject` | Pflichtagent, Modulscope, Repairziel und insgesamt vier Stages pro Modul |
| Q18 | `skills/nova/plugins/implementation-agent/src/repair-evidence.ts:7–47`, `repairEvidence` | Geprüfte Requesterartefakte für Forge |
| Q19 | `skills/nova/plugins/project-summary/src/summary.ts:17–68`, `buildSummary`; `src/stage.ts:3–10`, `execute` | Latest-Attempt-Decision/Verdict, Sourcebindung, Abschlussartefakt |
| Q20 | `skills/nova/core/test-gates/remote-gate-cli.ts:22–39` und `production.ts:61–74` | Produktionsaufruf ohne Quality-Agent, eigener Ergebnis-/Exitpfad |

## Übergangsfolge vom Caller bis zum Ergebnis

### Native Autorität und Identitäten

1. Der Projectcompiler erzeugt pro Modul `test-m` nach `review-m`, `config.agent=module.test.agent`, `input.gateId=test-m` und Providerplan mit `sourceStageId=implement-m`. Zuvor fordert er `plan.scope.moduleId=m, gateId=null`, Plan-Run/Projekt/Digest und mindestens einen blockierenden Test. Somit ist das Wort Gate in Quality-IDs **keine Aussage über kumulative Testabdeckung** (Q17).
2. StageExecutor bindet Ausführung an `runId`, `stageId`, UUID-attemptId und monotonen attemptNumber, mit Lease und Capabilitygrants. Der Qualitystage erhält die Agentkonfiguration und verweigert fehlenden/leeren Agent bereits vor Planaufruf. `providerPlan` ist ebenfalls Pflicht (Q1/Q2/Q13). Im Payloadinput sind frühere `runId`, `attempt`, `suiteEvidence` oder `suitePlan` nicht als alternative Autorität erlaubt; das Inputschema ist geschlossen.
3. Q5 wählt die höchste gültige Implementationattemptnummer im aktuellen Run/Source-Stage und verifiziert JSONdigest/Bytes/Status/SHA; alternativ ist in einem expliziten Graph eine feste `revision` zulässig. Beide Selektoren zugleich sind ungültig. Die Revision R wird in `test.plan.execute` geschrieben. Der registrierte Remoteprovider prüft Plan/Run/Roots/Grants, baut den committed Snapshot und Remotejob für R (Q2/Q5/Q6).
4. Die Buster-Rückgabe wird vor Qualityagentverwendung importiert: Status/jobId/requestDigest, resultDigest und Job/Plan/Run müssen passen; Knoten, finaler Attempt, Provider, Modul-/Gatescope und Suiteidentitäten werden mit dem Plan verglichen. Remote-Evidence wird mit Größe/Digest importiert und pending_evidence→complete persistiert (Q7). Eine digestgültige allein vom Modell erfundene Liste ersetzt diesen Provideraufruf nicht.
5. `parseGateDecision` prüft geschlossene Top-Level-Form, Knoten, Reviewrequests, Decisiondigest und Widersprüche eines passed-Zustands; ein fremder Run wird zusätzlich im Qualitystage abgewiesen (Q2/Q4). Die allgemeine Decision enthält kein direktes Source-Revisionfeld. Die Revisionautorität folgt hier aus dem in Q6/Q7 erzeugten und verifizierten Job und der Runtimecapability; der Digest allein beweist weder Herkunft noch Source. Q2 vergleicht nicht separat erwartete planId/jobId, sondern vertraut der ausgewählten Produktionscapability. Ein böswilliger Ersatzprovider wäre ein anderer Vertrauensfall, kein nachgewiesener normaler Busterpfad.
6. Quality schreibt zuerst `buster-quality:<gateId>:decision:<attemptNumber>` im Namespace `kubeclaw.buster-quality-gate`. Erst danach wird branchiert. `failed` ergibt request_fix mit failedNodes/decisionDigest; `execution_error` und `review_required` ergeben blocked; cancelled bleibt cancelled. **Alle diese Fälle kehren ohne Runtimeagentaufruf zurück** (Q2/Q4). Der Agent kann native Fehler nicht überschreiben.

### Agentinput, Transport und Rückgabe

7. Nur native passed erreicht `judgedInput={gateId,task,runId,attempt,suiteEvidence}`. `gateDecisionEvidence` erzeugt einen Summaryeintrag mit Decisiondigest und pro Knoten `{suite:nodeId,passed,summary}`. `advisory_failure` und `skipped` werden als **nichtblockierend** in `passed:true` übersetzt; das ist kein Nachweis, dass diese Einzeltests tatsächlich bestanden oder überhaupt liefen (Q2/Q4).
8. `buildRequest` sendet exakt `protocol=kubeclaw.buster-quality-gate.v2`, Agent, Identität `{runId,gateId,attempt}`, Task, suiteEvidence, allowedOutcomes/failureClasses und geschlossenen Outputcontract. Source-SHA, Snapshotmount, konkrete Testartefaktrefs und vollständige Logs werden nicht in den Agentpayload aufgenommen. Der Decisiondigest steht nur im Summarytext. Der Agent bewertet diese Kurzbelege; zusätzliche Testhandlungen wären LLM-/Toolverhalten außerhalb dieses technisch erzwungenen Stagevertrags (Q3).
9. Plattformwahl: Runtimecapability hat im Manifest zwei Implementierungen, `runtime` (HTTPworker) und `openclaw`. Der Qualitystage wählt nicht selbst eine davon; er verlangt nur den autorisierten Agentnamen. Dieser Trace verfolgt den produktionsfähigen OpenClaw-Adapter und vermerkt die HTTPalternative. Ein tatsächlich gestarteter Cluster mit konkreter Plattformkonfiguration wurde nicht beobachtet (Q8/Q12).
10. OpenClaw erhält eine durch Coreeffekte korrelierte Dispatch-ID. Daraus und aus der Payload wird ein stabiler Transport-/Payloadhash abgeleitet. Resultdatei liegt unter konfiguriertem Resultpräfix und Repositoryroot, innerhalb target.cwd. `spawnSession` verwendet Label mit Rolle/Modul-oder-Gate-ID und Dispatchhash, prüft vorhandene Sessionregistrierung und spawnt andernfalls mit `cwd=target.cwd`, Modell, Thinking und optionalem Collector-Outputschema. Es setzt **keinen Sourcecheckout R** für Agenttests (Q9).
11. Token wird über vertrauliche Secret-/HTTPfähigkeit aufgelöst; es wird nicht als Reviewinhalt übernommen. Gateway spricht `sessions_spawn`, anschließend Collector `agents_wait` oder Sessionstatus; Zuordnung folgt Session-/Run-/Taskidentitäten. Fehlender oder mehrdeutiger registrierter Run/Sessionkey, abweichendes Modell und ungültiger Spawnstatus werden abgewiesen (Q9/Q10). Diese Runtime-Run-ID ist eine Session-ID der Gegenstelle, nicht mit dem Pipeline-runId gleichzusetzen.
12. Nach erfolgreichem Sessionabschluss liest die Runtime das dauerhafte Resultat, alternativ lokal Collectorstructured/Result oder genau eine terminale Assistantantwort aus der Sessionhistorie. Sie prüft JSON-/Ausgabebudget und schreibt Resultdaten unter deterministischem Pfad. Ein nichtterminaler, fehlender, mehrdeutiger oder nicht als JSON interpretierbarer Output erzeugt Fehler (Q9/Q11). Nicht jede fehlende Resultdatei blockiert sofort: gültiger Collectoroutput kann die Datei erst erzeugen.
13. `parseVerdict` akzeptiert nur `{outcome,summary,failureClass,findings}`. Keine vom Agenten frei gesetzte runId, gateId, attempt, identity, sourceRevision, decisionDigest oder session ist erlaubt. Die aktuellen Run/Gate/Attemptwerte werden danach aus `judgedInput` angehängt. Summary und Findings sind begrenzt. passed verlangt failureClass=none, leere Findings und keine übergebene failed-Suite; jedes Nichtpass verlangt eine Fehlerklasse ungleich none und mindestens ein Finding. Fehler im Parsing ergeben `buster_quality.invalid_verdict`, blocked und **die bereits gespeicherte native Decision** als Artefakt (Q2/Q3).
14. Ein gültiger Verdict wird als `buster-quality:<gateId>:<attemptNumber>` gespeichert, mit `verdict`, `sourceRevision=R`, `decisionDigest` und suiteEvidence. Native passed + Agentpassed gibt das native passed-Result einschließlich test_gate.decision_digest zurück. Agentblocked oder request_fix verwendet entsprechend dieses Outcome und `reason.code=buster_quality.<failureClass>` (Q2).

### Rückweg, Reparatur und Abschluss

15. Bei Agent-request_fix schreibt Core den RepairRequest mit beiden Qualityartefakten und Reason, invalidiert transitiv vorherige Lint-/Review-/Testfreigaben und setzt Forge pending mit geprüfter Repairguidance (Q16/Q18). Forge erhält hier gegenüber nativem Testfailed zusätzlich Agentfindings, aber weiterhin nicht automatisch die vollständigen nativen Logs. Der Real-Worktree-/Mergepfad und dessen erste Bruchstelle sind in [T05](T05-module-repairs.md) vollständig verfolgt.
16. Bedingt bei erfolgreicher Reparatur erzeugt Forge R2. Pflichtlint prüft R2, Echo den ursprünglichen Modulbase→R2-Diff, Quality startet erneut mit R2. Native Planprüfung und Agentbewertung müssen erneut stattfinden; ein früheres Agentpass verleiht R2 keine Freigabe. Ein einzelner solcher Repairzyklus ist unter Compilerbudgets möglich, sofern bisherige Versuche erfolgreich und nicht verbraucht sind. Weitere Reparaturen stoßen an **PTR-T05-001**; falsche Behauptung „zwei freie Reparaturzyklen“ vermeiden (Q5/Q16/Q17).
17. Im **Projectcompiler** endet nach der letzten Modul-Qualitystage der definierte Graph. Er erzeugt keine project-summary-Stage, keinen automatischen finalen kumulativen Qualityplan und keine Operatorabnahme (Q17). Bei allen succeeded endet der Corelauf entsprechend; Runtimeerfolg wurde hier nicht getestet.
18. Ein **expliziter Graph mit project-summary** kann anschließend Q19 aufrufen. Summary bekommt Module-/Final-Stagebindings. Es wählt pro Stage/Namespace die höchste Artefaktattemptnummer; Decision und Verdict werden aus **diesem selben neuesten Attempt** verlangt, JSONmediatyp/Digest/Bytes geprüft, Gesamtbudget 8 MiB. Ein neuer Decision-only-Attempt kann somit nicht durch den Verdict eines älteren Attempts ergänzt werden.
19. Pro Modul und Finalbindung muss die Quality-sourceRevision der aktuellen Implementationrevision entsprechen; native Decision und Verdict müssen passed sein, Run und Decisiondigest müssen passen. Finaler Lintreport und Reviewreport müssen denselben Head haben und erfolgreich sein. Erst danach persistiert die Stage `project-summary:<runId>` als Deliverymanifest mit Source, Modulen, Finalbindung und Evidence. Jeder fehlende/mehrdeutige/korrupte Beleg oder R≠R2 ergibt `project_summary.invalid_evidence` → blocked (Q19).
20. Summaryinput darf jedoch Final- und Modul-Teststage identisch belegen; es prüft keine kumulative Planscopeautorität. Das ist schon im Originaltest der Fall. Ein Summary beweist damit **übereinstimmende gebundene Belege**, nicht automatisch ein zusätzlich ausgeführtes kumulatives Gate. Eigener Befundbesitz/Abdeckung dieser Finalgategrenze liegt bei **PATH-T13-001** in T13; hier keine Dublette.

## Varianten und wichtige Gegenbeispiele

| Eingabe/Ereignis | Tatsächliche Prüfung | Resultat und Aussagegrenze |
|---|---|---|
| Agentpassed, failureClass=test_failure | Q3 `assertVerdictConsistency:33–36` | Ungültig; blocked statt passed |
| Agentpassed mit Findings | Gleiche Prüfung | Ungültig; blocked |
| request_fix mit failureClass=none oder leeren Findings | Gleiche Prüfung | Ungültig; blocked |
| Agent liefert `outcome=failed` | Q3 erlaubte Outcomes | Ungültig; gültiger fachlicher Rückweg heißt request_fix oder blocked |
| Agent liefert frei gewählte Revision/Identität/Digest/Session | Q3 Schlüsselmenge | Ungültig; diese Felder sind core-owned bzw. nicht Teil des Verdicts |
| Native Decisiondigest falsch oder native passed enthält failed-Knoten | Q4 74–76 | Exception vor Agentdispatch; kein native/quality-pass |
| Native Decision fremder Run | Q2 17 | Exception; kein Agentdispatch |
| summary Decisiondigest≠QualitydecisionDigest | Q19 54–55 | Summary blocked |
| summary Quality-R≠aktuelle Implementation-R2 | Q19 47–55 | Summary blocked |
| Neuer Decisionrecord ohne neuen Verdict | Q19 28–33,49–50 | Kein Mischen mit älterem Verdict; missing-or-ambiguous |
| Fehlendes Agent-session-Feld im Qualityoutput | Q3 23–42; Q11 26–31 | **Kein Fehler**: dieses Protokoll hat absichtlich kein Sessionfeld. OpenClawsession wird auf Transportebene geprüft |
| `review_required` eines Providerknotens trotz konfiguriertem Quality-Agent | Q2 24; Q4 44–46 | blocked, Quality-Agent wird nicht als Provider-Evidenzreviewagent eingesetzt |
| Agent behauptet request_fix + infrastructure/rate_limit/timeout | Q3 33–36 und Q2 47–48 | Strukturell akzeptiert und als request_fix an Forge geleitet; es gibt keine deterministische failureClass→Outcome-Matrix |

Die letzte Zeile ist eine **Policy-/Vertrauensgrenze**, kein bewiesener Verstoß gegen eine hier festgelegte Mappingpolicy: der aktuelle Vertrag lässt den Agenten Outcome und Nicht-none-Fehlerklasse wählen. Der Protokolltest verwendet nur die erwarteten Beispiele test_failure→request_fix und andere Klassen→blocked, beweist aber nicht deren Erzwingung. Soll Infrastruktur niemals Codeänderungen auslösen, muss diese Regel nachgelagert technisch festgelegt werden; ein Prompt allein wäre dafür unzureichend.

## Sessionevidenz, späte Antworten, Timeouts und Persistenz

Das produktive Qualityprotokoll heißt `kubeclaw.buster-quality-gate.v2`. `attachRuntimeEvidence` kennt hingegen neben Implementation einen Zweig für **`kubeclaw.buster-test-judgment.v2`**. Dieser Zweig greift hier nicht. Der Qualityparser würde ein zusätzliches session-Feld ohnehin zurückweisen. OpenClaw prüft Sessionabschluss/Modell und erstellt beim Import interne RuntimeSessionEvidence; Qualitypersistenz übernimmt weder diese Sessiondaten noch die zurückgegebene `runtimeEvidence`-Attestation. Das ist eine konkrete **Auditgrenze**, kein Beweis fehlender Sessionprüfung und kein automatisch fehlgeschlagener Handoff. Das bestehende Komponentenreview nennt im Vertragsteil den alten Protokollnamen; für diesen Trace hat Originalcode Vorrang (Q3/Q9/Q11).

Für die generische HTTPworker-Runtime wird die Payload signiert an den konfigurierten Endpoint gesendet; die Antwort muss JSON/HTTP-/Größengrenzen erfüllen. Dieser Adapter führt keine eigenständige OpenClawsessionprüfung durch. Der konfigurierte Endpoint ist die vertrauenswürdige ausführende Gegenstelle. Ein vom HTTPworker einfach gesetztes passed wird nur semantisch durch den Qualityparser begrenzt, nicht durch eine zusätzliche Sessionevidenzpflicht (Q12). Daraus folgt keine Gleichwertigkeit mit tatsächlich ausgeführten Agenttests.

Corejournal und externe Effekte sind getrennte Persistenzgrenzen. DurableInvocation prüft bestehende Idempotencyrequests/Receipts, persistiert requested/accepted/completed und fordert bei angenommenem Effekt ohne Receipt die Adapter-Recoveryfunktion. Der Dispatchadapter implementiert keinen allgemeinen receipt-Recoveryhook. Eine fehlgeschlagene Runtimeeffectreceipt wird von AdapterRuntime als `EFFECT_OUTCOME_UNRESOLVED` weitergegeben; StageExecutor macht daraus blocked/Reconciliation, **keinen naiven automatischen Agentretry** (Q14/Q15).

Ein OpenClaw-Sessiontimeout vor dem Coredeadline ist ein Runtimeadapterfehler und landet damit regelmäßig in der Reconciliationdisposition. Der unabhängige Coretimeout kann zuerst gewinnen: Promise.race liefert timed_out, der Reducer failed; Elternabbruch ergibt cancelled. Bei einer zu spät beantworteten Sessionanforderung versucht OpenClaw Cancellation. Nach Revocation sind weitere Plugin-Capabilityaufrufe untersagt. Cancellation ist best effort; **PCR-RUNTIME-001** bleibt relevant, und ein Coreabbruch beweist keinen tatsächlich beendeten externen Agentprozess (Q9/Q10/Q13/Q14).

Die native Decision wird vor Agentdispatch als Artefakt geschrieben. Bei **ungültigem empfangenem Verdict** kehrt sie ausdrücklich im StageResult zurück. Bei **geworfener Runtimeexception/Timeout** übernimmt der Core ein Fehlerresultat mit leeren Resultartefakten; die bereits geschriebene Decision hat `checkpoint:true` nicht gesetzt. Sie kann physisch bzw. im Effektjournal vorhanden sein, ist aber nicht automatisch als aktive Resultartefaktprojektion erhalten. Diese Unterscheidung folgt aus Q2 19–24/31–39 und Q13 34–49/124–135. Crash nach erfolgreichem Attemptresultat vor Artefaktprojektion ist der bereits bekannte **PCR-EXEC-002**. „Native Decision immer sicher als Resultartefakt vorhanden“ wäre daher zu weitgehend.

## Ohne Test-Agent und Abgrenzung der Gates

`remote-gate-cli.ts` lädt dieselbe ProductionNovaTestGate und führt den Plan direkt aus; es druckt das native Ergebnis und setzt Exitcode anhand native stageResult, **ohne** Quality-Runtimeagent (Q20). T11 beschreibt die breitere No-agent-/Suitevariante. Das ist keine Möglichkeit, bei `kubeclaw.test.quality-evaluation` einfach agent wegzulassen: Q2 prüft es vor Planexecution, Q17 verlangt es beim Compilieren. Ebenso erwartet der aktuelle Summaryconsumer Artefakte des Qualitystages einschließlich Verdict; er kann ein allein natives CLI-Ergebnis nicht unverändert als vollständigen Qualityabschluss konsumieren.

Im Projectmodus ist `input.gateId=test-m` eine Stage-/Artefaktkennzeichnung, während der Remoteplan moduleId=m/gateId=null trägt. In einem expliziten Graph kann ein echter kumulativer Plan gateId≠null/moduleId=null verwendet werden. Der Qualityagent bekommt die InputgateId, nicht separat diesen Plan-Scope; die strukturelle Zuordnung folgt dem konfigurierten Stageaufruf. Es wird keine von Agenttext erzwungene Modul-/Gatekorrektheit behauptet. Die Testplan-/Remoteimportseite bindet den fachlichen Scope technisch (Q6/Q7), Summary selbst verifiziert ihn nicht (Q19).

## Findings, Nachweise und spätere Verifikation

Keine neue unabhängige bestätigte Defektkennung wird für diesen Trace beansprucht. Querverweise bleiben **PCR-IMPLEMENTATION-001**, **PTR-T05-001**, **PCR-RUNTIME-001**, **PCR-EXEC-002** und **PATH-T13-001**. Ergänzte Zielbild-/Auditgrenzen sind: Agent bewertet Kurzbelege statt technisch erzwungener zusätzlicher Anwendungstests; Session-/Runtimeattestation fehlt im Qualityartefakt; failureClass setzt keine separate Dispositionspolicy; Summary erzwingt kein zusätzliches kumulatives Gate. Die Finalgategrenze wird bei T13 konsolidiert.

**Ausgeführt:** ausschließlich statische Originalcode-/Gegenstellenprüfung, Plan-/Modul-/Gate-/Attempt-/Revisionstracing und Lesen der folgenden Tests. Keine Tests, CI, Deployments, Gitmutationen oder Agent-/Providerläufe ausgeführt. Ausschließlich diese zugewiesene Reviewdatei geschrieben.

| Gelesener Test — NOT RUN | Relevante Zeilen | Tatsächliche Aussagegrenze |
|---|---|---|
| `skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts` | 12–27 | Builder/Parser, Widersprüche und ausgewählte Fehlerklassen; kein Agent oder Provider |
| `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts` | 8–20 | Inputschema lehnt erfundene caller-Suiteevidenz ab; keine tatsächliche suite-first Ausführung |
| `skills/nova/plugins/project-summary/tests/summary.test.mjs` | 9,26–47 | Echter Artefaktadapter, feste Reports, Source-/Corrupt-/Runfälle; ausdrücklich providerExecution=false/agentExecution=false |
| `tests/verification/reliability/lifecycle.test.mts` | 17–20,31–58 | Reparaturinvalidierung im echten Recorder/Journal mit festen Resultaten; Budget 8, nicht Compilerbudget 2 |

Empfohlene Ursachenbehebungs-/Verifikationsfolge: zuerst Workspace- und Repairbudgetgrenzen aus T05; danach einen realen nativen passed-Plan mit echtem OpenClaw-Agentpassed und gebundenen Artefakten für R ausführen, native failed bei garantiert null Agentrequests nachweisen, malformed/blocked/request_fix und reale Timeout-/Crashfenster prüfen. Falls zusätzliche Agent-Anwendungstests gewünscht sind, müssen Source-/Endpoint-/Evidencezugriff, Testauftrag und Resultautorität ausdrücklich implementiert und verifiziert werden. Falls Qualityaudit eine Sessionherkunft benötigt, diese über Runtimeautorität als begrenzte unveränderliche Referenz speichern, nicht vom Modell behaupten lassen. Erst ein solcher Lauf könnte die hier ausschließlich statisch nachvollzogenen Endzustände als Laufzeitnachweis bestätigen.
