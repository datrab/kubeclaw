# T16 — Optionale Case Study und überprüfbarer Projektabschluss

**Status:** statischer Trace abgeschlossen. Vorhandene Reporterzeugung ist von Quellenprüfung, Produktabnahme und Veröffentlichung getrennt. **Keine Tests/Agentenläufe/CI ausgeführt, nichts veröffentlicht.**

Geprüfter Commit für alle Sourcebelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Vorreviews gelesen am Stand `a9e080ab1e1981ec5713e9b742f94280835fd347`: `docs/review/components/kubeclaw.case-study.md`, `kubeclaw.project-summary.md` sowie Befundabschnitt `PCR-PREPORT-001` aus `kubeclaw.pipeline-review.md`. Historische Testbehauptungen werden nicht als neue Ergebnisse übernommen.

## Ausgangszustand, Varianten und gewünschtes Ende

Angenommen sind zwei implementierte Module mit artefaktgebundenen Quellständen R1/R2; ein autorisierter expliziter Graph erklärt die finalen Lint-/Review-/Teststages für R2. Vorherige Gates müssen tatsächlich erfolgreich sein, nicht nur durch Text im Case-Studyauftrag als erfolgreich bezeichnet werden. Runidentität stammt aus Corelease, Producerartefakte müssen im selben Run und über Graphabhängigkeiten sichtbar sein.

Varianten innerhalb dieses Szenarios:

| Variante | Auswahl / erwartetes Ende |
|---|---|
| A | Projectcompiler-Einstieg ohne Folgeschritte: Modullane endet, weder Case Study noch Summary wird automatisch angefügt. |
| B | Expliziter Graph mit Summary, ohne Case Study/Pipeline Review: gebundenes Liefermanifest und Coreabschluss, ohne automatische Veröffentlichung. |
| C | Expliziter Graph mit Summary und anschließend Case Study: Agent erzeugt Entwurf aus gelieferten Fakten; JSON-Artefakt wird gespeichert. |
| D | Zusätzlich vorausgehender Pipeline Review: dessen Ergebnis muss anderweitig in geeigneten Case-Studyinput übersetzt werden; dependsOn alleine überträgt keinen Reportinhalt. |
| E | Fehlende/manipulierte finale Evidenz oder fehlerhaftes Writerresult: genauer Block-/Retry-/Recoverypfad, keine stillschweigende Auslassung bereits aktivierter optionaler Stages. |

Gewünschter Endzustand: überprüfbare Produktlieferung plus optionaler sachlich fundierter Case-Studyentwurf; Operator kann anschließend abnehmen oder Änderungen anfordern. Tatsächlich nachgewiesene technische Endpunkte sind enger: `delivery-manifest.v1` und/oder `case-study:<input.runId>` als Artefakte, danach Graphabschluss. Operatorabnahme und Veröffentlichung ergeben sich daraus nicht.

## Erste fehlende Verbindung und bedingte Fortsetzung

`skills/nova/project/compiler.ts#compileProject:103–137` erzeugt ausschließlich Implementation→Lint→Review→Quality pro Modul und gibt danach zurück. Der Rootvertrag in Zeile 47 erlaubt keine Case-Study-/Summaryoption. Beide Plugins stehen zwar in `packaging/runtime/roles/nova.json:43,51`, aber diese Liste installiert Funktionen, sie löst sie nicht aus. **Erste Lücke im kanonischen Projectpfad:** keinerlei automatische Abschlusskomposition. Dieser Befund bleibt zentral **T01-F02**, hier keine zweite Kennung.

Der ältere Einzelreview `kubeclaw.project-summary.md` behauptet in Abschnitt 1, der Projectcompiler verdrahte Modul- und finale Gates. **Diese Behauptung widerspricht dem nachgelesenen Baselinecompiler.** Die weiteren Aussagen desselben Reviews über die Funktionsweise des Summaryplugins sind davon getrennt zu beurteilen. Das Inventar oder ein abgeschlossener Review wird nicht als Vollständigkeitsbeweis verwendet.

Für die folgenden Schritte wird ausdrücklich angenommen, dass ein autorisierter Aufrufer einen gültigen `pipeline-definition.v2`-Graphen mit erforderlichen Abhängigkeiten, Inputs und Grants anlegt. Das ist ein vorhandener separater Core-Einstieg (`skills/nova/project/cli.ts:10–12`, `skills/nova/core/cli.ts:49–74`), kein hier implementierter Ersatzcompiler und kein gestarteter Run.

## Vollständige Übergangsfolge

| Schritt | Aufrufer → Daten/Transport/Persistenz → Empfänger → Resultat / Folgeschritt | Codebeleg |
|---|---|---|
| 1. Trigger/Registrierung | Graph erklärt Stage `kubeclaw.report.project-summary` bzw. `kubeclaw.report.case-study`. Manifest wählt execute-Symbol und erforderliche Capabilities. Graphabhängigkeiten geben Stage nach bestandenen Vorgängern frei. Weder ein Discordkommentar noch `run.succeeded` erzeugt im betrachteten Coreloop implizit einen Case-Studyauftrag. | `project-summary/plugin.json:5–18`; `case-study/plugin.json:5–17`; `core/execution/pipeline-loop.ts:83–105,137–144` |
| 2. Summaryinput | Aufrufer liefert `projectId`, Modulliste `{moduleId,sourceStageId,testStageId}` und `final:{sourceStageId,lintStageId,reviewStageId,testStageId}`. Runtimeinputschema lehnt zusätzliche Felder ab. Funktion verlangt 1–128 eindeutige Module/Source-/Teststages und eine finale Source, die in der Liste vorkommt. Run-ID wird ausschließlich aus Lease übernommen. | `project-summary/schemas/input.schema.json`; `project-summary/src/summary.ts#buildSummary:17–25` |
| 3. Artefaktsicht | Core stellt nur Artefakte eigener Stage und transitiver Vorgänger bereit. Summary selektiert innerhalb dieses Contextsnapshots denselben Run, verlangte Producerstage und Namespace, danach höchsten Attempt und genau einen passenden Ref. Ein beliebiger Callerdateipfad oder nicht abhängiger Producer genügt nicht. | `core/execution/stage-executor.ts#priorArtifacts:96–106`; `project-summary/src/summary.ts#read:28–36` |
| 4. Modulbeweis | SDK `resolveSourceRevision` liest jüngstes Implementationartefakt, prüft Bytes/Digest und ready_for_testing. Summary liest Implementation-, native Testdecision- und Qualityartefakte. Decision muss passed/rungebunden sein, Qualityverdict passed und dessen Entscheidungdigest sowie Revision müssen passen. Das prüft gelieferte Beweiskette, startet keine Suite und keinen Agenten. | `skills/common/plugin-runtime/sdk/src/source-revision.ts:5–37`; `project-summary/src/summary.ts#verify:46–58` |
| 5. Finaler Beweis | Gleiche Prüfung für `input.final`; zusätzlich finales Lint und Review. Alle gelesenen JSONbytes werden kanonisiert, Digest/Bytelänge mit Ref verglichen, Lesebudget 8 MiB. Lintsource und Reviewhead müssen finale Source treffen; Linttools_failed/total_blocking jeweils 0, Reviewoutcome passed. | `project-summary/src/summary.ts#read:28–45`, `#buildSummary:59–65` |
| 6. Manifest | Aus diesen Daten entstehen `delivery-manifest.v1`, Run, Projekt, SourceRevision, Module, final und Evidence-Refs plus Manifestdigest. Stage schreibt über `artifacts.write` nach `kubeclaw.project-summary`, logische ID `project-summary:<lease.runId>`, liefert passed mit Ref. Kein Agentdispatch in dieser deterministischen Summary. | `project-summary/src/summary.ts:66–69`; `project-summary/src/stage.ts#execute:3–11` |
| 7. Optionaler Pipeline Review | Eine getrennte Stage kann aus ihrem eigenen Input einen Pipeline-Reviewreport erzeugen. Sie schreibt lediglich ihr Artefakt und liefert passed. Weder sie noch Case Study liest automatisch das jeweils andere Ergebnis. Eine Ablaufkante kann Reihenfolge erzwingen, erzeugt aber keine automatische Umwandlung in Case-Studyfacts. | `pipeline-review/src/stage.ts#execute:3–16`; `case-study/src/stage.ts#execute:3–12`; Details T15 |
| 8. Case-Studyinput | Caller liefert `projectId,runId,task,facts:[{label,value}]`; Agentname aus Config. Schema erlaubt 1–256 Fakten, Label≤256/Value≤8192, Task≤32768 Zeichen. Es gibt keine typisierten Quellenrefs, SourceRevision, Deliverymanifest-ID oder Approvalreferenz. Aus Summary wird nicht automatisch eine Faktenliste gebaut. | `case-study/schemas/input.schema.json:1`; `case-study/schemas/config.schema.json:1`; `case-study/src/protocol.ts#CaseStudyInput:1` |
| 9. Writerdispatch | `buildRequest` erzeugt `kubeclaw.case-study.v2`, Callerprojekt/Run, Task, Fakten und sechs geforderte Abschnitte. Groundingregeln sind Prompttext: nur gelieferte Fakten, keine erfundenen Metriken/Zitate/Daten/Ergebnisse. `runtime.dispatch` an konfigurierten Agent führt den tatsächlichen Agentenpfad aus, sofern funktionierende Runtime vorhanden. | `case-study/src/protocol.ts#buildRequest:4–9`; `case-study/src/stage.ts:4–7` |
| 10. Writerantwort | Stage verarbeitet `response.result`; Parser verlangt ausschließlich `status:generated` und Markdown, 1–131072 Zeichen ohne NUL/CR. Genau ein Vorkommen der sechs Marker `## Context/Challenge/Approach/Implementation/Verification/Outcome` in Reihenfolge genügt. Das ist Teilstringprüfung, keine Validierung der Behauptungen, nicht einmal vollständige Markdownheadinganalyse. | `case-study/src/protocol.ts#parseCaseStudy:10–22` |
| 11. Reportpersistenz | Parser ergänzt Projekt/Run aus Callerinput, nicht Lease. Stage schreibt `{status,projectId,runId,markdown}` nach `kubeclaw.case-study`, ID `case-study:<input.runId>`, liefert passed. Artefakt-Producer stammt separat aus wirklichem Coreattempt. Dadurch kann Inhaltsidentität Run A und Producer Run B sein (PCR-PREPORT-001). Inputfacts/Manifestdigest/SourceRevision werden nicht als eigenes Nachweispaket im Report bewahrt. | `case-study/src/protocol.ts:21`; `case-study/src/stage.ts:9–11`; Artifactproducer durch Core/Adaptervertrag |
| 12. Verwendung/Übergabe | Report ist ein JSON-Artefakt mit eingebettetem Markdown, keine automatisch erzeugte README/CaseStudy.md und kein automatisch veröffentlichtes Dokument. Manifest und Case Study rufen keine Publikations-/Deployment-/Operatorcapability auf; Marker `generated` ist keine Publikationsfreigabe. Ein künftiger Consumer muss konkreten Artefaktref lesen und eigene Freigabegrenzen besitzen. | `case-study/plugin.json:11–14`; `case-study/src/stage.ts:3–12`; `project-summary/plugin.json:11–14`; `project-summary/src/stage.ts:3–11` |
| 13. Runabschluss | Bei Weglassen der optionalen Stages kann der übrige Graph regulär enden. Bei deklarierter und erfolgreicher Case Study wird erst deren Erfolg zum Abschluss gezählt. Core gibt succeeded, wenn alle erforderlichen Stages succeeded/skipped sind; es wartet nicht zusätzlich auf menschliche Produktabnahme, sofern keine solche Stage deklariert ist. | `core/execution/pipeline-loop.ts#finalize:137–144`; `core/lifecycle/reducer.ts:69–72` |
| 14. Operatorfeedback/Abnahme | In Summary-/Case-Studyinputs und Outputs gibt es keine Operatorfeedback-, Signalisierungs-, Risikoakzeptanz-, Applicationcredential- oder Cleanupübergabe. Feedback könnte nur durch zusätzlichen autorisierten Workflow neue Arbeit erzeugen. Das ist hier kein nachgewiesener automatischer Abschlussrückweg. Erhaltenen Namespace/Previewzugang und weitere Rückmeldungen bewertet T14; T01-F02 deckt fehlende Komposition ab. | Vollständige `case-study/src/stage.ts:1–12`, `protocol.ts:1–22`; `project-summary/src/summary.ts:1–69`, `stage.ts:1–11` |

## Was die Summary tatsächlich garantiert — und was der Graph sicherstellen muss

| Eigenschaft | Tatsächliche Prüfung / Grenze |
|---|---|
| Aktiver Run | Lease-Run und Producer-Run werden abgeglichen; Testdecisionrun muss passen. Stärker als Case-Studycaller-ID. |
| Quelle | Quality.sourceRevision, Lint.sourceRevision und Review.revision.head müssen deklarierte finale Implementationrevision treffen. Nicht automatisch gerade aktueller Repository-HEAD. |
| Artefaktintegrität | Kanonischer Digest und Bytelänge werden nach echtem Storelesen erneut geprüft. Hash belegt unveränderte Bytes, nicht fachlich korrekte Prüferurteile. |
| Finale Stages | IDs stammen aus vertrauenswürdigem Graphinput. Summary verlangt nicht, dass finaler Test-/Reviewstage von allen Modulstage-IDs verschieden ist. Die gleiche Modulprüfung kann erneut als final deklariert werden. |
| Kumulativer Review | Prüfung vergleicht `review.revision.head`; sie kontrolliert nicht ursprüngliche Gesamtbaseline, Gesamtscope oder dass jedes Modul enthalten ist. Beim Compiler entspricht letztes Modulreview R1→R2, nicht R0→R2 (SDK `resolveImplementationRevisions:40–49`). Ein finaler Kopfgleichheitstest macht dies nicht kumulativ. |
| Kumulativer Testgate | Summary verarbeitet Decision und Qualityverdict, liest keinen erwarteten Gesamtplan/Modulbestand aus einer Projektspec. Ob deklarierter Teststage den gesamten integrierten Stand prüft, muss Plan-/Graphpolicy belegen. |
| Vollständiger Modulbestand | Liste ist nichtleer/eindeutig, aber nicht gegen einen unabhängigen autorisierten Modulplan abgeglichen. Ein gültiges Teilmanifest ist nicht automatisch vollständige Lieferung aller vorgesehenen Module. |
| Operatorabnahme | Keine Acceptance-ID, kein ausgewertetes Operatorsignal und kein garantierter Previewzugang im Manifest. |

Diese Grenzen sind **keine pauschale Umgehung durch unberechtigte Caller**: Definition/Graph ist selbst vertrauenswürdige Policy. Sie begrenzen jedoch die Aussage „Liefermanifest beweist vollständiges kumulatives Projekt“. Eine geeignete Produktkomposition muss die fehlende Vollständigkeits-/Scopebindung leisten. Die fehlende Bindung ist zentral als PATH-T13-001 geführt; die fehlende Compilerkomposition bleibt davon getrennt T01-F02. Beide Kennungen werden hier bestätigt, nicht doppelt angelegt.

## Fehler, Retries, Zwischenzustände und Abschluss ohne Folgeschritte

| Auslöser | Daten-/Zustandsentwicklung und Rückweg |
|---|---|
| Fehlende/falsche Summaryevidenz | `buildSummary` wirft, Stage liefert `blocked/project_summary.invalid_evidence`, keine fertige Summaryartefakterzeugung. Core stoppt diese aktivierte Pipeline; es wird nicht automatisch Case Study aus unbewiesenen Erfolgen erzeugt. |
| Dispatchfehler oder ungültiger Case-Studytext | Stagecatch liefert `blocked/case_study.invalid_output` mit leerer Artefaktliste (`stage.ts:6–8`). Kein request_fix zu Forge, keine eigene Writerkorrekturschleife. Bloß größeres maxAttempts bewirkt für blocked keinen automatischen Retry (`core/lifecycle/reducer.ts:98–103`). |
| Fehlender Agentname | Validierte Config soll dies vor Start verhindern; direkte Funktionsausführung wirft vor try. Core behandelt nicht anderweitig klassifizierte Pluginexception als retry im Budget (`stage-executor.ts:124–130`). |
| Fehler beim finalen Artefaktwrite | Write liegt außerhalb Stagecatch. Fehler erreicht Executor und dessen Fehler-/Effectsemantik; normaler Retry kann Writer erneut aufrufen, weil kein eigener Zwischencheckpoint den Text wiederverwendbar macht. Unsichere externe Effects werden nicht beliebig blind wiederholt. |
| Prozessabbruch nach Writerantwort | Runtime-/Effectreceipt und vollständiges Stageartefakt sind verschiedene Grenzen. Ohne fertiges Attemptresult kann äußere Recovery explizite externe Continuation verlangen; T08 erläutert die genauen Bedingungen. |
| Resultartefakt geschrieben, noch nicht im Core projiziert | PCR-EXEC-002 gilt auch hier: Blob/Ref können vorhanden sein, aber Consumerindex fehlt. Kein behaupteter physischer Verlust aller Textbytes. |
| Neue/reparierte Implementation | Summary muss neue jüngste Sourceartefakte mit passenden Gates lesen. Ohne erneut passende Revision blockiert sie. CaseStudy hingegen kennt keinerlei SourceRevision/Freigabeinvalidierung; unveränderte caller-owned facts werden nicht automatisch aktualisiert. |
| Doppelte Reporterzeugung | Coreattempt/Effectidentität begrenzen einzelne Operation; CaseStudyname verwendet immer Caller-Run, Output kann zwischen Writerattempts unterschiedlich sein. Producerattempt ist gesondert zu betrachten, kein identischer Inhalt allein aus identischem logischem Namen. |
| Case Study ausgeschaltet | Compiler enthält sie ohnehin nicht. Expliziter Graph kann sie von Anfang an weglassen; dann verhindert sie Abschluss nicht. Entfernen einer schon gepinnten Stage während Resume wäre Graphdrift und keine unterstützte spontane „optional“-Abwahl. |
| Case Study ausgewählt, dann fehlgeschlagen | „Optional“ beschreibt die Graphauswahl, nicht fail-open. `blocked` der deklarierten Stage bleibt blocked; allgemeine administrative Wiederöffnung ist separat autorisiert und kein Produkt- oder Publikationsapproval. |

## Befunde und übernommene Kennungen

### PCR-PREPORT-001 — Calleridentität statt aktiver Run-/Attemptbindung

**Niedrig; bestehender nachgewiesener Provenienzvertragsdefekt, in Case Study erneut am Originalcode bestätigt.** Auslöser: Run B führt Stage mit `input.runId=A` aus. Builder und Parser nutzen A, Artefaktname enthält A; wirklicher Producer bleibt B. Prompt behauptet dennoch „Runtime/core bind project and run identity“. Auswirkungen: irreführende Report-/Auditzuordnung; **kein ACLbypass behauptet**. CaseStudyinput enthält gar keine ausdrückliche Attempt-/Sourcebindung.

Belege: `case-study/src/protocol.ts:1–9,21`, `stage.ts:3–11`. Originaltest `case-study/tests/live-function.test.ts` definiert gerade unterschiedlichen Caller- und Ausführungsrun und erwartet callerbenanntes Artefakt; gelesen, nicht ausgeführt.

Ursachenbehebung: Berichtgegenstand (auch historischer Run) von ausführendem Run/Attempt ausdrücklich unterscheiden; Ausführung aus Lease, Gegenstandsidentität mit gelesenen Quellartefakten binden. Verifikation später: zwei echte Core-Runs und Folgeattempt, gespeicherte Inhalt-/Producer-/Gegenstandsidentitäten prüfen. Keine historischen Berichte pauschal verbieten.

### T15-F01 — gemeinsame fehlende überprüfte Quellenbindung der optionalen Agentberichte

**Gemeinsame Ursache mit T15, keine neue T16-Duplikatkennung.** Bei Case Study ist die Grenze noch unmittelbar sichtbar: Fakten sind Callerstrings ohne Artefaktref/Digest, Stage besitzt kein `artifacts.read`, Parser prüft keine Behauptung gegen Evidenz, gespeicherter Report behält nur Markdown und Identität. Promptregeln begrenzen gewünschtes Verhalten, erzwingen keine sachliche Richtigkeit. Auslöser: ungeprüfte/veraltete Faktentexte oder ein Writer, der trotz Vorgaben neue Ergebnisse behauptet. Formatgültiger Text wird als generated/passed gespeichert. Wirkung: Bericht ist ein Entwurf, kein belastbarer Beleg bestandener Tests oder Publikationsreife.

Belege: `case-study/plugin.json:11–14`; `protocol.ts:1–22`; `stage.ts:6–11`. Ursachenbehebung gemeinsam mit T15: versionierten run-/source-/attemptgebundenen Quellenmanifestinput auflösen und prüfen, Quellenrefs/digests im Output erhalten, behauptete Mess-/Testresultate an strukturierte Evidenz binden; LLM-Text weiterhin als Entwurf kennzeichnen. Spätere Verifikation: echter Writer mit echten unveränderlichen Berichtsquellen; falscher Run/Source/Artefaktdigest verhindert Erstellung, unbelegte Tests/Metriken verhindern verifizierten Status. Keine bloße zusätzliche Promptmahnung als Ursachenbehebung.

### PATH-T13-001 — kumulativer Abschlussumfang ist nicht unabhängig gebunden

**Bestehende neue Tracekennung aus T13; eigenständig an Summary bestätigt.** Auslöser: der explizite Graph deklariert die letzten Modulprüfungen zugleich als finale Prüfungen. `project-summary/src/summary.ts:18–24,46–65` prüft IDs/Eindeutigkeit/Passed/Head, nicht die vollständige autorisierte Modulmenge, den kumulativen Testscope oder Reviewbaseline R0. Folge: konsistente schmalere Evidenz kann als finale Bindung im Manifest erscheinen. Das ist keine pauschale Aussage gegen korrekt konfigurierte Gesamtgates. Ursachenbehebung: autorisierter Modul-/Requirementsbestand und kumulativer Scope müssen als eigene unveränderliche Abschlussinvariante gebunden werden. Verifikation: Original-Modulevidence darf allein keine vollständige Delivery ausweisen; echte Gesamtgates mit R0→R2 und vollständiger Requirementmenge erlauben den Abschluss. Kein zusätzlicher T16-Befund derselben Ursache.

### Bestehende Kompositions- und Abschlusslücken, nicht dupliziert

**T01-F02** bleibt Eigentümer der fehlenden Compiler-Vorphasen/finalen Gates/Summary/Operatorübergabe. T14 prüft Preview, Operatorzugang und Feedbackabschluss (F-T14-01/02); T13 führt die fehlende kumulative Scopebindung zentral als PATH-T13-001. Die Teilstring-Sectionprüfung ist eine ausdrücklich dokumentierte Qualitätsgrenze ohne neue zusätzliche Finding-ID: Markdown mit Markern in Codeblöcken oder leeren Abschnitten kann die Strukturprüfung erfüllen; aus Code abgeleitet, in T16 nicht ausgeführt. Dieses Verhalten ist nicht mit tatsächlicher Veröffentlichung verwechselt.

## Nachweise und verbleibende Laufzeitfragen

Tatsächlich durchgeführt: feste Sourceabfragen, Quell-/Schema-/Registrierungsabgleich, Symbol-/Zeilenprüfung, Abgleich bestehender Reviews und Abstimmung mit T15/T13 und Abgleich T14 zur Befundzuständigkeit. Kein Ausführen von Tests, keine Writer-/Pipelineagenten und keine externen Änderungen.

| Vollständig gelesener Originaltest | Ergebnis in dieser Prüfung / genaue Aussagegrenze |
|---|---|
| `skills/nova/plugins/case-study/tests/protocol.test.mjs` | **Nicht ausgeführt.** Format/unerlaubte Felder/doppelte Marker; keine Quellen-/Faktenprüfung. |
| `skills/nova/plugins/case-study/tests/live-function.test.ts` | **Nicht ausgeführt.** Echte lokale Adapter/HTTP/Artefakte mit fester Serverantwort statt Writeragent; testet callerfremde Runzuordnung, keine tatsächliche Case-Studyqualität. |
| `skills/nova/plugins/project-summary/tests/summary.test.mjs` | **Nicht ausgeführt.** Echter Artefaktstore mit selbst erzeugten Producerfixtures; gültig/fehlend/manipuliert/fremder Run/falsche Qualityrevision. Test sagt selbst providerExecution:false und agentExecution:false. Wiederverwendet dieselben Modul- und finalen IDs. |
| `skills/nova/plugins/project-summary/tests/live-function.test.ts` | **Nicht ausgeführt.** Originalrunner ohne benötigte Evidenz erwartet blocked; kein erfolgreicher kompletter Producer→Summarylauf. |

Offen sind der reale vollständige Produzentenpfad mit finalem kumulativem Scope, Beweiserhalt über Repair/Resume, echte Writerfaktualität und sichere Operatorübermittlung. Veröffentlichung ist ausdrücklich außerhalb dieses Szenarios; im nachgelesenen Stagecode gibt es dafür keinen Aufruf. Ein fehlender Publikationsschritt ist angesichts des Auftrags kein Defekt. Operatorfreigabe eines künftigen Dokuments muss als eigener späterer Vorgang behandelt werden, nicht aus `generated` oder `run.succeeded` erfunden werden.

Empfohlene spätere Reihenfolge: erst Produktkomposition/Scopebindung T01-F02, dann Reportidentitäten PCR-PREPORT-001 und gemeinsame Quellenbindung T15-F01, anschließend echter Writer-/Producerlauf mit menschlicher Abnahme. Abschluss ohne Case Study ist unterstützt durch Weglassen im ursprünglichen expliziten Graphen; ein bereits aktivierter fehlerhafter Folgeschritt wird nicht stillschweigend ignoriert.
