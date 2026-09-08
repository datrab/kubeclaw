# T09 — Wiederholte/neue Fehler, Retry-Limit und Needs Nova

Status: statisch vollständig bis Eskalation, Entscheidung und bedingter erneuter Prüfung verfolgt. Subagent `/root/trace06`. Kein ausgeführter Pipeline-/E2E-Test.

## Stand und Szenario

Codecommit für sämtliche Belege: **85ddfcbfc15e078780ea0434fc167e6f9a9b9488**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Zeilen 1-basiert. Vorreview gelesen: `docs/review/components/nova.execution.md` und zentrales Register am Reviewcommit `a9e080ab1e1981ec5713e9b742f94280835fd347`. Bestehende PCR-Kennungen werden weitergeführt. Vollständiger Baselinebaum enthält keine AGENTS.md; lokal noch nicht materialisierte Dateien wurden bei Bedarf exakt am Codecommit gelesen.

Ausgang: ein bereits gestarteter, gültig gepinnter Run R mit Modul M. Forge F hat H1 integriert, Lint L prüft H1, Echo E und Modultest T folgen. Pluginregistrierung/Grants/Artefaktspeicher gelten als vorhanden. Vorangehende Blocker wie PCR-IMPLEMENTATION-001 sind für den Start dieses Szenarios ausdrücklich überwunden bzw. als Voraussetzung ausgeklammert, nicht als behoben behauptet.

Varianten innerhalb dieses einzelnen Eskalationsszenarios:

- Produktcompiler mit `maxAttempts:2`, `maxRemediationCycles:2`, `timeoutMs:1800000`, ohne `orchestratorAfterAttempt`.
- Expliziter Graph mit größerem Gesamtbudget und `orchestratorAfterAttempt` unterhalb `maxAttempts`.
- Gleicher Fehler erneut oder neuer Fehler nach erster Reparatur; normales retry, request_fix, rate_limited, timed_out, explizites orchestrator_required.
- Nach Pause gültige/stale/doppelte Resumeentscheidung; nach blocked administrative retry/remediation/cancel; Crash um Entscheidungspersistenz.

Ende: derselbe gepinnte Run setzt mit autorisiertem zusätzlichem Versuch und erneuten erforderlichen Prüfungen fort oder endet nachvollziehbar blocked/failed/cancelled. Ein Erfolg ist nur ein bedingt hergeleiteter Codepfad.

## Ergebnis vorweg

**Der Compiler bietet keinen automatischen Übergang „Retry-Limit → Needs Nova → normale Fortsetzung“.** Wiederholte retry/request_fix-Ergebnisse führen bei verbrauchtem Budget zu `blocked`, nicht zu einem Wait. Der Core unterstützt einen optionalen **früheren** Orchestratorwait für normales retry sowie explizites `orchestrator_required`; diese Möglichkeiten sind von erschöpftem Budget verschieden. Ein bereits blocked Run braucht die gesonderte administrative Bibliotheks-API. Normales `--recover`/`--signal` öffnet ihn nicht.

Der administrative Reparaturpfad verwendet nicht die normale Reparaturinvalidierung. Das bereits in T04 geführte **PATH-T04-003** wird hier an Forge/Lint/Echo konkret bestätigt: vorheriges Lint kann nach neuer Forge-Revision erfolgreich stehen bleiben. Dieses Ergebnis ist kein neuer doppelter Befund.

## Übergangsfolge: Ergebnis bis Entscheidung und Rückweg

| Schritt | Aufrufer → Empfänger, Daten und Persistenz | Reaktion, Weiterweg und Codebeleg |
|---|---|---|
| 1. Gesamtbudget setzen | `compileProject` gibt allen vier Modulstages `{maxAttempts:2,maxRemediationCycles:2,timeoutMs:1800000}`. | `skills/nova/project/compiler.ts:112–134`, `compileProject`. Keine konfigurierbare eigene Retry-/Eskalationsoption in erlaubten Projekt-/Modulfeldern (`46–81`). T05 besitzt den Budgetbefund **PTR-T05-001**. |
| 2. Versuch beginnen | `PipelineLoop.#execute` prüft bereits verbrauchtes Budget; StageExecutor erzeugt UUID-attemptId, nächste attemptNumber, leaseId, timeout, grants und schreibt `attempt.created/dispatched`. | `skills/nova/core/execution/pipeline-loop.ts:118–131`; `stage-executor.ts:33–91,111–114`. Effectkeys enthalten R, Stage, attemptNumber und sequenzielle Invocationnummer. Modul-ID/Sourcebindung bleibt Aufgabe des Plugins. |
| 3. Ergebnis kanonisch speichern | Pluginresult wird gegen Resultschema validiert und als `attempt.completed`/`attempt.timed_out`/`attempt.cancelled` gespeichert. Dann `applyStageResult`. | `stage-executor.ts:33–47,124–140`. `skills/nova/core/lifecycle/reducer.ts:105–122` erhöht attemptNumber und attemptsUsed **bei jedem Ergebnis**, auch passed/wait/rate_limited. Unterschiedliche Findings erzeugen kein neues Budget. |
| 4. Normales retry | Reducer prüft Erschöpfung zuerst; andernfalls optional exakt erreichte Orchestratorschwelle, sonst schedule_attempt. | `reducer.ts:63–78`. `run-decisions.ts:63–67`: Zustand pending, `stage.retrying`, forcierte Neuauswahl. Eine unklassifizierte Pluginexception wird von StageExecutor gewöhnlich zu retry; ungewisse externe Effekte zu blocked (`stage-executor.ts:124–130`). Nicht jeder Fehler aus Forge/Lint/Buster ist daher ein gewöhnlicher Retry. |
| 5. Reparierbarer Befund | Lint/Echo/Test liefern request_fix mit Originalbefundartefakten; `on.request_fix` zeigt F. Reducer zählt zusätzlichen remediationCycle und prüft **beide** Grenzen. | `reducer.ts:80–87`; `run-decisions.ts:69–79`, `repairRequest`; `lifecycle/remediation.ts:13–51`: Requester, Ziel, Generation, vollständiges Result und invalidatedStageIds werden in `stage.waiting.payload.repairRequest` persistiert. Ziel F pending, Requester waiting, nachgelagerte alte Facts und Freigaben invalidiert. |
| 6. Tatsächlicher Rückweg zu Forge | F liest `context.contract.guidance.repairRequest`; liest referenzierte Artefakte run-/requester-/digest-/größengebunden und übergibt tatsächlichen Inhalt an buildRequest. | `skills/nova/plugins/implementation-agent/src/repair-evidence.ts:7–45`; `stage.ts:77–83`: neuer Workspace an HEAD bei repairRequest, Dispatch, Commit, Merge H2. `run-decisions.ts:124–129` setzt nach F-Erfolg den Requester pending; Graph erzwingt zuerst neu pending gesetztes Lint, dann Echo, dann Test. |
| 7. Derselbe/neuer Befund nach H2 | Kein Fehlerfingerprintvergleich im Lifecyclebudget: request_fix#2 erhöht dieselben Zähler; F2/Prüfversuche verbrauchen ebenfalls Gesamtbudget. | `reducer.ts:80–87,117–121`; `pipeline-loop.ts:120–123`. Compilerfall: F1 initial erfolgreich (1), F2 erste Reparatur erfolgreich (2), weiterer Reparaturbedarf erfordert F3, wird aber vor Dispatch geblockt. Oder Requester selbst erreicht seinen zweiten Versuch und blockt bereits dort. **Erste Bruchstelle für das gewünschte automatische Needs-Nova-Verhalten.** |
| 8. Terminaler Budgetabschluss | `stop` → `stage.blocked`, nach Batch `run.blocked`; bisherige Zähler bleiben erhalten. | `run-decisions.ts:108–114`; `pipeline-loop.ts:27–35,134–144`. Es wird kein Wait mit waitId angelegt. `engine-run.ts:40–43,76–84` lehnt gewöhnliches Recover/Resume bei terminalem Run ab. Die Empfehlung „einfach resume“ wäre hier falsch. |
| 9. Bedingte Vor-Limit-Eskalation | Expliziter Graph mit z.B. maxAttempts=4, orchestratorAfterAttempt=2: zweites normales retry → request_orchestrator. | `graph-build.ts:7–14` verlangt 1≤Schwelle<maxAttempts. `reducer.ts:74–78`; `run-decisions.ts:88–98` erzeugt neue waitId, kind orchestrator, `signalType:'core.orchestrator.resume'`, autorisierten `platform.orchestratorIssuerId`, expiresAt null, request.afterAttempt. `orchestrator.required` wird persistiert, Runstatus waiting. Es ist kein automatischer Lauf eines Nova-Agenten im Scheduler. |
| 10. Plugin entscheidet direkt Needs Nova | Ein Plugin kann `orchestrator_required` mit typisiertem Wait zurückgeben. | `reducer.ts:90–102`; `run-decisions.ts:88–98` übernimmt request, normalisiert Wait-ID/Typ/Issuer. Auch dieser Wait wird bei exhausted attempts **vorher** zu blocked reduziert. Beispiel aktiver Erzeuger: Reviewreducer (`skills/nova/plugins/review/src/review-reducer.ts:105–126`) liefert orchestrator_required für entsprechende Policyfälle; nicht mit Retry-Limit gleichsetzen. |
| 11. Benachrichtigung | Optional aktivierter notification-observer verarbeitet orchestrator.required oder run.blocked als unterschiedliche Ereignisse; sendet `operator.request/publish`. | `skills/common/plugins/notification-observer/src/observer.ts:3–33,111–137,161–189`: Run-/Stage-/Event-ID, Titel und Reasoncode. Daraus folgt keine interaktive Entscheidungserfassung oder automatische Dispatchaktion an Nova. Zustellbarkeit unterliegt bestehenden **PCR-NOTIFY-001/PCR-OPERATOR-001**; hier kein Discordsend ausgeführt. |
| 12. Gültiges Resume | Vertrauenswürdiger Aufrufer sendet ResumeSignal mit signalId, idempotencyKey, waitId, signalType, issuer, issuedAt, payload. | `engine-run.ts:76–115`: Runlock, gepinnte Packages/Graph, aktuelle Waitsuche und historische Waitzeile; `engine-snapshots.ts:112–119` prüft Schema, ID/Typ/Issuer, Alter/Ablauf. `signals.jsonl` vor `wait.resolved`; identischer Key/Payload idempotent, geänderter Inhalt/zweiter Waitentscheid abgewiesen. Issuergleichheit ist keine eigenständige kryptographische Authentifizierung: API setzt vertrauenswürdigen Host voraus. |
| 13. Resumeentscheidung anwenden | Recovery faltet wait.resolved → pending und continuationGuidance=signal.payload; StageExecutor bekommt diese Guidance. | `lifecycle/recovery-state.ts:161–166`; `pipeline-loop.ts:129`; `stage-executor.ts:53–76`. Es folgt ein **neuer** Versuch mit fortgeführten Zählern. Ein payload `approved:true` setzt generisch keinen Stageerfolg und keine Risikoakzeptanz; das jeweilige Plugin muss die Guidance tatsächlich auswerten. Ein gewöhnlicher Retry braucht nicht automatisch Forgearbeit oder neue Source. |
| 14. Blocked administrativ wiederöffnen | `reopenBlockedPipelineV2(platform,definition,decision,authenticate)` ruft AdministrativeReopener. | `engine.ts:15–16,33–34`; `engine-admin.ts:24–81`: separates Adminschema; Actor gegen Hostauthenticator und Allowlist, definierte Stage, Blockedstatus, feste Graph-/Packageidentität und erlaubte Upgradekette; identische bestehende Entscheidung replaybar, veränderte ID/Key-Payload abgewiesen. Administrative Entscheidung wird vor `run.resumed` persistiert. |
| 15. Admin retry | continuation=retry autorisiert genau einen zusätzlichen Stageversuch, ohne Counters zurückzusetzen. | `engine-admin.ts:84–92,112–119`: administrativeAttemptOverrides; `pipeline-loop.ts:118–129`; `run-decisions.ts:28–32,57–60`: nichtabschließende Folgeaktion des Overrideversuchs blockiert wieder. Nach Erfolg normale Nachfolger; wenn diese selbst exhausted sind, weitere eigene Entscheidung erforderlich. Bereits unter derselben Entscheidung erstellter unterbrochener Attempt wird nicht erneut spendiert. |
| 16. Admin remediation | continuation=remediation verlangt deklarierte Rückkante, freies Remediationbudget, nichtterminales F. Setzt Requester waiting und F pending. | `engine-admin.ts:69–81,121–127`: **kein repairRequest, keine Evidenceguidance, keine transitive Invalidierung und kein Override für F/Requester.** Bei F bereits2/2 blockt vor Dispatch; bei Budget verfügbar läuft F2, Lint kann auf H1 succeeded bleiben, Echo wird nach F-Erfolg erneut bereit auf H2. **PATH-T04-003**, bedingte zweite Bruchstelle für sichere Fortsetzung. |
| 17. Admin cancel | continuation=cancel schreibt stage.cancelled/run.cancelled mit Entscheidungs-Audit; keine neue Implementierung. | `engine-admin.ts:106–109`, `#cancel`. Option ist auf die validierte blocked-Wiederöffnung begrenzt. Keine implizite Worktree-, Namespace- oder Remote-Agentbereinigung aus diesem Status ableiten. |
| 18. Abschluss nach Behebung | Erst wenn nötige Budgets ausdrücklich autorisiert, Workspaces korrekt, externe Effekte geklärt und alle erforderlichen Rechecks erneut durchgeführt sind, können Graphstages succeeded und Run succeeded werden. | `pipeline-loop.ts:137–144`, `#finalize`; Sourceauswahl bei Lint/Test über SDK `source-revision.ts:5–38`, Review über `40–48`. Wiederhergestellte erfolgreiche Vorgänger sind nicht automatisch neue Nachweise für eine geänderte Revision. Ohne diese Bedingungen bleibt der Endzustand blocked/waiting/failed/cancelled. |

## Fehlerklassen und Counterentwicklung

| Ergebnis | Zählerwirkung | Tatsächlicher Weiterweg |
|---|---|---|
| retry, Budget offen | attemptsUsed+1 | nächster Versuch; bei optionaler exakt erreichter Schwelle orchestrator.required |
| retry, Limit erreicht | attemptsUsed+1 | blocked; keine automatische Needs-Nova-Pause |
| request_fix | attemptsUsed+1, remediationCyclesUsed+1 | declared repair oder blocked; orchestratorAfterAttempt wird hier nicht ausgewertet |
| passed | attemptsUsed+1 | succeeded; frühere erfolgreiche F-Arbeit hat dessen Budget bereits verbraucht |
| wait/orchestrator_required | attemptsUsed+1 | Wait nur unterhalb maxAttempts, sonst blocked |
| rate_limited | attemptsUsed+1 | waiting mit retryAt; `recoverPipeline` lehnt vor Fälligkeit ab und setzt danach pending (`engine-run.ts:66–73`); hier kein autonomer Timer-Scheduler im Coreloop |
| timed_out | attemptsUsed+1 | **failed**, nicht gewöhnlicher Retry; administrative API nimmt ausschließlich blocked, nicht failed |
| cancelled | attemptsUsed+1 | cancelled, keine automatische Wiederaufnahme |
| externe Operation ohne verlässlichen Ausgang | Attempt abhängig von Abbruchfenster | fail-closed Reconciliation; nicht aus failed Receipt ableiten, dass nichts passiert ist |

`maxRemediationCycles:2` bedeutet deshalb nicht „zwei erfolgreiche Reparaturen zusätzlich zur Erstimplementierung“. Siehe **PTR-T05-001** im T05-Bericht. Neue Findings statt desselben Findings setzen weder attemptsUsed noch remediationCyclesUsed zurück. Das begrenzt Schleifen korrekt, weicht aber vom gewünschten Eskalations-/Reparaturumfang ab.

## Findings, Abweichungen und Nachweisgrenzen

### T09-D01 — Needs Nova nach Retry-Limit fehlt im Compilerablauf

**Zielbildabweichung, mittel; statisch gesichert, keine eigenständige Behauptung eines kaputten optionalen Corefeatures.** Compiler setzt keine orchestratorAfterAttempt; Erschöpfung endet blocked. Graphvalidator verbietet Schwelle≥maxAttempts und request_fix nutzt Schwelle überhaupt nicht. Ein explizites Review-orchestrator_required bleibt möglich, wird aber bei Limit ebenfalls blocked. Ein optionaler früherer Corewait beweist nicht den gewünschten gemeinsamen Eskalationspfad.

Ursachenbehebung: gewünschte Disposition für retry exhaustion, Reparaturbudget exhaustion und operative blocked-Fälle produktseitig explizit definieren, einschließlich autorisierter Fortsetzung und begrenzter Zusatzversuche. Kein pauschales Reset der Zähler. Verifikation: echter Compilergraph, wiederholtes retry und request_fix sowie neuer Fehler nach erster Reparatur; Journal muss gewollten Wait/Entscheidungsbezug enthalten und genau die genehmigte Arbeit fortsetzen. **Nicht ausgeführt.** Budgetursache deduplizieren unter PTR-T05-001, wenn der Gesamtbericht diese Abweichung gemeinsam behandelt.

### PATH-T04-003 — Administrative Reparatur umgeht Invalidierung und Reparaturbelege

**Hoch; bestehende neue Tracekennung aus T04, hier bestätigt.** Auslöser: F succeeded, L succeeded auf H1, E blocked mit noch ausreichendem Reparatur-/F-Budget; autorisierter Admin wählt E→F remediation. `engine-admin.ts:121–127` verändert lediglich zwei States und schreibt zwei einfache Events. Normale `repairRequest/applyRepair` aus `remediation.ts:13–51` wird nicht benutzt. `repair-evidence.ts:8–9` liefert ohne repairRequest keine Originalbefunde. Nach F2/Integration H2 setzt `run-decisions.ts:124–129` E pending, während L weiter succeeded auf H1 ist. Damit Echo erneut ausführbar, ohne Lint H2.

Behebung: ein kanonischer administrativer Reparaturintent mit autorisierten Befund-/Sourcebelegen muss dieselbe transitive Invalidierungsfunktion und gleiche Replayprojektion wie normale Reparatur verwenden. An der Sonderfreigabe explizit festhalten, welche zusätzlichen Attempts genehmigt sind. Geeignete Verifikation: Originalcompiler-/Pluginpfad F→L→E→T, reale Artefakte H1/H2; administrative Reparatur muss alte L/E/T-Facts invalidieren, tatsächliche Befundinhalte an Forge liefern und Lint H2 vor Echo H2 ausführen. Originalphase6 deckt dies nicht ab; sein Adminbeispiel ist ein anderes Zweistagemuster.

### Wiederverwendete PCR-Befunde

- **PCR-EXEC-001:** Crash nach attempt.completed vor orchestrator.required. `recovery-state.ts:37–77` rekonstruiert Wait, `engine-run.ts:60–61` verlangt Signal, `validateWaitHistory:95–101` verlangt aber separate payload.wait-Zeile. Originalvorreview belegt die Sackgasse; hier Codegegenprüfung, kein erneuter Crashlauf.
- **PCR-EXEC-002:** Persistiertes Resultartefakt ist nach bestimmtem Crashpräfix noch nicht projiziert; Gegenstelle kann Source-/Fehlerevidence nicht aus normalen sichtbaren Artefakten beziehen. Hier Abhängigkeit aus Vorreview, keine neue Reproduktion.
- **PCR-IMPLEMENTATION-001:** Jede tatsächlich notwendige neue Forgearbeit behält die bereits dokumentierte Workspaceübergabelücke; im Ausgang dieses Szenarios explizit ausgeklammert.
- **PCR-NOTIFY-001/PCR-OPERATOR-001:** ein persistiertes Needs-Nova-/Blocked-Ereignis ist kein bestätigter Operatornachrichtenempfang; Zustellpfad nicht als erfolgreich behauptet.

## Persistenz, Doppelzustellung und Unterbrechungen

Run-/Graph-/Packageidentität ist in den Snapshots gepinnt. Eine graphändernde Budgeterhöhung im ursprünglichen JSON wird beim Resume/Recovery abgewiesen; administrative Zusatzversuche sind der getrennte Mechanismus. Adminpaketupgrades dürfen eine deklarierte, auditierte Versionskette bilden; dieser Trace verwendet keine Upgrades und ändert den Prüfcommit nicht.

Adminjournal und Lifecyclejournal sind getrennt: `engine-admin.ts:48–52` schreibt erst Entscheidung, danach `run.resumed`. Exakte gespeicherte Entscheidung wird ohne erneute Actorabfrage verwendet (`61–65`), weil der persistierte autorisierte Intent fortgilt. `#hasEvent/#appendOnce:130–137` bindet Folgewirkungen an decisionId. Ein bereits terminal abgeschlossenes Replay liefert gespeicherten Abschluss, erzeugt keinen weiteren Versuch. Ein unterbrochener verbrauchter Adminretry wird blocked statt doppelt ausgeführt (`112–119`).

Externe Effekte haben eigenen Journal-/Receiptvertrag. `effect-recovery.ts:14–28` blockiert accepted-ohne-Receipt und unterbrochene externe Effekte auch vor executePrepared im Adminpfad. Eine neue Adminentscheidung allein beweist keine Reconciliation eines möglicherweise bereits wirksamen Git-/Agentaufrufs. `stage-executor.ts:117–140` verhindert spätes erfolgreiches Stageergebnis nach Timeout durch Promise.race und Leasewiderruf; externes tatsächliches Stoppen bleibt Runtime-/Adapterpflicht.

Die konkrete `reopenBlockedPipelineV2`-API ist implementiert/exportiert. Die gelesenen Produktions-CLIs `skills/nova/core/cli.ts:55–68` und `skills/nova/project/cli.ts:19–24,42–45` bieten run/recover/signal, aber keinen administrativen reopen-Befehl. Daraus wird **nicht** die repositoryweite Nichtexistenz jedes anderen Adminclients abgeleitet. Für Operator/Discord → authentifizierter Adminaufruf ist hier kein vollständiger Bedienpfad belegt.

## Ausgeführte Prüfungen und gelesene Tests

**Ausgeführt: ausschließlich statische Lektüre, Originalseitenvergleich und Gegenabgleich mit Vorreviews. Keine Tests, CI oder Simulationen ausgeführt.**

| Originaltest, gelesen und NICHT AUSGEFÜHRT | Tatsächliche Aussage seines Inhalts | Begrenzung |
|---|---|---|
| `tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs` | retry1, Orchestratorschwelle2 bei max3, exhausted3 und request_fix als Reducerfälle | Synthetische Stage; kein Compiler-F→L→E→T, keine administrative Recheckfolge |
| `tests/verification/contracts/check-plugin-system-v2-resume.mjs` | Originalengine mit Fixturewait, gepinnter Graph, gültiges Resume, stale/doppelter Signalpfad | Vollständig persistierter Wait; deckt PCR-EXEC-001-Fenster nicht ab |
| `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:429–600` | Auth-/Allowlistablehnung, konkurrierende idempotente Adminretryaufrufe, persistierter unapplied Intent, erfolgreiches replay; administrative remediation | Adminremediation ist `approval(blocked_then_pass) → fix`, maxAttempts2 (`560–575`), **ohne bereits erfolgreichen Lintvorgänger**, ohne echten Forge-Repairvertrag |
| `tests/verification/reliability/lifecycle.test.mts` | Normale Reparatur mit Originalrecorder/-journal invalidiert Lint und erhält Fehlerevidence; SIGKILL nach vollständiger wait.resolved-Zeile erhält Guidance | Normaler repairRequest-Pfad, nicht engine-admin.#remediate; eigene synthetische Stageergebnisse; kein E2E |

Historische „bestanden“-Angaben des Komponentenreviews wurden nicht als in diesem Auftrag ausgeführte Tests übernommen. Offene Laufzeitnachweise: echte Pluginfehlerklassifikation durch Buster/Runtime, mehrere echte Revisionen mit Reparatur und frischer Lintfolge, authentifizierter Operatorentscheid, Crashfenster um Adminintent/Attempt und externe Reconciliation, Cooldownwiederaufnahme und spätes externes Resultat.

## Empfohlene Ursachenbehebung

1. Administrative Reparatur mit normaler Evidence-/Invalidierungslogik zusammenführen (PATH-T04-003), bevor sie als Wiederaufnahmeweg empfohlen wird.
2. Compilerbudgets und gewünschte Eskalationsdisposition zusammen definieren (PTR-T05-001/T09-D01); feste Graphbindung bewahren.
3. Waitpersistenz-/Recoveryquelle vereinheitlichen (PCR-EXEC-001) und echte Resultartefaktprojektion sicherstellen (PCR-EXEC-002).
4. Authentifizierte Bedienkette zu genau begrenzten Entscheidungen und vollständigen Rechecks verifizieren; keine implizite „Akzeptanz“ durch freien Signaltext oder Statuslabel.
