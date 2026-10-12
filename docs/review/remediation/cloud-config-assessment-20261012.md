# CONFIG: aktuelle Codeaufnahme und konkreter Umsetzungsvorschlag

Untersucht: Branch `codex/cloud-config-handoff-20261012`, Commit
`4b4684667c2dc27d01583fbec395c94d9f7a0456` (auch im [Quellenindex](../evidence/cloud-config-assessment-20261012/source-index.json)).
Stand: 12. Oktober 2026. **Dokumentationsauftrag; kein Produktionscode geändert,
keine Implementierungsfreigabe und keine CONFIG-/Findingabnahme.**

**Aktuelle Vorgabe D21/D22:** Zentraler Zielname **`pipeline.config.json`**,
weiterentwickelt aus dem vorhandenen `swarm.config.json`-Einstieg. Projektworkflow
bleibt **`pipeline.json`**; keine zusätzliche `system.json`. Die tatsächliche
Umbenennung ist noch nicht implementiert. C0 ist offen, C1–C6 nicht freigegeben.
Der eigenständige [OpenClaw-Auftrag](OPENCLAW-CONFIG-GOAL.md) enthält die vollständige
Taskliste und verpflichtende frische Nichtautorenprüfung/Codequalitätsgates.
Frühere Namensempfehlungen im historischen Review sind keine aktuellen Ziele.

Dieser Bericht konkretisiert die [bisherige Definition](config-definition-20261012.md).
D17–D22 gelten; D21 präzisiert den zentralen Dateinamen. Die bisherigen Inventare, Entscheidungen und Rohbelege
bleiben historische Quellen; neu vorgeschlagene Verträge sind ausdrücklich Vorschläge.

## 1. Arbeitsfähigkeit und Beleggrenzen

Frischer vollständiger Git-Clone über HTTPS, gewünschter Branch, sauberer
Ausgangsbaum. `cc02012610b6e9e20a3155577140e8914f33ddf7` ist verfügbar und
Vorfahre; seitdem ausschließlich `CLOUD-CONFIG-TASK.md` hinzugefügt.
GitHub-Connector liest Auftragsdatei und Übergabe erfolgreich. Zu Beginn keine
`AGENTS.md` im Checkout; für die spätere OpenClaw-Übergabe wurde eine Root-
`AGENTS.md` mit den aktuellen CONFIG-Regeln ergänzt. Quellcode, Tests, Lockfile, Übergabedokumente und ausgewählte
Originalbelege sind vorhanden. Git, Node 24.19.0, npm 11.9.0, Python und Docker
sind verfügbar; Docker wurde nicht benutzt. `npm ci --ignore-scripts --no-audit
--no-fund` aus Root-Lockfile erfolgreich. Install-Skripte wurden nicht ausgeführt.
Helm fehlte zunächst; lokale Version 3.18.4 entspricht den Runtime-/Reliability-
Workflows. Tatsächliche Laufresultate stehen im [Prüfprotokoll](../evidence/cloud-config-assessment-20261012/verification.json).

Mit Helm 3.18.4: `verify:config:components` typecheckt erfolgreich und führt
649 Tests aus: **645 bestanden, 4 fehlgeschlagen, 0 Skips**. Die vier
Helmnegative (CI05 zweimal, CR06, CP06) lehnen die alten Autoreneingaben tatsächlich
ab, scheitern aber beim erwarteten Fehlertext: `/additional properties/` gegenüber
`Additional property … is not allowed`. Gesamtlauf bleibt **FAIL**, kein
umklassifizierter PASS. Der vorangehende Lauf ohne Helm (298/649 bestanden)
und beide Rohlogs bleiben erhalten. Keine Test-/Codekorrektur in dieser Session.

Registercheck besteht; er prüft Konsistenz, keine fachliche Abnahme. Keine Hosts,
Cluster oder externen Provider wurden verändert/aufgerufen. Ein aktives
Produktions-Nova-Plattformprofil, externe Plugininstallationen, Secretstore-
Revisionsverträge und der freigegebene Teststandard der anderen Session liegen
nicht als nachgewiesener aktueller Betriebsstand vor. Sie blockieren diese
Codeaufnahme nicht; vor entsprechender Migration/Live-Abnahme sind sie nötig.
Historische Scanner-Caches und SDKs werden für diese Arbeit nicht restauriert.

Der neue [Quellenindex](../evidence/cloud-config-assessment-20261012/source-index.json)
bindet 1.824 Produktions-/Liefer-/Betriebsquellen, 50 Runtime-Erweiterungsmanifeste
plus ein Codex-Ops-Pluginmanifest und
565 direkte `.Values`-Verbraucherstellen. Der bestehende AST-Scanner liefert
[1.408 Discoveryeinträge](../evidence/cloud-config-assessment-20261012/settings-discovery.json).
Der ergänzende Scanner berücksichtigt Shell/Docker/ops/tools und indexiert
18.058 Markerstellen (einschließlich unveränderlicher Releasekopien). Diese Zahlen sind Suchabdeckung, **keine Zahl semantisch
abgenommener Settings**. Feldname im Quelltext ist nur eine Navigationshilfe;
transitive Reads, dynamische Keys und `$ref` dürfen daraus nicht als bewiesen gelten.
135/136 alte Quellenidentitäten stimmen; `decisions.md` enthält bereits die
bekannte D20-Ergänzung. Historische Bewertung wird nicht als neue Abnahme übernommen.

## 2. Bestandsaufnahme mit konkreten Zuständigkeiten

Die Gruppen unten sind der fachliche Migrationsumfang. Deklarierte Einzelfelder,
Schemas, Registrationen und Quellenidentitäten stehen im Index; dynamische Maps
haben Feldmuster statt einer erfundenen endlichen Anzahl. Ein Setting besteht aus
Owner, Profil, Registration/Instanz und Feldpfad. Beispiele: zwei HTTP-Instanzen
können unterschiedliche Grenzen haben, aber nur je einen ausgewählten Autor.

Aktivierungsklassen im Ziel:

- **S**: validierte neue Dienst-/Prozessgeneration nach kontrolliertem Neustart/Drain.
  Bestehende Aufträge behalten ihre Bindung; nicht laufende Pools umkonfigurieren.
- **R**: neuer Run; Graph, Berechtigung, Recoverygrundlage und Budgetobergrenzen
  bleiben für bestehende Runs unverändert.
- **M**: nächster noch ungebundener fachlicher Modulstart, dann unveränderlich
  für Fortsetzungen und technische Wiederholungen. Prüfung gegen R-Obergrenzen.
- **J**: Annahme eines neuen Prism-Auftrags bzw. Buster-Plans als Untereinheit
  der übergeordneten M-Bindung. Kein erneutes Latest-Lookup unter einem Modul.
- **V**: Software-/Protokoll-/Versionsautorität oder Auftragsdaten; kein
  frei optimierbarer Operatorparameter.

Für **jede** Gruppe gilt: explizite ausgewählte Werte, strikte Typ-/Einheits-
und Referenzprüfung vor Wirkung; Fehlermeldung mit Owner/Profil/Feld, erwartetem
Vertrag und Quellpfad, ohne Secretwerte. Migration jeweils mit zwei vollständigen
Profilen am echten Consumer, fehlendem Pflichtfeld, falscher Einheit/Typ,
unbekanntem Key, altem gleichwertigem Override und semantischem Fallbackmutanten.
S/R/J-Gruppen brauchen zusätzlich Neustart-/Recovery-Negative; M-Gruppen die
Modulbindung aus Abschnitt 4. Diese gemeinsamen Kriterien sind Bestandteil jeder
Zeile und ersetzen keine individuellen Consumerprüfungen.

Quellpfade sind relativ zum Repo. Tabellen gruppieren zusammengehörige Werte;
sie behaupten nicht, jeder Marker sei ein Nutzerparameter.

| ID / Einstellung oder Gruppe | Heutige Quelle, Priorität und tatsächlicher Consumer | Zielautor / Aktivierung / Profile und Eval | Besondere Validierung, Migration und Pflichtwirkung |
|---|---|---|---|
| G01 Bundle, Referenzen, Labels | `charts/kubeclaw/files/config/swarm.config.json` → Foundation `config/swarm-bundle.ts` → `swarm.ts`; sechs feste Owner/Dateinamen. `profile/features/tuning` schema-konstant, `overrides={}`; keine freie Profilauflösung | `config/pipeline.config.json` referenziert Owner/Profile; S/R, feste Evalgeneration | Vorhandene no-follow Reads, Hashes und Freeze wiederverwenden; atomare komplette Generation. Labels nur behalten, wenn reale Wirkung/Komposition definiert; keine Schein-Tuningknöpfe |
| G02 Prism Control | `prism-control.config.json.settings`: port, preferenceSubject, artifactRoot, studioPublicUrl → `server/control-config.ts`, Control Composition/Server. Legacy PORT/ARTIFACT_ROOT etc. abgewiesen | `config/services/prism-control.config.json`; S | Absoluter Nicht-Root-Artefaktpfad, URL, Port; anderes Profil muss realen Listener/Artifactreader ändern |
| G03 Prism Studio | `prism-studio.config.json.settings`: port, controlUrl, controlTimeoutMs → `server/studio-config.ts` → Studio Proxy; alte ENV abgewiesen. STUDIO_ROOT separat, image-relative Default | `config/services/prism-studio.config.json`; S. Assetpfad als Installationsbindung, kein Modell-Tuning | Origin ohne Credentials/Pfad; Proxyfrist echter HTTP-Test; generierten Image-Assetpfad explizit binden |
| G04 Prism Worker Ingress | `prism-worker.config.json.settings`: ingress port/connections/active/probe/input/timeouts, shutdown → `worker-config.ts` → `worker-server.ts` | `config/services/prism-worker.config.json`; S | Active+Probe ≤Connections; Shutdown >Supervisor close+drain und Podgrace. Echte TCP/Body-/Drainwirkung; keine laufende Frist zurücksetzen |
| G05 Prism native Execution | `prism-execution.config.json.settings.native`: resourcePolicy cpuTimeMs/memoryBytes/tasks, resultBytes/dispatchTimeout, supervisor UID/GID/Quoten/Poll/Drain/Close → Control-Envelope und `config/native-worker.ts` → native Supervisor | `config/engines/prism-execution.config.json` zunächst unveränderter Owner; S/J innerhalb R/M | CPU-Zeit nicht CPU-Rate; Tasks nicht Prozesse. Native Policies bleiben bis D18-Cutover. Fit/Endabrechnung und Ergebnisübertragung nicht durch Configänderung umgehen |
| G06 Worker Core localRuntime | `worker-core.config.json`: drainTimeoutMs/cancellationTimeoutMs/replayLimit → `loadWorkerCoreSettings` → Buster Service/`worker/local-runtime.ts` | `config/cores/worker-core.config.json`; S/J | Begrenzter Replay und Cancellation/Drain am echten generischen Core. Clock-Injection und Zustandstransitionen sind V |
| G07 Buster Preparation | `buster-engine.config.json.settings.preparation`: Archiv-/Source-/FD-/Ownership-/Journal-/Bytesgrenzen, CPU/RAM/Tasks, Fristen, Queue/Parallelität → `preparation-config.ts`, native Preparation/Store | `config/engines/buster-engine.config.json`; S/J | Extraktion, Nicht-Root-Pfade, FD-Reserve, Speicher-Fit, echte Quoten; keine Rückkehr zu aus runtime.json entfernten Autoren |
| G08 Buster Admission/Readiness | derselbe Owner: maximumActiveJobs/QueuedJobs/ConcurrentAttempts, dependencyReadiness maximumExecutionMs/OutputBytes → `production.ts` → `remote-plan-service.ts`, Readiness | Buster Engine; S/J | Ablehnung/Backpressure mit kleinen Grenzen, parallele Aufträge; keine künstliche Kapazität bei Profilwechsel |
| G09 Buster Execution/Reports | Engine `settings.execution` inkl. observation/providerRuntime/reports/processInput → Foundation `buster-execution.ts` und Buster Plan-/Nodeausführung | Buster Engine, J; geeignete Qualitätswerte M nur innerhalb stabiler Plan-/Grantgrundlage | Ganzer Plan/Fixtures eingefroren; Nodefristen, Parser-/Output-/Reportgrenzen separat; keine CPU/Taskvertragsänderung vor Phase 3 |
| G10 Buster Clusterinvoker | Engine `settings.clusterInvokers` → Foundation `buster-cluster-invokers.ts` → `production-cluster-options.ts`; namespace/RBAC/Readiness/Fixture/Exposure/runtimeSecurity-P policy. Retired ENV wird abgewiesen | Buster Policy hier; topologische namespace/identity/profile-Refs aus Deploymentautor. S/R/J | Vollständige Policy auch bei deaktivierter Route bewahren; Bound Broker/RBAC bleibt stabil, echte denied Grants |
| G11 Buster Remote Runtime | `docker/buster-runtime-entrypoint.sh` erzeugt runtime.json/platform.json aus ENV und Code. `production.ts`/`production-config-values.ts` lesen Listener, Auth, Store/Resultquoten, Sourceauthority, shutdown, roots, platformConfig | Service `config/services/buster-runtime.config.json`; S; Ownerrefs auf Engine/Runtime/Deployment | Heute Portfallback 18891, Sourceauthority `nova:production`, Store 10.000 Records/1 GiB/64 MiB record, result 64 MiB, shutdown 15s. Explizit übernehmen; Writer entfernen, generated outputs immutable |
| G12 Buster native Capability-Runtime | derselbe Entrypoint authorisiert directCommand/containerBuild/networkHttp/browser*/securityScan; production-*options.ts → echte Capabilityimplementierungen, nicht Nova Adapter. Codebudgets/ENV Origins/BuildKit/Scanner-DBalter | vollständige benannte Runtimeprofile beim Buster Engineowner; unabhängige Plugin-Providerprofile referenzieren nur eigene Parameter. J/R/S | Scanneralter 48h/7d/8 GiB DB; Browser concurrency 4; explizite erlaubte origins/ports/executables. Gleichnamige Nova network-http ist anderer Consumer, kein unbewiesener gemeinsamer Parameter |
| G13 Discovery/Trust/Isolation | separate `pipeline-platform.v2`: installationRoots/trustedBuiltinRoots/externalTrust/isolation → `platform.ts` → `prepareRuntime`, discovery/activation; Buster verwendet nur Registryanteil | `config/cores/plugin-runtime.config.json`; R/S | Bestehende Digest-/Attestationbedeutung erhalten; fehlende Isolation kein stiller builtin/external Wechsel; Pfadauflösung relativ zur Generation explizit |
| G14 Grants/Provider-/Aktivierungswahl | platform providers/grants/activeAdapters/observers; `registry/capabilities.ts`, `engine-runtime.ts`. Kein automatischer alleiniger Provider; Adapter/Observerconfigs aus platform Maps | Plugin-Runtime/Core policy referenziert Registration/Instanz/Profile; R | Pluginconfig darf sich keine Grants geben. Aktivierung unabhängig vom bloßen Vorhandensein einer Config; Consumerclosure strikt validieren |
| G15 Nova Persistence/Lifecycle/Issuer | platform storageRoot/shutdownTimeoutMs/effectLockTtlMs/orchestratorIssuerId/admin issuers → engine-runtime/admin, Effects/Wait/Run. LockTTL explizit 60.000–86.400.000 ms; Buster generator 300.000 ms | `config/cores/orchestrator.config.json`; R/S | Pfad-/Issuerbindung bei Recovery unverändert; Lifecyclebudget von EffectTTL trennen; Adminreopen nicht durch Profil autorisieren |
| G16 Core Codepolicies | `stage-executor.ts`: Lease memory 512 MiB/cpuMillis=stage timeout; `state/journal.ts` append lock 5s; Runtime effect-result summary 16 KiB; run mutation/file mutex policies | Orchestrator oder Plugin-Runtime je Consumer; R/S, ausgewählte Performancefelder Eval | Lease memory/Lockfrist sinnvolle explizite Policy; CPU-Ableitung mit bestehendem Vertrag prüfen. Wire-/Hash-/Sequence-/Statealgorithmus V. Nicht wahllos jede Zahl verschieben |
| G17 Workflow/Compiler | `project/compiler.ts`, coverage/demo/source erzeugen Implementation/Lint/Review/Test-Stages; inline config aus Auftrag. Execution defaults: Modul 1.800.000 ms, final maxAttempts2/technicalRetries1; preflight/demo 120.000 ms | `config/workflows/*.json` Struktur und explizite Ausführungsprofile, Pluginprofile als Refs; R plus M-Tuningbindung | Projektmodule/Files/sourceRevision/Tasks sind Auftragsdaten. Compiler schreibt abgeleiteten Graph, keinen zweiten Settingsautor. D04-Abnahme unverändert |
| G18 Stage-/Agentconfigs | alle Nova Stage `context.config` über StageExecutor aus Graph; 16 Nova-Pakete/Schemas im Index; agent/agentRole, review/lint/test gates, approval/report semantics | je `config/plugins/<manifest-id>.config.json` benannte vollständige Registrationsprofile; Agentrefs `config/agents/agents.config.json`; M/R | Input/result schema, Encoding und Gatepflicht V. Provider-/Trustwechsel R; Prompt-/Modelltuning M nur unterstützt und gebunden |
| G19 Review Qualität/Scale | `review/src/repository-review-profile.ts`: grade fast/standard/deep + overrides; aliases maxInputTokens/maxPromptTokens; DEFAULTS Preise/Parallelität/Lenses/Slicing/Budgets; real `repositoryProfileFromConfig`/Reviewpipeline | Review Plugin, vollständige fast/standard/deep Profile; M | Beide Tokenizer/output-Reserve aktuell eingeschränkt (o200k_base/6000); keine freie Modellparameterbehauptung. Alias entfernen oder eindeutiger Migrator; Preise Schätzparameter, kein tatsächlicher Kostenbeleg |
| G20 Common HTTP | platform adapter config → `network-http/src/adapter.ts::parseConfig`: origins required; GET, accept/content-type/idempotency-key, request/response1MiB, timeout30s Fallbacks | `config/plugins/kubeclaw.network-http.config.json`, Instanzprofile; R/S. Künftige modulbezogene Instanzen nur mit Vertrag | Sicherheitsallowlists R; Frist/Bytes ggf. M erst nach instanzbezogener Bindung. Requestmethod GET ist Inputnormalisierung, getrennte APIentscheidung; redirect denied bleibt Invariante |
| G21 Artifact/State/Wait/Telemetry Stores | vier Common Pluginconfigs → jeweilige `src/adapter.ts` → Durable Stores. roots required; records100.000/store256MiB; maxEntry/Record1MiB, Artifact16MiB. Artifact metadata record64KiB im Code | je Plugin eine Datei/Instanzprofile; R/S; gemeinsame physische Storagezuordnung Deploymentrefs | Lokale Pluginquote nicht globale Speicherquote; existing blobs/records/Retention nie bei Reload nullen. Digest/mediaType/state transitions V |
| G22 Messaging/Notification/Telemetryobserver | platform maps → operator-messaging adapter und notification/telemetry/agent-observability observers; targets Secretrefs/Origins, delivery quotas, labels/formats, namespaces/stream | jeweiliger Pluginautor; R/S; Darstellung M nur bei eigenem instanzbezogenem Aufrufer | Effect-/Receipt-/Observerdelivery behalten Konfiguration. Notificationregistrierungen teilen eine Datei, unterschiedliche Profile; keine Secretendpointbytes im Explain |
| G23 Runtime Dispatch | platform → `runtime-dispatch/src/adapter.ts` und `openclaw-config.ts`; HMAC default oder spiffe-proxy, request/response1MiB; target IDs/endpoints/tokenSecret bzw. OpenClaw WS/session/options | ein Pluginautor, getrennte Registrationsprofile; R/S, Modell/Prompt über Agent-M-Bindung | Loopback/TLS/Auth strikt; Session/Resultpersistenz/cleanup weiter gebunden. Aktuelle SDK runtimeDispatchProfile/reviewCacheProfile versionsgebundene Verträge, nicht durch freie JSON ersetzen |
| G24 Command/Git/Redis/Transport/Secret | Common Manifeste/Schemas → module entries → adapter/config readers; executable/root/env allowlists, time/output/resource policies, Redis endpoint/TLS/stream, publish bounds, names→Secretrefs | je Pluginautor; R/S (J/M nur zukünftige modulgebundene Werte). Externe Secretwerte gesondert | Prozess-/Filesystem-/Credentialgrantgrenzen bleiben. Request revision/remote/input ist Auftragsdaten, Algorithmus/Idempotency V. Configdefault und Requestdefault getrennt inventarisieren |
| G25 Sonstige Nova Adapter | demo-handoff, lint, pipeline-review, repository-adapter über Manifestmodule; lint policyPath lädt `lint-policy.json`+tool configs/baseline/packs; evidence journal/artifact/bundlelimits; Gitbuffer Codepolicies | jeweiliger Pluginautor referenziert Policyressourcen unter `config/plugins/resources/`; R/S und geeignete fachliche Werte M | lint tool/rule configs bleiben externe deklarative Ressourcen desselben Owners, keine Settingskopie. Demo durable intent/receipt/CAs; Repository sync Gittimeouts nicht durch async wrapper als wirksam behaupten |
| G26 Buster Provider-/Reportconfigs | 16 Pakete, testProviders/reportAdapters, configSchema/runtimeConfigSchema → Registryresolve → Planruntime/Provider/Reportadapter; Scan-/Browser-/HTTP/Testfall-/Budgetparameter | je Pluginautor, vollständige benannte Profile; J/M | **Registryresolve wendet Defaults an**, Adaptervalidate nicht. `$ref` und tatsächliche Capabilitieschemas auflösen; materialisieren nur aus explizitem Autor, Runtime no-default validate. Plan-/Testinput bleibt Daten |
| G27 Prism Engine/Provider/Cache | `engine/index.ts`, execution-cache/design-providers; native-worker-host baut **DeterministicDesignProvider** direkt. OpenAICompatible unterstützt endpoint/apiKey/model/embedding pair/timeout60s/systemprompt im Code; kein belegter produktiver Modellselektor | `config/engines/prism.config.json` + Agent-/Promptrefs; J/M; Cache sizing S/J | Echte Providercomposition erst verdrahten; HTTPS/internal svc, embedding pair, typed operations. Cachelimits explizit; keine zusätzlichen sampling/reasoningfelder ohne Providerconsumer |
| G28 Prism Attempt/Claim | `engine/worker-envelope.ts` erzeugt claim10min, timeout300s/cleanup10s/log1MiB/result16MiB/evidence128MiB/64files; Worker validates/journals accepted envelopes | Prism Engine Executionprofile J, Runobergrenze R; genehmigte neue Profile vor Annahme | Claim-/queueDeadline/executionId und specDigest nach Annahme erhalten; neue Config nicht neuer Auftrag. Dev image digest Ersatz ist Entwicklungsmodus, Versionen V |
| G29 Prism zusätzliche Services/Productauthority | ingestion.ts ENV: port8080, quarantine root `/quarantine`, TTL1h; agent-bridge port18080/loopback Control28080. Productauthority keys/decision policy sowie DB/trust in Control Composition | `config/services/prism-ingestion.config.json`, `prism-agent-bridge.config.json`; S. Productauthority Policy bei Control + externe signierende Keyrefs | Quarantine Retention/Expiry nicht rückwirkend verlängern; Review/Signed Decisions nicht neu interpretieren. Productdaten/Revisionen sind Daten, nicht globale Settings |
| G30 Prism Endpoints/Trust/Secrets | control/worker-config.ts ENV URLfallbacks prism-worker/ingestion/control:8080; SPIFFE_ENABLED false wenn nicht true, IDs leere Fallbacks; HMAC/DB/session/ingress secrets separat | Endpoints/IDs/Trustmode aus `config/deployment/operator.config.json`; Services referenzieren Bindings, S/R | Expliziter Authmodus und erforderliche vollständige Trustpolicy, Secretrefs/Revisionsvertrag. Keine ENV→Config→Code Präzedenz; HMAC vs SPIFFE ist bewusste Betriebswahl |
| G31 OpenClaw Agent/Model/Prompt | `charts/kubeclaw/templates/configmap-gateway.yaml`, configmap-workspace, values/my-values: model primary/fallbacks, Astra-spezifische policy, reasoning/context/tool/compaction, Rollenworkspaces/Prompts; LiteLLM Routing | `config/agents/agents.config.json`, `config/prompts/*`; Endpointbinding Deployment; M mit echter dispatch session selection, Gateway S | Fallbackmodellliste als explizite Providerpolicy mit protokolliert tatsächlich gewähltem Modell; kein stiller Runtimeersatz. Prompttemplates+Variablen+Resultvertrag hashen; Gateway reload nicht behaupten |
| G32 Zwei OpenClaw Extensions | observer `openclaw.plugin.json` + config.ts: pluginConfig > ENV, redisTls=false; Queue/Retry/Hookwerte required. Prism `openclaw-plugin/index.mjs`: config.controlUrl > ENV > loopback28080 | `config/plugins/kubeclaw-agent-observer.config.json`, `kubeclaw-prism.config.json`; S; Modellhooks nur Beobachtung | Andere Extension-API als Pipeline-Plugins, eigene Schemas/IDs behalten; generated beobachtbare Eventcontracts nicht zusätzliche Autoren; token/password external refs |
| G33 Deployment/Infrastructure | charts/{kubeclaw,prism,gitops,ops-pod}, values/my-values/gitops-platform: namespace/replicas/placement/resources/ports/volumes/Ingress/RBAC/identity/network/DB/Redis/LiteLLM | Operatorprofil mit Service-/Node-/Integrationbindings; S/R; technische Load-/Capacity-Evals getrennt | Helm merge heute CLI > overlay > defaults; Render aus einem gewählten Profil, keine zusätzliche --set Policy. Drittanbieterchartvalues generiert; Betriebsausfälle/Live getrennt genehmigen |
| G34 Host-/Node-/Native Bootstrap | render-native-worker-node, prepare/activate scripts, native-node/pool/runtime-identity, Kubelet/NRI/Hostpaths; generierte root-owned node/pool Identitäten | Operatorprofil authorisiert Ressourcenkapazität; installierte beobachtete Identität bleibt unabhängiger Nachweis; S | Config kann gemessene Kapazität/Nodeidentity nicht erfinden. D18 entfernt Rollenpools erst Phase3. Gemeinsamer Kubelet/Hostschutz bleibt; alte CPU-Zeitsemantik erhalten |
| G35 Releases/Versions/Locks | versions.json, Docker ARGs/tool locks/browser archives, GitOps selection/releases, image/source digests → Render/Build/Releaseconsumer | bestehende Versionsautorität; pipeline referenziert versionierte Lieferung. V | Keine Configkopie von Versionsdefaults. Generierte Releases unveränderlich; Auswahl/Promotion bewusst. Zweitautor my-values/image tags auflösen, nicht Versionsquelle verschieben |
| G36 Ops-/Entwickler-/Reviewtools | tools/ops-mcp config.mjs ENV Port8080/host0.0.0.0/default namespace kubeclaw/argo argocd, namespace/origin/bearer policy; ops/pod config.toml; review scripts CLI/supervisor | Ops Service/Operatorprofil; S/R. Entwicklerwerkzeuge behalten eigene explizite Toolconfig, nicht Corepolicy | Ops permissionboundary unabhängig von Agentprofilen. Bearerwerte extern; lokale tool flags Aufrufdaten; repository review budgets gehören Reviewprofil statt zweiter Supervisorautor |
| G37 Evals | Prism evaluation/domain rules, Review budget/execution/output, Buster Providercontracts sind reale Teile. Kein generischer Evalrunner im Code nachgewiesen | `config/evals/*` Szenario-/Scorer-/Dataset-/Generationrefs; feste R/M/J Auswahl | Dataset/inputs/output hashes, tatsächliche Modell-/Code-/Image-/Pluginidentität, Messwerte und unbekannte Kosten binden. Keine bezahlte Kampagne, keine behauptete Deterministik |
| G38 Build-/Deliveryauswahl | `.github/workflows/build-images.yaml` → `scripts/updates/runtime-inputs.mjs` isImageInput/isDeploymentInput, `.dockerignore` und Dockerfile-spezifische Ignorefiles, `updates/release-configuration.mjs`, role-bundle Packagingmanifeste → Release-/Chart/Imageprüfung | Build-/Liefervertrag referenziert Configgeneration, Software-/Packageownership bleibt V | Heute `config/` nicht in Changefilter/Buildcontext freigegeben; Releaseguard pinnt alte Chartsymlinks. C1 muss Filter, Staging, Digests/Guards und echte Packagingcaller zusammen migrieren, sonst reine Autorenänderung wirkungslos |
| G39 Namespacecontroller/Readiness/Product | `cmd/buster-namespace-controller/main.go` ENV/helper/file: namespace ENV > SA namespacefile > kubeclaw, APIgroup/version, allowedPrefixes=test, TTL7200s/max86400s, poll3000ms, SA/Rolenamen/access policy. HTTPclient60s, LimitRange requests100m/128Mi/128Mi, limits1CPU/1Gi/2Gi im Code. demo-readiness/product: listen/audience/producer/TLS/verifykey/actors und HTTPbudgets | `config/services/buster-namespace-controller.config.json`; Operatorrefs für Namespace/RBAC/TLS, S/R; vorhandene Lease-/Decisionzustände bleiben gebunden | TTL≤max, actor/producer/issuerpolicy, poll/timerdomain, namespace/access/grants strikt; defaultfreie Go-Composition nötig. APIgroup/version als Protokollmigration V. CRD Specs/TTL und Lease UIDs Auftragsdaten, keine zentrale Configkopie; Snapshotstatus/Retention nicht rückwirkend ändern |

Offene Vollständigkeitsgrenze: keine semantische F1-Gesamtabnahme aus dieser
Gruppenmatrix. Vor **jedem** Migrationsschnitt werden dynamische Feldmuster,
transitive `$ref`-Felder und request-selected Toolpolicyfelder für dessen konkrete
Consumerclosure einzeln geschlossen. Der Index führt unbekannte Consumerstellen
als solche; keine Schema-Präsenz ersetzt Verbrauchsnachweis. Externe installierte
Pakete brauchen ein ergänzendes Manifest-/Schema-/Consumerinventar. Damit ist
der gesamte erkennbare Repo-Scope zugeordnet, die vollständige Feldwirkung bleibt
der überprüften Migration vorbehalten. Das ist kein Anlass, erst 11.688 Marker
mechanisch zu konfigurierbaren Parametern umzuschreiben.

## 3. Einfache Autorenstruktur und Bedienung

**Empfehlung zur Entscheidung:** Repo-Root `config/` als einzige Autorenwurzel.
Bestehende Ownernamen zunächst erhalten; `prism-execution` nicht ohne
Consumergrund in generic Worker Core umbenennen. Orchestrator=Nova Core,
Plugin-Runtime=Foundation/Discovery/Trust; Enginepolicy bleibt fachlich bei
Prism/Buster. Zusätzliche Services brauchen eigene Dateien, kein zweiter Engineautor.

```text
config/pipeline.config.json                    Systemkomposition, Owner-/Profil-/Workflowrefs
config/cores/{orchestrator,plugin-runtime,worker-core}.config.json
config/engines/{buster-engine,prism-execution,prism}.config.json
config/services/<service>.config.json
config/plugins/<echte-manifest-id>.config.json
config/plugins/resources/<plugin-id>/   z.B. Lintpolicy/Rulepacks/Toolconfigrefs
config/agents/agents.config.json        Rollen, Modellprofile, unterstützte Parameter
config/prompts/                         Text/Templateautoren
config/deployment/operator.config.json  Topologie, Bindingprofile, Nodepolicy
config/workflows/                       versionierte Ablaufvorlagen
config/evals/                           Szenarien/Scorer/Datasetrefs
```

Eine Ownerdatei enthält benannte **vollständige** Profile, bei Plugins je Profil
die unterschiedlichen Registrationen und Instanzen. Keine Inline-Overrides im
Graph, ENV oder CLI. Instanz-ID und Profilref sind Auswahl, keine Settingskopie.
Shared Redis/Model/Servicebindings werden referenziert; individuelle Quoten bleiben
bei ihrem eigenen Consumer. Keine separate Storage-/Prompt-/Providerdatei pro
einzelner Zahl. Prompts und umfangreiche Toolregeln sind referenzierte Ressourcen
unter fachlicher Ownership, nicht konkurrierende Werte in zwei Dateien.

Der bestehende Swarm-Einstieg erhält bei tatsächlich nötigen Erweiterungen ein versioniertes Schema und trägt, benötigte Owner-/Profilrefs,
Workflowauswahl und Systemprofile. Konkrete Einstellungen enthält sie nicht.
Ein explizit ausgewähltes Systemprofil wählt vollständige Ownerprofile. Der Root
ist der physische veröffentlichte Generationroot; relative Referenzen dürfen ihn
nicht verlassen. Runtimepfade im Profil sind separate Operatorbindings, keine
Config-Includes. Referenzzyklen, fehlende Profile/Registrationen, unbekannte Keys,
doppelte Instanzen, falsche Schemas und widersprüchliche Grants scheitern vor
Publikation. Externe Extension-ID wird durch Manifest/API/Schema verifiziert;
die heutige six-owner Liste wird nicht zum universellen Pluginregister erweitert.

Nutzer ändern zuständige Ownerprofile/Prompts, validieren, sehen Diff und
Herkunft, materialisieren eine komplette Generation und aktivieren sie am
zulässigen Startpunkt. Geplante Befehle `config validate/explain/diff/materialize`
sind Zielbedienung, noch nicht implementiert. Explain nennt effektive Werte,
Authorfile/Profil/Feld, Aktivierungsklasse, Schema und Digest; Secrets nur als
Ref/Resolverrevision. CLI dient der Auswahl/Operation, nicht einem weiteren
`--timeout`-/`--model`-Overridekanal. Profil-Diffmaterialisierung kann später ein
Editorwerkzeug sein; kein rekursives Includesystem oder Runtime-Overlay nötig.

Generierte Charts/Images/Runtimebundle sind Outputs. Statt Helm `.Files.Get`
außerhalb des Chartroots zu erfinden: normaler Packaging-Schritt kopiert die
**validierten** Autorenbytes bzw. materialisierten Werte in Chartstaging,
prüft Digest/Dateimenge und verpackt. Builds benutzen dieselbe Liefergeneration.
Keine manuell gepflegte Kopie unter `charts/*/files/config`; etablierte Rollout-
Checksummen und root-owned Busterpublication behalten ihre Bedeutung.
Generierte Ausgabe darf niemals nachträglich editiert werden; einen neuen Stand
veröffentlichen. Aktive generation selection ist ein atomarer Zeiger auf eine
komplette unveränderliche Closure, kein laufendes Lesen einzelner editierter Dateien.

**Begriffe und vorhandene Eingänge:** Projekt-/Workflow-`pipeline.json` und
`--pipeline` bleiben vom Systemindex getrennt. **`pipeline.config.json`** ist
nach D21 der Zielname des bestehenden `swarm.config.json`-System-/Bundleeinstiegs.
Bestehende Komponentenreferenzen und geeignete Loader weiterverwenden; nur durch
C0 nachgewiesene Lücken ergänzen. Keine zusätzliche editierbare `system.json`.
Die genaue Nova-CLI-Anbindung und alle Datei-/Chart-/Docker-/Release-/Recovery-
Referenzen werden vor Migration inventarisiert und im genehmigten Schnitt
umgestellt. Keine Dateinamensheuristik und kein dauerhafter Altname-Fallback.
D20s ältere zentrale Namensvorgabe bleibt historisch erhalten; D21 ersetzt
nur diese Dateibenennung, nicht die fachlichen Eigentums-/Modulregeln.
Bestehende versionierte Graph-/Recoveryverträge bleiben geschützt.

## 4. Moduldefinition, Persistenz und Recovery

### Tatsächliche vorhandene Bindung

`engine-run.ts::runNewPipeline` friert die Definition ein, erstellt Runtime und
schreibt `run-snapshot.v4` vor Runner-/Adapterstart. `engine-snapshots.ts` bindet
Graphdigest, Pluginpackages, Runtimeconfig, runtimeDispatchProfile und
reviewCacheProfile. `verifyPinnedGraph`/`verifyPinnedPackages` vergleichen bei
Recovery exakt; nicht einfach entfernen, um Reload zu ermöglichen.
`StageExecutor` übergibt `definition.config`, erzeugt Attempt/Lease und schreibt
`attempt.created` vor Pluginexecute. Dieser Attemptrecord enthält Identität/
Owner/leaseId/Budgetverbrauch, **keinen eigenständigen dauerhaft gespeicherten Modulconfigstand**.
`PipelineLoop` startet Stages und führt Repairbudgetzustand; sie ist kein
Modulconfigresolver. `FileJournal` bietet hashverketteten, mutexgeschützten und
fsync-gesicherten Append. Diese Mechanismen sind Wiederverwendungsbasis.

### Vorgeschlagene eindeutige Einheiten

| Ausführung | Modulgrenze und Start | Zusammengehörige Fortsetzung |
|---|---|---|
| Nova Projektmodule | `project/compiler.ts` module.id: Implementation → Lint → Review → Test. Bindung **vor der ersten Implementation** (bzw. erster ausführbarer Stage) | Dieselbe module.id mit Reparaturschleife/Prüfungen/Guidance behält Stand; technical retry bleibt derselbe Start |
| Projekt Source/Architecture | zusammenhängende preflight/review/approval/blueprint-sync Phase, vor ihrer ersten Stage | Warten auf Zustimmung und Resume kein neuer Modulstart |
| Projekt Final | final lint/review/test/summary als eigene Integrationsphase; Demo candidate/delivery/ready als eigene Handoffphase | Zugehörige Repairs, Result-/Receiptreconciliation und Cleanup gebunden |
| Freier Nova Graph | explizite versionierte Moduleinheiten mit Stageliste; ein Single-Stage-Modul nur wenn keine übergreifende Fortsetzung existiert | Shared Remediationtarget/Moduleinheitenwechsel wird im Compiler/Graphvalidator abgewiesen oder eindeutig derselben Einheit zugeordnet; keine Heuristik nach Dateiname |
| Buster | angenommener Planjob inkl. Nodes/Providerconfig/Readiness/Fixtures; Config aus Elternmodul | Node-/Planrecovery und Fixturecleanup behalten Generation; weder pro Node noch pro HTTPcall Latest lesen |
| Prism standalone | angenommener fachlicher Auftrag/Idempotencykey mit Engine-/Prompt-/Inputbindung vor Workerdispatch | Worker Claim/Retry/Cancel/Artifactübernahme behalten diesen Auftrag; neue UUID allein keine neue fachliche Configbindung |
| Adapter/Observerdienste | Prozess-/Runinstanz, heute beim Run vorbereitet | Bleiben zunächst S/R. M nur für echte explizite Modulinstanz, nicht globalen Adapter während offener Effects reloaden |

Der Compiler muss diese Einheiten als Metadaten im versionierten abgeleiteten
Graph speichern. Die aktuelle `module.id` ist noch keine garantierte Runtime-
Moduleinheit. Der genaue Freigraph-/Repairvalidator ist Teil des späteren
Bindungspakets; bestehende beliebige Graphen dürfen nicht still umgruppiert werden.

### Neuer Vertrag vor Dispatch (Vorschlag, noch nicht vorhandenes Schema)

RunSnapshot speichert unveränderliche Struktur, Modulemembership, Repaireinheiten,
Grants/Providerfähigkeit, autorisierte Parameterobergrenzen, Storage/Issuer/
Effectgrundlagen, Code-/Packageidentitäten, Aktivierungsmodus und Startgeneration.
Der live-Modus erlaubt nur klassifizierte M-Werte; der fixed-Modus bindet alle
Einheiten an dieselbe komplette Generation. Ein Binding-Record enthält mindestens:

- runId + stabile moduleId/operationKey + Bindungsversion;
- generationDigest und komplette dauerhafte Configclosure/Objektrefs samt
  effektiven Owner-/Instanzprofilen; Promptbytes/Digests und tatsächliche
  Provider-/Modell-/Pluginidentität;
- Referenz auf unveränderten Runpolicy-/Graphstand, Inputidentität und ursprüngliche
  Claim-/Deadline-/Repairbudgetzuordnung; akzeptierter Startzeitpunkt.

Im bestehenden Runmutation-/Journalkontext: zunächst vorhandene Binding suchen.
Wenn vorhanden, strikt revalidierte gespeicherte Closure nutzen. Sonst einen
kompletten validierten Publishstand einmal auswählen, gegen R-Vertrag prüfen,
Configobjekte atomar dauerhaft publizieren, dann Binding fsync-gesichert append.
**Erst danach** stage.started/Attempt und Dispatch erlauben. Unique logical key,
kein „prüfen dann ungesicherter Schreibvorgang“. Crash vor Bindung erlaubt neue
Auswahl ohne Effect; Crash nach Bindung vor Dispatch benutzt denselben Record;
Crash nach Dispatch braucht bestehendes Effectreconciliation, keinen frischen Start.

Publikation und parallele Starts müssen linearisiert sein: jede Annahme benutzt
eine vollständig validierte A- oder B-Generation. Bereits gebundene Geschwister
bleiben A; späteres Modul kann B wählen. Ungültige B publiziert nicht; ein
beantragter Start mit explizit ungültiger B scheitert, kein stiller Rückfall auf A.
Eine bloß nicht publizierte Editordatei verändert den aktiven Zeiger nicht.
Configclosure darf keine volatile absolute Autorenpfadabhängigkeit für Recovery
haben; content-addressed Objekte müssen dauerhaft im Runstore erreichbar bleiben.

Budgets, Claims, retriesUsed/remediationCyclesUsed, cooldown/retryAt, ursprüngliche
Fristen und Idempotency-/Effectkeys werden aus dem bestehenden Zustand übernommen.
Die Configbindung besitzt **keine** neuen Zähler. Fachliche neue Arbeit braucht
neue explizite Identität/Autorisierung; Profiländerung erzeugt sie nicht automatisch.
Noch ungestartete Module dürfen keine erweiterten Grants, neue ABI/Providerfähigkeit
oder neue Graphstruktur importieren. Recovery prüft gespeicherte Run- und
Modulbindings getrennt; den heutigen ganzen Runtimevergleich ersetzt erst ein
versionierter, mindestens gleich strenger Struktur-/Modulvergleich.

### Secrets und Betriebsänderungen

Config enthält Resolver-ID, Secretname/Versionref und erlaubten Consumer; niemals
Wert, APIkey oder private Keybytes. Dienst-, TLS-, Storage- und Truständerung
verlangt kontrollierten S/R-Übergang, keine beliebige Live-Aktualisierung im Modul.
Für feste Runs/Module muss Resolverrevision dauerhaft identifizierbar sein.
Secretretirement kann Arbeit ausdrücklich blockieren; kein Ersatz mit aktueller
Version. Sofortige Credentialrevocation ist ein externer Zugriffsentzug und kann
auch alte Arbeit stoppen, keine nachträgliche Configumschreibung. Wo Resolver nur
unversionierte ENV/Filebytes liefert, ist dieser Vertrag erst zu ergänzen.
Keine Secretbytes in Snapshots, Explain oder Evalresultaten aufnehmen.

## 5. Umsetzungsschritte und erstes Paket zur Zustimmung

Die Reihenfolge CONFIG → Test-Refactoring → D18 Worker → zwölf Findings bleibt.
Keine Testkategorien aus der anderen Session erfinden. Bestehende Testpfade und
Consumerpflichtfälle jetzt nutzen; später mit freigegebenem Standard migrieren.

**Korrektur der Paketvollständigkeit:** Die erste Vorstellung von C1–C6 ließ
die noch offene semantische Feldinventur als eigenen vorgelagerten Arbeitsschritt
aus. Die Quellen-/Gruppenaufnahme ist nicht deren Abschluss. **C0 ist bereits
durch CLOUD-CONFIG-TASK.md beauftragte Untersuchung/Dokumentation und benötigt
keine zusätzliche Implementierungsfreigabe.** Vor einer abschließenden Vorlage
des Umsetzungspakets ist C0 zu vervollständigen und unabhängig zu prüfen.
Die vorhandene C1-Beschreibung ist ein konkreter Vorschlag, keine Erklärung,
dass der gesamte ursprüngliche Bestandsaufnahmeauftrag bereits erledigt sei.

Zwei unterschiedliche Nachweise dürfen nicht vermischt werden:

- **Vor Implementierung:** semantische Inventur/Definition. Jede Einstellung
  oder fachlich begründete Einstellungsgruppe hat tatsächliche Quelle,
  Consumerkette, heutigen Default/Priorität, Typ/Einheit/Validierung,
  Zielowner, Aktivierungs-/Recovery-/Retryregel, Profile-/Evaleignung und
  konkreten Migrations-/Abnahmefall. Nicht zu konfigurierende Konstanten,
  Auftragsdaten und Versions-/Secretgrenzen sind begründet klassifiziert.
  Schemafelder und Suchmarker allein schließen keinen Inventurpunkt.
- **Nach Implementierung:** F1-Abnahme prüft die Inventur gegen die tatsächlich
  integrierten Autoren und Consumer; F2–F6 prüfen unter anderem Autorität,
  Validierung, Wirkung, Drift und Budgets. Diese spätere Abnahme ist nicht
  schon vor Codeänderung erreichbar. Ihre Existenz rechtfertigt aber nicht,
  die heutige Inventur unvollständig in spätere Migration zu verschieben.

| Paket | Konkreter Schnitt / Zweck | Voraussetzung und Abschlussgrenze |
|---|---|---|
| **C0 – semantische Feldinventur und Zieldefinition** | Bereits beauftragte Quellen-/Gruppenaufnahme zu vollständiger Feld-/Consumer-/Autoritätsmatrix ausarbeiten. Die 57 Pluginconfigschemas einschließlich transitiver Referenzen, tatsächliche Defaults/Loader, ENV/CLI, Chart/Entrypoint/Go/Deployment, Agent-/Modell-/Prompt-/Toolpolicy- und Recoveryquellen fachlich zuordnen; gewöhnliche Konstanten und Auftragsdaten begründet abgrenzen | Aktuell offen. Kein Produktionscode. Alle Erhebungskandidaten besitzen eine geprüfte Zuordnung oder begründete Nicht-Settingklassifikation; keine pauschalen Platzhalter „Consumer noch zu prüfen“. Unabhängige Prüfung und konkrete verbleibende Entscheidungsfragen vor abschließender Paketfreigabevorlage |
| C1 | Autorenwurzel + systemisches Auswahlmanifest für **bestehende sechs Komponenten**, bestehende vollständige Buster-Profilvariante eingeschlossen; materialisierte Lieferung zu echten Prism/Buster/Workerconsumern | siehe unten; keine Nova CLI-/Graph-/Moduldynamik und keine Gesamt-CONFIG-Abnahme |
| C2 | Nova-Anbindung an den bestehenden Swarm-Einstieg, plugin-runtime/orchestrator Autoren; bisherige platform Maps als explizite Profilrefs; Graphcompiler Ausführungsprofile | ausgewähltes valides Nova Integrationsprofil bereitstellen; alle Loadercaller migrieren, ersetzte Quellen explizit migrieren/abweisen; Workfloweingang erhalten; reale Registry/Adapter/Observerwirkung |
| C3 | Buster Remote/Entrypoint-Codewerte, Prism Service/Engine/Attempt/Extensions, Deployment-/Integrationsbindings | Felddelta aus G11/G12/G27–G36 schließen; echte Providercomposition; kein D18-Jobrefactoring |
| C4 | vollständige Plugin-/Agent-/Prompt-/Policyprofile und defaultfreie Resolver, deklarative Toolressourcen | Schemas/$ref/Capabilityfelder konkret pro Plugin schließen; Ownerprofile an echte Consumer verdrahten; Stageinput von Settings trennen |
| C5 | versionierte Run-/Moduleinheiten und durable Bindung + fixed-Evalmodus; validieren/explain/diff/materialize bedienen | Abschnitt4 Crash-/Parallel-/Recovery-/Budgetfälle; keine fehlende historische Config aus Latest ergänzen |
| C6 | Gesamt-Autoren-/Delivery-/Feld-/Docprüfung und alternative Betreiberprofile | F1–F6/F-DOC/A1–A8; Livegates gesondert. Aus dieser Session keine Befundpromotion |

**C1 im Detail (Vorschlag für das erste kleine Umsetzungspaket nach C0):**

1. Vorhandenen `swarm.config.json`-System-/Bundleeinstieg weiterentwickeln
   und im genehmigten Schnitt in `pipeline.config.json` umbenennen;
   Autorenwurzel und nötige Schemaerweiterungen erst durch C0 begründen. Die
   vorgeschlagene Repo-Root-Lage lautet `config/pipeline.config.json`;
   alle vorhandenen sechs Komponenteneinstellungen unverändert übernehmen.
   Je Owner eine `config/{cores,engines,services}/*.config.json` mit benannten
   vollständigen Profilen; Buster `standard` und die heutige `runtime`-Variante
   in **derselben** Engineautor-Datei. Kein Runtime-Override-Merge.
2. Ein dünner Materializer auf vorhandenen AJV-/Komponentenvalidatoren erzeugt
   für ein ausgewähltes Profil die unveränderliche **bestehende**
   `swarm-entry.v2`-/`swarm-component.v1`-Liefergeneration. Die zentrale `config/pipeline.config.json` ist
   Autoren-Auswahl; ein separates veröffentlichtes Runtimebundle ist ausschließlich
   unveränderliche Ableitung und keine weitere editierbare Swarmquelle. Kein zweiter editierbarer Einstieg, keine heimliche neue
   Runtimepräzedenz. Noch nicht migrierte Nova-/Remote-/Deploymentsettings bleiben
   explizit G11–G39-Restumfang, nicht als vollständig zentral ausgegeben.
3. Chartpackaging/Prism Chartlieferung/Buster Docker COPY sowie vorhandene
   Buster-Profilauswahl auf diesen Produktionsmaterializer verdrahten. Charts
   dürfen nur das gewählte materialisierte Profil aufnehmen; `busterComponentFile`
   als bisherige Auswahl nicht als zusätzlicher Autorenpfad behalten. Bestehende
   Runtime `SWARM_CONFIG` bleibt **Transportlocator für generierte Ausgabe**,
   kein ENV-Settingoverride. Hash-/no-follow-/Freeze-/Rolloutschutz erhalten.
4. Bisherige sieben editierbare Komponentendateien einschließlich Buster-
   Profilkopie in der heutigen kubeclaw-Autorenstelle ablösen und die Prism-
   Symlinklieferung durch generierte Stagingausgabe ersetzen. Heute sind die
   Prism-Symlinks keine zweite editierbare Autorenquelle. Schema-/Loader-/Helm legacy rejection und operator-
   Doku fortschreiben. Kein neuer Pool-/Job-/Claimvertrag und kein Deployment.
5. Produktionslieferkette gemeinsam aktualisieren: `.dockerignore` und relevante
   `Dockerfile.*.dockerignore`, `scripts/updates/runtime-inputs.mjs`,
   `scripts/updates/release-configuration.mjs`, `scripts/check-built-runtime-image.sh`,
   `build-runtime-role-bundle.mjs`/Packagingmanifeste sowie aufrufende Build-/
   Promotion-/Reliabilityworkflows. Neue `config/`-Änderung muss als Image- oder
   Deploymentinput entsprechend tatsächlicher Nutzung erkannt werden; neue
   Materializerdatei muss im echten Buildcontext liegen. Bestehende Releaseguards
   nicht entfernen, sondern an den neuen Autoren-/Generationdigest anpassen.

Betroffen sind die bisherigen sieben Komponentenautoren unter
`charts/kubeclaw/files/config`, Foundation config Schemas/Validatoren und ein
Packaging-/Materialisierungseinstieg, `charts/{kubeclaw,prism}` ConfigMaps/
`_swarm-config.tpl`/Checksummen/Profilwahl, `docker/Dockerfile.buster-runtime`,
Build-/Packagingcaller und bestehende Configtests sowie Operator-Doku. Prism
Chartdateien sind heute Symlink-/Packaginglieferung, ihr tatsächlicher Zielpfad
muss im Cutover berücksichtigt werden. G02–G10-Consumer bleiben mit denselben
effektiven Werten auf der bestehenden Runtimeform.

C1-Abnahmefälle:

- **C1-A** Vollständige Standard- und Runtimeprofile haben exakt die bisher
  expliziten effektiven Werte/Einheiten, ohne Ergänzung aus Code/Schema/ENV/Helm.
  Zwei bewusst geänderte gültige Profile verändern echten Prismlistener-/Proxy-
  und Buster-/Worker-Ladeconsumer; keine bloße JSONvergleichsabnahme.
- **C1-B** Produktionsmaterialisierung → tatsächliches `helm package/template`
  beider Charts → extrahierte ConfigMap → normaler `readSwarmBundle` und echte
  Serviceconsumer. Buster Image-Lieferpfade an demselben Materializer; kein
  Dockerbuild nötig als Dokumentationsnachweis, realer Build separat im Paket.
- **C1-C** Fehlendes Profil/Owner/Datei/Setting, falsche Einheit/Typ, unbekannter
  Owner/Key, duplicate/escaping Ref, Schema-ID und nicht vollständige Generation
  werden vor Veröffentlichung abgewiesen. Fallbackmutant im echten Consumer
  und zweite Chartautorenkopie müssen passende Tests fehlschlagen lassen.
- **C1-D** Bestehende positive/negative Integer-/Connection-/Shutdown-/Budget-
  Grenzen und symlink-/generation mutation Tests bleiben wirksam. Publish A/B
  liefert nie gemischte Generation; startup snapshots bleiben unverändert.
- **C1-E** Canonical author → Staging → Chart/Image-Identität nachweisbar,
  reproduzierbare Generator-/Driftprüfung, keine manuellen Syncschritte.
  Reine Änderung unter `config/` verändert reale CI-Inputdigests, triggert die
  passende Lieferung und erreicht den erlaubten Buildcontext; alte konfigurierte
  Releaseidentität erkennt Abweichung. Originalrecords bleiben historisch prüfbar.
  Rolloutchecksummen reagieren auf jede Komponente. Alte Profil-/ENV-/Chart-
  Doppelautoren werden auch bei gleichen Werten abgewiesen.
- **C1-F** Doku zeigt Editieren/Profilwahl/Materialisierung/Aktivierung und
  verbleibende Nova-/Entrypoint-/Modul-/Evalgrenzen. Bestehende
  `verify:config:components`, Registercheck und betroffene Packaging-/Imagechecks
  am exakten integrierten Stand; unabhängiger Nichtautorenreview. Kein C1-PASS
  als globale CONFIG-/Liveabnahme.

## 6. Tatsächlich offene Entscheidungen und Empfehlungen

Keine erneute Abstimmung über D17–D20. Für die **neuen konkreten** Details:

1. **Autorenwurzel und erste Migration:** `config/` am Repo-Root und C1 oben.
   Vorteil: lokale Bedienung unabhängig von Chart; bestehende Loader/Consumer
   bleiben zunächst stabil, zentraler Einstieg ist tatsächlich Lieferautor.
2. **Dateinamen nach D21:** Workflow `pipeline.json`, zentraler Einstieg
   `pipeline.config.json` als Nachfolger des vorhandenen Swarm-Einstiegs. Keine
   zusätzliche `system.json`. Namensentscheidung ist geklärt; konkrete
   CLI-/Referenz-/Liefermigration weiter durch C0 bestimmen.

3. **Module bei C5:** Projektmodule einschließlich Lint/Review/Test/Repair binden,
   statt jede Stage frisch zu konfigurieren; standalone Prism Auftrag/Busterplan
   als Untereinheit. Freie Graphen brauchen explizite Modulmembership.
4. **Provider-/Secretversionen:** neue Grants/Providerfähigkeit bleiben R;
   unterstützte Modell-/Promptwerte M. Versionierte Secretrefbindung, Revocation
   kann blockieren. Konkretes Backend/aktive Installationsprofile vor C3/C5
   erheben, keine Infrastruktur erfinden.

Nach Abschluss von C0 wird das abgegrenzte **C1** zur ersten Implementierungszustimmung
vorgelegt. Die spätere
Modul-/CLI-/Secretmigration wird mit ihren exakten Consumerfällen vorgelegt;
aus einer C1-Zustimmung folgt dafür keine allgemeine Implementierungsfreigabe.

## 7. Evals, unabhängige Prüfung und Übergabe

Zentralisierung stellt ausgewählte reale Parameter und nachvollziehbare feste
Snapshots bereit. Zusätzlich erforderlich bleiben Harness/Isolationsschnittstellen
für reale Komponenten, Szenario-/Dataset-/Scorercontracts, Mess-/Kostenaufnahme,
Umgebungsbindung und reproduzierbarer Runaufruf. Config-Varianten dürfen
Pflichtgates/Grants nicht selbst erweitern. Nicht unterstützte Modellparameter
ablehnen; Eval mit unbekannter Modellversion kennzeichnet diese Grenze.
Kein neuer universeller Evalrunner oder bezahlter Lauf gehört zu C1.

Die frische unabhängige Prüfung steht im
[Cloud-Review](independent-cloud-config-assessment-20261012.md).
Sie prüft diese Vorlage gegen reale Quellen und Originalkriterien; notwendige
Korrekturen werden vor Vorlage an den Auftraggeber eingearbeitet. Historischer
Review vom frühen 12. Oktober bleibt unverändert erhalten.

Fortsetzen: zuerst diesen Bericht, Index, Review und Prüfprotokoll lesen; C0
vervollständigen und unabhängig prüfen. Anschließend Zustimmung zum abgegrenzten
C1 abwarten. Keine Produktionsimplementierung,
Statuspromotion, Testreorganisation, D18-Ausführung oder Hostaktion aus diesem
Dokumentationsauftrag ableiten.
