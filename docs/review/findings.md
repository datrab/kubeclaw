# Zentrales Befundregister

97 stabile Befundkennungen im aktuellen Prüfstand. Alle bleiben offen;
dieser Auftrag verändert keine Implementierung. Schweregrad, Begründung,
Evidenzklasse, Auslöser, konkrete Folgen, Ursachenbehebung und Regression stehen
im verlinkten Eigentümerbericht. Querverweise erzeugen keine weiteren Befunde.
Ein nachgewiesener Codepfad ist kein bestandener Laufzeittest.

| Kennung | Befund | Zuständiger Bericht |
|---|---|---|
| PCR-AGENT-CONTRACT-001 | Tiefe gültige JSON-Nutzlast überläuft Validatorstack | [contract.agent-events](components/contract.agent-events.md) |
| PCR-AGENTSOURCE-001 | Unbegrenzte Ingressqueue und nicht abbrechbarer Drain | [kubeclaw.openclaw-agent-events](components/kubeclaw.openclaw-agent-events.md) |
| PCR-APIFLOW-001 | hoch: Blockingflow ohne einen Request besteht | [kubeclaw.api-flow](components/kubeclaw.api-flow.md) |
| PCR-APPROVAL-001 | Schema akzeptiert unerlaubte Runtimekonfiguration | [kubeclaw.human-approval](components/kubeclaw.human-approval.md) |
| PCR-BUSTER-ENGINE-001 | Capabilityarbeit fehlt im Attemptbudget | [buster.engine](components/buster.engine.md) |
| PCR-BUSTER-ENGINE-002 | Reportadapterstdin-EPIPE beendet Hostprozess | [buster.engine](components/buster.engine.md) |
| PCR-BUSTER-ENGINE-003 | Capabilityantwort nach Providerende kann unbehandelt rejecten | [buster.engine](components/buster.engine.md) |
| PCR-BUSTER-ENGINE-004 | Terminale Jobs behalten vollständige Quellen und Arbeitsverzeichnisse | [buster.engine](components/buster.engine.md) |
| PCR-BUSTER-NS-001 | Kubernetes-Token wird nicht erneut gelesen | [buster.namespace-controller](components/buster.namespace-controller.md) |
| PCR-BUSTER-NS-002 | Ownership liest ungekürzte Leaseidentität | [buster.namespace-controller](components/buster.namespace-controller.md) |
| PCR-BUSTER-NS-003 | Eigene konfigurierte RBAC wird als Angriff bewertet | [buster.namespace-controller](components/buster.namespace-controller.md) |
| PCR-COMMAND-001 | Beendeter Gruppenführer verhindert Termination offener Kindpipes | [kubeclaw.command-runner](components/kubeclaw.command-runner.md) |
| PCR-CONTAINER-BUILD-001 | Fachlicher Buildfehler wird durch erforderliches Imageoutput zum Ausführungsfehler | [kubeclaw.container-build](components/kubeclaw.container-build.md) |
| PCR-CONTAINER-BUILD-002 | Eigenes Zeitlimit endet vor Registryverify | [kubeclaw.container-build](components/kubeclaw.container-build.md) |
| PCR-CONTRACT-PLUGIN-001 | Leeres Plugin passiert die Manifestvalidierung | [contract.plugin-system](components/contract.plugin-system.md) |
| PCR-DELIVERY-001 | Gültige JSON-COPYform wird falsch zurückgewiesen | [kubeclaw.delivery-lint](components/kubeclaw.delivery-lint.md) |
| PCR-DIRECT-COMMAND-001 | Deklarierbarer Mediatyp passt nur auf erste Ausgabe | [kubeclaw.direct-command](components/kubeclaw.direct-command.md) |
| PCR-EFFECT-001 | Konflikt nach Lockakquise lässt Ressourcenlock zurück | [nova.effects](components/nova.effects.md) |
| PCR-EXEC-001 | Rekonstruierter Wait kann nicht per Signal fortgesetzt werden | [nova.execution](components/nova.execution.md) |
| PCR-EXEC-002 | Resultartefakt verschwindet aus der Recoveryprojektion | [nova.execution](components/nova.execution.md) |
| PCR-GIT-001 | sync_paths meldet Ausführungsfehler als fehlende Dateien | [kubeclaw.git-workspace](components/kubeclaw.git-workspace.md) |
| PCR-HOSTOBSERVER-001 | Dedupe löscht verschiedene LLM-Ausgaben desselben Runs | [kubeclaw-agent-observer](components/kubeclaw-agent-observer.md) |
| PCR-HOSTOBSERVER-002 | Arrayzyklen umgehen die Normalisierer-Zyklusabwehr | [kubeclaw-agent-observer](components/kubeclaw-agent-observer.md) |
| PCR-HTTP-001 | mittel: Schema-Default verwirft öffentlichen Endpointpfad | [kubeclaw.http](components/kubeclaw.http.md) |
| PCR-IMPLEMENTATION-001 | Erzeugter Worktree erreicht Forge nicht | [kubeclaw.implementation-agent](components/kubeclaw.implementation-agent.md) |
| PCR-ISOLATION-001 | Pipefehler beendet den Hostprozess | [foundation.isolation](components/foundation.isolation.md) |
| PCR-ISOLATION-002 | SIGKILL trifft Supervisor statt Prozessbaum | [foundation.isolation](components/foundation.isolation.md) |
| PCR-ISOLATION-003 | UTF-8 wird an Streamchunkgrenzen beschädigt | [foundation.isolation](components/foundation.isolation.md) |
| PCR-ISOLATION-004 | Lease-Memorywert ist kein erzwungenes Speichermaximum | [foundation.isolation](components/foundation.isolation.md) |
| PCR-JUNIT-001 | niedrig: Fehlender Attributtrenner wird akzeptiert | [kubeclaw.junit-report](components/kubeclaw.junit-report.md) |
| PCR-KUBERNETES-FIXTURE-001 | Ressourcenlimit erst nach Aliasexpansion | [kubeclaw.kubernetes-fixture](components/kubeclaw.kubernetes-fixture.md) |
| PCR-KUBERNETES-FIXTURE-002 | Schreibpipe kann den Busterprozess beenden | [kubeclaw.kubernetes-fixture](components/kubeclaw.kubernetes-fixture.md) |
| PCR-LINT-001 | hoch: generische Targets verlassen die freigegebene Repositorygrenze | [kubeclaw.lint](components/kubeclaw.lint.md) |
| PCR-LINT-002 | hoch: laufender Lintversuch besitzt keinen wirksamen Abbruch-Lifecycle | [kubeclaw.lint](components/kubeclaw.lint.md) |
| PCR-LINT-003 | mittel: echte native Timeouts werden als Startfehler klassifiziert | [kubeclaw.lint](components/kubeclaw.lint.md) |
| PCR-NETWORK-001 | Responsebudget greift erst nach vollständigem Download | [kubeclaw.network-http](components/kubeclaw.network-http.md) |
| PCR-NETWORK-002 | Bodytimeout verliert stabile Adapterfehlerdisposition | [kubeclaw.network-http](components/kubeclaw.network-http.md) |
| PCR-NOTIFY-001 | Projektion erzeugt vom eigenen Provider abgelehnte Nachrichten | [kubeclaw.notification-observer](components/kubeclaw.notification-observer.md) |
| PCR-NOVA-GATE-001 | Timeout nach verlorenem Submit lässt Job laufen | [nova.test-gates](components/nova.test-gates.md) |
| PCR-NOVA-GATE-002 | Gate-Zeitlimit endet vor Ergebnisimport | [nova.test-gates](components/nova.test-gates.md) |
| PCR-NOVA-GATE-003 | IPv6loopback im SPIFFE-Modus fälschlich abgelehnt | [nova.test-gates](components/nova.test-gates.md) |
| PCR-NOVA-GATE-004 | Storegesamtquote als Einzelbloblimit übergeben | [nova.test-gates](components/nova.test-gates.md) |
| PCR-NOVA-GATE-005 | Prozessrestarttest erwartet entfernte Graphdatei | [nova.test-gates](components/nova.test-gates.md) |
| PCR-OBS-001 | Persistierte Admission-/Attemptzustände umgehen Replayvalidierung | [foundation.observability](components/foundation.observability.md) |
| PCR-OBS-002 | Aufbewahrungsstrategie für bestätigte Historie fehlt | [foundation.observability](components/foundation.observability.md) |
| PCR-OPENAPI-001 | hoch: Verbietendes Array-Itemschema wird ignoriert | [kubeclaw.openapi](components/kubeclaw.openapi.md) |
| PCR-OPENAPI-002 | mittel: Operatorfehler werden fachliches Testergebnis | [kubeclaw.openapi](components/kubeclaw.openapi.md) |
| PCR-OPERATOR-001 | Transienter Sendefehler verbraucht Observer-Retries ohne neuen Send | [kubeclaw.operator-messaging](components/kubeclaw.operator-messaging.md) |
| PCR-PACKAGES-001 | Report-Adapter umgehen Installations-Syntaxprüfung | [foundation.packages](components/foundation.packages.md) |
| PCR-PREFLIGHT-001 | Dateinennung wird als Lieferdeklaration akzeptiert | [kubeclaw.preflight-contract](components/kubeclaw.preflight-contract.md) |
| PCR-PREPORT-001 | Calleridentität statt aktiver Run-/Attemptbindung | [kubeclaw.pipeline-review](components/kubeclaw.pipeline-review.md) |
| PCR-PRISM-AGENT-BRIDGE-001 | Angenommene Aufträge sind nach Neustart verloren | [prism.service-agent-bridge](components/prism.service-agent-bridge.md) |
| PCR-PRISM-AGENT-BRIDGE-002 | Sanitizing und Kürzung kollidieren Projektsessions | [prism.service-agent-bridge](components/prism.service-agent-bridge.md) |
| PCR-PRISM-CONTRACT-001 | Viewpatch kann ungültige Komponentenziele einschleusen | [contract.prism](components/contract.prism.md) |
| PCR-PRISM-CONTRACT-002 | Rekursive Validierung ohne Eingangstiefenbudget | [contract.prism](components/contract.prism.md) |
| PCR-PRISM-CONTROL-001 | Worker-Ergebnis ohne Envelope-Bindung angenommen | [prism.service-control](components/prism.service-control.md) |
| PCR-PRISM-CONTROL-002 | Directionevent-ID verletzt UUID-Spalte nach Zustandscommit | [prism.service-control](components/prism.service-control.md) |
| PCR-PRISM-CORPUS-001 | Transaktion auf Pool statt reservierter Verbindung | [prism.corpus](components/prism.corpus.md) |
| PCR-PRISM-DOMAIN-001 | Move in eigenen Nachkommen verliert Teilbaum | [prism.domain](components/prism.domain.md) |
| PCR-PRISM-DOMAIN-002 | Nichtleere Teilbäume lassen sich nicht duplizieren | [prism.domain](components/prism.domain.md) |
| PCR-PRISM-DOMAIN-003 | Responsivepatch verwirft andere Stateproperties | [prism.domain](components/prism.domain.md) |
| PCR-PRISM-ENGINE-001 | Erfolgreiche Renderresultate bleiben unbegrenzt im Cache | [prism.engine](components/prism.engine.md) |
| PCR-PRISM-INGESTION-001 | Cleanup-I/O-Fehler entkommt Requestfehlergrenze | [prism.service-ingestion](components/prism.service-ingestion.md) |
| PCR-PRISM-PREFERENCES-001 | Projektidentität fehlt im Aggregationsschlüssel | [prism.preferences](components/prism.preferences.md) |
| PCR-PRISM-RENDERER-001 | Componentoverride verdrängt ganzen Variantpatch | [prism.renderer](components/prism.renderer.md) |
| PCR-PRISM-RENDERER-002 | Paginationaktionen erreichen Preview nicht | [prism.renderer](components/prism.renderer.md) |
| PCR-PRISM-STORAGE-001 | Artifact-ACK ohne dauerhaften und überprüften Inhalt | [prism.storage](components/prism.storage.md) |
| PCR-PRISM-STUDIO-001 | Unveränderte Puckprojektion überschreibt Designwerte | [prism.studio](components/prism.studio.md) |
| PCR-PRISM-STUDIO-002 | Canonicalassets machen lokale Vorschau unbrauchbar | [prism.studio](components/prism.studio.md) |
| PCR-PRISM-STUDIO-SERVICE-001 | Upstreamfehler wird ungefangene Async-Handler-Rejection | [prism.service-studio](components/prism.service-studio.md) |
| PCR-PRISM-WORKER-001 | Pflicht-Logspeicher fehlt am Executor-Aufruf | [prism.service-worker](components/prism.service-worker.md) |
| PCR-PRISM-WORKER-002 | CPU-Messung zählt die gesamte Prozesslebensdauer | [prism.service-worker](components/prism.service-worker.md) |
| PCR-PRISM-WORKER-003 | Terminate beendet weder Browser noch Evidence-Upload | [prism.service-worker](components/prism.service-worker.md) |
| PCR-PROMPT-001 | Akzeptierte Nicht-JSON-Eigenschaften gehen verloren | [lib.prompt-contract](components/lib.prompt-contract.md) |
| PCR-REDISTRANSPORT-001 | Unterschiedliche logische Ziele teilen einen Stream | [kubeclaw.redis-transport](components/kubeclaw.redis-transport.md) |
| PCR-REDISTRANSPORT-002 | RESP-Antwortbuffer wächst vor Längenprüfung unbegrenzt | [kubeclaw.redis-transport](components/kubeclaw.redis-transport.md) |
| PCR-REGISTRY-001 | Globale Ajv-ID verhindert erneuten Registryaufbau | [foundation.registry](components/foundation.registry.md) |
| PCR-REGISTRY-002 | Securitytest erreicht seine Autorisierungsfälle nicht | [foundation.registry](components/foundation.registry.md) |
| PCR-REPOSITORY-001 | Fehlender Symlinkpfad aktiviert Schreibausbruch im Collector | [kubeclaw.repository-adapter](components/kubeclaw.repository-adapter.md) |
| PCR-RUNTIME-001 | Sessioncleanup bleibt bei Ablauf/Elternabbruch wirkungslos | [kubeclaw.runtime-dispatch](components/kubeclaw.runtime-dispatch.md) |
| PCR-SCAFFOLD-001 | Regeneration verwirft ausgefüllten Providerplan | [nova.scaffold](components/nova.scaffold.md) |
| PCR-SCAFFOLD-OPS-001 | Statusfehler beendet Supervisor scheinbar erfolgreich | [operations-and-packaging](operations-and-packaging.md) |
| PCR-SDK-001 | Serialisierung erzeugt ungültige oder kollidierende Daten | [lib.sdk](components/lib.sdk.md) |
| PCR-SDK-002 | Deklarierter Workspacebuild nicht ausführbar | [lib.sdk](components/lib.sdk.md) |
| PCR-STATE-001 | Journal-Cache enthält fremd veränderbare Payloads | [nova.state](components/nova.state.md) |
| PCR-STATE-002 | Stale-Lock-Übernahme ist nicht an beobachteten Besitzer gebunden | [nova.state](components/nova.state.md) |
| PCR-TAILSCALE-001 | Standard-HTTPport wird abgewiesen | [kubeclaw.tailscale-exposure](components/kubeclaw.tailscale-exposure.md) |
| PCR-TAILSCALE-002 | Ready und Cleanup nicht an Exposuregeneration gebunden | [kubeclaw.tailscale-exposure](components/kubeclaw.tailscale-exposure.md) |
| PCR-TELEM-001 | Release-Verifikation erwartet entfernten Auditobserver | [nova.telemetry](components/nova.telemetry.md) |
| PCR-TELEMETRY-CONTRACT-001 | Payload schwächt Envelopeidentität | [contract.telemetry](components/contract.telemetry.md) |
| PCR-TELEMETRY-CONTRACT-002 | Generierte Typen verlieren erlaubte Wireformen | [contract.telemetry](components/contract.telemetry.md) |
| PCR-TEST-CONTRACT-001 | Dateideklaration erlaubt im Typ ein verbotenes Artefakt | [contract.test-gate](components/contract.test-gate.md) |
| PCR-TEST-CONTRACT-002 | Beispiele deklarieren verbotenes Inputfeld | [contract.test-gate](components/contract.test-gate.md) |
| PCR-TSTORE-001 | Secretfeldpolitik des Sinks lässt API-Schlüssel durch | [kubeclaw.telemetry-store](components/kubeclaw.telemetry-store.md) |
| PCR-TSTORE-002 | Redaction rekursiert vor validiertem JSONbudget | [kubeclaw.telemetry-store](components/kubeclaw.telemetry-store.md) |
| PCR-VISUAL-001 | mittel: Baselineidentität bindet keine Browserversion | [kubeclaw.visual](components/kubeclaw.visual.md) |
| PCR-WORKER-001 | Claim-Deadline deckt nicht alle Abschlussphasen ab | [worker.core](components/worker.core.md) |
