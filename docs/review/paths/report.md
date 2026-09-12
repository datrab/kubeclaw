# Gesamtbericht — Komponentenübergreifende Pipeline-Traces

**Abgeschlossen: 16 von 16 Szenarien delegiert, geliefert und durch den Orchestrator statisch gegengeprüft.** Der gewünschte Gesamtlebenszyklus ist am geprüften Stand nicht durchgängig implementiert. Vorhandene Bausteine und korrekt zusammengesetzte explizite Graphen tragen wesentliche Teilabläufe; der normale Projectcompiler erzeugt lediglich die serielle Modullane. Mehrere bestätigte Übergabe-, Zustands- und Abschlussdefekte blockieren zudem bedingt zusammengesetzte Pfade.

**Kein Laufzeit-, Integrations- oder E2E-Test wurde ausgeführt.** Ein statisch vollständig verfolgtes Szenario ist kein bestandener Test. Keine funktionalen Änderungen, Deployments, Publikationsschritte, CI-Läufe, PRs oder Merges; geändert wurden ausschließlich Dateien unter `docs/review/paths/`. Die Dokumentationscommits tragen `[skip ci]`.

## Prüfstand, Quellen und Vollständigkeitsmethode

| Gegenstand | Festgehaltener Stand |
|---|---|
| Repository / Code | `datrab/kubeclaw` — `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` |
| Code-Tree | `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0` |
| Vorhandene Pipeline-Einzelreviews | `a9e080ab1e1981ec5713e9b742f94280835fd347`, 93 Komponenten, 103 historische PCR-Kennungen |
| Vorhandene Infrastrukturreviews | `eac591fb060458ebb6c6ba34599309e8c424bd08`, 29 Inventareinträge |
| Reviewdatum | 2026-09-08 |
| Ergebnisbranch | `docs/pipeline-path-review-20260908` |

Die vollständigen Git-Trees beider Vorreviewstände wurden mit dem Codecommit verglichen: außerhalb `docs/review/` keine Blobabweichung. Alle Subagenten erhielten ausdrücklich denselben Codecommit. Spätere Remediationbranches sind ausgeschlossen. `CONTRIBUTING.md`, beide Reviewleitfäden, Inventare, vorhandene Befundregister und relevante Eigentümerberichte wurden gelesen; in diesen Trees existiert keine `AGENTS.md`. Die Inventare dienten zur Orientierung, ihre Aussagen wurden an Entrypoints, Compiler-Rückgabe, Plugin-/Rollenregistrierungen, Transportadaptern und Consumern überprüft.

Jeder Subagent erhielt genau ein Szenario mit Voraussetzungen, Varianten, Rückwegen, vorgesehenem Endzustand und eigener Datei. Sechs Agenten bearbeiteten zunächst T01–T06, anschließend je ein freigewordenes Szenario bis T16. Gemeinsame Matrix und Gesamtbericht gehören dem Orchestrator. Nach der Abgabe wurden Vollständigkeit, Fehlerklassifikation, widersprechende Aussagen und Quellenstichproben geprüft; erforderliche Korrekturen wurden zurückgegeben. Details stehen im eingebetteten Gegenprüfungsprotokoll.

Alle folgenden Codebelege beziehen sich auf den obigen Codecommit, auch bei verkürzten Wiederholungen des Pfadnamens. In Trace-Belegindizes definierte Kürzel C1 usw. gelten innerhalb dieses Traces; beim zentralen Finding ist dessen Eigentümertrace genannt. Historische Befunde behalten ihre Kennungen, Severity und Evidenzgrenzen. Historische Testpassagen im Quellenanhang sind ausdrücklich Ergebnisse der Vorreviews, keine hier ausgeführten Tests.

## Abdeckungsmatrix

| Szenario | Komponenten / Übergänge | Variante / Fehlersituation | Subagent | Status |
|---|---|---|---|---|
| T01 | Gesamter Happy Path | Architektur bis Operatorzugang; Folgeschritte aus | trace01 | gegengeprüft (statisch) |
| T02 | Designiteration | Drei Designs, Ratings, persistiertes Feedback und spätere Nutzung | trace02 | gegengeprüft (statisch) |
| T03 | Architektur nachbessern | Manueller Modulplan, Review, Reparatur, erneute Freigabe | trace03 | gegengeprüft (statisch) |
| T04 | Risikoakzeptanz | Bewusste Akzeptanz; veraltete/doppelte/unautorisierte Freigabe | trace04 | gegengeprüft (statisch) |
| T05 | Modulreparaturen | Lint-, Echo- und Modul-Testfehler; erneute Prüfung | trace05 | gegengeprüft (statisch) |
| T06 | Parallele Module | A/B parallel, C abhängig; Merge und integrierte Revision | trace06 | gegengeprüft (statisch) |
| T07 | Git-Ausfälle | Konflikt, Commit-/Merge-/Pushfehler und ungewisser Abschluss | trace02 | gegengeprüft (statisch) |
| T08 | Restart und Resume | Crash zwischen Persistenz, Dispatch, Result und Bestätigung | trace01 | gegengeprüft (statisch) |
| T09 | Retry-Eskalation | Wiederholte/neue Fehler bis Limit; Needs Nova und Entscheidung | trace06 | gegengeprüft (statisch) |
| T10 | Minimale Prüfungen | Nur Lint, Echo aus, Test-Agent aus; unterstützte Konfigurationen | trace03 | gegengeprüft (statisch) |
| T11 | Deterministische Suites | Bisher 13; Auswahl, Provider, Ausführung, Auswertung, Agent aus | trace04 | gegengeprüft (statisch) |
| T12 | Test-Agent | Suite-first und Agenturteil; Widerspruch, Ausfall, späte Antwort | trace05 | gegengeprüft (statisch) |
| T13 | Kumulative Gates | Test-/Reviewgate nach M5; Reparatur und Invalidierung | trace02 | gegengeprüft (statisch) |
| T14 | Operator-Testzugang | Namespace erhalten, Tailscale, Auth, Nachricht, Feedback, Cleanup | trace03 | gegengeprüft (statisch) |
| T15 | Pipeline Review | Mit/ohne Auswertung; Runidentität, Beweise, Ergebnisnutzung | trace06 | gegengeprüft (statisch) |
| T16 | Case Study und Abschluss | Optionale Case Study; Beweisbindung, Summary, Abschluss ohne sie | trace01 | gegengeprüft (statisch) |

Der Status „gegengeprüft (statisch)“ bedeutet abgeschlossene Reviewarbeit. Szenarioergebnisse und erste Bruchstellen stehen in den vollständigen Tracekapiteln; kein Szenario wird als runtime-passed eingestuft. T01 verfolgt den Gesamtpfad einschließlich bedingter Fortsetzung; T02–T16 vertiefen unterschiedliche Übergänge und Varianten. Eine frühe Bruchstelle beendet die Untersuchung nachfolgender Abschnitte nicht: deren zusätzliche Voraussetzungen sind ausdrücklich festgehalten.

## Zielablauf und tatsächliche Implementierung

| Ziel / Übergang | Implementierter Stand und Aussagegrenze | Abdeckung |
|---|---|---|
| Operator und Nova erarbeiten Architektur / Modulplan | Menschliche Zusammenarbeit und Agentanweisungen; gemeinsame Modulplanung bleibt bewusst manuell. Kein Defekt allein wegen fehlender Automatisierung. CLI/Compiler konsumieren strukturierte Inputs, erzeugen aber diesen Dialog nicht. | T01, T03 |
| Nova-Spec → Prism → drei Designs | Control/Storage/Stage/Agentbridge/Worker vorhanden; drei Richtungen werden agentisch geliefert und strukturell geprüft. Der Projectcompiler startet diese Kette nicht automatisch. Registryeintrag allein ist kein Ablauf. | T01, T02 |
| Auswahl, Rating, Gewichtung und Operatoranpassung | Auswahl/Revision/Feedbackpersistenz und deterministische Präferenzprojektion vorhanden. Der tatsächliche Generationspfad konsumiert die gespeicherte Projektion nicht. Gleichwertige Generation derselben Architektur hat keine neue Rundenidentität; verspätete Antworten können neue aktive Architektur treffen. | T02 |
| Freigegebenes Design zurück an Nova | Separater Prism-Stage-/Wait-/Artefaktpfad bedingt vorhanden, abhängig von korrekt gekoppelter Architecture-/Designidentität, funktionierender Worker-/Storagekette und Signalzustellung. | T02, T08 |
| Arch-Reviewer / Acceptance | Architekturreview und separate Approvalstage vorhanden, im Projectcompiler fehlen sie. Archviewer ist ein Präsentations-/Beobachtungsdienst, nicht der Reviewer. Ohne Reviewer ist der heutige Projectgraph möglich; damit ist kein gleichwertig geprüftes Architekturziel erreicht. | T03, T04 |
| Beheben oder bewusst akzeptieren | Nichtblockierende Findings eines passed-Reports können explizite Entscheidung verlangen. Ein blocked-Architekturbericht kann nicht mittels vorhandener Acceptance bewusst freigegeben werden. Reportbytes sind gebunden, überprüfter Source-/Planstand nicht. Ablehnung hat keinen fertig gekoppelten Nova-Reparatur-/Re-reviewdialog. | T03, T04, T09 |
| Forge pro Modul gemäß Planung | Compiler erzeugt implement→lint→review→test mit vorherigem Modultest als Dependency. Die ältere Scaffold-/pipeline.json-Anleitung passt nicht vollständig zu diesem Einstieg. Runtime erhält den erzeugten Worktree nicht. | T01, T05, T07 |
| Lint nach jedem Modul, vor Echo | **Im aktuellen Compiler umgesetzt:** eigenständige Lintstage vor Review, nach normaler Reparatur erneut fällig. Echo-/Testagentabschaltung fehlt im Projektmodell; explizite Graphen können andere Varianten modellieren. Lint-not_applicable bzw. Deliverylint ist keine allgemeine Testabdeckung. | T05, T10 |
| Parallele Module / Integration | Core-DAG kann A/B parallel und C abhängig ausführen, Compiler selbst ist seriell. Worktree-/Mergepfad vorhanden; Repositorylock-Konkurrenz blockiert statt kontrolliert zu warten. Sourcebindung nach Merge ist von gleichzeitigen HEAD-Mutationen zu unterscheiden. | T06, T07 |
| Test-/Lint-/Reviewfehler → Forge → Wiederprüfung | Normaler request_fix erzeugt digestgebundene Befunde, invalidiert transitive Nachfolger und erzwingt neue Prüfungen. Administrative Reparatur verwendet diese Invalidierung nicht vollständig. | T05, T09, T13 |
| Neue Fehler / Retry-Limit / Needs Nova | Monotone Attempt-/Reparaturbudgets vorhanden. Compiler maxAttempts=2 zählt schon initialen Erfolg; eine zweite zusätzliche Forge-Reparatur wird verweigert. Budgeterschöpfung ist blocked, kein automatisch erzeugter Needs-Nova-Wait. Frühe Coreeskalation ist gesondert optional. | T05, T09 |
| Kumulatives Test-/Reviewgate nach M5/M6 | Explizite Planscopes und Reviewbaselines können den integrierten Stand prüfen. Automatische Gatekomposition und verbindliche kumulative Modul-/Requirementcoverage fehlen. Derselbe Sourcecommit beweist nicht denselben Prüfumfang. | T11–T13 |
| Deterministische Suites und Agent-Tests | 13 historische Kategorien entsprechen 12 aktuellen Suitetemplates; Providerinventar ist eine dritte Ebene. Auswahl erfolgt explizit. Native Auswertung geht vor Agenturteil; ein Quality-Agent wird nicht technisch zu zusätzlichen Anwendungstests verpflichtet. | T11, T12 |
| Abschließende Evidenz | Separate Summary liest aktuelle run-/attempt-/digestgebundene Source-, Lint-, Review- und Qualitybelege. Sie startet keine Tests und prüft nicht unabhängig die vollständige autorisierte Modulmenge oder kumulative Coverage. | T13, T16 |
| Namespace, Tailscale, Login und Operatornachricht | Fixture-/Controller-/Exposurebausteine vorhanden, Namespace-retain bis TTL möglich. Planfinally entfernt trotzdem Exposure. Secretanlage ist kein App-Login; vollständiger URL-/Credential-/Feedback-Handoff fehlt. | T14 |
| Operator testet / Abnahme / weitere Änderungen / Cleanup | Kein durchgängiger app-/sourcegebundener Abschlussdialog. Explizite Folgearbeit benötigt passenden Graph oder neuen Run. Generische Approval-/Observermechanismen ersetzen diesen Vertrag nicht. Controller-TTL/Finalizer und explizites Release sind vorhanden. | T08, T14, T16 |
| Pipeline Review / Case Study | Als ausdrücklich deklarierte Stages optional verfügbar; keine automatische Runabschlussverdrahtung. Agentberichte sind formatvalidierte Entwürfe ohne überprüfte Quellenbindung. Weglassen im ursprünglichen Graph erlaubt Abschluss; aktivierter Fehler blockiert. Keine automatische Veröffentlichung. | T15, T16 |

## Ergänzte und zuvor unzureichend berücksichtigte Komponenten

| Ergänzung | Warum sie für den Ablauf erforderlich ist |
|---|---|
| `pipeline.ts`, Project-CLI, Compiler, Setup-/Progressscaffold | Mehrere Inputmodelle und Einstiegspunkte; ein vorhandenes pipeline.json und ein registriertes Plugin beweisen keinen zusammenhängenden Produktgraphen. |
| Registry-/Rolleninstallation, Platformsnapshot, Capabilitygrants | Bestimmen, ob eine Stage/Adapterkombination wirklich ausführbar und autorisiert ist. Promptanweisungen installieren keine Fähigkeiten. |
| Blueprint-sync und Preflight | Übergabe des freigegebenen Plans, vorhandene Dateien und Forgebereitschaft; eigenständige Grenzen zwischen Akzeptanz und Implementation. |
| Prism Control/Storage, Preferenceprojection, Worker/Agentbridge, Archviewer | Persistierte Entscheidung, neue Generation, Agentinput und sichtbare Darstellung sind verschiedene Komponenten. Die Präferenzprojektion muss im realen Generationseinstieg verwendet werden. |
| Corejournal, Reducer, Snapshot-/Wait-Recovery, Effectreceipt, Locks und Leases | Regeln Crashfenster, genaue Attemptidentität, Wiederaufnahme, Freigabeinvalidierung und unsichere externe Seiteneffekte. |
| Gitworktree, Runtime-cwd, Commit/Merge/Cleanup und Sourcesnapshot | Nur deren durchgängige Bindung stellt sicher, dass Forge, Lint, Review, Buster und Summary denselben Code meinen. |
| Signiertes Sourcearchiv, Remotejob, Evidenceimport und native GateDecision | Nova→Buster ist keine bloße Agentnachricht. Job-/Plan-/Run-/Node-/Attempt-/Digestvalidierung ist Bestandteil des Qualitätsnachweises. |
| Reportadapter, Provider-/Fixturegraph und Cleanupfinally | Suitevorlage, tatsächlicher Testprozess, Ergebnisparser und Aufräumen haben unterschiedliche Erfolgs-/Abbruchsemantik. |
| Registrybuild, NamespaceLeasebroker/Controller, NetworkPolicy und Tailscale-Ingress | Imageerzeugung allein liefert keine erreichbare Anwendung. Namespace-retain, Exposurelebensdauer und Tailnetzugriff sind unabhängig. |
| Testcredential-Secret, Appkonfiguration, Operator-messaging/Notificationobserver | Secretzugriffsrecht eines ServiceAccounts ist weder Appauthentifizierung noch sichere menschliche Zustellung. |
| Deliverymanifest, optionale Agentberichte, Clawdeckobservation und TTL/Finalizer | Succeeded/Generated ist weder Operatorabnahme noch Publikationsfreigabe; nachträgliche Bereinigung braucht einen eigenen Lebenszyklus. |

Konkrete Korrekturen der Vorarbeit: Die Summary-/Qualitygate-Komponentenreviews schreiben dem Compiler finale Gates zu, die seine Rückgabe nicht enthält. Der aktuelle Quality-Agent verwendet `kubeclaw.buster-quality-gate.v2`; Altpfade für `buster-test-judgment.v2` dürfen nicht als aktueller Sessionevidenzanschluss ausgegeben werden. „13 Suites“ ist eine historische Taxonomie, keine automatisch ausgeführte vollständige aktuelle Suiteauswahl. Diese Korrekturen ändern die Implementierung nicht und erklären widersprechende Reviewaussagen.

## Konsolidierung und Klassifikation

Der neue Befundregisterteil enthält **17 eindeutige Ursachen-/Integrationskomplexe**; Trace-Aliasse bleiben nachvollziehbar. Produkt-/Policyabweichungen werden ausdrücklich von Defekten bestehender Mechanismen getrennt. Hinzu kommen die in den Traces relevanten historischen PCR-/IFR-Kennungen im Quellenanhang. Ihre bloße Verknüpfung bedeutet keine neue Reproduktion. IFR-04-001 bleibt eine offene externe Zugriffsvoraussetzung; IFR-03-002 ist ein abgegrenzter Archviewerbefund, kein zusätzlicher Anwendungspreviewdefekt.

| Kanonische Kennung | Zugeordnete Trace-Aliasse / gemeinsame Ursache |
|---|---|
| T01-F01 | Keine neue Aliasnummer |
| T01-F02 | F-T03-01, F-T10-01 |
| PATH-T02-001 | Keine neue Aliasnummer |
| PATH-T02-002 | Keine neue Aliasnummer |
| PATH-T02-003 | Keine neue Aliasnummer |
| PATH-T04-001 | F-T03-02 |
| PATH-T04-002 | Keine neue Aliasnummer |
| PATH-T04-003 | F-T03-03 |
| PTR-T05-001 | T09-D01 |
| T06-F01 | Keine neue Aliasnummer |
| PATH-T07-001 | Keine neue Aliasnummer |
| PATH-T11-001 | Keine neue Aliasnummer |
| PATH-T11-002 | Keine neue Aliasnummer |
| PATH-T13-001 | Keine neue Aliasnummer |
| F-T14-01 | Keine neue Aliasnummer |
| F-T14-02 | Keine neue Aliasnummer |
| T15-F01 | Keine neue Aliasnummer |


Die nachstehenden Findingeinträge enthalten Auslöser, Folgen, Schweregrad, Codebelege, Ursachenbehebung und geeignete spätere Verifikation. Danach folgen sämtliche Tracefolgen mit Daten-/Zustandsentwicklung, Varianten und tatsächlich durchgeführten Prüfungen. Doppelte Findingbeschreibungen aus Einzeltraces wurden in diesem Register zusammengeführt; die Originaldateien sind zusätzlich verlinkt.

## Neue eindeutige Findings

### T01-F01 — Setupanleitung und Scaffold bilden keinen ausführbaren Einstieg in den aktuellen Projectmodus

Eigentümertrace: [T01-happy-path.md](T01-happy-path.md); Codecommit wie oben.

**Mittel; nachgewiesene Vertrags-/Dokumentationsabweichung, keine Laufzeitreproduktion in T01.** Auslöser: neues Projekt nach `project_setup/SKILL.md` erzeugen und mit dortigen Flags starten. Der geschlossene aktuelle Parser weist diese Flags ab; die vom Scaffold geschriebenen Formate entsprechen auch nach Korrektur der Flags nicht dem Compilereingang. Folge: Operator/Nova erreichen die erste Modulstage über den beschriebenen Setupweg nicht. Belege: `project/cli.ts:16–29`; `compiler.ts:47–58`; `progress-scaffold-validation.ts:236–263` und `project_setup/SKILL.md` Abschnitte 7/8. Vorreview `nova.scaffold.md` beschreibt die Abweichung bereits ohne eigene Kennung; `PCR-SCAFFOLD-001` ist ein **anderer** Defekt (Verlust editierter Pläne bei Regeneration), hier nicht umbenannt.

Ursachenbehebung: einen kanonischen Projekt-/Graphautorierungsweg und expliziten Legacyimport festlegen; Anleitung und Scaffold daran angleichen. Verifikation später: frisch erzeugte echte Projektdateien durch Original-CLIvalidierung führen, alle dokumentierten Befehle prüfen, dabei Compile und Execution getrennt nachweisen.

### T01-F02 — Projectcompiler deckt nur die Modullane ab, kann aber danach einen erfolgreichen Run melden

Eigentümertrace: [T01-happy-path.md](T01-happy-path.md); Codecommit wie oben.

**Hoch bezogen auf den angefragten Produktlebenszyklus; nachgewiesene Integrationslücke, kein isolierter Fehler des generischen Core.** Auslöser: `nova-project.v1` als Umsetzung des hier erwarteten Gesamtprojekts benutzen. Geschlossener Compilerinput und vollständige Stageerzeugung liefern nur 4N Stages. Architektur/Prism/Acceptance, eigenständige kumulative Gates, Summary und Operatorübergabe sind nicht zusammengesetzt. Nach den definierten Modulstages meldet Core zutreffend Graph-Erfolg; dieser erfüllt jedoch nicht die gewünschten Liefer-/Abnahmekriterien. Belege: `compiler.ts:47–58,103–137`; `pipeline-loop.ts:137–144`; Summary ist vorhanden (`project-summary/src/stage.ts:3–11`), wird aber nicht erzeugt. Vorreview `nova.entry.md` bestätigt exakt vier Stages/Modul; dies ist kein Widerspruch dazu.

Ursachenbehebung: Produktzustände und explizite Artefaktbindungen über Vorphase, manuelle Planfreigabe, Modullane, kumulative Gates und Operatorübergabe definieren; der generische Core bleibt stagenamenunabhängig. Falls der Compiler absichtlich nur eine Teilpipeline bleibt, muss die übergeordnete Komposition den vollständigen Abschluss erzwingen und Teilabschluss entsprechend kennzeichnen. Spätere Verifikation: echter Graph aus zwei Modulen zeigt alle erforderlichen Kanten und finale Kandidatenbindung; keine Delivery vor fehlender Acceptance, finalen Gates oder Access-Handoff. Ein zusätzlicher bloßer Summaryknoten ersetzt keinen kumulativen Review: dessen Scope/Baseline sind gesondert zu belegen.

**Zusammengeführte Ausprägung F-T03-01 (T03):** Architektur-/Acceptancepflicht fehlt im Projectablauf.

**Hoch; statisch bestätigte Zielbild-/Integrationslücke.** Auslöser: Start eines regulären nova-project.v1 mit manueller Architektur, erwarteter Reviewer-/Acceptancepflicht. Compiler erzeugt sofort Implementierung ohne diese Stages (`compiler.ts#compileProject:103–136`). Auswirkung: Die gewünschte Vorbedingung ist dort nicht technisch erzwungen; kein behaupteter Umgehungsangriff gegen eine bestehende Autorisierungsgrenze. Rootfix: Produktgraph aus expliziter Architektur-/Planreviewpolicy kompilieren oder den bewusst externen Approvalvertrag als signierte/digestgebundene zwingende Eingabe verlangen. Verifikation: Originalproject mit offenen Findings darf Forge nicht dispatchen; clean, repair und bewusst akzeptierte Findings jeweils getrennt durch echten Graph nachweisen. Bestehende Architektur-/Approvalreviews nennen die fehlende Compilernutzung, vergeben hierfür aber keine PCR-ID.

**Zusammengeführte Ausprägung F-T10-01 (T10):** Optionale Echo-/Testagentabschaltung fehlt im Projectmodell.

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

### PATH-T02-001 — Gespeicherte Präferenzen beeinflussen den implementierten Generationspfad nicht

Eigentümertrace: [T02-design-feedback.md](T02-design-feedback.md); Codecommit wie oben.

**Mittel; nachgewiesene Integrationslücke im untersuchten Pfad.** Selbst nach Behebung von PCR-PRISM-CONTROL-002 laden spätere Design-/Revisionsaufträge keine gespeicherten Events oder gewichtete Projektion. `control.ts:471–479,647–654` sendet Architektur beziehungsweise instruction+Dokument. `agent-bridge.mjs:67–74,84–90,98–103` konstruiert entsprechende Prompts ohne Nutzer-/Preferencekontext. `openclaw-plugin/index.mjs:22–75` registriert nur Create/Apply, keinen Preference-Leseweg; `control.ts:1124–1134` wird vom Studio zur Darstellung benutzt. Das ist kein Nachweis, dass ein LLM niemals aus seiner Chat-Session lernt; solches implizites Gedächtnis ist gerade keine nachvollziehbare Nutzung des persistierten Feedbacks.

Auslöser: Operator markiert Designtrait, erwartet in neuer Sitzung/neuem Projekt personalisierte Vorschläge. Auswirkung: sichtbare learned-Werte suggerieren stärkere Anpassung, als die technische Übergabe trägt; keine reproduzierbare Gewichtungs-/Rankingentscheidung. Ursache: Eventprojektion wurde als UI-Endpunkt integriert, nicht als versionierter Input der Generationsgrenze. Behebung: authentisiert/projektgebundenen Preference-Snapshot mit Consent, Policyversion und Eventbelegen in Generationsauftrag aufnehmen und die verwendete Snapshotrevision im Ergebnis dokumentieren. Verifikation später: Originaldienste plus echte DB, Ereignis speichern, Agentauftrag erfassen, tatsächlichen Snapshotbezug bei neuer Sitzung nachweisen; Designqualität bleibt gesonderte fachliche Evaluation.

### PATH-T02-002 — Verspätetes Designset wird an neue aktive Architektur gebunden

Eigentümertrace: [T02-design-feedback.md](T02-design-feedback.md); Codecommit wie oben.

**Hoch; nachgewiesene fehlende Bindung, Race statisch konstruiert, nicht ausgeführt.** Tool und Control nehmen nur projectId/designs an (`openclaw-plugin/index.mjs:29–45`, `control.ts:365–377`). `RevisionRepository.createDirectionSet` liest unter Projektlock erst bei Ergebnisannahme die dann aktive requestId (`storage/index.ts:189–215`).

Auslöserfolge: A1 startet Generierung; Nova persistiert A2 und superseded A1 (`control.ts:330–338`); A1 liefert verspätet drei valide Dokumente mit gleichem external projectId; Repository ordnet sie A2 zu. Wenn für A2 noch nichts existiert, wird die falsche Generation akzeptiert. Ein nachfolgendes korrektes A2-Set kann am Inhaltskonflikt scheitern. Die spätere Approvalprüfung bindet dann an die falsche bereits entstandene Zuordnung und beweist keine Architekturherkunft. Ein Projektlock schützt die Transaktion, nicht die ursprüngliche Auftragseigentümerschaft.

Ursachenbehebung: designRequestId, architectureDigest/revision und eindeutige Generation-ID durch Dispatch, Agenttool und DB-Commit tragen; aktueller Request muss vor Annahme exakt übereinstimmen, stale Ergebnis getrennt archivieren/verwerfen. Verifikation später: Original-Control/Agenttool mit realer DB, zwei überlappende Architekturversionen und umgekehrte Ergebnisreihenfolge; A1 muss vor jeder A2-Dokumentmutation abgelehnt werden, A2 muss weiterhin akzeptierbar sein.

### PATH-T02-003 — Erneutes Dreier-Designset derselben Architektur kann keine neue Runde erzeugen

Eigentümertrace: [T02-design-feedback.md](T02-design-feedback.md); Codecommit wie oben.

**Mittel; nachgewiesener Pfadkonflikt.** `control.ts:471–479` nimmt erneute Directionsanforderung an und `agent-bridge.mjs:94–105` fordert drei neue Designs. `storage/index.ts:199–206` akzeptiert bei bestehendem Set ausschließlich identische Inhalte/Keys, sonst Konflikt. Es gibt in diesem Vertrag keine neue proposal-round-ID oder Übergang zu einer Nachfolgergeneration.

Auslöser: Operator verwirft alle drei Vorschläge und fordert unter derselben Architektur neue Varianten. Auswirkung: 202 kann angenommen werden, spätere Speicherung neuer Vorschläge scheitert; initiales Set bleibt die einzige Runde. Einzelne Dokumentrevisionen sind unterstützt und nicht mit dieser fehlenden Mehrvariantenrunde gleichzusetzen. Ursache: Transport bietet Neugenerierung an, Persistenz behandelt jede weitere Generierung ausschließlich als identischen Retry. Behebung: explizite Rundenidentität samt aktuellem Elternstand, archivierten Vorgängerdirections, Feedbackbezug und separater Idempotenz. Verifikation später: erste echte Runde persistieren, drei Designs ablehnen, zweite andere Runde unter derselben Architektur erfolgreich speichern; Retry derselben Runde darf keine dritte Runde erzeugen.

### PATH-T04-001 — Approval bindet Berichtbytes, aber nicht den tatsächlich weiterverwendeten Architektur-/Quellenstand

Eigentümertrace: [T04-risk-acceptance.md](T04-risk-acceptance.md); Codecommit wie oben.

**Hoch; statisch nachgewiesene fehlende Bindung, kein ausgeführter Exploit/Test.** Auslöser: Graph enthält einen Dateipfad oder textuelle Aufgabe statt unveränderlichen Source-/Planinhalts; nach Review ändern sich diese Dateien vor Resume/Implementierung. Graph, ArtifactRef und Berichtdigest bleiben gleich. `architecture-validator/src/protocol.ts:1–18` erzwingt keine Sourceidentität, `output.ts:61–82` gibt nur Agentenbericht aus; `human-approval/src/architecture-approval.ts:86–118` verifiziert dessen Bytes, nicht aktuelle Quellen; `approval.ts:103–128,146–173` akzeptiert Entscheidung ohne Evidence-/Sourcefelder. Graphpinning (`engine-snapshots.ts:67–72`) schließt diese externe Änderung nicht aus.

Auswirkung: Die technische Aussage „genau dieser Bericht wurde vor Implementierung akzeptiert“ ist möglich; „genau dieser Quellen-/Modulplanstand ist freigegeben“ ist nicht garantiert. Das ist relevant auch ohne Angreifer, etwa bei manueller Korrektur während des Operatorwaits. Keine automatische Gleichsetzung von Reportdigest und Gitrevision im Gesamtbericht.

Ursachenbehebung: Einheitliches Reviewsubject mit Projekt/Run, Source-Commit bzw. unveränderlichem Snapshot und Architektur-/Plan-Digest durch Request, Report, Wait, Entscheidung und Implementierungsstart führen. Bei Drift Freigabe verwerfen und erneuten Review/Entscheid verlangen. Verifikation: Originalgraph mit echten temporären Git-/Artefakt-/Waitstores, Review auf A, externe Änderung B während Wait, Zustimmung zu A; Implementierung muss vor Dispatch blockieren. Gleiches mit geändertem Modulplan bei gleichbleibendem Pfad und unverändertem Plan als Positivfall.

**Zusammengeführte Ausprägung F-T03-02 (T03):** Reportfreigabe ist nicht an geprüfte Source-/Planrevision gebunden.

**Hoch; statisch bestätigte Vertragslücke, kein Laufzeitexploit behauptet.** Trigger: Architekturdatei oder branchRef ändert sich nach Review, vor Sync/Implementierung; oder der überarbeitete Modulplan wird nicht identisch erneut geprüft. Belege: `architecture-validator/src/protocol.ts:1–4,18`, `output.ts:61–82`, `human-approval/src/architecture-approval.ts:86–118`, `blueprint-sync/src/stage.ts:15–38`, `compiler.ts:111–119`. Der Reportdigest schützt Reportbytes; weder Leserrevision noch Blueprint-Zielrevision ist damit bewiesen. Graphpinning schützt nur eingebettete Daten. Fix: Reviewinput aus unveränderlichem Source-/Planmanifest ableiten, dessen Digest/Commit im Report, Approval, Sync und Implementation verpflichtend verifizieren; Ref einmal auflösen und gemeinsam mit Zielcommit aufzeichnen. Regression: echte Gitbranches nach Review bewegen und erwarten, dass Sync/Forge ablehnen; gleicher Report bei veränderten Quelldateien darf keine gültige Freigabe sein. Kein Duplikat von PCR-PREFLIGHT-001, das nur Dateinennung betrifft.

### PATH-T04-002 — Acceptance und bewusste Akzeptanz blockierender Findings fehlen im gewünschten Produktpfad

Eigentümertrace: [T04-risk-acceptance.md](T04-risk-acceptance.md); Codecommit wie oben.

**Mittel; statisch belegte Zielbildabweichung, kein behaupteter Sicherheitsdefekt.** Projectcompiler erzeugt keine Architektur-/Acceptanceknoten (`project/compiler.ts:103–136`). Im expliziten Graphen sind nur passed-Berichte mit nichtblockierenden Findings akzeptierbar (`architecture-validator/src/output.ts:75–80`; `stage.ts:25–42`; `human-approval/src/architecture-approval.ts:107–118`). Admincontinuations umgehen den Reviewer nicht (`core/execution/engine-admin.ts:84–92`). Wer im Zielablauf „bei Problemen Behebung oder bewusste Akzeptanz“ auch auf blocking bezieht, erreicht diese Wahl derzeit nicht.

Ursachenbehebung: Produktpolicy ausdrücklich festlegen: nicht übersteuerbare harte Constraints von bewusst akzeptierbaren Risiken trennen; Graphkomposition für den gewünschten Modus explizit herstellen. Kein pauschales force-passed. Verifikation: Compile-/Graphinspektion und reale Gatefolge für clean, advisory/error, nichtübersteuerbares blocking und akzeptierbares Risiko; Entscheidung muss an Reviewsubject und autorisierten Operator gebunden bleiben.

### PATH-T04-003 — Administrative Reparatur lässt zuvor erfolgreiche abhängige Freigaben gültig

Eigentümertrace: [T04-risk-acceptance.md](T04-risk-acceptance.md); Codecommit wie oben.

**Hoch; statisch belegter Zustandsdefekt.** Konkrete Variante eines zulässigen expliziten Graphen: A (Quellen-/Planerzeugung) → R (Architekturreview) → P (Operatorapproval) → Q (späteres Gate); Q deklariert `on.request_fix=A`. A, R und P sind succeeded, Q ist blocked. Die Kante zum transitiven Vorfahren A ist in `skills/nova/core/execution/graph-build.ts#validateRemediation:64–75` ausdrücklich zulässig, A ist kein Remediation-only-Blatt (`buildGraph:90–91`). Nach autorisierter Adminentscheidung für Q/remediation/A prüft `engine-admin.ts:67–81` den deklarierten und nichtterminalen Reparaturtarget sowie Budget. Ein succeeded A wird nicht verworfen.

`engine-admin.ts#remediate:121–127` setzt Q auf waiting und A auf pending, übernimmt jedoch R und P unverändert. A ändert den Reviewgegenstand; nach erfolgreicher Reparatur setzt `run-decisions.ts#completeRemediation:124–130` Q pending. R/P bleiben succeeded und werden nicht erneut eingeplant (`graph.ts#ready:45–46`). Es fehlt die im regulären Reparaturpfad vorhandene transitive Invalidierung (`lifecycle/remediation.ts#repairRequest/applyRepair:13–51`). Das gilt ebenso für bereits erfolgreiche Geschwistergates unter A. Kein freies Graphpatching oder manipuliertes Journal ist Voraussetzung.

Auswirkung: Ein administrativ reparierter Stand kann mit alten Architekturberichten, Fakten und Operatorfreigaben weiterlaufen. Endzustand „genehmigte identische Source“ scheitert hier selbst dann, wenn die erste Genehmigung korrekt war. Dieselbe Ursache hält zudem alte rejected-Guidance fest; die konkrete Ablehnungs-/Wiederwarte-Sackgasse wird in T03 unter **F-T03-03** geführt. PATH-T04-003 beschreibt die andere, offene Freigaberichtung; im Gesamtbericht beide Auswirkungen unter gemeinsamer Ursache konsolidieren.

Ursachenbehebung: Einen gemeinsamen durable Reparaturentscheid mit identischer transitativer Invalidierung und Guidancebereinigung für normale und administrative Remediation verwenden, inklusive Replay. Verifikation: Originalgraph A→R→P→Q und weiteres bereits erfolgreiches Geschwistergate, tatsächliche genehmigte Revision A1, Q blockiert, autorisierte Reparatur zu A2. Vor erneutem Q-Erfolg müssen R/P und alle betroffenen Gates auf A2 neu geprüft und P neu genehmigt sein. Crashpräfixe zwischen Adminjournal, Invalidierung und Reparaturabschluss müssen denselben Zustand ergeben. Nicht ausgeführt.

**Zusammengeführte Ausprägung F-T03-03 (T03):** Nach Ablehnung erhält administrative Gatefortsetzung die alte Ablehnung.

**Mittel; statisch bestätigter mehrkomponentiger Zustandsdefekt.** Trigger: Approval über echtes Resume rejected → blocked, zulässige Adminremediation zu erneutem Review, R2 besitzt weiterhin genehmigungsfähige Findings. `recovery-state.ts:161–166` speichert rejected; `engine-admin.ts:112–127` kopiert es weiter; `run-decisions.ts:124–129` löscht es nicht; `pipeline-loop.ts:128` bevorzugt es; `human-approval/src/stage.ts:19–20` beantwortet es sofort erneut mit blocked. Auswirkung: Operator kann verbleibende/neue Findings nicht frisch entscheiden; Gatefortsetzung stoppt trotz erfolgreicher Reparatur. Bei R2 ohne Findings greift der dokumentierte Clean-Shortcut, deshalb keine pauschale Behauptung, dass jede Reparatur blockiert. Rootfix: Re-review/Remediation erzeugt neue Entscheidungsgeneration, invalidiert alte Guidance und Waits sowie betroffene Approvalzustände; Adminpfad dieselbe geprüfte Invalidierungslogik wie `lifecycle/remediation.ts#applyRepair:38–51` verwenden, unter Beibehaltung von Audit/Budgets. Regression: echte Engine/Wait-/Artifactstores, Ablehnung → Adminremediation → Restfinding → neuer Wait → neue Zustimmung; alte Signale weiterhin ablehnen. In diesem Trace nicht ausgeführt.

**Zusätzliche konkret geprüfte Modulvariante aus T09:**

**Hoch; bestehende neue Tracekennung aus T04, hier bestätigt.** Auslöser: F succeeded, L succeeded auf H1, E blocked mit noch ausreichendem Reparatur-/F-Budget; autorisierter Admin wählt E→F remediation. `engine-admin.ts:121–127` verändert lediglich zwei States und schreibt zwei einfache Events. Normale `repairRequest/applyRepair` aus `remediation.ts:13–51` wird nicht benutzt. `repair-evidence.ts:8–9` liefert ohne repairRequest keine Originalbefunde. Nach F2/Integration H2 setzt `run-decisions.ts:124–129` E pending, während L weiter succeeded auf H1 ist. Damit Echo erneut ausführbar, ohne Lint H2.

Behebung: ein kanonischer administrativer Reparaturintent mit autorisierten Befund-/Sourcebelegen muss dieselbe transitive Invalidierungsfunktion und gleiche Replayprojektion wie normale Reparatur verwenden. An der Sonderfreigabe explizit festhalten, welche zusätzlichen Attempts genehmigt sind. Geeignete Verifikation: Originalcompiler-/Pluginpfad F→L→E→T, reale Artefakte H1/H2; administrative Reparatur muss alte L/E/T-Facts invalidieren, tatsächliche Befundinhalte an Forge liefern und Lint H2 vor Echo H2 ausführen. Originalphase6 deckt dies nicht ab; sein Adminbeispiel ist ein anderes Zweistagemuster.

### PTR-T05-001 — Compilerbudget verhindert mehr als eine Modulreparatur insgesamt

Eigentümertrace: [T05-module-repairs.md](T05-module-repairs.md); Codecommit wie oben.

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

**Zusammengeführte Ausprägung T09-D01 (T09):** Needs Nova nach Retry-Limit fehlt im Compilerablauf.

**Zielbildabweichung, mittel; statisch gesichert, keine eigenständige Behauptung eines kaputten optionalen Corefeatures.** Compiler setzt keine orchestratorAfterAttempt; Erschöpfung endet blocked. Graphvalidator verbietet Schwelle≥maxAttempts und request_fix nutzt Schwelle überhaupt nicht. Ein explizites Review-orchestrator_required bleibt möglich, wird aber bei Limit ebenfalls blocked. Ein optionaler früherer Corewait beweist nicht den gewünschten gemeinsamen Eskalationspfad.

Ursachenbehebung: gewünschte Disposition für retry exhaustion, Reparaturbudget exhaustion und operative blocked-Fälle produktseitig explizit definieren, einschließlich autorisierter Fortsetzung und begrenzter Zusatzversuche. Kein pauschales Reset der Zähler. Verifikation: echter Compilergraph, wiederholtes retry und request_fix sowie neuer Fehler nach erster Reparatur; Journal muss gewollten Wait/Entscheidungsbezug enthalten und genau die genehmigte Arbeit fortsetzen. **Nicht ausgeführt.** Budgetursache deduplizieren unter PTR-T05-001, wenn der Gesamtbericht diese Abweichung gemeinsam behandelt.

### T06-F01 — Normale Repository-Lockkonkurrenz wird zum terminalen Implementierungsblock

Eigentümertrace: [T06-parallel-modules.md](T06-parallel-modules.md); Codecommit wie oben.

**Mittel, statisch nachgewiesener Integrationsdefekt für die explizite Parallelvariante.** Auslöser: A/B mit demselben Repositoryroot, unterschiedlichen Workspaces und `maxConcurrency>=2`, deren Create- oder Mergeoperationen überlappen. Der generische Ressourcenlock verweigert den zweiten Zugriff sofort (`locks.ts:99–103`), der Stagecatch klassifiziert dies wie einen ungültigen Implementierungsabschluss (`stage.ts:60–64,84–96`). Es findet keine faire Wartung und keine fachlich unterscheidbare sichere Pre-effect-Wiederholung statt. C bleibt blockiert, obwohl noch kein Git-Konflikt besteht. Bei Lockkonkurrenz wurde der zweite externe Effekt noch nicht akzeptiert; deshalb ist diese Lage nicht gleichbedeutend mit verlorener Git-ACK.

Ursachenbehebung: zentrale, abbrechbare Serialisierung der kurzen gemeinsamen Gitoperationen oder sicherer Pre-dispatch-Ressourcenbusyzustand mit Fortsetzung und Wartebudget; parallele Forgearbeit in getrennten autorisierten Workspaces zulassen. Nicht Ressourcenlocks abschalten und nicht ungewisse accepted-Effekte blind wiederholen. Geeignete Verifikation: echte FileResourceLockManager-/Engineinstanzen, echtes Git, zwei unabhängige Worktrees desselben Repos; natürliche überlappende Creates/Merges müssen beide erfolgreich fortsetzen, Cancel beim Warten darf keine Mutation erzeugen, tatsächlicher Mergekonflikt muss separat verbleiben. **Nicht ausgeführt.**

### PATH-T07-001 — Erhalt nach Cleanupfehler blockiert die nächste Modulreparatur

Eigentümertrace: [T07-git-failures.md](T07-git-failures.md); Codecommit wie oben.

**Mittel; nachgewiesener komponentenübergreifender Defekt durch Code-Trace.** Der aktuelle Merge wird nicht falsch als fehlgeschlagen gewertet; problematisch ist die nachfolgende fachliche Reparatur.

Belegkette: Compiler fixiert W/B je Run/Modul ohne Versuchsgeneration (`compiler.ts:105–119`). Implementation behält nach Cleanupfehler den erfolgreichen H1 und meldet passed (`stage.ts:86–120`). Ein danach fehlgeschlagener Lint-/Review-/Testcheck führt über on.request_fix zurück zur selben Implementation (`compiler.ts:120–131`, `remediation.ts:37–49`). Diese ruft stets create auf (`stage.ts:78–82`), das bestehendes W ausdrücklich ablehnt (`git-workspace/src/values.ts:52`); wenn nur B übrig blieb, scheitert `worktree add -b B` (`operations.ts:16`).

Auswirkung: eine erfolgreiche Gitintegration mit dokumentiertem Aufräumproblem verwandelt den nächsten reparierbaren fachlichen Fehler in blocked/reconciliation_required vor Forge. Das reguläre Repairbudget kann nicht für die eigentliche Reparatur genutzt werden. Der Codepfad wird durch den bestehenden Locked-worktree-Test als Ausgangslage gestützt; dessen Test endet jedoch **vor** nachfolgendem Lintrequest_fix und ist kein Nachweis dieses gesamten Traces.

Ursache: Cleanup gilt lokal als nicht blockierender Nebeneffekt, während der nächste Attempt dessen vollständigen Erfolg implizit voraussetzt. Ursachenbehebung: besitzgebundene Worktree-/Branchgeneration pro Attempt mit durable Cleanupstatus; vor Folgestart alte Ressourcen gezielt reconciliieren oder eine neue eindeutig zugeordnete Generation anlegen. Bestehende ungewisse Arbeit nicht blind entfernen und keine beliebigen fremden Branches übernehmen. Verifikation später: echter Git/Original-Core, bestätigter Merge→echter worktree lock→Cleanupfehler→nachfolgender tatsächlicher Lintfehler→Repair; dieser muss kontrolliert neuen Arbeitsstand H1 benutzen und nach H2 alle invalidierten Prüfungen erneut ausführen. Variante nur Branch übrig ergänzen.

### PATH-T11-001 — Blocking-JUnit kann ohne einen ausgeführten Test bestehen

Eigentümertrace: [T11-deterministic-suites.md](T11-deterministic-suites.md); Codecommit wie oben.

**Hoch; statisch nachgewiesene vollständige Bewertungsfolge, nicht ausgeführt.** Konkreter Eingang: gültiger blocking direct-command-Node im junit-required-Modus, realer Prozess Exit0, gültiger JUnitreport mit einem oder mehreren ausschließlich skipped Testcases. `skills/buster/plugins/junit-report-adapter/src/adapter.js#parse:195–196,249–260` zählt total>0, skipped=total, passed=failed=errored=0. `skills/buster/engine/test-gates/runner.ts#finalizeResult:1499–1524` weist nur total==0 ab. outcome hängt ausschließlich an Commandfailure oder failed+errored>0, damit passed; Summary nennt sogar alle reportCounts.total Cases „passed“. `remote-result-import.ts#failedReport/decide:163–166,190–204` sieht weder failed Reportcounts noch failed outcome und gibt Gate passed. `gateDecisionStageResult:40–41` erlaubt Fortsetzung. Kein gefälschtes Result und kein eigener Provider ist nötig.

Auswirkung: Die im Projectcompiler verlangte Existenz eines aktiven blocking Testnodes (`compiler.ts:89`) genügt nicht, um tatsächlich ausgeführte Modultests nachzuweisen. Anders als Playwrights Mindestexecution (`playwright/src/provider.js:49–56`) fehlt dies beim JUnitpfad. **PCR-APIFLOW-001** ist verwandte Ursache unzureichender Ausführungsabdeckung in einem anderen Provider; diese beiden konkreten Pfade dürfen zusammen behoben, aber nicht als derselbe Parserdefekt ausgegeben werden.

Ursachenbehebung: Eine ausdrückliche minimale tatsächlich ausgeführte Testabdeckung für blocking JUnit festlegen und im finalisierten Ergebnis erzwingen; skipped separat berichten. Geeignete Verifikation: Echter Command erzeugt normalen XMLreport mit ausschließlich skipped Testcases und Exit0, Originalprovider→Originaladapter→Originalrunner→Novaimport muss Nichtbestehen liefern; daneben gemischte pass/skip, failed/errored, total0 und normal vollständig passed prüfen. Nicht ausgeführt.

### PATH-T11-002 — Suiteauswahl und All-skipped-Gate sind kein Nachweis vollständiger geforderter Abdeckung

Eigentümertrace: [T11-deterministic-suites.md](T11-deterministic-suites.md); Codecommit wie oben.

**Mittel; statisch belegte Zielbild-/Policygrenze, kein generelles Verbot optionaler Skips vorgeschlagen.** Leere Templates werden in `plan.suites` geführt, erzeugen aber keine Nodes (`resolver.ts:359–378`). Solange ein anderer Node existiert, scheitert TEST_PLAN_EMPTY nicht. Außerdem erzeugt ein vollständiger Plan mit ausschließlich bedingt übersprungenen Nodes gültige skipped-Ergebnisse (`runner.ts:789–803`); `decide:185,202–204` kennt keine Mindestmenge ausgeführter blocking Nodes und kann passed ausgeben. Nicht gewählte/excluded Suites werden ebenfalls nicht als fehlender Pflichtumfang gewertet. Dies ist konfigurierte Selektionssemantik, erfüllt jedoch keinen behaupteten „alle 13 wurden ausgeführt“-Nachweis.

Ursachenbehebung: Produktseitigen Pflichtumfang getrennt von Template-/Providerverfügbarkeit modellieren und in Gesamtentscheidung executed/skipped/excluded/advisory offen darstellen; Freigabe für „vollständiger Stand geprüft“ nur mit erfüllten Pflichtchecks. Für den hier beauftragten Review stets alle tatsächlichen Nodes statt bloßer Suitezahl berichten. Verifikation: Alle zwölf Templates wählen, aber mehrere leer belassen; zusätzlich All-conditions-false-Plan. Der Produktabschluss muss Abdeckungslücken sichtbar machen und bei obligatorischem Umfang blockieren. Keine Abschaffung sinnvoller optionaler/bedingt irrelevanter Tests.

### PATH-T13-001 — Kumulativer Prüfumfang ist nicht gebunden; letzte Modulbelege genügen dem Abschluss

Eigentümertrace: [T13-cumulative-gates.md](T13-cumulative-gates.md); Codecommit wie oben.

**Hoch bezogen auf einen als kumulativ verwendeten Qualitätsabschluss; nachgewiesene Integrations-/Policylücke.** Kein behaupteter Fehler beim korrekt deklarierten isolierten Modultest und keine Behauptung, beliebiger fremder Evidenceinput könne die Digestprüfungen umgehen.

Konkreter Auslöser: Ein expliziter Graph erklärt ein final/cumulative Gate nach M5 oder M6, übernimmt aber dessen Modulplan und letztes Modulreview. Alle Tests können korrekt auf dem vollständig integrierten H5/H6 ausgeführt werden und trotzdem nur M5/M6 prüfen. `loadPipelineTestScope` selektiert genau die angegebene Deklaration (`pipeline.ts:39–55`), der Resolver nimmt scope und Nodes unverändert als ausgewählten Prüfgegenstand (`resolver.ts:718–749`). Der Remoteadapter prüft runId, nicht outer gateId gegen plan.scope (`remote-test-gate/src/adapter.ts:70–72,84–94`); Qualitystage bindet Source und native Decision, erwartet keine kumulative Anforderungsmenge (`buster-quality-gate/src/stage.ts:11–25,41–43`).

Am Abschluss genügt `input.final.sourceStageId` als eines der Module (`project-summary/src/summary.ts:17–24`). `verify` prüft aktuelle Artefakte/Revision und passed, nicht welche Module/Requirements/Tests der Plan abdeckt (`:46–57`). Finaler Lint und Review werden auf dieselbe head-Revision und passed geprüft, aber nicht auf kumulative Basis/Scope/Requirementmenge (`:60–65`). Ein letzter Modulreview H4→H5 kann deshalb die Rolle des finalen Reviews einnehmen, obwohl frühere Integrationsanforderungen nicht untersucht wurden. Gleichheit der Codeversion ist notwendig, aber kein Beweis gleicher oder vollständiger Prüfmenge.

Auswirkung: delivery-manifest kann technisch kohärente Modulbelege als final aufführen, ohne den gewünschten kumulativen Qualitätsnachweis. Das ist eine falsche Schlussfolgerung aus gültiger, aber engerer Evidenz. Korrekt konfigurierte explizite kumulative Pläne/Reviews bleiben möglich und werden durch den Befund nicht abgewertet.

Ursachenbehebung: versionierte Gate-Coverage mit erwarteter Modulmenge, Requirements-/Scope-/Planpolicy-Digest und Kandidatensnapshot erzeugen; Planauswahl/Reviewbundle/Ergebnis/Delivery müssen denselben Coveragevertrag nachweisen. Finale Modulbelegwiederverwendung nur zulassen, wenn dessen Coverage tatsächlich die erwartete Gesamtmenge erfüllt. Gatescope-IDvergleich allein genügt nicht: ein formal TG5-genannter Ein-Test-Plan bleibt unvollständig.

Geeignete Verifikation später: Original-Core/-Provider/-Summary, M1–M5 mit einer realen Interaktionsregression ausschließlich zwischen M1/M2; letzter M5-Modultest besteht, kumulativer Plan muss sie finden. Der Modulplan darf den kumulativen Abschluss nicht erfüllen; vollständiger deklarierter Plan nach tatsächlicher Reparatur darf bestehen. Jeweils gleiche Commitbytes verwenden, damit der Test echte Coveragebindung und nicht bloß SourceMismatch prüft. Keine synthetischen Passed-Berichte als E2E-Nachweis.

### F-T14-01 — Finalpreview-Exposure wird vor Operatorübergabe entfernt

Eigentümertrace: [T14-operator-preview.md](T14-operator-preview.md); Codecommit wie oben.

**Hoch; statisch bestätigter komponentenübergreifender Lifecycledefekt gegenüber dem gewünschten Operatorabschluss.** Trigger: erfolgreicher Plan mit Kubernetesfixture retention=retain und Tailscale-Exposurefixture. Runner finally räumt Fixture auf (runner.ts 897–899,2005–2018), Exposurecleanup ist unbedingt (provider.js 85–90), Runtime schaltet off (231–241), Controller löscht Ingress (1353–1362). Folge: Namespace erhalten, URL nach Abschluss nicht erhalten. Rootfix: bewusster, persistierter Ownership-/Lifecycletransfer einer finalen Preview einschließlich Exposure, Namespace, TTL, Source-/Imagedigest und Cleanupbefugnis; normale Testfixtures weiterhin am Planende aufräumen. Kein pauschales Entfernen des Cleanup-finally. Regression: echter End-to-end-Fixtureplan, danach erlaubter Tailnetbrowser erreicht Anwendung für festgelegten Operatorzeitraum; explizites Release/TTL entfernt exakt diese Generation. Keine Ausführung hier.

### F-T14-02 — Vollständiger Operatorzugang und Appauth-Handoff fehlen

Eigentümertrace: [T14-operator-preview.md](T14-operator-preview.md); Codecommit wie oben.

**Hoch für das Abschlussziel; statisch bestätigte Integrationslücke, keine behauptete Credentialoffenlegung.** Trigger: Pipeline verlangt Login und „ohne manuelle Clusterarbeit testen“. Controller erstellt nur dediziertes Secret (main.go 1165–1225); Manifest-/Ingresspfad bindet die App nicht automatisch daran; Summary konsumiert keine Exposure (summary.ts 46–68); Previewobserver sendet nur Artefaktmetadaten (observer.ts 139–160). Folge: weder funktionierender Login noch URL-/Credentialempfang/Abnahme sind durch den Runabschluss garantiert. Rootfix: verpflichtender Previewdeliveryvertrag mit Source/Image/Lease/Generation/URL/Authmodus/Expiry, Appseitiger Secretintegration und überprüftem Login; Credentials als gezielt abrufbare geschützte Referenz und autorisierte sichere Zustellung, nicht als unredigiertes allgemeines Runartefakt. Operatorfeedback an dieselbe Generation und Sourcebindung koppeln. Regression: Anwendung mit tatsächlicher Auth, erlaubter Operator kann lesen/login/Feedback geben, anderer Tailnetnutzer und alte Previewgeneration werden abgewiesen; Nachricht enthält nötige URL ohne öffentliche Secretbytes. Keine Tests hier.

### T15-F01 — Pipeline Review verarbeitet unbelegte Digestlisten statt geprüfter Run-Evidenz

Eigentümertrace: [T15-pipeline-review.md](T15-pipeline-review.md); Codecommit wie oben.

**Mittel; statisch nachgewiesene Evidenz-/Nachvollziehbarkeitslücke.** Auslöser: formal korrekte, aber fremde, veraltete, doppelte oder nicht auflösbare kind/digest-Liste. Stage dispatcht unverändert und akzeptiert jeden formal vollständigen Fünfdimensionenbericht. Es werden keine Artefaktinhalte, Metriken, Runvollständigkeit oder Gitrevision deterministisch geladen/geprüft. Daraus folgt nicht, dass jeder Agentbericht falsch ist, wohl aber, dass `passed` keinerlei solche Prüfung belegt. Der Report speichert außerdem nicht einmal die Input-Evidence-Zuordnung.

Belege: vollständige `stage.ts:3–16`; `protocol.ts:1–31`; Manifest:11–14; Inputschema:1. Roots/Grants und HMAC schützen Transport/Operation, nicht behauptete Relevanz der Digests. README „evidence-pinned“ überzeichnet den Implementierungsstand.

Ursachenbehebung: begrenztes, versioniertes Reviewbundle aus autoritativer Runprojektion und vollständig qualifizierten ArtifactRefs herstellen, Inhalte beim originalen Store lesen und Run/Stage/Attempt/Source-/Digestbindung prüfen; Coverage und ausgelassene Quellen ausdrücklich deklarieren. Berichtsbeobachtungen mit Bundle-/Belegreferenzen persistieren. Keine automatische Umsetzung der Vorschläge ergänzen, um eine Beweislücke zu verdecken.

Verifikation: reale Journale/Artefakte von zwei Runs und zwei Sourcerevisionen, gültiges Bundle als Positivfall; nonexistent/cross-run/stale/duplicate Referenzen sowie manipulierte Inhalte getrennt prüfen. Originalruntime erhält nachweislich die geprüften Inhalte und erzeugt einen belegreferenzierenden Bericht. Kein solcher Test hier ausgeführt. CaseStudy mit demselben fehlenden Evidenzresolver als verwandte Ursache zusammenführen.

**Gemeinsame Case-Study-Ausprägung aus T16:**

**Gemeinsame Ursache mit T15, keine neue T16-Duplikatkennung.** Bei Case Study ist die Grenze noch unmittelbar sichtbar: Fakten sind Callerstrings ohne Artefaktref/Digest, Stage besitzt kein `artifacts.read`, Parser prüft keine Behauptung gegen Evidenz, gespeicherter Report behält nur Markdown und Identität. Promptregeln begrenzen gewünschtes Verhalten, erzwingen keine sachliche Richtigkeit. Auslöser: ungeprüfte/veraltete Faktentexte oder ein Writer, der trotz Vorgaben neue Ergebnisse behauptet. Formatgültiger Text wird als generated/passed gespeichert. Wirkung: Bericht ist ein Entwurf, kein belastbarer Beleg bestandener Tests oder Publikationsreife.

Belege: `case-study/plugin.json:11–14`; `protocol.ts:1–22`; `stage.ts:6–11`. Ursachenbehebung gemeinsam mit T15: versionierten run-/source-/attemptgebundenen Quellenmanifestinput auflösen und prüfen, Quellenrefs/digests im Output erhalten, behauptete Mess-/Testresultate an strukturierte Evidenz binden; LLM-Text weiterhin als Entwurf kennzeichnen. Spätere Verifikation: echter Writer mit echten unveränderlichen Berichtsquellen; falscher Run/Source/Artefaktdigest verhindert Erstellung, unbelegte Tests/Metriken verhindern verifizierten Status. Keine bloße zusätzliche Promptmahnung als Ursachenbehebung.

## Vollständige Tracefolgen und Nachweise

### T01 — Gesamtlebenszyklus und Happy Path mit zwei abhängigen Modulen

Einzeltrace: [T01-happy-path.md](T01-happy-path.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

**Status:** statischer Trace abgeschlossen; der gewünschte Gesamtpfad ist im Project-Einstieg nicht zusammengesetzt. Nachfolgende Abschnitte wurden unter ausdrücklich genannten Voraussetzungen weiterverfolgt. **Kein Laufzeit-/E2E-Test durchgeführt oder bestanden.**

Geprüfter Code: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Sämtliche nachfolgenden Codepfade, Symbole und Zeilen beziehen sich auf diesen Commit. Vorreviews: `a9e080ab1e1981ec5713e9b742f94280835fd347`, insbesondere `docs/review/components/nova.entry.md`, `nova.scaffold.md`, `kubeclaw.implementation-agent.md` und `docs/review/findings.md`. Deren Tests sind historische Angaben, keine in T01 wiederholten Prüfungen.

### Szenario, Voraussetzungen und vorgesehenes Ende

Neues Projekt `trace-demo`, eine explizite Run-ID, sauberer Repository-Stand R0; Operator und Nova stimmen Architektur/Spec ab, Prism liefert ein gewähltes Design, anschließend vereinbaren beide bewusst manuell den Modulplan. Modul `library` besitzt keine Abhängigkeit, Modul `app` hängt von `library` ab; unterschiedliche Ownershippräfixe. Arch-Reviewer findet im Happy Path keine Befunde. Beide Module durchlaufen Forge, Lint, Echo und Buster erfolgreich. Danach soll ein kumulativer Test-/Reviewabschluss erfolgen und eine erhaltene Anwendung mit Tailscale-Testzugang an den Operator gehen. Pipeline Review und Case Study bleiben aus.

Vorausgesetzt sind passende Runtimepakete, explizite Plattformregistrierungen/Grants, persistente Core-/Artefaktstores, Git, erreichbare Agenten und Testworker. Das ist eine Prüfannahme und keine Feststellung über eine reale Installation. Die Definition einer Spec und der manuelle Modulplan sind absichtlich menschliche Arbeit; als Lücke wird hier nur fehlende technische Verbindung bzw. eine irreführende ausführbare Anleitung bewertet.

### Tatsächliche Einstiegspunkte und erste Bruchstelle

`skills/nova/pipeline.ts:5–13` reexportiert den Core und lädt bei direktem Start `project/cli.ts`. Dort existieren **zwei getrennte Modi**:

1. `--project <JSON-Datei>`: `project/cli.ts:10–29` lädt `nova-project.v1`, kompiliert und validiert die Runtime. Der Compiler akzeptiert ausschließlich die Felder `schemaVersion,id,runId,repositoryRoot,workspaceRoot,baseRevision,modules` (`compiler.ts#compileProject:46–58`). Er besitzt keinen Spec-/Prism-/Architektur-/Acceptance-Eingang.
2. Ohne `--project`: `project/cli.ts:10–12` delegiert an `core/cli.ts`. Dessen `--pipeline` lädt einen bereits ausdrücklich zusammengestellten `pipeline-definition.v2`-Graphen; Run/Recover/Signal/Audit sind eigenständige Befehle (`core/cli.ts#argumentsOf:21–47`, Hauptblock 49–84). Installierte Plugins werden nicht allein durch ihre Installation ausgeführt.

Die **erste fehlende automatische Verbindung im gewünschten Lebenszyklus** liegt daher vor der ersten Modulimplementation: Der kanonische Productcompiler nimmt die Architektur-/Prism-/Acceptance-Artefakte nicht entgegen und setzt diese Stages nicht vor die Module. Das bedeutet nicht, dass Prism oder Approval unimplementiert wären; es verlangt einen anderweitig zusammengestellten expliziten Graphen und dessen Datenbindung.

Bei Befolgung der vorhandenen Setupanleitung tritt zusätzlich bereits ein konkreter Einstiegsausfall auf: `skills/nova/project_setup/SKILL.md` empfiehlt `--dry-run`, `--nova-channel` und `--resume` mit Projektnamen. `project/cli.ts:16–25` erlaubt nur `--project,--platform,--compile,--recover,--signal` und liest den Projectwert als Dateipfad. `progress-scaffold-validation.ts#scaffoldToProgress:236–263` liefert Legacy-Progress plus einen Providerplan (`pipeline: scaffold.pipeline`), keinen `nova-project.v1`-Eingang oder ausführbaren Stagegraphen. Eine Datei namens `pipeline.json` beweist hier keine kompatible Pipeline-Definition.

### Vollständige Übergangsfolge, einschließlich bedingter Fortsetzung

Die folgende Folge beschreibt konkret nachgelesene Bausteine. **Voraussetzung A:** Ein autorisierter Aufrufer erstellt den expliziten Graphen samt Artefaktverweisen für Vor- und Nachphasen; diese Zusammenstellung wird durch `compileProject` nicht geliefert. **Voraussetzung B:** Forge erhält tatsächlich den pro Modul autorisierten Worktree; der existierende Standardhandoff erfüllt dies nicht (PCR-IMPLEMENTATION-001). Keine dieser Voraussetzungen wird als schon vorhandener Fix ausgegeben.

| Schritt | Aufrufer → Transport/Persistenz → Empfänger → Rückweg / Folgezustand | Codebeleg |
|---|---|---|
| 1. Architektur/Spec | Operator/Nova erzeugen den Inhalt außerhalb des Compilers. Prism benötigt einen im selben Run verfügbaren JSON-Artefaktverweis mit `artifactId,contentDigest,revision`. Die Stage liest über `artifacts.read`, prüft Producer-Run, Mediatyp, 256-KiB-Grenze, Digest und tatsächliche kanonische Bytes. Ein bloßer Dateiname oder Prompt genügt nicht. | `skills/nova/plugins/prism-design/src/stage.ts#execute:9–17` |
| 2. Designauftrag | `kubeclaw.design.prism` sendet `prism.design-request.v1` mit `projectId,architecture,architectureContent` über `runtime.dispatch` an `prism`; der Idempotenzschlüssel enthält Run, Architekturdigest und Phase. Die Stage baut selbst keine drei Designs und prüft keine Kandidatenzahl; Erzeugung/Ranking liegen in Prism. | ebenda 15–17; `prism-design/plugin.json:2–5` |
| 3. Auswahlwartepunkt | Erstaufruf erzeugt `signal.wait` mit Operator-Issuer, Ablauf, Projekt und `prism.approval.resolved`. Den zurückgegebenen Wait prüft `waitFrom`; `operator.request` veröffentlicht den kanonischen Wait-ID/Digest. Stage liefert `wait`, Core pausiert. Auswahl/Iteration selbst sind keine automatische Compilerphase. | `prism-design/src/stage.ts#waitFrom:8`, `#execute:18–26`; `core/execution/pipeline-loop.ts#run:20–37` |
| 4. Designrückgabe | Bei fortgesetztem Aufruf muss Guidance `approved`, richtigen Operator, `approvalId`, Architekturdigest und Bundledigest enthalten. Erneuter Dispatch mit Approval-ID; `verifyBaselineArchive` prüft den zurückgegebenen Baselinebundle. `artifacts.write` persistiert importierten Inhalt, ursprünglichen Designrequest und genehmigten Architekturdigest unter `kubeclaw.prism`; Stage `passed`. Ein automatischer Import dieses Designs in Compiler-Requirements/Forge-Task folgt daraus nicht. | `prism-design/src/stage.ts#approval:7`, `#execute:12–17,27–30` |
| 5. Manueller Modulplan | Operator/Nova vereinbaren `library → app`. Für Projectmodus sind absolute Roots, R0, Requirements, nichtüberlappende Ownership, konkrete Agents/Lintpolicy und bereits aufgelöste Testpläne nötig. Jeder Plan wird auf Digest, Run, Projekt, Modul, `gateId:null` und mindestens einen aktiven blockierenden Test geprüft. Der Compiler liest keine gespeicherte Prismauswahl oder Acceptanceentscheidung. | `project/compiler.ts#compileProject:47–90` |
| 6. Arch-Reviewer, bedingt A | Eine explizite Stage sendet `kubeclaw.architecture-validation.v2` mit `task` und `architecture` über Runtime. Parser validiert die Antwort; JSON-Bericht wird unter `kubeclaw.architecture-validator` geschrieben. `passed` mit leeren Findings erzeugt Fact `architecture.review:clean`. Prüfauftrag bzgl. Architektur/Modulplan ist im Task/Inhalt zu liefern; deren fachliche Wahrheit ist LLM-Leistung. | `architecture-validator/src/protocol.ts#buildArchitectureRequest:5–18`; `architecture-validator/src/stage.ts#execute:4–42` |
| 7. Acceptance, bedingt A | Architecture-Approval selektiert den jüngsten eindeutigen Report desselben Runs, prüft Namespace/Bytes/Digest und `verdict:passed`. Ohne Findings liefert es direkt `passed`; bei Findings delegiert es an Human-Approval, erzeugt Wait und Operatornachricht. Für T01 ist der Befundsatz leer. Ein graphischer `dependsOn`-Pfad muss die Implementation tatsächlich daran binden; Registrierung allein erzwingt ihn nicht. | `human-approval/src/architecture-approval.ts#execute:82–119`; `human-approval/src/stage.ts#execute:13–55` |
| 8. Runstart | Project-CLI verifiziert zuerst registrierte Stages/Grants/Inputs, dann beim neuen Run `git rev-parse HEAD == baseRevision` und sauberen Gitstatus. Es ruft `runPipelineV2(platform,definition,runId)` auf. Core protokolliert `run.created/run.started` und flusht vor Auswahl/Stageausführung. | `project/cli.ts:25–46`; `core/execution/pipeline-loop.ts#recordRunStart:47–54`, `#run:20–32` |
| 9. Forge für library | Compiler erzeugt Workspace `<workspaceRoot>/<hash(runId)>/library`, Branch `nova/<project>/<hash>/library`, `baseRef:HEAD`, Task mit Ownership und Requirements. Implementation überschreibt Run/Attempt aus Corelease, erzeugt Worktree über `git.workspace.create`, nimmt dessen echte Revision als `headBefore` und dispatcht `kubeclaw.implementation.v2`. **PCR-IMPLEMENTATION-001 ist hier die erste konkrete Ausführungsbruchstelle nach manuellem Graphaufbau:** Builder überträgt keinen Workspace; OpenClaw verwendet statisches `target.cwd`. Weiter nur unter B. | `project/compiler.ts:103–119`; `implementation-agent/src/stage.ts:10–30,67–84`; `implementation-agent/src/protocol.ts#buildRequest:37–73`; `common/plugins/runtime-dispatch/src/openclaw.ts#spawnSession:207–225` |
| 10. Forgeantwort und Integration, bedingt B | Completion enthält Status, Summary, ChangedPaths, Checks und Sessionevidenz. Parser verlangt completed-Session und mindestens einen erfolgreichen Check/geänderten Pfad für `ready_for_testing`. Das sind noch keine unabhängig ausgeführten Tests. Stage führt `git.commit` im Worktree und `git.merge` der Branch in Zielrepo aus, übernimmt R1, räumt bestätigten Worktree auf und schreibt Completion mit R1/headBefore R0. `passed` plus Fact `implementation.source_revision:R1` gibt die nächste Stage frei. Merge geschieht **vor** Lint/Review/Test. | `implementation-agent/src/protocol.ts#parseCompletion:126–140`, `#assertCompletionConsistency:115–125`; `implementation-agent/src/stage.ts#integrateWorkspace:33–47`, `#execute:85–123` |
| 11. Modul-Lint | `lint-library` hängt ausschließlich von `implement-library` ab; es existiert unabhängig davon, ob ein weiterer Review optional gewünscht wäre. `resolveSourceRevision(sourceStageId)` liest den eindeutigen letzten Implementationattempt desselben Runs mit Digestprüfung. `lint.execute` erhält R1; Antwort muss R1 bestätigen. Artefakt enthält Report und Revision. Toolfehler → `blocked`, blockierende Findings → `request_fix`, andernfalls `passed`. Erst dann wird Echo bereit. | `project/compiler.ts:120–126`; `common/plugin-runtime/sdk/src/source-revision.ts:5–37`; `lint/src/stage.ts#resultForReport:24–54`, `#execute:56–90` |
| 12. Echo-Modulreview | Input trägt Task, Requirements, Ownershipscope und `revisions:{sourceStageId:implement-library}`. `review.execute` ersetzt dies mit Originalbaseline R0 und aktuellster Kandidatrevision R1; Review erstellt Repositorysnapshot/Context, dispatcht Echo, prüft und reduziert Ergebnisse, persistiert den Reviewbericht. Ein Echo-String `passed` allein ist nicht das Stageergebnis. Compilerkante verhindert Start vor erfolgreichem Lint. | `project/compiler.ts:122–126`; `common/plugin-runtime/sdk/src/source-revision.ts#resolveImplementationRevisions:40–49`; `review/src/stage.ts#runReview:213–249`, `#execute:251–267` |
| 13. Buster-Modultest | Qualitystage löst R1 aus Implementationartefakt, sendet `providerPlan + revision` über `test.plan.execute`. Remoteadapter validiert Repo-Root/Grants/Plan-Run und übergibt Stage-ID, Idempotenzschlüssel, Revision, Repository-ID und Plan an Production-Testgate. Nur dessen importierte Entscheidung wird weitergegeben. Quality prüft Run-ID, persistiert Decision und dispatcht den konfigurierten Testagent erst bei `decision.state:passed`; dessen Verifikationsurteil wird an R1 und `decisionDigest` gebunden. | `buster-quality-gate/src/stage.ts#execute:6–49`; `remote-test-gate/src/adapter.ts#execute:63–97` |
| 14. app auf integriertem Stand | `implement-app.dependsOn:[test-library]`; Toposort ist stabil, `previousGate` serialisiert auch sonst unabhängige Module, `maxConcurrency:1`. Neuer Worktree startet auf tatsächlichem HEAD R1, Implementation liefert R2. Lint/Echo/Test wiederholen 11–13 mit R2; Echo des zweiten Moduls sieht R1→R2 und dessen eigenen Ownershipscope, nicht automatisch das kumulative R0→R2-Review. | `project/compiler.ts:92–136`; `implementation-agent/src/stage.ts:15–20,79–83`; SDK `source-revision.ts:40–49` |
| 15. Kumulative Gates, bedingt A | Nach `test-app` fügt der Compiler **nichts** an. Für gewünschte Gesamttests muss der explizite Graph einen Gateplan für den gesamten R2 deklarieren; Quality kann diesen ausführen, sofern dessen Plan/Scope/Providerregistrierung gültig sind. Ein kumulatives Echo-Review muss explizit Baseline R0, Head R2 und Gesamtscope prüfen; nochmals bloß `sourceStageId:implement-app` liefert nur R1→R2. Die Existenz aller Suites oder bestandene Module ersetzt diese Erklärung nicht. | `project/compiler.ts:127–137`; SDK `source-revision.ts:40–49`; `buster-quality-gate/src/stage.ts:6–25`; `review/src/stage.ts:251–267` |
| 16. Liefermanifest, bedingt A | Registriertes `kubeclaw.report.project-summary` benötigt Modulliste und `final:{sourceStageId,lintStageId,reviewStageId,testStageId}`. Es liest eindeutige jüngste rungebundene Artefakte, prüft Digest/Bytes, bestandene Testentscheidung/Testagenturteil und identische finale Revision in Lint/Review. Stage persistiert `delivery-manifest.v1`; **sie sendet keine Operatornachricht und erzeugt keine Preview**. Compiler registriert diese Stage nicht in seinem Graphen. | `project-summary/plugin.json:5–18`; `project-summary/src/summary.ts#buildSummary:17–69`; `project-summary/src/stage.ts#execute:3–11` |
| 17. Operator-Testzugang, bedingt A | Ein explizit deklarierter Kubernetesfixture→Tailscale-Providerpfad kann aus typed Deploymentinput eine Exposure erzeugen: Lease, Namespace, Endpoint und Ablauf werden geprüft; `kubernetes.exposure.prepare` gibt URL/Hostname zurück; Output `public-endpoint-fixture.v1` trägt URL, Lease, Ablauf und Releaseaktion. Dazu existiert Cleanup. **Das ist kein belegter Aufbewahrungs-/Abnahmevertrag.** In den nachgelesenen Abschlussbausteinen fehlt die automatische Verbindung von Exposureoutput zum Operator mit Zugangsdaten. Notification-Observer liefert Runstatus oder Artefakt-Metadaten, keinen solchen Access-Bundle. | `buster/plugins/tailscale-exposure/src/provider.js#deploymentInput:26–54`, `#provider:61–94`; `common/plugins/notification-observer/src/observer.ts#lifecycleNotification:111–138`, `#previewNotification:139–160`, `#deliverPreview:191–193` |
| 18. Abschluss ohne Folgeschritte | Ohne zusätzliche Graphknoten endet Core, sobald alle definierten Stages succeeded/skipped sind (bzw. unbenötigte reine Reparaturziele pending). `run.succeeded` wird geschrieben, CLI gibt JSON aus und Exitcode 0. Pipeline-Review/Case-Study-Plugins sind in Nova-Rolle enthalten, aber optional erst durch Graphaktivierung; Weglassen verhindert Coreabschluss nicht. Für den bloßen Compiler sind somit nach acht Stages alle Bedingungen erfüllt, obwohl die gewünschte Operatorübergabe fehlt. | `core/execution/pipeline-loop.ts#finalize:137–144`; `project/cli.ts:43–46`; `packaging/runtime/roles/nova.json:43–58`; `project/compiler.ts:134–137` |

### Identitäten, Zustände, Nebenwirkungen und Fehlerrückwege

| Identität / Artefakt | Entwicklung und Bindung |
|---|---|
| Projekt/Run | `project.id` wird Compilerdefinition `project:<id>`; explizites `runId` bindet alle Modulpläne. Corelease überschreibt anfängliches `attempt:1/runId` bei Implementation und Prism. Es werden keine realen Run-IDs behauptet. |
| Source | R0 sauber vor Start; library-Worktreebase R0, integrierter Kandidat R1; app-Worktreebase R1, Kandidat R2. Getestete/reviewte Revision wird aus run-/stage-/attemptgebundenem Artefakt statt zufälligem aktuellem HEAD aufgelöst. Fremde externe Änderungen bleiben außerhalb der hier angenommenen exklusiven Lane. |
| Module/Attempts | IDs `implement-library/lint-library/review-library/test-library` und entsprechend app. Pro Stage 2 Attempts, 2 Remediationzyklen und 30 Minuten im Compiler. Ein fixer Compilerinputattempt ist nicht die tatsächliche Coreattemptnummer. |
| Git-Nebenwirkung | Commit/Merge verändern das lokale Integrationsrepo vor Qualitätsprüfung; das ist keine Deployment- oder Remote-Publish-Aktion. Workspace wird erst nach bestätigter Integration gelöscht. |
| Evidence | Prismbundle, Architekturreport, Implementationcompletion, Lintreport, Reviewreport, Testdecision/Testagenturteil und optional Liefermanifest sind unterschiedliche Namespaces/Artefakte; der Compiler verbindet nur die letzten vier pro Modul. |
| Waiting/Ende | Prism/Approval benutzen Persistenz eines Waits vor Operatornachricht. Core gibt `waiting` zurück. Ein beendeter CLIprozess oder `run.succeeded` beweist keine getestete erreichbare Anwendung für den Operator. |

Fehler sind im Happy Path nicht ausgelöst, die Abzweigungen wurden dennoch nachgelesen: Lint/Review/Test haben `on.request_fix:implement-<modul>` (`compiler.ts:120–132`); Core restauriert Reparatur-Rücksprünge und protokolliert abgeschlossene Geschwister vor der Reparaturinvalidierung (`pipeline-loop.ts:27–32,56–73`). Verlorene Git-/Dispatchantworten werden nicht als Erfolg erfunden: Implementation blockiert und behält unintegrierte Workspaces, `EFFECT_` markiert Reconciliationbedarf (`implementation-agent/src/stage.ts:60–64,78–96`). Crash nach Merge vor Completionartefakt ist ein separates Persistenzfenster; nachfolgende Revisionsauflösung darf nicht aus HEAD einen fehlenden Nachweis ersetzen. Duplicate-/Late-Result- und Recoveryvollprüfung liegen in den dafür vorgesehenen Szenarien; hier werden weder genau-einmal-Ausführung noch ein bestandener Wiederanlauf behauptet. Vorbestehende `PCR-EXEC-001/002` bleiben relevant für Wait-/Artefakt-Recovery.

### Befunde, Abgrenzung und Ursachenbehebung

#### Präzise offene Abschlusslücke, keine neue pauschale Sicherheitsbehauptung

Tailscaleexposure als Provider ist implementiert; Operatorbenachrichtigung als Adapter/Observer ebenso. Die nachgelesene Projektsummary besitzt ausschließlich Artefakt-I/O. Die nachgelesene Previewbenachrichtigung enthält ID/Digest/Mediatyp/logischen Namen, kein vollständiges Zugangsbundle. Der gewünschte erhaltene Namespace, wirkende Authentifizierung, sichere Übergabe gegebenenfalls erforderlicher Credentials und spätere Abnahme/Bereinigung werden hier **nicht als vorhanden** abgehakt. Details und etwaige eindeutige Abschlussdefekte gehören dem spezialisierten Operator-Testzugang-Trace; keine Credentials wurden gelesen/übernommen. Bestehende `PCR-TAILSCALE-001/002`, `PCR-NOTIFY-001`, `PCR-OPERATOR-001` werden dadurch weder dupliziert noch als hier reproduziert ausgegeben.

### Implementiert, optional, manuell und fehlend

| Verhalten | Einordnung am geprüften Stand |
|---|---|
| Menschlich vereinbarter Modulplan | Absichtlich manuell; kein Automatisierungsdefekt |
| Projectmodul-Lint vor Echo | Technisch durch Compilerkanten implementiert; Compiler verlangt Echo zusätzlich zwingend |
| Modultests inkl. Testagent | Im Projectmodus zwingend; Modulscope, kein automatisch erzeugtes kumulatives Gate |
| Prism / Architecture-Reviewer / Approval / Summary | Implementierte registrierte Plugins; durch expliziten Graphen zu aktivieren, kein automatischer Projectpfad |
| LLM-Architektururteil, Forge-Checks, Designqualität | Verhaltensauftrag und strukturierte Auswertung; keine deterministische Garantie fachlicher Korrektheit |
| Drei Designs/Feedback-Anpassung | Verantwortung der Prism-Unterkette; Nova-Designstage erzwingt selbst keine Dreizahl oder Lernwirkung. Detailtrace erforderlich |
| Compiler-Gesamtabschluss mit erhaltenem Testzugang | Im hier nachgelesenen Assemblypfad fehlend |
| Pipeline Review / Case Study | Installiert, durch Graphwahl optional; für T01 aus, kein impliziter Trigger bei `run.succeeded` im Coreloop |
| Clawdeck | Kein in T01 nachgewiesener Abschlussmechanismus; nicht aus Zielbild als implementiert übernommen |

Zusätzlich zum ursprünglichen Zielablauf sind für Vollständigkeit Launcher-Modus/Runtimevalidierung, Schema-/Planresolver, Gitworktrees und Integrationscommit, Artefaktstore/Revisionsresolver, Corejournal/Effects/Waits, Notificationprojektion und typisierte Fixture-/Exposureprovider explizit zu berücksichtigen. Installationsinventar und fachliche Stagefolge sind unterschiedliche Prüfgegenstände.

### Tatsächlich ausgeführte Prüfungen und offene Nachweise

Ausgeführt wurden ausschließlich lesende Quellenabfragen am festen Commit, statische Pfad-/Symbolprüfung und Abgleich mit den drei genannten Einzelreviews; keine Tests, CI oder Agentsitzungen der geprüften Pipeline wurden gestartet.

`tests/verification/contracts/check-project-compiler.mts` vollständig gelesen, **NICHT AUSGEFÜHRT**. Der Test assertiert deterministische Reihenfolge, exakt acht Stages bei zwei Modulen, Dependency `implement-app → test-library`, SourceStage-Verweise und Reparaturkanten; er startet im Testtext nur Compile/Validierung und bestätigt ausdrücklich `executedStages:0`. Die historischen Erfolgsaussagen in `nova.entry.md` belegen daher selbst bei korrekter damaliger Ausführung keinen Forge-/Prism-/Preview-End-to-End-Pfad.

Noch erforderliche Laufzeitbelege: realer Operator→Prism→freigegebener Bundle→Plan-Handoff; echte zwei Forgeworktrees am autorisierten Ort; originale deterministische Suites und Testagent mit denselben Kandidaten; finaler Gesamtscope R0→R2; erhaltene erreichbare Anwendung mit tatsächlicher Authentifizierung und sicherer Operatorübergabe; Abnahme-/Cleanupentscheidung; Wiederaufnahme an Wait- und Merge-/Artefaktgrenzen. Ohne diese ist der Endzustand dieses Szenarios **kein ausgeliefertes getestetes Projekt**, sondern eine nachgewiesene Reihe implementierter Teilpfade mit zwei fehlenden Assemblierungsanschlüssen und dem bestätigten Workspacehandoffdefekt.

Empfohlene Reihenfolge späterer Behebung: (1) Workspacevertrag PCR-IMPLEMENTATION-001, (2) kanonischer ausführbarer Projekteinstieg T01-F01, (3) vollständige Productkomposition mit explizitem kumulativem Scope und Freigabebindung T01-F02, (4) Operator-Testzugang und Retention, anschließend reale End-to-End- und Recoveryverifikation. In diesem Auftrag ausschließlich dokumentiert.

### T02 — Designiteration, Feedback und freigegebener Rückweg

Einzeltrace: [T02-design-feedback.md](T02-design-feedback.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Stand, Szenario und Ergebnis

Geprüfter Code: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` (Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`). Sämtliche folgenden Quellbelege beziehen sich auf diesen Commit. Bestehende Komponentenreviews wurden am Dokumentationsstand `a9e080ab1e1981ec5713e9b742f94280835fd347` gelesen; deren ursprüngliche Kennungen bleiben erhalten. **Statischer Trace, kein bestandener Laufzeit-/E2E-Test. Keine Tests ausgeführt.**

Ausgangslage: expliziter Nova-Graph mit `kubeclaw.prism-design`, gültiges Architektur-JSONartefakt A1 desselben Nova-Runs R, `requiresDesign=true`, Operatorissuer und Nachrichten-Ziel konfiguriert. Prism Control, PostgreSQL, CAS, SPIFFE-Proxy, Agentbridge/OpenClaw und Studio werden als erreichbar angenommen. Projektmodus wird dadurch ausdrücklich nicht als automatisch mit Prism verdrahtet behauptet.

Variante: drei Designs D1/D2/D3; Operator bewertet D1, wählt D2, verlangt eine Änderung, liest persistiertes Feedback und erwartet dessen Verwendung in einem späteren Vorschlag; zusätzlich verspätetes A1-Ergebnis nach Architekturwechsel A2. Vorgesehener Endzustand: freigegebene Baseline zurück bei Nova, mit Prüfung der nachfolgenden Materialisierung.

**Ergebnis: blockiert.** Erste deterministische Bruchstelle des ausgewählten Feedbackpfads ist `PCR-PRISM-CONTROL-002`: Direction-Feedback-/Select-IDs sind keine UUIDs, obwohl die Datenbank UUID verlangt. Auswahl kann bereits committed sein, während API und Feedbackpersistenz scheitern. Unter ausdrücklich hypothetischer Behebung wird weitergetraced; Baseline-Erstellung stößt zusätzlich auf `PCR-PRISM-WORKER-001`. Über diese Brüche hinaus sind Lernrückkopplung und Generations-Revisionsbindung lückenhaft. Ein erfolgreicher Nova-Import allein materialisiert keine Forge-/Busterdateien.

### Vollständige Übergangsfolge

| Schritt | Erzeuger → Transport/Persistenz → Empfänger und Rückweg | Zustand, Identität und Beleg |
|---|---|---|
| 1 | Nova `execute` ersetzt input.runId durch Lease-runId, liest Architekturref über `artifacts.read/get_json`, prüft Bytes, Größe und kanonischen Digest. | `skills/nova/plugins/prism-design/src/stage.ts:9–18`, `execute`: gleicher Producer-Run, JSON, ≤256 KiB; Request enthält external projectId, Architektur-artifactId/contentDigest/revision und Architekturinhalt. Kein Beweis der vorangehenden menschlichen Architekturarbeit. |
| 2 | `runtime.dispatch` mit Agent Prism und Key `R:prism:A1digest:request` erreicht konfigurierten Prism-Agentbridge `/v1/dispatch`. Bridge leitet an Control weiter. | `stage.ts:18–20`; `skills/prism/server/agent-bridge.mjs:52–76`, HTTP-handler. Bridge gibt idempotency-key weiter; produktiver SPIFFEpfad ist Voraussetzung. In HMAC-only-Konfiguration leitet sie keine HMAC-Signatur weiter; hier kein HMAC-Deployment behauptet. |
| 3 | Control authentisiert Dispatch, validiert designRequest, legt Projekt mit UUID und externalId an, lockt Projekt, verwirft rückläufige Revision/denselben Revisionstand mit anderem Digest. Ältere aktive Requests werden superseded. | `skills/prism/server/control.ts:300–344`, Dispatchroute: Projekt-upsert ist vor separater Requesttransaktion; aktive Architektur ist projektbezogen, kein Nova-runId in Persistenzvertrag. Rückgabe 202 waiting mit interner Projekt-UUID. |
| 4 | Bridge erhält 202 und startet im Hintergrund `openclaw agent --session-key ...` mit Architektur und Aufforderung zu drei Dokumenten. | `agent-bridge.mjs:25–44,63–76`: Promisequeue nur RAM. Prompt ist keine erzwungene Toolausführung; Prozessausgang wird geloggt, nicht als durable Ergebnis an Nova übertragen. `PCR-PRISM-AGENT-BRIDGE-001/-002` gelten. |
| 5 | Agent ruft `prism_create_design_set(projectId, designs)`; Plugin POSTet Control `/v1/agent/design-sets`. | `skills/prism/openclaw-plugin/index.mjs:22–53`, `register`; `control.ts:362–379`: SPIFFE-Agentpeer, exakt drei Dokumente/verschiedene Keys, Schema und Material-Diversity erforderlich. `skills/prism/directions/index.ts:27–36`, `assertMaterialDirectionDiversity`: gewichtete Struktur-/Token-Distanz ≥3 je Paar; keine objektive Rangfolge oder Passungsbewertung. |
| 6 | `createDirectionSet` schreibt drei Dokumente, Revisionen und proposed Directions atomar. Agent erhält IDs und Studio-URL. | `skills/prism/storage/index.ts:189–218`: external projectId muss Dokumentmeta entsprechen; Projektlock; aktive requestId wird erst beim Ergebnis angenommen. Gleicher Inhalt wird already-created, andere zweite Generation derselben Anfrage Konflikt. Ergebnis enthält keine Architekturrevision/Generation/Attemptbindung: PATH-T02-002/-003. |
| 7 | Parallel dazu erzeugt Nova nach Dispatch eine durable Signalwait und veröffentlicht Operatoranforderung; Stage endet `wait`. | `stage.ts:21–27`, `waitFrom:8`: signal `prism.approval.resolved`, autorisierter Operatorissuer, expiry, Projekt; Waitresource R+Projekt. Nachricht enthält Architektur-Digest und Wait-ID, aber keine vom Agent später erzeugte Studio-URL. Crash nach Dispatch vor Wait/Publish bleibt eigener Recoveryfall. |
| 8 | Studio liest aktive Directions, Operator klickt like/dislike/preserve/reject oder select; HTTP mit Session und CSRF geht an Control. | `control.ts:108–121,461–470,481–583`; `skills/prism/studio/app.tsx:428–481,742–764`. Selection liest vorgeschlagene Direction und prüft source_revision_id gegen aktuelle Dokumentrevision. Zustandsupdate und Preferenceinsert sind **keine** gemeinsame Transaktion. |
| 9 | Feedback soll als `prism.preference-event.v1` mit sessiongebundenem userId, external projectId, Directiontarget, Trait, Aktion und scope project gespeichert werden. | `control.ts:504–522,552–578`; `skills/prism/storage/migrations/001_prism.sql:58–61`: `event-<hex>` wird in UUID-IDspalte geschrieben. **Erste Bruchstelle PCR-PRISM-CONTROL-002.** Reject/Select kann schon wirksam sein; Selectretry sucht weiterhin proposed und scheitert. Folgeschritte 10–16 sind bedingte Fortsetzung, keine Ausführung. |
| 10 | Nach hypothetischer Behebung liest Studio `/v1/preferences?project=<externalId>`; Control filtert subject/project, projiziert Events und gibt learned+events zurück. | `studio/app.tsx:349–366`; `control.ts:1101–1134`; `skills/prism/preferences/index.ts:40–108`, `projectPreferences`: liked/selected +1, rejected/disliked/reverted −1, preserved +0.5; Retraktion entfernt Beleg; gesamte Traitwertung altert mit 180-Tage-Halbwertszeit ab jüngstem Event. Rating ist Aktion/Projektion, keine numerische Design-Rankingentscheidung. |
| 11 | Änderungswunsch sendet `generate`, instruction, baseRevision und Idempotenzkey; Control lädt historische Revision und schickt `/v1/revise` an Agentbridge. Agent soll `prism_apply_revision` aufrufen. | `studio/app.tsx:313–340`; `control.ts:621–654`; `agent-bridge.mjs:78–92`; `openclaw-plugin/index.mjs:56–73`. Generate zweigt vor `runWorker` ab; späterer generate-Persistenzzweig `control.ts:685–711` ist hier unerreichbar. Designentwurf gehört OpenClaw, nicht deterministischem Worker. |
| 12 | Revisionsempfänger prüft Projektowner, expectedRevision, Schema und genau +1; Repository setzt aktuelle Revision mit CAS. | `control.ts:381–392`; `storage/index.ts:336–369`, `replace`: konkurrierende/verspätete Revision scheitert an current revision/CAS. Gleichzeitiger Request mit gleichem Input wird jedoch nicht als durable Agentjob geführt. Revisionprompt enthält aktuellen Inhalt und instruction, keine gelernte Preferenceprojektion (PATH-T02-001). |
| 13 | Operator akzeptiert Qualitywarnings und freigibt; Studio hasht Dokument, POSTet `/v1/approvals`, dann `/v1/baselines`. | `studio/app.tsx:483–536`; `control.ts:717–825`: serverseitiges evaluate blockiert Fehler; Warningmenge muss exakt entsprechen; Approval bindet Revision-ID und aktive Architektur. Übermittelter designDigest wird beim Approval gespeichert, erst beim Baselinebau mit aktueller Revision verglichen. Baseline verlangt aktive ausgewählte Direction. |
| 14 | Control baut Renderaufträge für jede View×State×Viewport, speichert JSONinput in CAS, erzeugt neutralen Workerattempt und POSTet `/v1/attempts`. | `control.ts:143–195,889–920`; `skills/prism/engine/worker-envelope.ts:20–33`, `prismAttempt`: neue executionId/attemptId/claimId, inputDigest, Profile, synthetic prism-run/plan aus Idempotenzkey; moduleId/gateId null. Keine Behauptung, dies sei derselbe Nova-Workerattempt. |
| 15 | Worker authentisiert/validiert Envelope, lädt nur deklarierte Input-URL mit Digest/Größe, führt Engineoperation aus und lädt Screenshot/ARIA in CAS; neutraler Core beendet Versuch. Control importiert Resultat und persistiert Operationsergebnis. | `skills/prism/server/worker.ts:59–95,147–158`; `skills/prism/engine/worker-binding.ts:15–47`; `control.ts:124–141,198–215`. **Weitere Bruchstelle PCR-PRISM-WORKER-001:** Worker loggt, übergibt aber keinen storeFullLog; `skills/worker/core/worker/attempt-executor.ts:540–567` macht errored. `PCR-PRISM-CONTROL-001`: Control prüft nur completed, keine vollständige Ergebnis-Envelopebindung. |
| 16 | Unter weiterer Annahme behobenen Workers: Control erstellt Spezifikation, Criteria, Previewindex, Checksums, Manifest, CASarchiv und Baselinezeile; Studio zeigt Digest/Approval-ID. Operator muss Nova-Signalweg separat bedienen. | `control.ts:823–826,960–1010`; `studio/app.tsx:520–536`. Studio sendet hier **kein** Nova-resolved-Signal. Kein automatischer Studio→Nova-Callback in diesem Producer. Nutzerentscheidung und echtes Signalsystem sind unterschiedliche Übergänge. |
| 17 | Bei separat authentisiertem gültigem Resume prüft Nova guidance mit issuer, approvalId, architectureDigest, bundleDigest. Approved Dispatch holt gespeicherte zur aktiven Architektur passende Baseline; Nova validiert Archiv und speichert importiertes JSONartefakt, Stage passed. | `stage.ts:7,12,18–20,29–31`; `control.ts:345–359`; `skills/nova/plugins/prism-design/src/archive.ts:22–72`, `verifyBaselineArchive`: Archivdigest, genehmigter Bundledigest, Projekt/Revision, Schema, Checksums, sichere Pfade, Assets/Previews und Limits. Keine Ausführung oder Aussage über funktionierende Anwendung. |
| 18 | Ende des belegten automatischen Rückwegs: Nova besitzt geprüftes Archivartefakt einschließlich designRequest/approvedArchitectureDigest. | `stage.ts:30–31`; `skills/prism/pipeline-adapter/index.ts:20–56`, `toBusterPlan`/`toForgeAssignments` liefern lediglich Plandaten/readonly-Deklaration; keine Dateiextraktion. `skills/nova/plugins/prism-design/README.md:7` nennt Modulplanintegration und Materialisierung ausdrücklich ausstehend. Vollständige Forge-/Buster-Nutzung bleibt fehlender Anschluss, kein erfolgreicher Traceabschluss. |

### Bestehende Findings im konkreten Trace

| Kennung | Anwendung und eigenständig nachgelesener Beleg | Ursachenbehebung / späterer Nachweis |
|---|---|---|
| PCR-PRISM-CONTROL-002 | Hoch, erster Bruch: `control.ts:504–522,552–578`; Migration `001_prism.sql:58–61`. SQLuuid und Wire-eventId widersprechen sich, Directionupdate liegt davor. | Interne UUID/Wire-ID sauber trennen und Selection/Event atomar mit Replaykey schreiben. Echter Control+Postgres-Feedback-/Selecttest inklusive DBfehler und ACKverlust. |
| PCR-PRISM-WORKER-001 | Hoch, bedingter Baselinepfad: `worker.ts:64–67,152–156` gegen `attempt-executor.ts:540–567`; Control verwirft errored `control.ts:204–207`. | Pflichtvoll-Logs dauerhaft speichern und nach neutralem Vertrag referenzieren; echter Renderdienst mit lesbarer Logevidenz. |
| PCR-PRISM-CONTROL-001 | Mittel, Ergebnisse: `control.ts:198–214` prüft keine Attempt-/Claim-/Envelope-Digestbindung vor Resultcommit. | Gemeinsame vollständige Empfangsvalidierung. Gültiges Ergebnis eines anderen echten Attempts muss vor Persistenz scheitern. |
| PCR-PRISM-PREFERENCES-001 | Mittel, scope: `preferences/index.ts:61–72` ohne projectId; ungefilterter GET `control.ts:1124–1134` mischt Projektpräferenzen eines Subjects. | Projektidentität in Scopekey, persönliche Zustimmung separat. Zwei Projekte mit gegenläufigem Trait getrennt projizieren. |
| PCR-PRISM-AGENT-BRIDGE-001 | Hoch laut bestehendem Review; `agent-bridge.mjs:7,25–44,75–76,91–92,104–105`: 202 vor langlebiger Job-/Resultpersistenz. | Durable Job/Outbox/Status und idempotente Toolresultate; Prozessrestart nach ACK. |
| PCR-PRISM-AGENT-BRIDGE-002 | `agent-bridge.mjs:66,83,97`: Sanitizing/Kürzung kann verschiedene external IDs auf gleiche Session abbilden. | Kollisionsfreie kodierte/hashgebundene Projektidentität; zwei kollidierende Namen in echte getrennte Sessions. |

Weitere bestehende Grenzen aus Worker-/Storage-/Studioreviews werden nicht als neue T02-Findings dupliziert: `PCR-PRISM-WORKER-002/-003`, `PCR-PRISM-STORAGE-001`, `PCR-PRISM-STUDIO-001/-002`. Sie sind keine zusätzlichen in diesem Trace gemessenen Laufzeitereignisse.

### Ergänzte Komponenten und Abweichungen vom Zielbild

Implementiert: Agentbridge/OpenClawtool als tatsächlicher Entwurfsproduzent; drei strukturell verschiedene Dokumente; PostgreSQL-Revisionen mit CAS; projektbezogene Feedbackevents und reine Projektion; serverseitige Quality-/Warningkontrolle; Renderworker; überprüfbarer Baselineimport. Optional: vollständiger Skip bei requiresDesign=false (`stage.ts:10`), dann keine Designarbeit oder Artefakte.

Nicht erzwungen: Aufforderung des Agentprompts, tatsächlich zu Ende das Tool zu benutzen; fachliche Eignung der drei Designs; personalisierte Wahl anhand persistierter Profile. Der deterministische Worker lehnt generation ausdrücklich ab (`worker.ts:62–63`); vorhandene Engineproviderklassen beweisen keinen produktiven Einsatz zur Auswahl der drei Designs.

Fehlende Anschlussarbeit: Studioabschluss löst nicht selbst Nova-wait auf; freigegebenes Nova-Artefakt wird nicht durch diese Stage in Worktree-/Visual-Baseline-Dateien materialisiert. Die separat manuelle Modulplanung ist keine automatische Materialisierung. Erwartung an den Operator: Approval-ID/Digest über einen funktionsfähigen, authentisierten Signalweg an Nova liefern. T02 behauptet dessen Laufzeitfunktion nicht.

Offene Races: Baseline liest Approval/Architektur vor längeren Renderphasen ohne finale transaktionale Revalidierung; alter Baselinecache und spätere Änderungen verlangen eigenen Negativnachweis. Selection read/check/update und Feedbackcommit haben zusätzliche Konkurrenzfenster. Diese bleiben Verdachts-/Nachweispunkte, keine hier neu behaupteten bewiesenen Exploits. Eine Revision vor Auswahl macht source_revision_id stale; die Fehlermeldung fordert Neugenerierung, die für dieselbe Architektur an PATH-T02-003 scheitern kann.

### Prüfungen, Nachweise und verbleibende Arbeit

Tatsächlich durchgeführt: statisches Lesen der beidseitigen HTTP-/Pluginübergänge, SQL-Spaltentypen/Transaktionsgrenzen, Archivproducer/-verifier, Worker-Core-Logabschluss, Originalreviews und unten genannter Testquellen. **Ausgeführte Tests: keine.** Keine CI, kein Deployment, keine Codeänderung. Historische Testzahlen aus Komponentenreviews werden nicht als Ergebnis dieses Traces übernommen.

Gelesene, **nicht ausgeführte** Tests:

- `skills/nova/plugins/prism-design/tests/live-function.test.ts:5–21` testet nur requiresDesign=false, keinen Design-/Approvaldienst.
- `skills/prism/tests/control.test.mts:5–14` testet Tailscale-Sessionhelper und Signatur/Expiry, keinen Control-HTTP-Feedbackfluss.
- `skills/prism/tests/directions.test.mts:6–26` prüft Materialdistanz/Kopien/Tokenänderung/Keyorder, keine spätere Runde oder Architekturkorrelation.
- `skills/prism/tests/quality.test.mts:6–129` prüft Projektion/Retraktion/Decay und Evaluation an Fixtures, keine Speicherung oder konsumierte Agentpräferenzen.
- `skills/prism/tests/engine.test.mts:9–161` prüft Engine/Binding/Idempotenz an Fixtures, nicht vollständigen Service-Executor mit Pflichtlog und Baselinepublikation.

Gelesene Vorreviews: `docs/review/components/prism.service-control.md`, `prism.preferences.md`, `prism.service-worker.md`, `prism.service-agent-bridge.md`, `kubeclaw.prism-design.md` und zentrales `docs/review/findings.md`. Infraauthentisierung/Ingress/DB-/CASbetrieb bleiben notwendige, hier nicht getestete Voraussetzungen; es werden keine Secrets übernommen.

Empfohlene Reihenfolge: (1) Feedback-Atomizität/IDvertrag und Worker-Logabschluss beheben; (2) Auftrag-/Architektur-/Generationsbindung sowie durable Agentannahme; (3) neue Designrunden und nachvollziehbaren Preferenceinput ergänzen; (4) expliziten Operator-Signalabschluss und Modulplan-/Readonly-Materialisierung verbinden; (5) Originaldienste mit echter DB/CAS/Chromium, Neustart/verspäteten Antworten und echter Nova-Resume-Kette prüfen. Erst danach könnte ein runtime-/E2E-Nachweis entstehen.

Orchestrator-Gegenprüfung: abgeschlossen (statisch); Details im Gegenprüfungsprotokoll.

### T03 — Architekturreview, Nachbesserung und erneute Acceptance

Einzeltrace: [T03-architecture-repair.md](T03-architecture-repair.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Prüfstand und Ergebnis

Codecommit für **alle** folgenden Codebelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` (Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`). Statischer Trace, keine Tests ausgeführt, keine funktionalen Änderungen. Vorhandene Komponentenreviews wurden aus Dokumentationscommit `a9e080ab1e1981ec5713e9b742f94280835fd347` gelesen; dort genannte erfolgreiche Tests sind historische Angaben, keine Ergebnisse dieses Traces.

**Ergebnis: Zielablauf nicht durchgehend implementiert.** Im Projectmodus ist die erste Bruchstelle bereits die fehlende Architektur-/Acceptance-Verdrahtung. Im ausdrücklich zusammengestellten Graphmodus existieren Reviewer und digestgebundene Berichtsfreigabe, aber die Operatorentscheidung „beheben“ führt zu einem blockierten Run; sie ist keine implementierte Reparatur-/Re-review-Schleife. Die administrative Fortsetzung hat zudem eine konkrete alte-Guidance-Grenze. Nachfolgende Schritte wurden deshalb konditional weiterverfolgt, nicht als erfolgreicher Lauf ausgegeben.

Szenario: Operator und Nova haben Architektur und Modulplan manuell erarbeitet. Reviewer meldet nichtblockierende Fehler/Warnungen; Operator wählt Behebung; Nova überarbeitet Architektur und Plan; Reviewer prüft erneut; nur der tatsächlich überprüfte und akzeptierte Stand soll für Forge verfügbar sein. Blocking-Finding, fehlender Reviewer, unveränderte Restfindings, veraltete Zustimmung und Crashfenster sind Nebenvarianten. Zielendzustand ist autorisierte Implementierungsbereitschaft, nicht ausgeführte Implementierung.

### Voraussetzungen und Komponentenstatus

| Komponente/Verhalten | Status am Commit | Beleg |
|---|---|---|
| Manueller Architektur-/Modulplan | Externe Ausgangsarbeit; kein automatischer Planungsschritt vorausgesetzt | `skills/nova/project/compiler.ts`, `compileProject`, 46–103 konsumiert vorhandene Module |
| Architekturvalidator | Implementiertes, ausdrücklich auswählbares Plugin | `skills/nova/plugins/architecture-validator/src/stage.ts`, `execute`, 4–44 |
| Architektur-Acceptance | Implementierte explizite Registrierung | `skills/nova/plugins/human-approval/plugin.json`, 19–31 |
| Automatische Projectverdrahtung dieser beiden Stages | Fehlend; Compiler erzeugt ausschließlich Modulstages | `skills/nova/project/compiler.ts`, `compileProject`, 103–136 |
| Ohne Arch-Reviewer | Technisch unterstützt: Projectmodus bzw. Graph ohne Stage; kein expliziter Risiko-Bypassschalter erforderlich | gleicher Compiler; `skills/nova/core/execution/graph.ts`, `ExecutionGraph.ready`, 45–46 |
| Archviewer | Präsentationsserver, weder Reviewer noch Approvalautorität | `docker/Dockerfile.archviewer`, 5–9,16–21: nginx, `/designs`, Port 3456 |
| Preflight/Blueprintsync | Explizite zusätzliche Stages, nicht vom Projectcompiler erzeugt | Compiler 103–136; jeweilige `src/stage.ts` unten |
| „Beheben“ als Approvalentscheidung | Nicht implementiert; nur pending/approved/rejected | `skills/nova/plugins/human-approval/src/approval.ts`, `parseApprovalGuidance`, 94–118 |
| Reportdigestbindung | Implementiert | `architecture-approval.ts`, `execute`, 86–108 |
| Bindung an tatsächlich gelesene Source-/Planrevision | Nicht im Architektur-/Approvalvertrag erzwungen | `protocol.ts`, 1–4,18; `output.ts`, 61–82; `architecture-approval.ts`, 86–118 |

Für den konditionalen Graphpfad müssen Plattformregistrierungen, Grants und echte Dispatch-/Artifact-/Wait-/Operatorprovider konfiguriert sein. Der Graph muss eine Ordinary-Dependency vom Reviewer zum Acceptance-Gate und von dort zur Implementierung enthalten. Eine optionale Aktivierung auf `architecture.review = approval_required` ist möglich, muss aber korrekt deklariert werden. Ein solcher vollständiger Produktionsgraph wurde in diesem Trace nicht als deployed nachgewiesen.

### Vollständige Übergangsfolge

#### 1. Entrypoint und erste Bruchstelle

`compileProject` akzeptiert nur schemaVersion/id/runId/repositoryRoot/workspaceRoot/baseRevision/modules (Compiler 46–55). Module enthalten task, requirements, Ownership und Implementierungs-/Lint-/Review-/Testkonfiguration; Review- und Testagent sind Pflicht (60–89). Topologische Ordnung entsteht 92–102. Erste erzeugte Stage ist `implement-<module>`; beim ersten Modul existiert keine vorgelagerte Architektur-/Operator-Dependency (103–119). Anschließend folgen lint/review/test; kein Acceptanceartefakt wird konsumiert (120–136).

Damit kann der Projectpfad nicht als „nach Architektur-Acceptance autorisiert“ bezeichnet werden. Weiterverfolgung erfolgt **unter der zusätzlichen Voraussetzung eines expliziten Graphen** mit Reviewer, Architektur-Approval und Implementierungsdependency. Dies ist keine Behauptung, der Compiler habe diese Verdrahtung.

#### 2. Nova/Graph → Architekturreviewer

`architecture-validator/src/stage.ts#execute:4–11` nimmt `ArchitectureInput {task, architecture?}`, liest `config.agent`, ruft `runtime.dispatch` mit operation `dispatch`, resource `{type:'runtime.agent',canonicalId:agent}` auf. `protocol.ts#buildArchitectureRequest:5–45` erzeugt `kubeclaw.architecture-validation.v2`, Agent, Instruktion, Architekturobjekt und Outputcontract. Der Prompt grenzt Softwarearchitektur von deterministischem Preflight ab und verlangt ausdrücklich niemals `request_fix` (11–16).

Korrelation liegt im äußeren Capabilityrequest: `core/execution/stage-executor.ts#runtime:53–74` erzeugt Run-/Stage-/Attempt-ID und monotonen Attemptzähler; `#context:78–89` erzeugt Effectkey `runId:stageId:attemptNumber:sequence`. Der fachliche Architekturbody enthält selbst keine Pflichtfelder für Projekt-/Modul-/Source-Revision. `checkedFiles` wird später ausschließlich vom Agenten behauptet.

Beim HTTP-Dispatchprovider validiert `skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts#createDispatchAdapter:25–32` Fence, Abbruch und erlaubtes Ziel. `runtime-dispatch/src/adapter.ts#activate:110–144` validiert JSON-/Bytebudgets, bezieht Secret über vertraulichen Capabilitycall, sendet POST mit Idempotency-Key und optional HMAC und verlangt 2xx plus Objektantwort. SPIFFE-Proxy ist ausschließlich Loopbackkonfiguration (63–89). Die Antwort wird synchron zurückgegeben; `architecture-validator/src/output.ts#parseArchitectureOutput:61–82` erwartet `response.result`. Dies ist ein Providerpfad, keine Behauptung einer laufenden realen LLM-Gegenstelle; der konfigurierbare OpenClaw-Provider und dessen Betriebszustand wurden hier nicht als Laufzeitnachweis geprüft.

#### 3. Reviewer → Report → Acceptancebereitschaft

Der Parser erzwingt geschlossene Struktur, Scope domain_model/integration_boundary und blocking/error/warn/info. `passed` erfordert nichtleere checkedFiles und keine blocking-Findings; `blocked` erfordert mindestens eines (output.ts 32–82). Ein `error` oder `warn` darf also bei abgeschlossenem Review `passed` sein. Das bedeutet **nicht fehlerfrei**.

`stage.ts:19–32` schreibt den unveränderten fachlichen Report über `artifacts.write/put_json`, ID `architecture-validation`, Namespace `kubeclaw.architecture-validator`. Bei passed liefert die Stage Fact `architecture.review=approval_required` bei Findings, sonst `clean`; bei blocking kommt `architecture.blocked` und Runstop (35–44; Core `reducer.ts:98–103`, `run-decisions.ts#stop:108–113`). Dispatch-/Parsefehler werden schon 7–17 zu `architecture.invalid_output/blocked`. Kein automatischer Reparaturrequest entsteht.

Der Core speichert das vollständige Attemptresult vor dessen Projektionen (`stage-executor.ts:133–135`; `run-decisions.ts#record:28–32`, `#artifacts:48–54`). Resultartefakte müssen denselben Run und Producerstage haben. Nachfolgende Stages sehen Artefakte nur aus eigener Stage und transitiven Ordinary-Vorgängern (`stage-executor.ts#priorArtifacts:96–105`). Ohne Graphdependency reicht eine passende Artefakt-ID nicht aus.

#### 4. Acceptance → Operatornachricht → Wait

`human-approval/src/architecture-approval.ts#execute:86–108` filtert Reportreferenzen nach ID, Namespace und aktuellem Run, verlangt genau einen Producer und genau eine Referenz seines höchsten Attemptzählers. MediaType JSON, 1–256 KiB, Digest und Bytegröße werden gegen gelesenes canonical JSON geprüft. Nur verdict passed ist zulässig. Findings werden zusammengefasst; die Nachricht enthält den Reportdigest (109–118). Keine Findings ergibt sofort passed ohne Operatorwait (111–117).

Bei Findings geht `executeApproval({summary},context)` an `human-approval/src/stage.ts:17–54`: Parser prüft Input/Config/Guidance; pending erzeugt `approval:<runId>:<stageId>`, Ablaufzeit und `signal.wait/create` mit `approval.resolved`, autorisiertem operator-Issuer und Summary. `wait-store/src/adapter.ts#activate:205–235` persistiert eine an den Effectkey gebundene Wait-ID; identische Wiederholung muss identische Nutzlast haben. Erst nach vollständiger Antwortprüfung (`approval.ts#validateCreatedWait:160–194`) erfolgt `operator.request/publish` mit approvalId, waitId, summary, signalType, issuer, expiresAt. Anschließend wird `outcome:wait` zurückgegeben.

`operator-messaging/src/adapter.ts#deliver:65–131` schreibt Deliveryrequest/Reservation, sendet HTTP, validiert 2xx und persistiert Receipt. Das ist keine Benutzerentscheidung. Bei Discordformat transformiert `discordWebhookPayload:12–25` ausschließlich Titel/Summary/Fields usw.; die Approvalkorrelationsfelder werden nicht automatisch sichtbar gerendert. Der tatsächliche eingehende/authentifizierte Operator-Resumeweg muss zusätzlich existieren. Kein solcher Webhookdialog wird allein durch diese Sendefunktion bewiesen.

Core `reducer.ts:90–96` speichert waiting nur bei verbleibendem Attemptbudget; `run-decisions.ts#wait:100–105` schreibt separate stage.waiting-Zeile. Pending-Wait und späterer bestätigter Versuch verbrauchen beide Attempts. Ein Graph mit maxAttempts=1 blockiert bereits beim Waitresult statt einen benutzbaren Gatezustand zu behalten.

#### 5. Operator wählt „beheben“ — zweite Bruchstelle

Ein Signal mit decision `fix` oder `request_fix` ist ungültig (`approval.ts:94–118`). Der darstellbare Entscheid ist `rejected` mit Reason „beheben“. `core/execution/engine-run.ts#resumePipeline:76–89` prüft gepinnte Pakete/Graph, findet aktiven Wait, validiert Signal und schreibt Signaljournal plus wait.resolved. `engine-snapshots.ts#validateSignal:112–118` prüft Wait-ID, Signaltyp, Issuer, Expiry und zeitliche Frische; die Issuerbehauptung setzt einen vertrauenswürdigen aufrufenden Host voraus, keine hier implementierte Benutzeranmeldung.

`recovery-state.ts#applyRecoveryEvent:161–166` speichert signal.payload als continuationGuidance. `pipeline-loop.ts:128` reicht diese Guidance an den neuen Approvalattempt weiter. `approval.ts#resultForApprovalGuidance:135–157` liefert bei rejected `blocked/approval.rejected`; `run-decisions.ts#stop:108–113` stoppt den Run. Es gibt weder automatischen Rückweg zu Nova noch einen strukturierten Reparaturauftrag mit neuem Planstand.

#### 6. Konditionale externe Reparatur, Re-review und Wiederöffnung

Unter der **zusätzlichen Annahme externer manueller Behebung** können Architekturdateien geändert werden. Eingebettete Graphinputs dürfen bei Resume jedoch nicht verändert werden: `engine-snapshots.ts#verifyPinnedGraph:67–71` lehnt abweichenden Digest ab. Ein korrigiertes eingebettetes architecture-Objekt benötigt daher einen neuen Run; eine Änderung hinter einem unveränderten Pfad bleibt dagegen vom Graphdigest unentdeckt. Das sind unterschiedliche Fälle.

Ein blockierter Run benötigt `engine-admin.ts#reopenPipeline:24–28`. Der Adminpfad authentifiziert Actor/Allowlist, prüft identische Entscheidung und gepinnten Graph; remediation muss dem deklarierten `on.request_fix` entsprechen und ein nichtterminales Ziel mit Budget haben (55–81). Er kann einen vorhandenen Reparatur-/Reviewerpfad wieder aktivieren, erfindet aber keine fehlende Graphkante. `#remediate:121–127` setzt Target pending und ReturnTo; nach Erfolg setzt `run-decisions.ts#completeRemediation:124–129` den ursprünglichen Gate-Requester pending. Dies ist die konditionale technische Rückkante zum Gate.

**Konkrete Grenze:** Adminretry wie Adminremediation erhalten alte continuationGuidance durch Objektspread (`engine-admin.ts:112–127`). Die Rückkehr entfernt nur remediationTarget/-ReturnTo (`run-decisions.ts:124–129`). Bleiben im neuen Report Findings, ruft architecture-approval wieder die generische Approvalstage auf; diese verwendet dieselbe alte `rejected`-Guidance und blockiert sofort ohne neuen Wait (`human-approval/src/stage.ts:19–20`). Ein sauberer Report umgeht dagegen den generischen Pfad (architecture-approval.ts 111–117). Eine echte neue Operatorfreigabe bei verbleibenden Findings ist so nicht erreicht. Siehe F-T03-03.

#### 7. Nur konditional: neue Acceptance → Blueprint/Preflight → Forgebereitschaft

Für einen **neuen, korrekt verdrahteten Run** oder nach späterer Ursachenbehebung kann der Reviewer den überarbeiteten Stand erneut liefern. Bei Findings ist eine frische Approval erforderlich; gültiges approved ergibt passed. Bei clean ergibt Architektur-Approval direkt passed. Graphready verlangt alle Ordinary-Dependencies in completed (`graph.ts:45–46`); completed enthält succeeded und skipped (`pipeline-loop.ts:86–108`). Ein falsch deklarierter Activationfact kann das Gate daher überspringen; das Plugin erzwingt nicht selbst die Pipelinepolicy.

Optional synchronisiert `blueprint-sync/src/stage.ts#execute:13–48` controlPaths aus branchRef über git.sync, committet returned synced paths, schreibt `blueprint.controls.synced` plus Artefakt mit blueprintId/branchRef/synced/missing. Missing ergibt request_fix **nach** möglichem Teilcommit. Der Bericht enthält weder aufgelösten Sourcecommit noch erzeugten Zielcommit und konsumiert keine Approvalreferenz.

Optional liest `preflight-contract/src/stage.ts#readBlueprint:53–73` `<modulePath>/FORGE.md` oder alle Substepdateien über `git.repository.read/read_text`. `validateDeclarations:75–93` prüft Dateibasename-Vorkommen für serveDockerfile/apiSpecFile; Bericht `preflight-contract:<moduleId>` enthält passed/failures. Fehlende Datei blockiert (113–130), fehlende Deklaration fordert Reparatur (132–139). Das ist kein semantischer Architekturreview und kein Inhaltsdigestvergleich. Der vorhandene **PCR-PREFLIGHT-001** gilt auch hier.

Erst nach erfolgreichen expliziten Dependencies ist Forge im Graph schedulingfähig. Die Compilerimplementation trägt dagegen baseRevision/requirements und Workspaces, jedoch keine Approvalevidenz (`compiler.ts:111–119`). **Endstatus dieses Traces:** Schedulingfähigkeit unter genannten Zusatzannahmen nachvollziehbar; durchgängige bindende Freigabe des korrigierten Architektur-/Modulplanstands nicht nachgewiesen.

### Daten-, Zustands- und Artefaktentwicklung

| Phase | Identität / Zustand | Persistenz und verbleibende Bindung |
|---|---|---|
| Runstart | runId, pipelineId, Graphdigest | run-snapshot.json pinnt Graph/Registry, keine externen Architekturdateibytes |
| Reviewerattempt A1 | runId/stageId/attemptId/attemptNumber | Effectkey korreliert Dispatch; Architekturbody task/architecture |
| Report R1 | artifactId/namespace/digest/sizeBytes/producer | Immutable JSON; checkedFiles sind Pfadbehauptungen, kein Sourcehash |
| Gate G1 | aktuelle Run-/Producerreferenz; waiting | Wait-ID aus Effectkey, Summary enthält R1-Digest |
| Reject | signalId/idempotencyKey/waitId/issuer | signals.jsonl und wait.resolved; continuationGuidance=rejected; Run blocked |
| Externe Korrektur | Plan-/Dateistand A2 | Keine eigene bindende Revision im Approvalvertrag; eingebetteter Graphinput nicht austauschbar |
| Admin-Re-review | neue Attemptnummer, R2 | Reportauswahl nimmt neuesten Producerattempt; alte Guidance bleibt auf Gate |
| Neuentscheidung | bei verbleibenden Findings erforderlich | Mit Altguidance erneuter Block statt G2; neuer Run trennt die Runidentität |
| Blueprint/Forge | blueprintId/branchRef bzw. moduleId/baseRevision | Keine technisch verifizierte Ableitung aus genehmigtem Source-/Plancommit |

### Findings und Ursachenbehebung

#### Vorhandene Befunde, nicht neu nummeriert

| Kennung | Relevanz für T03 | Hier geprüfter Bezug |
|---|---|---|
| PCR-EXEC-001 | Crash nach durable Attempt-Waitresult vor separatem Waitereignis kann Resume blockieren | `stage-executor.ts:133–135` → `run-decisions.ts:100–105` → `engine-run.ts:95–101` |
| PCR-EXEC-002 | Architekturreportblob existiert, fehlt aber nach Crash im Resultartefaktindex | `stage-executor.ts:44,96–105,133–135` → `run-decisions.ts:28–32,48–54`; Approval verlangt sichtbare Referenz |
| PCR-APPROVAL-001 | Schema erlaubt agentRole, strikter Runtimeparser lehnt es ab | `human-approval/src/approval.ts:67–82`; Originalreview gelesen |
| PCR-PREFLIGHT-001 | Beliebige Basenamenennung reicht als Lieferdeklaration | `preflight-contract/src/stage.ts:75–93`; keine stärkere Behauptung |
| PCR-GIT-001 | sync_paths klassifiziert Gitfehler als missing; Reparaturpfad kann falsche Ursache melden | Blueprintsync-Komponentenreview gelesen; Gitadapterursache nicht erneut vollständig verfolgt |
| PCR-OPERATOR-001 | Persistierte Deliveryfailure verhindert erneuten tatsächlichen Send desselben Attempts | `operator-messaging/src/adapter.ts:91–105,149–172`; zentrale Eigentümerkennung beibehalten |

Quellen dieser Kennungen: [human-approval](../components/kubeclaw.human-approval.md), [architecture-validator](../components/kubeclaw.architecture-validator.md), [nova.execution](../components/nova.execution.md), [blueprint-sync](../components/kubeclaw.blueprint-sync.md), [zentrales Register](../findings.md). Keine Infrastrukturdefekt-ID neu behauptet; erforderliche persistente Stores und authentifizierter Operatorzugang sind Laufzeitvoraussetzungen.

### Gegenprüfbare Randbedingungen und offene Nachweise

- Doppelte/verspätete Signale: `engine-run.ts:92–108` verlangt bestehenden aktiven Wait, idempotentes Signal und keine zweite Auflösung; `engine-snapshots.ts:112–118` lehnt falschen Issuer, abgelaufenen Wait und zeitlich altes Signal ab. Authentifizierung des aufrufenden Menschen bleibt Hostpflicht.
- Abbruch/Timeout: `stage-executor.ts:117–140` raced Ausführung, markiert Timeout/Abbruch, widerruft Lease. Dies beweist keine sofortige Beendigung eines bereits extern laufenden LLM-Auftrags.
- Mehrere Speichergrenzen: Dispatch → Artefaktblob → Attemptresult → Resultindex → Gate-Waitstore → Deliveryrequest/-Receipt → Corewait → Signaljournal → wait.resolved sind separate Commitpunkte. Keine gemeinsame Transaktion behauptet. Bestehende PCR-EXEC-001/002 statt neue Doppelbefunde.
- Blueprintsync kann vor request_fix bereits vorhandene Teilpfade committen; Recovery und HEADdrift benötigen später echten Git-/Crashnachweis. Graphremediation invalidiert normale Descendants via `remediation.ts:13–51`, externe Dateiedits allein tun dies nicht.
- Discorddarstellung enthält nicht automatisch die Approvalkorrelation. Offen bleibt ein belegter, authentifizierter Operator-Rückkanal inklusive Zugriff auf ungekürzten Report. Hier nur Integrationsnachweis offen, keine pauschale Aussage, Discord könne generell keine Entscheidungen verarbeiten.
- Reportgrößen: Validator erlaubt bis 128 Findings mit langen Texten (`output.ts:32–57`), Approval höchstens 256 KiB (`architecture-approval.ts:95–96`). Große interoperable Reports sind offen; nicht als reproduzierter Fehler verkauft.

### Tatsächlich durchgeführte Prüfung und Tests

Durchgeführt: statisches Lesen der oben genannten Originaldateien am SHA, Übergabe-/Rückgabeabgleich, Zustandsfortschreibung anhand Reducer/Recovery/Admincode, Lesen der vier genannten Originalkomponentenreviews und des zentralen Befundregisters. Keine Repositorytests, CI, Deployments, realen Agents oder Gitoperationen ausgeführt.

Inspektierte Tests **NICHT AUSGEFÜHRT**:

- `skills/nova/plugins/architecture-validator/tests/protocol.unit.test.ts:7–52`: erlaubt error/passed, lehnt blocking/passed sowie request_fix ab; reine Parser-/Promptprüfung, kein Architekturlauf.
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts:9–35`: echter Artifactadapter, handgebauter Context; schützt exakte alte Digestreferenz gegen später geschriebenes Objekt, prüft Run-/Größen-/Ambiguitätsfälle. Test deckt weder Sourcecommitbindung noch Reject→Repair→Re-review→neue Zustimmung ab.

Die historischen Testresultate der Komponentenreviews wurden nicht übernommen als „hier bestanden“. Offene Laufzeitnachweise: echter Reviewer mit gepflegtem Modulplan, vollständiger expliziter Gategraph, authentifizierter Operatorresume, Reparatur mit verbleibendem/neuem Finding, veränderte Source-/Planrevision, Crashpräfixe über alle Speichergrenzen und anschließender Forge-Dispatch nur für identisch autorisierte Quellen.

### Empfohlene spätere Reihenfolge

1. Festlegen und technisch verdrahten, wo Architektur-/Plan-Acceptance verpflichtend ist (Projectcompiler und/oder bindender Eingangsvertrag).
2. Unveränderliche Source-/Planmanifestbindung von Review bis Forge herstellen.
3. Repairentscheidung und neue Approvalgeneration einführen; Admin-/Normalremediation einheitlich invalidieren (F-T03-03).
4. Vorhandene Core-Wait-/Artefakt-Recoverybefunde und Approvalschemaabweichung beheben.
5. Originale komplette Gate-/Operator-/Git-Kombination einschließlich Crash und Refdrift ausführen. Statischer Trace bleibt kein bestandener E2E-Test.

### T04 — Risikoakzeptanz, veraltete Freigaben und Resume

Einzeltrace: [T04-risk-acceptance.md](T04-risk-acceptance.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Codebasis für **alle** folgenden Codebelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; Subagent `/root/trace04`. Statische Prüfung, keine Tests, CI, Deployment oder funktionale Änderungen ausgeführt. Status: Trace abgeschlossen, Orchestrator-Gegenprüfung abgeschlossen (statisch). Referenzreviews: Commit `a9e080ab1e1981ec5713e9b742f94280835fd347`, Komponenten `kubeclaw.human-approval`, `kubeclaw.architecture-validator`, `nova.execution` und zentrales Befundregister gelesen. Historische Testerfolge daraus sind keine in diesem Trace ausgeführten Tests.

### Szenario, Voraussetzungen und erste Bruchstelle

Ausgangspunkt ist ein **expliziter Graph** mit einem Architekturvalidator, abhängiger Architekturfreigabe und davon abhängiger Implementierung. Erforderlich sind aktivierte Registrierungen, Runtime-/Artefakt-/Wait-/Operatorprovider und passende Grants, persistente Runjournale, erreichbares Operatorziel, ein vertrauenswürdiger Host für Resume sowie mindestens zwei Attempts für die Approvalstage (Anfrage und Entscheidung). Der Reviewer liefert `passed` mit einem `error`/`warn`/`info`-Finding. Der Operator möchte dieses bewusst akzeptieren. Varianten: blockierendes Finding, falscher/verspäteter/doppelter Entscheid, geänderter Graph bzw. veränderte referenzierte Dateien, Crash und administrative Reparatur.

**Erste Bruchstelle im regulären Projectmodus:** `skills/nova/project/compiler.ts#compileProject:103–136` erzeugt ausschließlich Implementierung, Lint, Review und Modultest; weder Architekturvalidator noch Acceptance. Der hier beschriebene Acceptancepfad wird deshalb vom Projectcompiler nicht aufgerufen. Fortsetzung unten gilt ausdrücklich unter der zusätzlichen Voraussetzung eines korrekt verdrahteten expliziten Graphen. Ein Graph ohne Arch-Reviewer wird unterstützt: weder Graphscheduler noch Compiler erzwingen diese Stage. Das ist optional implementierte Graphfähigkeit, keine bewiesene Erfüllung des gewünschten verpflichtenden Ablaufs.

**Erste Bruchstelle bei einem blocking-Finding:** `architecture-validator/src/output.ts#parseArchitectureOutput:75–80` verbietet passed mit blocking; `src/stage.ts#execute:35–42` liefert blocked. Der nachgelagerte Acceptanceknoten wird nicht regulär bereit. Auch ein direkt aufgerufenes Architectureapproval verweigert `verdict != passed` (`human-approval/src/architecture-approval.ts#execute:107–108`). Bewusste Akzeptanz blockierender Findings ist somit nicht implementiert; dies ist eine Zielbildabweichung, keine unsichere Umgehung.

### Vollständige Übergangsfolge des bedingt erreichbaren Pfads

Alle Pfade in dieser Tabelle sind relativ zum Repository; Pluginpfade beginnen mit `skills/nova/plugins/`, Corepfade mit `skills/nova/core/`, sofern ausgeschrieben nicht anders angegeben.

| Schritt | Aufrufer → Empfänger, Daten und Rückweg | Codebeleg / Zustand |
|---|---|---|
| 1 | Engine friert Definition ein, erstellt Runroot und Graph-/Registry-Snapshot. Graph pinnt Stages samt Config/Input und Kanten; Stagebereitschaft folgt den deklarierten Dependencies. | `skills/nova/core/execution/engine-run.ts#runNewPipeline:30–37`; `graph.ts#snapshot/ready:40–46`. Keine semantische Pflicht eines Acceptanceknotens. |
| 2 | Architekturstage sendet an `runtime.dispatch` `{operation:dispatch, resource:runtime.agent, payload:{protocol,agent,task,architecture,outputContract}}`. Architectureobjekt ist optional; task enthält Reviewinstruktionen. | `architecture-validator/src/stage.ts#execute:4–18`; `protocol.ts#buildArchitectureRequest:1–45`. Weder Source-SHA noch Modulplan-Digest sind Pflicht. |
| 3 | Empfängerantwort muss `response.result` mit verdict, summary, findings und checkedFiles liefern. Format und blocking-Konsistenz werden geprüft; checkedFiles sind Agentenangaben, kein technischer Lesenachweis. | `architecture-validator/src/output.ts#parseArchitectureOutput:61–82`. Transport-/Parsefehler → blocked/architecture.invalid_output. |
| 4 | Validator schreibt JSON-Bericht über `artifacts.write/put_json`, ID `architecture-validation`, Namespace `kubeclaw.architecture-validator`; Ergebnis enthält ArtifactRef und Fact `architecture.review=approval_required`. | `architecture-validator/src/stage.ts#execute:20–33`. `passed` bedeutet Review abgeschlossen, nicht findingfrei. |
| 5 | Core stellt nur Artefakte derselben Stage und transitiver Vorfahren bereit. Architectureapproval wählt genau einen Producer und dessen höchsten Attempt im selben Run für ID+Namespace. Es liest über `artifacts.read/get_json` den exakten Digest und prüft Größe, SHA-256, Medientyp und kanonische Bytes. | `skills/nova/core/execution/stage-executor.ts#priorArtifacts:96–105`; `human-approval/src/architecture-approval.ts#execute:86–108`. Fehlen/Mehrdeutigkeit/veränderte Bytes → Fehler, kein stilles latest-store-Fallback. |
| 6 | Leere Findings → passed ohne Operator. Sonst Summary mit Berichtdigest und gekürzten Findingdetails → generisches Approval. | `human-approval/src/architecture-approval.ts#findingSummary:45–79`, `#execute:109–118`. Vollbericht maximal 256 KiB; Nachricht maximal 10.000 Zeichen. |
| 7 | Approval validiert input/config/guidance. Pending erzeugt `approval:<runId>:<stageId>` als Ressourcen-ID und `signal.wait/create` mit Signalklasse `approval.resolved`, zulässigem Operator und Expiry (Default 60 Minuten), Summary im request. | `human-approval/src/stage.ts#execute:17–38`; `src/approval.ts#parseApprovalConfig:72–90`. `skills/nova/core/execution/stage-executor.ts#context:78–89` versieht Aufrufe mit Run/Stage/Attempt/Sequenz-Idempotenz. |
| 8 | Waitstore prüft Payload, schreibt durable Record und leitet konkrete waitId aus Idempotenzschlüssel ab. Identische Wiederholung liefert denselben Wait; abweichender Inhalt unter demselben Key wird abgewiesen. Approval prüft zurückgelieferte Issuer-, Expiry-, Summary- und Waitfelder. | `skills/common/plugins/wait-store/src/adapter.ts#activate:205–235`; `human-approval/src/approval.ts#validateCreatedWait:177–224`. |
| 9 | Erst danach veröffentlicht Approval `operator.request/publish` mit approvalId, waitId, Summary, Signaltyp, Issuer und Expiry an das konfigurierte Ziel. Messaging löst Secret, erzeugt HMAC/Idempotencyheader, sendet HTTP POST, akzeptiert nur 2xx und persistiert Receipt. | `human-approval/src/stage.ts#execute:39–55`; `skills/common/plugins/operator-messaging/src/adapter.ts#deliver:107–131`. Ausgehendes HMAC authentifiziert keine eingehende Operatorentscheidung. |
| 10 | Plugin liefert wait-Ergebnis. Reducer erhöht Attempts und setzt waiting, sofern Budget nicht erschöpft. DecisionRecorder persistiert stage.waiting; Runner pausiert. | `skills/nova/core/lifecycle/reducer.ts#wait:90–96`, `#applyStageResult:105–122`; `execution/run-decisions.ts#wait:100–106`. Mit maxAttempts=1 blockiert bereits das Warten. |
| 11 | Operatorentscheidung wird als ResumeSignal durch vertrauenswürdigen Aufrufer an `resumePipelineV2` gegeben. Vor Zustandsmutation: Runlock, gepinnte Packages/Runtimeconfig/Graph, keine terminale Rungrenze, passender rekonstruierter Wait und gesonderter Wait-Erstellungsbeleg. | `skills/nova/core/execution/engine.ts#resumePipelineV2:30–32`; `engine-run.ts#resumePipeline:76–89`, `#recoveredWait/validateWaitHistory:92–102`. Core-CLI liest Signal aus Datei (`core/cli.ts:61–67`); hier kein Discord-Login-Callback. |
| 12 | `validateSignal` prüft Schema, waitId, Signaltyp, Issuer-Gleichheit, aktuellen Ablaufzeitpunkt und issuedAt >= Waiterstellung. Signaljournal prüft Idempotenzkonflikt und zweite Entscheidung desselben Waits. Danach wait.resolved mit runId/stageId/waitId und vollständigem Signal. | `engine-snapshots.ts#validateSignal:112–119`; `engine-run.ts#recordSignal:103–108`, `#recordWaitResolution:110–115`. |
| 13 | Recovery setzt Approvalstage pending und speichert signal.payload als continuationGuidance. Ein neuer Attempt liest denselben Architekturbericht erneut, dann approved/rejected aus Guidance. Issuer muss auch innerhalb der Payload zur Config passen. | `skills/nova/core/lifecycle/recovery-state.ts#applyRecoveryEvent:161–166`; `human-approval/src/approval.ts#parseApprovalGuidance:103–128`; `architecture-approval.ts#execute:86–118`. |
| 14 | Approved → passed, keine neuen Artefakte/Capabilityaufrufe im generischen Approvalteil. Rejected → blocked mit optionalem Grund. Reducer/Recorder schreiben stage.succeeded oder stage.blocked; abhängige Implementierung wird bei Erfolg bereit. | `human-approval/src/approval.ts#resultForApprovalGuidance:146–173`; `skills/nova/core/lifecycle/reducer.ts#pass/stopped:69–72,98–103`; `execution/run-decisions.ts#complete:116–122`; `graph.ts#ready:45–46`. |

Endzustand der positiven Variante: dieselbe **Berichtsreferenz** ist akzeptiert und Implementierung graphseitig bereit. Dass die tatsächlich anschließend gelesenen Quellen und der Modulplan noch dem Reviewstand entsprechen, ist dadurch nicht bewiesen (PATH-T04-001). Implementierung selbst liegt außerhalb dieses Szenarioendes und wird in T05ff. verfolgt.

### Identitäten, Entscheidungen und Negativvarianten

| Variante / Identität | Tatsächlich erzwungenes Verhalten |
|---|---|
| Run / Stage / Attempt | Artefaktfilter bindet aktuellen Run, sichtbaren Vorfahren, genau einen Producer und neuesten Producerattempt. Konkreter waitId stammt aus Effectidentität; Resume findet damit den Stagezustand im ausgewählten Run. Signal trägt keine eigenständig verglichene Source-SHA. |
| Projekt / Modul / Plan | Architekturinput kennt task und beliebiges architecture-Objekt. Projekt-/Modul-ID, Planrevision und Source-SHA sind kein Pflichtvertrag des Reports oder der Approvalguidance. Sie können vom Graphautor als Inhalt eingefügt werden, werden dann aber nicht semantisch gegen Arbeitsdateien geprüft. |
| Geänderter Graph oder eingebetteter Modulplan | Snapshotdigest umfasst vollständige Stageknoten; Resume/Reopen lehnen Graphdigestabweichung ab (`engine-snapshots.ts:67–72`). Eingebettete Architektur-/Planwerte sind damit gepinnt. |
| Geänderte Datei bei unverändertem Pfad/Graph | Kein Read-/Hash-/HEAD-Vergleich im Validator-/Approvalpfad. Alter Bericht kann weiterhin bestanden werden. |
| Fremder Issuer | Äußerer Issuer wird vor Signalcommit verglichen, innerer Guidance-Issuer im Approvalparser. Falsche ID scheitert. Eine korrekt behauptete ID ist kein unabhängiger Identitätsnachweis; vertrauenswürdiger CLI-/Hostaufrufer bleibt Voraussetzung. |
| Expired / alt | Jetzt >= expiresAt oder issuedAt vor Waiterstellung wird abgewiesen. Es gibt keinen aktiven Timer, der den wartenden Run selbstständig beendet. |
| Duplikat | Nach erfolgreicher Auflösung ist der Wait nicht mehr aktiv; erneutes Resume wird stale/terminal abgewiesen. Identisches bereits gespeichertes Signal kann das Fenster vor wait.resolved idempotent schließen, solange übrige Validierungen weiterhin erfüllt sind. Keine zweite Implementierungsfreigabe behauptet. |
| Payload rejected | Bewusste Ablehnung stoppt mit blocked; keine request_fix-Ausgabe. Reparatur benötigt expliziten administrativen Weg oder neuen Run. |
| Blocking akzeptieren | Nicht unterstützt. Adminreopen kennt retry/remediation/cancel, keine force-passed-/risk-accepted-Continuation. |
| Autorisierter Adminreopen | `engine-admin.ts#authorize:61–65` vergleicht unabhängigen Authenticatorprincipal mit actor und Allowlist. `#validate:67–81` verlangt blocked-Stage/Run, deklariertes Remediationziel und Budget. Graph-/Packagepinning bleibt bestehen (`#run:37–46`). Identischer bereits journalisierter Entscheid replayt ohne erneute Authentifizierung; veränderter Inhalt kollidiert (`#recorded:55–58`). |
| Ohne Arch-Reviewer | Explizite Graphen können direkt generisches Approval oder Implementierung deklarieren; Stagegrants ersetzen keine Produktpolicy für Pflichtgates. Projectmodus enthält ebenfalls keinen Arch-Reviewer. |

### Findings und belegte Grenzen

#### Bestehende Befunde, Kennungen unverändert

- **PCR-EXEC-001 (mittel):** Crash nach durable attempt.completed mit wait-Result, vor separatem stage.waiting. `recovery-state.ts:37–55` rekonstruiert Wait, normales Recover verlangt Signal (`engine-run.ts:60–61`), Resume verlangt aber `payload.wait` auf Ereignisebene (`95–101`), nicht das im Result verschachtelte Wait. Pfad blockiert geschlossen. Historische Probe des Eigentümerreviews betraf orchestrator_required; die explizite Approvalwait-Variante ist hier am gleichen Branch statisch nachverfolgt, nicht ausgeführt. Ursachenbehebung/Verifikation wie Eigentümer: Waitidentität/-zeit aus kanonischem Result rekonstruieren, sämtliche gültigen Präfixe mit Originalengine prüfen.
- **PCR-EXEC-002 (mittel):** Nach Architektur-attempt.completed vor artifact.created kann Stageerfolg wiederhergestellt werden, während der Bericht nicht in priorArtifacts erscheint. `stage-executor.ts#priorArtifacts:96–105` und Architectureapproval `86–93` führen dann zu REFERENCE_MISSING_OR_AMBIGUOUS statt Freigabe. Kein Verlust der Blobbytes behauptet. Eigentümer fordert idempotente Resultartefaktprojektion beim Replay; echten abhängigen Approvalleser in die Regression aufnehmen.
- **PCR-APPROVAL-001 (mittel):** Zulässiges Schemafeld agentRole wird im Runtimeconfigparser abgewiesen (`human-approval/src/approval.ts:72–75`, `schemas/config.schema.json`). Voraussetzung des positiven Traces ist daher eine Config ohne dieses Feld. Keine neue ID für denselben Vertragsdefekt.
- **PCR-OPERATOR-001:** Messaging speichert terminalen Sendefehler und wirft ihn bei identischer Wiederholung erneut, statt erneut zu senden (`skills/common/plugins/operator-messaging/src/adapter.ts:99–105,149–172`). Dies betrifft die Erreichbarkeit der Entscheidung; nicht als erfolgreich benachrichtigter Operator gewertet. Eigentümerbericht behält Ursachenfix und Schweregrad.

### Unterbrechungen, offene Fragen und Prüfbedarf

Waitstorecommit → Nachrichtenversand → Receipt → attempt.completed → stage.waiting sind getrennte Schritte. Vor Corewait kann eine Nachricht existieren, deren Entscheidung noch nicht aktiv auflösbar ist. Beim Neustart werden unterbrochene Attempts pending (`recovery-state.ts:179–182`); neue Attemptnummer und Uhrzeit können neue Wait-/Expirywerte erzeugen. Keine atomare Gesamtransaktion und keine garantierte genau-einmal-Nachricht behauptet.

Signaljournal → wait.resolved ist ebenfalls getrennt. Ein Crash nach Signaljournal und Wiederanlauf **erst nach Expiry** trifft zuerst `validateSignal` und wird expired; ein bereits gespeicherter Entscheid wird nicht selbstständig angewendet. Dies ist eine konkret abgeleitete Recoverygrenze, hier als offene Produktsemantik geführt: zählt rechtzeitiger Empfang oder rechtzeitige Fortsetzung? Nach wait.resolved bleibt Guidance bei Recovery erhalten (`recovery-state.ts:161–166`).

Die Resume-API besitzt keinen Authenticatorparameter (`engine.ts:30–32`), anders als Adminreopen (`33–34`). Core-CLI verlangt Zugriff auf vertrauenswürdige Dateien/Host; innerhalb dieser Grenze ist die Issuerprüfung ein Vertragscheck. Eine authentifizierte Discord-/Clawdeck-Rückleitung wurde in diesem Trace **nicht** belegt. Daher kein behaupteter unautorisierter externer Endpoint und kein fingierter Login-Erfolg. Vor tatsächlicher externer Nutzung muss ein Host die verifizierte Identität mit beiden Issuerfeldern verbinden.

Abgleich mit T03: **PATH-T04-001** und **F-T03-02** beschreiben dieselbe fehlende Source-/Planbindung. **PATH-T04-003** und **F-T03-03** zeigen unterschiedliche Auswirkungen derselben unvollständigen administrativen Zustandsbereinigung. Im Gesamtbericht deduplizieren und beide Trace-IDs als Aliase behalten.

### Tatsächlich ausgeführte Prüfungen / nicht ausgeführte Tests

Ausgeführt wurden ausschließlich Dateilesen, Quellbaumsuche, nummerierte Codeinspektion und Abgleich mit den vorhandenen Einzelreviews am identischen Sourcecommit. Kein npm/node-Testkommando, kein Laufzeitprozess der Pipeline, keine Mocks als Nachweis.

Gelesen, **NICHT AUSGEFÜHRT**:

- `skills/nova/plugins/human-approval/tests/approval.unit.test.mjs:14–112`: Input/Config, matching und fremder Issuer, approved/rejected, ungültige Entscheidung, Expiryberechnung, Waitvalidierung. Kein authentifizierter Resume-Transport, kein Source-/Planwechsel.
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts:21–34`: echter Artifactadapter mit handverdrahtetem Context; alte exakt referenzierte Version bleibt trotz neuerem Storeobjekt lesbar, falscher Run/Bytes/fehlende/mehrdeutige Referenzen werden abgelehnt. Keine menschliche Risikoentscheidung, kein vollständiger Coregraph.
- Historische Core-/Plugin-Ergebnisse wurden nur in `docs/review/components/nova.execution.md` und `kubeclaw.human-approval.md` gelesen; keine erneute Ausführung und kein eigener Laufzeitbeweis.

Empfohlene Folgeprüfreihenfolge: Produktgrenzen der Acceptance festlegen → Source-/Planbindung → kanonische Crashrekonstruktion PCR-EXEC-001/002 → echte authentifizierte Rückleitung → Originalgraph mit negativen und positiven Entscheidungen einschließlich neuer Revision nach Reparatur. Bericht enthält keine Zugangsdaten.

### T05 — Einzelmodul: Lint-, Echo- und Buster-Reparaturen

Einzeltrace: [T05-module-repairs.md](T05-module-repairs.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Status: statischer Trace abgeschlossen; Orchestrator-Gegenprüfung abgeschlossen (statisch). Kein Laufzeit- oder E2E-Erfolg. Geprüfter Code-Commit für **alle** folgenden Quellbelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Reviewquellen: `a9e080ab1e1981ec5713e9b742f94280835fd347`, insbesondere `docs/review/findings.md` und Komponentenberichte `kubeclaw.implementation-agent`, `nova.lifecycle`, `kubeclaw.buster-quality-gate`. Historische Testaussagen dieser Berichte sind keine Tests dieses Traces.

### Szenario, Ausgangszustand und Ergebnis

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

### Belegindex: Pfad, Symbol, Zeilen

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

### Vollständige Übergangsfolge

#### 1. Plan → Core → Forge

1. `compileProject` validiert Run, Projekt, Modul, absolute Roots, disjunkte Ownershippräfixe und Providerplan. `plan.runId`, `plan.project` und Modulscope müssen passen. `review.agent`, `lint` und `test.agent` sind verpflichtend; „nur Lint“ ist in diesem Entrypoint keine unterstützte Variante. Es erzeugt `implement-m → lint-m → review-m → test-m`, alle `on.request_fix=implement-m`, `maxConcurrency=1` (C1). Die nachfolgende Stage heißt zwar `test-m`/`gateId:test-m`; der tatsächliche Providerplan bleibt **Modulscope**, kein kumulatives Gate.
2. Der Scheduler wählt Implementation. StageExecutor erzeugt `attemptId=attempt:<UUID>`, `attemptNumber=1`, aktive Lease mit Run/Stage/Grants und schreibt `attempt.created`/`attempt.dispatched`; Fähigkeiten werden mit `runId:stageId:attemptNumber:sequence` korreliert (C23). Die Stage ersetzt caller-owned `runId` und `attempt` durch die Leasewerte (C2).
3. `git.workspace.create` erhält Repositoryroot, `workspacePath=<workspaceRoot>/<runHash>/m`, Branch `nova/p/<runHash>/m`, `baseRef=HEAD`. Gitadapter führt `git worktree add -b ...` aus, prüft den kanonischen Workspace und liest `rev-parse HEAD` (C1/C2/C5). Der tatsächliche Ausgangsstand R0 ersetzt `input.headBefore`; der konfigurierten 40-stelligen `baseRevision` entspricht R0 nur, wenn Repository-HEAD tatsächlich dort steht. Keine zusätzliche Gleichheitsprüfung wird hier behauptet.
4. `buildRequest` sendet `protocol=kubeclaw.implementation.v2`, Agent, Identität `{runId,moduleId,attempt}`, `headBefore`, Task/Requirements/Ownershipprosa und Outputcontract. **workspacePath fehlt**. OpenClaw `spawnSession` verwendet `cwd:target.cwd` statt des erzeugten Worktrees (C3/C4). Das ist die erste Bruchstelle PCR-IMPLEMENTATION-001. Ownership im Task ist zudem LLM-Anweisung, keine zusätzliche Gitgrantgrenze.
5. Bedingt unter A1: OpenClaw korreliert Dispatch über Payload-/Dispatch-ID, sucht vorhandene deterministische Session, spawnt oder verbindet erneut, pollt und importiert das Ergebnis nach Modell-/Budgetprüfung. `parseCompletion` akzeptiert nur `ready_for_testing|blocked`, erlaubte Felder, relative ChangedPaths, Checks und Runtime-Sessionevidenz. Für ready verlangt es nichtleere ChangedPaths/Checks, ausschließlich `passed=true` und Sessionabschluss `completed`. Diese Checks sind **Agentenaussagen**, nicht unabhängige Buster- oder Linterbeweise. Run/Modul/Attempt werden nach dem Parsing aus dem Input angehängt (C3/C4).
6. `git.commit` erhält exakt Completion.changedPaths im erzeugten Workspace; Gitadapter führt `git add -- paths`, `git commit ... -- paths` aus. `git.merge` integriert den Branch per `--no-ff` in das Repository und liefert die echte Merge-SHA R1. Dieser Merge findet **vor** Lint/Echo/Buster statt. Nach bestätigtem Merge werden Worktree und Branch entfernt. Cleanupfehler erzeugt Zusatzartefakt und hebt fertige Implementation nicht auf (C2/C5).
7. Persistiertes JSON `implementation:m:1`, Namespace `kubeclaw.implementation-agent`, enthält Completion, `headBefore=R0`, `sourceRevision=R1`; Stage passed liefert zusätzlich `implementation.source_revision=R1`. StageExecutor journalisiert das Resultat, DecisionRecorder prüft Artefakt-Run/Stage und markiert Stage succeeded; erst dann wird Lint freigegeben (C2/C11/C23).

#### 2. Lintfehler → Reparaturauftrag → Forge → erneuter Lint

8. Lint konsumiert `sourceStageId=implement-m`; SDK filtert Implementationartefakte nach aktuellem Run/Source-Stage/Namespace, wählt die höchste Attemptnummer und prüft JSONdigest/Bytes/Status/SHA. `lint.execute` erhält R1, Repository, Policy, `tier=full`. Der Lintcandidate ist ein separater detached Checkout von R1 mit geprüftem HEAD. Die Antwort muss R1 zurückgeben; Report wird gespeichert (C6–C8). Dadurch wird im betrachteten Pfad nicht blind das gerade aktuelle Repository-HEAD gelintet.
9. Semantische Lintbefunde (`total_blocking>0`, keine Toolfehler) ergeben `request_fix` plus Lintreport. Toolausfall ergibt dagegen sofort `blocked`; er wird nicht automatisch als Forge-Reparatur behandelt (C7). T05-A wählt ausdrücklich den ersten Fall.
10. Reducer erhöht Lint attemptsUsed auf 1, remediationCyclesUsed auf 1, wählt `implement-m`. Recorder persistiert `stage.waiting` einschließlich vollständigem `repair-request.v1` **vor** `applyRepair`. Request enthält Requester, Target, Generation, ursprüngliches StageResult und transitiv invalidierte Stages. `applyRepair` entfernt Facts/Wait/Guidance der Nachfolger, stellt Requester waiting und weitere Nachfolger pending; Implementation wird pending mit `remediationReturnTo=lint-m` und `continuationGuidance.repairRequest`. Alle Budgets bleiben bestehen (C9–C11).
11. Forge Attempt 2 lädt ausschließlich die vom Core referenzierten Requesterartefakte: gleicher Run/Requester, JSONmediatyp, Digest, Größe, keine doppelten Refs, höchstens 32 Artefakte/256 KiB. Es liest deren tatsächliche Inhalte mit `artifacts.read` und verifiziert sie vor Dispatch. Request plus Evidence werden der Task-Guidance beigefügt (C13/C2). Das ist eine technisch nachvollziehbare Fehlerübergabe, keine bloße Bitte an Nova, den Fehler später selbst zu suchen.
12. Neuer Worktree vom aktuellen HEAD R1; unter A1 repariert Forge, commit/merge erzeugt R2. Artefakt `implementation:m:2` hat `headBefore=R1,sourceRevision=R2`. Alte Artefakte bleiben als Historie erhalten. Der Recorder entfernt den Returnmarker und setzt Lint pending. Lint Attempt 2 wählt jetzt R2 und muss erneut bestehen. Danach startet Echo Attempt 1 (C2/C5/C6/C10–C12).

#### 3. Echo-Blocker → Forge → Lint → Echo

13. T05-B beginnt frisch mit F1/R1 und bestandenem L1. Echo bindet `revisions.sourceStageId` über `resolveImplementationRevisions`: **Base aus frühestem Implementationartefakt R0, Head aus neuestem R1**. Der Stagepfad bereitet einen gefrorenen Reviewsnapshot vor, dispatcht Echo, verarbeitet eventuell begrenzte Kontexterweiterung, Semantik und verifizierte Findings und reduziert diese anhand Policy/Governor (C6/C14–C16).
14. Ein bloßes Agenturteil „fail“ ist nicht automatisch Reparaturautorität: `classifyVerifiedReviewFinding` berücksichtigt Priorität, Kategorie, Scope, neue/vorbestehende Befunde, Evidenz und Reparierbarkeit. Verifizierte, reparierbare Scopeblocker führen `request_fix`; unbekannter Scope/Integritätsfehler blockiert oder benötigt Orchestrierung. Reportpersistenz ist verpflichtend; Schreibfehler wird `blocked` (C15/C16). T05-B nimmt einen tatsächlich verifizierten reparierbaren Blocker an, der vom Governor nicht eskaliert wird.
15. Requester ist nun `review-m`; Target bleibt `implement-m`. Die transitive Invalidierung setzt auch den **bereits bestandenen Lint** pending und entfernt dessen Facts. Forge erhält Reviewreport und Reason über denselben geschützten RepairEvidencepfad. F2 integriert R2. `#completeRemediation` setzt Echo pending, **führt es aber nicht an seinen Abhängigkeiten vorbei aus**: Echo hängt weiterhin an Lint, deshalb ist L2 der nächste ausführbare Schritt (C10–C13).
16. L2 prüft R2. Echo E2 bewertet weiterhin die vollständige Moduländerung **R0→R2**, nicht nur den Reparaturdiff R1→R2 (C6). Nach erfolgreicher Policy-/Governorprüfung und Reportpersistenz kann B1 starten. T05-B endet nach dessen vollständigem bestandenen Pfad aus Abschnitt 4 bedingt mit allen Stages succeeded.

#### 4. Buster-Modultestfehler → Forge → Lint → Echo → Buster

17. T05-C startet frisch mit F1/L1/E1 bestanden. Qualitystage resolved R1 und ruft `test.plan.execute` mit `providerPlan` und `revision=R1`. Adapter validiert Repositoryroot, Plan, Run und exakte Grantknoten. Produktionspfad baut den committed Source Snapshot von R1 und einen Remotejob mit Idempotency-Key, Pipeline-Stage, Plan, Snapshot, Archiv und Grants (C17–C19). Das Modul kann den vorher integrierten Repositoryinhalt im Snapshot enthalten; der **fachliche Umfang** kommt dennoch aus dem Modulplan, nicht aus einer automatisch hinzugefügten kumulativen Suite.
18. Rückweg: Remoteimport prüft Status.jobId/requestDigest, Result.jobId/planId/planDigest/runId, vollständige Knotenmengen, Attemptdigest/Execution-/Test-/Provider-/Modul-/Gate-/Suiteidentität, finale Attempt-ID, lückenlose Attemptnummern und planseitiges Retrylimit. Evidencebytes werden nach Länge/Digest importiert. Persistenz geht über pending_evidence→complete; Wiederimport derselben Entscheidung ist idempotent, abweichende Identität/Digests führen Konflikt (C20). Die Details der einzelnen Providerprozesse werden hier nicht als erneut voll geprüfter Suite-/Worker-E2E-Trace beansprucht.
19. Ein blockierender nativer Testfehler ergibt Decision `failed`, `gateDecisionStageResult→request_fix`; execution_error/review_required ergeben blocked, cancelled bleibt cancelled (C20/C21). Quality persistiert `buster-quality:test-m:decision:1` und gibt bei jedem nicht-passed **vor Agentdispatch** zurück. Ein Test-Agent kann deshalb einen fehlgeschlagenen deterministischen Test nicht zu passed umdeuten (C17).
20. Core invalidiert bei B1 request_fix wiederum Lint **und Echo**, löscht ihre erfolgreichen Facts und stellt Forge zur Reparatur bereit. Forge erhält die persistierte Gateentscheidung und den Reason über RepairEvidence. Der automatische Handoff enthält hier nur Knotenstatus/Kurzgründe und Result-/Decisiondigest: vollständige Remote-Logs werden nicht als normale Stageartefakte angehängt. Das ist eine begrenzte Diagnosegrundlage, keine behauptete vollständige Evidenceversorgung (C13/C17/C20/C21).
21. Unter A1 und ausreichender Fehlerdiagnose erzeugt F2 R2. Erst L2(R2), dann E2(R0→R2), dann B2(R2) werden freigegeben. B2 verwendet denselben fachlichen Modulplan, jedoch aktuellen Source-Snapshot und neue Core-Attempt-/Effektidentität; erneute Remoteausführung und verifizierter Ergebnisimport sind erforderlich, alte pass-Facts reichen nicht (C6/C10–C12/C17–C20).
22. Bei nativer passed-Decision speichert Quality diese zuerst und dispatcht erst danach `kubeclaw.buster-quality-gate.v2` mit Run/Gate/Attempt und reduzierter suiteEvidence. `parseVerdict` bindet Identität an den aktuellen Aufruf; passed verlangt failureClass=none, leere Findings und keinen übergebenen fehlgeschlagenen Suitebeleg. Das gespeicherte Verdictartefakt enthält R2 und decisionDigest. Erst dann kann die Stage passed zurückgeben. Ein Agent-request_fix würde dieselbe Remediation erneut verlangen und hier an Budgets stoßen (C17/C22).
23. Nach test-m succeeded sind im Einzelmodulprojekt alle vier Stages succeeded; `#finalize` schreibt run.succeeded. Es gibt in dieser kompilierten Definition keinen zusätzlichen Modulabnahmehandler, Operator-Approval, Summary oder Deployment. „Modul akzeptiert“ bedeutet hier nur diesen Corezustand und die zugehörigen überprüften Artefakte; keine Operatorabnahme und keinen behaupteten Laufzeiterfolg (C1/C12).

### Revisions-, Zustands- und Artefaktentwicklung

| Zeitpunkt | Gitstand/Referenz | Corezustand | Artefaktautorität |
|---|---|---|---|
| Vor F1 | Tatsächlicher HEAD R0 | F pending; L/E/B pending | Konfigurationsbase existiert, ist noch kein geprüfter Candidate |
| Nach F1 | Mergecommit R1 | F succeeded; L bereit | implementation:m:1 mit R0/R1 und Runtimecompletion |
| Nach erstem L/E/B-Fehler | R1 bleibt integriert | Requester waiting, F pending, Nachfolger pending; Facts entfernt | Fehlreport bleibt im RepairRequest; alte Artefakte historisch vorhanden |
| Nach F2 | Mergecommit R2 | F succeeded, Requester pending; L muss zuerst laufen | implementation:m:2 mit R1/R2; SDK Reviewbase bleibt R0 |
| Nach neuer Prüfung | L(R2), E(R0→R2), B(R2) | Nur neu bestandene Stages succeeded | Aktuelle Artefakte über höchste Implementationattemptnummer ausgewählt |
| Kombinationsfall vor F3 | R2 | F blockiert wegen attemptsUsed=2 | Kein R3 und keine gültige neue Modulabnahme |

Invalidierung ist hier **State-/Factsinvalidierung**, keine Löschung alter Reports. `ArtifactCheckpointRecorder.artifacts` und `StageExecutor.#priorArtifacts` behalten frühere Artefakte; Sourceverbraucher wählen ausdrücklich die höchste Attemptnummer. Die ursprüngliche Modulbase benötigt gerade das älteste Implementationartefakt (C6/C23/C24). Daher wäre pauschales Löschen aller Altartefakte keine geeignete Ursachenbehebung.

### Befunde

#### Bekannte Querschnittsbefunde und getrennte Beobachtungen

- **PCR-EXEC-002** aus `nova.execution`: Crashfenster nach attempt.completed vor artifact.created kann einen erfolgreichen Stagezustand ohne normale Resultartefaktprojektion zurücklassen. T05 schreibt Implementationartefakte ohne `checkpoint:true`; C2 97–101, C23 34–49 und C24 23–43 zeigen die betroffenen Grenzen. Der weitere Sourceverbraucher C6 blockiert dann ohne Artefakt. Keine neue Dublette und keine eigene Crashreproduktion.
- **PCR-RUNTIME-001** aus dem zentralen Register: Runtime-Sessioncleanup nach Elternabbruch ist nicht als sicher erfolgreich anzunehmen. C4 260–286 und `openclaw-session.ts:200–210` zeigen best-effort Cancellation. Für T05 wird keine Garantie behauptet, dass ein abgebrochener Forgeprozess nicht später noch Dateien verändert.
- **Diagnosegrenze, kein zusätzlicher bestätigter Defekt:** Nativer Busterfailed-Handoff an Forge enthält Decision/Knoten-Kurzgründe, nicht die importierten vollständigen Logs. Die Möglichkeit, daraus ausreichend zu reparieren, hängt vom konkreten Fehler und weiteren autorisierten Lesepfaden ab. Das Komponentenreview `kubeclaw.buster-quality-gate` nennt dieselbe Grenze. Empfehlenswert ist ein begrenzter digestgebundener Evidencezugriff statt bloßer Logduplikation im Prompt.
- **Implementiertes Schutzverhalten:** Nach Echo-/Buster-Reparatur wird Lint erneut erzwungen; vorhandener Echopass wird nach Busterreparatur ungültig. Unter erfolgreicher Persistenz verhindern Graphabhängigkeiten, dass die alten Freigaben den neuen Candidate passieren lassen. Keine Pflichtlintlücke in diesem Compilerpfad festgestellt.

### Duplikate, verspätete Ergebnisse und Unterbrechungen

Der StageExecutor hat eine aktive Lease je Attempt, bildet Invoke-IDs aus Run/Stage/Attemptnummer/Sequenz und revoke/abort am Abschluss (C23). OpenClaw bildet zusätzlich stabile Dispatch-/Sessionkennungen und prüft Abschluss/Modell (C4); Quelle der angenommenen Completion ist die konfigurierte Runtime, nicht eine im Modelloutput frei gewählte Run-ID. Das beweist keine globale Exactly-once-Eigenschaft.

Bei Fehlern zwischen Worktreecreate/Dispatch/Commit/Merge hält der Implementationstage nicht bestätigte Arbeit zurück und liefert blocked; kein automatischer normaler Forge-Retry bei ungewissem Ausgang. Wenn Merge bereits erfolgt ist, Completionwrite oder Resultprojektion aber noch fehlen, kann der Repositoryzustand dem Core voraus sein. Git-/Effektreconciliation gehört zum separaten Recoverytrace; hier ist die Blockierungs-/Beleggrenze dokumentiert. Erhaltene Worktrees nach Cleanupfehler können die Wiederanlage desselben Namens beim nächsten Repair scheitern lassen; deshalb setzt der bedingte erfolgreiche Repairpfad erfolgreiche vorherige Cleanupoperation voraus.

Ein doppelter identischer Artefaktrecord wird von C24 dedupliziert, Konflikte derselben Artifact-/Attemptidentität werden abgewiesen. Die Remoteimportseite C20 akzeptiert Wiederimport nur bei gleichem Job/Request/Result/Decision/Evidence und prüft finale Attemptidentitäten. Alte Reports sind weiterhin lesbare Historie, erhalten aber durch ihre Existenz keine neue Stagefreigabe. Journal-Replay bei jedem einzelnen Schreibpräfix wurde hier nicht ausgeführt; PCR-EXEC-002 bleibt relevant.

### Tatsächlich ausgeführte Prüfungen und Tests

**Ausgeführt:** ausschließlich Lesen des Originalcodes am festgehaltenen Commit, Gegenstellenvergleich, Lesen der drei genannten Komponentenreviews und des zentralen PCR-Registers, manuelle statische Ableitung der vier Varianten und der Zählerstände. Keine Codeausführung, keine Tests, keine CI, kein Gitmutationsbefehl, kein Deployment. Nur diese Reviewdatei wurde geschrieben.

**Gelesene Tests, sämtlich NOT RUN:**

| Testdatei | Relevante Zeilen / untersuchte Aussage | Aussagegrenze |
|---|---|---|
| `tests/verification/reliability/lifecycle.test.mts` | 17–20, 31–58: realer Recorder/Journal, Echo-Repair invalidiert Lint, Graph wählt erneut Lint | Testdefinition hat maxAttempts=8, nicht Compilerwert 2; feste Resultobjekte, kein Forge-/Echo-/Busterlauf |
| `skills/nova/plugins/implementation-agent/tests/live-function.test.ts` | 19–39, 88–143: HTTPfixture, echte Gitintegration, Cleanupfehler, verlorene Antwort | workerWorkspace wird in 99/125 außerhalb des Dispatchvertrags gesetzt; bestätigt gerade nicht produktive cwd-Übergabe |
| `tests/verification/contracts/check-project-compiler.mts` | 35–71, 110–116: Modulscope, Source-Stage, Repairkanten, Compile-CLI | Explizit executedStages=0; kein Nachweis mehrerer Reparaturzyklen |
| `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts` | 8–20: Schemagrenzen gegen caller-owned Erfolgsevidenz | Schematest; keine deterministische Suite und kein Testagent wird ausgeführt |

Historische „bestanden“-Aussagen aus Komponentenreviews wurden nicht erneut bestätigt. Die dort beschriebene fehlgeschlagene Remoteproviderprobe ist ebenfalls keine eigene Ausführung dieses Traces.

### Offene Laufzeitnachweise und Ursachenbehebungsreihenfolge

1. PCR-IMPLEMENTATION-001 beheben und den dynamischen Workspace durch den tatsächlichen Runtimeweg nachweisen; ohne dies ist keine der Modulfolgen produktiv bewiesen.
2. PTR-T05-001 fachlich entscheiden und Compiler-/Retrypolicy konsistent machen; dann wiederholte Fehler über mehrere Prüfer und verpflichtende Wiederprüfungen mit Compileroutput prüfen.
3. PCR-EXEC-002 und externe Commit-/Merge-/Resultfenster schließen; per echten Prozessunterbrechungen belegen, dass Sourceartefakte, Revisionsauswahl und Freigaben nach Resume konsistent sind.
4. Reale Lintfehler, verifizierte Echoblocker und reale Modulproviderfehler jeweils einmal reparieren lassen; nach jedem Repair tatsächliche R2/R3/... an Lint/Echo/Buster und finalem Modulstatus vergleichen. Volle Busterlogs nur über autorisierte, digestgebundene Lesepfade zugänglich machen, wenn die Kurzentscheidung nicht genügt.

Offen bleiben echte Runtimecwd-/Mountparität, tatsächliche Forge-Reparaturqualität, reale Echo- und Buster-Agententscheidungen, komplette Suite-/Workerprozesse und Crash-/Cancellationnachweise. Diese Offenheit ist kein weiterer ausgeführter Fehllauf. Der statisch betrachtete Endzustand einer einzelnen erfolgreichen Reparatur ist nachvollziehbar; der gewünschte kombinierte Reparaturlauf ist am geprüften Compilerstand konkret blockiert.

### T06 — Zwei unabhängige Module und ein abhängiges Integrationsmodul

Einzeltrace: [T06-parallel-modules.md](T06-parallel-modules.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Status: statisch vollständig bis zum vorgesehenen Ende verfolgt; tatsächliche Ausführung blockiert/bedingt, kein bestandener Lauf. Subagent: `/root/trace06`.

### Stand, Voraussetzungen und Varianten

Alle Codebelege beziehen sich auf **85ddfcbfc15e078780ea0434fc167e6f9a9b9488**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Zeilen sind 1-basiert. Vorreviews stammen aus `a9e080ab1e1981ec5713e9b742f94280835fd347`, insbesondere `docs/review/components/{kubeclaw.implementation-agent,kubeclaw.git-workspace,nova.effects}.md` und `docs/review/findings.md`. Die dort behaupteten historischen Testläufe wurden hier nicht wiederholt. Laut vollständigem Baselineinventar gibt es keine AGENTS.md. Das lokale Teilcheckout wurde nicht als Vollständigkeitsbeweis verwendet.

Ausgang: genehmigter Modulplan für Projekt P, Run R, Ausgangscommit H0, getrennte Eigentumspfade `src/a`, `src/b`, `src/c`; A und B unabhängig, C hängt von beiden ab. Alle erforderlichen Provider, Agenten, Grants, Repository-/Workspacewurzeln seien korrekt konfiguriert. Für jede Modultestplanung existiert ein gültiger digestgebundener Plan mit `scope.moduleId`, `scope.gateId=null`, Run R und Projekt P. Gegenstand ist der tatsächliche Übergang Planung → Arbeit → Integration → Prüfung → C; vorausgehende Architekturfreigabe ist Voraussetzung, keine hier belegte Freigabe.

Zwei Varianten gehören zu diesem Szenario:

1. **Projectcompiler:** A/B/C werden deklariert, aber die Implementierung serialisiert A vollständig vor B und B vor C. Das ist implementiertes Produktverhalten, kein paralleler Testnachweis und für sich kein Defekt.
2. **Expliziter Graph:** `maxConcurrency=2`, Implementierungen A/B unabhängig; jeweils Lint → Review → Modultest; Implementierung C abhängig von `test-a` und `test-b`, anschließend dieselben Prüfungen. Das ist eine unterstützte Graphform, jedoch keine automatisch vom Projectcompiler erzeugte Variante. Fehlerfälle: überlappender Worktreecreate/merge, später A-Fehler nach Integration B, Timeout/spätes Ergebnis.

Endzustand: C einschließlich seiner drei Nachprüfungen akzeptiert; andernfalls erste Bruchstelle benennen und Folgeschritte nur unter expliziten Voraussetzungen weiterverfolgen. Keine Operatorabnahme oder Deploymentfreigabe aus `run.succeeded` ableiten.

### Vollständige Übergangsfolge

| Schritt | Erzeuger → Empfänger und Payload | Zustand, Persistenz, Rückweg und Beleg |
|---|---|---|
| 1. Module kompilieren | `compileProject` validiert Schema, IDs, disjunkte ownedPaths, Anforderungen und Testplandigest/-scope. | `skills/nova/project/compiler.ts:46–103`, `compileProject`: stabile topologische Sortierung; unbekannte Abhängigkeiten/Zyklen blockieren. Projectmode zwingt Review- und Test-Agent. Die Deklaration `dependsOn:[]` von B hebt die zusätzliche Serienkante nicht auf. |
| 2. Konkreter Graph | Pro Modul `implement-X → lint-X → review-X → test-X`; `implement-b` hängt zusätzlich von `test-a` ab; `implement-c` von `test-b` und explizit `test-a`. | `compiler.ts:104–138`: `previousGate`, `maxConcurrency:1`; Compiler endet nach Modultest C, ohne automatisch angefügtes Integrationsgate/Projectsummary. Im expliziten Graph muss der Autor die Kanten und eventuelle Zusatzgates selbst setzen. |
| 3. Graph und Run einfrieren | Runner validiert Stageinput/-config gegen registrierte Schemas; Graph prüft positive Parallelität, ordnet IDs und readiness nach Dependencies. | `skills/nova/core/execution/runner.ts:37–70`, `ExecutionGraph` in `graph.ts:31–43`; `engine-run.ts:30–37`, `runNewPipeline`: eingefrorene Definition, Graph-/Registry-Snapshots, Run-Mutationslock und `events.jsonl`. Runlock schützt einen Run, nicht alle Runs eines Repositorys. |
| 4. A/B auswählen | `PipelineLoop.run` nimmt bereite Stages und startet bis `maxConcurrency` über `Promise.all`. | `skills/nova/core/execution/pipeline-loop.ts:20–35,80–97,113–126`: Batchbarriere; nächster Batch erst nach allen Ergebnissen. C startet erst nach abgeschlossenen Abhängigkeiten (`succeeded` **oder** `skipped`). Unser Graph enthält keine Activation-Skipbedingungen. |
| 5. Attempt → Implementation | `StageExecutor` erzeugt neue attemptId/leaseId und erhöht attemptNumber; Implementation überschreibt caller-runId/attempt aus Lease. | `stage-executor.ts:33–91,108–140`; `skills/nova/plugins/implementation-agent/src/stage.ts:68–88`, `execute`. Effectkey ist `run:stage:attemptNumber:sequence`; `attempt.created/dispatched` wird vor Pluginarbeit geschrieben. Modul-ID bleibt aus Graphinput. |
| 6. Worktree erzeugen | Implementation ruft `git.workspace.create` mit `git.repository=<repositoryRoot>`, `workspacePath`, Branch und `baseRef` auf. Projectcompiler setzt `baseRef:'HEAD'`, Workspace `<workspaceRoot>/<hash(R)>/<module>`, Branch `nova/P/<hash(R)>/<module>`. | `implementation-agent/src/stage.ts:10–20`; `compiler.ts:106–121`; `skills/common/plugins/git-workspace/src/operations.ts:10–20`, `createWorkspace`: echtes `git worktree add -b`, dann `rev-parse HEAD`, Rückgabe `sourceRevision`. Diese tatsächliche Revision ersetzt `headBefore`; die anfängliche H0-Angabe allein pinnt nicht jeden Workspace an H0. |
| 7. Erste Parallelbruchstelle | A hält Lock auf `git.repository=<root>`, während B dieselbe Ressource akquirieren will. | `skills/nova/core/effects/durable-invocation.ts:13–15,35–45,62–74`; `locks.ts:83–103`: B erhält `RESOURCE_LOCKED`, keine Warteschlange. `implementation-agent/src/stage.ts:60–64,84–96` macht daraus `blocked` (`implementation.invalid_completion`). Das ist vor Dispatch möglich. A kann dennoch fertigarbeiten, weil die Batchbarriere auf alle gestarteten Geschwister wartet. **C wird nicht freigegeben.** |
| 8. Bedingte Fortsetzung: Dispatch | Nur wenn Createoperationen zeitlich nicht kollidieren: `buildRequest(agent,input)` über `runtime.dispatch` an Forge; payload enthält protocol, identity `{runId,moduleId,attempt}`, headBefore, Task, outputContract. | `implementation-agent/src/protocol.ts:37–73`; stage.ts:23–30. **Workspace fehlt im Payload.** `skills/common/plugins/runtime-dispatch/src/openclaw.ts:207–224`, `spawnSession`, setzt `cwd:target.cwd` aus statischer Konfiguration. Das ist **PCR-IMPLEMENTATION-001**, erste Bruchstelle der serienmäßigen Compilerroute. Zwei dynamische Worktrees lassen sich dadurch nicht automatisch zwei CWDs zuordnen. |
| 9. Bedingte Fortsetzung: tatsächliche Arbeit | Nur unter der zusätzlichen hypothetischen Voraussetzung, dass Forge korrekt im zugehörigen Worktree arbeitet: Runtime startet Session, pollt und importiert Ergebnis. | `runtime-dispatch/src/openclaw.ts:234–286`, `dispatchOpenClaw`: dispatchId aus Effectkey und Payloadhash, separate Resultdatei, bestehende Session über Label, Modell-/Statusprüfung, Deadline-/Abbruchprüfungen. `parseCompletion` in `implementation-agent/src/protocol.ts:74–139` akzeptiert nur korrekt geformte Completion und runtimeangehängte Session; ready verlangt nichtleere changedPaths und erfolgreiche deklarierte Checks. Diese Checks sind Agentbehauptungen, kein deterministischer Testnachweis. |
| 10. Commit und Merge | Stage ruft `git.commit` auf Workspace mit `changedPaths`, anschließend `git.merge` auf Zielrepo mit Workspacebranch. | `implementation-agent/src/stage.ts:33–46`; `git-workspace/src/operations.ts:53–65`: `git add`, pfadbegrenzter Commit, `git merge --no-ff`, `rev-parse HEAD`. Integration erfolgt **vor** Lint/Review/Test. Getrennte Workspacecommits haben getrennte Locks, gleiche Zielmerges kollidieren wie Create. Erfolgreiche nichtüberlappende Merges ergeben etwa HA und danach HAB. |
| 11. Cleanup und Evidence | Bestätigter Merge → Worktree/Branch entfernen → Implementationartefakt schreiben. | `implementation-agent/src/stage.ts:49–59,86–123`: ungewisser Merge behält Workspace; Cleanupfehler wird eigenes Artefakt, bestätigt integrierte Implementation bleibt passed. Completionartefakt enthält sourceRevision des Mergeergebnisses und tatsächliches headBefore; Facts enthalten `implementation.source_revision`. Crash nach Merge vor Artefakt ist kein belegter Completionabschluss. |
| 12. Lint auf Kandidat | Lint resolved Implementationartefakt und sendet konkrete sourceRevision an `lint.execute`; Report muss dieselbe Revision zurückliefern. | `skills/common/plugin-runtime/sdk/src/source-revision.ts:5–38`: Run+Stage+Namespace, höchste Attemptnummer, exakt ein Artefakt, Digest/Größe/status/revision prüfen. `skills/nova/plugins/lint/src/stage.ts:57–98`: sourceRevision wird in Report gespeichert; `candidate.ts:7–19`, `withLintCandidate`: isolierter Sharedclone und detached Checkout exakt der Revision, kein ambient HEAD. Bei A also HA, bei B HAB, selbst wenn Zielrepo inzwischen weiterläuft. Lintbefunde request_fix; Toolfehler blocked. |
| 13. Echo | Review hat harte Graphkante hinter Lint. `{revisions:{sourceStageId:implement-X}}` wird in erste Implementationbase plus neueste Mergehead umgewandelt. | `skills/nova/plugins/review/src/stage.ts:251–267`, `execute`; SDK `source-revision.ts:40–48`. `runReview` in `skills/nova/plugins/review/src/stage.ts:211–249` bereitet snapshot vor, dispatcht Echo, verarbeitet Erweiterung, semantische Verifikation und persistierten Abschluss. Kein freies Agent-OK ersetzt diese Reduktion. Für paralleles B kann Diff H0→HAB auch Änderungen A enthalten; ob gewünschter Modulscope das passend behandelt, bleibt gesonderter Review-Scope-Nachweis, hier kein unbelegter Defekt. |
| 14. Modultest und Test-Agent | Qualitystage resolved **denselben** implementation-sourceStageId, ruft `test.plan.execute` mit revision auf; native Entscheidung wird zuerst gespeichert, erst nach passed an Test-Agent. | `skills/nova/plugins/buster-quality-gate/src/stage.ts:6–48`, `execute`: plan erforderlich, Runbindung der Decision, Evidence/decisionDigest in Qualityartefakt; negativer nativer Befund verhindert Agentdispatch. `skills/nova/core/test-gates/source-snapshot.ts:25–61`, `buildCommittedSourceSnapshot`: Archiv aus angegebenem Commit/tree, Digest und Attestation, keine Workingtreebytes. Auswahl bleibt module scope, ist also **kein automatisch kumulatives Testgate**, obwohl der Commit bereits integrierte Dateien enthält. |
| 15. Reparatur und spätes Geschwisterergebnis | Lint/Echo/Test request_fix → Implementation X → neue Revision → Nachprüfungen. | `compiler.ts:122–134` Rückkanten; `run-decisions.ts:69–79`, `repairRequest`; `lifecycle/remediation.ts:13–51`: transitive Graphnachfahren invalidieren, Facts/Wait/Guidance löschen, Requester waiting und Ziel pending. `pipeline-loop.ts:27–32` zeichnet erfolgreiche Geschwister **vor** Reparaturinvalidierung auf. Ein gleichzeitig abgeschlossener Nachfahre kann damit die Invalidierung nicht überschreiben. Unabhängige B-Kette ist aber kein Graphnachfahre A, auch wenn HAB physisch A enthält. |
| 16. C integrieren und prüfen | Erst nach beiden Modultests wird C bereit; neuer Workspace an aktuellem HEAD, neue Forgecompletion, Merge HC, Lint HC, Review auf C-Diff, C-Modultest HC. | Dieselben Originalfunktionen Schritte 5–14; Graphkanten und `sourceStageId:implement-c` binden die Prüfung an HC. Nur bei allen erfolgreichen Stages erzeugt `PipelineLoop.#finalize` (`pipeline-loop.ts:137–144`) `run.succeeded`. Das belegt Prüfung C auf integriertem Stand, **nicht** erneute vollständige A-/B-Anforderungsprüfung auf HC. Ein zusätzliches kumulatives Test-/Reviewgate muss explizit im Graph vorliegen. |

### Revisionen und Sicherheitsgrenzen

| Situation | Tatsächliche Revision / Evidence | Aussagegrenze |
|---|---|---|
| Seriencompiler A/B/C | A startet H0 (falls HEAD=H0); B startet HA; C startet HAB; jeweils artifact-sourceRevision nach Merge | Disjunkte ModulownedPaths werden im Compiler validiert. Tatsächliche Implementierungsänderungen sind zunächst Pfadprosa für Forge; kein exklusiver Modulschreibsandboxvertrag im Plugin. |
| Explizit parallel, beide Bases H0 | A-Prüfung HA; B-Prüfung HAB nach zweitem Merge; C-Prüfung HC | Gegenseitige graphische Unabhängigkeit ist keine inhaltliche Unabhängigkeit der bereits integrierten Commits. Revisionbindung verhindert HEAD-Verwechslung, erzeugt aber keine neue kumulative Coverage. |
| A repariert nach Merge B | A2 erzeugt HAB+A2; A-Nachfahren und C werden invalidiert, unabhängige B-Stage bleibt erfolgreich mit älterem HAB | Kein behaupteter Test-B-Erfolg auf HAB+A2. Für gewünschte gemeinsame Freigabe braucht der Graph einen gemeinsamen Integrationskandidaten und passende Gates. |
| Effect angenommen, Receipt fehlt | Effectjournal requested/accepted, kein verlässlicher Completionbeleg | DurableInvocation verlangt adapter.receipt oder Reconciliation (`durable-invocation.ts:86–90`); Gitadapter bietet keine receipt-Methode. Kein blindes Replay desselben externen Schreibens. |
| Später Agent-/Stageabschluss | Stage Promise.race entscheidet Timeout/Cancel; Lease wird revoked | `stage-executor.ts:117–140`; Runtime versucht Cancel und kontrolliert erneut aktive Dispatchdeadline. Kein nachträglicher erfolgreicher Stagereturn ersetzt Timeout. Tatsächliches Stoppen externer Agentdateischreibvorgänge ist wegen PCR-RUNTIME-001 nicht bewiesen. |

### Findings und bestehende Kennungen

#### Bestehende Befunde im Fehler-/Recoveryumfeld

- **PCR-EFFECT-001 (mittel):** `durable-invocation.ts:40–45` führt zweite Request-/Receiptprüfung nach acquire außerhalb des Freigabe-finally aus. Konflikt dort lässt Lock zurück; `locks.ts:99–103` ersetzt lebenden Besitzer nicht allein wegen TTL. Relevanter zusätzlicher Blocker, aber nicht Voraussetzung für T06-F01. Originalreview gelesen, Codefenster erneut geprüft; dessen historische Reproduktion hier nicht ausgeführt.
- **PCR-GIT-001 (hoch):** bestehender sync_paths-catch-all-Befund bleibt erhalten. Die reine Worktree/Commit/Merge-Kette T06 ruft `sync_paths` nicht auf; deshalb **kein ausgelöster T06-Befund** und keine neue Kennung.
- **PCR-RUNTIME-001:** aus zentralem Register übernommene offene Abhängigkeit für reale Sessiontermination; T06 belegt Promise-/Leaseablehnung, nicht sichere externe Prozessbeendigung. Hier nicht eigenständig neu reproduziert.

#### Offene Architekturfrage, kein zusätzlich behaupteter Defekt

Einzelne per-sourceStageId gepinnte Modulprüfungen und Reparaturinvalidierung nach Graphnachfahren sind technisch vorhanden. Nach parallelen Integrationen beweist das jedoch keine gemeinsame Freigabe des neuesten Repository-HEAD für alle Module. Der explizite Graph muss sein eigenes kumulatives Gate deklarieren; der Seriencompiler generiert keines. Dies als Abweichung zwischen Zielbild und implementierter Graphgenerierung konsolidieren, nicht fälschlich als fehlerhafte sourceRevisionauflösung bezeichnen. Eine echte parallele Mehrmodulregression muss prüfen, wie B-Review auf H0→HAB den A-Anteil behandelt.

### Tatsächlich ausgeführte Prüfungen, Tests und Restnachweise

**Ausgeführt:** ausschließlich lesender statischer Codevergleich und Abgleich mit den genannten Vorreviews am festen SHA; keine Tests, keine CI, keine Gitmutation am geprüften Quellcode und kein Agentlauf. Es gibt keinen E2E-Erfolg dieses Szenarios.

**Gelesener Originaltest, NICHT AUSGEFÜHRT:** `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`. Der Test schreibt echte Dateien und nutzt echtes Git für Commit/Merge/gesperrtes Worktree-Cleanup; der HTTPserver benutzt aber die äußere Variable `workerWorkspace` (Zeilen 13,20–24 und 99 und 125), nicht einen durch den Dispatchvertrag empfangenen Workspace. Er konfiguriert außerdem `maxConcurrency:1` und MemoryResourceLockManager. Damit beweist er weder korrekte produktive Forge-CWD-Zuordnung noch diese echte Parallelkonkurrenz. Die Vorreviewangabe „bestanden“ ist historisch und wurde nicht als aktuelles Testresultat übernommen.

Offen bleiben: echte überlappende Filelock-/Gitoperationen, echte Agenten je Workspace, C-Lauf mit echten Modultests, Scopeverhalten beim parallelen Merge-Diff, gemeinsames Gate auf HC, realer Remoteabbruch trotz verspäteter Antwort und Crash zwischen Merge/Artefakt-/Lifecyclepersistenz. Die erste Blockierung beendet die Schlussfolgerung nicht: Schritte 9–16 sind ausdrücklich hypothetische statische Fortsetzung nach Beseitigung/Vermeidung der vorausgehenden Blocker.

### Empfohlene Reihenfolge

1. Workspacevertrag end-to-end korrigieren (PCR-IMPLEMENTATION-001).
2. Ressourcenbusy vor Effektannahme von ungewissem externem Effekt unterscheiden, Gitpublikation kontrolliert serialisieren (T06-F01); Lockfreigabe-PCR-EFFECT-001 schließen.
3. Expliziten Integrations-/kumulativen Prüfvertrag für die gewünschte Parallelvariante festlegen; Source-/Scope- und Reparaturgenerationen daran binden.
4. Erst danach den beschriebenen echten Mehrmodul-/Fehler-/Abbruchnachweis durchführen. Statische Kanten allein erfüllen diesen Nachweis nicht.

### T07 — Gitfehler, Konflikte, verlorene Receipts und Wiederaufnahme

Einzeltrace: [T07-git-failures.md](T07-git-failures.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Szenario, geprüfter Stand und Ergebnis

Codecommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle Quellbelege unten beziehen sich auf diesen Stand. Vorreviews: `docs/review/components/kubeclaw.git-workspace.md`, `kubeclaw.implementation-agent.md`, `kubeclaw.blueprint-sync.md`, `nova.effects.md` am Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`. Historische IDs werden bewahrt.

Ausgangslage: Nova-Run R, Modul M, Repository P mit Ausgangsrevision H0, Run-/Modulworktree W und Branch B; funktionsfähige Grants, Gitbinary, Elternverzeichnis von W, FileEffectJournal und gemeinsame Lockablage. T07 kombiniert klar getrennte Varianten: Create-/Branchfehler, Commitfehler, echter inhaltlicher Mergekonflikt, Blueprint-Syncfehler, optionaler Pushfehler, Mutation vor Receiptverlust, Cleanupfehler und anschließende Reparatur. **Kein Gitbefehl, Test, CI oder Deployment wurde ausgeführt; alle Fehlerverläufe sind statische Code-Traces.** „Echter Mergekonflikt“ bezeichnet die untersuchte Git-Operation mit widersprüchlichen realen Dateiedits, keinen ausgeführten Test oder nachgebauten Mergealgorithmus.

Ergebnis: bedingt blockiert. Im normalen Compiler→Forge-Pfad ist `PCR-IMPLEMENTATION-001` die erste bereits bekannte Integrationslücke: W wird erstellt, aber im Agentrequest nicht übertragen. Für nachfolgende Gitvarianten wird ausdrücklich angenommen, dass der Agent tatsächlich in W gearbeitet hat. Im Createfehlerzweig liegt der erste Bruch bereits vor Dispatch; im Mergekonfliktzweig bei `git merge`; im Blueprintzweig verfälscht `PCR-GIT-001` operative Fehler zu fehlenden Kontrolldateien. Unbekannte externe Ausgänge werden bewusst nicht automatisch wiederholt. Cleanupfehler erlauben zwar den aktuellen Fortschritt, können aber die folgende Reparatur desselben Moduls sicher blockieren (PATH-T07-001).

### Übergänge und Rückweg

| Schritt | Aufrufer → Payload/Transport → Empfänger | Persistenz, Ergebnis und nächste Aktion |
|---|---|---|
| 1 | `compileProject` erzeugt `implement-M` mit repositoryRoot P, workspacePath W=`workspaceRoot/runHash/M`, Branch B=`nova/project/runHash/M`, baseRef HEAD, mergeTarget P und Commitmessage. | `skills/nova/project/compiler.ts:105–121`. W/B enthalten **keine Attemptnummer**. Compiler serialisiert mit maxConcurrency=1 und hängt Lint an Implementation; explizite Graphvarianten können andere Gitnutzer haben. |
| 2 | Implementation `execute` übernimmt runId/attempt aus Lease; `createWorkspace` invokiert `git.workspace.create/create` auf git.repository P mit W/B/baseRef. Bei repairRequest explizit HEAD. | `skills/nova/plugins/implementation-agent/src/stage.ts:10–20,67–83`. `sourceRevision` muss 40 Hexzeichen sein und wird headBefore. Erst nach Rückkehr gilt workspaceCreated=true. |
| 3 | Context prüft Capabilitygrants; AdapterRuntime selektiert Gitprovider; Coordinator journalisiert Auftrag. | `skills/nova/core/execution/authorization.ts:55–60`; `stage-executor.ts:77–90`; `adapters.ts:49–62`. Key R:stage:attemptNumber:sequence; Effect-ID bindet zusätzlich Attemptidentität, Capability, Operation und Ressource. Payloadvergleich verhindert Wiederverwendung desselben Keys mit anderem Inhalt (`effects/identity.ts:7–23`). |
| 4 | DurableInvocation liest vorhandene Requests/Receipts, lockt Ressource, schreibt requested und accepted, ruft Gitadapter mit AbortSignal/Fence auf. | `skills/nova/core/effects/durable-invocation.ts:36–74,93–125`; `effects/journal.ts:103–145`. Externer Gitcommit und Receiptcommit sind getrennte Grenzen. Gleiche canonical resource wird über äußeren Lock serialisiert; kein Git-spezifisches Exactly-once-Ledger. |
| 5 | Gitadapter assertiert Fence; canonical roots/path/ref werden geprüft. `worktree add -b B -- W baseRef`, danach canonicalDirectory und `rev-parse HEAD`. | `skills/common/plugins/git-workspace/src/adapter.ts:5–24`; `operations.ts:10–20`; `values.ts:49–54`. Erfolg liefert tatsächliches W/H0. Bereits vorhandenes W scheitert vor Spawn, bestehender Branch am Gitkommando. Partial create vor rev-parse-Fehler bleibt mögliche externe Mutation. |
| 6 | Implementation dispatcht `buildRequest` an Forge, erhält typed Completion und Runtime-Sessionevidenz. | `implementation-agent/src/stage.ts:23–30`; `protocol.ts:37–73,118–139`. runId/moduleId/attempt kommen aus input/Lease; ready verlangt geänderte Pfade und erfolgreiche gemeldete Checks. **PCR-IMPLEMENTATION-001:** buildRequest enthält W nicht; `skills/common/plugins/runtime-dispatch/src/openclaw.ts:207–223`, `spawnSession`, nutzt statisches target.cwd. Agentchecks sind keine unabhängigen Tests. |
| 7 | Bedingt auf korrekt in W erzeugte Dateien: `git.commit/commit`, resource git.workspace W, paths=changedPaths, message. Git führt add, scoped commit und rev-parse aus. | `implementation-agent/src/stage.ts:33–40`; `git-workspace/src/operations.ts:53–60`; `values.ts:78–100`. Index kann nach fehlgeschlagenem Commit bereits verändert sein. Kein Commitrollback im Adapter. |
| 8 | `git.merge/merge`, resource git.repository P, sourceRef B. Git führt `merge --no-edit --no-ff B` und rev-parse aus. | `implementation-agent/src/stage.ts:41–46`; `operations.ts:62–65`. Bei Konflikt kein Abort/Continue/Repair-Aufruf; bei Erfolg integrierte Revision H1, die Stage als sourceRevision verwendet. |
| 9 | GitRunner liefert nur Exit0 als Erfolg; Spawn-/Timeout-/Output-/Cancel-/Gitfehler werfen. Coordinator persistiert failed-Receipt; AdapterRuntime markiert externe Mutation ungewiss. | `git-workspace/src/runner.ts:14–17,31–64`; `durable-invocation.ts:109–125`; `adapters.ts:55–60`: `EFFECT_OUTCOME_UNRESOLVED:effectId:...`. Fehlgeschlagener Gitprozess beweist nicht, dass keine Teilaktion geschehen ist. |
| 10 | Implementation fängt Fehler, behält W wenn Create bestätigt und Merge nicht bestätigt, liefert blocked/reconciliation_required mit W/B/headBefore. | `implementation-agent/src/stage.ts:60–65,84–96`. Kein unmittelbarer Forge-Retry, keine erfolgreiche Sourcefact, kein Lintstart. Lifecycle blocked→stop (`skills/nova/core/lifecycle/reducer.ts:98–103`), Run wird blocked. |
| 11 | Bei bestätigtem Merge: removeWorkspace ruft `worktree remove --force W`, danach optional `branch -D B`; Cleanupfehler werden erfasst. | `implementation-agent/src/stage.ts:49–57,86–118`; `operations.ts:23–33`. Worktreelock kann Entfernen verhindern; erfolgreiche Worktreeentfernung gefolgt von Branchlöschfehler kann nur B hinterlassen. |
| 12 | Stage schreibt Completionartefakt mit H1/headBefore; bei Cleanupfehler zusätzlich implementation-cleanup.v1, bleibt ready→passed und veröffentlicht Fact H1. | `implementation-agent/src/stage.ts:97–122`. Merge liegt vor Artefakt-/Lifecyclecommit; Crash dazwischen bedeutet veröffentlichten Code ohne Stageabschluss. Cleanupbericht enthält Fehlermeldung, keine eigenständige Wiederaufnahmelogik. |
| 13 | Lint liest Implementationquelle; bei Erfolg folgen Echo und Modultest. Bei request_fix werden Forge und betroffene abhängige Prüfungen neu geplant. | `compiler.ts:120–131`; `skills/common/plugin-runtime/sdk/src/source-revision.ts:17–48`; `skills/nova/plugins/lint/src/stage.ts:60–84`; `skills/nova/core/lifecycle/remediation.ts:13–49`. Neueste passende Implementationrevision und vorherige Basis werden aus Artefakten gelesen; Repair entfernt Facts und invalidiert Nachfolger. |
| 14 | Nach Cleanupfehler benutzt Reparatur denselben W/B wie Schritt 1; `createWorkspace` verlangt erneut leeren/neuen Zielpfad. | `compiler.ts:117–119`, `implementation-agent/src/stage.ts:12–19,78–82`, `values.ts:52`, `operations.ts:16`. PATH-T07-001: automatisch angeforderte fachliche Reparatur blockiert vor Forge, wenn alter W oder B noch vorhanden ist. |
| 15 | Separater expliziter Blueprintgraph sendet `git.sync/sync_paths` mit branchRef und controlPaths. | `skills/nova/plugins/blueprint-sync/src/stage.ts:13–29`; `operations.ts:36–50`: pro Datei `show ref:path`, Vergleich, `checkout ref -- path`; Teiländerungen bleiben. Catch-all bei show verwandelt auch falsches Ref/Timeout/Abort/Outputlimit in missing (PCR-GIT-001). |
| 16 | Blueprint committet synced-Pfade, schreibt state.append und Artefakt; missing wird request_fix. | `blueprint-sync/src/stage.ts:20–48`: vorhandene Pfade können schon committed sein, bevor fehlende Pfade gemeldet werden. Report trägt branchRef, nicht aufgelösten Quellcommit oder erzeugten Zielcommit. Kein Fetch/Push in diesem Stage. |
| 17 | Optionaler ausgewählter Capabilitynutzer darf fetch/rebase/push an Gitprovider senden; Push nutzt remote/localRef:remoteRef ohne force. | `operations.ts:68–72`; `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts:61`. Diese registrierten Operationen sind nicht automatisch Bestandteil von Compiler oder Blueprintstage. Rejected Push→Runnererror→unresolved externes Receipt; Remote kann bei Antwortverlust bereits aktualisiert sein. |
| 18 | Recovery/Operatorabschluss: normales recover/resume überprüft unveränderten Graph/Pakete; blockierte Runs brauchen AdministrativeReopen statt Wait-Signal. | `skills/nova/core/execution/engine-run.ts:40–62,76–89`; `engine-admin.ts:24–52,60–93`. Authentisierter, freigegebener Actor und idempotente Entscheidung mit retry/remediation/cancel; keine pauschale Annahme, dass dies Gitkonflikte löst. |
| 19 | Vor weiterer Ausführung läuft assertEffectRecoverySafe: accepted ohne Receipt blockiert; externes Receipt in unterbrochenem Attempt verlangt explizite Continuation. | `effect-recovery.ts:8–28`, `engine-run.ts:20–27`. Gitadapter implementiert **keine receipt-Methode** (`adapter.ts:17–24`); Coordinator kann ohne sie accepted-Auftrag nicht auflösen (`durable-invocation.ts:87–91`). Administrative retry umgeht diese Prüfung nicht (`engine-admin.ts:91–93`). |
| 20 | Bedingter gewünschter Rückweg nach belegter Reconciliation und W/B-/Mergezustandsbereinigung: neuer autorisierter Attempt→Forge→Commit→Merge H2→neues Artefakt→Lint/Echo/Test auf H2. | Compiler-/Repair-/Revisionconsumer-Belege oben. Kein implementierter Git-Konfliktlösungsagent oder automatischer Konflikt-/Pushreplay nachgewiesen; diese Fortsetzung ist erforderlicher späterer Nachweis, hier kein Erfolg. Cancel beendet Pipelinezustand, ist keine Gitrollback-/Cleanupgarantie. |

### Varianten und erste Bruchstellen

| Variante | Auslöser und beobachtbarer Codepfad | Verbleibender Zustand / Ergebnis |
|---|---|---|
| Create A | W existiert, Parent fehlt, Branch existiert oder baseRef nicht auflösbar. `values.ts:49–54`; `operations.ts:16–19`. | Vor/bei Create blocked. Falls Git schon erstellt, aber rev-parse/Receipt scheitert, kann W existieren, obwohl workspaceCreated im Stage false bleibt und retainedWorkspace-Hinweis fehlt; Input/Effectjournal erlauben Untersuchung. Nicht automatisch löschen. |
| Commit B | Indexlock, Schreib-/Speicherfehler, nichts zu committen oder Fehler nach erfolgreichem commit bei rev-parse. `operations.ts:57–59`. | W/Index/evtl. Commit bleiben erhalten; failed Receipt heißt nicht kein Commit. Kein Merge und keine bestandene Implementation. |
| Merge C | P und B ändern dieselbe Zeile verschieden; Originaloperation `merge --no-ff B` liefert Konflikt. `operations.ts:63`. | P kann unmerged Index/Dateien/MERGE_HEAD besitzen; W/B mit Modulcommit bleiben. Kein code-erzwungenes merge --abort/--continue, keine automatische Konfliktübergabe an Forge. Die konkrete Git-Konfliktstruktur ist im echten Nachweis zu prüfen. |
| Sync D | Vorhandener Blob über maxOutputBytes oder ungültiges Ref; show wirft, catch markiert missing. `operations.ts:43`. | PCR-GIT-001: operative Störung wird fachlicher request_fix; vorherige Pfade können übernommen und committed sein. Pipeline remediates falsche Ursache. |
| Push E | Remote verweigert Non-fast-forward/Auth oder Antwort nach erfolgreicher Mutation geht verloren. `operations.ts:70–72`. | Ausführung scheitert/ungewiss, lokaler Commit bleibt. Keine remote/head-Digestprüfung, kein receipt-Lookup, kein force-push als Recovery. Optionaler Adapterpfad, kein erfundener Compiler-Publishschritt. |
| Receipt F | Gitcommit/Merge erfolgreich, Prozess stirbt vor completed-Receipt. | accepted bleibt ohne Receipt; assertEffectRecoverySafe blockiert vor Adapterstart. Anders bei vollständig persistiertem Receipt: identischer direkter Effectreplay liefert Resultat; ein unterbrochener äußerer Attempt darf trotzdem nicht blind neu ausgeführt werden. |
| Cleanup G | Merge H1 bestätigt, W git-locked oder Branchlöschung scheitert. | H1 bleibt; Stage passed mit Cleanupbericht. Folgende fachliche Reparatur kollidiert mit W/B: PATH-T07-001. |
| Reopen H | Operator retry nach bekannt fehlgeschlagenem abgeschlossenen Attempt. | Neuer Attempt/neue Effectkeys; ohne Auflösung von W/B/Mergezustand erneuter Fehler. Accepted-ohne-Receipt bleibt auch nach Adminentscheidung Recoveryblocker. Cancel ist implementiert, Bereinigung/Abnahme des externen Zustands bleibt gesondert. |

### Bestehende Findings und Abweichungen

| Kennung | Relevanz / direkte Codebelege | Ursachenbehebung und späterer Nachweis |
|---|---|---|
| PCR-IMPLEMENTATION-001 | Hoch; `implementation-agent/src/protocol.ts:37–72` ohne W gegen `runtime-dispatch/src/openclaw.ts:221` statisches cwd. | Typisierte autorisierte Workspacereferenz von Compiler bis Agent und Git durchreichen; zwei reale Modulworktrees über Originalgateway getrennt bearbeiten/integrrieren. |
| PCR-GIT-001 | Hoch; `git-workspace/src/operations.ts:43` catch-all gegen Blueprint `stage.ts:20–48`. | Fehlendes Objekt von operationalem Fehler unterscheiden; echte Gitfälle missing/refinvalid/abort/outputlimit und partielle Mehrdateisynchronisierung. |
| PCR-EFFECT-001 | Mittel; `durable-invocation.ts:40–45` zweite Journalprüfung nach Lockakquise liegt vor geschütztem finally `:62–74`. | Gesamten Besitzbereich durch ein finally schützen; konkurrierende Originaljournale, Konflikt und danach erfolgreiche Lockakquise. Hier keine erneute Reproduktion. |

Kein eigener Defekt wird allein daraus gemacht, dass Core unbekannte externe Effekte blockiert: dies ist die implementierte Sicherheitsentscheidung. **Fehlender operativer Anschluss:** Gitprovider besitzt weder eigenen Receipt-/Idempotenznachweis noch reconciliation-Operation für akzeptierte unbestätigte Mutationen. Administration autorisiert Pipelineentscheidungen, repariert aber weder Git-Mergestatus noch accepted-Effects. Der Zielablauf „Fehler, Resume, weiter“ ist an diesem Stand nur für sicher rekonstruierbare Fälle belegbar. Ein Receipt ist Ergebnis einer Capability, keine atomare Transaktion über Create/Dispatch/Commit/Merge/Cleanup/Artefakt.

Blueprint-Syncwert wird je Datei gegen den Ref neu gelesen und Bericht nennt keine Commitrevision; Refdrift zwischen Dateien ist eine nachgewiesene Bindungslücke, deren konkrete parallele Auswirkung hier **offener Laufzeitnachweis** bleibt. Scopepathspec-/Githelper-/Prozessgruppenfragen bleiben beim Gitkomponentenreview, nicht als neue T07-Befunde dupliziert. Fetch/rebase/push sind implementiert, trotz gegenteiliger alter Git-README-Aussage; keiner wird in den hier belegten beiden Stages automatisch aufgerufen.

### Ausgeführte Prüfungen, Tests und Grenzen

Tatsächlich: statische vollständige Lektüre Gitadapter/Runner/Values/Operations, Implementation/Protocol, Blueprintstage, Effects/Receipt-/Recovery-/Admincode, Compiler- und Remediationanschlüsse; Abgleich mit Originalreviews. **Tests ausgeführt: keine. Gitmutationen: keine.** Historische Ergebnisse der Komponentenreviews sind ausschließlich historische Evidenz.

Gelesene Tests, nicht ausgeführt:

- `skills/common/plugins/git-workspace/tests/live-function.test.ts:95–217`: originale lokale Git-/bare-Remote-Erfolgspfade Create/scoped Commit/Fetch/Push/Rebase/Sync/Merge. `:219–280` Eingangsabwehr; `:283–350` Prozessfehler benutzen ausführbare Testfixtures statt echtem Git. Keine echte Non-fast-forward-Recovery, Mergekonflikt-/Receiptverlustmatrix.
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts:13–25,88–143`: HTTP-Testserver schreibt in extern gesetztes workerWorkspace; echter Gitcleanupfehler und verlorene Dispatchantwort. Kein realer Forgeagent; cwd-Bindung wird außerhalb des Requests vorgegeben. Keine anschließende Repairrunde nach Cleanupfehler.
- `skills/nova/plugins/blueprint-sync/tests/live-function.test.ts:9–25,40–88`: echte lokale Gitbranches, Originaladapter/Runner und Report-/Stateassertions; MemoryResourceLockManager. Keine Crossprozess-/Crash-/Refdriftgarantie.

Untersuchte Identitäten: R/Stage/Attempt/Sequence in Effectkey; vollständige Attemptidentity in effectId; P/W als kanonische Ressourcen; H0 aus tatsächlichem Worktree-HEAD; B als beweglicher Mergeinput; H1/H2 erst nach Merge-rev-parse und dann im Implementationartefakt/Fact; sourceStageId leitet Lint-/Review-/Testconsumer an neueste passende Revision. Gitcommit selbst trägt keinen Effect-ID-Marker, daher kann aus bloßem Branch/Commitnamen kein authoritativer Receipt rekonstruiert werden.

Offen: Originalgit-Konflikt mit realem Core und anschließender Operatorentscheidung; Prozessabbruch exakt nach jeder Teilmutation/vor Receipt; remote Outcomeprüfung bei Pushantwortverlust; echte Filelock-/Mehrprozessfälle; erneute vollständige Lint-/Review-/Testprüfung nach H2; aktive Githelper-/Credentialkonfiguration im Deployment. Keine Secrets oder privaten Remotes wurden übernommen.

Spätere Ursachenbehebung: zuerst Workspacereferenz (PCR-IMPLEMENTATION-001), dann stabile Gitaktions-/Receipt- und Reconciliationgrenze, anschließend Cleanup-/Attemptgeneration (PATH-T07-001) und korrekte Syncfehlerdisposition (PCR-GIT-001), danach aufgelöste Quell-/Zielrevisionen im Blueprintbericht. Abschließend reale lokale Originaldienste-/Gitfehler- und Restartmatrix; erst dann Aussage über erfolgreichen Recovery-/E2E-Lauf.

Orchestrator-Gegenprüfung: abgeschlossen (statisch); Details im Gegenprüfungsprotokoll.

### T08 — Prozessabbruch, persistierte Teilaktionen und Wiederaufnahme

Einzeltrace: [T08-restart-resume.md](T08-restart-resume.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

**Status:** statischer Trace abgeschlossen. Bedingte sichere Wiederaufnahme und konkrete Recoveryblockaden unterschieden. **Keine Tests ausgeführt; kein bestandener Neustart-/E2E-Lauf behauptet.**

Codebaseline für sämtliche Belege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Nachgelesene Vorreviews am Reviewstand `a9e080ab1e1981ec5713e9b742f94280835fd347`: `nova.execution.md`, `nova.effects.md`, `nova.state.md`; deren Ergebnisse und Kennungen bleiben erhalten. Quellpfade ab `skills/nova/core/` werden nachfolgend als `core/…` abgekürzt; Busterjobs sind zusätzliche verschachtelte Ausführungen, keine identischen Nova-Stageattempts.

### Szenario und Ausgangszustand

Ein laufender expliziter Stagegraph `producer → consumer`, alternativ eine Modulimplementation/Lint/Review/Testlane, verwendet festen Run R, Graphdigest G, Registry-/Konfigurationssnapshot C und persistente Storageroots. Producer besitzt bereits einen begonnenen Attempt A1. Prozess endet an verschiedenen **gültigen Persistenzpräfixen**, ohne dass daraus ein tatsächlich in dieser Prüfung ausgelöster Crash wird. Varianten betreffen lokale Artefaktarbeit, einen wartenden Operatorentscheid und eine externe Mutation bzw. einen Buster-Testjob. Neustart verwendet denselben Graphen und dieselbe Runtimekonfiguration; Negativvarianten ändern diese oder liefern verspätete/doppelte Signale/Ergebnisse.

Voraussetzungen: gemeinsam sichtbare dauerhafte Dateien, verlässliche fsync-/Hardlinksemantik, passende PID-Sicht für Filelocks, vertrauenswürdiger Host als Resumeaufrufer. Ein `ResumeSignal.issuer` ist keine unabhängige Loginprüfung. Normale Engine-APIs besitzen Run-Mutationslock; der öffentlich exportierte Low-Level-Runner ist damit nicht automatisch abgesichert.

Vorgesehenes Ende: unveränderte Pipeline setzt ausschließlich nachgewiesen sichere Arbeit fort und führt Consumer mit korrekter Evidenz aus; andernfalls genaue geschlossene Blockade einschließlich erforderlicher Entscheidung dokumentieren. Kein Löschen von Journaleinträgen, Überschreiben von Snapshots oder Zurücksetzen von Budgets als vermeintliche Recovery.

### Vollständige Übergangsfolge

| Nr. | Sender → Persistenz/Transport → Empfänger → Rückweg / Folgeschritt | Exakter Codebeleg |
|---|---|---|
| 1 | CLI/API liefert Definition und Run. `runNewPipeline` klont/friert Definition, bereitet Registrierungen vor, erwirbt Runlock und schreibt einen gemeinsam gehashten Graph-/Registrysnapshot. Snapshot wird zuerst vollständig geschrieben/fsynced und danach atomar ohne Überschreiben verlinkt. | `core/execution/engine-run.ts#runNewPipeline:30–38`; `engine-snapshots.ts#writeRunSnapshots:82–96` |
| 2 | `withRunMutationLock` sperrt im Prozess und über FileResourceLockManager denselben Runroot; Lease 60 s, Erneuerung 20 s, Renewalfehler abortiert Ausführung. finally gibt Lock frei. Nach Prozessende muss Übernahme über tote PID erfolgen; bloß verstrichene TTL überstimmt keinen lebenden Besitzer. | `core/execution/run-mutation.ts#withRunMutationLock:7–21`; `core/effects/locks.ts#assertOwnerAvailable:99–103` |
| 3 | Runner persistiert Run-/Stagestart. StageExecutor erzeugt A1 samt UUID, AttemptNumber, Lease, Provenienz, Grants und Deadline; schreibt `attempt.created`, dann `attempt.dispatched`, bevor das Plugin arbeitet. | `core/execution/pipeline-loop.ts:20–32,118–129`; `stage-executor.ts#runtime:53–76`, `#recordAttempt:108–116` |
| 4 | Plugin `context.invoke` wird mit Capability, Ressource, Nutzlast und A1 an Adapter weitergereicht. Schlüssel ist `<run>:<stage>:<attemptNumber>:<sequence>`; jede Invocation erhöht die Sequenz. Effect-ID bindet zusätzlich volle Attemptidentität, Capability/Operation/Ressource. Gleicher Schlüssel mit anderer Payload/Identität ist Konflikt. | `core/execution/stage-executor.ts#context:78–94`; `core/effects/identity.ts#stableEffectId:7–16`, `#assertMatchingRequest:18–23` |
| 5 | DurableInvocation prüft vorhandenen Request/Receipt, akquiriert Ressourcenlock und prüft nochmals. Danach wird Request gespeichert und accepted persistiert, erst dann ruft der Coordinator den Adapter mit Abortsignal/Fence auf. Bereits vorhandenes Receipt wird zurückgegeben; bereits accepted ohne Receipt fordert Adapter-Reconciliation statt erneutem Invoke. | `core/effects/durable-invocation.ts#execute:35–46`, `#executeLocked:62–75`, `#recover:86–91` |
| 6 | Adapter führt eigentliche Wirkung aus. Ein fence muss vor Verwendung bestätigt werden; nach Antwort prüft Coordinator nochmals den aktuellen Lock und schreibt Receipt, danach Auditabschluss. Eine failed-Receipt bedeutet nicht automatisch, dass extern sicher nichts geschah. Caller erhält Ergebnis oder entsprechende Fehlerklassifikation. | `core/effects/durable-invocation.ts#invokeAdapter:93–116`, `#complete:122–128` |
| 7 | Optionaler Artefaktcheckpoint: bei `artifacts.write` mit `checkpoint:true` prüft StageExecutor Result gegen gesendete kanonische Bytes/Digest/Namespace/Mediatyp und exakte Attemptidentität. ArtifactCheckpointRecorder schreibt `artifact.created`; bei identischem Artefakt keine zweite Projektion. Ohne Checkpoint bleibt die spätere normale Resultprojektion maßgebend. | `core/execution/stage-executor.ts:83–88`; `artifact-checkpoints.ts#artifactFromWrite:23–43`, `#record:72–90` |
| 8 | Plugin liefert StageResult. Executor validiert registriertes Resultschema und persistiert vollständiges Result in `attempt.completed`/`attempt.cancelled`/`attempt.timed_out`; danach Leasewiderruf. Erst außerhalb davon ruft Recorder Artefaktprojektion und Stage-/Waitentscheidung auf. Damit existiert eine echte Mehrschreibgrenze. | `core/execution/stage-executor.ts#execute:33–50`, `#recordResult:133–136`, `#cleanup:138–141`; `run-decisions.ts#record:28–33` |
| 9 | Liveprojektion: Recorder prüft Resultartefakte auf gleichen Run/Stage und ruft `checkpoints.result`; für Passed folgt `stage.succeeded`, für Wait `stage.waiting` oder `orchestrator.required`. Alle haben eigenständige Journalzeilen. | `core/execution/run-decisions.ts#artifacts:48–56`, `#orchestrator:88–98`, `#wait:100–107`, `#complete:116–123` |
| 10 | Nach Prozessabbruch ruft Host Recover mit demselben Run auf. Engine bereitet Runtime vor, erwirbt Lock, prüft Registry-/Konfigurations-/Graphpinning, lehnt terminale Runs ab und führt Observability-Reconciliation aus. Erst anschließend werden Stages rekonstruiert. | `core/execution/engine-run.ts#recoverPipeline:50–63`; `engine-snapshots.ts#verifyPinnedPackages:28–65`, `#verifyPinnedGraph:67–72` |
| 11 | Replay faltet ausschließlich Lifecycleevents desselben Runs. `attempt.created` erhält verwendete Nummer/Budget; vollständig persistiertes Result wird mit demselben Reducer angewandt. Unterbrochenes `running` wird `pending`, Zähler bleiben erhalten. Genehmigte Waitresolution stellt exakte Guidance wieder her. | `core/lifecycle/recovery.ts#recoverStageStates:17–33`; `recovery-state.ts#recoverAttemptResult:37–55`, `#applyRecoveryEvent:142–177`, `#resetInterruptedStages:179–183` |
| 12 | Vor Adapterstart prüft `assertEffectRecoverySafe` alle run-/stageeigenen Effects. accepted ohne Receipt → `RECOVERY_EFFECT_OUTCOME_UNRESOLVED`. Receipt einer externen Operation in nicht abgeschlossenen Attempt → `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED`. Nur explizite lokale Read-/Artefaktoperationen sind von zweiter Regel ausgenommen; erste Regel bleibt bestehen. | `core/execution/engine-run.ts#executePrepared:20–27`; `effect-recovery.ts:6–28` |
| 13 | Bei vorhandenem Wait verweigert normaler Recover `RECOVERY_SIGNAL_REQUIRED`. Resume selektiert genau Wait-ID, verlangt separate Wait-Erstellungszeile, prüft Schema/Issuer/Typ/Zeit/Ablauf. Signal wird zuerst in `signals.jsonl`, danach `wait.resolved` ins Eventjournal geschrieben. | `core/execution/engine-run.ts:59–60,76–116`; `engine-snapshots.ts#validateSignal:112–119` |
| 14 | Nach `wait.resolved` wird Stage pending mit `continuationGuidance:signal.payload`. `executePrepared` startet nur bei sicheren Effects; neuer Attempt A2 besitzt neue UUID und erhöhte AttemptNumber. Consumer erhält Artefakte eigener Stage und transitiver Vorgänger aus dem Checkpointindex. | `core/lifecycle/recovery-state.ts:161–167`; `core/execution/engine-run.ts:86–89`; `stage-executor.ts:53–76,96–106` |
| 15 | Bei terminalem blocked ist Resume/Recover nicht der Reparatureinstieg. Administrative API validiert Hostprincipal gegen Actor/Allowlist, bindet Entscheidung idempotent, prüft unveränderten Graph und erlaubte Upgradefolge, schreibt Entscheidung und `run.resumed`, erlaubt gezielte Fortsetzung. Sie überspringt nicht `assertEffectRecoverySafe`. | `core/execution/engine-admin.ts#reopenPipeline:24–29`, `#run:38–52`, `#authorize:61–65`, `#continue:84–94` |
| 16 | Wenn sichere Stages und Abhängigkeiten tatsächlich erfolgreich enden, persistiert Loop Runabschluss. Noch offene Waits/terminales Result/Budgetende bleiben sichtbar. Normaler Wiederaufruf nach terminalem Erfolg ist keine zweite Ausführung desselben Runs. | `core/execution/pipeline-loop.ts#finalize:137–144`; `engine-run.ts#assertRecoverableRun:40–44` |

### Crashfenster und konkreter Endzustand

Die Matrix modelliert mehrere Unterbrechungspunkte desselben Szenarios. „Fortsetzung möglich“ bedeutet statisch vorhandenen Pfad unter Voraussetzungen, niemals ein hier beobachtetes Testergebnis.

| Unterbrechung | Dauerhafter Stand | Verhalten nach Neustart / erste Grenze |
|---|---|---|
| Vor Snapshotpublikation | Eventuell temporäre Snapshotdatei, kein vollständiger Run-Snapshot | Normales Recover kann keinen gültigen Snapshot lesen. Kein Teilgraph wird als vollständige Basis angenommen. Restdatei ist kein laufender Run. |
| Nach vollständigem Snapshot, vor Attempt | Graph/Registry liegen vor; noch keine externen Wirkungen | Gleicher Stand kann Core-Recovery erreichen; ohne terminale Grenze bleiben Stages pending. |
| Nach `attempt.created`, vor Capability | Attemptbudget bereits verbraucht, keine externe Wirkung | Replay plant neuen Attempt, sofern Budget reicht. Versuch wird nicht „ungeschehen“ gemacht. |
| Nach Effectrequested, vor accepted | Intent ist gespeichert, Wirkung noch nicht dispatcht | Safeguard findet keinen accepted-unresolved Effekt. Unterbrochener Stageattempt bleibt verbraucht; neuer Attempt darf unter Budgetregel beginnen. Neuer Attempt ist neue Effektidentität, keine Aussage über Exactly-once extern. |
| Nach accepted, vor tatsächlichem Send | Persistierte Annahme, aber keine sichere Auskunft über Wirkung | `RECOVERY_EFFECT_OUTCOME_UNRESOLVED` blockiert konservativ. Auch wenn der Dienst tatsächlich noch nichts getan hat, darf das System diesen Ausgang nicht erraten. |
| Nach externem Commit/Send, vor Receipt | Extern kann Wirkung erfolgt sein; Nova kennt kein Ergebnis | Dieselbe Blockade; ein einfacher Retry mit neuem Key wäre potenziell doppelte Wirkung und wird nicht als Lösung empfohlen. |
| Nach Receipt, vor vollständigem Attemptresult | Effectabschluss bekannt, restliche Stage-/Artifactarbeit unklar | Externe Operationen verlangen `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED`; lokales Artefakt-/Readcheckpointing kann mit neuem Attempt fortsetzen. Fertiger Busterjob allein hebt diese äußere Grenze nicht auf. |
| Nach `artifact.created`-Checkpoint, vor Stageabschluss | Checkpoint ist im Eventjournal sichtbar | Replayindex bietet ihn neuem Attempt/zulässigen Nachfolgern; exakte wiederholte Resultreferenz erzeugt keine zweite Projektion. Vorhandener Test deckt genau dieses Fenster ab. |
| Nach `attempt.completed(passed,artifacts)`, vor `artifact.created` | Producerresult einschließlich Ref vorhanden, separate Projektion fehlt | **PCR-EXEC-002:** Replay setzt Producer succeeded, Index liest nur artifact.created. Consumer bekommt keinen Ref; bei Source-Consumer z.B. `SOURCE_IMPLEMENTATION_ARTIFACT_MISSING_OR_AMBIGUOUS` statt derselben Kandidatenevidenz. Nachfolgende Blockade ist statisch abgeleitet, nicht neu ausgeführt. |
| Nach `attempt.completed(wait/orchestrator_required)`, vor separater Waitzeile | Reducer kann Wait rekonstruieren, Erstellungsrecord fehlt | **PCR-EXEC-001:** Recover verlangt Signal, Resume lehnt `WAIT_CREATION_RECORD_MISSING` ab. Erste echte Recovery-Sackgasse ohne externe Unsicherheit. |
| Nach Core-Waitrecord, vor observerbasierter Benachrichtigung/deren ACK | Core-Wait vorhanden; ein Observer kann noch nicht zugestellt haben | Diese Zeile gilt ausschließlich für nachgelagerte Observerzustellung, nicht für direkte Approval-/Prismnachrichten. Core hat gültigen Wartezustand; sichere Wiederzustellung hängt vom Messaging-/Effectpfad ab. Nicht als automatisch erfolgreiche Nachricht behauptet. `PCR-OPERATOR-001` bleibt zuständiger Vorbefund für fehlende erneute Sends bei failed-Receipt. |
| Nach `signals.jsonl`, vor `wait.resolved` | Gültiger Signalintent gespeichert, Wait noch aktiv | Gleiches Signal kann erneut validiert und idempotent übernommen werden, sofern noch nicht abgelaufen; dann wird fehlende Resolution geschrieben. Nur persistierter Signalintent löst Recover nicht automatisch auf. |
| Nach `wait.resolved`, vor nächstem Attempt | Resolution enthält komplettes Signalpayload | Normaler Recover rekonstruiert pending+Guidance. Gleicher Resumeaufruf findet nun keinen aktiven Wait mehr (`WAIT_UNKNOWN_OR_STALE`); keine doppelte Genehmigungsausführung daraus ableiten. |
| Nach `run.succeeded`/failed/blocked/cancelled | Terminale Grenze | Recover/Resume lehnen terminalen Run ab. Nur blocked hat ausdrücklich authentisierten Adminreopenpfad; API macht einen bereits erfolgreichen Run nicht erneut erfolgreich durch Arbeit. |
| Unterbrochene letzte Journalzeile | Vollständiger gültiger Präfix plus unvollständiger Tail | FileJournal repariert nur den unvollständigen Tail; vorhandene vollständige Hash-/Sequenzfehler werden nicht überschrieben. Host-Stromausfall ist damit nicht generell bewiesen. |

Direkte Human-Approval-/Prismnachrichten haben eine andere Reihenfolge: `signal.wait.create` im Waitstore → `operator.request.publish` → Plugin liefert Waitresult → Executor schreibt `attempt.completed` → Recorder schreibt `stage.waiting`. Belege: `skills/nova/plugins/human-approval/src/stage.ts:23–55`, `skills/nova/plugins/prism-design/src/stage.ts:19–26`. Ein Crash nach Send vor Coreabschluss kann daher bereits sichtbare Operatornachricht und externen Wait hinterlassen, aber noch keinen aus Coreeventjournal fortsetzbaren Wait. Dann greifen die offenen externen Effectgrenzen; der externe Waitstore allein ersetzt `validateWaitHistory` nicht. Ein Crash nach `attempt.completed` vor `stage.waiting` erreicht PCR-EXEC-001.

#### Sichere bedingte Fortsetzung nach der ersten Bruchstelle

Für PCR-EXEC-001 wird der Restpfad **unter der Voraussetzung einer künftig korrekt materialisierten Waitprojektion** verfolgt: vorhandener kanonischer Wait → gültiges autorisiertes Signal → idempotenter Signalrecord → wait.resolved → pending samt exakter Guidance → Sicherheitsprüfung externer Effects → A2 → finales Stage-/Runresult. Diese Voraussetzung ist kein in diesem Auftrag implementierter oder zulässiger manueller Journaleingriff.

Für PCR-EXEC-002 wird der Restpfad **unter der Voraussetzung einer künftig idempotent aus dem vollständigen Result rekonstruierten Artefaktprojektion** verfolgt: Producer bleibt succeeded ohne erneute Mutation → Consumer erhält originalen Ref mit identischem Run/Stage/Attempt/Digest → Adapter liest gespeicherte Bytes → Source-/Gateprüfung → regulärer Abschluss. Ein neuer Producerlauf oder bloß HEAD als Ersatz würde gerade die Identitätsgarantie verletzen.

### Verschachtelter Busterjob: Send-, Ergebnis- und Importgrenzen

`core/test-gates/remote-dispatch.ts#createRemotePlanJob:38–58` bindet Job-ID an Idempotenzschlüssel; Requestdigest umfasst PipelineStage-ID, Resolved Plan, attestierten SourceSnapshot, Archiv, Grants und Concurrency. `FileNovaRemotePlanStore.persistBeforeDispatch:78–97` speichert den vollständigen Job vor Submit; `load:99–116` kann Archivblob aus gespeicherten Jobbytes wiederherstellen. Das bewahrt den eingereichten Quellstand und erfindet bei Wiederholung keinen neuen aktuellen HEAD.

`NovaRemotePlanDispatcher.dispatch:176–232` sendet denselben gespeicherten Job. Nach retrybarem Submitfehler fragt er zuerst Status derselben Job-ID; wenn weiter unbekannt, kann er denselben Job erneut anbieten. Jede Statusantwort muss Job-ID und Requestdigest treffen. Terminale Status werden nicht anhand eines beliebigen verspäteten Ergebnisses angenommen. Node-/Jobreplay auf Worker-Seite ist eine weitere eigene Schicht; Nova-Dedupe alleine beweist deren vollständige Idempotenz nicht.

Nach terminalem Status lädt `NovaRemoteGateImporter.import` das referenzierte Result und Evidencebytes (`remote-result-import.ts:285–313`). `verifyCompletedResult:100–162` prüft Run, Plan, Job, Digests/Receipt, exakte Node-Menge, Attemptidentitäten, Modi/Provider/Scopes, zusammenhängende Attemptnummern, Retrygrenzen und finale Attemptzuordnung. `FileNovaGateImportStore.record:226–270` schreibt erst `pending_evidence`, dann Blobnachweise, dann per erwarteten Payloaddigest `complete`. Wiederholung mit gleichen Identitäten kann abgeschlossenes Result zurückgeben; abweichende Source-/Request-/Result-/Decision-/Evidenceidentität wird Konflikt. Sichtbare Graphprojektion berücksichtigt nur `state:complete` (`readExecutionGraphs:218–225`).

**Wesentliche Schichtgrenze:** Nova-Core akzeptiert nicht automatisch den Wiederanlauf einer äußeren `test.plan.execute`-Invocation, nur weil innerer Job und Import durable sind. Vor erneutem Pluginstart blockiert `effect-recovery.ts` accepted-unresolved Effects und externe Receipts in unterbrochenen Attempts. Eine geeignete autorisierte Continuation muss deren konkrete bekannte Wirkung reconciliieren; der bestehende Adminretry überspringt diese Prüfung ebenfalls nicht. Daraus folgt keine Datenverlustbehauptung, sondern eine konkrete Grenze autonomer Wiederaufnahme.

Abhängigkeitenausfall: retrybare Netz-/HTTPfehler können Polling/Statuslookup derselben Job-ID auslösen. Bei Callerabort versucht Dispatcher explizites Cancel mit eigenem kurzen Signal. Beim Timeout im unbekannten Submitzweig existiert die bekannte Einschränkung **PCR-NOVA-GATE-001**: äußerer Catch cancelt nur bei Callerabort, nicht bei reinem eigenem Deadlineende (`remote-dispatch.ts:199–208,225–231`); ein bereits angenommener Job kann weiterlaufen. Keine erneute Reproduktion in T08. Timeout der gesamten Ergebnisimporte bleibt unter **PCR-NOVA-GATE-002** getrennt geführt; Dispatcherdeadline ist nicht automatisch ein Gesamtdeadlinevertrag des anschließenden Imports (`remote-result-import.ts:329–334`).

### Doppelte/verspätete Ergebnisse, Abbruch und Drift

| Variante | Technisch erzwungene Grenze und verbleibende Aussage |
|---|---|
| Doppelte Invocation desselben Keys | Requestidentität/Payload müssen stimmen; persistiertes Receipt wird replayt. Failed bleibt failed, kein automatischer erneuter Send. |
| Neues Attempt nach Restart | Neue Attempt-UUID/-Number und Sequenzraum. Alte externe Wirkung wird nicht durch gleiche Modul-ID automatisch übernommen; Safeguard verlangt Klärung. |
| Verspätetes Pluginpromise nach Timeout | `Promise.race` hat den Attempt beendet; Cleanup widerruft Lease und abortiert Controller. Das Promise kann intern weiterlaufen, aber spätere Contextcapabilities scheitern an Lease. Bereits laufende externe Operationen müssen selbst Abort/Fence umsetzen; keine synchrone garantierte Beendigung aller Wirkungen. Beleg: `stage-executor.ts:118–141`. |
| Expliziter Abort | Caller-/Runlocksignal erreicht Stage; cancelled-Result/Runzustand wird persistiert. SIGKILL umgeht finally vollständig, ist Recoveryfall statt sauberer Cancel. Launcher bindet Betriebssystemsignale nicht automatisch an den optionalen API-Abort. |
| Abhängigkeitsausfall vor Stage | Adapterstart kann vor Pluginstart scheitern; keine erfolgreiche Stage daraus. Runtimepipeline flusht Observer und fährt Adapter im finally herunter (`engine-run.ts:20–27`). |
| Graph-/Configdrift | `RECOVERY_GRAPH_DIGEST_MISMATCH`, Pipeline-ID-/Runtimekonfigurationsabweichung blockieren vor Wiederaufnahme. Änderungen an Stagetasks/Inputs sind Teil des Graphs, keine unbemerkte Freigabeübernahme. |
| Paketdrift | Menge/Version/Inhaltsdigest müssen gepinnt bleiben. Zulässige administrative Paketupgrades benötigen zusammenhängende from/to-Kette; gleicher Name allein reicht nicht (`engine-snapshots.ts:28–65`). |
| Wiederholtes Signal | `signals.jsonl` akzeptiert gleichen idempotenten Inhalt, lehnt andere Payload bei gleichem Key bzw. zweiten Signalrecord für Wait ab. Nach Resolution gilt Wait nicht erneut als aktiv (`engine-run.ts:93–115`). |
| Fremdes/abgelaufenes Signal | Wait-ID, Signaltyp, Issuertyp/-ID und Zeitprüfung; keine Authentifizierung allein durch behauptete JSONissuerwerte. Host muss diese vertrauenswürdig liefern (`engine-snapshots.ts:112–119`). |
| Adminretry nach dessen eigenem Crash | Entscheidung wird vor Continuation gespeichert, Replay erkennt causation-ID. Bereits angelegter administrativer Attempt wird nicht erneut mit frischem Overridebudget gestartet; unterbrochener Zusatzversuch blockiert (`engine-admin.ts:112–120`). |

### Befunde mit Ursachenbehebung und geeigneter späterer Verifikation

#### Keine neue Kennung für bewusst geschlossene externe Recovery

Die beiden `RECOVERY_EFFECT_*`-/Continuationblockaden verhindern bewusst blinde Wiederholung unsicherer externer Arbeit. Das ist implementierte Sicherheitssemantik, nicht automatisch ein Defekt. Was fehlt, ist ein in T08 nachgewiesener allgemeiner autonomer Weg, jede solche Wirkung bis zum fertigen Run zu reconciliieren. Der Bericht trennt diese Funktionsgrenze von PCR-EXEC-001/002, die bei vorhandener kanonischer Evidenz trotzdem unvollständige Projektionen erzeugen. `PCR-NOVA-GATE-001/002` bleiben eigene bereits bestehende Teilpfadbefunde.

### Tatsächlich ausgeführte Prüfungen, gelesene Tests und offene Nachweise

Ausgeführt: ausschließlich Lesen des festen Quellstands und vorhandener Reviews, Symbol-/Zeilengegenprüfung und schriftlicher Präfixtrace. **Alle folgenden Tests NICHT AUSGEFÜHRT**, keine CI und keine funktionalen Änderungen:

| Vollständig gelesener Test | Was sein Code tatsächlich prüft / Grenze |
|---|---|
| `tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs` | Originalengine/Artefaktadapter, synthetische Checkpointstage, echter Kindprozess-SIGKILL nach Checkpoint, zweiter CLIprozess, Attempt 1→2, keine doppelte Projektion; gesonderter abhängiger Consumer. Prüft nicht normalen Resultartefakt-Crash vor artifact.created. |
| `tests/verification/reliability/lifecycle.test.mts` | Originalrecorder/-journal für Repairinvalidierung, synthetische Resultwerte; tatsächlicher SIGKILL **nach** durable wait.resolved und Wiederherstellung identischer Guidance. Prüft nicht fehlenden Wait-Erstellungsrecord vor dieser Resolution. |
| `tests/verification/reliability/external-effect-recovery.test.mts` | Lokaler HTTPdienst mit fsync-Mutation; Originalruntime-/HTTP-/Secretadapter und synthetische Stage; before-/after-receipt-SIGKILL sowie Antwortverlust. Erwartet gerade geschlossene Recovery, keine automatische externe Wiederholung. Vorreview berichtet Umgebungs-/Isolationblockierung damaliger Ausführung; T08 hat das nicht neu getestet. |

Originale Vorreviews enthalten weitergehende Tests/Präfixproben; diese werden hier nicht als erneut gelesen/ausgeführt aufgelistet, soweit nur deren Reviewbeschreibung konsultiert wurde. Kein Mock oder synthetischer Stageinput gilt als realer Forge/Buster/Prism-E2E-Nachweis.

Offene Laufzeitnachweise: echte Prozessunterbrechungen an allen getrennten Journalgrenzen; vollständiger Quellen-/Artefaktfluss bis Consumer nach PCR-EXEC-002-Fix; Operatorwait/Signal nach PCR-EXEC-001-Fix; konkurrierende Reclaimer im tatsächlichen Volume-/PID-Aufbau; externe Receipt-/Continuationstrategie für Git, Dispatch und Busterjob; Host-Stromausfall/Storagequoten; Abbruch bereits laufender Adapter mit realen Diensten; Importreplay nach Evidence-Teilcommit; Gesamtdeadline einschließlich Import. Lesende Hashkettenprüfung und SIGKILLfixture können diese Nachweise nicht ersetzen.

Empfohlene spätere Reihenfolge: (1) zentralen Dateilock-Ausschluss PCR-STATE-002 stabilisieren, (2) kanonische Result→Wait-/Artifactprojektion PCR-EXEC-001/002 schließen, (3) Effectlockbesitz PCR-EFFECT-001 und unveränderliche Payloads PCR-STATE-001 korrigieren, (4) explizite externe Continuation je Wirkung und verschachteltem Job nachweisen, (5) reale Crash-/Restartmatrix. Endergebnis von T08 ist eine vollständige statische Grenzanalyse mit konkret belegten Blockaden, kein bestandener Resume-Lauf.

### T09 — Wiederholte/neue Fehler, Retry-Limit und Needs Nova

Einzeltrace: [T09-retry-escalation.md](T09-retry-escalation.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Status: statisch vollständig bis Eskalation, Entscheidung und bedingter erneuter Prüfung verfolgt. Subagent `/root/trace06`. Kein ausgeführter Pipeline-/E2E-Test.

### Stand und Szenario

Codecommit für sämtliche Belege: **85ddfcbfc15e078780ea0434fc167e6f9a9b9488**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Zeilen 1-basiert. Vorreview gelesen: `docs/review/components/nova.execution.md` und zentrales Register am Reviewcommit `a9e080ab1e1981ec5713e9b742f94280835fd347`. Bestehende PCR-Kennungen werden weitergeführt. Vollständiger Baselinebaum enthält keine AGENTS.md; lokal noch nicht materialisierte Dateien wurden bei Bedarf exakt am Codecommit gelesen.

Ausgang: ein bereits gestarteter, gültig gepinnter Run R mit Modul M. Forge F hat H1 integriert, Lint L prüft H1, Echo E und Modultest T folgen. Pluginregistrierung/Grants/Artefaktspeicher gelten als vorhanden. Vorangehende Blocker wie PCR-IMPLEMENTATION-001 sind für den Start dieses Szenarios ausdrücklich überwunden bzw. als Voraussetzung ausgeklammert, nicht als behoben behauptet.

Varianten innerhalb dieses einzelnen Eskalationsszenarios:

- Produktcompiler mit `maxAttempts:2`, `maxRemediationCycles:2`, `timeoutMs:1800000`, ohne `orchestratorAfterAttempt`.
- Expliziter Graph mit größerem Gesamtbudget und `orchestratorAfterAttempt` unterhalb `maxAttempts`.
- Gleicher Fehler erneut oder neuer Fehler nach erster Reparatur; normales retry, request_fix, rate_limited, timed_out, explizites orchestrator_required.
- Nach Pause gültige/stale/doppelte Resumeentscheidung; nach blocked administrative retry/remediation/cancel; Crash um Entscheidungspersistenz.

Ende: derselbe gepinnte Run setzt mit autorisiertem zusätzlichem Versuch und erneuten erforderlichen Prüfungen fort oder endet nachvollziehbar blocked/failed/cancelled. Ein Erfolg ist nur ein bedingt hergeleiteter Codepfad.

### Ergebnis vorweg

**Der Compiler bietet keinen automatischen Übergang „Retry-Limit → Needs Nova → normale Fortsetzung“.** Wiederholte retry/request_fix-Ergebnisse führen bei verbrauchtem Budget zu `blocked`, nicht zu einem Wait. Der Core unterstützt einen optionalen **früheren** Orchestratorwait für normales retry sowie explizites `orchestrator_required`; diese Möglichkeiten sind von erschöpftem Budget verschieden. Ein bereits blocked Run braucht die gesonderte administrative Bibliotheks-API. Normales `--recover`/`--signal` öffnet ihn nicht.

Der administrative Reparaturpfad verwendet nicht die normale Reparaturinvalidierung. Das bereits in T04 geführte **PATH-T04-003** wird hier an Forge/Lint/Echo konkret bestätigt: vorheriges Lint kann nach neuer Forge-Revision erfolgreich stehen bleiben. Dieses Ergebnis ist kein neuer doppelter Befund.

### Übergangsfolge: Ergebnis bis Entscheidung und Rückweg

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

### Fehlerklassen und Counterentwicklung

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

### Findings, Abweichungen und Nachweisgrenzen

#### Wiederverwendete PCR-Befunde

- **PCR-EXEC-001:** Crash nach attempt.completed vor orchestrator.required. `recovery-state.ts:37–77` rekonstruiert Wait, `engine-run.ts:60–61` verlangt Signal, `validateWaitHistory:95–101` verlangt aber separate payload.wait-Zeile. Originalvorreview belegt die Sackgasse; hier Codegegenprüfung, kein erneuter Crashlauf.
- **PCR-EXEC-002:** Persistiertes Resultartefakt ist nach bestimmtem Crashpräfix noch nicht projiziert; Gegenstelle kann Source-/Fehlerevidence nicht aus normalen sichtbaren Artefakten beziehen. Hier Abhängigkeit aus Vorreview, keine neue Reproduktion.
- **PCR-IMPLEMENTATION-001:** Jede tatsächlich notwendige neue Forgearbeit behält die bereits dokumentierte Workspaceübergabelücke; im Ausgang dieses Szenarios explizit ausgeklammert.
- **PCR-NOTIFY-001/PCR-OPERATOR-001:** ein persistiertes Needs-Nova-/Blocked-Ereignis ist kein bestätigter Operatornachrichtenempfang; Zustellpfad nicht als erfolgreich behauptet.

### Persistenz, Doppelzustellung und Unterbrechungen

Run-/Graph-/Packageidentität ist in den Snapshots gepinnt. Eine graphändernde Budgeterhöhung im ursprünglichen JSON wird beim Resume/Recovery abgewiesen; administrative Zusatzversuche sind der getrennte Mechanismus. Adminpaketupgrades dürfen eine deklarierte, auditierte Versionskette bilden; dieser Trace verwendet keine Upgrades und ändert den Prüfcommit nicht.

Adminjournal und Lifecyclejournal sind getrennt: `engine-admin.ts:48–52` schreibt erst Entscheidung, danach `run.resumed`. Exakte gespeicherte Entscheidung wird ohne erneute Actorabfrage verwendet (`61–65`), weil der persistierte autorisierte Intent fortgilt. `#hasEvent/#appendOnce:130–137` bindet Folgewirkungen an decisionId. Ein bereits terminal abgeschlossenes Replay liefert gespeicherten Abschluss, erzeugt keinen weiteren Versuch. Ein unterbrochener verbrauchter Adminretry wird blocked statt doppelt ausgeführt (`112–119`).

Externe Effekte haben eigenen Journal-/Receiptvertrag. `effect-recovery.ts:14–28` blockiert accepted-ohne-Receipt und unterbrochene externe Effekte auch vor executePrepared im Adminpfad. Eine neue Adminentscheidung allein beweist keine Reconciliation eines möglicherweise bereits wirksamen Git-/Agentaufrufs. `stage-executor.ts:117–140` verhindert spätes erfolgreiches Stageergebnis nach Timeout durch Promise.race und Leasewiderruf; externes tatsächliches Stoppen bleibt Runtime-/Adapterpflicht.

Die konkrete `reopenBlockedPipelineV2`-API ist implementiert/exportiert. Die gelesenen Produktions-CLIs `skills/nova/core/cli.ts:55–68` und `skills/nova/project/cli.ts:19–24,42–45` bieten run/recover/signal, aber keinen administrativen reopen-Befehl. Daraus wird **nicht** die repositoryweite Nichtexistenz jedes anderen Adminclients abgeleitet. Für Operator/Discord → authentifizierter Adminaufruf ist hier kein vollständiger Bedienpfad belegt.

### Ausgeführte Prüfungen und gelesene Tests

**Ausgeführt: ausschließlich statische Lektüre, Originalseitenvergleich und Gegenabgleich mit Vorreviews. Keine Tests, CI oder Simulationen ausgeführt.**

| Originaltest, gelesen und NICHT AUSGEFÜHRT | Tatsächliche Aussage seines Inhalts | Begrenzung |
|---|---|---|
| `tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs` | retry1, Orchestratorschwelle2 bei max3, exhausted3 und request_fix als Reducerfälle | Synthetische Stage; kein Compiler-F→L→E→T, keine administrative Recheckfolge |
| `tests/verification/contracts/check-plugin-system-v2-resume.mjs` | Originalengine mit Fixturewait, gepinnter Graph, gültiges Resume, stale/doppelter Signalpfad | Vollständig persistierter Wait; deckt PCR-EXEC-001-Fenster nicht ab |
| `tests/verification/contracts/check-plugin-system-v2-phase6.mjs:429–600` | Auth-/Allowlistablehnung, konkurrierende idempotente Adminretryaufrufe, persistierter unapplied Intent, erfolgreiches replay; administrative remediation | Adminremediation ist `approval(blocked_then_pass) → fix`, maxAttempts2 (`560–575`), **ohne bereits erfolgreichen Lintvorgänger**, ohne echten Forge-Repairvertrag |
| `tests/verification/reliability/lifecycle.test.mts` | Normale Reparatur mit Originalrecorder/-journal invalidiert Lint und erhält Fehlerevidence; SIGKILL nach vollständiger wait.resolved-Zeile erhält Guidance | Normaler repairRequest-Pfad, nicht engine-admin.#remediate; eigene synthetische Stageergebnisse; kein E2E |

Historische „bestanden“-Angaben des Komponentenreviews wurden nicht als in diesem Auftrag ausgeführte Tests übernommen. Offene Laufzeitnachweise: echte Pluginfehlerklassifikation durch Buster/Runtime, mehrere echte Revisionen mit Reparatur und frischer Lintfolge, authentifizierter Operatorentscheid, Crashfenster um Adminintent/Attempt und externe Reconciliation, Cooldownwiederaufnahme und spätes externes Resultat.

### Empfohlene Ursachenbehebung

1. Administrative Reparatur mit normaler Evidence-/Invalidierungslogik zusammenführen (PATH-T04-003), bevor sie als Wiederaufnahmeweg empfohlen wird.
2. Compilerbudgets und gewünschte Eskalationsdisposition zusammen definieren (PTR-T05-001/T09-D01); feste Graphbindung bewahren.
3. Waitpersistenz-/Recoveryquelle vereinheitlichen (PCR-EXEC-001) und echte Resultartefaktprojektion sicherstellen (PCR-EXEC-002).
4. Authentifizierte Bedienkette zu genau begrenzten Entscheidungen und vollständigen Rechecks verifizieren; keine implizite „Akzeptanz“ durch freien Signaltext oder Statuslabel.

### T10 — Nur Lint, deaktivierte Echo-/Testagent-Prüfungen und minimale Abschlüsse

Einzeltrace: [T10-minimal-checks.md](T10-minimal-checks.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Prüfstand, Szenario und Ergebnis

Geprüfter Codecommit: **`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle folgenden Codebelege beziehen sich darauf. Statischer Trace; keine Tests, CI, Agentjobs oder Deployments ausgeführt. Ein hier nachvollzogener Abschluss ist kein bestandener Laufzeit-/E2E-Test.

Ausgangszustand: ein Modul besitzt Task, Ownership, Anforderungen und Forgekonfiguration. Gewünschte Variante ist Implementierung → verpflichtendes Lint → Abschluss, ohne optionalen Echo-Review und ohne Testagent. Zusatzvarianten: nicht anwendbare Tools, fehlendes erforderliches Tool, fachlicher Lintfehler → Forgerückgabe → reparierter Commit → erneutes Lint; optionales Pre-check statt Full; ausschließlich Deliverylint.

**Ergebnis:** Nach jedem Modul ist Full-Lint im Projectcompiler tatsächlich unabhängig vom Echo-Stagecode verdrahtet und liegt vor Echo. Der Compiler unterstützt jedoch weder Echo-off noch Test-Agent-off noch einen Lint-only-Modus. Der explizite Graphentrypoint unterstützt einen Graphen mit ausschließlich Implementierung und Lint; dort muss dessen Autor die Dependencies und Sourcebindung ausdrücklich setzen. Keine globale Corepolicy erzwingt Lint vor jeder beliebigen Reviewstage. „passed“ bedeutet außerdem nicht zwingend, dass mindestens ein natives Tool erfolgreich ausgeführt wurde.

### Abdeckung und Konfigurationsvarianten

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

### Übergangsfolge mit Aufrufer, Empfänger und Rückweg

#### 1. Auswahl des Entrypoints und erste Bruchstelle

`skills/nova/project/cli.ts:19–26` akzeptiert Project-/Platform-/Compile-/Recover-/Signaloptionen und ruft `compileProject` auf. `skills/nova/project/compiler.ts#compileProject:46–60` akzeptiert geschlossene Projekt-/Modulobjekte. Eine erfundene Eigenschaft `skipReview`, `lintOnly` oder `testAgent:false` wird nicht still ignoriert. `review` muss Objekt mit nichtleerem agent sein (78); `test.agent` wird über den Agentparser gefordert (81–82); der Testplan braucht wenigstens einen ungeskippten blockierenden Test (84–89). Fehlende review/test-Konfiguration erreicht deshalb keine Modulausführung. **Erste Bruchstelle der angefragten Projectvariante ist die Eingangsvalidierung.**

Konditionale Fortsetzung: Ein expliziter `pipeline-definition.v2` mit Implementierungs- und Lintstage wird über `skills/nova/core/cli.ts:55–60` geladen und `runPipelineV2` übergeben; dieser Weg verwendet nicht den Projectcompiler. `core/execution/graph.ts#ExecutionGraph.ready:45–46` schedult vorhandene Stages nach Dependencies, ohne Forge/Echo/Testnamen fest einzubauen. Der Graph muss z.B. Lint dependsOn implement und on.request_fix implement setzen. Eine vorhandene Echo-/Teststage wegzulassen ist dort eine Graphentscheidung, kein im Projektmodell unterstützter Schalter.

#### 2. Forgeabschluss → Sourceartefakt → Lintbereitschaft

Compiler erzeugt `implement-<id>` mit runId/moduleId/headBefore und Workspace, anschließend `lint-<id>` vom Typ `kubeclaw.lint.full`, abhängig ausschließlich vom Implementierungsabschluss, mit `{workingDirectory:repository, project:projectId, sourceStageId:implementationId}` und `on.request_fix:implementationId` (`compiler.ts:103–121`). Echo wird erst **danach** abhängig von Lint erzeugt (122–126). Das beweist den gewünschten Lintzeitpunkt im tatsächlich generierten Projectgraphen.

`skills/nova/plugins/implementation-agent/src/stage.ts#execute:67–100` überschreibt runId/attempt aus der Corelease, führt Dispatch/Integration aus und schreibt `implementation:<moduleId>:<attempt>`. Der Bericht besitzt status, sourceRevision des Mergeergebnisses und headBefore; ready_for_testing ergibt passed (119–122). `integrateWorkspace:33–46` committet changedPaths und mergt die Workspacebranch, deren zurückgegebene 40-stellige Revision geprüft wird. **Bekannter vorgelagerter Blocker PCR-IMPLEMENTATION-001:** der erzeugte Workspace wird nicht im Agentrequest als Arbeitsverzeichnis übertragen; für diesen Teiltrace wird ein echter gültiger integrierter Implementierungsabschluss ausdrücklich vorausgesetzt. Seine fehlende Lauffähigkeit wird nicht durch die Lintanalyse geheilt.

`skills/common/plugin-runtime/sdk/src/source-revision.ts#resolveSourceRevision:29–38` verlangt genau revision oder sourceStageId, wenn aufgerufen. Bei Sourceartefaktwahl filtert `implementationArtifacts:5–8` aktuellen Run, Producerstage und Namespace; der höchste Attempt wird eindeutig gewählt. `readImplementation:17–26` liest exakt Digest/Bytegröße, prüft JSONhash und ready_for_testing/Revision. Core liefert nur Artefakte eigener und transitiver Vorgängerstages (`core/execution/stage-executor.ts#priorArtifacts:96–105`). Somit führt ein neues Forgeartefakt nach Reparatur zu einer neuen ausgewählten Source-Revision.

Wichtige explizite Graphvariante: `lint/schemas/input.schema.json:5–6,57–75` fordert nur workingDirectory und verbietet gleichzeitige sourceStageId/revision; **beide fehlen zu lassen ist erlaubt**. `lint/src/stage.ts#execute:61–62` überspringt dann den Resolver. Ein solcher Aufruf lintet den lebenden Arbeitsbaum; daraus folgt keine Commitgleichheit zu einem früheren Forgeergebnis. Der Projectcompiler setzt sourceStageId immer und fällt nicht in diese Variante.

#### 3. Lintstage → Adapter → isolierter Kandidat

`lint/src/stage.ts#execute:63–82` sendet `lint.execute/run_report`, resource `lint.project` mit Projekt oder Arbeitsverzeichnis und Payload aus workingDirectory, sourceRevision, policyPath/policyProject, tier sowie optionalem Scope/Kubernetes-/Visibilityinput. Kein Agentdispatch erfolgt; dies ist ein lokaler privilegierter Adapter. `lint/plugin.json:5–46` registriert Pre-check, Full und Executor separat.

`lint/src/adapter.ts#activate:61–81` prüft Fence/Abbruch am Eintritt, Capability/Operation, realpath-basierte Repository-/Policyroots und optionale SHA-Revision. `withLintCandidate` aus `candidate.ts:7–19` erzeugt temporären Sharedclone, checkt die explizite Revision detached aus, prüft HEAD und entfernt das Verzeichnis im finally. Die Gitcalls deaktivieren Hooks. Unversioniert arbeitet die Engine stattdessen direkt im freigegebenen workingDirectory. Rückgabe ist `{report,sourceRevision?}`; Stage vergleicht dieselbe Source-Revision (stage.ts 83).

#### 4. Toolauswahl, tatsächliche Ausführung und Nichtanwendbarkeit

`lint/src/engine/index.ts#executeLintReport:77–128` lädt kanonische Policy, Projekt, Targetpfade und Discovery, normalisiert Scope, setzt Policy-/Config-/Baselineinformationen und baut Registry. `tool-registry-core.ts#buildToolRegistry:113–133` verlangt für konfigurierte Tools einen Adapter und für jeden registrierten Adapter kanonische Policy; einfach alle Toolobjekte aus einer Policy zu löschen ist kein gültiger Disableweg. Die Detectfunktion verbindet deklarierte Sprachen mit Adapterdetect.

Die ausgelieferte `charts/kubeclaw/files/config/lint-policy.json` ist Policy v7 mit Projekt workspace (1–26); Beispiele für explizite required/tier/scope sind tsc (276–297), go-vet (319–343), eslint/full (441–473), hadolint/full (768–789). Das belegt Konfiguration, nicht Toolinstallation oder erfolgreichen Lauf. Die Stageconfig hat policyPath/policyProject als Pflicht und nur includeDebt/includeExperimental als weitere booleans (`lint/schemas/config.schema.json:4–10`); es gibt dort keinen Echo-/Test-/Lintskip-Schalter.

`engine/report.ts#applicableTools:162–168` filtert Tier, blocking/experimental und detect. Full schließt Pre-check-Tools ein, garantiert jedoch nicht jedes registrierte Tool unabhängig von Anwendbarkeit. `executeTools:176–183` führt die ausgewählten Tools sequenziell aus. `runTool:135–159` erkennt leeren geänderten Scope als not_applicable, prüft Binaryverfügbarkeit, ruft den wirklichen Adapter aus der Registry auf und normalisiert Findings. `engine/execution.ts#safeExec:83–113` verwendet native `execFileSync` mit Tooltimeout/Outputbudget, kein LLM und kein Mock.

Nichtanwendbarkeit ist von Toolfehler getrennt: fehlt ein optionales Binary, not_applicable; fehlt ein required Binary, error (`report.ts#missingBinaryResult:108–111`). Experimentalfindings zählen nicht als blocking; eingeschaltete experimentelle Toolausführungsfehler zählen aber weiter als tools_failed (113–128; tool-summary.ts 14–25). Baselinefindings werden von aktiven Counts abgezogen; includeDebt ändert die sichtbare Liste, nicht ihre Blockingwirkung.

#### 5. Report → Artefakt → Entscheidung

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

#### 6. Fachlicher Fehler → Forge → neuer Commit → erneutes Lint

Core `lifecycle/reducer.ts#requestFix:80–88` braucht on.request_fix und ausreichendes Attempt-/Remediationbudget. `run-decisions.ts#remediate:69–79` erzeugt durable repairRequest einschließlich ursprünglichem StageResult und Artefaktrefs. `lifecycle/remediation.ts#repairRequest:13–34` ermittelt betroffene Descendants; `applyRepair:38–51` invalidiert facts, waits und guidance der Folgeprüfungen und übergibt Forge neue repairRequest-Guidance. Alte Echo-/Testfreigaben werden bei diesem **normalen** Reparaturpfad nicht unverändert wiederverwendet.

`implementation-agent/src/repair-evidence.ts#repairEvidence:7–45` verlangt coreseitige Requeststruktur, korrektes Ziel, Requester/Runbindung, höchstens 32 JSONartefakte und insgesamt begrenzte Evidenz. Es liest jedes Reportartefakt mit Digest-/Größenprüfung und serialisiert Request+Evidence. `implementation-agent/src/stage.ts:23–30,78–83` übergibt diese Evidenz als Helfertext im tatsächlichen Forgepayload; dies fordert LLM-Reparatur, garantiert deren fachlichen Erfolg nicht. Ein Lintreport, der das Reparaturevidencebudget überschreitet, blockiert diesen Weg geschlossen; keine Kürzung mit stiller Beibehaltung einer vollständigen Evidenzbehauptung.

Nach Integration entsteht Implementierungsartefakt Attempt2/sourceRevision C2. `run-decisions.ts#completeRemediation:124–129` setzt Lint erneut pending. Der Source-Resolver selektiert C2, `withLintCandidate` checkt C2 aus. Ein zweites fachliches Ergebnis wird neu ausgewertet. Im Projectcompiler sind maxAttempts=2 und maxRemediationCycles=2 fest (compiler.ts 112); die zweite misslungene Lintbewertung erschöpft damit bereits das Attemptbudget, selbst wenn der deklarierte Remediationzähler nominal mehr suggeriert. Ein unmittelbarer Needs-Nova-Schritt ist hier nicht konfiguriert: orchestratorAfterAttempt fehlt. Terminaler Block benötigt eine ausdrückliche administrative Entscheidung; Details im Retry-/Resume-Trace.

#### 7. Abschluss mit und ohne optionale Prüfungen

Im Originalproject folgt nach bestandenem Lint immer Echo und anschließend Teststage (compiler.ts 122–131), danach nächstes Modul über previousGate (132). „Lint-only fertig“ wäre dort eine falsche Erfolgsmeldung.

Im expliziten Minimalgraphen ohne Echo/Test sind nach Implementation und Lint alle aktiven Ordinary-Stages succeeded; `core/execution/pipeline-loop.ts#finalize:137–143` schreibt run.succeeded. CLI gibt Run-/Stagezustände aus und Exit0 nur für succeeded (`core/cli.ts:69–74`). Keine Projectsummary, Anwendungsexposure oder Operator-Testumgebung entsteht aus diesem Minimalgraph automatisch. Dies ist ein Abschluss des konfigurierten Graphs, kein Funktions-/E2E-Nachweis der Anwendung.

Bei optionalen Graph-Activationbedingungen gilt: `pipeline-loop.ts#shouldSkip:105–108` prüft Object.is auf einem Vorgängerfact; bei Nichttreffer wird Stage skipped (110–115). Skipped zählt als completed (86–88). Wer Echo nur aktivierungsbedingt überspringt, muss den nachfolgenden Graphzustand bewusst definieren. Der Core fügt keine globale „Lint muss vor beliebigem Echo stehen“-Kante hinzu; im Projectcompiler besteht die richtige Kante explizit.

### Full-Lint versus Deliverylint

`skills/nova/plugins/delivery-lint/src/stage.ts#execute:104–146` konsumiert `{moduleId,dockerfile,staticPath}` (Schema 5–19). Bei dockerfile=null schreibt es sofort einen Passedreport. Sonst liest es eine Repositorydatei via git.repository.read und prüft mit COPY-Zielparser den statischen Pfad. Es startet weder tsc/ESLint/Hadolint noch die Full-Lintregistry; eine fehlende Dockerfile oder Zielabweichung fordert request_fix, ungültiger Pfad blocked. `copyDestinations:33–38` besitzt den vorhandenen **PCR-DELIVERY-001** für JSON-COPYsyntax. Diese schmale Lieferprüfung ersetzt keine allgemeine Source-Lintprüfung und ist ebenfalls kein Build-/Serve-/E2E-Test.

### Identität, Unterbrechungen und offene Runtimebeweise

Run/Stage/Attempt korrelieren Capabilityeffects; Sourceartefakte binden versioniertes Lint an den neuesten Forgecommit. Projektname im Report ist nicht allein die Identität: artifact.producer und Source-Revision bleiben wesentlich. Gleiche fachliche Lintartefakt-ID über Module/Attempts wird durch Producer/Digest unterschieden. Die Policy wird beim Lint geladen und ihr Digest berichtet; der Commitcandidate allein friert externe Toolchain-/Policydateien nicht für alle späteren Attempts ein.

Doppelte oder verspätete Ausführung unterliegt Corelease/Effectreceipts, doch native synchrone Tools begrenzen die tatsächliche Abbruchwirkung (PCR-LINT-002). Ein Crash vor Artefaktwrite kann Analysewiederholung erfordern; nach Attemptresult bleibt PCR-EXEC-002. Ein neuer Attempt ist nicht mit erneuter Ausführung desselben bereits receiptierten Effects gleichzusetzen. Abbruch/Resume der gesamten Pipeline und administrative Freigabe werden nicht als hier ausgeführt behauptet.

**Durchgeführt:** statische Aufrufer-/Empfänger-/Rückwegprüfung, Line-Reads von Compiler, CLI, SDK, Lintstage/Adapter/Candidate/Engine, Repair-/Implementationcode und Deliverylint; Policy-/Schemainhalte gelesen. **Tests nicht ausgeführt.** Inspektiert wurden `lint/tests/stage.unit.test.mjs:19–24` (unvollständige Reports ablehnen) und `lint/tests/adapter-boundary.test.mjs:44–72` (Rootablehnung, vorab abgebrochenes Signal, falsche Capability). Der Boundarytest nutzt handgebauten Context/Fence und prüft ausdrücklich keinen Abbruch während eines laufenden Tools. Kein Mock als E2Ebeweis gewertet.

Offen: echter Minimalgraph mit Originalforge und Toolchain; Lint-onlyabschluss bei aktivem/übersprungenem Echo; fachlicher Fehler mit zwei echten Gitrevisionen; passende tool-not-applicable-Policy samt klarer Coverageanzeige; native Timeout-/Abbruch-/Crashmatrix; physischer Artifact-/Effectstorefehler. Spätere Reihenfolge: Compileroptionalität klären, bestehende Forge-/Lint-Abbruchdefekte beheben, dann diese Varianten mit echten Tools und Git ausführen.

### T11 — Alle deterministischen Suitefamilien, Ausführung und Gateentscheidung ohne Testagent

Einzeltrace: [T11-deterministic-suites.md](T11-deterministic-suites.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Geprüfter Codecommit: **`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`**, Subagent `/root/trace04`. Status: statischer Trace abgeschlossen, Orchestratorvalidierung abgeschlossen (statisch). Keine Suite, kein CI-/Laufzeit-/E2E-Test ausgeführt. Ausschließlich dieses Reviewdokument geschrieben. Referenz: Komponentenreviews am Reviewcommit `a9e080ab1e1981ec5713e9b742f94280835fd347`; vorhandene PCR-Kennungen bleiben Eigentümer der Befunde.

### Ausgangszustand, Varianten und erste Bruchstellen

Ein kumulativer integrierter Gitcommit S soll über einen vollständig aufgelösten Providerplan geprüft werden. Scope ist `{moduleId:null,gateId:G}`; Vergleichsvariante `{moduleId:M,gateId:null}` nutzt dieselbe Ausführungsmaschine, aber andere stabile Testidentitäten. Im Plan sind alle für das Projekt tatsächlich anwendbaren Familien konkret deklariert, mit echten Command-/Build-/Manifest-/Endpointinputs, Reports und zulässigen Grants. Hauptvariante: `reviewAgent:null` überall, blocking für obligatorische Checks, Lighthouse-SEO/Best-Practices advisory, ausgewählte bedingte Checks mit explizitem Skipgrund. Alternative: alle obligatorischen Checks aktiviert; Fehler in Build, fehlende Inputs, leere/fehlerhafte Reports, fachliche Failure, Provider-/Transportfehler, späte/doppelte Antworten.

**Ohne Agent ist implementiert** über `skills/nova/core/test-gates/remote-gate-cli.ts:22–36` → `ProductionNovaTestGate.execute`. Dieses API liefert direkt verifizierte deterministische Entscheidung und StageResult; es ruft keinen Testagenten auf. Die `test.plan.execute`-Adaptergrenze ist zusätzlich implementiert (`skills/nova/plugins/remote-test-gate/src/adapter.ts#execute:63–93`). Der Projectcompiler verlangt dagegen `module.test.agent` und generiert quality-evaluation (`skills/nova/project/compiler.ts:81–89,127–131`). Daher ist agentlos hier eine alternative unterstützte Eintrittsfläche, kein Schalter im regulären Projectmodus. Die CLI allein integriert auch keine Forge-Reparaturschleife: sie liefert das Resultat an ihren Aufrufer und Exitcode 0 nur bei passed.

**Erste Bruchstelle einer bloßen „alle Suites auswählen“-Konfiguration:** Viele Templates enthalten absichtlich keine Nodes; andere benötigen projektspezifische Config, Endpoints oder Pflichtinputs. Auswahl ist keine Ausführung. `resolver.ts#draftNodes:352–390` erstellt nur tatsächlich enthaltene/ergänzte Nodes; kein Node → TEST_PLAN_EMPTY. Fehlende typed Inputs → TEST_PLAN_INPUT_REQUIRED (`connectGraph:668–669`), falsch deklarierte Fixture als Test → TEST_PLAN_PROVIDER_KIND_INVALID (`expandNodes:539–543`). Die folgenden Abschnitte setzen gültige konkrete Deklarationen voraus und verfolgen nach einem blockierenden Defekt die übrigen Familien bedingt weiter.

### Was „13 Suites“ am geprüften Stand bedeutet

`docs/architecture/pipeline-test-gate-suite-migration-status.json:3–17` zählt **13 historische Kategorien**. Der vollständige Sourcebaum enthält **12 aktuelle JSON-Suitetemplates** unter `contracts/pipeline-test-gate/v1/suites/`; Manifestprüfung ist in Nova-Lint aufgegangen. Das sind weder 13 feste Buster-Aufrufe noch 12 gleichartige Tests. Die Buster-Manifeste registrieren 18 Providerverträge (einschließlich zwei Fixtures und fünf Securityprovidern); JUnit ist zusätzlich ein Reportadapter. API enthält HTTP, API-Flow und OpenAPI. Unit kann Direct-Command und Coverage-Budget kombinieren.

Alle folgenden Providerpfade beginnen mit `skills/buster/plugins/`, Runtimepfade mit `skills/buster/engine/test-gates/`. Jeweils geprüft: Manifestregistration, tatsächlich exportiertes `provider().execute`, Capabilityaufruf bzw. lokale Auswertung und Rückgabe in den gemeinsamen Runner.

| Historische Kategorie | Aktuelles Template / konkret auszuführender Pfad | Daten, Gegenstelle, Auswertung und notwendige Bedingung |
|---|---|---|
| 1 Unit | `suites/unit.v1.json:1–9` leer; explizit `kubeclaw.direct-command@1`, optional `kubeclaw.coverage-budget@1` | `direct-command/src/provider.js#execute:132–202` → `command.execute` mit Katalogname, Literalargs, cwd, Limits → `direct-command-runtime.ts#DirectCommandCapabilityInvoker:65–124` → echter CommandRunner. Kopiert deklarierte JUnit-/LCOV-/Builddateien. Runner finalisiert JUnit erst nach Providerreturn (`runner.ts:1460–1531`). `coverage-budget/src/provider.js#execute:49–97` verifiziert LCOVdigest/-größe, zählt SF/DA und Quote; leeres LCOV wird abgewiesen (`parseLcov:8–41`). Blockingcoverage benötigt Mindestquote (`resolver.ts:566–569`). All-skipped-JUnit: PATH-T11-001. |
| 2 Manifest | **Kein Buster-Suitetemplate**; Nova `lint:kubernetes-policy` | `skills/nova/plugins/lint/src/engine/kubernetes-policy-tools.ts#kubernetesPolicyTool:91–115` registriert full-Tier, aktiviert bei konfigurierten policy_packs, liest Ressourcen, bewertet Regeln und gibt Errors/Warnings samt Quelldigests zurück. Wird nicht durch Buster-Templates automatisch ausgeführt. Für K8s wird zusätzlich ein typed `checked-manifest` benötigt; der Mediatyp allein beweist keinen vorausgegangenen Lint. |
| 3 Build | `suites/container-build.v1.json:1–9` leer; explizit `kubeclaw.container-build@1` | `container-build/src/provider.js#execute:96–148` → `container.build/build_push_verify`; `container-build-runtime.ts#ContainerBuildCapabilityInvoker:86–226` nutzt buildctl, danach Registrymanifest GET und Digestvergleich (`125–152`). Output immutable image/digest. Echter BuildKit und Registry nötig. Failure ohne required image kollidiert mit Runneroutputvertrag: PCR-CONTAINER-BUILD-001. |
| 4 Bundle | `suites/size-budget.v1.json:1–9` leer; explizit `kubeclaw.size-budget@1` | Direct-command liefert `build-output`-Artefakt; `size-budget/src/provider.js#execute:301–363`, `verifiedFile:102–135` verifizieren Digest/Bytes; Tar-/Gzipmessung ohne Extraktion, Maximalgröße-/Wachstums-/Dateiregeln. Blocking ohne Limit scheitert (`configuration:35–68`), Wachstum braucht Baseline (`314`). Neues Baselineoutput ist verpflichtend und persistierte Evidenz. Containerimage ist kein automatisch passendes build-output-Tar. |
| 5 K8s | `suites/kubernetes-fixture.v1.json:1–9` leer; **Fixture** `kubeclaw.kubernetes-fixture@1` | `kubernetes-fixture/src/provider.js#execute:105–131`: Image aus Config oder typed Buildoutput, required checked-manifest als verifiziertes Fileartifact (`67–76`) → `kubernetes.fixture/prepare`. `kubernetes-fixture-runtime.ts#KubernetesFixtureCapabilityInvoker:445ff.` provisioniert via kubectl/Controller und wartet auf Readiness. Liefert Deployment/Image; cleanup/release `provider.js:132–139` beachtet Retention über Runtime/Controller. Nicht automatisch ein fachlicher Test. |
| 6 Health | `suites/http.v1.json:1–9` leer; `kubeclaw.http@1` | `http/src/provider.js#execute:157–173` wählt genau ein Deployment/Endpoint oder Config-URL; `network.http/request` → `network-http-runtime.ts#NetworkHttpCapabilityInvoker:148–261`, tatsächliches fetch `231`. Status, Bodytext, Medientyp und Timing → 1 passed/failed Check. Verbindungs-/Requesttimeout kann fachliche Failure werden. Public-Endpointpfad mit Schema-default: PCR-HTTP-001. |
| 7 Tailscale Preview | `suites/tailscale-exposure.v1.json:1–7` leer; **Fixture** `kubeclaw.tailscale-exposure@1` | `tailscale-exposure/src/provider.js#execute:61–83` fordert typed Deployment, ruft `kubernetes.exposure/prepare`, prüft ok/url/hostname/Expiry, gibt public-endpoint-Fixture. Runtime `tailscale-exposure-runtime.ts#TailscaleExposureCapabilityInvoker:79ff.` benutzt echten kubectl/Controller; kein Browserzugriff als Bestandteil des Fixtures. HTTP/Browserknoten müssen explizit abhängen. Cleanup `provider.js:85–90`. PCR-TAILSCALE-001/002. |
| 8 API | `suites/api.v1.json:1–18`: HTTP, API-Flow, OpenAPI | HTTP wie oben. `api-flow/src/provider.js#execute:121–136` liest versionierte Flowdatei, sendet setup→steps→cleanup über HTTP/WebSocket (`128–129`), extrahiert Variablen, schreibt JSONreport; outcome aus Findings (`output:116–119`). Alle Hauptschritte wegen fehlender Variable übersprungen → PCR-APIFLOW-001. `openapi/src/provider.js#execute:188–247` liest JSON-OpenAPI3, operationId-/Tagauswahl, echte Requests und Responseassertions; leere Selektion wird abgewiesen (`200`), items:false nicht korrekt geprüft (PCR-OPENAPI-001); Policy-/Infrastrukturfehler als Fachfailure (PCR-OPENAPI-002). OpenAPI ist kein separates dreizehntes Template. |
| 9 A11y | `suites/a11y.v1.json:1–19`: `kubeclaw.axe@1` | `axe/src/provider.js#execute:69–114`: Route×Profil und Tags → browser.axe/scan; `browser-axe-runtime.ts:120–249` startet echten Playwrightbrowser und Axe. Violations/Passes, akzeptierte Violations, JSON-/Screenshotdateien → counts/findings. Incomplete-Axe-Ergebnisse sind nicht automatisch bestanden getestete Regeln; kein universeller Mindesttestzähler im Runner. Native Browserinstallation erforderlich. |
| 10 Perf | `suites/perf.v1.json:1–9`: dreimal `kubeclaw.lighthouse@1` | Performance blocking, SEO und best-practices advisory. `lighthouse/src/provider.js#execute:82–151` löst Settingsprofil/Budget, fordert mehrere Runs an, wählt repräsentativen Medianreport, bewertet Score/LCP/CLS/TBT; andere Kategorien prüfen Auditrefs und zeitlich gültige Acceptances. `browser-lighthouse-runtime.ts:159–240` startet Chrome und echte Lighthousebibliothek (`204,222`). Kein Agent und keine generelle mathematische Deterministik der Messwerte garantiert. |
| 11 Visual Regression | `suites/visual.v1.json:1–6`: `kubeclaw.visual@1` | `visual/src/provider.js#execute:126–185` validiert versioniertes Baseline-/Profilmanifest, Bilddigests, Targets; browser.visual/capture → compare(pixelmatch-v1). `browser-visual-runtime.ts:107ff.,193` startet echte Browser; Baseline/current/diff plus Report werden Evidence. Kein Baseline-Update. Browserfamilie/Viewport sind gebunden, Versionsbindung fehlt (PCR-VISUAL-001). |
| 12 E2E | `suites/e2e.v1.json:1–5`: `kubeclaw.playwright@1` | `playwright/src/provider.js#execute:61–92` ruft browser.playwright/run mit Projektconfig, Origin, Workerzahl und Ressourcen auf. `browser-playwright-runtime.ts:86–119` und weitere Methode führen echte CLI im Sandboxkontext aus. Reporter wird providerseitig ausgewertet (`assessPlaywrightReport:34–58`): zero tests werfen; blocking erzwingt mindestens einen ausgeführten Test, required titles müssen tatsächlich laufen; unexecuted → Failure. JSON/Attachments/E2E-details werden erneut vom Runner geprüft (`runner.ts:332–335`). Der Name E2E ist hier eine Suite, kein bereits ausgeführter Nachweis dieses Reviews. |
| 13 Security | `suites/security.v1.json:1–21`: fünf Provider | `security-providers/src/headers.js#execute:94–115` → network.http, Deployment erforderlich. `dependency.js:27–36` → security.scan/dependency auf Repository; `image.js:30–39` → image auf immutableImage; `kubernetes-policy.js:34–44` → kubernetes-policy auf checked-manifest; `kubernetes-runtime.js:40–56` → kubernetes.runtime-security auf Manifest+Deployment. `security-scan-runtime.ts#SecurityScanCapabilityInvoker:140ff.` startet Trivy via Prozessroutine `55`; Runtimeprovider prüft Controllerstatus. Strictpolicy, Ausnahmen und Findings teilen `common.js#result`. Leere Findings sind nicht gleich null ausgeführte Scans, Scanner-/DBversion und tatsächlich gescannte Ziele bleiben zusätzlicher Nachweisbedarf. Trivy/DB/Cluster müssen real verfügbar sein. |

Die Templatepfade in der Tabelle sind vollständig unter `contracts/pipeline-test-gate/v1/` zu lesen. Registrierung und Gegenstellen sind Implementierungsbelege; aufgezählte Programme wurden hier nicht gestartet.

### Übergänge, Revisionen, Persistenz und Rückweg

1. **Deklaration → Plan:** `skills/nova/core/test-gates/pipeline.ts#loadPipelineTestScope:12–50` liest `.swarm/pipeline.json`, wählt modules oder gates anhand genau eines Scope-IDs und extrahiert suites/tests/fixtures/concurrencyLimits. Keine automatische Modulanzahl-5/6-Regel. `resolver.ts#draftNodes:352–390` expandiert nur ausgewählte Templates, excluded Nodes verschwinden, Overrides/Additions werden validiert. `#expandNodes:534–607` pinnt Providerpaket, Konfigurationsschema, Reportadapter, Mode, reviewAgent, retryCount, Limits, Matrixidentitäten und Skipgrund; unsichere Retries benötigen explizites acceptUnsafeRetry.
2. **Typed Graph:** `resolver.ts#connectGraph:625–691` prüft Nodeexistenz, Kind, Pflichtports, Schema-/Mediatypkompatibilität und Zyklen. Typed Input erzeugt zwingend passed-Dependency. Konkret: build/image → deployment/image; checkedYaml/artifact-1 → deployment/checked-manifest; deployment/deployment → exposure/deployment; exposure/exposure → HTTP/Browser endpoint; Unit/coverage → Coveragebudget; Bundleartifact → Sizebudget; Image/Manifest/Deployment → Security. `direct-command/plugin.json` erlaubt checked-kubernetes-yaml am artifact-1-Port; spätere Artefaktports sind enger (PCR-DIRECT-COMMAND-001). Es gibt keinen automatischen Import von beliebigen Nova-Stageartefakten in diese Typed Links; benötigter Producer muss im Providerplan vorhanden sein.
3. **Plan einfrieren:** `resolver.ts#resolveTestPlan:718–749` prüft Run/Projekt/Plan/Scope, erzeugt planDigest über Nodes/Links/Suites/Registrydigest und friert alles. Modul- vs Gate-ID fließt in testIdentity ein (`578–579`); nicht die jeweilige Anzahl vergangener Module. Ein kumulativer Test hängt daher vom gewählten integrierten Sourcecommit und der Planabdeckung ab.
4. **Commit → signiertes Archive:** `production.ts#ProductionNovaTestGate.execute:61–74` erstellt Source, dann Remotejob. `source-snapshot.ts#buildCommittedSourceSnapshot:25–61` löst revision (CLI optional, sonst HEAD) auf konkreten Commit+Tree, `git archive` nur committed Bytes, SHA256+Größe, Ed25519-Attestierung über repositoryId/pipelineStageId/Revision/Tree/Archive. Der Pluginadapter verlangt explizite revision und bindet plan.runId an aktuellen Attempt (`remote-test-gate/src/adapter.ts:71–92`). Spätere Arbeitsbaumänderungen werden nicht in diese Archivbytes übernommen; uncommittete Änderungen sind folglich auch nicht geprüft.
5. **Persistieren → Transport:** `remote-dispatch.ts#createRemotePlanJob:38–57` bindet JobID an Idempotenzkey und requestDigest an Plan/Source/Archive/Grants/Concurrency. `FileNovaRemotePlanStore.persistBeforeDispatch:78–95` schreibt vor Submit. Dispatcher übernimmt Wiederkontakt/Status und prüft Job-/Requestzuordnung; HTTP bzw. SPIFFE/Bearer-Konfiguration ist Betriebsbedingung. Timeout-/Cancelgrenzen siehe PCR-NOVA-GATE-001/002, kein unbegrenzter Erfolg bei verlorenem Reply behauptet.
6. **Buster Admission → Ausführung:** `skills/buster/engine/test-gates/remote-plan-service.ts#preflight:95–116` prüft Archiv, Ed25519-Quelle, Job-/Plan-/Requestdigest; `#accept:126–164` persistiert accepted und dedupliziert identischen Intent, fremden Inhalt unter gleichem Key lehnt es ab. `#execute:589–610` setzt running und extrahiert begrenzt in Jobworkspace. `667–692` routet elf Capabilityklassen auf konkrete Invoker und startet TestPlanRunner mit Plan/Grants/Registry. Fehlende erlaubte Runtimekonfiguration liefert Fehler, kein leerer Scannerfolg.
7. **Plan → Node → Worker → Provider:** `runner.ts#assertPlanIdentity:233–265` bindet Registry und Provider-/Adapterversion/-digest. `run:758–898` verarbeitet Skip/Abort/Dependencyresultate, globale/namentliche Concurrency und tatsächliche Nodeausführung. Bedingter Skip erzeugt NodeResult ohne Attempt (`789–803`); abgelehnte Dependencies skippen ebenfalls (`827–848`). `#executeAttempt:1081–1159` erzeugt frische AttemptID und eigene Repositorykopie des extrahierten Snapshots; Config/Inputs/Grants/Limits werden ProviderInvocation. `1600–1614` ruft LocalWorkerRuntime/WorkerAttemptExecutor auf. Loader prüft Paketdigest vor/nach Kopie (`provider-loader.ts#verifiedSnapshot:51–78`) und importiert nur eingeschlossenes Modul (`42–48`). Kein LLM entscheidet, welches Binary tatsächlich läuft.
8. **Provider → Evidence → Reportadapter:** Tatsächliche Caller-/Empfänger je Familie stehen oben. Runner validiert providerResult-Schema, Countsumme, outcome/failed-Konsistenz, Evidence-/Reportdeklarationen (`runner.ts:1227–1255`, `validateCounts:324–330`, `validateProviderReports:356–367`). Outputports müssen registriert und erforderliche Outputs vorhanden sein (`493–535`). Ausgewählte Evidence wird gestaged; Output-/Reportartefakte erzwingen Aufbewahrung ihrer Referenzen. JUnitadapter wird isoliert ausgeführt und Originalreport digestgebunden gelesen; Direct-command finalisiert Command- und Reportdisposition (`1460–1531`). Diese nachgelagerte Prüfung ist notwendig: Exit0 allein ist im junit-required-Modus kein Erfolg.
9. **Retry und Cleanup:** `runner.ts#executeNode:1024–1077` erlaubt retryCount+1 Attempts; nur finaler Attempt bestimmt Nodeergebnis. Abbruch/fehlgeschlagenes Cleanup stoppt Wiederholung. Erfolgreiche Fixtures bleiben bis zum Ende des Planlaufs für Konsumenten erhalten; `run:898` führt `#cleanupFixtures` aus, deren Fehler in Ergebnis eingehen (`2005ff.`). Das Release kann Retention anstoßen; Erhalt des Testnamespaces für Operator ist eine getrennte konfigurierte Controllersemantik (T14), nicht automatisch aus „Fixture passed“ abzuleiten.
10. **Busterabschluss → Novaimport:** `remote-plan-service.ts:698–713` baut RemoteResult mit workerRevision, Job/Plan/Run, Attempts, Nodes, Cleanupfehlern, Digest und Receipt; persistiert terminal. `skills/nova/core/test-gates/remote-result-import.ts#verifyCompletedResult:100–161` prüft Job/Plan/Run, vollständige Nodemen­ge, Provider-/Scope-/Suite-/Execution-/Testidentität, Attemptkontiguität, Budget, finale Attemptzuordnung und Digests. `NovaRemoteGateImporter.import:285–314` liest Result und sämtliche Evidencebytes, prüft Größe/Digest, persistiert pending_evidence→complete (`FileNovaGateImportStore:238–268`). Derselbe importierte Stand kann als Testexecutiongraph inklusive sourceRevision gelesen werden (`26–70,218–223`).
11. **Deterministische Entscheidung → Aufrufer:** `remote-result-import.ts#decide:169–208`: skipped bleibt skipped; Execution-/Cleanupfehler → execution_error; fachliche Failure bei advisory → advisory_failure, bei blocking → failed. reviewAgent gesetzt kann review_required erzeugen, hier ist er null. Priorität execution_error→review_required→failed→passed. `contracts/pipeline-test-gate/v1/src/gate-decision.ts#gateDecisionStageResult:36–46` macht daraus passed, request_fix, blocked oder cancelled. `NovaRemoteTestGate.execute:329–334` gibt status/decision/stageResult zurück. Ohne Agent stoppt der Trace hier bei einer vollständigen evidenzgebundenen deterministischen Entscheidung; weitere Pipeline-Schritte muss der Aufrufer einbinden.

### Findings, Unterschiede zu gewünschten Garantien und bekannte Defekte

#### Bestehende Findings mit konkreter Wirkung in diesem Trace

| Kennung | Auslöser → Auswirkung im Pfad; Codebelege am Baselinecommit | Ursachenbehebung und nächste Verifikation |
|---|---|---|
| PCR-APIFLOW-001, hoch | Fehlende Hauptschrittvariable → alle skipped, outcome passed ohne Requests; `api-flow/src/provider.js:116–135` → Runner validateCounts → Nova decide. | Erforderliche Ausführung/Schritte erzwingen; Originalflow und lokaler Kontaktzähler, dann vollständiger Runnerimport. |
| PCR-OPENAPI-001, hoch | Schemaitems=false wird per truthiness übersprungen (`openapi/src/provider.js:94–103`); verbotene nichtleere Response kann Gate bestehen. | Boolean-Subschemas konsistent prüfen; echte HTTPantworten für false/true/Object an allen Kindpositionen. |
| PCR-OPENAPI-002, mittel | Policy-/Timeout-/Operatorfehler in breitem catch werden Fachfailed (`openapi/src/provider.js:244–247`, API-flow `133`); Gate request_fix statt execution_error. | Capabilityfehlertaxonomie durchreichen; echte verweigerte Origin/Abort/Responsegrenze, kein Kontakt bei Policydeny. |
| PCR-CONTAINER-BUILD-001, mittel | Provider failed ohne image (`container-build/src/provider.js:125–147`) → required output im Runner `493–535` → errored/blocked statt Reparaturrequest. | Outputpflicht erfolgsabhängig modellieren; echter fehlgeschlagener Build, dann erfolgreicher Build ohne Image als Negativfall. |
| PCR-CONTAINER-BUILD-002, mittel | buildctl-Timeout deckt Registryverify nicht (`container-build-runtime.ts:125–152,207–217`). | Gemeinsame absolute Deadline; echte verzögerte Registryantwort und Abort-/Cleanupnachweis. |
| PCR-DIRECT-COMMAND-001, mittel | Config erlaubt Mediatyp, artifact-2ff. erlauben ihn nicht; `direct-command/plugin.json` vs `src/provider.js:47–53,184–191`. | Gemeinsamer Portvertrag; gleiche typed Ausgabe an erstem/zweitem Port über Resolver/Runner prüfen. |
| PCR-HTTP-001, mittel | Schema-default überschreibt Publicendpointpfad; `http/src/provider.js#configuration:72–112` und Configschema. | Defaults und „nicht angegeben“ unterscheiden; realer Endpoint mit Pfad, Kontaktpfad überprüfen. |
| PCR-TAILSCALE-001/002 | Standardport ohne explizite URLportzahl wird abgewiesen; veraltete Exposuregeneration kann Ready/Cleanup beeinflussen. `tailscale-exposure/src/provider.js#deploymentInput:23–53`, Runtime `#prepare/#release`. | Kanonische effektive Ports und Generationbindungsprüfung; echter Readiness-/Wechsel-/Releasepfad. |
| PCR-VISUAL-001, mittel | Baseline hält Familie/Profil statt Browserversion; `visual/src/provider.js:77–108,147–151`. | Renderer-/Browserversion an Baseline binden; alter/neuer echter Browser mit unverändertem Baselinevertrag. |
| PCR-BUSTER-ENGINE-001/002/003 | Parentcapabilitykosten fehlen im Attemptbudget; Reportadapterstdin-EPIPE oder verspätete Capabilityrejection können Hostprozess betreffen. `runner.ts:1600ff.`, `report-adapter-runtime.ts:376–393`, `provider-loader.ts` Capability-Rückweg. | Gemeinsame Budget-/Prozessabschlussgrenze und vollständige Streamfehlerbehandlung; echte Prozesse, große XMLstdin und kontrollierter früher Exit. |
| PCR-KUBERNETES-FIXTURE-001/002 | YAMLaliasexpansion vor Ressourcenbudget bzw. stdinpipe ohne Fehlerhandler; Manifest/Controllerteil kann vor typisiertem Result scheitern. | Parsingbudget vor Expansion, gemeinsamer Prozesssupervisor; echtes bounded Manifest und frühes kubectl-Ende. |
| PCR-NOVA-GATE-001/002 | Verlorenes Submit + Timeout kann Busterjob weiterlaufen lassen; Importzeit liegt außerhalb Dispatcherbudget (`remote-result-import.ts:329–334`). | Durchgehende Deadline und idempotenter Cancel unbekannt angenommener Jobs; echter Server mit verlorener Antwort und langsamer Evidenceübertragung. |

Dies sind Querverweise, keine neu ausgeführten Reproduktionen. Schweregrade und weitere Einzelbelege verbleiben in den vorhandenen Komponentenreports. PCR-NOVA-GATE-003/004/005 und PCR-BUSTER-ENGINE-004 bleiben zusätzliche Betriebs-/Test-/Retentiongrenzen der gleichen Route; keine Erfolgsaussage trotz dieser offenen Findings.

### Nachweise, Grenzen und nächster Verifikationsbedarf

Ausgeführt: Quellbauminventur, Lesen der zwölf Templates und Manifeste, nummerierte Inspektion der tatsächlichen Providerimplementierungen, gemeinsamer Resolver/Runner/Source-/Remote-/Import-/Gatepfad, Abgleich mit vorhandenen Komponentenreviews. **Keine Testprogramme ausgeführt.** Tests lesen oder aus einem Review zitieren ersetzt kein Ausführen.

Gelesene vorhandene Testabschnitte, sämtlich **NOT RUN**:

- `tests/verification/contracts/check-pipeline-test-suite-resolver.mts:243–303,315–320,436–456,505–507`: genaue Nodes/Suites, Exclusions, Matrix, deterministische Plan-/Scopeidentität, Tiefenfreeze, Skipbedingungen, explizite Auswahl, Unsafe-Retry und negative Configs. Synthetische Beispielprovider; kein all-builtins-Lauf.
- `tests/verification/contracts/check-pipeline-test-plan-runner.mts:432–471,534–598`: Provider-skip, akzeptierte Ergebnisfilter, keine Ausführung bedingter Nodes, Parallelität und Gruppenlimit, echte Runnerauswertung mit eingesetztem Loader; kein vollständiger Browser-/Build-/Clusterbeweis.
- `tests/verification/contracts/check-pipeline-junit-report-adapter.mts:29–67`: Registryadapter, Artefaktquelle, echte Adaptierung, zwei Cases mit einem Failure; deckt weder ausschließlich skipped Cases noch Nova-Gateentscheidung ab. Historischer Komponentenreview meldete für diesen Prozesspfad EPIPE; hier nicht erneut gestartet.

Fortsetzung nach Defekten bleibt bedingt: vorgegebenes Image/Artifact und verfügbare BuildKit-/Kubernetes-/Tailscale-/Browser-/Trivy-Infrastruktur werden nur als Voraussetzungen verwendet, nicht als vorhandene oder getestete Ressourcen behauptet. Jeder Browser-/Healthcheck mit expliziter externer URL prüft dieses Ziel; Sourcecommitbindung der Testskripte beweist nicht automatisch, dass das extern betriebene Ziel aus demselben Commit gebaut wurde. Der typed Build→Deploymentpfad verbessert die Imagebindung, benötigt für externe URLs einen zusätzlichen Deployment-/Imagebeleg.

Ergebnis: Die 13 historischen Funktionskategorien sind auf aktuelle Implementierungen abgebildet und alle gemeinsamen Übergaben bis zur deterministischen Novaentscheidung statisch verfolgt. **Kein vollständiger Satz von 13 bestandenen Laufzeitsuites liegt vor.** Priorität späterer Ursachenbehebung: Ausführungsabdeckung gegen falsches Grün (PATH-T11-001/PCR-APIFLOW-001/PCR-OPENAPI-001) → stabile Failure-/Error-/Outputverträge → Deadlines/Crash-/Prozessgrenzen → realer kompletter Build/Fixture/Exposure/Test/Evidenceimport am identischen Commit.

### T12 — Native Testentscheidung und nachgelagerter Test-Agent

Einzeltrace: [T12-test-agent.md](T12-test-agent.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Status: statischer Trace abgeschlossen, Orchestrator-Gegenprüfung abgeschlossen (statisch). Codebaseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Sämtliche Quellen-/Zeilenbelege unten gehören zu diesem Commit. Bestehendes Komponentenreview: `docs/review/components/kubeclaw.buster-quality-gate.md` am Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`, außerdem das dortige zentrale PCR-Register und bereits im T05 geprüfte Implementation-/Lifecycleberichte. Historische Testergebnisse werden nicht als Ergebnisse dieses Traces übernommen.

### Auftrag, Voraussetzungen und Endzustände

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

### Exakte Codebelege

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

### Übergangsfolge vom Caller bis zum Ergebnis

#### Native Autorität und Identitäten

1. Der Projectcompiler erzeugt pro Modul `test-m` nach `review-m`, `config.agent=module.test.agent`, `input.gateId=test-m` und Providerplan mit `sourceStageId=implement-m`. Zuvor fordert er `plan.scope.moduleId=m, gateId=null`, Plan-Run/Projekt/Digest und mindestens einen blockierenden Test. Somit ist das Wort Gate in Quality-IDs **keine Aussage über kumulative Testabdeckung** (Q17).
2. StageExecutor bindet Ausführung an `runId`, `stageId`, UUID-attemptId und monotonen attemptNumber, mit Lease und Capabilitygrants. Der Qualitystage erhält die Agentkonfiguration und verweigert fehlenden/leeren Agent bereits vor Planaufruf. `providerPlan` ist ebenfalls Pflicht (Q1/Q2/Q13). Im Payloadinput sind frühere `runId`, `attempt`, `suiteEvidence` oder `suitePlan` nicht als alternative Autorität erlaubt; das Inputschema ist geschlossen.
3. Q5 wählt die höchste gültige Implementationattemptnummer im aktuellen Run/Source-Stage und verifiziert JSONdigest/Bytes/Status/SHA; alternativ ist in einem expliziten Graph eine feste `revision` zulässig. Beide Selektoren zugleich sind ungültig. Die Revision R wird in `test.plan.execute` geschrieben. Der registrierte Remoteprovider prüft Plan/Run/Roots/Grants, baut den committed Snapshot und Remotejob für R (Q2/Q5/Q6).
4. Die Buster-Rückgabe wird vor Qualityagentverwendung importiert: Status/jobId/requestDigest, resultDigest und Job/Plan/Run müssen passen; Knoten, finaler Attempt, Provider, Modul-/Gatescope und Suiteidentitäten werden mit dem Plan verglichen. Remote-Evidence wird mit Größe/Digest importiert und pending_evidence→complete persistiert (Q7). Eine digestgültige allein vom Modell erfundene Liste ersetzt diesen Provideraufruf nicht.
5. `parseGateDecision` prüft geschlossene Top-Level-Form, Knoten, Reviewrequests, Decisiondigest und Widersprüche eines passed-Zustands; ein fremder Run wird zusätzlich im Qualitystage abgewiesen (Q2/Q4). Die allgemeine Decision enthält kein direktes Source-Revisionfeld. Die Revisionautorität folgt hier aus dem in Q6/Q7 erzeugten und verifizierten Job und der Runtimecapability; der Digest allein beweist weder Herkunft noch Source. Q2 vergleicht nicht separat erwartete planId/jobId, sondern vertraut der ausgewählten Produktionscapability. Ein böswilliger Ersatzprovider wäre ein anderer Vertrauensfall, kein nachgewiesener normaler Busterpfad.
6. Quality schreibt zuerst `buster-quality:<gateId>:decision:<attemptNumber>` im Namespace `kubeclaw.buster-quality-gate`. Erst danach wird branchiert. `failed` ergibt request_fix mit failedNodes/decisionDigest; `execution_error` und `review_required` ergeben blocked; cancelled bleibt cancelled. **Alle diese Fälle kehren ohne Runtimeagentaufruf zurück** (Q2/Q4). Der Agent kann native Fehler nicht überschreiben.

#### Agentinput, Transport und Rückgabe

7. Nur native passed erreicht `judgedInput={gateId,task,runId,attempt,suiteEvidence}`. `gateDecisionEvidence` erzeugt einen Summaryeintrag mit Decisiondigest und pro Knoten `{suite:nodeId,passed,summary}`. `advisory_failure` und `skipped` werden als **nichtblockierend** in `passed:true` übersetzt; das ist kein Nachweis, dass diese Einzeltests tatsächlich bestanden oder überhaupt liefen (Q2/Q4).
8. `buildRequest` sendet exakt `protocol=kubeclaw.buster-quality-gate.v2`, Agent, Identität `{runId,gateId,attempt}`, Task, suiteEvidence, allowedOutcomes/failureClasses und geschlossenen Outputcontract. Source-SHA, Snapshotmount, konkrete Testartefaktrefs und vollständige Logs werden nicht in den Agentpayload aufgenommen. Der Decisiondigest steht nur im Summarytext. Der Agent bewertet diese Kurzbelege; zusätzliche Testhandlungen wären LLM-/Toolverhalten außerhalb dieses technisch erzwungenen Stagevertrags (Q3).
9. Plattformwahl: Runtimecapability hat im Manifest zwei Implementierungen, `runtime` (HTTPworker) und `openclaw`. Der Qualitystage wählt nicht selbst eine davon; er verlangt nur den autorisierten Agentnamen. Dieser Trace verfolgt den produktionsfähigen OpenClaw-Adapter und vermerkt die HTTPalternative. Ein tatsächlich gestarteter Cluster mit konkreter Plattformkonfiguration wurde nicht beobachtet (Q8/Q12).
10. OpenClaw erhält eine durch Coreeffekte korrelierte Dispatch-ID. Daraus und aus der Payload wird ein stabiler Transport-/Payloadhash abgeleitet. Resultdatei liegt unter konfiguriertem Resultpräfix und Repositoryroot, innerhalb target.cwd. `spawnSession` verwendet Label mit Rolle/Modul-oder-Gate-ID und Dispatchhash, prüft vorhandene Sessionregistrierung und spawnt andernfalls mit `cwd=target.cwd`, Modell, Thinking und optionalem Collector-Outputschema. Es setzt **keinen Sourcecheckout R** für Agenttests (Q9).
11. Token wird über vertrauliche Secret-/HTTPfähigkeit aufgelöst; es wird nicht als Reviewinhalt übernommen. Gateway spricht `sessions_spawn`, anschließend Collector `agents_wait` oder Sessionstatus; Zuordnung folgt Session-/Run-/Taskidentitäten. Fehlender oder mehrdeutiger registrierter Run/Sessionkey, abweichendes Modell und ungültiger Spawnstatus werden abgewiesen (Q9/Q10). Diese Runtime-Run-ID ist eine Session-ID der Gegenstelle, nicht mit dem Pipeline-runId gleichzusetzen.
12. Nach erfolgreichem Sessionabschluss liest die Runtime das dauerhafte Resultat, alternativ lokal Collectorstructured/Result oder genau eine terminale Assistantantwort aus der Sessionhistorie. Sie prüft JSON-/Ausgabebudget und schreibt Resultdaten unter deterministischem Pfad. Ein nichtterminaler, fehlender, mehrdeutiger oder nicht als JSON interpretierbarer Output erzeugt Fehler (Q9/Q11). Nicht jede fehlende Resultdatei blockiert sofort: gültiger Collectoroutput kann die Datei erst erzeugen.
13. `parseVerdict` akzeptiert nur `{outcome,summary,failureClass,findings}`. Keine vom Agenten frei gesetzte runId, gateId, attempt, identity, sourceRevision, decisionDigest oder session ist erlaubt. Die aktuellen Run/Gate/Attemptwerte werden danach aus `judgedInput` angehängt. Summary und Findings sind begrenzt. passed verlangt failureClass=none, leere Findings und keine übergebene failed-Suite; jedes Nichtpass verlangt eine Fehlerklasse ungleich none und mindestens ein Finding. Fehler im Parsing ergeben `buster_quality.invalid_verdict`, blocked und **die bereits gespeicherte native Decision** als Artefakt (Q2/Q3).
14. Ein gültiger Verdict wird als `buster-quality:<gateId>:<attemptNumber>` gespeichert, mit `verdict`, `sourceRevision=R`, `decisionDigest` und suiteEvidence. Native passed + Agentpassed gibt das native passed-Result einschließlich test_gate.decision_digest zurück. Agentblocked oder request_fix verwendet entsprechend dieses Outcome und `reason.code=buster_quality.<failureClass>` (Q2).

#### Rückweg, Reparatur und Abschluss

15. Bei Agent-request_fix schreibt Core den RepairRequest mit beiden Qualityartefakten und Reason, invalidiert transitiv vorherige Lint-/Review-/Testfreigaben und setzt Forge pending mit geprüfter Repairguidance (Q16/Q18). Forge erhält hier gegenüber nativem Testfailed zusätzlich Agentfindings, aber weiterhin nicht automatisch die vollständigen nativen Logs. Der Real-Worktree-/Mergepfad und dessen erste Bruchstelle sind in [T05](T05-module-repairs.md) vollständig verfolgt.
16. Bedingt bei erfolgreicher Reparatur erzeugt Forge R2. Pflichtlint prüft R2, Echo den ursprünglichen Modulbase→R2-Diff, Quality startet erneut mit R2. Native Planprüfung und Agentbewertung müssen erneut stattfinden; ein früheres Agentpass verleiht R2 keine Freigabe. Ein einzelner solcher Repairzyklus ist unter Compilerbudgets möglich, sofern bisherige Versuche erfolgreich und nicht verbraucht sind. Weitere Reparaturen stoßen an **PTR-T05-001**; falsche Behauptung „zwei freie Reparaturzyklen“ vermeiden (Q5/Q16/Q17).
17. Im **Projectcompiler** endet nach der letzten Modul-Qualitystage der definierte Graph. Er erzeugt keine project-summary-Stage, keinen automatischen finalen kumulativen Qualityplan und keine Operatorabnahme (Q17). Bei allen succeeded endet der Corelauf entsprechend; Runtimeerfolg wurde hier nicht getestet.
18. Ein **expliziter Graph mit project-summary** kann anschließend Q19 aufrufen. Summary bekommt Module-/Final-Stagebindings. Es wählt pro Stage/Namespace die höchste Artefaktattemptnummer; Decision und Verdict werden aus **diesem selben neuesten Attempt** verlangt, JSONmediatyp/Digest/Bytes geprüft, Gesamtbudget 8 MiB. Ein neuer Decision-only-Attempt kann somit nicht durch den Verdict eines älteren Attempts ergänzt werden.
19. Pro Modul und Finalbindung muss die Quality-sourceRevision der aktuellen Implementationrevision entsprechen; native Decision und Verdict müssen passed sein, Run und Decisiondigest müssen passen. Finaler Lintreport und Reviewreport müssen denselben Head haben und erfolgreich sein. Erst danach persistiert die Stage `project-summary:<runId>` als Deliverymanifest mit Source, Modulen, Finalbindung und Evidence. Jeder fehlende/mehrdeutige/korrupte Beleg oder R≠R2 ergibt `project_summary.invalid_evidence` → blocked (Q19).
20. Summaryinput darf jedoch Final- und Modul-Teststage identisch belegen; es prüft keine kumulative Planscopeautorität. Das ist schon im Originaltest der Fall. Ein Summary beweist damit **übereinstimmende gebundene Belege**, nicht automatisch ein zusätzlich ausgeführtes kumulatives Gate. Eigener Befundbesitz/Abdeckung dieser Finalgategrenze liegt bei **PATH-T13-001** in T13; hier keine Dublette.

### Varianten und wichtige Gegenbeispiele

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

### Sessionevidenz, späte Antworten, Timeouts und Persistenz

Das produktive Qualityprotokoll heißt `kubeclaw.buster-quality-gate.v2`. `attachRuntimeEvidence` kennt hingegen neben Implementation einen Zweig für **`kubeclaw.buster-test-judgment.v2`**. Dieser Zweig greift hier nicht. Der Qualityparser würde ein zusätzliches session-Feld ohnehin zurückweisen. OpenClaw prüft Sessionabschluss/Modell und erstellt beim Import interne RuntimeSessionEvidence; Qualitypersistenz übernimmt weder diese Sessiondaten noch die zurückgegebene `runtimeEvidence`-Attestation. Das ist eine konkrete **Auditgrenze**, kein Beweis fehlender Sessionprüfung und kein automatisch fehlgeschlagener Handoff. Das bestehende Komponentenreview nennt im Vertragsteil den alten Protokollnamen; für diesen Trace hat Originalcode Vorrang (Q3/Q9/Q11).

Für die generische HTTPworker-Runtime wird die Payload signiert an den konfigurierten Endpoint gesendet; die Antwort muss JSON/HTTP-/Größengrenzen erfüllen. Dieser Adapter führt keine eigenständige OpenClawsessionprüfung durch. Der konfigurierte Endpoint ist die vertrauenswürdige ausführende Gegenstelle. Ein vom HTTPworker einfach gesetztes passed wird nur semantisch durch den Qualityparser begrenzt, nicht durch eine zusätzliche Sessionevidenzpflicht (Q12). Daraus folgt keine Gleichwertigkeit mit tatsächlich ausgeführten Agenttests.

Corejournal und externe Effekte sind getrennte Persistenzgrenzen. DurableInvocation prüft bestehende Idempotencyrequests/Receipts, persistiert requested/accepted/completed und fordert bei angenommenem Effekt ohne Receipt die Adapter-Recoveryfunktion. Der Dispatchadapter implementiert keinen allgemeinen receipt-Recoveryhook. Eine fehlgeschlagene Runtimeeffectreceipt wird von AdapterRuntime als `EFFECT_OUTCOME_UNRESOLVED` weitergegeben; StageExecutor macht daraus blocked/Reconciliation, **keinen naiven automatischen Agentretry** (Q14/Q15).

Ein OpenClaw-Sessiontimeout vor dem Coredeadline ist ein Runtimeadapterfehler und landet damit regelmäßig in der Reconciliationdisposition. Der unabhängige Coretimeout kann zuerst gewinnen: Promise.race liefert timed_out, der Reducer failed; Elternabbruch ergibt cancelled. Bei einer zu spät beantworteten Sessionanforderung versucht OpenClaw Cancellation. Nach Revocation sind weitere Plugin-Capabilityaufrufe untersagt. Cancellation ist best effort; **PCR-RUNTIME-001** bleibt relevant, und ein Coreabbruch beweist keinen tatsächlich beendeten externen Agentprozess (Q9/Q10/Q13/Q14).

Die native Decision wird vor Agentdispatch als Artefakt geschrieben. Bei **ungültigem empfangenem Verdict** kehrt sie ausdrücklich im StageResult zurück. Bei **geworfener Runtimeexception/Timeout** übernimmt der Core ein Fehlerresultat mit leeren Resultartefakten; die bereits geschriebene Decision hat `checkpoint:true` nicht gesetzt. Sie kann physisch bzw. im Effektjournal vorhanden sein, ist aber nicht automatisch als aktive Resultartefaktprojektion erhalten. Diese Unterscheidung folgt aus Q2 19–24/31–39 und Q13 34–49/124–135. Crash nach erfolgreichem Attemptresultat vor Artefaktprojektion ist der bereits bekannte **PCR-EXEC-002**. „Native Decision immer sicher als Resultartefakt vorhanden“ wäre daher zu weitgehend.

### Ohne Test-Agent und Abgrenzung der Gates

`remote-gate-cli.ts` lädt dieselbe ProductionNovaTestGate und führt den Plan direkt aus; es druckt das native Ergebnis und setzt Exitcode anhand native stageResult, **ohne** Quality-Runtimeagent (Q20). T11 beschreibt die breitere No-agent-/Suitevariante. Das ist keine Möglichkeit, bei `kubeclaw.test.quality-evaluation` einfach agent wegzulassen: Q2 prüft es vor Planexecution, Q17 verlangt es beim Compilieren. Ebenso erwartet der aktuelle Summaryconsumer Artefakte des Qualitystages einschließlich Verdict; er kann ein allein natives CLI-Ergebnis nicht unverändert als vollständigen Qualityabschluss konsumieren.

Im Projectmodus ist `input.gateId=test-m` eine Stage-/Artefaktkennzeichnung, während der Remoteplan moduleId=m/gateId=null trägt. In einem expliziten Graph kann ein echter kumulativer Plan gateId≠null/moduleId=null verwendet werden. Der Qualityagent bekommt die InputgateId, nicht separat diesen Plan-Scope; die strukturelle Zuordnung folgt dem konfigurierten Stageaufruf. Es wird keine von Agenttext erzwungene Modul-/Gatekorrektheit behauptet. Die Testplan-/Remoteimportseite bindet den fachlichen Scope technisch (Q6/Q7), Summary selbst verifiziert ihn nicht (Q19).

### Findings, Nachweise und spätere Verifikation

Keine neue unabhängige bestätigte Defektkennung wird für diesen Trace beansprucht. Querverweise bleiben **PCR-IMPLEMENTATION-001**, **PTR-T05-001**, **PCR-RUNTIME-001**, **PCR-EXEC-002** und **PATH-T13-001**. Ergänzte Zielbild-/Auditgrenzen sind: Agent bewertet Kurzbelege statt technisch erzwungener zusätzlicher Anwendungstests; Session-/Runtimeattestation fehlt im Qualityartefakt; failureClass setzt keine separate Dispositionspolicy; Summary erzwingt kein zusätzliches kumulatives Gate. Die Finalgategrenze wird bei T13 konsolidiert.

**Ausgeführt:** ausschließlich statische Originalcode-/Gegenstellenprüfung, Plan-/Modul-/Gate-/Attempt-/Revisionstracing und Lesen der folgenden Tests. Keine Tests, CI, Deployments, Gitmutationen oder Agent-/Providerläufe ausgeführt. Ausschließlich diese zugewiesene Reviewdatei geschrieben.

| Gelesener Test — NOT RUN | Relevante Zeilen | Tatsächliche Aussagegrenze |
|---|---|---|
| `skills/nova/plugins/buster-quality-gate/tests/protocol.test.ts` | 12–27 | Builder/Parser, Widersprüche und ausgewählte Fehlerklassen; kein Agent oder Provider |
| `skills/nova/plugins/buster-quality-gate/tests/suite-first.test.ts` | 8–20 | Inputschema lehnt erfundene caller-Suiteevidenz ab; keine tatsächliche suite-first Ausführung |
| `skills/nova/plugins/project-summary/tests/summary.test.mjs` | 9,26–47 | Echter Artefaktadapter, feste Reports, Source-/Corrupt-/Runfälle; ausdrücklich providerExecution=false/agentExecution=false |
| `tests/verification/reliability/lifecycle.test.mts` | 17–20,31–58 | Reparaturinvalidierung im echten Recorder/Journal mit festen Resultaten; Budget 8, nicht Compilerbudget 2 |

Empfohlene Ursachenbehebungs-/Verifikationsfolge: zuerst Workspace- und Repairbudgetgrenzen aus T05; danach einen realen nativen passed-Plan mit echtem OpenClaw-Agentpassed und gebundenen Artefakten für R ausführen, native failed bei garantiert null Agentrequests nachweisen, malformed/blocked/request_fix und reale Timeout-/Crashfenster prüfen. Falls zusätzliche Agent-Anwendungstests gewünscht sind, müssen Source-/Endpoint-/Evidencezugriff, Testauftrag und Resultautorität ausdrücklich implementiert und verifiziert werden. Falls Qualityaudit eine Sessionherkunft benötigt, diese über Runtimeautorität als begrenzte unveränderliche Referenz speichern, nicht vom Modell behaupten lassen. Erst ein solcher Lauf könnte die hier ausschließlich statisch nachvollzogenen Endzustände als Laufzeitnachweis bestätigen.

### T13 — Kumulative Test-/Reviewgates, Altmodulreparatur und erneute Freigabe

Einzeltrace: [T13-cumulative-gates.md](T13-cumulative-gates.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Stand, Ausgangslage und Ergebnis

Codecommit für alle Belege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. **Ausschließlich statische Codeprüfung; keine ausgeführten Tests, Gitmutationen, CI oder Deployments.** Dieser Bericht weist keine funktionierende Gesamtpipeline nach.

Szenario: Module M1–M5 wurden bedingt erfolgreich auf H0→H1→…→H5 integriert; kumulatives Testgate TG5 und Reviewgate RG5 sollen alle bisher integrierten Anforderungen U1∪…∪U5 einschließlich Modulinteraktionen auf H5 prüfen. Erst danach beginnt M6. Alternativ findet TG5/RG5 einen Fehler in M2, Forge repariert M2 auf dem bereits integrierten Stand, nachgelagerte Module/Prüfungen und Gates werden erneut beurteilt. Varianten: falsch als kumulativ beschrifteter letzter Modultest, verspätetes H5-Ergebnis nach Reparatur, administrative statt normale Nachbesserung und abschließende Summary.

**Ergebnis: korrekt zusammengesetzter expliziter Graph unterstützt die einzelnen Mechanismen; kumulative Vollständigkeit wird nicht als Produktinvariante erzwungen (PATH-T13-001).** Projectmodus enthält keinen TG5/RG5-Anschluss: erste Bruchstelle dort ist `T01-F02`, nicht ein Fehler des vorhandenen Gateproviders. Für den weiteren Trace wird ein korrekt autorisierter expliziter Graph mit TG5/RG5, passendem Plan und ausreichend Retrybudgets angenommen. Bekannte vorgelagerte Implementierungs-/Workerblocker werden dadurch nicht als behoben behauptet. Der normale request_fix-Pfad invalidiert transitive Nachfolger; administrative Remediation weist die bereits kanonische Lücke `PATH-T04-003` auf.

### Was ein kumulativer Prüfgegenstand konkret benötigt

| Gegenstand | Modulprüfung M5 | Kumulative Prüfung nach M5 |
|---|---|---|
| Codequelle | Implementierter H5 enthält zwar integrierten Vorgängercode, Aufgabe/Tests können nur M5 betreffen. | Ein unveränderlicher Snapshot des gesamten H5, einschließlich M1–M5. |
| Testumfang | Plan scope.moduleId=M5, gateId=null; deklarierte M5-Tests. | Plan scope.moduleId=null, gateId=TG5; explizit vollständige Integrations-/Regressionsanforderungen U1∪…∪U5. Das Gatescope allein bildet diese Union nicht. |
| Reviewdelta | sourceStageId=implement-M5 ergibt ursprüngliches M5-headBefore H4→aktuelles M5-H5. | Explizite Basis H0 und eingefrorenes aktuelles H5; Scope umfasst alle relevanten Pfade, Requirements U1∪…∪U5. |
| Reihenfolge | implement-M5→lint-M5→review-M5→test-M5. | Nach diesen Modulergebnissen TG5/RG5 vor implement-M6; Lint für denselben Stand vor RG5 als Graphabhängigkeit. |
| Erfolgsevidenz | Beweist deklarierte M5-Checks auf H5. | Muss neben gleicher Revision auch den erwarteten kumulativen Plan-/Anforderungsscope belegen. Genau diese zusätzliche Produktbindung fehlt heute. |

Weder Name „gate“ noch Archive des ganzen Repositories noch `maxConcurrency` beweisen den kumulativen Prüfumfang. Die feste Zahl 13 wird hier nicht als automatische Suiteauswahl ausgegeben: Resolver expandiert explizit ausgewählte Suites/Nodes; die vollständige Suiteabdeckung behandelt der separate Suite-Trace.

### Vollständiger Übergangstrace

| Nr. | Übergabe, Empfänger und technischer Nachweis | Zustand / Revision / Rückweg |
|---|---|---|
| 1 | `compileProject` akzeptiert geschlossene Projekt-/Modulfelder und erzeugt pro Modul implement/lint/review/test. `skills/nova/project/compiler.ts:47–80,103–137`. | Kein Feld für kumulative Gates, keine TG5/RG5-/Summaryerzeugung; letzter Modultest darf nicht zum kumulativen Gate umbenannt werden. `T01-F02`. |
| 2 | Expliziter Graph: TG5 und RG5 hängen hinter integrierten M1–M5, M6 hinter Gates. Resolverloader kann `.swarm/pipeline.json` getrennt nach modules oder gates lesen. `skills/nova/core/test-gates/pipeline.ts:12–55`, `loadPipelineTestScope`. | Genau ein moduleId/gateId erforderlich; selected.suites/tests/fixtures/concurrencyLimits werden geladen. Keine automatische Vereinigung vorheriger Module, keine abgeleitete „bis Modul 5“-Semantik. |
| 3 | `resolveTestPlan` validiert Scope/Policy/Fakten und expandiert deklarierte Vorlagen, Provider, Dependencies/Ports zu unveränderlichem Plan. `skills/nova/core/test-gates/resolver.ts:625–691,718–749`. | planId/runId/project/scope, registrySnapshotDigest, Nodes/Suites/Links, planDigest. Resolver ist verfügbare API; Compiler bekommt bereits aufgelösten providerPlan. Keine automatische Produktions-Resolverkette aus Dateinennung behauptet. |
| 4 | TG5 `buster-quality-gate.execute` verlangt providerPlan, liest H5 über explizite revision oder sourceStageId, invokiert test.plan.execute mit Plan und revision. `skills/nova/plugins/buster-quality-gate/src/stage.ts:6–17`; `skills/common/plugin-runtime/sdk/src/source-revision.ts:5–37`. | Same-run Implementationartefakt wird erneut byte-/digestvalidiert; neuester Producerattempt wird gewählt. Explizite Revision und sourceStageId sind XOR. Plan muss fachlich alle U1–U5 enthalten; Stage kontrolliert diese Union nicht. |
| 5 | Remoteadapter prüft Repositoryroot, resolvedPlan-Vertrag, plan.runId gegen Effectattempt, exakte Grants je Node, setzt pipelineStageId=aktuelle TG5-Stage. `skills/nova/plugins/remote-test-gate/src/adapter.ts:31–41,63–94`. | Outer input.gateId wird nicht gegen plan.scope geprüft. Gleiches Run und gültiger Plan reichen dieser Grenze; Modulscopeplan kann unter cumulativem Stagenamen laufen (PATH-T13-001). |
| 6 | Produktionskomposition erstellt signierten committed snapshot von H5, `git archive` verwendet exakt diesen Commit/Tree; Job bindet Snapshot und Plan. `skills/nova/core/test-gates/production.ts:60–73`; `source-snapshot.ts:25–61`; `remote-dispatch.ts:29–59`, `createRemotePlanJob`. | Whole-repo bytes H5, sourceSnapshot.revision=`git:H5`, tree/archiveDigest/signierte Authority, jobId/requestDigest, pipelineStageId TG5. Planumfang bleibt eigener Input, nicht aus Archivmenge abgeleitet. |
| 7 | Nova persistiert Job/Archiv vor Submit; HTTP POST `/v1/plan-jobs`; Buster prüft signierte Quelle, Plan-/Job-/Requestdigests, installierte Provider/Grants und führt TestPlanRunner auf entpackter Quelle aus. `remote-dispatch.ts:63–115,169–232`; `skills/buster/engine/test-gates/remote-plan-service.ts:94–116,409–449,679–713`. | Nodes tragen Modul-/Gatescope, Execution-/Testidentität und Attemptnummern; Registry-/Planbindung bestimmt tatsächliche Provider. Alle deklarieren/konditionieren ihre eigenen Tests; keine zusätzliche implizite Regessionssuite. |
| 8 | Nova importiert terminales Result und Evidence: job/plan/run, exakte Nodes, Provider/scope, fortlaufende Attempts, finale Resultate, Digests/Receipts und Evidencebytes werden geprüft. `skills/nova/core/test-gates/remote-result-import.ts:100–164,280–324`. | Falsches/verspätetes Result eines anderen Jobs oder alten Plan-/Attemptkontexts scheitert. Speicherung pending_evidence→complete; Graphprojektion enthält sourceRevision/planDigest (`:42–69,218–264`). Kein bestandener Gateentscheid vor Evidenceabschluss. |
| 9 | Native Gatepolicy reduziert Nodes: failed blocking→failed, Execution/Cleanup→execution_error, expliziter Reviewbedarf→review_required; skipped/advisory failure sind nicht blockierend. `remote-result-import.ts:169–208`. | Nur die deklarierten Nodes werden entschieden. Passed bedeutet nicht, dass nicht deklarierte U1–U4 oder alle 13 Suites geprüft wurden. GateDecision mit planId/jobId/runId/resultDigest/decisionDigest. |
| 10 | Qualitystage schreibt native Decision; nur native passed startet Agenturteil mit Knotenkurzbelegen. Parser kann failed native nicht überschreiben, ready quality wird mit sourceRevision/decisionDigest gespeichert. `buster-quality-gate/src/stage.ts:18–47`; `protocol.ts:16–40`. | failed→request_fix, execution_error/review_required→blocked gemäß gateDecisionStageResult. Config verlangt Qualitätsagent; das ist nicht dasselbe wie Reviewagent je Testnode. Providerfailure startet keinen Agent, bloße Suitebelege sind kein zusätzlicher Laufzeittest. |
| 11 | RG5 nutzt kumulative revisions `{base:H0,head:H5}`, requirements U1–U5 und gesamten relevanten Scope. `skills/nova/plugins/review/src/stage.ts:251–267`/execute; `review-stage-input.ts:13–22,163–205`. | Bei allein sourceStageId=implement-M5 wandelt SDK stattdessen zu H4→H5 um (`source-revision.ts:40–48`). Das ist korrekte Modulsemantik, kein kumulativer Reviewbeweis. Explizite Basis H0 ist für kumulative Absicht erforderlich. |
| 12 | Review friert aktuelles Repository-HEAD samt Proof ein, vergleicht explizites head, liest Changedmanifest H0→H5 und Kontext; Snapshot trägt Requirements, Scope, Manifest-/Policy-/Bundledigest. `review-preparation.ts:39–63,110–132`; `review-repository.ts:116–160`. | Reviewdelta/Requirementumfang werden im Bundle erhalten. Stale explizites H5 gegen aktuelles H5′ ergibt REVIEW_CANDIDATE_CHANGED, keinen stillen Wechsel. Basisonly H0 kann bei bewusst serieller Graphkomposition jeweils aktuelles HEAD einfrieren, benötigt aber unabhängigen Abgleich mit Testquelle. |
| 13 | Echo receives Reviewbundle über runtime.dispatch; Parse/Verifikation/Semanticflow/Governor reduzieren Urteil, Reportpersistenz ist Pflicht. `review/src/stage.ts:73–82,211–267`; `review-report-flow.ts:30–73`. | Reviewreport bindet untersuchten Snapshot/Revision/Attempt; nicht Prompt allein als Freigabe. Konflikte/fehlende Evidenz dürfen nicht allein aus Agentprosa als passed gelten. Lint-first entsteht hier durch Graphabhängigkeit, nicht allein durch Profilename gate. |
| 14 | TG5 oder RG5 meldet fachlichen Fehler in M2. Graph muss `on.request_fix=implement-M2` bereits deklarieren; Core wählt Ziel nicht anhand Findingdatei dynamisch. `skills/nova/core/lifecycle/reducer.ts:77–87`; `skills/nova/core/execution/run-decisions.ts:64–75`. | Eindeutiger requesterStageId/targetStageId/generation und Originalresult mit Artefakten. Ohne deklarierte Kante kein funktionierender Reparaturpfad. Budgetgrenzen bleiben wirksam, kein unendliches Retry. |
| 15 | `repairRequest` traversiert alle dependsOn-Nachfolger des Targets plus Requesternachfolger; `applyRepair` entfernt Facts/Wait/Guidance bei Betroffenen und plant Target pending mit repairRequest. `skills/nova/core/lifecycle/remediation.ts:13–51`. | Bei serieller Kette sind M2-Lint/Review/Test, M3–M5-Implementierungen und deren Prüfungen, TG5/RG5, M6 und Summary betroffen. Frühere unveränderte M1-Stufen müssen nicht invalidiert werden. Nur im Graph modellierte Abhängigkeiten sind erkennbar. |
| 16 | Reparaturrequest wird vor Ausführung durable als stage.waiting gespeichert; Replay benutzt dasselbe applyRepair. Forge erhält reale digestgebundene Requesterartefakte, startet von integriertem HEAD. `run-decisions.ts:72–75`; `lifecycle/recovery-state.ts:152–172`; `implementation-agent/src/repair-evidence.ts`; `implementation-agent/src/stage.ts:10–20,77–83`. | H5→Hrepair; verlorene/kaputte/cross-run Findings blockieren. Artifakthistorie bleibt auditierbar; Freigabegültigkeit lebt in Stagezuständen und erneuten Producerattempts, nicht durch Löschen alter Blobs. |
| 17 | Nach erfolgreicher M2-Reparatur setzt Core Requester pending; Dependencyprüfung erzwingt zuerst neu fällige Zwischenmodule/-prüfungen. `run-decisions.ts:116–130`; `pipeline-loop.ts:87–99,120–129`. | Kein direkter Sprung zu TG5 vorbei an pending Dependencies. Spätere Module werden im seriellen Graph erneut implementiert, nicht nur ihre Tests; Budgets bleiben verbraucht (`pipeline-loop.ts:120–123`). Idempotente unveränderte Modulbearbeitung ist kein hier nachgewiesener Erfolg. |
| 18 | TG5 rerun muss neu integriertes H5′ testen. sourceStageId=implement-M5 nimmt neuestes erfolgreiches Artefakt; gleiche statisch gesetzte revision=H5 testet weiter alten Commit. RG5 mit festem head=H5 blockiert nach Änderung; keine automatische Graphinputumschreibung. | `source-revision.ts:30–48`, `buster-quality-gate/src/stage.ts:11–14`, `review-preparation.ts:110–117`. Kumulativer Caller muss Basis und aktuelle Candidatebindung korrekt gestalten. Ein neuer Sourcejob trägt anderen Snapshot/Requestdigest; alte Ergebnisantwort kann nicht als dieser neue Job importiert werden. |
| 19 | Nach Gateerfolg M6→H6 und Modultests; sofern finaler kumulativer Abschluss beabsichtigt, ist auch nach M6 ein vollständiger Gateumfang U1–U6 auf H6 nötig. | TG5/RG5 bleiben historische H5′-Beweise. M6-Erfolg beweist keine erneute Prüfung aller Interaktionen. Expliziter Graph muss Abschlusskante/Scope vorgeben; Compiler fügt diese nicht hinzu (`T01-F02`). |
| 20 | Summary liest Modulquellen/-testberichte sowie final Source/Lint/Review/Test. Neuester Refattempt, Bytes/Digest/runId/Source/Decision und passed werden geprüft. `skills/nova/plugins/project-summary/src/summary.ts:17–69`. | Gleiche Source schützt gegen H5-vs-H6-Mischung der final ausgewählten Belege; es gibt aber keine erwartete U1–U6-/kumulative Scopebindung oder HEAD-Abfrage. Final kann dieselben IDs wie letzter Modultest/-review verwenden. PATH-T13-001. |

### Invalidierung, verspätete Ergebnisse und Grenzen

Normaler request_fix-Pfad: `PipelineLoop.run` wartet die selektierte Batch vollständig ab und zeichnet abgeschlossene Geschwister **vor** Repairinvalidierung auf (`pipeline-loop.ts:25–34`). Ein alter Geschwistererfolg derselben Batch überschreibt daher nicht nachträglich pending. Neue externe Testjobs binden plan/run/job/request und Scope; Import lehnt fremde/alte Identität ab (`remote-result-import.ts:100–164`). Gleiche Job-ID mit anderem Ergebnis/Source/Decision kollidiert im Importstore (`:225–264`). Dies sind konkrete Schutzmechanismen, keine Behauptung lückenloser Prozess-/Netzwerk-Exactly-once-Semantik.

Reparaturartefakte bleiben historisch im Recorder (`execution/artifact-checkpoints.ts:89–108`); Stagefacts werden invalidiert. Quellconsumer wählen neueste Implementationattempts, Summary neueste konfigurierte Producerbelege. Ein Customgraph ohne Abhängigkeit zu betroffenen Komponenten kann damit nicht auf wundersame Weise auf Vollständigkeit geprüft werden; solche fehlenden Kanten sind Teil von PATH-T13-001 und der Graphpolicy.

Administrative Remediation ist gesondert: `engine-admin.ts:121–127` setzt Target/Requester um, ruft aber nicht dieselbe transitive applyRepair-Invalidierung. Alte erfolgreiche Zwischen-/Geschwistergates können bleiben: **PATH-T04-003** (nicht dupliziert). Genau dieser Pfad ist bei bewusstem Operator-Reopen eines blockierten kumulativen Gates relevant. Ein normaler request_fix-Beweis darf nicht dafür wiederverwendet werden.

Sourceänderung: Ein einmal festgeschriebener H5-Graphinput wird beim Repair nicht auf H5′ umgeschrieben; statischer Testrevisioninput bleibt absichtlich H5, statischer Reviewhead scheitert an aktuellem HEAD. Unterstützte Bausteine erlauben sourceStageId für neueste Testquelle und explizite Reviewbasis H0 mit eingefrorenem HEAD, aber keine einzelne automatisch erzeugte kumulative Source-/Coveragefreigabe. Readonly Snapshot und aktuelle Integration sind nur gleich, wenn der Graph die Mutationsreihenfolge und gemeinsame Candidatebindung korrekt herstellt.

### Gegenüber Vorreviews und frühere Kennungen

- **T01-F02** bleibt Eigentümer der fehlenden Compilerkomposition kumulativer Gates/Summary. Die ursprünglichen Vorreviews `kubeclaw.project-summary.md` und `kubeclaw.buster-quality-gate.md` behaupten stellenweise finale Compilerverdrahtung; `compiler.ts:103–137` widerlegt dies am identischen Codecommit. Vorreviewtext ist kein Gegenbeweis zum Code.
- **PATH-T04-003** bleibt Eigentümer der administrativen Invalidierungslücke.
- **PCR-IMPLEMENTATION-001** kann schon die vorausgesetzte Modulproduktion blockieren; T13 setzt deren erfolgreiche Sourceartefakte bedingt voraus, ohne Reparatur zu behaupten.
- **PCR-NOVA-GATE-001/-002** begrenzen Remote-Timeout/Cancel/Importdauer. Das erneute Nachlesen der Importbindung hebt diese bekannten Betriebsgrenzen nicht auf; keine zusätzliche Kennung.
- **PCR-EXEC-002** betrifft Recovery-Artefaktprojektion; erfolgreicher laufender Import ist kein vollständiger Restartbeweis.

Gelesene Vorreviews am oben genannten Reviewref: `kubeclaw.buster-quality-gate.md`, `kubeclaw.project-summary.md`, `nova.test-gates.md`; lokale T01-/T04-Berichte zur Kennungs-/Widerspruchskonsolidierung. Keine Secrets übernommen.

### Prüfungen und offene Laufzeitnachweise

Ausgeführt wurden ausschließlich Dateilektüre und statische Suchen sowie beidseitiger Vertrags-/Zustandsabgleich. **Testläufe: keine.** Gelesene Testquellen:

- `skills/nova/plugins/project-summary/tests/summary.test.mjs:9–49`: Original-Artefaktstore mit Producerfixtures, ausdrücklich keine Provider-/Agentexecution. Final und einziger Modulcheck benutzen dieselben IDs. Tests fehlen für mehrere Module mit unzureichendem finalem Scope; vorhandene Manipulations-/Crossrun-/Revisionfehler sind kein Coveragebeweis.
- `tests/verification/reliability/repair-evidence.test.mts:10–53`: echte Artefaktbytes und Manipulations-/Scope-/Größenabwehr im Helper, handverdrahteter Kontext; kein gesamter M2→M5→TG5-Repairgraph.
- `tests/verification/contracts/check-pipeline-remote-result-import.mts:106–215`: Originalimport/-store mit synthetischen Transport-/Resultfixtures; Passed/Failed/Advisory/Review-/Cleanupzustände und falscher finaler Attempt. Kein kumulativer Originallauf oder echter Netzwerk-Reorder. Historische Ergebnisse aus Vorreviews wurden nicht als aktuelle Ergebnisse übernommen.

Offen bleiben echter M1–M5-Integrationslauf, fachliche Vollständigkeit U1–U5, Originalprovider-/Agentqualität, Altmodulreparatur mit Wiederholung abhängiger Module, ausreichende Budgets, neuer H5′/H6-Gatebeweis, Late-Result-/Restartmatrix und tatsächlicher Operatorabschluss. Empfohlene Reihenfolge: Compilerkomposition klären (T01-F02), Coverage-/Candidatevertrag (PATH-T13-001), gemeinsame administrative/automatische Invalidierung (PATH-T04-003), dann echte Originaldienste-/Providerläufe mit alter/neuer Source und adversarialem zu engem Plan. Erst solche späteren Läufe können E2E-Aussagen tragen.

Orchestrator-Gegenprüfung: abgeschlossen (statisch); Details im Gegenprüfungsprotokoll.

### T14 — Operatorpreview, Zugangsdaten, Rückmeldung und Bereinigung

Einzeltrace: [T14-operator-preview.md](T14-operator-preview.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

### Prüfstand und Ergebnis

Codecommit **`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle Codezeilen unten beziehen sich auf diesen Stand. Nur statische Prüfung; keine Clusteraktionen, Builds, CI, Provider- oder E2E-Tests ausgeführt. Vorhandene Komponentenreviews aus `a9e080ab1e1981ec5713e9b742f94280835fd347` sowie Infrastrukturreviews aus `eac591fb060458ebb6c6ba34599309e8c424bd08` wurden als Vorarbeit gelesen, historische Tests nicht als eigene Ergebnisse gezählt.

Szenario: Die gesamte integrierte Anwendung liegt in einem bestimmten Commit vor. Ein finaler Plan baut das Image, provisioniert Testnamespace/Service, stellt einen Tailscaleendpoint bereit und soll Namespace **und erreichbaren Zugang** für den Operator erhalten. Der Operator soll URL und nötige Appzugangsdaten erhalten, ohne manuelle Clusterarbeit testen, Feedback/Abnahme geben und später aufräumen lassen. Varianten: Namespace retain/delete, Port80/8080, abgelaufene Lease, fehlende Rechte, Fehler nach externem Apply, Credentials vorhanden/nicht verlangt und erneuerte Exposuregeneration.

**Ergebnis: kein durchgängiger Operator-Testzugang implementiert.** Im Projectmodus fehlt ein automatisch erzeugter Finalpreview-/Übergabeabschluss. Bei einem ausdrücklich verdrahteten Busterplan kann eine Anwendung deployed und exponiert werden, aber **der Runner räumt auch eine erfolgreiche Tailscalefixture vor der Planrückgabe auf**. Namespace-retain bewahrt den Namespace bis TTL, nicht den Ingress. Außerdem liefern vorhandene Previewbenachrichtigung und Projectsummary keinen vollständigen URL-/Appcredential-Handoff; die Credentials-Secretanlage erzwingt keine Appauthentifizierung. Nach den Bruchstellen werden Folgeschritte nur konditional untersucht.

### Unterstützte und fehlende Teile

| Teil | Status am Commit |
|---|---|
| Imagebuild mit unveränderlichem Registrydigest | Implementierter Provider/Parentruntime |
| Namespaced Fixture mit geprüften Manifestbytes, Service-/Podreadiness | Implementiert, Requires Livecluster/Controller |
| Tailscale-Ingressfixture | Implementiert, optional in Testplan |
| Namespace retain | Implementiert bis Lease-TTL; Default delete |
| Exposure retain über Planabschluss | Fehlend im Exposureprovider; Cleanup immer aktiv |
| Erzeugte dedizierte Testcredentials | Implementiert als Secret, optional generate im Fixturepfad |
| Automatische Appkonfiguration mit diesen Credentials | Nicht in dieser Infrastrukturkette erzwungen |
| URL und sichere Appcredentialzustellung an Operator | End-to-end-Verdrahtung in geprüften Summary-/Observerpfaden fehlt |
| Appgebundene Operatorabnahme/Feedback→neue Revision | Kein solcher Schritt im Projectcompiler; generische Approvalstage separat vorhanden |
| Spätere Bereinigung | Providerrelease und Controller-TTL/Finalizer vorhanden, keine Operatorabnahmebindung |
| Clawdeck | Beobachtungsview implementiert; kein daraus belegter interaktiver Preview-/Credential-/Abnahmeclient |

### Übergangsfolge

#### 1. Finaler integrierter Stand und explizite Planverdrahtung

`skills/nova/project/compiler.ts#compileProject:103–136` erzeugt pro Modul implement→lint→review→test und kehrt zurück. Keine separate Finalpreview-, Projectsummary-, Operator-Test- oder Abnahmestage wird angehängt. **Erste Bruchstelle im normalen Projectzielablauf** ist dieser fehlende Abschlussgraph. Ein Testproviderplan kann zwar Fixtureknoten enthalten, aber der Compiler erzwingt nicht, dass nach allen Modulen genau der kumulativ freigegebene Stand für einen Operator erhalten bleibt.

Konditionale Fortsetzung: Ein ausdrücklich ausgewählter Plan baut/exponiert den finalen integrierten Source-Stand. Die Herkunft des Buildworkspace wird im zugehörigen Source-/Buildtrace geprüft; hier wird die gültige finale Source-Candidate-Eingabe vorausgesetzt und anschließend Image→Manifest→Service→URL verfolgt. Der vorhandene Scaffold hat konkrete Verwendungsbelege: `skills/nova/project_setup/tools/progress-scaffold-discovery.ts#exposureNodes:336–363` erzeugt optional `kubeclaw.tailscale-exposure@1`, abhängig vom Deployment, und HTTPhealth-/Smoketests, die dessen `exposure`-Output konsumieren. Das sind Tests während des Plans, keine persistente Operatorhandoff-Stufe.

#### 2. Containerbuild → verifizierter Imageoutput

`skills/buster/plugins/container-build/src/provider.js#provider.execute:96–141` sendet `container.build/build_push_verify` mit Buildcontext, Dockerfile, Definitionidentity, Plattform, Buildargs und Zeit-/Loglimits; Resource-ID enthält Providerattempt. Parent `skills/buster/engine/test-gates/container-build-runtime.ts#invoke:189–218` erzeugt attemptbezogenes Registrytag, startet Build/push, liest Digest aus Metadata und ruft Registryverifikation auf. `#verify:132–161` vergleicht Manifestbyteshash und optionalen Docker-Content-Digest. Provideroutput `kubeclaw.container-image@1` enthält immutable reference/digest/platform/definitionIdentity. Ein erfolgreicher Digestbuild allein ist noch kein laufender Service.

#### 3. Image und checked-manifest → Kubernetesfixtureauftrag

`skills/buster/plugins/kubernetes-fixture/src/provider.js#configuration:17–63` verlangt Image entweder als Valueinput oder Config, nicht beides, und validiert matching reference@sha256/digest. ServiceName/Port, Namespaceprefix, Retention und optionale Secretrefs werden geprüft. Default ist **retention.mode=delete, seconds=1800**, zulässige Spanne 60–604800s (40–44).

`manifestInput:66–77` verlangt genau ein Artefakt `checked-manifest` mit MediaType `application/vnd.kubeclaw.checked-kubernetes-yaml`, Digest/Bytes und lokalem File-URL. `identity:80–83` hasht runId, nodeId und attemptId zum Lease-/Namespacenamen. `capabilityRequest:86–97` sendet `kubernetes.fixture/prepare`, Image-/Manifestdigest, tatsächlichen Pfad, Service, Retention, Secretrefs und optional testCredentials. Die fachliche Zuordnung ist also Run/Node/Attempt-basiert; das Namespaceprefix allein ist keine vollständige Identität.

Die Produktionsverdrahtung ist konkret: `skills/buster/engine/test-gates/remote-plan-service.ts:624–632,669–670` erstellt KubernetesFixtureCapabilityInvoker/TailscaleExposureCapabilityInvoker nur bei erlaubten Capabilities und routet deren Namen zu diesen Instanzen. Provider-Ausführung und Parentkubectl sind getrennte Grenzen.

#### 4. Parentruntime → Lease-CRD → Controller → Anwendung

`kubernetes-fixture-runtime.ts#prepare:647–710` prüft Prefix, erlaubtes immutable Image, Image-/Manifestdigest, Manifestpfad und -bytes sowie Ressourcen-/Service-/Storagepolitik. `testCredentials` akzeptiert in dieser Route nur generate; Readers werden aus erlaubtem Credentialreader und Runner-ServiceAccount zusammengesetzt (691–701). Der Parent erzeugt `BusterNamespaceLease` mit purpose gate, exposure off, ttlSeconds, cleanupPolicy, Service, verifiedImage, manifestDigest und Deployerzugang (703–710). `spec.runId` trägt hier den LeaseName, während die ursprüngliche Provideridentität im deterministischen Namen steckt; nicht als identisches ursprüngliches Nova-runId-Feld ausgeben.

`#prepare:713–740` führt can-i create/get/delete, serverseitigen Dryrun und Leaseapply aus, wartet Lease-Ready, wendet **die geprüften Manifestbytes** im Zielnamespace an und wartet Pods plus Service-/Endpointbereitschaft. Interner Output ist `http://<service>.<namespace>.svc.cluster.local:<port>`, Zeiten, Releaseaction, Manifest-/Imagedaten und optional credentialsRef. Weder Cluster-DNS noch Kubernetes-SA ermöglichen dem menschlichen Browser allein Zugang.

Controller `cmd/buster-namespace-controller/main.go#reconcileLease:238–305` prüft Finalizer/Namespace/TTL/Specimmobilität; `ensureNamespace:755–774` und `verifyNamespaceLabels:787–794` binden Namespace an verwaltenden Controller, LeaseName und LeaseUID. `ensureNamespaceNetworkPolicy:797–835` stellt Namespaceverkehr/DNS sowie Zugang für Nova/Buster und Tailnetproxy-Pods her. Der Tailscale-Pfad verlangt aktuell Namespace `tailscale` und Labels `tailscale.com/managed=true`, `tailscale.com/parent-resource-ns=<target>` (813–815). Ein anders installierter Operator ist daher eine zu prüfende Netzwerkkonfigurationsvoraussetzung, kein automatisch funktionierender Zugriff.

#### 5. Optionale Testcredentials — welche Autorität sie tatsächlich geben

`main.go#ensureTestCredentials:1165–1225` legt ein dediziertes Secret an. Generate erzeugt zufällige Passwortbytes; Secret enthält username/password, der Status nur credentialsRef/credentialsAvailable. `ensureCredentialAccess:1263–1283` gibt den deklarierten Kubernetes-ServiceAccounts ausschließlich get auf den benannten Secret. Das ist **Secretleserecht für Agenten**, kein menschlicher Appaccount und kein Kubernetes-Clusterzugang für den Operator.

Der Controller kann außerhalb dieses Providerpfads außerdem existing-Credentials mit gezieltem Writer/Readervertrag verarbeiten (`credentialRequest:1089–1162`), die Fixturekonfiguration bietet hier jedoch nur generate an. Es wurde weder Secret gelesen noch ein Passwort in diesen Bericht übernommen.

Die Manifestbytes werden unverändert angewandt (`kubernetes-fixture-runtime.ts:723–725`). Diese Funktionen konfigurieren keine beliebige Anwendung automatisch auf das generierte Login und verifizieren keinen Login damit. Appcode/Deployment muss dieselben Secretkeys ausdrücklich nutzen und einen echten Authpfad anbieten. `previewIngress:1481–1514` enthält TLS-/Servicerouting, keine Basic-Auth-/Credentialmiddleware. **CredentialsAvailable ist daher kein Nachweis einer funktionierenden Appauthentifizierung.** Auch ein Secret ohne konsumierende App kann existieren.

#### 6. Deploymentfixture → Tailscaleprovider → Ingressstatus → Public-Endpoint-Value

`tailscale-exposure/src/provider.js#deploymentInput:26–53` erwartet genau deployment mit Schema `kubeclaw.kubernetes-deployment-fixture@1`, Service-DNS, Port, Lease/Namespace und ExpiresAt. **PCR-TAILSCALE-001** blockiert Serviceport80 durch URL.port-Normalisierung; für den folgenden Pfad wird deshalb Port8080 vorausgesetzt. `provider.execute:63–83` sendet `kubernetes.exposure/prepare` und erzeugt anschließend `public-endpoint-fixture.v1` mit HTTPSurl/hostname/namespace/leaseName/createdAt/expiresAt/releaseAction.

Parent `tailscale-exposure-runtime.ts#prepare:190–225` prüft Lease/Namespace-/Service-/Port-/Expirybindung, RBAC get/patch und patcht purpose final-preview, exposure tailscale-ingress sowie zufällige Ownerannotation. `#verifyLease:155–166` verlangt Ready und zukünftige identische Expiry. Controller `ensurePreviewExposure:1348–1405` prüft Backendbereitschaft, erstellt `Ingress buster-final-preview`, liest Ingressstatus und schreibt exposurePhase/previewUrl/hostname. `previewIngress:1481–1514` verwendet ingressClassName tailscale und TLS-Hostname; `ingressPreviewURL:1517–1531` baut HTTPSurl aus LoadBalancerstatus.

Parent prüft HTTPS, keine URLcredentials, zulässiges Hostsufffix, Statushostname, Namespace und Expiry (202–225). Dieser technische Statusbeleg ist kein Test vom erlaubten menschlichen Tailnetclient und kein Loginbeweis. Die vom Scaffold generierten HTTPtests (336–363) laufen während der Fixturelebenszeit; auch deren Erfolg beweist nicht die spätere Operatorerreichbarkeit.

#### 7. Erste konkrete Bruchstelle des konditionalen finalen Previewpfads: Planabschluss räumt Exposure auf

`tailscale-exposure/plugin.json:8–20` registriert einen Fixtureprovider. `runner.ts:1292–1293` behält erfolgreiche Fixtures zunächst für die übrigen Planknoten; completed fixtures kommen in die retainedFixtures-Liste (886–892). **retainedFixture bedeutet hier nur „bis zum Planende behalten“.**

`skills/buster/engine/test-gates/runner.ts#run:897–899` ruft im finally immer `#cleanupFixtures` auf. `#cleanupFixtures:2005–2018` geht rückwärts über retainedFixtures; `#cleanupProvider:1968–2002` ruft den Originalprovidercleanup mit eigener begrenzter Zeit und Fehleraufzeichnung auf. Tailscaleprovider `cleanup:85–90` sendet immer release. Parent `#release:231–241` setzt purpose gate/exposure off und wartet Off; Controller `ensurePreviewExposure:1353–1362` löscht darauf den Ingress und leert previewUrl.

Kubernetesprovider `cleanup:132–139` überspringt Release nur bei retention.mode=retain. Somit bleibt im besten Retainfall zwar der Namespace bestehen, **aber sein Tailscalezugang wird bereits vor Rückgabe des Planergebnisses entfernt**. Bei delete verschwindet außerdem die Namespacelease. Ein erfolgreicher Exposureoutput bzw. dessen gespeicherte URL kann nach Abschluss also eine nicht mehr aktive Exposure beschreiben. Dies ist kein nur hypothetischer fehlender Betriebsschritt, sondern die statisch durchgehende normale Cleanupkette (F-T14-01).

Wenn Cleanup scheitert, kann die Exposure noch existieren, aber das ist kein legitimierter Retainmechanismus: Runner zeichnet Cleanupfehler auf und setzt betroffene Nodes auf errored (900–934). Bei SIGKILL kann der finally-Pfad fehlen; Controller-TTL ist dann die verbleibende Aufräuminstanz.

#### 8. Konditional erhaltene Exposure → Operatorbenachrichtigung

Unter zusätzlicher Voraussetzung eines später implementierten persistenten Previewhand-offs wäre die URL zuzustellen. Aktuelle `project-summary/src/summary.ts#buildSummary:46–68` prüft Source-/Lint-/Review-/Testberichte und schreibt delivery-manifest mit projectId/runId/sourceRevision/modules/final/evidence. Sie liest **keinen Deployment-/Exposurevalue**, enthält keinen eigenen Preview-/Credentialvertrag und publiziert nichts: `project-summary/src/stage.ts:3–10` schreibt nur Artefakt. Außerdem erzeugt der Projectcompiler diese Stage nicht (compiler.ts 103–136). Die gegenteilige Aussage im vorhandenen Komponentenreview unter Verantwortung ist am Code widerlegt und wird hier nicht übernommen.

`skills/common/plugins/notification-observer/plugin.json:42–60` hat einen optionalen best-effort Previewobserver auf artifact.created. `observer.ts#previewNotification:139–160` projiziert lediglich artifactId/digest/mediaType/logicalName, ohne Artefaktinhalt zu lesen, ohne URL und ohne Credentials. `deliverPreview:191–193` sendet diese Metadaten via operator.request. `lifecycleNotification:111–137` erzeugt generische Run-/Stagenachrichten; `run.succeeded` enthält dadurch nicht automatisch einen Appzugang. Zusätzlich bleibt bestehender **PCR-NOTIFY-001**: die eigene Operatorpayloadgrenze lehnt vom Observer erzeugte Formen ab; kein zuverlässig zugestellter Previewdialog behauptet.

`operator-messaging/src/adapter.ts#deliver:65–131` persistiert Request/Receipt und sendet an konfiguriertes Ziel. Discordformatter (12–25) rendert Summary/Fields, ist aber kein Secretleser und kein automatisch vertraulicher Credentialkanal. Das sichere Verhalten dieser Kette ist derzeit, **keine Secretbytes in Previewartefakten/Status mitzuliefern**; daraus folgt nicht, dass notwendige Appcredentials den Operator erreichen. Ein gezielter authentifizierter Secretabruf und personengebundene sichere Zustellung fehlen im nachvollzogenen Handoff (F-T14-02).

#### 9. Operator testet → Feedback/Abnahme → weitere Änderungen

Nur falls Exposure erhalten, Tailnetclient berechtigt, CNI/Proxybackend erreichbar, Appauth tatsächlich verdrahtet und Zugangsdaten sicher übergeben sind, kann der Operator ohne Clusterarbeit testen. Keiner dieser externen Zustände wurde hier gemessen. Die vorhandene generische human-approval-Stage kann in einen zusätzlichen Graph eingebunden werden, aber ihr `{summary}`-/approved/rejected-Vertrag (`human-approval/src/stage.ts:17–54`, `approval.ts:94–118,135–157`) bindet nicht automatisch Previewlease, Exposedimage oder Feedback an einen Appcommit. Der Projectcompiler hat keine solche abschließende Interaktion.

Weitere Änderungen benötigen somit eine explizite Nova-/Operatorentscheidung und neue Implementierungs-/Gateausführung; ein Chatfeedback allein ist kein technisch erzwungenes Invalidieren einer alten Appabnahme. Nach terminalem Run kann normales Resume keine neue Arbeit hinzufügen (`core/execution/engine-run.ts:40–44,76–88`; gepinnter Graphdigest in engine-snapshots.ts 67–71). Ein neuer Run oder vorgängig deklarierter Feedback-/Repairgraph wäre erforderlich. Hier wird keine automatische Abnahme- oder Feedbackloop erfunden.

Clawdeck ist teilweise vorbereitet: `skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts#buildClawDeckObservationView:39–110` liefert kanonische Records, Workerattempts/Evidence, Cursor und Completeness. Das ist eine Beobachtungsprojektion, kein nachgewiesener UI-Login-, Previewcredential- oder Feedbackcontroller. Der spätere Operatorclient bleibt als solcher offen.

#### 10. Spätere Bereinigung und TTL

Kubernetesfixture-Runtime `#release:747–750` löscht die Lease und wartet; Controller `reconcileLease:242–250` führt Finalizercleanup durch. `deleteOwnedNamespace:1575–1599` prüft Prefix/Controller/LeaseName/LeaseUID vor Namespace- und Egresspolicyentfernung. Das schützt gegen Löschen fremder Namespaceinstanzen, macht aber keine Appabnahmebedingung.

`main.go#expiresAt:1706–1718` berechnet Deadline aus Lease-CreationTimestamp und begrenzter TTL. `expireLease:307–324` markiert Expired und löscht den broker-owned Namespace **unabhängig von cleanupPolicy=retain**. Deshalb ist retain kein unbegrenztes Aufbewahren. Der gewünschte Operatorzeitraum muss innerhalb der verbleibenden TTL liegen; von langem Build/Test bereits verbrauchte Zeit wird nicht automatisch nach Übergabe neu gestartet. Controller-Ausfall oder Tokenprobleme verzögern Cleanup (PCR-BUSTER-NS-001, INF-18 Betriebsgrenze).

### Daten-/Statusentwicklung

| Schritt | Daten und Zuordnung | Tatsächliche Bedeutung |
|---|---|---|
| Source→Build | Providerattempt, Definitionidentity, image@digest | Unveränderliches Image, kein Laufzeitbeweis |
| Fixtureprepare | Hash(run,node,attempt), checked-manifest digest, Image, Service | Lease/Namespace konkret korreliert |
| Controller Ready | namespaceName, expiresAt, credentialsRef/Available | Clusterressourcen/Secretstatus, kein App-Login |
| Exposure Ready | Lease+Ownerannotation, HTTPSurl, Host, Expiry | Statusbasierte aktuelle Zusage; Generationgrenze PCR-TAILSCALE-002 |
| Planfinally | Exposure release; Namespace release oder retain | URL wird abgeschaltet, Retainnamespace bleibt bis TTL |
| Summary/Notification | Source-/Gateartefakte bzw. Metadaten | Keine vollständige Operatorzugangslieferung |
| Feedback | Kein appgebundener Abschlussvertrag | Keine erzwungene Abnahme-/Revisionsinvalidierung |
| TTL | Expired→owned namespace delete | Cleanup auch bei retain, Controllerverfügbarkeit erforderlich |

### Vorhandene Befunde / Infrastrukturbezug

| Kennung | Bedeutung im Trace |
|---|---|
| PCR-TAILSCALE-001 | Port80-Deployment scheitert im Exposureinput (provider.js 44–50); Folgepfad nimmt Port8080 an |
| PCR-TAILSCALE-002 | Ready nicht an neue Exposuregeneration gebunden; alte Cleanupinstanz kann neue Exposure abschalten (runtime.ts 210–225,231–241) |
| PCR-KUBERNETES-FIXTURE-001 | YAMLexpansion kann vor Ressourcenlimit Parent überlasten; Originalkomponentenbefund, hier nicht neu reproduziert |
| PCR-KUBERNETES-FIXTURE-002 | Unbehandeltes stdin-EPIPE in Parentkubectl kann Host beenden; ebenfalls Exposure-Spawnkopie betroffen |
| PCR-BUSTER-NS-001 | Controller-SA-Token wird nicht erneut gelesen; Bereitstellung/TTLcleanup kann nach Rotation scheitern |
| PCR-BUSTER-NS-003 | Eigene konfigurierbare RBAC in Runtime-Securityauswertung; Gate muss diese Diagnose korrekt behandeln, kein pauschaler Ready=Securitypass |
| PCR-NOTIFY-001 | Observernachrichten und eigener Operatorprovidervertrag inkompatibel |
| PCR-OPERATOR-001 | Transiente Deliveryfailure/Retrygrenze; Receipt ist nicht automatisch erfolgreiche neue Zustellung |
| IFR-18-001 | Konfigurationsabhängiger Namespacefence erfasst abweichende Controller-SA nicht; Infrastrukturdefekt, kein neuer Exploit hier |
| IFR-04-001 | Offene externe Tailnet-ACL/Grant-/TagOwner-Voraussetzung; bleibt **offene Frage**, nicht zu bestätigtem Defekt umgedeutet |
| IFR-24-001 | Ungepinnter Operatorinstallationsstand/Updatevertrag; nur verknüpft, kein Installationsschritt ausgeführt |

Quellen: [Namespacebroker](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/namespace-broker.md), [Tailscaleinfra](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/tailscale.md), [Tailscaleprovider](../components/kubeclaw.tailscale-exposure.md), [Kubernetesfixture](../components/kubeclaw.kubernetes-fixture.md), [Projectsummary](../components/kubeclaw.project-summary.md). Die falsche Compilerverdrahtungsbehauptung des Summaryreviews ist oben am Originalcompiler korrigiert. IFR-03-002 betrifft den separaten Archviewer-Präsentationszugang, nicht diese Anwendungsfixture; nicht als zweiter Previewdefekt gezählt.

### Durchgeführte Prüfung, Annahmen und offene Runtimebeweise

Durchgeführt: statische Provider→Parent→Controller→Output→Runnercleanup→Summary-/Obserververfolgung, Lesen der genannten Komponenten-/Infrareviews, punktuelle Gegenprüfung der Sourcezeilen. Keine Secrets gelesen, keine Credentials extrahiert, kein kubectl/build/CI/Test ausgeführt.

Inspektierte Originaltests **nicht ausgeführt**: `cmd/buster-namespace-controller/main_test.go:268–325` (dedizierte Credentials/Reader), 438–451 (Exposure ohne Credentialpolicy), 513–537 (TTL mit httptest-Server), 622–653 (URL-/Ingresskonstruktion). Diese Tests sind reine Vertrags-/synthetische APIprüfungen und belegen keinen echten Tailscaleclient, keine Appauth und kein dauerhaftes Preview nach Planabschluss. Historische Provider-Livefunctiontests des Komponentenreviews sind ebenfalls kein Clusterbeweis.

Offen: realer Build-/Registry-/Manifest-/Namespace-/Tailscale-Gesamtpfad am finalen Sourcecommit; echte erlaubte/unerlaubte Tailnetclients; Backendnetworkpolicy und OAuth/TLS/DNS; echte App-Credentialkonsumierung/Login; sichere Operatorzustellung; Feedback-/Acceptancegeneration; Owner-/Statusrace; Crash zwischen Leaseapply und Result, zwischen Exposure-PATCH und Status und vor Cleanup; Controllerneustart/Tokenrotation; TTL-/Finalizer-/PVC-Bereinigung. Ein retained Namespace kann bei Controllerausfall länger bestehen; ein abgeschalteter Link kann bei Cleanupfehler weiter erreichbar bleiben — beides verlangt Statusreconciliation statt Erfolg aus alten Artefakten.

Spätere Reihenfolge: finalen Previewownership-/Retentionvertrag implementieren (F-T14-01), URL/Auth/Operatorhandoff mit Source-/Generationbindung schließen (F-T14-02), bestehende Port-/Generations-/Recovery-/Infrafehler beheben, danach realen Operatorzugang und reale Bereinigung messen.

### T15 — Optionales Pipeline Review nach der Modulbearbeitung

Einzeltrace: [T15-pipeline-review.md](T15-pipeline-review.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

Status: statisch vollständig vom optionalen Trigger bis Berichtartefakt/Runabschluss verfolgt. Subagent `/root/trace06`. Keine Laufzeit-/E2E-Behauptung.

### Geprüfter Stand, Ausgang und Varianten

Alle Codebelege: **85ddfcbfc15e078780ea0434fc167e6f9a9b9488**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`; Zeilen 1-basiert. Gelesener Vorreview: `docs/review/components/kubeclaw.pipeline-review.md` und `docs/review/findings.md` an `a9e080ab1e1981ec5713e9b742f94280835fd347`. Die bestehende Kennung lautet **PCR-PREPORT-001**; keine abweichende PCR-PIPELINE-REVIEW-Kennung erfinden. Laut vollständigem Baselinebaum keine AGENTS.md. Nicht vorhandene lokale Dateien wurden nicht als repositoryweit fehlend gewertet.

Ausgang: Modul-/Gatearbeit des Runs R ist abgeschlossen; ursprünglicher Graph G und Plugins sind gepinnt. Gewünscht ist eine Auswertung der Pipelinearbeit selbst: Architektur, Agenten, Prompts, Tests, Konfiguration und Verbesserungsvorschläge. Dies ist vom Echo-Code-Review `kubeclaw.decision.review` getrennt.

Varianten:

1. **Ohne Pipeline Review:** normaler Projectcompilergraph, Ende nach letztem Modultest.
2. **Mit Pipeline Review:** vor Runbeginn explizit gesetzte Stage `kubeclaw.report.pipeline-review`, abhängig vom gewählten letzten fachlichen Gate; erforderlicher Runtimeagent und Artefaktprovider vorhanden.
3. **Stale/fremde/duplizierte Evidenz und caller-identities:** Reviewinput verweist auf Run S oder Versuch1, obwohl Core R/Versuch2 ausführt; syntaktisch gültige Digests ohne auflösbaren Inhalt.
4. **Ungültiger/fehlender Bericht oder Schreibfehler:** Rückweg und bedingte administrative Fortsetzung, kein funktionales Anwenden von Vorschlägen.

Ein expliziter Graph mit der Reviewstage nach den Produktgates läuft noch **vor** dem eigenen `run.succeeded`. Ein Bericht über einen bereits terminal abgeschlossenen Run wäre ein gesonderter späterer Lauf bzw. Aufruf mit historischem Berichtziel; diese Identitäten sind im Plugin nicht sauber getrennt. Eine laufende/gepinnte Graphdefinition lässt sich nicht unbemerkt um einen optionalen Schlussknoten erweitern.

### Vollständiger Trace

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

### Daten-, Zustands- und Revisionenentwicklung

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

### Findings und Abweichungen

#### Gewollte/fehlende optionale Abläufe, keine weiteren Defekte behauptet

- Ohne PipelineReview ist Abschluss implementiert. Die Installation erzwingt den optionalen Schritt nicht.
- Mit Stage ist sie ein normaler Graphknoten. Fehlender Bericht kann den gesamten Graph blockieren; „optional auswählbar“ bedeutet nicht „nach Auswahl best effort“.
- Tatsächliche Entscheidung eines Operators für diesen Schritt, automatische Runabschlussauswertung und spätere Annahme/Umsetzung von Verbesserungsvorschlägen sind in dieser Plugin-/Compilerkette nicht implementiert.
- Agent erforderlich, keine agentenfreie deterministische Reviewvariante in diesem Stagevertrag. Lokaler Testserver ohne echten Agenten ist ein Testaufbau, keine produktive Featurevariante.
- PipelineReview ist weder Echo-Freigabe noch CaseStudy noch Veröffentlichung.

### Wiederholung, späte Ergebnisse und Crashgrenzen

Core-Effectjournal bindet Runtimeinvocation an echten Attempt/key; gleicher abgeschlossener Effect kann Receipt wiedergeben. Neuer Attempt bekommt neuen Effectkey, auch wenn Plugininput.attempt unverändert bleibt. Der Artefaktstore verwendet den **Effectkey**, nicht nur artifactId als Appendidempotenz; daher nicht pauschal „zweiter Bericht überschreibt den ersten“ behaupten. Gleicher logical artifactId kann mehrere durch Producer/Digest differenzierte Aufzeichnungen erhalten (`artifact-store/src/adapter.ts:111–128`).

Core-Timeout und Leasewiderruf verhindern einen zweiten erfolgreichen Stagereturn nach Timeout (`stage-executor.ts:117–140`). Tatsächlicher Remoteabbruch bleibt offene Runtimeabhängigkeit (PCR-RUNTIME-001). Dispatchcatch im Plugin vereinheitlicht auch Effectprobleme zu invalid_report; fehlende sichere Receipts bleiben auf Core-Recoverygrenze relevant (`effect-recovery.ts:14–28`).

Kein eigener Zwischencheckpoint im PipelineReview. Crash nach persistiertem Report, vor Stage-/Artifactprojektion fällt unter **PCR-EXEC-002**; vorhandene Bytes sind nicht automatisch für Consumer projiziert. Keine erfundene Wiederaufnahme oder Transkriptarchivierung. Im README sind echter Reviewer, Transkripte, Retry-/Rate-limit-Parität und no-output recovery selbst als offen ausgewiesen.

### Tatsächlich geprüfte Tests und Restnachweise

**Ausgeführt nur statische Codelektüre und Abgleich der Originalgegenstellen. Keine Tests, CI, Agenten oder externe Send-/Schreiboperationen.**

- `skills/nova/plugins/pipeline-review/tests/protocol.test.mjs`, vollständig gelesen, **nicht ausgeführt**: feste fünf Observations, richtige Protokollkonstante, Ablehnung unbekannter Felder/fehlender Dimension. Kein Evidenceinhalt.
- `tests/live-function.test.ts` desselben Pakets, vollständig gelesen, **nicht ausgeführt**: Originalregistry, HTTP-/Secret-/Artifactadapter mit lokalem fest antwortendem Server. `input.runId='run-1'`, tatsächlicher Run `run:pipeline-review`; Test erwartet ausdrücklich den falschen Namen `pipeline-review:run-1:1`. Der Evidence-Digest ist ein konstanter Beispielwert, ohne zugehörige geladene Source. Kein echter Reviewer.
- `tests/package-boundary.test.mjs` desselben Pakets, vollständig gelesen, **nicht ausgeführt**: Regex-/Manifestprüfungen bestätigen gerade die beiden Fähigkeiten runtime.dispatch/artifacts.write, nicht Evidencequalität.

Historische Originaltestergebnisse im Komponentenreview werden hier nicht als neue Testausführung übernommen. Verbleibend: tatsächliche Auswahl durch Operator, authentifizierter Agentlauf mit vollständigem Runbundle, nachvollziehbare gemessene Verbesserungsgründe, Duplicate-/Stale-/No-output-/Crashmatrix und tatsächlicher Berichtsempfang. Terminales Artefakt ist der letzte hier belegte Produktoutput; keine funktionale Pipelineverbesserung ausgeführt oder behauptet.

### Empfohlene Reihenfolge

1. Reportziel/Ausführung und Evidenzvertrag richtig binden (PCR-PREPORT-001/T15-F01).
2. Gewünschten optionalen Trigger und Umgang mit Berichtfehlern explizit konfigurieren; finale Runprojektion von einem innerhalb desselben Runs ausgeführten Schlussknoten unterscheiden.
3. Echte Quellen-/Agent-/Persistenznachweise durchführen; Verbesserungsvorschläge anschließend separat prüfen und autorisieren.

### T16 — Optionale Case Study und überprüfbarer Projektabschluss

Einzeltrace: [T16-case-study-closeout.md](T16-case-study-closeout.md). Dedizierte Findingeinträge stehen im zentralen Register dieses Gesamtberichts; die gesamte Übergangs-/Zustands-/Prüffolge folgt hier.

**Status:** statischer Trace abgeschlossen. Vorhandene Reporterzeugung ist von Quellenprüfung, Produktabnahme und Veröffentlichung getrennt. **Keine Tests/Agentenläufe/CI ausgeführt, nichts veröffentlicht.**

Geprüfter Commit für alle Sourcebelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Vorreviews gelesen am Stand `a9e080ab1e1981ec5713e9b742f94280835fd347`: `docs/review/components/kubeclaw.case-study.md`, `kubeclaw.project-summary.md` sowie Befundabschnitt `PCR-PREPORT-001` aus `kubeclaw.pipeline-review.md`. Historische Testbehauptungen werden nicht als neue Ergebnisse übernommen.

### Ausgangszustand, Varianten und gewünschtes Ende

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

### Erste fehlende Verbindung und bedingte Fortsetzung

`skills/nova/project/compiler.ts#compileProject:103–137` erzeugt ausschließlich Implementation→Lint→Review→Quality pro Modul und gibt danach zurück. Der Rootvertrag in Zeile 47 erlaubt keine Case-Study-/Summaryoption. Beide Plugins stehen zwar in `packaging/runtime/roles/nova.json:43,51`, aber diese Liste installiert Funktionen, sie löst sie nicht aus. **Erste Lücke im kanonischen Projectpfad:** keinerlei automatische Abschlusskomposition. Dieser Befund bleibt zentral **T01-F02**, hier keine zweite Kennung.

Der ältere Einzelreview `kubeclaw.project-summary.md` behauptet in Abschnitt 1, der Projectcompiler verdrahte Modul- und finale Gates. **Diese Behauptung widerspricht dem nachgelesenen Baselinecompiler.** Die weiteren Aussagen desselben Reviews über die Funktionsweise des Summaryplugins sind davon getrennt zu beurteilen. Das Inventar oder ein abgeschlossener Review wird nicht als Vollständigkeitsbeweis verwendet.

Für die folgenden Schritte wird ausdrücklich angenommen, dass ein autorisierter Aufrufer einen gültigen `pipeline-definition.v2`-Graphen mit erforderlichen Abhängigkeiten, Inputs und Grants anlegt. Das ist ein vorhandener separater Core-Einstieg (`skills/nova/project/cli.ts:10–12`, `skills/nova/core/cli.ts:49–74`), kein hier implementierter Ersatzcompiler und kein gestarteter Run.

### Vollständige Übergangsfolge

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

### Was die Summary tatsächlich garantiert — und was der Graph sicherstellen muss

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

### Fehler, Retries, Zwischenzustände und Abschluss ohne Folgeschritte

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

### Befunde und übernommene Kennungen

#### Bestehende Kompositions- und Abschlusslücken, nicht dupliziert

**T01-F02** bleibt Eigentümer der fehlenden Compiler-Vorphasen/finalen Gates/Summary/Operatorübergabe. T14 prüft Preview, Operatorzugang und Feedbackabschluss (F-T14-01/02); T13 führt die fehlende kumulative Scopebindung zentral als PATH-T13-001. Die Teilstring-Sectionprüfung ist eine ausdrücklich dokumentierte Qualitätsgrenze ohne neue zusätzliche Finding-ID: Markdown mit Markern in Codeblöcken oder leeren Abschnitten kann die Strukturprüfung erfüllen; aus Code abgeleitet, in T16 nicht ausgeführt. Dieses Verhalten ist nicht mit tatsächlicher Veröffentlichung verwechselt.

### Nachweise und verbleibende Laufzeitfragen

Tatsächlich durchgeführt: feste Sourceabfragen, Quell-/Schema-/Registrierungsabgleich, Symbol-/Zeilenprüfung, Abgleich bestehender Reviews und Abstimmung mit T15/T13 und Abgleich T14 zur Befundzuständigkeit. Kein Ausführen von Tests, keine Writer-/Pipelineagenten und keine externen Änderungen.

| Vollständig gelesener Originaltest | Ergebnis in dieser Prüfung / genaue Aussagegrenze |
|---|---|
| `skills/nova/plugins/case-study/tests/protocol.test.mjs` | **Nicht ausgeführt.** Format/unerlaubte Felder/doppelte Marker; keine Quellen-/Faktenprüfung. |
| `skills/nova/plugins/case-study/tests/live-function.test.ts` | **Nicht ausgeführt.** Echte lokale Adapter/HTTP/Artefakte mit fester Serverantwort statt Writeragent; testet callerfremde Runzuordnung, keine tatsächliche Case-Studyqualität. |
| `skills/nova/plugins/project-summary/tests/summary.test.mjs` | **Nicht ausgeführt.** Echter Artefaktstore mit selbst erzeugten Producerfixtures; gültig/fehlend/manipuliert/fremder Run/falsche Qualityrevision. Test sagt selbst providerExecution:false und agentExecution:false. Wiederverwendet dieselben Modul- und finalen IDs. |
| `skills/nova/plugins/project-summary/tests/live-function.test.ts` | **Nicht ausgeführt.** Originalrunner ohne benötigte Evidenz erwartet blocked; kein erfolgreicher kompletter Producer→Summarylauf. |

Offen sind der reale vollständige Produzentenpfad mit finalem kumulativem Scope, Beweiserhalt über Repair/Resume, echte Writerfaktualität und sichere Operatorübermittlung. Veröffentlichung ist ausdrücklich außerhalb dieses Szenarios; im nachgelesenen Stagecode gibt es dafür keinen Aufruf. Ein fehlender Publikationsschritt ist angesichts des Auftrags kein Defekt. Operatorfreigabe eines künftigen Dokuments muss als eigener späterer Vorgang behandelt werden, nicht aus `generated` oder `run.succeeded` erfunden werden.

Empfohlene spätere Reihenfolge: erst Produktkomposition/Scopebindung T01-F02, dann Reportidentitäten PCR-PREPORT-001 und gemeinsame Quellenbindung T15-F01, anschließend echter Writer-/Producerlauf mit menschlicher Abnahme. Abschluss ohne Case Study ist unterstützt durch Weglassen im ursprünglichen expliziten Graphen; ein bereits aktivierter fehlerhafter Folgeschritt wird nicht stillschweigend ignoriert.

## Historische Kennungen — zusammengeführter Quellenanhang

Die folgenden **56 unterschiedlichen historischen Kennungen** kommen in den Traces vor. Der jeweilige Eigentümerabschnitt wird hier inhaltlich aufgenommen, damit dieser Bericht die Findings samt Ursachen- und Prüfbelegen enthält. Kennung, Stand und Quellenlink sind pro Eintrag angegeben. **In diesen übernommenen Abschnitten beschriebene Ausführungen/Passergebnisse gehören ausschließlich zum damaligen Review. In diesem Auftrag wurden diese Tests nicht ausgeführt.** Aktuelle eigene Gegenprüfungen stehen separat im Orchestratorprotokoll. Kontextverweise auf zusätzliche Kennungen innerhalb eines historischen Abschnitts erweitern den neuen Traceumfang nicht stillschweigend.

### IFR-03-002 — historischer Eigentümerbefund

Quelle: [network-dns.md](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/network-dns.md), Reviewref `eac591fb060458ebb6c6ba34599309e8c424bd08`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: Befund IFR-03-002 — Archviewer außerhalb des Tailnet-Authentifizierungspfads

**Mittel; begründeter Expositionsverdacht.** Auslöser: Node-Port ist für nicht vertraute Clients erreichbar und `/designs` enthält schützenswerte Projektartefakte. `my-values/nova-values.yaml:92–94` setzt NodePort30456; `service-extra-nodeports.yaml` erzeugt einen separaten NodePort-Service auch bei primärem ClusterIP. `network-policies.yaml:141–149` erlaubt Backend3456 aus 0.0.0.0/0. `docker/archviewer.nginx.conf:1–12` aktiviert Directory Listing, ohne TLS oder Authentifizierung. Damit ist im Repository ein eigener ungeschützter Artefaktzugang vorgesehen; eine öffentliche Internet-Erreichbarkeit oder vertraulicher Liveinhalt ist nicht nachgewiesen.

Ursachenbehebung: beabsichtigte Lesergruppe festlegen und Archviewer über denselben authentifizierten Zugang führen bzw. den NodePort bei fehlendem Bedarf entfernen; externes Host-Firewallvertrauen ausdrücklich dokumentieren. Echter Test: zulässiger Client kann Artefakte lesen, unzulässiger LAN-/Tailnet-/externer Client erhält keinen Zugriff auf Listing oder Dateien, einschließlich direktem NodePort.

Die offizielle [NetworkPolicy-Referenz](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors) lässt die Reihenfolge von Adressübersetzung und Policy-Prüfung implementationsabhängig. Daraus wird keine konkrete CNI-Version oder Live-Regeldurchsetzung abgeleitet.

### IFR-04-001 — historischer Eigentümerbefund

Quelle: [tailscale.md](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/tailscale.md), Reviewref `eac591fb060458ebb6c6ba34599309e8c424bd08`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: Befund IFR-04-001

**Mittel; offene Frage.** Auslöser: Argo-/Ops-/Prism-Zugriff oder neue Broker-Preview wird als verfügbar betrachtet, obwohl ACL-/Grant-/TagOwner-Konfiguration nicht erfasst ist. Quellen: obige Values, Ingress-Templates und `docs/deployment/tailscale-operator.md`. Auswirkung: Zugriff fehlt oder ist breiter als erwartet. Ursachenbehebung: redigierten externen Zugriffsvertrag mit Tag-Eigentümern, zugelassenen Nutzern und Zweck je Ingress dokumentieren. Test: je ein erlaubter und verbotener echter Tailnet-Client, Proxy-Neustart und OAuth-/Zertifikatrotation.

Manifest- und Aufruferreview abgeschlossen; kein Operator-Chart installiert, keine Tailnet-Daten gelesen. Doku teilweise vorhanden, konkrete externe Konfiguration und Recovery ohne Operator offen. Optionaler Userspace-Tailscale im [Ops-Pod](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/ops-pod.md) ist ein anderer Zugriffsweg.

### IFR-18-001 — historischer Eigentümerbefund

Quelle: [namespace-broker.md](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/namespace-broker.md), Reviewref `eac591fb060458ebb6c6ba34599309e8c424bd08`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: Befund IFR-18-001

**Hoch; nachgewiesener konfigurationsabhängiger Admission-Defekt.** Der Fence matcht nur fest codierte ServiceAccount-Identitäten im Namespace kubeclaw und nur Namespace CREATE/DELETE (`buster-namespace-fence.yaml:21–37`). Helm und `NAMESPACE` erlauben andere Namespaces; Controller-SA/ClusterRoleBinding werden dort dynamisch erzeugt. Auslöser: Installation in abweichendem Namespace. Der vom Chart erzeugte Rollenname ist fest an agentRole gebunden; die Namespace-Änderung allein verändert bereits die vollständige SA-Identität. Der clusterweite Controller darf weiter Namespaces verwalten, fällt aber nicht unter den Fence.

Ursachenbehebung: Admission und Controller-Identität aus einer gemeinsamen Quelle rendern; alle Controllerinstanzen erfassen und nicht nur Namespaces im Hauptskript parametrisieren. Echter Regressionstest: realer API-Server mit VAP, erlaubtes Test-Namespace CREATE/DELETE und verbotene Aktion gegen Kontrollnamespace mit dem **alternativen** Controller-SA prüfen.

### IFR-24-001 — historischer Eigentümerbefund

Quelle: [updates-security.md](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/updates-security.md), Reviewref `eac591fb060458ebb6c6ba34599309e8c424bd08`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: Befund IFR-24-001

**Mittel; nachgewiesene Versionslücke.** `deploy.sh:1027–1032,1109–1132` installiert Tailscale, Redis, PostgreSQL und Qdrant ohne Chartversion. Registry-Manifeste verwenden registry:2; Rootless-Preflight mutable Tag. Diese Installationen werden durch einen zentral gepinnten Docker-Base-Generator nicht reproduzierbar. Auslöser: späterer Bootstrap/Upgrade mit veränderten Chart-/Image-Defaults.

Ursachenbehebung: tatsächliche Infra-Chart-/Imageversionen samt kompatiblen Values explizit binden und durch echten Render-/Upgrade-Test aktualisieren. Regression: Offline-Render mit gesicherten Chartartefakten, Versionsvergleich aller tatsächlichen Installationsaufrufer. Keine aktuell zufällig aufgelösten Upstreamdefaults als geprüfte Baseline übernehmen.

### PCR-APIFLOW-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.api-flow.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.api-flow.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-APIFLOW-001 — hoch: Blockingflow ohne einen Request besteht

Nachgewiesener Defekt. `skills/buster/plugins/api-flow/src/provider.js:113–117,132` klassifiziert unbekannte Variable im Hauptschritt als skipped ohne Finding und bestimmt outcome nur aus Findings. Ein ansonsten gültiger Flow mit `steps:[{id:"required",path:"/{{missing}}",expect:{status:200}}]` liefert `passed`, counts 1/0/0/1, null HTTP-Kontakte. Runner `validateCounts` verbietet dies nicht. Evidenz: `../evidence/buster-provider-boundaries.{mjs,txt}`, Probe `api-flow-all-skipped`. Auswirkung: erforderliches Gate liefert grünes Ergebnis ohne getestetes Verhalten. Ursachenbehebung: obligatorische Ausführungsabdeckung/erforderliche Schritte als separate Bedingung; Skipsemantik bei abhängigen Schritten erhalten. Regression über echte Resolver-/Runnerkette plus lokalen Kontaktzähler; kein Mockresult.

### PCR-APPROVAL-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.human-approval.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.human-approval.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-APPROVAL-001 — Schema akzeptiert unerlaubte Runtimekonfiguration

**Mittel; nachgewiesener Vertragsdefekt.** `schemas/config.schema.json` erlaubt
agentRole, `src/approval.ts:73–75` erlaubt ausschließlich target, issuerId,
timeoutMinutes. Beide Stageregistrierungen verwenden diese Kombination.
Auslöser: config {target:'ops',issuerId:'operator:ops',agentRole:'nova'} passiert
Schema und scheitert sofort im Originalparser. Auswirkung: formal valide
Approvalkonfiguration kann niemals ihren Wait/Zustimmungsprozess ausführen.
Keine Rechteausweitung. Rootfix: agentRole aus diesem nichtagentischen
Approvalvertrag entfernen oder begründete Semantik konsistent implementieren;
kein stilles generisches Wegfiltern. Regression: echte Registryaktivierung und
Stageinvocation mit allen erlaubten Schemafeldern, vor Capabilitycalls denselben
Vertrag erzwingen. Crash-/Operatorauthentifizierung bleiben separate Folgeprüfungen.

### PCR-BUSTER-ENGINE-001 — historischer Eigentümerbefund

Quelle: [buster.engine.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.engine.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-ENGINE-001 — Capabilityarbeit fehlt im Attemptbudget

**Hoch; nachgewiesener Verdrahtungsdefekt.** `runner.ts:1315–1326` measure liest ausschließlich instance.resources; `provider-loader.ts:236–252` misst /proc-Descendants des Providerchild. Capability-RPC (`:267–274`) führt im Busterparent z.B. Browser/Trivy/kubectl/buildctl/CommandRunner aus; diese sind keine Providerchild-Descendants. `remote-plan-service.ts:613–692` routed echte Parentinvoker, und Runner aggregiert deren Kosten nicht. Reportadapter läuft erst nach Measurement. Damit können CPU/RAM/Prozesszahl des Attempts deutlich über deklariertem Nodebudget liegen und als kleine Providerressourcen quittiert werden. Command/Playwright besitzen eigene Operatorlimits, Browser/Scanner teils nur Zeit-/Outputgrenzen; externe BuildKitkosten sind ausdrücklich zusätzlich operatorseitig. **Ursache beheben:** attemptgebundener Ausführungskontext mit gemeinsamer cgroup/Prozessregistrierung oder tatsächlich addierter, nicht providerberichteter Ressourcenmessung und harter Budgetdurchsetzung für alle lokalen Phasen. **Regression:** echter kleiner Provider mit speicher-/CPUverbrauchendem Capabilitychild und Reportadapter; Messwert/Budgetverletzung muss gesamte lokale Arbeit erfassen, einschließlich zweier paralleler RPCs.

### PCR-BUSTER-ENGINE-002 — historischer Eigentümerbefund

Quelle: [buster.engine.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.engine.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-ENGINE-002 — Reportadapterstdin-EPIPE beendet Hostprozess

**Hoch; nachgewiesener Originaltestdefekt.** `report-adapter-runtime.ts:376–393` registriert ChildProcess.error, aber keinen child.stdin.error, und sendet Sourcebase64 per stdin.end. Früh beendete Sandbox schließt Pipe; vorhandener Originaltest `check-pipeline-junit-report-adapter.mts` beendet Node mit unhandled write EPIPE an :382. Promise-/close-Logik fängt dieses Streamereignis nicht. Ein fehlgeschlagener Adapter kann dadurch den ganzen Busterhost statt nur Attemptfinalisierung beenden. **Ursache beheben:** stdinerrors in einmalige Abschluss-/Kill-/Reapinglogik aufnehmen, erst nach Prozessabschluss Ressourcen freigeben; separate Childfehler reichen nicht. **Regression:** unveränderte Originalroutine mit früh schließendem echten Kind und ausreichend Input; kontrollierter Reportadapterfehler und weiterhin antwortender Busterprozess. K8/Tailscale-Spawnduplikat hat denselben Musterfehler, eigener Invokereigentümer PCR-KUBERNETES-FIXTURE-002.

### PCR-BUSTER-ENGINE-003 — historischer Eigentümerbefund

Quelle: [buster.engine.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.engine.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-ENGINE-003 — Capabilityantwort nach Providerende kann unbehandelt rejecten

**Hoch; statisch nachgewiesener Fehlerpfad, gezielter Lauf durch native Sandbox blockiert.** `provider-loader.ts:171` startet `void this.#message(line)` ohne catch. In `#message:267–274` awaitet Parent Capabilityaufruf und sendet danach Antwort; endet Child währenddessen, setzt closehandler #closed. Erstes #send wirft PROCESS_CLOSED, catch sendet erneut und wirft nochmals, Asyncpromise bleibt unbehandelt. Zeitüberschreitende/abgebrochene echte Invoker können diesen Übergang auslösen. Keine Registry-/APIfehlbedienung erforderlich. Zusätzlich existiert kein outstanding-RPC-Limit oder Drain vor Termination. **Ursache beheben:** sessiongebundene RPCregistrierung, cancellation/drain und Send-if-open mit catch am Eventhandler; Fehler nicht durch erneutes Schreiben in geschlossene Session beantworten. **Regression:** echte verzögerte Capability, Provider während await beenden; Dienst bleibt erreichbar, RPC wird beendet, keine unhandledRejection/Restressource. Danach viele parallele Requests gegen definiertes Budget prüfen.

### PCR-BUSTER-ENGINE-004 — historischer Eigentümerbefund

Quelle: [buster.engine.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.engine.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-ENGINE-004 — Terminale Jobs behalten vollständige Quellen und Arbeitsverzeichnisse

**Mittel; nachgewiesener Retentions-/Dokumentationswiderspruch.** `remote-plan-service.ts:143,194,239` speichert/übernimmt vollständigen job inklusive Base64repositoryArchive in jedem terminalen Record; `#execute:592–610,714–726` entfernt nur temporären tar vor Ausführung, nicht extrahierten jobRoot/repository bei Terminalität. Nach Fehler vor Extraktionsende kann auch tar verbleiben. Anders als `buster-v2-runtime.md:43–47` bleiben Sources/Workspace und nicht nur kompakte Receipt erhalten. Record-/Resultquoten begrenzen Teile, wiederholte Jobs blockieren schließlich neue Admission; runtimeRoot hat keinen eigenen Gesamt-/GCvertrag. **Ursache beheben:** explizite Retention mit notwendigem Result/Evidencebezug und idempotentem terminalem GC; Jobrecord kann Sourceattestation/-digest statt dauerhaftem Archive halten, wenn Replayentscheidung dies erlaubt. **Regression:** realer kleiner completed/failed/cancelled Job samt Neustart: angegebene Retention prüfen, Sourceworkspace fristgerecht entfernen und alle noch gültigen Evidence-/Resultreceipts weiter abrufbar halten.

### PCR-BUSTER-NS-001 — historischer Eigentümerbefund

Quelle: [buster.namespace-controller.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.namespace-controller.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-NS-001 — Kubernetes-Token wird nicht erneut gelesen

**Hoch; nachgewiesener Implementierungsdefekt unter rotierendem/ablaufendem ServiceAccount-Token.** `main.go:125–128,153–161,1647` lädt Token einmal in `controller.token`; `kube` setzt anschließend immer denselben Bearer. Chart `:10,167` mountet ServiceAccount-Token. Wird der gemountete Token ersetzt und der alte serverseitig ungültig, bleibt dieser Prozess bei 401; Polling liest keinen neuen Token. Provisioning und die einzige aktive TTLcleanupinstanz fallen dauerhaft bis zum Neustart aus. Exakter Ablaufzeitpunkt hängt am Cluster und wurde nicht live verifiziert. **Ursache beheben:** rotierendes Tokenfile pro Request oder validierte refreshende Transport-Credentials verwenden; keine unendlichen Retries mit unveränderlichen Credentials. **Regression:** Originalcontroller gegen authentisierenden Testserver, gemountetes Testfile zwischen Requests atomar ersetzen, alten Token ablehnen; zweiter Request und TTLreconciliation müssen mit neuem Token gelingen. Kein Secretmaterial in Evidenz speichern.

### PCR-BUSTER-NS-003 — historischer Eigentümerbefund

Quelle: [buster.namespace-controller.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/buster.namespace-controller.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-BUSTER-NS-003 — Eigene konfigurierte RBAC wird als Angriff bewertet

**Hoch; nachgewiesener Code-/Chartwiderspruch, Clusterlauf offen.** `inspectRuntimeSecurityState` (`main.go:521–531`) erlaubt nur `buster-controller-secrets`, `buster-namespace-deployer`, `buster-namespace-tester`. Chart `buster-namespace-controller.yaml:187–196` setzt alle drei Namen auf `<fullname>-…`; `ensureControllerSecretAccess` und `ensureNamespaceAccess` erstellen genau damit RoleBindings. Jeder andere fullname als `buster` erzeugt somit high-Findings über eigene autorisierte Bindings. Zusätzlich fehlen die absichtlich erzeugten `buster-preview-credentials-reader/writer` Roles/Bindings. Securityprovider empfängt diese als echte Findings und kann einen ansonsten sicheren Lauf durchfallen lassen. **Ursache beheben:** Inspektion erhält tatsächliche vom Controller erzeugte RBACverträge einschließlich Credentialmodus; nicht nur Namen freistellen, auch Rolle/Subjects/Regeln/Eigentum prüfen. **Regression:** Ressourcen aus echten Provisioningfunktionen mit alternativem Chartfullname und beiden Credentialmodi inventarisieren: keine Selbstbefunde, veränderte Subjects/RoleRefs bleiben auffällig. Bestehender sicherer Test verwendet leere RBAC-Listen und übersieht diese Gegenstelle.

### PCR-CONTAINER-BUILD-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.container-build.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.container-build.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-CONTAINER-BUILD-001 — Fachlicher Buildfehler wird durch erforderliches Imageoutput zum Ausführungsfehler

**Mittel; nachgewiesener Sender-/Empfängerwiderspruch.** `container-build-runtime.ts:219–226` liefert bei Buildfehler ok=false; `plugins/container-build/src/provider.js:125–147` gibt outcome=failed und outputs=[] zurück. `plugin.json` deklariert image jedoch required=true. `runner.ts#validateAndMapOutputs:516–523` verlangt erforderliche Ausgaben auch bei failed, aufgerufen in collectEvidence; fehlendes Image erzeugt evidenceFault/errored. Damit ist der bewusst implementierte fachliche Buildfehlerpfad über den vollständigen Runner nicht als completed/failed darstellbar. Timeout/Registryfehler werden schon beim Invoker in dieselbe ok=false-Form reduziert und gehen ebenfalls durch diesen Widerspruch. **Ursache beheben:** Requiredoutputpflicht an erfolgreiche Disposition binden oder Imageoutput optional machen, Downstream nur passende Ergebnisse zulassen; Infrastrukturstate zusätzlich typisiert erhalten. **Regression:** unveränderter Originalrunner mit real fehlgeschlagenem Dockerfilebuild muss completed/failed mit keinem Image erzeugen, Erfolgsbuild ohne Image muss weiterhin errored sein; Registryausfall/Timeout müssen eigene Ausführungsdisposition behalten.

### PCR-CONTAINER-BUILD-002 — historischer Eigentümerbefund

Quelle: [kubeclaw.container-build.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.container-build.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-CONTAINER-BUILD-002 — Eigenes Zeitlimit endet vor Registryverify

**Mittel; nachgewiesener Deadlinefehler im Invoker.** `container-build-runtime.ts:207–217` setzt maximumExecutionMs nur auf execFile; `#verify:125–152` benutzt ausschließlich das Aufrufersignal. Schneller Build plus offene Registryantwort kann die invokerseitige Operatorzeitgrenze überschreiten; ohne externen Abort unbegrenzt. Der Runner besitzt ein zusätzliches Nodebudget, ersetzt aber kein kleineres Operatorbudget. **Ursache beheben:** absolute Deadline ab Beginn aller Phasen und kombinierter Abbruch für Build+Verify; Restzeit an jede Operation. **Regression:** realer HTTPserver mit verzögertem Manifestbody, echter vorbereiteter Build; Verify muss spätestens mit Restbudget abbrechen und Reader/Client aufräumen.

### PCR-DELIVERY-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.delivery-lint.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.delivery-lint.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-DELIVERY-001 — Gültige JSON-COPYform wird falsch zurückgewiesen

**Mittel; mit Originalstage und echten Adaptern reproduzierter Defekt.**
`src/stage.ts#copyDestinations` Zeilen 33–38 und staticPathFailures Zeilen 93–104.
Auslöser Dockerfile `COPY ["dist", "public"]`, staticPath `public`. Regex behält
JSONsyntax am extrahierten Token; Vergleich misslingt und liefert request_fix.
Auswirkung: gültige Lieferung blockiert bzw. unnötige Reparaturzyklen; andere
COPYformen können falsche Sicherheit vermitteln. Rootfix parserbasierte
Dockerfile-Semantik mit eindeutigem finalen Ziel; Regression über bestehende
Realdatei-/Runnerroute für Shell/JSON/Multisource/Fortsetzung/WORKDIR/Multistage.
Keine Aussage über erfolgreichen Build aus bloßer Parserkorrektur.

### PCR-DIRECT-COMMAND-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.direct-command.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.direct-command.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-DIRECT-COMMAND-001 — Deklarierbarer Mediatyp passt nur auf erste Ausgabe

**Mittel; nachgewiesener Vertragswiderspruch.** `src/provider.js:59–61,212–217` akzeptiert checked-kubernetes-yaml und size-budget-baseline für jedes deklarierte Artefakt und nummeriert Ausgänge nach Arrayposition. `plugin.json` erlaubt diese Typen nur für artifact-1, für artifact-2…8 fehlen sie; Schema erlaubt sie ebenfalls für jeden Eintrag. Ein Buildoutput als erstes und checked manifest als zweites Artefakt sind gültige Config, führen nach ausgeführtem Command/Copies aber im Runner `validateAndMapOutputs` zu Mediatypfehler. **Ursache beheben:** gleiche Typmenge je generischer Artefaktslot oder positionsabhängige Configvalidierung mit verständlichem Fehler vor Ausführung. **Regression:** echten Resolver/Runner mit zwei kleinen vorhandenen Artefakten und zweitem checked-manifest bzw. size-baseline durchlaufen; gültige Konfiguration darf nicht erst nach Ausführung wegen Manifestdrift scheitern.

### PCR-EFFECT-001 — historischer Eigentümerbefund

Quelle: [nova.effects.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.effects.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-EFFECT-001 — Konflikt nach Lockakquise lässt Ressourcenlock zurück

- **Schweregrad: mittel.** Die Ressource bleibt für andere Attempts blockiert,
  solange der Coreprozess lebt; TTL allein heilt den Zustand nicht. Keine
  Datenkorruption oder unautorisierte Mutation in der Reproduktion.
- **Einordnung: nachgewiesener Defekt**, mit Originalimplementierungen reproduziert.
- **Belege:** `durable-invocation.ts:36–45` akquiriert in Zeile 40, prüft
  anschließend Request/Receipt außerhalb eines finally. Erst
  `#executeLocked:62–74` schützt Freigabe. `locks.ts:101–105` verweigert
  Ersatz bei lebendem Besitzer unabhängig von der abgelaufenen TTL.
- **Auslöser:** erster Journalread liefert keinen Request; eine zweite Instanz
  schreibt denselben Key mit anderer Payload; Core akquiriert Lock, erkennt
  beim zweiten Read den Konflikt und wirft. `#release` wird nicht erreicht.
- **Auswirkung:** konkurrierende Zugriffe auf dieselbe kanonische Ressource
  scheitern weiter mit RESOURCE_LOCKED. Ein Neustart kann Dead-PID-Übernahme
  ermöglichen, ist aber keine dauerhafte Ursachenbehebung.
- **Ursachenbehebung:** unmittelbar nach acquire zentralen try/finally-Bereich
  über alle weiteren Reads, Validierungen, Replay- und Invokewege legen;
  Doppel-Freigabe durch eine klare Besitzerzuständigkeit vermeiden.
- **Regression:** vorhandene Reproduktion nach Reparatur mit erfolgreicher
  Folgeakquise und höherem Fencingtoken, beide echten Journalinstanzen erhalten.
  Ergänzend echter korrupter Journal-/Receiptread nach Akquise: Primärfehler
  sichtbar, keine aktive Lockdatei zurückgelassen.

Nicht dupliziert: PCR-STATE-001/002, PCR-SDK-001 und gemeinsame Retentionsfrage.
Externe automatische Wiederaufnahme bleibt bewusst begrenzt; fehlender echter
Sandboxlauf ist eine sichtbare Testblockade, kein abgeschlossener E2E-Nachweis.

### PCR-EXEC-001 — historischer Eigentümerbefund

Quelle: [nova.execution.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.execution.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-EXEC-001 — Rekonstruierter Wait kann nicht per Signal fortgesetzt werden

- **Schweregrad: mittel.** Ein unterbrochener Run gerät in eine geschlossene
  Recovery-Sackgasse; weder normales Recover noch passendes Resume hilft.
- **Einordnung: nachgewiesener Defekt**, Originalengine plus gültiger Journalpräfix.
- **Belege:** StageExecutor:133–135 persistiert attempt.completed vor
  DecisionRecorder:86–96 orchestrator.required; lifecycle/recovery-state:38–78
  rekonstruiert daraus einen Wait. engine-run:59 verlangt Signal,
  engine-run:77–79,93–100 verlangt einen vorhandenen `payload.wait`-Eintrag.
- **Auslöser:** Ende des Journals nach attempt.completed mit
  orchestrator_required, vor separater Waitzeile. Recover meldet
  RECOVERY_SIGNAL_REQUIRED; passendes Signal meldet WAIT_CREATION_RECORD_MISSING.
  Explizite wait-Ergebnisse haben denselben Codepfad; lokale Probe deckt
  orchestrator_required konkret ab.
- **Auswirkung:** keine unautorisierte Fortsetzung, aber dauerhaft blockierte
  Wiederaufnahme ohne zusätzliche administrative Datenreparatur.
- **Ursachenbehebung:** Waitidentität und Erstellungszeit aus dem durable
  Attemptresult deterministisch ableiten und dieselbe Quelle live/replay/resume
  verwenden; falls eigene Projektion bleibt, vor Signalanforderung idempotent
  materialisieren. Keine Ausnahmeregel, die Herkunftsprüfung einfach auslässt.
- **Regression:** Originalprobe muss nach gültigem Signal genau einen weiteren
  Attempt erfolgreich ausführen. Für wait, orchestrator_required und
  Retryschwellen-Continue alle gültigen Präfixe prüfen; unveränderter Issuer-/
  Ablauf-/Signalreplayschutz muss weiterhin ablehnen.

### PCR-EXEC-002 — historischer Eigentümerbefund

Quelle: [nova.execution.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.execution.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-EXEC-002 — Resultartefakt verschwindet aus der Recoveryprojektion

- **Schweregrad: mittel.** Persistierter Bericht wird nach Crash nicht an
  nachfolgende Stages/Beobachter vermittelt, obwohl Producer als erfolgreich gilt.
- **Einordnung: nachgewiesener Defekt** der Projektion; kein Verlust der
  zugrunde liegenden Blobdatei behauptet.
- **Belege:** StageExecutor:40–43,133–135 schreibt vollständiges Attemptresult;
  DecisionRecorder:28–31,48–56 projiziert Artefakte erst danach.
  ArtifactCheckpointRecorder:100–109 liest nur artifact.created;
  recovery-state:38–55 stellt Stageerfolg aus attempt.completed wieder her.
- **Auslöser:** echtes Delivery-Lint-Ergebnis enthält Report ohne checkpoint:true;
  Crashpräfix endet nach attempt.completed. Recover succeeds, attemptsUsed bleibt 1,
  aber weiterhin keine artifact.created-Zeile. Originalprobe bestätigt dies.
- **Auswirkung:** `StageExecutor.#priorArtifacts:92–101` kann den Bericht nicht
  aus dem Index liefern; ein konkreter nachfolgender Consumerlauf wurde nicht
  zusätzlich ausgeführt. Das Result selbst enthält die Referenz weiterhin.
- **Ursachenbehebung:** Resultartefakte beim Replay aus der kanonischen
  Attemptabschlussquelle identisch validieren und idempotent projizieren, bevor
  Stageerfolg/abhängige Ausführung freigegeben wird. Nicht alle Provider zu
  obligatorischen Checkpoints umbauen, um die Corelücke zu kaschieren.
- **Regression:** Original-Delivery-Lint-Präfix wieder aufnehmen, exakt eine
  Artefaktprojektion herstellen und einen echten abhängigen Leser denselben
  Digest aus dem Artefaktspeicher lesen lassen; kein erneuter Producerattempt.

Beide Befunde sind zentrale Eigentümer für [nova.lifecycle](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.lifecycle.md).
Keine doppelten Findings dort oder bei den betroffenen Stages anlegen.

### PCR-GIT-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.git-workspace.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.git-workspace.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-GIT-001 — sync_paths meldet Ausführungsfehler als fehlende Dateien

Schweregrad hoch: valide Kontrollevidenz wird als abwesend bewertet, echte
Timeouts/Abbrüche/Outputlimits werden fachlicher request_fix statt operativer
Fehler; mehrere Dateien können schon verändert worden sein. Nachgewiesener
Defekt, `src/operations.ts:32–45 syncPaths`, insbesondere catch um runner.run(show).
Auslöser vorhandener Blob größer maxOutputBytes, ungültiges Ref oder Abort.
Ablauf: GitRunner wirft, catch fügt Pfad zu missing hinzu und setzt Schleife fort.
Blueprint-Empfänger stage.ts:21–48 schreibt diese falsche Disposition dauerhaft.
Echte Repros oben. Ursachenbehebung: Blobabwesenheit separat durch strukturiertes
Git-Existenzprotokoll bestimmen; Abort/Timeout/Limit/ungültige Ref weiterwerfen.
Regression mit realem Git: missing Blob, invalid ref, Ausgabegrenze, Abort und
partielle Mehrdateisynchronisierung müssen unterscheidbar bleiben.

### PCR-HTTP-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.http.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.http.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-HTTP-001 — mittel: Schema-Default verwirft öffentlichen Endpointpfad

Nachgewiesener Defekt (Original-Schemaauflösung + Originalprovider + lokaler HTTP-Invoker). `skills/buster/plugins/http/schemas/config.schema.json` setzt für `path` den Default `/`; `skills/common/plugin-runtime/foundation/registry/schema.ts:34,87–98` trägt ihn vor Ausführung ein. `provider.js:53–54,107` möchte ohne expliziten Pfad den Fixturepfad verwenden, sieht aber bereits `/`. Auslöser: Endpoint-URL `/health` bei fehlendem config.path. Der Provider prüft `/`; ein anderer gesunder Root kann das Gate fälschlich grün machen. Evidenz `../evidence/buster-provider-boundaries.{mjs,txt}`, Probe `http-resolved-endpoint-path`. Ursachenbehebung: dynamische Fallbackentscheidung erhalten, statischen Schema-Default entfernen oder explizite Herkunft des Pfads modellieren. Regression: echten Plan auflösen, getrennte Root-/Health-Antworten liefern und tatsächlich kontaktierten Pfad prüfen.

### PCR-IMPLEMENTATION-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.implementation-agent.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.implementation-agent.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-IMPLEMENTATION-001 — Erzeugter Worktree erreicht Forge nicht

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

### PCR-KUBERNETES-FIXTURE-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.kubernetes-fixture.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.kubernetes-fixture.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-KUBERNETES-FIXTURE-001 — Ressourcenlimit erst nach Aliasexpansion

**Hoch; nachgewiesene fehlende Schranke, Schadensausmaß statisch begründet.** `kubernetes-fixture-runtime.ts:160–171,329–334` traversiert alle `List.items` rekursiv ohne Zyklus-, Tiefen-/Besuchszähler; erst nach vollständigem `flattenDocuments` wird maximumResources geprüft. YAML kann Listen als Aliase mehrfach referenzieren. Kleine verschachtelte DAGs erzeugen exponentiell viele Pushes in `out`, in der vertrauenswürdigen Buster-Parenteventloop; Bytebudget und Providerprozesslimit greifen dort nicht. Zyklen führen zumindest Stackoverflow, große DAGs können den Dienst vor Limitprüfung erschöpfen. **Ursache beheben:** bounded iterative Traversierung mit maximalen Knoten/Ressourcen/Tiefe und Zyklusprüfung vor jedem Besuch, YAMLaliasbudget; Parsing ebenfalls außerhalb unbegrenzter Parentarbeit. **Regression:** echte YAML-Dateien für Zyklus, tiefe Listen und geteilte Alias-DAG durch Originalinvoker, in separatem begrenztem Testprozess; früher definierter Fehler vor kubectl und unabhängig von exponentieller Expansion.

### PCR-KUBERNETES-FIXTURE-002 — historischer Eigentümerbefund

Quelle: [kubeclaw.kubernetes-fixture.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.kubernetes-fixture.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-KUBERNETES-FIXTURE-002 — Schreibpipe kann den Busterprozess beenden

**Hoch; nachgewiesener fehlender Errorhandler.** `executeProcess` (`runtime.ts:33–68`) endet stdin mit Manifestbytes, registriert `error` nur auf ChildProcess, nicht auf child.stdin. Beendet kubectl seinen Lesevorgang früh (z.B. Auth-/Serverfehler während großer Applyeingabe), kann WriteStream EPIPE auslösen; EventEmitter ohne Handler macht daraus einen unbehandelten Prozessfehler. Parentcatch behandelt nur Promise-Reject, nicht dieses Event. Gleiche eigene Spawnkopie in tailscale-exposure-runtime.ts; owner hier. **Ursache beheben:** stdin-Fehler in dieselbe einmalige Abschluss-/Reapinglogik überführen, verbleibende Writes stoppen, Kind vollständig abwarten. **Regression:** echter früh abbrechender Childprozess und großer stdin-Payload; Originalausführung muss kontrolliert rejecten und Busterhost bleibt verfügbar. Kein grüner Clusterersatz als Testnachweis.

### PCR-LINT-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.lint.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.lint.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-LINT-001 — hoch: generische Targets verlassen die freigegebene Repositorygrenze

`engine/policy.ts:310–355` prüft generische Targets nur lexikalisch/existent;
`discovery.ts:86–114` folgt statSync beziehungsweise existsSync und übergibt diese
Pfade an native Tools. Trigger: freigegebenes Repo mit konfiguriertem `src`, das
als Symlink auf ein außerhalb liegendes Verzeichnis zeigt, oder entsprechender
changedFiles-Eintrag. Originalprobe akzeptiert Policytargets und liefert in
beiden Modi `repo/src/external.sh`, dessen realpath `outside/external.sh` ist.
Damit kann repositorykontrollierter Inhalt lokale Quelldateien außerhalb der
Grantgrenze in Analyse/Findings einbeziehen. Keine Exfiltration oder Mutation
außerhalb der kontrollierten Fixture behauptet. Rootfix: jede Projekt-/Target-/
Changedfileauflösung kanonisch gegen den freigegebenen Root binden, Symlinks
ablehnen oder sicher innerhalb halten; beim Öffnen Race gegen Austausch beachten.
Regression über echten Adapter/Nativeprogramm mit Target-, Projektroot-,
Changedfile- und Parent-Symlinkvarianten. Kubernetes-Spezialschutz nicht entfernen.

### PCR-LINT-002 — historischer Eigentümerbefund

Quelle: [kubeclaw.lint.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.lint.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-LINT-002 — hoch: laufender Lintversuch besitzt keinen wirksamen Abbruch-Lifecycle

`adapter.ts:64–82`, `engine/index.ts`, `engine/execution.ts:82–104` und
`candidate.ts`: Signal wird nach Eintritt nicht weitergegeben; synchrone
Subprozesse verhindern zudem Timerverarbeitung. Originalprobe führt /bin/sleep
0.12 aus; der vorher gesetzte 5-ms-Timer ist nach 151 ms noch nicht gelaufen.
Das belegt Eventloopblockade; vollständiger Claimverlust-/Prozessbaumtest wurde
nicht ausgeführt. Wirkung: Deadline/Shutdown/Lease-Abbruch kann Analyse nicht
zuverlässig stoppen, weitere Toolphasen erhalten kein Restbudget, native
Nachfahren sind nicht gemeinschaftlich beendet. Ursachenfix: async spawn mit
durchgereichtem AbortSignal, absolutem Restbudget einschließlich Git/Report/
Aufräumen, Prozessgruppen-TERM/KILL/Reaping und shutdown-Verfolgung. Regression:
echtes langlaufendes Tool mit Nachfahren, Abbruch nach Start und messbar begrenzte
Gesamtdauer/Restprozesse. Anderer Eigentümer als PCR-COMMAND-001: dieser Adapter
umgeht den CommandRunner vollständig.

### PCR-LINT-003 — historischer Eigentümerbefund

Quelle: [kubeclaw.lint.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.lint.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-LINT-003 — mittel: echte native Timeouts werden als Startfehler klassifiziert

`execution.ts:74–76,105–120` erkennt ausschließlich error.killed. Original
execFileSync-Probe /bin/sleep 0.15 mit timeout20 liefert ETIMEDOUT,
exitCode -1, timedOut false; requireToolExecution erzeugt probe-execution-failed
statt probe-timeout. Gate bleibt blockiert, aber diagnostische Disposition und
eventuelle Recoverysteuerung verlieren die Timeoutursache. Fix: tatsächlichen
ChildProcess-Timeoutcode/-zustand explizit klassifizieren, getrennt von ENOENT,
Outputoverflow und fachlichem nonzero. Regression mit realem Timeout, fehlendem
Programm und ordinary finding exit; nicht über ein künstliches killed-Feld.

### PCR-NOTIFY-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.notification-observer.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.notification-observer.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-NOTIFY-001 — Projektion erzeugt vom eigenen Provider abgelehnte Nachrichten

**Mittel, nachgewiesener Defekt.** `src/observer.ts:58–61,82–89,117–142`
bounded/reasonCode/lifecycleNotification; Empfänger
`operator-messaging/src/payload.ts:16–22,80–93`. Eine gültige kanonische
summary mit Newline bleibt unverändert und wird OPERATOR_PAYLOAD_INVALID:summary.
reasonCode mit 257 Zeichen wird auf 256 plus Ellipse gekürzt und dadurch
OPERATOR_PAYLOAD_INVALID:reasonCode. Quellprobe führt beide Originalseiten aus.
Auswirkung: Benachrichtigung fehlt, Folgebenachrichtigungen desselben Runs
bleiben nach ausgeschöpften Versuchen zurück; fachlicher Run selbst bleibt intakt.
Ursache ist getrennter, inkompatibler Darstellungs-/Empfängervertrag. Behebung:
zulässige mehrzeilige Textfelder ausdrücklich gemeinsam definieren, sonst
normalisieren; Kürzungsmarker innerhalb des Limits zählen. Regression durch
originalen Observer→Operatorpfad mit Newlines, exakt256/257-Zeichenreason und
maximalen Labels, anschließend nachfolgendes Event erfolgreich zustellen.

### PCR-NOVA-GATE-001 — historischer Eigentümerbefund

Quelle: [nova.test-gates.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.test-gates.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-NOVA-GATE-001 — Timeout nach verlorenem Submit lässt Job laufen

**Mittel; nachgewiesener Defekt.** Remote-Arbeit kann trotz lokalem Timeout
weiter Ressourcen und externe Aktionen beanspruchen; kein genereller Datenverlust.
Belege: `remote-dispatch.ts:188–202,215–230`; Gegenstelle
`buster/engine/test-gates/remote-plan-service.ts:505–519` cancelt nur auf Anfrage.
Buster nimmt POST an, Proxy verwirft Submit-/Statusantworten, Deadline läuft aus:
Zeile 200 wirft ohne Cancel, äußerer catch prüft nur Callerabort. Originalprobe
zeigt `running`, `NOVA_REMOTE_PLAN_TIMEOUT`, **0 DELETEs**.
Ursache beheben: ein gemeinsamer zeitbegrenzter Cancel-/Reconciliationabschluss
für jeden Deadline-/Abortpfad, unbekannten Remotestatus sichtbar halten.
Regression: echter Service und verlorene Antworten wie
[nova-remote-timeouts.mjs](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/nova-remote-timeouts.mjs), danach Cancel-
Anfrage und terminales Ergebnis nachweisen; zusätzlich Timeout während Bodylesen.

### PCR-NOVA-GATE-002 — historischer Eigentümerbefund

Quelle: [nova.test-gates.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.test-gates.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-NOVA-GATE-002 — Gate-Zeitlimit endet vor Ergebnisimport

**Mittel; nachgewiesener Defekt.** `NovaRemoteTestGate.execute` kann über timeoutMs
hinaus hängen; CLI hat keine äußere Stageuhr. Belege: `remote-result-import.ts:
285–312,330–333`, `production.ts:60–73`, `remote-gate-cli.ts:29–35`.
Nach Completedstatus hält der reale Proxy GET results offen. Bei 300 ms Limit
ist die Operation nach 900 ms weiter pending; nur zusätzlicher Callerabort
beendet sie. Synchrone Archivkonstruktion liegt ebenfalls außerhalb der Uhr,
aber dafür wurde kein Laufzeithänger provoziert.
Ursache beheben: absolute Deadline vom Eintritt bis einschließlich Import und
Persistenz; abbrechbare, begrenzte Gitprozesse. Bereits abgeschlossene Remote-
Arbeit bei Importabbruch über dauerhaften Importzustand wieder aufnehmen.
Regression: ursprünglicher HTTP-/Importpfad mit verzögerten Result- UND
Evidenceantworten muss innerhalb Deadline plus dokumentierter Cleanupfrist enden.

### PCR-NOVA-GATE-003 — historischer Eigentümerbefund

Quelle: [nova.test-gates.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.test-gates.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-NOVA-GATE-003 — IPv6loopback im SPIFFE-Modus fälschlich abgelehnt

**Niedrig; nachgewiesener Defekt.** Ausschließlich legitime IPv6konfiguration
blockiert, kein Autorisierungsbypass. `remote-dispatch.ts:251–253` vergleicht
URL.hostname mit `::1`; Node liefert `[::1]`. Dieselbe Prüfung im
`remote-test-gate/src/adapter.ts:51–53`; zentrale Zuständigkeit hier.
Originalconstructor mit `http://[::1]:8080` wirft NOT_LOOPBACK, obwohl
`secure-endpoint.ts` diesen Loopback akzeptiert.
Ursache: konsistente kanonische Loopbackklassifikation an beiden Grenzen.
Regression: Originalfactory/Adapter mit IPv4, IPv6, localhost und Nichtloopback;
Proxyvertrauen nicht erweitern. [Probe](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/nova-resolver-examples.mjs).

### PCR-NOVA-GATE-004 — historischer Eigentümerbefund

Quelle: [nova.test-gates.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.test-gates.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-NOVA-GATE-004 — Storegesamtquote als Einzelbloblimit übergeben

**Mittel; nachgewiesener Defekt.** Konfigurierte Archiv-/Evidence-Gesamtbudgets
begrenzen den Store nicht; mehrere unterschiedliche Blobs können sie übersteigen.
Belege: `remote-dispatch.ts:77`, `remote-result-import.ts:216`; Empfänger
`common/plugin-runtime/foundation/observability/durable-records.ts:213–228,261`:
Gesamtquote ist dritter optionaler Parameter, Nova setzt nur den zweiten.
Zwei echte Gitarchive im Original-Dispatchstore überschreiten die konfigurierte
Gesamtquote; [Messung](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/nova-archive-budget.txt),
[Probe](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/nova-archive-budget.mjs). Evidencepfad identischer
Constructorfehler durch Code nachgewiesen, kein separater Multijob-Importlauf.
Ursache beheben: Einzelbloblimit und Gesamtquote korrekt getrennt verdrahten,
atomare Foundationbudgetprüfung nutzen. Regression: zwei verschiedene Archive/
Evidenceblobs einzeln zulässig, zusammen zu groß; zweiter Import darf nicht
complete werden, bestehende Blobs bleiben lesbar, Deduplikation kostet keine
zweite Quote. Kein Disk-full-Test ausgeführt.

### PCR-NOVA-GATE-005 — historischer Eigentümerbefund

Quelle: [nova.test-gates.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.test-gates.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-NOVA-GATE-005 — Prozessrestarttest erwartet entfernte Graphdatei

**Niedrig; nachgewiesener Testdefekt durch Codevergleich.**
`check-pipeline-remote-process-restart.mts:223–225` liest
`nova-state/execution-graph/records/store.json`. `production.ts:104–108`
komponiert nur imports, dessen `readExecutionGraphs:218–224` aus vollständigen
Importrecords ableitet. Originalimporttest prüft ausdrücklich, dass eine
vergiftete obsolete execution-graph-Position keine Autorität hat.
Auswirkung: auch nach erfolgreicher Providerisolation würde der Prozessproof an
dieser entfernten Datei scheitern, bevor sein Buster-Restartteil erreicht wird.
Kein aktueller Prozesslauf bis zu diesem ENOENT behauptet.
Ursache beheben: tatsächlichen dauerhaften Import über öffentliche Graphlese-API
nach Neustart prüfen; keine alte Datei wieder einführen. Regression: vorhandenen
echten SIGKILL-Test danach vollständig mit Originalsandbox ausführen.

Offen: Listenerwachstum, explizites Bodycleanup, Multijob-/Mehrprozess-Importquota,
Matrix-/JSON-Tiefenbelastung, Offline-Reimport und echte Crashpräfixe der
Importpersistenz. Diese Grenzen sind sichtbar untersucht bzw. abgegrenzt;
fehlende Laufzeitnachweise werden nicht als bestanden gezählt.

### PCR-OPENAPI-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.openapi.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.openapi.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-OPENAPI-001 — hoch: Verbietendes Array-Itemschema wird ignoriert

Nachgewiesener Defekt. `skills/buster/plugins/openapi/src/provider.js:94–103` benutzt `if (schema.items)` statt Presencecheck. OpenAPI 3.1 Response `{type:"array",items:false}` akzeptiert reale HTTP-Antwort `[1]` mit outcome passed; booleans werden am Schemaroot korrekt behandelt, der Aufruf dorthin entfällt. Evidenz `../evidence/buster-provider-boundaries.{mjs,txt}`. Ursachenbehebung: false explizit auswerten, Dialektunterstützung vollständig oder fail-closed deklarieren. Regression: leer/nichtleer, Request und Response, false/true/Object in allen Kindpositionen.

### PCR-OPENAPI-002 — historischer Eigentümerbefund

Quelle: [kubeclaw.openapi.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.openapi.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-OPENAPI-002 — mittel: Operatorfehler werden fachliches Testergebnis

Nachgewiesener Defekt in der Fehlerdisposition. `provider.js:244–247` fängt jede Ausnahme, daraus werden über `output:177–180` offene `failed` Findings. Der Originalinvoker lehnt fremde Origin vor Kontakt ab; Provider liefert trotzdem abgeschlossenen fehlgeschlagenen Fachtest (`openapi-policy-disposition`, null zusätzliche Kontakte). API-Flow `provider.js:132` besitzt denselben Pattern; Eigentümer dieses gemeinsamen Befunds hier. Die Origin bleibt geschützt, daher kein Autorisierungsdurchbruch; Diagnose, Wiederholungs-/Dispositionregeln verlieren aber Operator-/Ausführungsfehler. Ursachenbehebung: typisierte Capabilityfehlertaxonomie erhalten, nur deklarierte Assertionfehler fachlich einstufen. Regression mit echtem verweigerten Ziel, Responsegrößenüberschreitung und abgebrochener Operation; Worker-Cancel darf weiterhin Vorrang haben.

### PCR-OPERATOR-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.operator-messaging.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.operator-messaging.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-OPERATOR-001 — Transienter Sendefehler verbraucht Observer-Retries ohne neuen Send

**Mittel, nachgewiesener Integrationsdefekt.**
Sender `skills/nova/core/telemetry/observer-delivery.ts:17–30` benutzt trotz
steigendem deliveryAttempt immer dieselbe Attemptidentität/Nummer1 und denselben
Effectkey. `core/effects/durable-invocation.ts:46–49,119–126` liefert jedes
bereits gespeicherte Receipt einschließlich failed zurück. Zusätzlich
`operator-messaging/src/adapter.ts:103–108` cached failure pro Attempt.
Originalprobe: einmaliger HTTP503, anschließend gesunder localhost-Empfänger;
alle fünf Observerversuche scheitern, Netzwerk sieht nur1 Request, Checkpoint
bleibt0 und nächster Drain meldet ATTEMPTS_EXHAUSTED. Auswirkung: transienter
Sendausfall wird dauerhaft fehlende Nachricht und blockiert spätere Lifecycle-
Nachrichten desselben Runs. Telemetry-/Transportprovider unter derselben Core-
Retrygrenze ebenfalls betroffen; Eigentümer hier, keine Doppelzählung.
Ursachenbehebung: explizite retrybare Failure-/ungewisse Outcome-Disposition,
stabile externe Delivery-ID getrennt von neuem Ausführungsattempt; Core- und
Sinkreceipts gemeinsam reconciliieren. Nur attemptNumber erhöhen verletzt
bestehende Effectkeyidentität und repariert nichts. Regression: bestehende
Originalprobe nach Fix muss zweiten Send/Checkpoint zeigen, dauerhafte Ablehnung
bleibt begrenzt, verlorenes Remote-ACK erzeugt bei deduplizierendem Empfänger
keine doppelte Wirkung, Restart darf Retrybudget nicht zurücksetzen.

### PCR-PREFLIGHT-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.preflight-contract.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.preflight-contract.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-PREFLIGHT-001 — Dateinennung wird als Lieferdeklaration akzeptiert

**Mittel; nachgewiesener Defekt der deklarierten Preflightaussage.**
`src/stage.ts`, validateDeclarations, insbesondere `content.includes(name)` in
beiden Zweigen (Zeilen 84–102 am Baseline). Auslöser: gültiger Blueprinttext
„Do not deliver Dockerfile or openapi.yaml. These files belong to another project.“
bei Input mit diesen eigenen Dateien. Originalfunktion liefert keine Failure.
Auswirkung: fehlende oder explizit ausgeschlossene Deliverables passieren den
Preflight; außerdem genügt gleichnamige Datei an anderer Stelle. Dies behauptet
keine spätere erfolgreiche Build-/Reviewumgehung. Lösung an der Ursache:
maschinenlesbare normalisierte Deliverablepfade als gemeinsame Quelle prüfen,
Prosa als Erklärung behalten. Echter Regressionstest: solche negierten/fremden
Basenamen durch vorhandenen Realdatei-/Runnerpfad führen, bis ausschließlich
explizite richtige Pfaddeklarationen bestehen. Ownership-Verzeichnisse und
Substepzuordnung dabei separat spezifizieren.

### PCR-PREPORT-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.pipeline-review.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.pipeline-review.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-PREPORT-001 — Calleridentität statt aktiver Run-/Attemptbindung

**Niedrig; nachgewiesener Dokumentations-/Provenienzvertragsdefekt durch Code und bestehenden Originaltest.**
`src/protocol.ts:10–13,31`, `src/stage.ts:7–15` übernehmen Inputidentität ohne
Vergleich mit `context.contract.lease.attempt`; Runtime-HTTP sendet sie unverändert.
Auslöser: Graph für Run B enthält Berichtinput Run A oder ein neuer Attempt
verwendet die alte input.attempt. Parser ergänzt A, Artefaktname enthält A,
Coreproducer bleibt B. Auswirkung: falsch zugeordnete Berichte/Auditinterpretation;
kein behaupteter ACLbypass. Gleiche Ursache in
[case-study](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.case-study.md), `src/protocol.ts:5–6,21`, stage.ts.
Ursachenbehebung: Berichtziel (auch historischer Run zulässig) und ausführenden
Run/Attempt ausdrücklich unterscheiden. Ausführungsidentität aus Lease ableiten;
angefragte historische Identität als solche kennzeichnen, Dokumentation und
Evidenzbindung an diese Semantik anpassen. Historische Reports nicht verbieten.
Echter Regressionstest: bestehende Realadaptertests mit Run A/B und zwei echten
Coreattempts erweitern, Artefaktinhalt und Producer auf Gleichheit prüfen.
Zusätzlich offene Qualitätsfrage: Welche Instanz liefert dem Reviewer die
Inhalte der nur als Digests übergebenen Evidenz? Ein Formatpass beantwortet das nicht.

### PCR-PRISM-AGENT-BRIDGE-001 — historischer Eigentümerbefund

Quelle: [prism.service-agent-bridge.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-agent-bridge.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-AGENT-BRIDGE-001 — Angenommene Aufträge sind nach Neustart verloren

**Hoch; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** agent-bridge.mjs:37–44 speichert nur Promises, :75–76/:91–92/:104–105 quittiert202 vor Agentabschluss. Prozessneustart nach202 vor toolcommit verliert queued Tasks; Controlpersistenz speichert Designrequest, aber keine erneut abzuarbeitende Agentjobphase. Laufender Kindprozess kann ungewiss noch Werkzeugwrites ausführen. Folge: wartender Pipeline-/Studiovorgang ohne terminales Ergebnis oder Recovery; Retry kann Doppelagenten erzeugen. Ursache: EmpfangsACK ohne dauerhaften Job-/Receiptzustand. Behebung: persistierter Job mit requestdigest/idempotency/claim, explizite accepted/running/terminal-Reconciliation und Abbruch-/Unknownpolicy. Regression: Originalbridge/Agent+Control, echte Abbrüche nach202, vor spawn und nach Toolcommit; Neustart verarbeitet genau notwendige Jobs weiter und liefert durable Outcome ohne doppelte Revision.

### PCR-PRISM-AGENT-BRIDGE-002 — historischer Eigentümerbefund

Quelle: [prism.service-agent-bridge.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-agent-bridge.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-AGENT-BRIDGE-002 — Sanitizing und Kürzung kollidieren Projektsessions

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** :66/:83/:97 bilden sessionKey über replace und slice96. Unterschiedliche erlaubte lange Projektkeys mit identischen ersten96Zeichen erhalten denselben OpenClawkontext; die separate Queue serialisiert sie, trennt aber Historie nicht. Folge: fremder Projektkontext beeinflusst nachfolgenden Agentenauftrag; Controlprojektprüfungen begrenzen einzelne Writes, lösen den Kontextmix nicht. Behebung: stabiler Digest des vollständigen externen ProjektIDs mit lesbarem Präfix, Scope/Namensraum explizit. Regression: zwei Original-Designrequests mit langer gemeinsamer Präfix-ID und verschiedene Sonderzeichen, getrennte Sessions/History und jeweils richtige Controlprojektbindung.

### PCR-PRISM-CONTROL-001 — historischer Eigentümerbefund

Quelle: [prism.service-control.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-control.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-CONTROL-001 — Worker-Ergebnis ohne Envelope-Bindung angenommen

- Schweregrad: mittel; falsches oder falsch korreliertes completed-Ergebnis kann
  als Antwort auf den aktuellen Auftrag gespeichert werden. Kein Nachweis einer
  ausnutzbaren Netzwerkinjektion; Transportauthentisierung bleibt eigene Grenze.
- Evidenzklasse: nachgewiesene Validierungslücke im Code-Trace; Laufzeit-Negativtest
  gegen Originaldienste noch offen.
- Belege: `control.ts:198–210` castet JSON auf ein Partial-Shape, prüft ausschließlich
  state und liest Specialist-Werte/Evidence. Es fehlen Worker-Vertragsvalidierung,
  Result-Digest und Vergleich mit der zuvor erzeugten Attempt-/Claim-/Worker-ID.
  `:210–215` persistiert unter der aktuellen Idempotenzkennung. Worker sendet den
  vollständigen Vertrag (`worker.ts:157–158`); Contract-Helfer existieren, sind
  am Empfänger aber nicht aufgerufen.
- Auslöser: authentisierter Worker liefert ein syntaktisch gültiges completed-
  Objekt zu anderem Attempt oder mit verändertem neutralem Result-Digest.
- Auswirkung: neutrale Ergebnisintegrität/Korrelation wird vor Commit nicht
  geprüft. Inhaltliche Folgeprüfungen ersetzen diesen Identitätsvergleich nicht.
- Ursachenbehebung: eine gemeinsame Eingangsgrenze aus Schema-/Digestprüfung,
  vollständiger Envelope-Bindung und operation-spezifischem Result-Schema nutzen;
  erst danach Evidenz importieren und DB-Result committen.
- Verifikation: echten Control-Handler mit realem Postgres und kontrolliertem
  authentisierten Transport exercisen; vollständig gültiges Worker-Ergebnis
  eines anderen echten Attempts zurückspielen und Ablehnung vor Persistenz
  verlangen. Nicht nur einen Mock-Parser testen. Anschließend gültigen Pfad prüfen.

Weitere Befunde werden nicht dupliziert: fehlender Logs-Store und kumulative
CPU-Messung gehören [prism.service-worker](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-worker.md).
Dokumentationsstatus vorhanden und unvollständig; Vollabgleich unten.

### PCR-PRISM-CONTROL-002 — historischer Eigentümerbefund

Quelle: [prism.service-control.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-control.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-CONTROL-002 — Directionevent-ID verletzt UUID-Spalte nach Zustandscommit

- **Hoch; Evidenzklasse: nachgewiesener Defekt.** control.ts:504,552 erstellt `event-${randomBytes(12).toString("hex")}`, Inserts :519–522/:567–578 senden diese ID an `prism.preference_event.id`; migrations/001_prism.sql definiert diese als uuid. PGliteprobe bestätigt `invalid input syntax for type uuid` für exakt diese Form; kein voller HTTPfluss behauptet.
- **Auslöser/Ablauf:** Select einer vorgeschlagenen Direction oder Feedback (auch liked/disliked) → Eventinsert scheitert immer. Select/Reject haben davor per pool.query Directionzustand bereits committed. API antwortet422; Selectretry findet keine proposed Direction mehr, Preferencebeleg fehlt dauerhaft. Auch /v1/preferences erlaubt schema-konforme nicht-UUID-EventIDs.
- **Ursache/Behebung:** Wire-eventId und SQLid wurden ohne passenden Persistenzvertrag gleichgesetzt; zusätzlich fehlt atomarer Direction-/Eventcommit. UUID als interne Zeilen-ID getrennt von eindeutigem Wire-eventId oder SQLtyp dem Vertrag angleichen; Directionwechsel/Event in gemeinsamer Transaktion mit Replaykennung.
- **Regression:** Original-Control + echter temporärer Postgres, Select und vier Feedbackaktionen mit gültiger Session durchführen;200/201 plus konsistente Direction/Eventzeile. Injizierter DBfehler vor Event muss Directionrollback bewirken; verlorenes ACK muss wiederholbar dieselbe Entscheidung liefern.

Ausführungsprotokoll der ersten Testgruppe: [prism-core-review-tests.txt](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/prism-core-review-tests.txt) (aus Originalausgabe transkribierte Zusammenfassung, kein nachträglich erzeugtes TAP).

Direkte Probeausgabe: [prism-service-review-probe.txt](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/prism-service-review-probe.txt).

### PCR-PRISM-PREFERENCES-001 — historischer Eigentümerbefund

Quelle: [prism.preferences.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.preferences.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-PREFERENCES-001 — Projektidentität fehlt im Aggregationsschlüssel

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** index.ts:61–72 baut Key aus projection, learningScope, context und trait, ohne event.projectId. Control.ts:1119–1132 erlaubt GET ohne project, lädt dann sämtliche Ereignisse desselben Subjects und ruft diese Projektion auf. Zwei project-scoped Gegenpräferenzen zu gleichem Trait in getrennten Projekten neutralisieren sich oder verstärken sich projektübergreifend. Kein Cross-user-Datenleck behauptet. Ursache ist unvollständige Scopeidentität. Behebung: Projekt-ID im project-scoped Schlüssel/Output festhalten oder ausschließlich explizit projektgebundene Projektion erlauben; personal learning separat nach Consent aggregieren. Regression: OriginalprojectPreferences und Controlquery mit zwei Projekten und gegensätzlichen Events, jeweils getrenntes Ergebnis, Retraktion beeinflusst nur den zugeordneten Scope.

Zusätzlicher konkreter Dokumentabgleich: `docs/architecture/prism-preference-learning-v1.md:17,208–209` schließt automatische Zeitabnahme ausdrücklich aus; Originalfunktion :95–107 implementiert eine180-Tage-Halbwertszeit. Das ist eine bestätigte Dokument-/Implementierungsabweichung. **Offene Frage:** Welche versionierte Policy ist maßgeblich? Nicht als bloß fehlende Anforderung behandeln; ohne Entscheidung kein identisches zeitunabhängiges Ergebnis aus gleichen Events versprechen. Scopeforderung :133 bestätigt001. Originaltests belegen derzeit die Implementierungs-Decaypolicy, nicht Konformität zum Architekturtext.

### PCR-PRISM-STORAGE-001 — historischer Eigentümerbefund

Quelle: [prism.storage.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.storage.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-STORAGE-001 — Artifact-ACK ohne dauerhaften und überprüften Inhalt

**Hoch; Evidenzklasse: nachgewiesener Defekt für korruptes Existing-ACK (Originalprobe); begründeter Verdacht für Powerlossverlust (fehlendes fsync per Code-Trace, kein Crashversuch).** index.ts:90–107 bildet Digest, schreibt pending und renamt ohne file-/directory-fsync. Existiert Ziel bereits, reicht stat ohne Inhaltsprüfung. Control kann danach SQL-Baseline/Evidence bestätigen. Auslöser: Host-/Speicherausfall nach ACK, oder vorher beschädigtes Objekt. Folge: DBreferenz zeigt fehlendes/korruptes Objekt; erneutes put korrekter Bytes bestätigt weiter denselben kaputten Bestand. Originalprobe bestätigt den zweiten Fall (put Erfolg, get digest mismatch), kein simulierter Powerloss als echter Crash ausgegeben. Ursache ist die Gleichsetzung von Nameexistenz/rename mit dauerhafter Integrität. Reparatur: unveränderlichen Input snapshotten, bestehende Bytes verifizieren, persistentes write/fsync/atomic-install/directory-fsync-Protokoll und definierte Quarantäne defekter Objekte; ACK erst danach. Regression: Originalstore auf echtem temporärem Dateisystem, vorhandene Korruption, Parallelput, Fehler zwischen write/rename/fsync und Neustart; bestätigte IDs müssen lesbar sein, fehlerhafte Writes ohne ACK und mit aufräumbarem pending enden.

Ausführungsprotokoll der ersten Testgruppe: [prism-core-review-tests.txt](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/prism-core-review-tests.txt) (aus Originalausgabe transkribierte Zusammenfassung, kein nachträglich erzeugtes TAP).

Direkte Probeausgabe: [prism-service-review-probe.txt](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/prism-service-review-probe.txt).

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/prism-spikes.md).

### PCR-PRISM-STUDIO-001 — historischer Eigentümerbefund

Quelle: [prism.studio.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.studio.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-STUDIO-001 — Unveränderte Puckprojektion überschreibt Designwerte

Schweregrad hoch: normale Bearbeitung kann Layout/Komponentenwerte fremder,
unbearbeiteter Nodes kanonisch verändern und speichern. Nachgewiesener Defekt.
`app.tsx:133–178 mapNode/project` verwirft Stack.direction und generische Typfelder;
`puck-adapter.ts:16–97 genericProps/nodeProps` setzt statische Defaults (Stack
vertical, Grid columns=2, Chartdefaults etc.); `puck-adapter.ts:256–278` vergleicht
alle Nodes und erzeugt props.set für diese Differenzen, nicht nur wirkliche Edits.
Auslöser valider horizontaler Stack mit unveränderter Puckansicht; echte
Originalfunktionsprobe liefert node.props.set(direction:vertical), Domain wendet
es erfolgreich an. App onChange→commit→Control/Repository macht es dauerhaft.
Ursachenbehebung: bestehende Props beim Projektieren verlustfrei referenzieren,
nur ausdrückliche Änderungen in editierbaren Feldern diffen; Defaults ausschließlich
bei neuen Nodes. Regression: No-op-Roundtrip für jeden Nodetyp/abweichende Defaults,
zusätzlich Edit eines anderen Nodes darf vorherige Properties nicht verändern.

### PCR-PRISM-STUDIO-002 — historischer Eigentümerbefund

Quelle: [prism.studio.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.studio.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-STUDIO-002 — Canonicalassets machen lokale Vorschau unbrauchbar

Schweregrad mittel: gültiges Bild-/Iconlayout wird im gesamten Preview durch
Fehlerpanel ersetzt, sodass Operatoren es nicht beurteilen können. Nachgewiesener
Defekt in `studio/preview.ts:15–31`, Gegenstelle `renderer/index.ts:205–217` und
Vertrag `contracts/prism/v1/schemas/prism-v1.schema.json:373–386`. Canonicalassets
tragen kind/artifact/mediaType/role, kein src; Preview reicht sie unverändert an
Renderer, dieser verlangt src und wirft. App lädt keine aufgelösten Assetquellen.
Probe validiert Dokument und erhält ausschließlich Preview unavailable. Zudem
CSP default-src none ohne img-src würde neue Quellen weiterhin blockieren;
dieser zweite Browserteil ist Code-Trace, kein laufender Chromiumbeweis.
Ursachenbehebung: erlaubte Artefakte über authentifizierten Resolver in begrenzte,
validierte Previewquellen übersetzen, CSP gezielt für genau diese Quellen erlauben;
Sandbox erhalten. Regression valides echtes Bildartefakt in Preview inklusive
Load/Size-/Integrity-Denials und Browserrendering, nicht nur Stringprüfung.

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/prism-spikes.md).

### PCR-PRISM-WORKER-001 — historischer Eigentümerbefund

Quelle: [prism.service-worker.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-worker.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-WORKER-001 — Pflicht-Logspeicher fehlt am Executor-Aufruf

- Schweregrad: hoch; der deterministische Worker-Pfad kann eine ansonsten
  erfolgreiche Operation nicht als completed zurückgeben, wodurch Control scheitert.
- Evidenzklasse: nachgewiesener Defekt durch beidseitigen Code-Trace;
  kein bestandener/ausgeführter vollständiger Dienstlauf.
- Beleg: `worker.ts:65–68` loggt vor dem Engine-Aufruf; `:152–156` übergibt nur
  envelope, operation und receiptNamespace. `worker/core/worker/attempt-executor.ts:482–507`
  hält Logs standardmäßig fest; `:540–570` verlangt storeFullLog und setzt andernfalls
  WORKER_LOG_STORE_FAILED. `prism/server/control.ts:204–207` lehnt errored ab.
- Ablauf: authentifizierter gültiger Render/Evaluate-Auftrag → System-Log →
  fachlich erfolgreiche Operation → fehlender Logspeicher → errored → Control rollback.
- Auswirkung: gebrochener normaler Worker-Abschluss unabhängig vom fachlichen
  Ergebnis. Bei anderem vorgelagertem Fehler bleibt dessen Fehler maßgeblich.
- Ursachenbehebung: vollständiges Log über denselben dauerhaften, digestgeprüften
  Evidence-Store ablegen und als Worker-Evidenz referenzieren; Budget mitführen.
  Nicht den Logeintrag entfernen oder Logretention deaktivieren, nur um Erfolg zu erzwingen.
- Echter Regressionstest: Original-Control + Original-Worker + echte temporäre
  Postgres-/Artifact-Speicher starten, gültige deterministische Operation ausführen,
  completed und tatsächlich lesbares Voll-Log mit passendem Digest/Größe prüfen;
  Logspeicherausfall muss weiter errored liefern.

### PCR-PRISM-WORKER-002 — historischer Eigentümerbefund

Quelle: [prism.service-worker.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-worker.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-WORKER-002 — CPU-Messung zählt die gesamte Prozesslebensdauer

- Schweregrad: hoch; ein langlebiger Worker überschreitet nach genügend CPU-Arbeit
  das Versuchslimit auch bei späteren kleinen, erfolgreichen Operationen.
- Evidenzklasse: nachgewiesener Defekt durch Code-Trace; Schwellenüberschreitung
  im originalen laufenden Prism-Service noch nicht gemessen.
- Beleg: `worker.ts:101–105` meldet `process.cpuUsage().user / 1000` ohne Startwert;
  `engine/worker-envelope.ts:31` setzt cpuMillis auf 4000;
  Worker-Core `attempt-executor.ts:437–438` vergleicht Messwert mit Versuchslimit.
- Ablauf: Service verbraucht kumulativ mehr als 4 Sekunden User-CPU (auch Start-
  und frühere Arbeit zählen); jeder folgende Versuch meldet mehr als 4000 ms.
- Auswirkung: WORKER_CPU_LIMIT nach eigentlich erfolgreicher fachlicher Arbeit.
  Zusätzlich fehlt System-CPU; gemeinsam ausgeführte Versuche sind nicht isoliert.
- Ursachenbehebung: echte Ressourcenmessung pro isoliertem Versuch einschließlich
  Kindprozessen; bloße Prozess-Differenz reicht bei parallelen Versuchen nicht.
  Den neutralen Worker-Operation-Vertrag korrekt implementieren.
- Regression: denselben echten Dienst lange genug mit realen Operationen betreiben,
  sodass dessen Gesamt-CPU 4 Sekunden überschreitet; ein folgender kleiner Versuch
  muss bestehen, ein einzeln über dem Budget liegender muss scheitern. Erst nach
  Behebung des Logs-Vertrags ist dieser positive Pfad separat beobachtbar.

### PCR-PRISM-WORKER-003 — historischer Eigentümerbefund

Quelle: [prism.service-worker.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/prism.service-worker.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-PRISM-WORKER-003 — Terminate beendet weder Browser noch Evidence-Upload

- **Hoch; Evidenzklasse: nachgewiesener Defekt durch Code-Trace:** worker.ts:97–99 setzt nur terminated=true; Engine.execute (:79–84) und uploadEvidence (:37–40) erhalten kein AbortSignal. Chromium wird erst in Enginefinally geschlossen, Upload hat kein Timeout. Auslöser: laufender Browser/Upload überschreitet Deadline oder Controlclient trennt. Executor kann Ablauf als beendet behandeln, während externe Arbeit/Prozess weiterläuft; harte Claimabschluss-/Ressourcengrenze nicht gewährleistet. Keine tatsächlich beobachtete Prozessleckdauer behauptet.
- **Behebung:** pro Attempt besitzbarer Browser-/Prozesshandle, Abort weitergeben, Upload/Log/Cleanup gemeinsam gegen absolute Claimdeadline begrenzen; terminate muss tatsächliche Beendigung/Reaping quittieren. Aggregierte Zulassung und messbare Ressourcen pro Versuch ergänzen, nicht nur Configzahlen vergleichen.
- **Regression:** Originaldienste/echter Chromium, abbrechen während Capture und Upload; nach terminalem Result keine Kindprozesse, keine späteren Writes, alle Abschlussphasen innerhalb Claimdeadline. Disconnect zusätzlich auf bewusste Cancelpolicy prüfen.

Dokumentationsabgleich: Implementationplan Engineprofil/Bounded Worker wird nur teilweise umgesetzt; fehlende Logs und fehlende reale Terminierung widerlegen vollständigen neutralen Abschluss. Service-README fehlt; Querverweise Engine-/Storage-/Controlreviews behandeln Idempotenz, CAS und Empfangsbindung. Die drei Befunde ersetzen keine Cluster-/SPIFFE-Betriebsprüfung.

Ausführungsprotokoll der ersten Testgruppe: [prism-core-review-tests.txt](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/evidence/prism-core-review-tests.txt) (aus Originalausgabe transkribierte Zusammenfassung, kein nachträglich erzeugtes TAP).

### PCR-RUNTIME-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.runtime-dispatch.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.runtime-dispatch.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-RUNTIME-001 — Sessioncleanup bleibt bei Ablauf/Elternabbruch wirkungslos

Schweregrad hoch: externe Agentarbeit kann nach lokalem Abbruch/Timeout weiter
laufen und Ressourcen/Dateien ändern, während der Pipelineversuch endet.
Nachgewiesener Codepfad, nicht extern laufzeitreproduziert:
`src/openclaw.ts:271–286` installiert Abortlistener, entfernt ihn jedoch bei jedem
Pollfehler ohne cancelSession. `openclaw-session.ts:180–197` wirft sessionTimeout
oder maxPolls-Timeout, ohne das Signal auszulösen. Deshalb gar kein Cancelversuch
bei diesem regulären Timeout. Bei echtem Core-Elternabbruch ruft der Listener
cancelSession, aber dessen gateway nutzt denselben Context;
`nova/core/execution/adapter-startup.ts:71–73` lehnt jede Dependencyinvoke mit
abgebrochenem parent.signal sofort ab. `openclaw-session.ts:200–211` schluckt
den Cleanupfehler. Lokale zusätzliche deadline allein ist von Elternabbruch zu
unterscheiden: dort ist Cancellationtransport nicht zwingend schon revokiert.

Ursachenbehebung: explizit kontrollierte Cancel-/Reconciliationphase für alle
nichtterminalen Ausstiege mit eigenem begrenzten Cleanupbudget und entsprechender
Core-Autorisierung, anschließend persistiertes unbekanntes Ergebnis, falls
Abbruch remote nicht bestätigt. Kein unbegrenztes Umgehen von Grants/Revocation.
Regression mit echtem Core-AdapterRuntime und kontrolliertem HTTP-Peer: lebende
Session, maxPolls-/sessionTimeout und Parentabort; Peer muss genau passenden
Cancel erhalten oder Reconciliation muss dauerhaft sichtbar sein. Zusätzlich
späte Spawnantwort nach Abort und Timeout während Pollrequest prüfen.

Nachprüfung der Resultimport-Gegenstelle: **PCR-REPOSITORY-001** wird kanonisch
im Repositoryreview geführt. Fehlende Datei unter einem bereits existierenden
ausbrechenden Directorysymlink wird dort zunächst FILE_NOT_FOUND; OpenClaws
localResult behandelt dies als fehlendes lokales Resultat und persistResult
schreibt über den nur lexikalisch begrenzten Pfad. Nova-Reviewer bestätigte die
Kette mit Original readOpenClawResult, echtem Repositoryadapter und echten
Symlinks (`../evidence/nova-batch-repository-symlink-probe.mjs`). Der Fix muss
deshalb auch diese schreibende Runtimegegenstelle sicher binden, einschließlich
fehlender Zieldateien und bereits vorhandener Elternsymlinks; kein eigener
doppelter Runtimebefund.

### PCR-SCAFFOLD-001 — historischer Eigentümerbefund

Quelle: [nova.scaffold.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.scaffold.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: 12. PCR-SCAFFOLD-001 — Regeneration verwirft ausgefüllten Providerplan

**Mittel; mit Originalcode und echten Dateien reproduziert.**
`progress-scaffold-discovery.ts#buildScaffold` (Zeilen 649–684) liest prior,
übernimmt dessen Module/Gates/Order, baut pipeline aber allein über buildPipeline
neu aus progress.json und pipeline.json. Noch nicht angewandte Änderungen im
prior.pipeline werden ignoriert; CLI run schreibt dieses neue Scaffold sofort.
Auslöser: Scaffold erzeugen, HTTP-URL ausfüllen, erneut ohne --apply generieren.
Probe zeigt geprüfte URL ersetzt durch TODO. Auswirkung: verlorene manuelle
Providerplanarbeit, wieder blockierender Apply oder unbemerkter Ersatz von
individuell konfigurierten Nodes. Rootfix: prior.pipeline als editierte Quelle
mit expliziter Konfliktstrategie behandeln oder vor Überschreiben abbrechen.
Regression: Original-CLI über generate → edit → generate → check, alle ausgefüllten
Nodekonfigurationen erhalten; gegen echte gespeicherte Vorversion vergleichen.
Weitere Designgrenze: nichtatomare Zweidateipublikation durch echten zweiten
Writefehler/Abbruch prüfen. Operationsbefund separat PCR-SCAFFOLD-OPS-001.

### PCR-STATE-001 — historischer Eigentümerbefund

Quelle: [nova.state.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.state.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-STATE-001 — Journal-Cache enthält fremd veränderbare Payloads

- Schweregrad: mittel; ein akzeptierter Journalwert kann im laufenden Prozess von
  seinem persistierten Wert abweichen. Auswirkungen auf konkrete Pipeline-Entscheidungen
  noch verfolgen, daher keine Behauptung eines nachgewiesenen falschen Gates.
- Evidenzklasse: nachgewiesener Defekt an der Speichergrenze.
- Belege: `journal.ts:141–170` friert nur äußeren Record ein und hält `entry`;
  `:196–204` gibt dieselben verschachtelten Objekte zurück. `plugins.ts` übernimmt
  ebenfalls Input-Payload/Registrierung und gibt Einträge direkt zurück.
- Ablauf: Objekt mit `decision: approved` appendieren, danach Original-Payload
  auf `rejected` ändern; `refresh()` meldet rejected, neues Journal meldet approved.
  Auch Mutation über `records()[0].entry` bleibt im Cache erhalten.
- Auswirkung: laufende Projektion und Neustart-Replay können unterschiedliche Werte
  sehen, ohne Hashfehler beim unveränderten Dateistand auszulösen.
- Ursachenbehebung: JSON-Werte an Append-Grenze validieren, unabhängig kopieren und
  intern tief einfrieren; keine veränderbaren internen Referenzen an Leser geben.
- Echter Nachweis: `node docs/review/evidence/journal-mutation.mjs` reproduziert beide
  Wege. Nach Reparatur muss derselbe Ablauf überall den ursprünglichen Wert liefern
  oder Mutationen ausdrücklich ablehnen. Plugin-State- und Event-Reducer mitprüfen.

### PCR-STATE-002 — historischer Eigentümerbefund

Quelle: [nova.state.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/nova.state.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-STATE-002 — Stale-Lock-Übernahme ist nicht an beobachteten Besitzer gebunden

- Schweregrad: hoch, falls parallele Reclaimer auftreten: Verletzung gegenseitigen
  Ausschlusses kann die zentrale Journal-Hashkette beschädigen und Recovery stoppen.
- Evidenzklasse: nachgewiesener Defekt. Zwölf echte Prozesse mit insgesamt
  1200 Lock-Aufrufen erzeugten 266 überlappende kritische Sektionen.
- Belege: `file-mutex.ts:17–21,40–43`: Besitzer lesen und später denselben Pfad
  unabhängig von Token/Inode wegbenennen. `:48–49` prüft erst beim Release den Token.
- Ablauf: A und B lesen alten toten Besitzer. A entfernt ihn und setzt einen neuen
  gültigen Lock. B entfernt auf Basis seines alten Reads jetzt A's Lock. B kann
  selbst claimen, während A in seiner kritischen Sektion arbeitet.
- Auswirkung: parallele kritische Sektionen; Sequenz-/Hashkonflikte oder verlorene
  Fortschritte. Der vorhandene Contention-Test hält nur einen lebenden Besitzer;
  er erzeugt keine konkurrierende Stale-Reclamation.
- Ursachenbehebung: verlässliche kernelgebundene Sperre mit Freigabe bei Prozessende
  oder anderer atomarer Besitzerwechsel; ein weiteres ungeschütztes Read vor Rename
  beseitigt das Rennen nicht.
- Verifikation: mehrere echte Prozesse nach SIGKILL eines Besitzers gleichzeitig
  starten; kritische Sektionen mit exklusiver Kontroll-Datei beobachten und Journal
  danach vollständig validieren. Keine Dateisystem-Mocks einsetzen.

### PCR-TAILSCALE-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.tailscale-exposure.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.tailscale-exposure.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-TAILSCALE-001 — Standard-HTTPport wird abgewiesen

**Mittel; nachgewiesener Defekt.** `plugins/tailscale-exposure/src/provider.js:48–55` konvertiert URL.port direkt zu Number und verlangt >=1. WHATWG URL normalisiert auch explizites :80 im HTTPinput zu leerem String; Number('')=0. Die Fixture liefert gültig `http://service.namespace.svc.cluster.local:80`, Exposure kann sie nicht übernehmen. **Ursache beheben:** effektiven Port mit Schema-Default80 bestimmen und denselben Wert gegen Servicevertrag validieren. **Regression:** vorhandene Originalfunktionsprobe nach Fix positiv machen; :80 und implizites80, :8080, unerlaubter Host und anderer Service müssen getrennt geprüft bleiben.

### PCR-TAILSCALE-002 — historischer Eigentümerbefund

Quelle: [kubeclaw.tailscale-exposure.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.tailscale-exposure.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-TAILSCALE-002 — Ready und Cleanup nicht an Exposuregeneration gebunden

**Hoch; nachgewiesener Protokollmangel mit statisch belegtem Trigger.** `tailscale-exposure-runtime.ts:187–218` patcht neue owner-Annotation, wartet aber nur `status.exposurePhase==='Ready'`; Controllerstatus enthält keine beobachtete Owner/Generation. Ist vorherige Exposure bereits Ready, liefert nächster GET aktuelle Metadatenowner mit altem Ready/URL; Namespace/Expiry/Suffix stimmen, falscher Pfad/Hostname kann als neues erfolgreiches Result akzeptiert werden. `#release:229–239` prüft darüber hinaus keinen Owner und schaltet eine inzwischen durch anderen Attempt erneuerte Exposure ab. **Ursache beheben:** Controller quittiert Exposureowner oder Specdigest im Status, Prepare verlangt genau diese Generation; Release führt atomaren Owner-/Resourceversionvergleich aus und behandelt bereits abgelöste eigene Exposure als nicht mehr zuständig. **Regression:** echter APIserver oder explizite Protokollpräfixprobe nach PATCH vor Controllerstatus-Update sowie zwei parallele Prepare/Cleanup-Attempts; alter Status darf nicht new-ready sein, alter Cleanup darf neuen Ingress nicht deaktivieren.

### PCR-VISUAL-001 — historischer Eigentümerbefund

Quelle: [kubeclaw.visual.md](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/components/kubeclaw.visual.md), Reviewref `a9e080ab1e1981ec5713e9b742f94280835fd347`; Codebaseline identisch. **Übernommene historische Evidenz, keine Testausführung dieses Auftrags.**

Originalüberschrift: PCR-VISUAL-001 — mittel: Baselineidentität bindet keine Browserversion

Nachgewiesene Vertrags-/Implementierungslücke im Quelltrace, kein ausgeführter Zweiversionen-Browsertest. `skills/buster/plugins/visual/src/provider.js:77–96` erlaubt Manifestfelder ohne browserVersion und prüft ausschließlich Familie/Viewport/Pageconditions; `:140–145,175–179` übernimmt aktuelle Browserversion erst nach Capture. `docs/architecture/pipeline-test-gate-visual-operator-guide.md`, Upgrade, untersagt stilles Wiederverwenden zwischen Versionen. Auslöser: Workerbrowserupgrade bei unverändertem Manifest; derselbe Vertrag bleibt akzeptiert und kann bei 0%-Differenz bestehen. Auswirkungen: fehlende reproduzierbare Baselinefreigabe und schwer erklärbare Renderabweichungen. Ursachenbehebung: versionierte Engine-/Renderidentität in Baseline und Gegenstellen prüfen, Migration explizit. Regression: alte Version im Manifest, neue im echten Capture muss vor Bewertung ablehnen; anschließende freigegebene Neubaseline zulassen.

## Gegenprüfung durch den Orchestrator

Baseline 85ddfcbfc15e078780ea0434fc167e6f9a9b9488. Nur statisches Nachlesen; keine Tests ausgeführt.

- O-01: Gesamten Git-Tree der Baseline mit beiden Review-Branches verglichen: keine Blobabweichung außerhalb docs/review/. Keine AGENTS.md in diesen Trees gefunden. CONTRIBUTING.md und beide Review-Leitfäden gelesen. Codebaseline bleibt unverändert.
- O-02: pipeline.ts sowie compileProject vollständig gelesen. Bestätigt: vier Stages je Modul, zwingende Review-/Test-Agent-Konfiguration, previousGate, maxConcurrency1; keine Summary-/Prism-/Approval-/kumulativen Stages in der Compiler-Rückgabe. Registrierung in packaging/runtime/roles/nova.json ist separate Verfügbarkeit.
- O-03: implementation-agent/src/protocol.ts::buildRequest (37–73), stage.ts::createWorkspace/integrateWorkspace/execute und runtime-dispatch/src/openclaw.ts::spawnSession (207–225) nachgelesen. Bestätigt PCR-IMPLEMENTATION-001: Workspace vorhanden im lokalen Input, fehlt im Dispatch; tatsächliches cwd stammt aus target.cwd.
- O-04: lifecycle/reducer.ts::applyStageResult (107–123) und requestFix (80–89), remediation.ts::applyRepair (38–51), execution/pipeline-loop.ts (120–128) selbst gelesen. Auch passed zählt attemptsUsed; Reparatur setzt Budgets nicht zurück. Bei maxAttempts2 keine dritte normale Forge-Ausführung. Gesamtbudget und Reparaturcyclezahl sind verschiedene Größen; keine Behauptung unbegrenzter Retries.
- O-05: human-approval/src/architecture-approval.ts (82–119) selbst gelesen: eindeutiger Produzent/aktueller Run/latest Attempt, Digest/Größe und passed geprüft; sourceRevision/Planrevision fehlt als Freigabebindung. Findings leer heißt unmittelbarer Pass. Generic stage.ts (19–20) verarbeitet vorhandene Guidance vor neuer Waitanlage.
- O-06: engine-admin.ts::#retry/#remediate (112–128) und run-decisions.ts::#remediate (68–80) verglichen. Adminpfad verwendet nicht dieselbe applyRepair-Invalidierung. Rejected Guidance bleibt bei #retry im Spread erhalten; gesonderte Prüfung durch T03/T04 angefordert. Normaler Pfad invalidiert Nachfahren, Adminpfad setzt nur Ziel/Requester.
- O-07: effects/durable-invocation.ts (40) und effects/locks.ts (57–102) nachgelesen: Acquire ist synchron und wirft bei gültigem fremdem Lock RESOURCE_LOCKED; keine Warteschlange. Auswirkung auf parallele Gitmutationen wird T06 zugeordnet; nicht mit dem separaten historischen Lockverlustbefund vermischt.

Abschlusskriterium war die fachliche Gegenprüfung, nicht der Subagentstatus. Alle 16 Ergebnisse wurden gelesen und gegen Quellenstichproben sowie überlappende Traces geprüft.


### Gegenprüfte Einzeltraces

| Trace | Fachliche Gegenprüfung / Quellenstichprobe | Ergebnis |
|---|---|---|
| T01 | Vollständige 18er-Folge gelesen; Compiler/CLI/Registrierung und Source-Resolver selbst nachgelesen; fehlerhafte Zeilenenden an Autor zurückgegeben und korrigiert. | Statisch validiert; kein zusammengesetzter Gesamtprojektpfad. |
| T02 | Vollständige 18er-Folge gelesen; createDirectionSet 189–218 + Control330–338/365–377, Tool29–45 selbst geprüft. Feedbackevent gegen SQLuuid geprüft; Workerexecute-Log gegen fehlenden storeFullLog und AttemptExecutor540–567 geprüft. | Alle drei neuen Befunde bestätigt; Race ist statische Konstruktion, kein ausgeführter Test. |
| T03 | Reparatur-/Reject-/Re-reviewfolge und Approvalcode gelesen; Guidanceweitergabe und Adminspreads selbst geprüft. Präzise Berichtdigestbindung von externem Sourcehash getrennt. | Validiert; Sourcebindung mit T04 zusammenzuführen. |
| T04 | Gesamte 14er-Folge und Varianten gelesen; gültigen A→R→P→Q-Adminreparaturgraph gegen Graphvalidator/engine-admin/normal applyRepair geprüft. | Hoher Freigabeinvalidierungsdefekt bestätigt; Rejectsackgasse T03 gleicher Ursachenkomplex. |
| T05 | Alle 23 Schritte und vier Varianten geprüft; Zählertabelle eigenständig gegen Reducer/Repair/Scheduler fortgeschrieben. | Validiert; Budgetpolicyabweichung, kein Defekt der Zählerdurchsetzung. |
| T06 | Gesamte Parallelfolge geprüft; synchronous acquire→RESOURCE_LOCKED→Stagecatch nachgelesen, vom accepted-ohne-Receipt-Fall getrennt. Autor korrigierte mehrere Zeilenspannen. | Validiert; Parallelgraph möglich, sichere Progressgarantie fehlt. |
| T07 | 20 Übergänge/8 Varianten gelesen; operations create/remove/commit/merge/sync und Implementationfinally selbst geprüft. Cleanup+konstanter Workspacepfad bestätigt; drei überlange Zitate korrigiert. | Validiert; fehlende Reconciliation ist von korrektem fail-closed Verhalten getrennt. |
| T09 | 18 Übergänge, Outcome-/Countertabelle und Adminvarianten gelesen; retry/request_fix/exhaustion mit Reducer verglichen; Admininvalidierung unabhängig bestätigt. | Validiert; keine automatische Gleichsetzung blocked und Needs Nova. |
| T10 | Vollständige Minimalvarianten gelesen; strikte Compilerpflichtfelder, lint→review-Kante und lint resultForReport/withLintCandidate nachgelesen. | Validiert; not_applicable bleibt Coveragegrenze, kein erfundener Testpass. |

Quellenintegrität: 784 materialisierte Code-/Konfigurations-/Dokumentdateien gegen SHA-1-Gitblobwerte des vollständigen API-Trees verglichen. Beim Materialisieren angefügte letzte Newline entfernt, danach kein inhaltlicher Unterschied. Dies ist Dateiintegritätsprüfung, kein Softwaretest. Alle historischen Testergebnisse bleiben historisch.


### Abschließende Gegenprüfung

| Trace | Fachliche Gegenprüfung / selbst gelesene Quelle | Ergebnis |
|---|---|---|
| T08 | Crashmatrix gegen recovery-state, artifact-checkpoints und validateWaitHistory geprüft. Nachauftrag zur Trennung direkter Approval-/Prismnachricht von nachgelagertem Observer. Autor korrigierte Send-/Waitreihenfolge und ergänzte Post-send-Crashfenster. | Validiert; keine Exactly-once-Garantie und kein Runtimepass behauptet. |
| T11 | Alle 13 historischen Kategorien und aktuelle Providerkette gelesen. junit-report-adapter/src/adapter.js zählt skipped in total; runner.ts 1499–1524 prüft total==0, aber nicht executed>0. remote-result-import.ts 169–208 kontrolliert keine Mindestabdeckung. | Hoher All-skipped-False-pass bestätigt; neue Kennung von bekanntem API-flow-No-request-Befund getrennt. |
| T12 | Qualitystage und gesamtes Protokoll gelesen: native Decision zuerst, nur native passed startet Agent; Parser kann native failed nicht überschreiben. Source-/Decisionbindung der Summary selbst geprüft. | Validiert; Agenturteil ist keine erzwungene zusätzliche Anwendungstestausführung. |
| T13 | 20 Schritte und Invalidierung geprüft; remote-test-gate/adapter.ts 63–94 und project-summary/summary.ts 17–69 vollständig selbst gelesen. Modulplan/letzte Modulrefs bestehen Identitätsprüfungen ohne kumulativen Coveragevertrag. | PATH-T13-001 bestätigt; gleiche Revision von vollständigem Test-/Reviewscope getrennt. |
| T14 | Vollständigen Handofftrace gelesen. runner.ts finally/cleanupFixtures, tailscale provider cleanup85–90, runtime release231–241 und Controller expireLease307–324 selbst nachgelesen. Notification-/Summaryinputs gegen Handoffbehauptung verglichen. | Beide Abschlusslücken bestätigt; Namespace-retain erhält keine Exposure und gilt nur bis TTL. Keine Credentialoffenlegung behauptet. |
| T15 | Gesamten Bericht gelesen; pipeline-review stage3–16 und protocol1–32 selbst gelesen. Kein Evidence-Read, Parser bindet Calleridentität, Report verwahrt keine Ursprungsbelege. | T15-F01 und PCR-PREPORT-001 bestätigt; Entwurf statt nachgewiesener Runauswertung. |
| T16 | Gesamten Abschluss-/Fehlertrace geprüft; CaseStudy stage1–12/protocol1–22 und Summary17–69 selbst gelesen. Keine Publikationscapability, kein automatischer Trigger. | Validiert; ausgewählte optionale Stages blockieren bei Fehler, ausgelassene verhindern Abschluss nicht. |

Weitere schwerwiegende Stichproben: Prism storage createDirectionSet189–218 gegen Control330–338 und Tool29–45 (alte Generation an neue Architektur); Prism Worker context.log gegen fehlenden storeFullLog und WorkerAttemptExecutor540–567; Feedbackevent-ID gegen PostgreSQL-UUID; FileMutex read-owner/rename-Fenster gegen PCR-STATE-002; native Decision-/Sourcebindung und administrativer Repair gegen vorhandene Freigaben. Diese Nachlese bestätigt Codepfade, führt sie nicht aus.

Widersprüche aufgelöst: Alte Summary-/Qualitygate-Reviews schreiben dem Compiler finale Gates zu; dessen vollständige Rückgabe widerlegt das. Alter Testagent-Protokollname wurde vom tatsächlich verwendeten kubeclaw.buster-quality-gate.v2 getrennt. 13 historische Suitekategorien sind keine 13 automatisch laufenden aktuellen Suites. Archviewer ist nicht Arch-Reviewer. Normale Repairinvalidierung und administrative Reparatur sind verschiedene Pfade. Reportdigestbindung ist keine Source-/Modulplanfreigabe; gleicher Commit ist kein kumulativer Coveragebeweis.

Nacharbeiten: Zeilenspannen bei T01/T06 an Autoren zurückgegeben; T07 überlange Spannen korrigiert; T08 Reihenfolge konkret nachprüfen lassen; T13/T14/T16 Zuständigkeiten und Querverweise abgestimmt. Keine verbleibende unvalidierte Szenarioabgabe. Bekannte PCR-/IFR-Befunde bleiben mit ihren ursprünglichen Kennungen und Evidenzgrenzen verknüpft; nicht jeder historische Befund wurde neu reproduziert.

Tatsächlich ausgeführte Softwaretests: 0. CI-Läufe: 0. Deployments: 0. Statische Suchen, vollständige ausgewählte Dateilektüre, Git-Tree-/Blobvergleich und Dokumentkonsistenzprüfung wurden durchgeführt. Bereits vorhandene Testdateien wurden nur gelesen; historische Passangaben sind keine Ergebnisse dieser Prüfung.

Abschließender Sourceintegritätsabgleich: 828 vorhandene Originaldateien stimmen mit ihren Gitblob-SHA1-Werten am Baseline-Tree überein; keine Abweichung. Weitere agentseitige gezielte Abfragen verwendeten denselben Commit.

Letzte gezielte Quellenstichprobe: Controller ensureTestCredentials1165–1225/ensureCredentialAccess1263–1283 erzeugt Secret/SA-Rechte, keine Appauthkonfiguration; previewNotification139–160 enthält ausschließlich Artefaktmetadaten. Prism agent-bridge25–92 und Controlgenerate621–654 übergeben Architektur bzw. Instruction/Dokument, keine persistierte Präferenzprojektion; deren tatsächliche Gewichtung wurde in preferences/index.ts40–108 nachgelesen.

## Tatsächlich durchgeführte Prüfungen und offene Nachweise

| Prüfung | Tatsächliches Ergebnis dieses Auftrags |
|---|---|
| Git-Treevergleich Baseline / zwei Vorreviewrefs | Keine Blobänderung außerhalb Reviewdokumentation |
| Materialisierte Quellen gegen Gitblob-SHA1 | Unveränderte Sourcebytes nach Normalisierung ausschließlich materialisierungsbedingter letzter Newlines; zusätzliche Abfragen weiterhin an denselben SHA gebunden |
| 16 delegierte statische Traces | 16 geliefert, inhaltlich gegengeprüft, Nachaufträge eingearbeitet |
| Statische Quellen-/Vertrags-/Zustandsprüfung | Ausgeführt; konkrete Stichproben im Gegenprüfungsprotokoll |
| Bereits vorhandene Testdateien | Nur gelesen; genaue Dateilisten und Aussagegrenzen pro Trace |
| Neu ausgeführte Softwaretests / Runtime-/E2E-Tests | **0 / 0** |
| CI / Deployments / Veröffentlichung | **0 / 0 / 0** |
| Änderungen | Ausschließlich Reviewdokumentation unter `docs/review/paths/` |

Die Reviewarbeit ist vollständig abgeschlossen; die Produktausführung hat belegte Bruchstellen. Bedingte Fortsetzungen setzen explizite Graphverdrahtung, funktionierende bekannte vorgelagerte Komponenten und autorisierte Runtime-/Clusterkonfiguration voraus. Diese Annahmen sind keine behaupteten Behebungen.

Offen bleiben reale Originalpfade: Nova/Prism-Designgeneration samt Feedbackrückführung; Forge in getrennten tatsächlich verwendeten Worktrees; mehrere Integrationen mit realen Test-/Lint-/Reviewfehlern; Budgeterschöpfung und autorisierte neue Entscheidung; Prozessabbrüche an Journal-/Effect-/Wait-/Importgrenzen; konkurrierende Git-/Statelocks; vollständige kumulative Suite-/Reviewcoverage; tatsächliche zusätzliche Agenttests; Build/Registry/Namespace/Tailscale mit echtem erlaubtem Operatorbrowser und Login; sichere Credentialzustellung; Feedback-/Abnahmebindung an Source und Exposuregeneration; TTL-/Finalizerbereinigung bei Controllerrestart und Tokenrotation; optionale Berichte mit echten unveränderlichen Runquellen. Mocks, feste Agentantworten und isolierte Parserprüfungen ersetzen diese Nachweise nicht.

## Empfohlene Reihenfolge späterer Ursachenbehebung

1. **Identität, Persistenz und Rückwege absichern:** bestehende State-/Recovery-/Effect-/Prism-Identitätsdefekte sowie Approval-Source-/Planbindung und administrative Invalidierung schließen. Ein erneuter Versuch darf alte Freigaben oder fremde Ergebnisgenerationen nicht übernehmen.
2. **Reale Modulproduktion ermöglichen:** autorisierten Workspace durch Forge-Runtime bis Commit/Merge binden; Gitkonflikt-/Cleanupreconciliation und Parallel-Lockfortschritt definieren. Tatsächlich weiterverwendete Revision muss aus der realen Integration stammen.
3. **Falsche Qualitätsaussagen verhindern:** All-skipped-JUnit und bestehende API-/OpenAPI-No-op-Passes beheben, verbindliche Executioncoverage und kumulative Requirements-/Modulcoverage definieren; Modul-/Gate-/Summarybelege daran binden.
4. **Produktgraph und Entscheidungspolitik vervollständigen:** manuelle Modulplanung bewahren, Design/Archreview/Acceptance/Preflight, verpflichtendes Lint, optionale Echo-/Agentprüfung, kumulative Gates, Budgets und Needs-Nova-Entscheidung explizit kompilieren. Hard constraints von zulässiger Risikoakzeptanz unterscheiden.
5. **Designanpassung funktionsfähig machen:** Worker-/Storageblocker schließen, neue Runden-/Architekturidentität sowie echte Verwendung persistierter Operatorpräferenzen nachweisen.
6. **Operatorabschluss liefern:** Previewownership über Planende übertragen, Namespace/Exposure/TTL gemeinsam binden, Appauth integrieren, URL und geschützte Credentials gezielt zustellen; Rückmeldung/Abnahme/Änderung und spätere Bereinigung an dieselbe Generation koppeln.
7. **Optionale Berichte sauber anschließen:** Ausführungs- und Berichtsgegenstandsidentität trennen, gelesene Sources/Evidence im Pipeline Review und in der Case Study binden. Generated bleibt Entwurf; Veröffentlichung bleibt ein gesonderter späterer Auftrag.
8. **Danach Originalpfade verifizieren:** zuerst gezielte Regressionen an den genannten Ursachen, dann echte komponierte Integrations-/Crash-/Operator-E2E-Läufe mit überprüfbaren Source-/Run-/Attempt-/Artefaktnachweisen. Keine solche Ausführung war Teil dieses Auftrags.

