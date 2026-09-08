# T14 — Operatorpreview, Zugangsdaten, Rückmeldung und Bereinigung

## Prüfstand und Ergebnis

Codecommit **`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`**, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle Codezeilen unten beziehen sich auf diesen Stand. Nur statische Prüfung; keine Clusteraktionen, Builds, CI, Provider- oder E2E-Tests ausgeführt. Vorhandene Komponentenreviews aus `a9e080ab1e1981ec5713e9b742f94280835fd347` sowie Infrastrukturreviews aus `eac591fb060458ebb6c6ba34599309e8c424bd08` wurden als Vorarbeit gelesen, historische Tests nicht als eigene Ergebnisse gezählt.

Szenario: Die gesamte integrierte Anwendung liegt in einem bestimmten Commit vor. Ein finaler Plan baut das Image, provisioniert Testnamespace/Service, stellt einen Tailscaleendpoint bereit und soll Namespace **und erreichbaren Zugang** für den Operator erhalten. Der Operator soll URL und nötige Appzugangsdaten erhalten, ohne manuelle Clusterarbeit testen, Feedback/Abnahme geben und später aufräumen lassen. Varianten: Namespace retain/delete, Port80/8080, abgelaufene Lease, fehlende Rechte, Fehler nach externem Apply, Credentials vorhanden/nicht verlangt und erneuerte Exposuregeneration.

**Ergebnis: kein durchgängiger Operator-Testzugang implementiert.** Im Projectmodus fehlt ein automatisch erzeugter Finalpreview-/Übergabeabschluss. Bei einem ausdrücklich verdrahteten Busterplan kann eine Anwendung deployed und exponiert werden, aber **der Runner räumt auch eine erfolgreiche Tailscalefixture vor der Planrückgabe auf**. Namespace-retain bewahrt den Namespace bis TTL, nicht den Ingress. Außerdem liefern vorhandene Previewbenachrichtigung und Projectsummary keinen vollständigen URL-/Appcredential-Handoff; die Credentials-Secretanlage erzwingt keine Appauthentifizierung. Nach den Bruchstellen werden Folgeschritte nur konditional untersucht.

## Unterstützte und fehlende Teile

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

## Übergangsfolge

### 1. Finaler integrierter Stand und explizite Planverdrahtung

`skills/nova/project/compiler.ts#compileProject:103–136` erzeugt pro Modul implement→lint→review→test und kehrt zurück. Keine separate Finalpreview-, Projectsummary-, Operator-Test- oder Abnahmestage wird angehängt. **Erste Bruchstelle im normalen Projectzielablauf** ist dieser fehlende Abschlussgraph. Ein Testproviderplan kann zwar Fixtureknoten enthalten, aber der Compiler erzwingt nicht, dass nach allen Modulen genau der kumulativ freigegebene Stand für einen Operator erhalten bleibt.

Konditionale Fortsetzung: Ein ausdrücklich ausgewählter Plan baut/exponiert den finalen integrierten Source-Stand. Die Herkunft des Buildworkspace wird im zugehörigen Source-/Buildtrace geprüft; hier wird die gültige finale Source-Candidate-Eingabe vorausgesetzt und anschließend Image→Manifest→Service→URL verfolgt. Der vorhandene Scaffold hat konkrete Verwendungsbelege: `skills/nova/project_setup/tools/progress-scaffold-discovery.ts#exposureNodes:336–363` erzeugt optional `kubeclaw.tailscale-exposure@1`, abhängig vom Deployment, und HTTPhealth-/Smoketests, die dessen `exposure`-Output konsumieren. Das sind Tests während des Plans, keine persistente Operatorhandoff-Stufe.

### 2. Containerbuild → verifizierter Imageoutput

`skills/buster/plugins/container-build/src/provider.js#provider.execute:96–141` sendet `container.build/build_push_verify` mit Buildcontext, Dockerfile, Definitionidentity, Plattform, Buildargs und Zeit-/Loglimits; Resource-ID enthält Providerattempt. Parent `skills/buster/engine/test-gates/container-build-runtime.ts#invoke:189–218` erzeugt attemptbezogenes Registrytag, startet Build/push, liest Digest aus Metadata und ruft Registryverifikation auf. `#verify:132–161` vergleicht Manifestbyteshash und optionalen Docker-Content-Digest. Provideroutput `kubeclaw.container-image@1` enthält immutable reference/digest/platform/definitionIdentity. Ein erfolgreicher Digestbuild allein ist noch kein laufender Service.

### 3. Image und checked-manifest → Kubernetesfixtureauftrag

`skills/buster/plugins/kubernetes-fixture/src/provider.js#configuration:17–63` verlangt Image entweder als Valueinput oder Config, nicht beides, und validiert matching reference@sha256/digest. ServiceName/Port, Namespaceprefix, Retention und optionale Secretrefs werden geprüft. Default ist **retention.mode=delete, seconds=1800**, zulässige Spanne 60–604800s (40–44).

`manifestInput:66–77` verlangt genau ein Artefakt `checked-manifest` mit MediaType `application/vnd.kubeclaw.checked-kubernetes-yaml`, Digest/Bytes und lokalem File-URL. `identity:80–83` hasht runId, nodeId und attemptId zum Lease-/Namespacenamen. `capabilityRequest:86–97` sendet `kubernetes.fixture/prepare`, Image-/Manifestdigest, tatsächlichen Pfad, Service, Retention, Secretrefs und optional testCredentials. Die fachliche Zuordnung ist also Run/Node/Attempt-basiert; das Namespaceprefix allein ist keine vollständige Identität.

Die Produktionsverdrahtung ist konkret: `skills/buster/engine/test-gates/remote-plan-service.ts:624–632,669–670` erstellt KubernetesFixtureCapabilityInvoker/TailscaleExposureCapabilityInvoker nur bei erlaubten Capabilities und routet deren Namen zu diesen Instanzen. Provider-Ausführung und Parentkubectl sind getrennte Grenzen.

### 4. Parentruntime → Lease-CRD → Controller → Anwendung

`kubernetes-fixture-runtime.ts#prepare:647–710` prüft Prefix, erlaubtes immutable Image, Image-/Manifestdigest, Manifestpfad und -bytes sowie Ressourcen-/Service-/Storagepolitik. `testCredentials` akzeptiert in dieser Route nur generate; Readers werden aus erlaubtem Credentialreader und Runner-ServiceAccount zusammengesetzt (691–701). Der Parent erzeugt `BusterNamespaceLease` mit purpose gate, exposure off, ttlSeconds, cleanupPolicy, Service, verifiedImage, manifestDigest und Deployerzugang (703–710). `spec.runId` trägt hier den LeaseName, während die ursprüngliche Provideridentität im deterministischen Namen steckt; nicht als identisches ursprüngliches Nova-runId-Feld ausgeben.

`#prepare:713–740` führt can-i create/get/delete, serverseitigen Dryrun und Leaseapply aus, wartet Lease-Ready, wendet **die geprüften Manifestbytes** im Zielnamespace an und wartet Pods plus Service-/Endpointbereitschaft. Interner Output ist `http://<service>.<namespace>.svc.cluster.local:<port>`, Zeiten, Releaseaction, Manifest-/Imagedaten und optional credentialsRef. Weder Cluster-DNS noch Kubernetes-SA ermöglichen dem menschlichen Browser allein Zugang.

Controller `cmd/buster-namespace-controller/main.go#reconcileLease:238–305` prüft Finalizer/Namespace/TTL/Specimmobilität; `ensureNamespace:755–774` und `verifyNamespaceLabels:787–794` binden Namespace an verwaltenden Controller, LeaseName und LeaseUID. `ensureNamespaceNetworkPolicy:797–835` stellt Namespaceverkehr/DNS sowie Zugang für Nova/Buster und Tailnetproxy-Pods her. Der Tailscale-Pfad verlangt aktuell Namespace `tailscale` und Labels `tailscale.com/managed=true`, `tailscale.com/parent-resource-ns=<target>` (813–815). Ein anders installierter Operator ist daher eine zu prüfende Netzwerkkonfigurationsvoraussetzung, kein automatisch funktionierender Zugriff.

### 5. Optionale Testcredentials — welche Autorität sie tatsächlich geben

`main.go#ensureTestCredentials:1165–1225` legt ein dediziertes Secret an. Generate erzeugt zufällige Passwortbytes; Secret enthält username/password, der Status nur credentialsRef/credentialsAvailable. `ensureCredentialAccess:1263–1283` gibt den deklarierten Kubernetes-ServiceAccounts ausschließlich get auf den benannten Secret. Das ist **Secretleserecht für Agenten**, kein menschlicher Appaccount und kein Kubernetes-Clusterzugang für den Operator.

Der Controller kann außerhalb dieses Providerpfads außerdem existing-Credentials mit gezieltem Writer/Readervertrag verarbeiten (`credentialRequest:1089–1162`), die Fixturekonfiguration bietet hier jedoch nur generate an. Es wurde weder Secret gelesen noch ein Passwort in diesen Bericht übernommen.

Die Manifestbytes werden unverändert angewandt (`kubernetes-fixture-runtime.ts:723–725`). Diese Funktionen konfigurieren keine beliebige Anwendung automatisch auf das generierte Login und verifizieren keinen Login damit. Appcode/Deployment muss dieselben Secretkeys ausdrücklich nutzen und einen echten Authpfad anbieten. `previewIngress:1481–1514` enthält TLS-/Servicerouting, keine Basic-Auth-/Credentialmiddleware. **CredentialsAvailable ist daher kein Nachweis einer funktionierenden Appauthentifizierung.** Auch ein Secret ohne konsumierende App kann existieren.

### 6. Deploymentfixture → Tailscaleprovider → Ingressstatus → Public-Endpoint-Value

`tailscale-exposure/src/provider.js#deploymentInput:26–53` erwartet genau deployment mit Schema `kubeclaw.kubernetes-deployment-fixture@1`, Service-DNS, Port, Lease/Namespace und ExpiresAt. **PCR-TAILSCALE-001** blockiert Serviceport80 durch URL.port-Normalisierung; für den folgenden Pfad wird deshalb Port8080 vorausgesetzt. `provider.execute:63–83` sendet `kubernetes.exposure/prepare` und erzeugt anschließend `public-endpoint-fixture.v1` mit HTTPSurl/hostname/namespace/leaseName/createdAt/expiresAt/releaseAction.

Parent `tailscale-exposure-runtime.ts#prepare:190–225` prüft Lease/Namespace-/Service-/Port-/Expirybindung, RBAC get/patch und patcht purpose final-preview, exposure tailscale-ingress sowie zufällige Ownerannotation. `#verifyLease:155–166` verlangt Ready und zukünftige identische Expiry. Controller `ensurePreviewExposure:1348–1405` prüft Backendbereitschaft, erstellt `Ingress buster-final-preview`, liest Ingressstatus und schreibt exposurePhase/previewUrl/hostname. `previewIngress:1481–1514` verwendet ingressClassName tailscale und TLS-Hostname; `ingressPreviewURL:1517–1531` baut HTTPSurl aus LoadBalancerstatus.

Parent prüft HTTPS, keine URLcredentials, zulässiges Hostsufffix, Statushostname, Namespace und Expiry (202–225). Dieser technische Statusbeleg ist kein Test vom erlaubten menschlichen Tailnetclient und kein Loginbeweis. Die vom Scaffold generierten HTTPtests (336–363) laufen während der Fixturelebenszeit; auch deren Erfolg beweist nicht die spätere Operatorerreichbarkeit.

### 7. Erste konkrete Bruchstelle des konditionalen finalen Previewpfads: Planabschluss räumt Exposure auf

`tailscale-exposure/plugin.json:8–20` registriert einen Fixtureprovider. `runner.ts:1292–1293` behält erfolgreiche Fixtures zunächst für die übrigen Planknoten; completed fixtures kommen in die retainedFixtures-Liste (886–892). **retainedFixture bedeutet hier nur „bis zum Planende behalten“.**

`skills/buster/engine/test-gates/runner.ts#run:897–899` ruft im finally immer `#cleanupFixtures` auf. `#cleanupFixtures:2005–2018` geht rückwärts über retainedFixtures; `#cleanupProvider:1968–2002` ruft den Originalprovidercleanup mit eigener begrenzter Zeit und Fehleraufzeichnung auf. Tailscaleprovider `cleanup:85–90` sendet immer release. Parent `#release:231–241` setzt purpose gate/exposure off und wartet Off; Controller `ensurePreviewExposure:1353–1362` löscht darauf den Ingress und leert previewUrl.

Kubernetesprovider `cleanup:132–139` überspringt Release nur bei retention.mode=retain. Somit bleibt im besten Retainfall zwar der Namespace bestehen, **aber sein Tailscalezugang wird bereits vor Rückgabe des Planergebnisses entfernt**. Bei delete verschwindet außerdem die Namespacelease. Ein erfolgreicher Exposureoutput bzw. dessen gespeicherte URL kann nach Abschluss also eine nicht mehr aktive Exposure beschreiben. Dies ist kein nur hypothetischer fehlender Betriebsschritt, sondern die statisch durchgehende normale Cleanupkette (F-T14-01).

Wenn Cleanup scheitert, kann die Exposure noch existieren, aber das ist kein legitimierter Retainmechanismus: Runner zeichnet Cleanupfehler auf und setzt betroffene Nodes auf errored (900–934). Bei SIGKILL kann der finally-Pfad fehlen; Controller-TTL ist dann die verbleibende Aufräuminstanz.

### 8. Konditional erhaltene Exposure → Operatorbenachrichtigung

Unter zusätzlicher Voraussetzung eines später implementierten persistenten Previewhand-offs wäre die URL zuzustellen. Aktuelle `project-summary/src/summary.ts#buildSummary:46–68` prüft Source-/Lint-/Review-/Testberichte und schreibt delivery-manifest mit projectId/runId/sourceRevision/modules/final/evidence. Sie liest **keinen Deployment-/Exposurevalue**, enthält keinen eigenen Preview-/Credentialvertrag und publiziert nichts: `project-summary/src/stage.ts:3–10` schreibt nur Artefakt. Außerdem erzeugt der Projectcompiler diese Stage nicht (compiler.ts 103–136). Die gegenteilige Aussage im vorhandenen Komponentenreview unter Verantwortung ist am Code widerlegt und wird hier nicht übernommen.

`skills/common/plugins/notification-observer/plugin.json:42–60` hat einen optionalen best-effort Previewobserver auf artifact.created. `observer.ts#previewNotification:139–160` projiziert lediglich artifactId/digest/mediaType/logicalName, ohne Artefaktinhalt zu lesen, ohne URL und ohne Credentials. `deliverPreview:191–193` sendet diese Metadaten via operator.request. `lifecycleNotification:111–137` erzeugt generische Run-/Stagenachrichten; `run.succeeded` enthält dadurch nicht automatisch einen Appzugang. Zusätzlich bleibt bestehender **PCR-NOTIFY-001**: die eigene Operatorpayloadgrenze lehnt vom Observer erzeugte Formen ab; kein zuverlässig zugestellter Previewdialog behauptet.

`operator-messaging/src/adapter.ts#deliver:65–131` persistiert Request/Receipt und sendet an konfiguriertes Ziel. Discordformatter (12–25) rendert Summary/Fields, ist aber kein Secretleser und kein automatisch vertraulicher Credentialkanal. Das sichere Verhalten dieser Kette ist derzeit, **keine Secretbytes in Previewartefakten/Status mitzuliefern**; daraus folgt nicht, dass notwendige Appcredentials den Operator erreichen. Ein gezielter authentifizierter Secretabruf und personengebundene sichere Zustellung fehlen im nachvollzogenen Handoff (F-T14-02).

### 9. Operator testet → Feedback/Abnahme → weitere Änderungen

Nur falls Exposure erhalten, Tailnetclient berechtigt, CNI/Proxybackend erreichbar, Appauth tatsächlich verdrahtet und Zugangsdaten sicher übergeben sind, kann der Operator ohne Clusterarbeit testen. Keiner dieser externen Zustände wurde hier gemessen. Die vorhandene generische human-approval-Stage kann in einen zusätzlichen Graph eingebunden werden, aber ihr `{summary}`-/approved/rejected-Vertrag (`human-approval/src/stage.ts:17–54`, `approval.ts:94–118,135–157`) bindet nicht automatisch Previewlease, Exposedimage oder Feedback an einen Appcommit. Der Projectcompiler hat keine solche abschließende Interaktion.

Weitere Änderungen benötigen somit eine explizite Nova-/Operatorentscheidung und neue Implementierungs-/Gateausführung; ein Chatfeedback allein ist kein technisch erzwungenes Invalidieren einer alten Appabnahme. Nach terminalem Run kann normales Resume keine neue Arbeit hinzufügen (`core/execution/engine-run.ts:40–44,76–88`; gepinnter Graphdigest in engine-snapshots.ts 67–71). Ein neuer Run oder vorgängig deklarierter Feedback-/Repairgraph wäre erforderlich. Hier wird keine automatische Abnahme- oder Feedbackloop erfunden.

Clawdeck ist teilweise vorbereitet: `skills/common/plugin-runtime/foundation/observability/clawdeck-view.ts#buildClawDeckObservationView:39–110` liefert kanonische Records, Workerattempts/Evidence, Cursor und Completeness. Das ist eine Beobachtungsprojektion, kein nachgewiesener UI-Login-, Previewcredential- oder Feedbackcontroller. Der spätere Operatorclient bleibt als solcher offen.

### 10. Spätere Bereinigung und TTL

Kubernetesfixture-Runtime `#release:747–750` löscht die Lease und wartet; Controller `reconcileLease:242–250` führt Finalizercleanup durch. `deleteOwnedNamespace:1575–1599` prüft Prefix/Controller/LeaseName/LeaseUID vor Namespace- und Egresspolicyentfernung. Das schützt gegen Löschen fremder Namespaceinstanzen, macht aber keine Appabnahmebedingung.

`main.go#expiresAt:1706–1718` berechnet Deadline aus Lease-CreationTimestamp und begrenzter TTL. `expireLease:307–324` markiert Expired und löscht den broker-owned Namespace **unabhängig von cleanupPolicy=retain**. Deshalb ist retain kein unbegrenztes Aufbewahren. Der gewünschte Operatorzeitraum muss innerhalb der verbleibenden TTL liegen; von langem Build/Test bereits verbrauchte Zeit wird nicht automatisch nach Übergabe neu gestartet. Controller-Ausfall oder Tokenprobleme verzögern Cleanup (PCR-BUSTER-NS-001, INF-18 Betriebsgrenze).

## Daten-/Statusentwicklung

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

## Neue Befunde

### F-T14-01 — Finalpreview-Exposure wird vor Operatorübergabe entfernt

**Hoch; statisch bestätigter komponentenübergreifender Lifecycledefekt gegenüber dem gewünschten Operatorabschluss.** Trigger: erfolgreicher Plan mit Kubernetesfixture retention=retain und Tailscale-Exposurefixture. Runner finally räumt Fixture auf (runner.ts 897–899,2005–2018), Exposurecleanup ist unbedingt (provider.js 85–90), Runtime schaltet off (231–241), Controller löscht Ingress (1353–1362). Folge: Namespace erhalten, URL nach Abschluss nicht erhalten. Rootfix: bewusster, persistierter Ownership-/Lifecycletransfer einer finalen Preview einschließlich Exposure, Namespace, TTL, Source-/Imagedigest und Cleanupbefugnis; normale Testfixtures weiterhin am Planende aufräumen. Kein pauschales Entfernen des Cleanup-finally. Regression: echter End-to-end-Fixtureplan, danach erlaubter Tailnetbrowser erreicht Anwendung für festgelegten Operatorzeitraum; explizites Release/TTL entfernt exakt diese Generation. Keine Ausführung hier.

### F-T14-02 — Vollständiger Operatorzugang und Appauth-Handoff fehlen

**Hoch für das Abschlussziel; statisch bestätigte Integrationslücke, keine behauptete Credentialoffenlegung.** Trigger: Pipeline verlangt Login und „ohne manuelle Clusterarbeit testen“. Controller erstellt nur dediziertes Secret (main.go 1165–1225); Manifest-/Ingresspfad bindet die App nicht automatisch daran; Summary konsumiert keine Exposure (summary.ts 46–68); Previewobserver sendet nur Artefaktmetadaten (observer.ts 139–160). Folge: weder funktionierender Login noch URL-/Credentialempfang/Abnahme sind durch den Runabschluss garantiert. Rootfix: verpflichtender Previewdeliveryvertrag mit Source/Image/Lease/Generation/URL/Authmodus/Expiry, Appseitiger Secretintegration und überprüftem Login; Credentials als gezielt abrufbare geschützte Referenz und autorisierte sichere Zustellung, nicht als unredigiertes allgemeines Runartefakt. Operatorfeedback an dieselbe Generation und Sourcebindung koppeln. Regression: Anwendung mit tatsächlicher Auth, erlaubter Operator kann lesen/login/Feedback geben, anderer Tailnetnutzer und alte Previewgeneration werden abgewiesen; Nachricht enthält nötige URL ohne öffentliche Secretbytes. Keine Tests hier.

## Vorhandene Befunde / Infrastrukturbezug

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

## Durchgeführte Prüfung, Annahmen und offene Runtimebeweise

Durchgeführt: statische Provider→Parent→Controller→Output→Runnercleanup→Summary-/Obserververfolgung, Lesen der genannten Komponenten-/Infrareviews, punktuelle Gegenprüfung der Sourcezeilen. Keine Secrets gelesen, keine Credentials extrahiert, kein kubectl/build/CI/Test ausgeführt.

Inspektierte Originaltests **nicht ausgeführt**: `cmd/buster-namespace-controller/main_test.go:268–325` (dedizierte Credentials/Reader), 438–451 (Exposure ohne Credentialpolicy), 513–537 (TTL mit httptest-Server), 622–653 (URL-/Ingresskonstruktion). Diese Tests sind reine Vertrags-/synthetische APIprüfungen und belegen keinen echten Tailscaleclient, keine Appauth und kein dauerhaftes Preview nach Planabschluss. Historische Provider-Livefunctiontests des Komponentenreviews sind ebenfalls kein Clusterbeweis.

Offen: realer Build-/Registry-/Manifest-/Namespace-/Tailscale-Gesamtpfad am finalen Sourcecommit; echte erlaubte/unerlaubte Tailnetclients; Backendnetworkpolicy und OAuth/TLS/DNS; echte App-Credentialkonsumierung/Login; sichere Operatorzustellung; Feedback-/Acceptancegeneration; Owner-/Statusrace; Crash zwischen Leaseapply und Result, zwischen Exposure-PATCH und Status und vor Cleanup; Controllerneustart/Tokenrotation; TTL-/Finalizer-/PVC-Bereinigung. Ein retained Namespace kann bei Controllerausfall länger bestehen; ein abgeschalteter Link kann bei Cleanupfehler weiter erreichbar bleiben — beides verlangt Statusreconciliation statt Erfolg aus alten Artefakten.

Spätere Reihenfolge: finalen Previewownership-/Retentionvertrag implementieren (F-T14-01), URL/Auth/Operatorhandoff mit Source-/Generationbindung schließen (F-T14-02), bestehende Port-/Generations-/Recovery-/Infrafehler beheben, danach realen Operatorzugang und reale Bereinigung messen.
