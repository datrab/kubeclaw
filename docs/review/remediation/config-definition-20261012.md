# CONFIG: vollständiger Zielumfang, Zuständigkeiten und Bedienung

**Aktueller Einstieg für OpenClaw:** [OPENCLAW-CONFIG-GOAL.md](OPENCLAW-CONFIG-GOAL.md).
D21/D22 sind maßgeblich: Systemindex `pipeline.config.json` aus dem bestehenden
Swarm-Einstieg; Projektworkflow `pipeline.json` getrennt. C0 ist offen; keine
Implementierungsfreigabe. Ältere Namens-/Abschlussformulierungen unten sind
historisch beziehungsweise durch diese Fortschreibung präzisiert.


## Historische Definition vor D21

Die folgende ursprüngliche Definition wird als Beleg erhalten. Für aktuellen
Auftrag, Zielnamen und Prüfgates gelten D21/D22 und OPENCLAW-CONFIG-GOAL.md.

Stand: 12. Oktober 2026. **Codegestützte Definition vor der nächsten Migration, keine neue Implementierung.** Grundlage: D17, D18/D19, gültige F1–F6-Abnahme und die neue [Code-/Schemainventur](config-scope-inventory-20261012.json).

Vom Auftraggeber bestätigt: zentrale Config je Engine/Plugin/Core/Worker Core; **`pipeline.json` als Systemeinstieg mit Referenzen**, keine Kopie sämtlicher Einstellungen in einer zweiten Datei. Für geeignete Tuningwerte übernehmen **neu startende Module** Änderungen; ein laufendes Modul behält seinen gebundenen Stand. Grundlegende Run-/Recovery-/Berechtigungsbindungen bleiben stabil; Evals binden einen festen Konfigurationsstand. Ziel: einfache Verwaltung, möglichst große sinnvolle Anpassbarkeit, wenig Reibung und spätere Optimierung aller Komponenten.

Die folgende konkrete Dateiaufteilung, Feldklassifikation und Migration ist ein reviewbarer Vorschlag. Nicht jede neue Schnittstelle existiert bereits. Umsetzungsschnitte und ihre konkreten Pflichtfälle werden nach gemeinsamer Umfangsentscheidung umgesetzt; der bisherige Entscheidungsmodus bleibt bestehen.

## 1. Tatsächlicher Codezustand

- `charts/kubeclaw/files/config/swarm.config.json` bindet **sechs** Dateien: Prism Control, Studio, Worker, Execution, Buster Engine und Worker Core. `swarm-bundle.ts` liest eine ganze gebundene Generation, validiert und friert Werte ein. Das ist eine wiederverwendbare Produktionsgrundlage.
- `swarm-bundle.ts` enthält jedoch eine feste Ownerliste und festgelegte Dateinamen. `swarm.schema.json` setzt `profile`, `features` und `tuning` auf konstante Werte und lässt keine Overrides zu. Die derzeitigen Profil-/Tuninglabels beweisen keine dynamische Optimierungsfähigkeit.
- Nova lädt separat `pipeline-platform.v2` über `--platform`: Discovery/Trust, Provider/Grants, Adapter, Observer, Speicher, Effectlock und Shutdown. `engine-runtime.ts` validiert Stagekonfiguration aus dem Ablaufgraphen und Adapter-/Observerkonfiguration aus diesem Plattformdokument. Es gibt noch keinen durchgehenden gemeinsamen Systemeinstieg.
- Das Nova-CLI erwartet bei `--pipeline <pipeline.json>` heute **einen Ablaufgraphen** vom Typ `pipeline-definition.v2`. Der neue Systemindex darf nicht durch bloße Umbenennung als kompatibler Graph behandelt werden. Projektcompiler und gespeicherte Graphen sind eigene Verträge.
- Unter den direkten Produktionspluginverzeichnissen sind **48 Manifeste** vorhanden: jeweils 16 Common-, Nova- und Busterplugins. Sie referenzieren zusammen 57 unterschiedliche Konfigurationsschemas. Ein Plugin kann mehrere Registrierungen und Configschemas haben. Ein vorhandenes Schema ist noch keine vollständige zentrale Autorenquelle.
- Konkrete noch nicht zentrale Werte: Reviewbudget-/Kosten-/Parallelitätsdefaults in `repository-review-profile.ts`; Prism-Provider-Timeoutfallback und Systemprompt in `design-providers.ts`; Artifactstorequoten in `artifact-store/src/adapter.ts`; HTTP-Methoden/Headerdefaults in `network-http/src/adapter.ts`; Dienstendpunkte in Prism-Loadern und Modell-/Routing-/Deploymentwerte in Charts.

Die neue Erhebung scannt 1.298 Produktionsdateien, enthält 868 Marker-Kandidaten und bindet 136 relevante Quellenidentitäten. Sie erfasst deklarierte Schemafelder, keine bewiesene vollständige Feld-Consumerinventur. `$ref`-Ziele und daten-/capabilityspezifische Konfiguration müssen fachlich aufgelöst werden. Historische Inventare werden berücksichtigt, aber nicht ungeprüft als heute vollständig übernommen. „Das meiste ist zentral“ wird hier nicht als Prozentzahl behauptet.

## 2. Was über Engine/Plugin/Core/Worker Core hinaus dazugehört

| Konfigurationseigentümer | Zuständigkeit / Beispiele | Codebezug |
|---|---|---|
| Systemindex `pipeline.json` | Komponenten-/Profilreferenzen, aktivierte Pipelinevorlagen und unterstützte Erweiterungen | ersetzt/vereinigt den Einstieg aus swarm + separater Plattformwahl |
| Orchestrator Core / Nova Core | Scheduling/Concurrency, technische Wiederaufnahme, Locks/Waits, Persistenz-/Lifecycle-/Shutdownpolicy | Nova core/execution, lifecycle, effects und state |
| Foundation / Plugin Runtime | Discovery, Registrierungs-/IPC-/Lifecyclegrenzen und generische Runtimeeinstellungen | common/plugin-runtime/foundation und registry |
| Worker Core | Generischer Attempt-/Claim-/Cancel-/Drain-/Resultvertrag; Ressourcen-/Ausführungsprofile mit D18-Migration | skills/worker/core; vorhandenes worker-core-Objekt deckt nur localRuntimewerte ab |
| Engines | Buster Plan/Admission/Provider/Report/Preparation; Prism fachliche Engine-/Design-/Embeddingeinstellungen | buster/engine und prism/engine/domain |
| Services / Rollen | Control, Worker, Studio, Ingestion/Bridge soweit tatsächlich verwendet; Listener, Endpunkte, Start-/Shutdown-/Transportgrenzen | Prism server und Chartcomposition |
| Plugins mit eigenen Instanzprofilen | Stage-, Provider-, Adapter-, Observer-, Wait-/Transport- und Reportregistrierungen | alle 48 Paketmanifeste, nicht nur sichtbare Pipeline-Stages |
| Agent-/Modellprofile | Provider-/Modellbindung, unterstützte Generierungsparameter, Reasoning, Context-/Token-/Kostenbudgets | Agentrollen/Chartmodelle, runtime.dispatch, Prismprovider und Review |
| Prompts / Vorlagen | Editierbare Instruktionen und Templates mit gebundenen Variablen und Ergebnisvertrag | agentische Plugins, Rollenworkspace, Prism-Systemprompt |
| Integrations-/Capabilitybindungen | Modell-/Git-/Registry-/BuildKit-/HTTP-/Redis-/Tailscale-/Benachrichtigungsendpunkte und Profile | providers/grants, Commonadapter und Clusterinvoker |
| Operator-/Deploymentprofil | Namespace, Service-/Ingress-/Trustzuordnung, Placement, Replicas, CPU/RAM/Task/Storage, externe Secretrefs | Helm, my-values, GitOps, Host-/Kubeletprofile |
| Speicher / Retention / Observability | Zuständige Roots, Quoten, Diagnose-/Logausgabe, Observerdelivery, explizite Freigabe-/Retentionpolicy | Durable Stores, Adapter, Observer, D01/D07 |
| Pipelinevorlagen / Projektauftrag | Ablauf/Abhängigkeiten und Anforderungs-/Inputdaten; selektierte Plugin-/Agentprofile | project/compiler und pipeline-definition.v2 |
| Evaldefinitionen | Komponente, Szenario-/Datensatz-/Scorerreferenzen, feste Baseline-/Kandidatprofile, Budget und Wiederholungen | spätere Evalausführung; vorhandene Reviewevaluation ist nur ein Teil |

Diese Liste bedeutet nicht eine neue Datei je Zeile. Eine Datei entsteht pro **echter Zuständigkeit**, nicht pro Klasse, Funktion oder Helfer. Kleine zusammengehörige Werte bleiben beim selben Eigentümer. Beispielsweise bleiben Report-/Readiness-/Scanner-/Preparationwerte beim Buster-Engineeigentümer, soweit sie nicht einem eigenständigen Plugin gehören. Fachliche Busterwerte werden nicht im generischen Worker Core abgelegt.

## 3. Vorgeschlagene Dateistruktur

```text
config/
  pipeline.json                 # einziger gemeinsamer Einstieg
  cores/
    orchestrator.config.json
    plugin-runtime.config.json
    worker-core.config.json
  engines/
    buster.config.json
    prism.config.json
  services/
    prism-control.config.json
    prism-worker.config.json
    prism-studio.config.json
  plugins/
    kubeclaw.review.config.json
    kubeclaw.artifact-store.config.json
    ...                         # tatsächliche Plugin-IDs, ausgewählte Pakete
  agents/
    agents.config.json          # benannte Rollen-/Modellprofile
  prompts/
    ...                         # Texte/Templates, von Profilen referenziert
  deployment/
    operator.config.json        # gemeinsamer Eigentümer für Topologie/Trust/Storage
  workflows/
    ...                         # Pipelinevorlagen, keine zweite Settingspflege
  profiles/
    ...                         # alternative vollständig materialisierte Generationen
  evals/
    ...                         # Szenarien/Kandidaten/Scorer, keine Runtimefallbacks
```

Das ist **ein Entwurf, keine bereits vorhandene Installation**. Vorhandene sechs Komponentendateien werden möglichst übernommen statt ohne Nutzen neu aufgebaut. Name `prism-execution` und andere aktuelle Owner werden nur mit begründeter Consumer-/Vertragsmigration geändert. Die physische Quellenwurzel ist zu entscheiden: Ziel ist eine gut auffindbare Autorenstelle; Chartlieferung und lokale Entwicklung benutzen dieselben Autorenbytes. In Charts kopierte/montierte Bundles sind generierte Lieferartefakte, keine zweiten manuell gepflegten Autoren.

`pipeline.json` referenziert ausgewählte Komponenten, Agentprofile, Workflowvorlagen und Operator-/Evalprofile. Sie enthält nur eigene Systemzusammensetzungswerte. Modelle, Timeouts oder Quoten werden dort nicht nochmals von ihren Komponentendateien kopiert. Relative Referenzen lösen sich an einem dokumentierten Bundle-Root auf; Pfadwechsel, unzulässige Aliase, fehlende Dateien, doppelte Owner oder widersprüchliche Instanzen werden vor Aktivierung erkannt. Kein beliebiger rekursiver Include-/Env-/Template-Expander als zusätzliche Konfigurationssprache.

**Pipelinegraph bleibt getrennt:** Workflowvorlage und Projektinput werden mit ausgewählten Profilen zum versionierten konkreten Ablauf kompiliert. Ein materialisierter Graph darf effektive Werte für Ausführung/Recovery enthalten, ist dann aber eine gebundene Ableitung. Er ist keine zweite editierbare Settingsquelle. Der bisherige CLI-/Schema-/Recoveryvertrag wird explizit migriert oder bei nicht unterstütztem alten Eingang ausdrücklich zurückgewiesen; keine stille Unterscheidung allein nach Dateiname.

## 4. Eigentum: ein Setting, ein fachlicher Autor

Für jedes Feld wird dokumentiert: stabile Setting-ID, Eigentümer, tatsächliche Quell-/Consumerpfade, Typ/Einheit, expliziter Autorenwert, Unterstützungs-/Grenzvertrag, Profil-/Änderungsscope, Secretreferenz, Evalfähigkeit, Altpfad und reale Abnahmefälle.

- Pluginpaket besitzt **eine Configdatei**, die benannte vollständige Profile und Einstellungen seiner unterschiedlichen Registrierungen aufnehmen kann. Zwei Reviewstages können etwa `quick` bzw. `deep` auswählen, ohne Werte im Graph zu duplizieren.
- Gemeinsam verwendete Endpunkte/Budgets/Identitäten gehören einem gemeinsamen Eigentümer. Consumer referenzieren sie; sie kopieren keine Defaults in eigene Configs.
- Providerbindung ist nicht beliebige Providerlogik: Existierende Provider/Registrierungen und deren unterstützte Parameter werden auswählbar. Eine neue Fähigkeit benötigt weiterhin Implementierung/Schema/Tests.
- Package-Discovery/Registrierungsvertrauen und tatsächlich gewährte Capabilities gehören dem gemeinsamen Plugin-Runtime-/Plattformeigentümer. Eine Pluginconfig beschreibt ihre fachlichen Werte und wählt erlaubte Profile; sie erteilt sich keine eigenen zusätzlichen Grants. Topologische SPIFFE-/Dienstidentitäten stammen aus dem zuständigen Operatorprofil. Die genaue Feldmatrix löst heutige getrennte platform-/Chartautoren auf.
- Projektanforderungen, Module, Dateien und Testinputs sind **Auftragsdaten**, nicht automatisch globale Settings. Agenten dürfen diese Daten erzeugen, aber keine Plattformpolicy still überschreiben.
- Versions-/Image-/Lockidentitäten bleiben in ihrer vorhandenen Versionsautorität; Config referenziert sie. Secretwerte bleiben im externen Resolver/Secretstore; Config enthält erforderliche Referenzen. Credentials werden nicht in effektiven Configberichten oder Evals ausgegeben.

## 5. Was sinnvoll dynamisch wird

| Kategorie | Beispiele | Vorgeschlagener Änderungspunkt |
|---|---|---|
| Agentische Qualität | Modell-/Providerprofil, unterstütztes Reasoning/Sampling, Prompt/Template, Context-/Token-/Tool-/Kostenbudget | nächster Modulstart, dann eingefroren |
| Pluginverhalten | Reviewlenses, Prioritäten, fachliche Schwellen, Reportformat, Browserauswahl, unterstützte Scannerrouten | nächster Modulstart, sofern Consumer und Vertrag dies unterstützen |
| Ausführungsabstimmung | Modulfrist, zulässige Retries/Concurrency innerhalb gebundener Obergrenzen, Output-/Artefaktgrenzen | nächster Modul-/Jobstart; Ressourcenclaims und Budgets vorher konsistent prüfen |
| Orchestrierung | Graph/Abhängigkeiten, Pflichtgates, Reparaturvertrag, ganze Pipelineparallelität | neuer Run; nicht rückwirkend laufende Abhängigkeiten umschreiben |
| Berechtigungen/Recovery | Grants, Trust-/Issueridentitäten, Journale/Storagebindungen, Wirkungsklassen | neuer gebundener Run bzw. kontrollierter Dienstneustart; kein beliebiger Moduloverride |
| Betrieb | Listener, Deploymenttopologie, Prozessidentität, Host-/Node-/Task-/Poolkonfiguration | kontrollierter Neustart/Rollout; D18 nach Phase 2 umsetzen |
| Optionaler unmittelbarer Livebetrieb | ausdrücklich dafür geprüfte, unkritische Anzeige-/Diagnosewerte | nur bei eigenem Consumervertrag; zunächst keine allgemeine Hotreloadfunktion versprechen |

Nicht jeder technisch veränderbare Wert ist ein sinnvoller Einstellknopf. Wire-/Schemaversion, Digestform, Zustandstransitionen, Idempotenzprüfung, Pflichtvalidierung und Recheneinheiten bleiben Implementierungs-/Protokollinvarianten. Bestehende numerische Werte werden fachlich eingeordnet: Parserbudget kann eine gewählte Operatorgrenze haben, die unterstützte technische Domäne bleibt im Validator. Kein mechanisches Verschieben jeder Konstanten oder jedes `??`.

Bestehende Produktentscheidungen bleiben maßgeblich: beispielsweise D03-Pflichtprüfungen, D04-Reparaturbudgets, D07-Aufbewahrung und D10-Risikoakzeptanz. Solche Policywerte können sichtbar in der Config stehen; eine geänderte fachliche Policy muss ausdrücklich entschieden und versioniert werden. Evaloptimierung erklärt fehlgeschlagene Pflichtprüfungen nicht zu Erfolg und darf keine Grants selbst erweitern. „Mehr Freiheit“ bedeutet bewusste kontrollierte Änderung, keine versteckte Abschwächung.

## 6. Änderungen während einer Pipeline

Bestätigte Bedienungsregel für geeignete Tuningwerte: Modul 1 ist gestartet und benutzt Profil A. Der User editiert den zuständigen Profilautor und veröffentlicht eine validierte Generation B. Modul 1 einschließlich seiner zusammengehörigen Prüf-/Cleanup-/Fortsetzungsarbeit behält A. Das später startende Modul 2 kann B verwenden. Bereits gestartete parallele Module behalten jeweils ihren eigenen Stand.

Der Startpunkt ist eine **fachlich eindeutige Moduleinheit**, nicht jeder Modellrequest. Für Buster wird die Konsistenz seiner Plan-/Fixtureeinheit gewahrt. Ein Retry/Recovery derselben akzeptierten Einheit übernimmt keine geänderten Werte unbemerkt; ein fachlich neuer Versuch mit anderem Profil bekommt eine neue gebundene Identität. Welche heutigen Stage-/Moduleinstanzen zu dieser Einheit gehören, wird mit Compiler/Core/Workerconsumer ausdrücklich gemappt. Bestehende Graph-/Runtimefingerprints lassen das noch nicht automatisch zu.

Die Moduleinheit und ihre vollständige akzeptierte Konfigurationsidentität werden **dauerhaft vor Dispatch oder Seiteneffekt** gebunden. Replay benutzt diesen gespeicherten Stand. D04-verbrauchte Reparaturbudgets, ursprüngliche Deadline-/Claim-/Wirkungsidentitäten und Belege werden bei neuer Profilgeneration oder neuem Versuch nicht zurückgesetzt. Ein geänderter Modell-/Promptwert erzeugt keine neue Freigabe für ungewisse externe Aktionen. Diese Übergänge benötigen einen echten versionierten Consumer-/Recoveryvertrag.

Ein „Latest“-Alias kann lediglich die validierte Generation für **noch nicht gestartete** zulässige Einheiten auswählen. Bei deren Annahme werden vollständiger Snapshot, IDs/Digests, tatsächliche Modell-/Prompt-/Provideridentität und Herkunft dauerhaft gebunden. Änderungen werden als Konfigurationsänderung sichtbar; ganze Pipelines mit gemischten Modulständen dürfen nicht als durchgehend identische Evalbaseline erscheinen.

Grundlegende Grants, Graph, Persistenz- und Recoverybindungen bleiben am Runstand. Tuningänderungen werden gegen dessen Obergrenzen und gegen aktuelle Auftragsanforderungen validiert; bei Konflikt keine Teilaktivierung und kein stiller Rückfall. Erweiterte Freiheit durch neue Grants/Topologie verlangt einen neuen autorisierten Stand, nicht einen unkontrollierten Übergang im nächsten Modul.

## 7. Profile, Anpassung und wenig Reibung

Empfehlung: ein vollständiges normales Startprofil mit ausdrücklich authorisierten Werten und gut benannten Rollen-/Pluginprofilen. Benutzer wählen Profile, statt jedes Feld neu auszufüllen. Editierbare Texte können in separaten Promptdateien liegen; Config referenziert und bindet ihre Identität. Konkrete Defaults werden aus vorhandenen tatsächlich effektiven Werten übernommen, nicht hier neu erfunden.

Für Projekt-, Nutzer- oder Evalvarianten soll eine schlanke Materialisierung vollständige Kandidatprofile erzeugen können. Kleine Änderungen sind als sichtbarer, validierter Diff zur Basis bequem; **die Runtime erhält immer genau eine vollständige ausgewählte Generation**. Basis/Änderung und Provenienz werden erhalten. Keine unübersichtliche Laufzeitpräzedenz aus Environment + CLI + Chart + globaler Config + Stageoverride, keine fehlenden Pflichtwerte aus Code ergänzen. Eine Profilvariante ist kein zweiter konkurrierender globaler Autor: Zuständigkeit und aktive Generation bleiben eindeutig.

Generierte materialisierte Dateien sind unveränderliche Liefer-/Laufsnapshots und werden nicht zusätzlich zur editierbaren Basis manuell gepflegt. Eine bewusst eigenständig editierte vollständige Variante ist ein eigener ausgewählter Profilautor, nicht zugleich eine weiter abgeleitete Ausgabe derselben Basis. Pro aktivem Setting-/Instanzscope ist eindeutig, welcher Autor gilt. Dieser Unterschied wird im Profilmanifest und in der Bedienung sichtbar; kein unklarer Doppelautor durch „bequeme Kopien“.

CLI/Editor müssen gemeinsam verständlich ermöglichen: Validieren, effektive Config mit Herkunft anzeigen, zwei Generationen vergleichen und ein vollständiges Profil materialisieren. Das sind Zielbedienungen, noch keine existierenden neuen Befehle. JSON-Schemas mit Feldbeschreibung, Einheit, Beispiel, unterstützter Domäne und Änderungsscope unterstützen Editorcompletion. Eine neue Weboberfläche oder ein eigener Configserver sind keine Voraussetzung der Zentralisierung.

Eine neue Pluginregistration wird über ihre echte Manifest-/Schemaidentität konfiguriert; keine wachsende harte Six-Owner-Liste pro Extension. Der Loader bleibt streng: registrierte Owner/Schema, eindeutige Dateien, vollständige unterstützte Werte und bekannte Keys. Ein optional deaktiviertes Plugin braucht nicht automatisch jede mögliche Installation. Bereits ausdrücklich vereinbarte Policyanforderungen, etwa vollständige Scannerpolicy auch bei deaktivierter Route, bleiben pluginbezogen erhalten.

## 8. Evalfähigkeit aller Komponenten

Jede sinnvoll optimierbare Komponente erhält einen dokumentierten Parameterbereich, messbare Aufgabe/Outputs und eine isoliert aufrufbare **tatsächliche Produktionsschnittstelle**. Config allein erzeugt diese Schnittstelle nicht; fehlende Aufrufer-/Harnessgrenzen werden als Restarbeit geführt. Engine/Core/Workeroptimierung umfasst auch Parallelität, Fristen, Quoten und Recoveryverhalten; Qualität ist nicht nur Modellwahl.

Eine Evaldefinition referenziert Komponente/Instanzprofil, feste Baseline-/Kandidatgenerationen, Szenario-/Datensatz-/Scoreridentitäten, Ressourcen-/Kostenbudget und Wiederholungen. Sie dupliziert keine Runtime-Defaults. Evalruns benutzen den expliziten **festen Evalmodus**, ohne zwischen Modulen neue Liveprofile zu übernehmen. Ergebnis bindet Code-/Image-/Plugin-/Prompt-/Modell-/Configidentitäten, Fallmenge, gemessene Qualität/Latenz/Kosten/Fehler und Umgebung. Unbekannte Providerkosten/Identitäten bleiben unbekannt; bestehende Preisdefaults werden nicht als aktuelle tatsächliche Preise ausgegeben.

Experimentprofile sind isoliert; sie verändern nicht die laufende Betreiberbaseline. Auswahl eines optimierten Profils geschieht bewusst mit nachvollziehbarem Diff und passender Pflichtverifikation. Scorer-/Szenariowege werden nur insofern konfigurierbar, wie sie tatsächlich existieren und anwendbar sind. Die Zentralisierung liefert die Voraussetzungen, sie autorisiert keine neuen kostenpflichtigen Evalkampagnen und behauptet keinen fertigen Evalrunner für jede Komponente.

## 9. Vollständiger deklarierter Pluginumfang

Die Inventuranlage enthält pro Manifest jede gefundene Registration mit Configschema und Capabilityreferenzen. Die derzeitigen Paket-IDs sind:

| Familie | Tatsächliche Pakete |
|---|---|
| Common | agent-observability, artifact-store, command-runner, git-workspace, network-http, notification-observer, openclaw-agent-events, operator-messaging, redis-transport, runtime-dispatch, secret-resolver, state-store, telemetry-observer, telemetry-store, transport-publisher, wait-store |
| Nova | architecture-validator, blueprint-sync, buster-quality-gate, case-study, delivery-lint, demo-handoff, human-approval, implementation-agent, lint, pipeline-review, preflight-contract, prism-design, project-summary, remote-test-gate, repository-adapter, review |
| Buster | api-flow, axe, container-build, coverage-budget, demo-auth-smoke, direct-command, http, junit-report, kubernetes-fixture, lighthouse, openapi, playwright, security-providers, size-budget, tailscale-exposure, visual |

Alle tragen das Präfix `kubeclaw.`. Die Matrix umfasst auch Plugins ohne Stageconfig oder mit mehreren Registrationen. Domain-/Contractpakete, bloße Helfer und Testfixtures sind keine zusätzlichen Plugins aus dieser Zählung. Weitere installierte externe Pakete erfordern eigenes Discovery-/Schema-/Configinventar; hier wurde kein externer Pluginbestand behauptet.

## 10. Konkrete Migrationspakete innerhalb Phase 1

1. **Feldinventar und Autoritätsmatrix:** vorhandene Inventare mit den 48 Manifesten, 57 Configschemas und tatsächlichen Produktionsreadern zusammenführen. Jeden relevanten Kandidaten klassifizieren; unaufgelöste Felder verhindern Vollständigkeitsbehauptung. Alle heutigen effektiven Werte, Defaults und Verbraucher vor Änderung sichern.
2. **Gemeinsamer Einstieg und Bundleloader:** `pipeline.json`-Systemschema, sichere Komponentenreferenzen und strenge atomare Generation. Produktions-CLI/-Charts/-Loader bis zu echten Consumern migrieren; alte swarm-/platform-/graph-Eingänge eindeutig trennen und abweisen/ablösen. Kein rein testspezifischer Expander.
3. **Fehlende Core-/Engine-/Serviceautoren:** Nova Orchestrator/Foundation/Prism Engine und Serviceendpunkte ergänzen, vorhandene Buster/Worker-/Prismkomponenten wiederverwenden. Nicht beim CONFIG-Paket bereits die D18-Ausführung implementieren. Aktuell benötigte native Einstellungen bleiben korrekt authorisiert bis Phase 3 sie ersetzt.
4. **Plugin-/Adapter-/Observer-/Provider-/Agent-/Promptprofile:** konfigurierbare echte Defaults zentralisieren, Registrierungsschemas passend streng machen, benannte vollständige Instanzprofile an Consumer verdrahten. Modelparameter nur unterstützen, wenn Adapter sie tatsächlich umsetzen können. Businesspolicy-/Invariantengrenzen explizit.
5. **Sichtbare Profile und Snapshotbindung:** Modulstart-/Run-/Neustartscopes sowie festen Evalmodus umsetzen; Projektcompiler und Recovery behalten die richtigen Generationen. Bedienung für Validate/Explain/Diff/Materialize schlank auf vorhandene Loader stützen.
6. **Deployment-/Dokumentations-/Gesamtprüfung:** alle erzeugten Env-/Chartwerte aus denselben Autoren ableiten, alternative Betreiberprofile prüfen, Altpfade entfernen/abweisen, jedes Setting mit positiver/negativer/mutierter Consumerwirkung belegen. Erst vollständige F1–F6/DOC-Abnahme ist Gesamt-CONFIG.

Diese Pakete sind zur gemeinsamen Umsetzungsauswahl definiert, keine bereits gestarteten Behebungen. Die Reihenfolge innerhalb CONFIG folgt dem gemeinsamen Autoritäts-/Loadervertrag; bereits integrierte Teilschnitte werden geprüft und wiederverwendet. Keine pauschale Neuimplementation.

## 11. Verbindlicher vorgeschlagener Abschlussmaßstab

- Jedes konfigurierbare Produktionsfeld hat eine eindeutige fachliche Zuständigkeit und einen nachvollziehbaren tatsächlichen Consumer; keine konkurrierenden editierbaren Autoren im selben aktiven Scope.
- Zwei unterschiedliche vollständige Profile verändern echtes Verhalten; deklarative Settings ändern echtes Render-/Ladeergebnis. Fehlende Werte, Typ-/Einheitenfehler, widersprüchliche Autoren und unzulässige Profile werden vor Wirkung abgewiesen.
- Echte Negativ-/Mutationstests erkennen wieder eingeführte Fallbacks/alte Autoren. Eine Schema-`default`-Annotation ist kein versteckter Laufzeitdefault; konkrete Startwerte stehen in der gepflegten Config.
- Atomare Profile verhindern Mischung unverträglicher Datei-/Secretrefgenerationen. Ein neues Modul bekommt nur einen vollständig validierten Stand; gestartete Einheiten, Replay und Recovery bleiben gebunden. Tests decken parallele Modulstarts, Editieren/Veröffentlichen und Fehlkonfiguration echt ab.
- Prompt-/Modell-/Provider-/Plugin-/Konfigurationsherkunft und wirksame Werte sind ohne Secretwerte sichtbar. Reale supported Parameter und unveränderliche Invarianten sind dokumentiert.
- Die userseitige Pflicht zur Eingabe bleibt klein: gültiges Startprofil, wenige bewusste Profilwahlen, verständliche Fehlermeldungen und Diff; keine manuellen Syncschritte zwischen Runtime und Charts. Keine neue große Configinfrastruktur als Voraussetzung.
- Moduloptimierung und feste Evalgeneration werden am echten Aufrufer bewiesen; vollständige Evals/Harnesses bleiben eigener Umfang, soweit bislang nicht implementiert.
- D17/F1–F6, A1–A8 und F-DOC gelten. Bei neuen Modul-/Profilverträgen werden konkrete Fälle vor Umsetzung festgelegt. CONFIG nutzt zunächst bestehende Teststandards, Phase 2 ordnet diese um; spätere Phase-3-/4-Tests folgen dem neuen Standard.
- Für jeden Schnitt: Dokumente/Beispiele/Befehle/Links prüfen und aktualisieren, echte Tests am exakten integrierten Stand, abschließende unabhängige Nichtautorenprüfung. Historische Belege und Fehlversuche erhalten; keine globale CONFIG-Abnahme aus einem Teilpaket.

## 12. Entscheidung und noch offene Konkretisierung

Bestätigt sind Systemeinstieg mit Referenzen, große sinnvolle Anpassbarkeit und Übernahme geeigneter Änderungen beim nächsten Modulstart mit stabiler laufender Einheit und festem Evalmodus. Noch zu konkretisieren: physische Autorenwurzel, genaue Owner-/Profilnamen, heutige Stage→Moduleinheit-Zuordnung, erste Migrator-/Consumerpakete und ihre Pflichtfälle. Der vorgeschlagene Profilmaterialisierungsweg und die Scopeklassen sind zur Review vorgelegt; sie sind kein Anlass, dieselben bestätigten Grundsatzfragen erneut zu stellen.

Die wesentliche Ergänzung zu den ursprünglich genannten vier Ebenen sind Agent-/Prompt-/Providerprofile, generische Foundation/Runtime, Services/Deployment sowie Speicher/Observability und der konkrete Workflow-/Projekt-/Evalscope. Sie werden in derselben einfachen Autorenstruktur verwaltet, soweit Code und sinnvoller Consumervertrag dies tragen. Kein zusätzlicher Produktumfang wird allein wegen einer Dateiliste still implementiert.

## 13. Unabhängige Gegenprüfung und Übergabe

Der nicht implementierende Prüfer hat alle 48 Paket-IDs und 57 direkten Schemapfade unabhängig enumeriert. Seine beiden Hinweise — keine doppelte editierbare Profilautorität und dauerhafte Modulbindung vor Dispatch ohne D04-Budgetreset — sind aufgenommen und anschließend bestätigt. Die erweiterte Inventur bindet 136 Quellen; 135 sind beim Abschlussvergleich unverändert, `decisions.md` ist durch die dokumentierte D20-Entscheidung erwartbar geändert. Der [vollständige Prüfbericht](independent-config-definition-20261012.md) nennt Methoden und Grenzen. Das Review ist keine semantische F1-Gesamtabnahme oder bereits implementierte Modul-Dynamik.

Für den Wechsel in eine neue Ausführungsumgebung: [Cloud-Übergabe](resume/CLOUD-HANDOFF-20261012.md). Dokumente im Repositoryverzeichnis sind noch nicht automatisch committed, gepusht oder im Cloud-Checkout vorhanden. Die Übergabe nennt den tatsächlichen dirty Stand und ausdrücklich nicht übertragene Rohbelege/Caches.

## 14. Konkretisierung im aktuellen Cloud-Checkout

Die [Cloud-Aufnahme](cloud-config-assessment-20261012.md) ordnet den Repo-Scope in 39 Consumergruppen, benennt zusätzliche Shell-/Entrypoint-/OpenClaw-/Ops-Quellen, konkrete Modulgrenzen und C1-Abnahmefälle. Ihre Root-, CLI- und Modulzuordnung sind konkrete Empfehlungen zur Entscheidung, keine bereits bestätigten Implementierungsdetails. Der frühere Stand oben bleibt als historische Definition erhalten. Die 48 Pipeline-Manifeste sind weiterhin korrekt; zusätzlich existieren zwei OpenClaw-Erweiterungen mit anderer API. Die Vorlage begrenzt semantische F1-Abnahme ausdrücklich und ersetzt keine vollständigen Feldwirkungstests.
