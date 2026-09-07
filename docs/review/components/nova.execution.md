# nova.execution — Nova-Graph, Attempts und Ausführungssteuerung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Alle 23 Dateien einschließlich README/CAPABILITIES (1968 Zeilen) untersucht.
Vier Originalprüfkommandos bestanden; zwei zusätzliche Crashfenster reproduziert.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

Aktiver Core unter `skills/nova/core/execution`: Enginefassade, Registry-
Vorbereitung, Graph, Scheduling, Plugincontext/Lease, Adapterlifecycle,
Checkpointindex, Snapshot-/Runidentität, Resume und administrative Wiederöffnung.
Entrypoints `engine.ts`: load/validate/run/recover/resume/reopenBlockedPipelineV2;
Corepaket exportiert diese, CLI und Nova-Projektpfad verwenden sie.
Direkter PipelineRunner ist außerdem ein öffentlicher Low-Level-/Testpfad;
er erzeugt selbst keinen Run-Mutationslock. Hochstufige Engineaufrufe tun das.

Keine feste Dispatchliste von Forge/Echo/Buster im Scheduler. Registry ordnet
Stage.type der tatsächlichen Aktivierung zu. `prepareRuntime` entdeckt auch
nicht aktivierte Pakete, löst explizite Grants/Provider und transitive Adapter,
validiert Konfiguration und aktiviert die ausgewählten Registrierungen.
Abhängigkeiten: [foundation.registry](foundation.registry.md),
[foundation.isolation](foundation.isolation.md), [nova.effects](nova.effects.md),
[nova.state](nova.state.md), [nova.lifecycle](nova.lifecycle.md),
[nova.telemetry](nova.telemetry.md) und [nova.observability](nova.observability.md).

Gegenstellen: Lifecycle-Dateien vollständig gelesen; Effects-/Registry-
Verträge aus Einzelreviews erneut an Aufrufen abgeglichen. Stage Executor
liefert PluginContext und Result an reducer; DecisionRecorder schreibt die
Events, die recovery-state wieder faltet. Delivery-Lint und echter
Artifactadapter wurden für die Rückgabe-/Persistenzgrenze geprüft und ausgeführt.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

Engine nimmt Plattformkonfiguration und PipelineDefinition, optional Run-ID/
Abbruchsignal beziehungsweise ResumeSignal/AdministrativeDecision.
Definition wird geklont und tief gefroren, Hauptvertrag und registrierte
Config-/Inputschemas geprüft. Graph verlangt eindeutige Stages, vorhandene
azyklische Dependencies und gültige Budgets. Aktivierungsquelle muss Vorfahr
sein; Remediation prüft Ordnung, gemeinsame Ziele und Deadlocks. Nachgelagerte
reine Remediationziele müssen Blätter sein. Snapshot sortiert Knoten/Kanten.

StageExecutor erzeugt neue Attempt-/Lease-IDs, fortlaufende AttemptNumber,
Grants, Timeout und feste Memorygrenze 512 MiB; liefert nur Artefakte derselben
Stage oder transitiver Vorgänger. Context.invoke prüft aktive Lease, Grant,
Operation, Ressourcentyp und Constraints vor Adapterübergabe. Context.emit
prüft Plugin-Namespace und Run-ID. Ergebnis wird gegen das registrierte
Resultschema geprüft und als vollständiges attempt-terminal-Event gespeichert.
RunnerResult enthält Run-/Pipeline-/Graphidentität und eingefrorene Stagestates.

ArtifactCheckpoint `checkpoint:true` prüft Bytes, Digest, Namespace, Medien-
typ und vollständige Attemptidentität. Normale Resultartefakte dürfen auch
zertifizierte frühere Artefakte derselben Stage enthalten; deshalb verlangt
DecisionRecorder Run-/Stagebesitz, nicht zwingend den neuesten Attempt.
Resume bindet Signal an Wait-ID/Typ/Issuer und Erstellungs-/Ablaufzeit.
Administrative Wiederöffnung bindet Actor an Hostauthenticator und Allowlist.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

RunRoot verwendet validierte ID plus SHA-256-Verzeichnis; Legacyname mit
ersetzten Doppelpunkten wird nur bei nachgewiesener Run-ID im alten Eventjournal
verwendet. Legacyprüfung liest begrenzte 256-KiB-Zeilen inkrementell.
Run-Mutationslock kombiniert lokalen Active-Set-Schutz mit originalen Filelocks,
60-Sekunden-Lease und Erneuerung alle 20 Sekunden. Sein finally umfasst auch
Akquise/Nachprüfungen; kein zweites PCR-EFFECT-001 an dieser Stelle gefunden.

`writeRunSnapshots:77–94` schreibt einen vollständigen run-snapshot mit
Graph/Registry/Digest über fsync und atomaren Hardlink ohne Überschreiben.
Vorhandene aktuelle/alte Snapshotnamen verhindern Neuanlage. Replay prüft
Inhaltsdigest, Graphidentität, Paketmenge/-version/-digest und effektive
Provider-/Grant-/Adapter-/Observerkonfiguration; administrative Upgrades
müssen eine zusammenhängende erlaubte Versionskette bilden.

Events, Effects, Observerzustand, Signale und Adminentscheidungen sind getrennte
Journale. Keine komponentenübergreifende Transaktion. Besonders relevante
Fenster: Attemptresult → Wait-/Artifact-/Stageentscheidung (Befunde unten),
Signaljournal → wait.resolved, Adminjournal → run.resumed/Continuation.
Im Signal-/Adminpfad existieren append-once-/Idempotenzprüfungen. Abgeleitete
State-/Artefaktindizes müssen nach Crash aus dem vorhandenen Präfix konsistent
rekonstruierbar sein; zwei Gegenbeispiele zeigen die aktuelle Grenze.

## 4. Korrektheit und Fehlerbehandlung

Graphready verlangt erfolgreiche/übersprungene gewöhnliche Vorgänger.
Aktivierungsbedingungen verwenden `Object.is` auf einem benannten Fakt.
Stages laufen in Batches bis maxConcurrency; Ergebnisse werden vor
Remediationinvalidierung geordnet, damit alte Geschwisterresults reparierte
Zustände nicht wieder überschreiben. Ein langsames Batchmitglied hält die
nächste Auswahl auf: keine dynamische Nachbelegung freier Slots.

Pluginfehler werden retry, Timeout failed/timed_out, Abbruch cancelled;
unsicherer externer Effekt explizit blocked. Undeklariertes request_fix kann
beim Reducer nach dem gespeicherten Attemptresult werfen; Graph-/Pluginvertrag
muss zusammenpassen. Erneute Journalfehler beim Speichern eines Fehlerresults
werden weitergereicht, kein Erfolg erfunden. Required-Observerfehler unterbrechen
Ausführung; `serializedObserverDrainer` bleibt nach erster Rejection abgelehnt.
Dies ist eine harte Fehlergrenze, kein automatischer Observerretry im Enginewrapper.

## 5. Timeouts, Abbruch, Wiederholungen und Parallelität

Stageaufruf wird gegen Cancellation/Timeout geraced; danach Leasewiderruf und
Controllerabort. Der Core wartet nicht darauf, dass ein Inprozessplugin sein
verspätetes Promise tatsächlich beendet. Neue Capabilityaufrufe nach Widerruf
scheitern; bereits laufende Adapteroperationen müssen ihre Abortsignale und
Fences beachten. Isolierte Prozessbeendigung hat eigene nachgewiesene Grenzen
[PCR-ISOLATION-001/002](foundation.isolation.md).

Adapteraktivierung startet Abhängigkeiten zuerst, erkennt Zyklen, teilt
in-flight Start und Shutdown, behandelt verspätete Fabrikergebnisse und
revokiert deren Kontexte. Aktivierung/ready haben Promise-Timeouts; Rollback-
und Late-Shutdown geben AbortSignal weiter, warten aber kooperativ auf
shutdown(). Ein Adapter, der dieses Signal ignoriert, kann dort länger bleiben;
kein aktueller produktiver Hänger dieses Pfades reproduziert.

Adapterdependency-Keys bestehen aus Adapter-ID/Capability/Requestdigest,
während Effects auch Attemptidentität binden. Wiederholte identische
Dependencyrequests über verschiedene Attempts können daher konfligieren;
konkrete aktive Requestsequenz ist noch bei Adapterreviews zu prüfen.
Aktuelle Runtime-/Transport-POSTs tragen äußere Idempotency-IDs im Header und
sind deshalb nicht ohne Weiteres identische Requests. Kein pauschaler
Doppelzustellungsbefund aus dem Keyformat allein.

## 6. Neustart, Wiederaufnahme und externe Teilaktionen

Recovery prüft gepinnten Stand, terminale Rungrenze, Observabilityreconciliation
und sichere Effectcontinuation. Laufende Attempts verbrauchen Budget und
werden pending. Cooldown vor Fälligkeit wird abgelehnt. Offene Waits verlangen
Signal, blockierte Runs administrativen Entscheid. Bei Adminretry wird genau
ein zusätzlicher Versuch freigegeben; Counters werden nicht zurückgesetzt.
Bereits gespeicherte identische Adminentscheidungen können ohne erneute
Actorabfrage replayt werden: autorisierter persistierter Intent bleibt Autorität.

Artifactcheckpoint-SIGKILL-Test besteht. Er deckt ausdrücklich Checkpoints
vor Stageabschluss ab; gewöhnliche Resultartefakte haben das separate
PCR-EXEC-002-Fenster. Wartezustand nach vollständiger wait.resolved-Zeile
behält freigegebene Guidance; fehlende separate Wait-Erzeugungszeile ist
PCR-EXEC-001. Diese Zustände werden nicht durch spätere E2E-Traces ersetzt.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

24 Capabilityhandler binden Namensräume, Agents, Secrets, Origins, Executables,
reale Workspaceroots, Build-/Kubernetes-/Lint-/Testplanparameter. Pfade prüfen
canonical absolute/realpath oder explizit erlaubte relative Prefixe; fehlende
Roots führen geschlossen zu Ablehnung. Kein Symlink-Atomizitätsversprechen
zwischen Autorisierungsprüfung und späterem Adapterzugriff. Hostfilesystem
und vertrauenswürdige Adapter bleiben Teil der Grenze.

ResumeSignal enthält Issuerbehauptung; `validateSignal` prüft Gleichheit,
keine Signatur oder unabhängigen Login. Die API erwartet einen vertrauens-
würdigen aufrufenden Host, im Unterschied zum expliziten Adminauthenticator.
Diesen Vertrag vor jeder künftigen externen Resume-API dokumentieren und
serverseitig authentisieren. Hier keine Veröffentlichung/Authentifizierung
für hypothetische Endpoints implementiert.

Admin-/Snapshotjournale sind lokale Vertrauensanker, Hashes keine Signaturen.
Configloader friert Plattformwerte; direkte Bibliotheksaufrufer müssen dieselbe
unveränderliche Konfiguration garantieren. prepareRuntime speichert teilweise
Referenzen darauf. Plugins haben keinen APIzugriff auf Graphmutationen.
Adapter sind privilegiert; Contextprüfung ersetzt nicht deren Codevertrauen.

## 8. Ressourcenbegrenzung, Aufräumen und Aufbewahrung

Run-/Stagekonkurrenz, Versuchs-/Remediationbudgets und Timeout begrenzen Ablauf;
Graph-DFS und mehrere Kanonisierer sind rekursiv, keine zusätzliche Gesamttiefen-
prüfung in dieser Komponente. Journal-/Lockwachstum und Snapshotgröße hängen
von Core-/Storegrenzen ab. Shutdown wird im Engine-finally ausgeführt;
Observerflushfehler können das Ergebnis der bereits beendeten Pipeline überlagern.
Keine eigene abgeschlossene Run-/Snapshot-/Signals-/Artefakt-GC.
[PCR-STATE-002](nova.state.md) betrifft den Metadatenmutex auch des Runlocks.
Memory/CPU-Leasewerte sind keine hier gemessenen Prozessgrenzen.

## 9. Architektur und Vereinfachungsmöglichkeiten

Mehrere separate manuelle canonical/deepFreeze-Funktionen (graph,
engine-snapshots, adapter-support, runner) statt eines strengen gemeinsamen
Vertrags erhöhen Driftgefahr. Sie sind keine zweite Lösung für
[PCR-SDK-001](lib.sdk.md). Später einen geprüften JSON-/Digestvertrag an den
Eingangsgrenzen verwenden, keine Kompatibilitätsschicht zum stillen Umschreiben.

Durable Attemptresult ist bereits die stärkste gemeinsame Recoveryquelle.
Wait-/Artifact-/Stageprojektionen daraus idempotent ableiten, statt weitere
unverbundene Schreibschritte und ad-hoc-Reparaturtools hinzuzufügen.
Public Low-Level-PipelineRunner klar von Engine mit Runlock unterscheiden.
Batchscheduling ist einfach und deterministisch; dynamische Nachbelegung nur
bei nachgewiesenem Bedarf und unter Erhalt der Remediationregeln erwägen.

## 10. Tests und tatsächliche Aussagekraft

Vollständig gelesen und ausgeführt, Exit 0 in `evidence/nova-execution-tests.txt`:

- phase6 (663 Zeilen): Graph-/Aktivierungsnegativfälle, Fan-out/Join,
  Remediation, Observer während Run, eingefrorene Ergebnisse, Snapshotmanipulation,
  ausgeschnittene Replayfenster, Adminauth/Idempotenz/Retry/Remediation, Abbruch,
  deklarierte Paketupgrades. Synthetische Stage-/Observerfixtures sind gelesen.
- resume: tatsächlicher Engine-Wait/Guidancepfad, Graphdrift und stale Signal.
- engine: echte Delivery-Lint-, Repository-/Artifact-/Telemetryadapter,
  vollständige Registry im Snapshot und Terminaltelemetrie.
- checkpoint-recovery: echter Stageprozess-SIGKILL, originaler Artefaktspeicher,
  zweiter CLIprozess, keine doppelte Artefaktprojektion, transitive Sichtbarkeit.

Zusätzlich gelesen: Capabilityruntime (im Effectsreview bestanden),
Lifecycle-/Snapshotreliabilitytests (vorhandene bestandene Läufe),
Live-crashes-Matrix (ersetzt Aktivierungen durch werfende Funktionen, ist
Hostfehlerbehandlung und kein echter Plugin-Crashtest; nicht erneut ausgeführt).
Capability-Securitymatrix wurde wegen bekannter Fixturegrants nicht grün:
[PCR-REGISTRY-002](foundation.registry.md); 24 Aufruffälle nicht als ausgeführt
gewertet. Externer Engine-/HTTP-Crashpfad ist durch Isolation blockiert.

Neue Reproduktionen nutzen Originalengine/-plugins/-journale und gültige
Journalpräfixe. Sie modellieren den Crashzeitpunkt durch Abschneiden NACH einer
vollständigen Originalzeile; keine Behauptung eines dort ausgelösten echten
SIGKILL. `orchestrator-wait-window.mjs` bestätigt Resume-Sackgasse;
`result-artifact-window.mjs` bestätigt fehlende Projektion trotz Recoveryerfolg.
Noch offen: echte Last-/Speichergrenzen, kooperatives Adapter-Unwinding unter
I/O-Fehlern, Signal-/Admin-Crashmatrix über alle Zwischenzeilen und komplette
Projekt-E2E-Traces. Keine CI neu angefordert.

## 11. Dokumentation und frühere Prüfstände

README beschreibt Graphpinning/Checkpointgrenze brauchbar, aber nicht die
mehrstufige Abschlussprojektion und ihre Fenster. CAPABILITIES.md ist veraltet:
Phase11-Isolation existiert, während Text deren Fertigstellung noch aussteht.
Tabelle der Constraints nennt neuere Build-/Kubernetes-/Testplanflächen nicht
vollständig. Aussage widerrufener Kontexte bedeutet keine synchron garantierte
Beendigung bereits gestarteter externer Aktionen.

`plugin-system-phase6-lifecycle.json` erneut vollständig geprüft: Graphfelder,
Resultvokabular und Counterregeln passen zu Code/aktuellen Tests; nextPhase=7
und v1-Löschaufgaben sind historische Vorbereitung, kein aktueller Betriebsstand.
Nicht alle dort formulierten Recoverygarantien gelten für jedes Crashpräfix.
Vorhandene Isolation-/Registry-/State-/SDKbefunde sind verlinkt und am jeweiligen
Aufruf abgeglichen. Keine weitreichende Neufassung der Produktdokumentation.

## 12. Befunde und Verifikationsaufgaben

### PCR-EXEC-001 — Rekonstruierter Wait kann nicht per Signal fortgesetzt werden

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

### PCR-EXEC-002 — Resultartefakt verschwindet aus der Recoveryprojektion

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

Beide Befunde sind zentrale Eigentümer für [nova.lifecycle](nova.lifecycle.md).
Keine doppelten Findings dort oder bei den betroffenen Stages anlegen.
