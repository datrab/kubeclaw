# kubeclaw.runtime-dispatch

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Registrierung und Gegenstellen

Vollständig gelesen: alle acht `skills/common/plugins/runtime-dispatch/src/*.ts`,
beide Configschemas, Manifest/Paket/README, beide Tests (live-function 493 Zeilen).
Manifest hat zwei alternative runtime.dispatch-Provider: runtime (HMAC/SPIFFE-
Proxy) und openclaw (Session-/Collector-Protokoll). Beide verlangen network.http
und secrets.read, openclaw zusätzlich git.repository.read. Runtime-Rollen liefern
Paket; Core wählt einen Provider, validiert Config und Grants; Adapter validiert
capability/operation/runtime.agent-ID und Targetmap. ready/shutdown nur Zustandsflag.

Sender Review `src/stage.ts:dispatchEcho` übergibt buildReviewDispatchRequest und
parst response mit parseEchoReviewDispatchResponse. Runtime-Grenze garantiert
keinen fachlichen Review-PASS: Fachschema und Evidencebindung gehören diesem
Empfänger. Generischer HTTP-Adapter JSON-validiert Requests/Antworten (Tiefe 20,
1000 Einträge pro Container, problematische Schlüsselnamen verboten), liefert
Antwortobjekt. HMAC ist SHA256(secret, idempotencyKey + '.' + JSON.stringify(payload)).
Prism-Gegenstelle `server/control.ts:300–309` liest gleichen Key/Rawbody und
vergleicht HMAC timingSafeEqual; danach designRequest-Validierung/DB-Transaktion.
Das ist ein wirklicher kompatibler Sender/Empfänger, keine Testserverannahme.

OpenClaw sendet Gateway-Toolaufrufe mit controllerSessionKey/Bearer, spawn-Key im
JSON-Body (URL-Fragment nur lokale Resourceidentität, kein HTTP-Wire-Fragment).
Es akzeptiert verschachtelte MCP/Legacy-Envelopes, lehnt ok:false/isError/status-
Refusal typisiert ab. Session-ID verbindet runId/sessionKey/taskId/Label; Collector
matched runId. Nichtcollector matched erste passende ID oder Label. Reattachment
prüft mehrdeutige Run-IDs, Modellabweichungen, fehlende IDs; fehlendes Modell wird
bei Reattachment aus Erwartung ergänzt, keine unabhängige Modellattestation.

## 3–4. Zustand, Import, Ergebnisdisposition

Generic runtime hat keinen lokalen Commit. OpenClaw hält Encoder, 250-ms-Session-
Listcache und Spawnqueues im Prozess. Deterministische Transport-ID enthält
collector-v5/session-v1, runtimeDispatchAttempt, Dispatch-ID und Modellpayload-
Digest; Prompt-Budget/DispatchAttempt werden dem Modell nicht mitgegeben.
Ergebnisse werden aus read_text oder authentifiziertem resultEndpoint gelesen.
Fehlt lokale Datei, nutzt Import structured/result oder genau eine terminale
Assistant-Nachricht. parseJsonText akzeptiert Raw JSON, Fence oder JSON-Objekt
innerhalb Text; Fachschema bleibt Empfänger. Mehrdeutige Terminalnachrichten scheitern.

Fallback persistResult: Tempfile exklusiv, fsync, Hardlink, bei vorhandenem Ziel
nur identischer Inhalt, unlink temp, fsync Blattverzeichnis. Elternverzeichnis-
Neuanlage wird nicht separat fsynced; kein vollständiger Powerlossnachweis.
Lokale Daten sind Modelloutput, kein vertrauenswürdiges Reviewurteil. Session-
Evidence für Implementation/Testjudgment wird vom Adapter überschrieben, inklusive
Digest des tatsächlich importierten Texts; Runtimeattestation hasht konfigurierte
Target/Agent/Model/Thinking-Identität, sie signiert keine Providerabrechnung.

## 5–6. Absolute Zeit, Abbruch, Replay und ungewisser Ausgang

Implementation-workspace-Zuordnung: spawnSession nutzt nur statisches target.cwd;
`buildRequest` des Implementationplugins überträgt dessen dynamischen Worktree nicht.
Eigentümerbefund PCR-IMPLEMENTATION-001 siehe [implementation-agent](kubeclaw.implementation-agent.md).
SDK-Taskprefix bindet mutable Workspace zusätzlich an runtime cwd.

Prompt-Budget kann absolute deadlineEpochMs liefern; vor Secret/Spawn/Import wird
gegen kombiniertes Signal geraced/geprüft. Pollschleife startet zusätzlich relative
sessionTimeoutMs erst nach Spawn. Gatewayaufrufe selbst erhalten dieses lokale
Deadline-Signal nicht ausdrücklich; Core verschachtelt nur das Elternsignal.
Poll kann daher eine lokale absolute Deadline um laufende HTTP-Timeoutdauer
überschreiten. Abschlussbudget umfasst Secret, Spawnqueue/Pacing, Poll, Ergebnis-
Fetch/Persist/Tokenisierung und äußeres Receipt; nicht nur sessionTimeoutMs.
Keine eigentlichen Workerclaim-/Logstore-Hooks hier. Provider-Tokens werden nicht
zurückgeliefert; Review `repository-audit-results.ts` vermerkt dies explizit.

Spawnqueue serialisiert pro Context+Endpoint+Controller, inklusive spawnIntervalMs
nach Antwort; verspätete Spawnantwort soll best effort canceln. Nach hartem Neustart
kann subagent über deterministisches Label wiedergefunden werden; ACP besitzt
keinen solchen lokalen Lookup. Kein adapter.receipt, kein eigenes persistiertes
Spawn-/Cancel-Ledger. Remote-Deduplizierung ist externe Voraussetzung. Präfixe:
Spawn akzeptiert vor ACK = Identität unbekannt; terminal vor Resultfile = Fallback;
Resultfile vor äußeren Receipt = Datei vorhanden, Core-Reconciliation getrennt.
Keine vollständige Exactly-once-/Crash-Recoverygarantie daraus.

Abbruch/Cleanup siehe PCR-RUNTIME-001. `shutdown` setzt nur Flag; Core-Wrapper
revokiert laufende Signale. Das beendet nicht automatisch externe Sessions.

## 7–9. Vertrauen, Ressourcen und Architektur

Generischer HMAC-Pfad verweigert externes HTTP, erlaubt Loopback; SPIFFE-Proxy
nur Loopback, externe Identität muss Proxy authentifizieren. OpenClaw-Konfiguration
erlaubt dagegen auch externes HTTP mit Bearer; Transport-/Netzpolicy muss dies
absichern. Diese asymmetrische Grenze ist keine HMAC-Absicherung des Bearerpfads.
Secrets und verschachtelte Netz-/Reposrequests sind confidential; Core prüft
Downstream-Grants trotzdem. Direkte Dateimaterialisierung vertraut konfiguriertem
repositoryRoot und dessen Elternpfaden; keine eigene descriptorbasierte
Symlink-Rennabwehr. Repositoryread-Denial außer FILE_NOT_FOUND wird nicht übergangen.

Generische Request-/Responsegrenzen Default 1 MiB, maximal 8 MiB; response kann
schon durch network-http unbeschränkt gepuffert worden sein, PCR-NETWORK-001.
JSONforEach überspringt Sparseholes, Getter werden ausgewertet; Tiefe/Container-
Breite begrenzen keinen globalen Knotenaufwand. SDK-Digest-/Taskserialisierung
erbt PCR-SDK-001. OpenClaw feste o200k_base Budgets: 900000 Bytes, 120000 Input,
6000 Output, 128000 Context; Tokens werden real mit tiktoken gezählt. Outputlimit
kommt erst nach Dateiimport/ggf. Persistierung und Parse. Keine Resultfile-GC,
Encoder leben Prozessdauer, Spawn-/Listmaps löschen abgelaufene Einträge nur bei
Nutzung/Abschluss; Resultdateien/Remote cleanup:keep benötigen Retentionskonzept.

Vereinfachung: ein kontrollierter Session-Lifecycle mit getrenntem Cleanupbudget
und durable Reconciliationzustand; keine weiteren Alias-/Fallbackschichten, bevor
Quelle und erlaubte Lebensdauer eines Ergebnisses explizit sind.

## 10. Tests und Ausführungsgrenzen

Original `node tests/package-boundary.test.mjs && node tests/live-function.test.ts`
im Paketverzeichnis bestanden (Node 24.19.0). Echter Core-Registry/AdapterRuntime,
Secretresolver, Networkadapter und Loopback-HTTP; MemoryEffectJournal und
MemoryResourceLockManager, kontrollierter Gatewaytestserver. Prüft HMAC/kein Token
im Journal, gleiche Effect-ID ohne erneuten Request, Targetdenial, Reattachment-
Parser, Model-/Prompt-/Outputbudgets, Collector-Fallback in echte Datei, getrennte
Dispatch-ID mit neuem Spawn und typed admission refusal. Es sind keine echten
OpenClaw-Agenten, keine Modellabrechnung, keine produktive TLS/SPIFFE-Verbindung,
keine diskbasierte Core-Recovery. Definierte Testserverzweige remote_result/history
belegen allein nicht deren Laufzeitausführung; Haupttest nutzt Collector-Fallback.
Boundarytest liest nur generischen adapter.ts, keine vollständige Paketisolation.

Kein neuer Sessionmock und kein Deployment. Code-Trace zu Deadline/Cancel ist
keine ausgeführte externe Cancelprobe. Powerloss-/Symlinkrace-/Remote-ACKverlust
bleiben echte Folgeverifikationen; keine bestandenen Nachweise behauptet.

## 11. Dokumentationsabgleich

README zu HMAC, Collector und Datei-Fallback entspricht Code. Abschließende
Behauptung, Monitoring/Cancellation/Recovery seien blocked, ist inzwischen
veraltet: openclaw.ts/session implementieren genau diese Teilpfade. „bounded“
erklärt weder volle Abschlussdeadline noch fehlende Providerverbrauchswerte und
Cleanupgarantie. Katalog beschreibt Registrierung, kein produktiver E2E-Nachweis.

## 12. Befund

### PCR-RUNTIME-001 — Sessioncleanup bleibt bei Ablauf/Elternabbruch wirkungslos

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
