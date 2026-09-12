# T15 — Optionales Pipeline Review nach der Modulbearbeitung

Status: statisch vollständig vom optionalen Trigger bis Berichtartefakt/Runabschluss verfolgt. Subagent `/root/trace06`. Keine Laufzeit-/E2E-Behauptung.

## Geprüfter Stand, Ausgang und Varianten

Alle Codebelege: **85ddfcbfc15e078780ea0434fc167e6f9a9b9488**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`; Zeilen 1-basiert. Gelesener Vorreview: `docs/review/components/kubeclaw.pipeline-review.md` und `docs/review/findings.md` an `a9e080ab1e1981ec5713e9b742f94280835fd347`. Die bestehende Kennung lautet **PCR-PREPORT-001**; keine abweichende PCR-PIPELINE-REVIEW-Kennung erfinden. Laut vollständigem Baselinebaum keine AGENTS.md. Nicht vorhandene lokale Dateien wurden nicht als repositoryweit fehlend gewertet.

Ausgang: Modul-/Gatearbeit des Runs R ist abgeschlossen; ursprünglicher Graph G und Plugins sind gepinnt. Gewünscht ist eine Auswertung der Pipelinearbeit selbst: Architektur, Agenten, Prompts, Tests, Konfiguration und Verbesserungsvorschläge. Dies ist vom Echo-Code-Review `kubeclaw.decision.review` getrennt.

Varianten:

1. **Ohne Pipeline Review:** normaler Projectcompilergraph, Ende nach letztem Modultest.
2. **Mit Pipeline Review:** vor Runbeginn explizit gesetzte Stage `kubeclaw.report.pipeline-review`, abhängig vom gewählten letzten fachlichen Gate; erforderlicher Runtimeagent und Artefaktprovider vorhanden.
3. **Stale/fremde/duplizierte Evidenz und caller-identities:** Reviewinput verweist auf Run S oder Versuch1, obwohl Core R/Versuch2 ausführt; syntaktisch gültige Digests ohne auflösbaren Inhalt.
4. **Ungültiger/fehlender Bericht oder Schreibfehler:** Rückweg und bedingte administrative Fortsetzung, kein funktionales Anwenden von Vorschlägen.

Ein expliziter Graph mit der Reviewstage nach den Produktgates läuft noch **vor** dem eigenen `run.succeeded`. Ein Bericht über einen bereits terminal abgeschlossenen Run wäre ein gesonderter späterer Lauf bzw. Aufruf mit historischem Berichtziel; diese Identitäten sind im Plugin nicht sauber getrennt. Eine laufende/gepinnte Graphdefinition lässt sich nicht unbemerkt um einen optionalen Schlussknoten erweitern.

## Vollständiger Trace

| Übergang | Erzeuger, Transport, Empfänger und Rückweg | Zustand/Evidenz und konkrete Codebelege |
|---|---|---|
| 1. Installation ist nicht Auslösung | Nova-Role führt `kubeclaw.pipeline-review` als installierbares Plugin; dessen Manifest registriert report-stage mit Runtime-/Artefaktfähigkeiten. | `packaging/runtime/roles/nova.json:39–54`; `skills/nova/plugins/pipeline-review/plugin.json:5–21`: keine Observer oder Adapter, also kein eigener Listener auf Runabschluss. |
| 2. Ohne optionale Stage | `compileProject` erzeugt pro Modul implement/lint/review/test und gibt Definition zurück. | `skills/nova/project/compiler.ts:103–137`, `compileProject`; kein Pipeline-Review-Knoten oder Schalter. `PipelineLoop.#finalize`, `skills/nova/core/execution/pipeline-loop.ts:137–144`: alle nötigen Stages succeeded/skipped → run.succeeded. Kein Berichtartefakt wird dabei automatisch erzeugt. |
| 3. Mit expliziter Stage | Graphautor setzt type, dependsOn, config.agent und input `{runId,attempt,task,evidence}` vor Start. Scheduler wartet auf erfolgreiche/übersprungene Dependencies. | `pipeline-review/schemas/input.schema.json:1`, config.schema.json:1; `skills/nova/core/execution/runner.ts:37–43`, Schema-/Registryvalidierung; `graph.ts:41–43`, readiness; `pipeline-loop.ts:20–35`. Bloße Registration garantiert keine Auswahl. Ein Graph ohne korrekte Abhängigkeit dürfte die Stage auch früh starten; das Plugin prüft keinen Runabschluss. |
| 4. Versuch bereitstellen | Core erzeugt echte attemptId/attemptNumber/runId, Lease und sichtbare Vorgängerartefakte; Invocationcontext erhält sie. | `stage-executor.ts:53–76,95–105,108–114`. Das Pipeline-Review-Plugin **liest diese Artefakte und Leaseidentität nicht**, sondern nur config.agent und statischen Graphinput (`pipeline-review/src/stage.ts:3–9`). |
| 5. Auftrag bauen | `buildRequest` erstellt protocol `kubeclaw.pipeline-review.v2`, agent, identity aus caller-runId/attempt, Task, evidence und requiredDimensions. | `pipeline-review/src/protocol.ts:1–15`: fünf Dimensionen architecture/agents/prompts/tests/configuration; Evidence enthält ausschließlich kind+digest. Kein projectId, moduleId, gateId, sourceRevision, Journalhead, Artifact-ID/Namespace oder konkrete Metrikwerte. |
| 6. Erste semantische Bruchstelle | Plugin sendet unaufgelöste kind/digest-Liste an Runtime; weder Existenz noch Inhalt, Producer/Run, Frische oder Vollständigkeit werden geprüft. | `pipeline-review/src/stage.ts:7–9`, gesamte Funktion; Manifest:11–14 hat **kein artifacts.read**. Genau hier ist eine belegte Auswertung *dieses* Runs nicht technisch sichergestellt. Bericht kann formal folgen; die weitere fachliche Auswertung ist nur unter extern bereitgestelltem vertrauenswürdigem Kontext plausibel, nicht garantiert. **T15-F01**. |
| 7. Agenttransport | `context.invoke('runtime.dispatch')` ruft ausgewählten Provider auf; Effectkey bindet tatsächlichen Coreattempt, Ressource Runtimeagent ist freigegeben. | `stage-executor.ts:79–92`; `skills/nova/core/execution/adapters.ts:49–61`; `skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts:25–32` prüft Fence/Abbruch/Target. Fachliche payload.identity wird nicht dadurch korrigiert. |
| 8a. HTTP-Provider | Serialisiert Payload unverändert, Größen-/JSONprüfung, HMAC über key+body bzw. konfigurierten SPIFFE-Proxy; POST mit Idempotencykey; prüft HTTPstatus/body. | `runtime-dispatch/src/adapter.ts:107–145`, `activate`. Keine Inhaltsauflösung des Evidence-Digests und keine fachliche Neuzuordnung zu R. Der gewählte Endpoint ist eine Vertrauensannahme; der Pakettest benutzt lokalen Antwortserver, keinen echten Agenten. |
| 8b. OpenClaw-Provider | Task/Payload, session label und Resultpfad erhalten payload-/effectgebundene Transportidentität; Spawn/Poll/Import mit Modell- und Deadlineprüfung. | `runtime-dispatch/src/openclaw.ts:207–224,234–286`, `spawnSession/dispatchOpenClaw`. `openclaw-result.ts:26–31`, `attachRuntimeEvidence`, hängt nur Implementation/Busterjudgment Sessiondaten an; PipelineReview erhält nicht automatisch Sessionevidence im Bericht. Providerwahl ist explizit, keine parallele Doppelexecution. |
| 9. Antwort prüfen | `parseReport(response.result,input)` akzeptiert ausschließlich status reviewed, nichtleere summary≤8192, 5–128 Observations, jede dimension/finding/priority; alle fünf Dimensionen erforderlich. | `pipeline-review/src/protocol.ts:16–31`. Unknown fields und fehlende Dimensionen blockieren. Report braucht keinen Beleg pro Observation, keine Referenz zurück zum Digest und keine gemessenen Werte. `priority:'high'` ist gültig und löst keine request_fix-Aktion aus. |
| 10. Identität ergänzen | Parser ergänzt runId/attempt aus Graphinput, nicht aus Corelease. | `protocol.ts:31`; `stage.ts:13`: Name `pipeline-review:<input.runId>:<input.attempt>`. **PCR-PREPORT-001**: R kann einen inhaltlich S genannten Bericht erhalten; neuer Coreattempt kann im Inhalt weiter Versuch1 heißen. Keine ACLumgehung daraus behauptet. |
| 11. Bericht persistieren | `artifacts.write/put_json`, Namespace kubeclaw.pipeline-review, report als JSON; store bildet SHA256 der kanonischen Bytes und Producer aus tatsächlichem request.attempt. | `pipeline-review/src/stage.ts:13–15`; `skills/common/plugins/artifact-store/src/adapter.ts:104–128`: Metadatenappend mit idempotencyKey vor contentadressiertem Blob, Rückgabe ArtifactRef. Calleridentity und core-owned Producer können widersprüchlich sein. Artefaktinhalt enthält keine Evidence-Liste des Inputs; Effectrequest hält diese getrennt. |
| 12. Stageresult und Abschluss | Plugin gibt passed+ArtifactRef zurück; Core persistiert attempt.completed, prüft Run-/Stageproducer und projiziert Artefakt/Stageabschluss. | `stage-executor.ts:33–47,133–140`; `run-decisions.ts:28–32,48–55,116–121`; PipelineLoop beendet bei letzten erfolgreichen Stages run.succeeded. **passed bedeutet Bericht erstellt**, nicht Pipeline ohne Fehler und nicht akzeptierte/implementierte Verbesserungsvorschläge. |
| 13. Konsum und Folgeaktionen | Abhängige Stages könnten die ArtifactRef über Context erhalten; Plugin selbst sendet keine Vorschläge an Forge, keine Tickets, keine Pull Requests, keine Konfigurationsänderungen. | Ganze `pipeline-review/src/stage.ts:3–16`, Manifest ausschließlich runtime.dispatch/artifacts.write. `skills/nova/plugins/case-study/src/stage.ts:3–11` verarbeitet eigenen Input; kein automatisches Lesen dieses Reports. Eine reine Graphkante zum CaseStudy erzeugt deshalb keine nachgewiesene inhaltliche Übergabe. |
| 14. Fehler/No-output | Throw beim Dispatch oder Parser wird blocked `pipeline_review.invalid_report` mit leerer artifacts-Liste. Fehler beim artifacts.write liegt außerhalb catch und propagiert in Corefehlerklassifikation. | `pipeline-review/src/stage.ts:7–15`; `stage-executor.ts:124–130`; `lifecycle/reducer.ts:98–102`: blocked stoppt; Timeout failed, generische Exception retry, ungewisser externer Effekt blocked. Gewöhnlicher transienter Dispatchfehler ist hier kein automatisch erneut laufender PipelineReviewversuch. |
| 15. Bedingte Fortsetzung | Bei autorisiertem Adminretry auf blocked neue Coreattemptidentität, unverändertes Graphinput; bei vollständigem neuen Bericht weiterer Artefaktdatensatz und Abschluss. | `engine-admin.ts:24–92,112–119`; `pipeline-loop.ts:118–129`. PCR-PREPORT-001 bleibt: input.attempt zählt nicht mit. Terminalen Run nicht per gewöhnlichem Resume öffnen; keine hier ausgeführte Entscheidung. |

## Daten-, Zustands- und Revisionenentwicklung

| Datum | Erzeugung und Prüfung | Tatsächliche Aussage |
|---|---|---|
| Ausführender Run/Stage/Attempt | Corelease → Effectrequest → ArtifactRef.producer | Technisch zugeordnet, aber nicht identisch mit report.runId/attempt erzwungen |
| Berichtziel | Statisches input.runId/input.attempt | Kann historischer/fremder Run sein, ohne als historisches Ziel markiert zu werden |
| SourceRevision | Kein eigenes Feld in Input/Report | Ein Pipelinebericht kann nicht selbst belegen, welchen Gitstand er bewertet hat |
| Evidence | 1–128 caller-kind/digest-Paare, SHA256-Formatregex | Keine Auflösung, Provenienz-/Frischeprüfung, Deduplizierung oder Inhaltsbindung |
| Beobachtungen | Agenttext je Dimension und Priorität | Fünf Dimensionen formal abgedeckt, kein Nachweis tatsächlicher Ursachenanalyse |
| Ergebnis | Kanonische Reportbytes + eigener SHA256 und Producer | Integrität des gespeicherten Berichts; nicht Wahrheit seiner Aussagen |
| Verbesserungsakzeptanz | Kein Entscheidungsfeld/Wait/request_fix im Plugin | Vorschläge bleiben Berichttext; menschliche spätere Arbeit außerhalb dieses Plugins |

Gleiche Evidenceeinträge sind erlaubt: Schema enthält kein uniqueItems und Stage keine Duplikatsuche. Auch ein syntaktisch gültiger Digest ohne gespeichertes Artefakt gelangt zum Reviewer. Es gibt keine technische Zusicherung, dass alle Modul-/Retry-/Fehlerpfade des Runs in der Liste enthalten sind. Der frei formulierte task könnte zusätzliche Fakten tragen; diese sind dann Caller-/Promptkontext, kein geprüfter Journalnachweis.

Eine geeignete bereits vorhandene Quelle wäre `skills/nova/core/telemetry/audit.ts:14–27`, `readPipelineAudit`: rungefilterte Events aus verifiziertem Journal mit SourceRecordHash, Journalhead und Digest. PipelineReview ruft diese Funktion nicht auf und besitzt dafür keinen automatischen Eingang. Die Existenz von Telemetrie macht ihre Nutzung durch den Reviewer nicht wahr.

## Findings und Abweichungen

### PCR-PREPORT-001 — Calleridentität statt aktiver Run-/Attemptbindung

**Niedrig; bestehender, statisch erneut bestätigter Provenienzdefekt.** Auslöser: Graphinput S/1, Corelease R/2. Request/Report/Artefaktname nennen S/1, ArtifactRef.producer R/2. Die README-Zusage „Reports must match the active run and attempt“ wird nicht erzwungen. Ursache `protocol.ts:10–13,31` und `stage.ts:7–15` ohne Leaseabgleich; HTTPprovider sendet Payload unverändert. Falls historischer Run gemeint ist, muss das separat beschrieben werden.

Behebung: ausführenden und bewerteten Run sauber getrennt typisieren; erstere Identität aus Lease beziehen, letztere gegen selektierte Evidence prüfen. Regression: Originalprovider/Store mit R≠S und zwei echten Attempts, Inhalt/Producer/Reportziel kontrollieren. **Nicht ausgeführt.** Gleiche Ursache beim CaseStudy deduplizieren unter dieser bestehenden Kennung.

### T15-F01 — Pipeline Review verarbeitet unbelegte Digestlisten statt geprüfter Run-Evidenz

**Mittel; statisch nachgewiesene Evidenz-/Nachvollziehbarkeitslücke.** Auslöser: formal korrekte, aber fremde, veraltete, doppelte oder nicht auflösbare kind/digest-Liste. Stage dispatcht unverändert und akzeptiert jeden formal vollständigen Fünfdimensionenbericht. Es werden keine Artefaktinhalte, Metriken, Runvollständigkeit oder Gitrevision deterministisch geladen/geprüft. Daraus folgt nicht, dass jeder Agentbericht falsch ist, wohl aber, dass `passed` keinerlei solche Prüfung belegt. Der Report speichert außerdem nicht einmal die Input-Evidence-Zuordnung.

Belege: vollständige `stage.ts:3–16`; `protocol.ts:1–31`; Manifest:11–14; Inputschema:1. Roots/Grants und HMAC schützen Transport/Operation, nicht behauptete Relevanz der Digests. README „evidence-pinned“ überzeichnet den Implementierungsstand.

Ursachenbehebung: begrenztes, versioniertes Reviewbundle aus autoritativer Runprojektion und vollständig qualifizierten ArtifactRefs herstellen, Inhalte beim originalen Store lesen und Run/Stage/Attempt/Source-/Digestbindung prüfen; Coverage und ausgelassene Quellen ausdrücklich deklarieren. Berichtsbeobachtungen mit Bundle-/Belegreferenzen persistieren. Keine automatische Umsetzung der Vorschläge ergänzen, um eine Beweislücke zu verdecken.

Verifikation: reale Journale/Artefakte von zwei Runs und zwei Sourcerevisionen, gültiges Bundle als Positivfall; nonexistent/cross-run/stale/duplicate Referenzen sowie manipulierte Inhalte getrennt prüfen. Originalruntime erhält nachweislich die geprüften Inhalte und erzeugt einen belegreferenzierenden Bericht. Kein solcher Test hier ausgeführt. CaseStudy mit demselben fehlenden Evidenzresolver als verwandte Ursache zusammenführen.

### Gewollte/fehlende optionale Abläufe, keine weiteren Defekte behauptet

- Ohne PipelineReview ist Abschluss implementiert. Die Installation erzwingt den optionalen Schritt nicht.
- Mit Stage ist sie ein normaler Graphknoten. Fehlender Bericht kann den gesamten Graph blockieren; „optional auswählbar“ bedeutet nicht „nach Auswahl best effort“.
- Tatsächliche Entscheidung eines Operators für diesen Schritt, automatische Runabschlussauswertung und spätere Annahme/Umsetzung von Verbesserungsvorschlägen sind in dieser Plugin-/Compilerkette nicht implementiert.
- Agent erforderlich, keine agentenfreie deterministische Reviewvariante in diesem Stagevertrag. Lokaler Testserver ohne echten Agenten ist ein Testaufbau, keine produktive Featurevariante.
- PipelineReview ist weder Echo-Freigabe noch CaseStudy noch Veröffentlichung.

## Wiederholung, späte Ergebnisse und Crashgrenzen

Core-Effectjournal bindet Runtimeinvocation an echten Attempt/key; gleicher abgeschlossener Effect kann Receipt wiedergeben. Neuer Attempt bekommt neuen Effectkey, auch wenn Plugininput.attempt unverändert bleibt. Der Artefaktstore verwendet den **Effectkey**, nicht nur artifactId als Appendidempotenz; daher nicht pauschal „zweiter Bericht überschreibt den ersten“ behaupten. Gleicher logical artifactId kann mehrere durch Producer/Digest differenzierte Aufzeichnungen erhalten (`artifact-store/src/adapter.ts:111–128`).

Core-Timeout und Leasewiderruf verhindern einen zweiten erfolgreichen Stagereturn nach Timeout (`stage-executor.ts:117–140`). Tatsächlicher Remoteabbruch bleibt offene Runtimeabhängigkeit (PCR-RUNTIME-001). Dispatchcatch im Plugin vereinheitlicht auch Effectprobleme zu invalid_report; fehlende sichere Receipts bleiben auf Core-Recoverygrenze relevant (`effect-recovery.ts:14–28`).

Kein eigener Zwischencheckpoint im PipelineReview. Crash nach persistiertem Report, vor Stage-/Artifactprojektion fällt unter **PCR-EXEC-002**; vorhandene Bytes sind nicht automatisch für Consumer projiziert. Keine erfundene Wiederaufnahme oder Transkriptarchivierung. Im README sind echter Reviewer, Transkripte, Retry-/Rate-limit-Parität und no-output recovery selbst als offen ausgewiesen.

## Tatsächlich geprüfte Tests und Restnachweise

**Ausgeführt nur statische Codelektüre und Abgleich der Originalgegenstellen. Keine Tests, CI, Agenten oder externe Send-/Schreiboperationen.**

- `skills/nova/plugins/pipeline-review/tests/protocol.test.mjs`, vollständig gelesen, **nicht ausgeführt**: feste fünf Observations, richtige Protokollkonstante, Ablehnung unbekannter Felder/fehlender Dimension. Kein Evidenceinhalt.
- `tests/live-function.test.ts` desselben Pakets, vollständig gelesen, **nicht ausgeführt**: Originalregistry, HTTP-/Secret-/Artifactadapter mit lokalem fest antwortendem Server. `input.runId='run-1'`, tatsächlicher Run `run:pipeline-review`; Test erwartet ausdrücklich den falschen Namen `pipeline-review:run-1:1`. Der Evidence-Digest ist ein konstanter Beispielwert, ohne zugehörige geladene Source. Kein echter Reviewer.
- `tests/package-boundary.test.mjs` desselben Pakets, vollständig gelesen, **nicht ausgeführt**: Regex-/Manifestprüfungen bestätigen gerade die beiden Fähigkeiten runtime.dispatch/artifacts.write, nicht Evidencequalität.

Historische Originaltestergebnisse im Komponentenreview werden hier nicht als neue Testausführung übernommen. Verbleibend: tatsächliche Auswahl durch Operator, authentifizierter Agentlauf mit vollständigem Runbundle, nachvollziehbare gemessene Verbesserungsgründe, Duplicate-/Stale-/No-output-/Crashmatrix und tatsächlicher Berichtsempfang. Terminales Artefakt ist der letzte hier belegte Produktoutput; keine funktionale Pipelineverbesserung ausgeführt oder behauptet.

## Empfohlene Reihenfolge

1. Reportziel/Ausführung und Evidenzvertrag richtig binden (PCR-PREPORT-001/T15-F01).
2. Gewünschten optionalen Trigger und Umgang mit Berichtfehlern explizit konfigurieren; finale Runprojektion von einem innerhalb desselben Runs ausgeführten Schlussknoten unterscheiden.
3. Echte Quellen-/Agent-/Persistenznachweise durchführen; Verbesserungsvorschläge anschließend separat prüfen und autorisieren.
