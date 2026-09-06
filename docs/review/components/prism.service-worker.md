# prism.service-worker — HTTP-Worker für deterministische Prism-Operationen

Review-Status: teilweise geprüft. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Gelesen: vollständiges `skills/prism/server/worker.ts`, Gegenstelle
`server/control.ts:142–226` (`runWorker`), `engine/worker-envelope.ts`,
`engine/worker-binding.ts` bis Ergebnisvalidierung; Worker-Core-Logabschluss.
Offen: sämtliche Engine-/Renderer-Pfade, Browserprozesse, Storage-/Nonce-Lifecycle,
Deployment-Auslieferung und vollständige vorhandene Service-/Integrationstests.
Kein vollständiger Service-Test ausgeführt.

## 1–3. Grenze und konkreter Aufrufpfad

Control persistiert Input als Artifact, baut mit `prismAttempt` ein
worker-attempt-envelope.v1 und sendet POST `/v1/attempts`. Worker begrenzt den
Request-Body auf 16000000 Bytes, prüft XFCC über Loopback bei SPIFFE bzw.
HMAC/Nonce über Postgres, validiert den Worker-Vertrag und startet direkt einen
WorkerAttemptExecutor. Anders als Buster verwendet dieser Service keinen
LocalWorkerRuntime mit Kapazität/Deduplizierung.

`operationFor` lädt einen deklarierten JSON-Input vom konfigurierten Control-
Origin und erwartet exakten Artifact-Pfad, Digest und Größe. Anschließend
executePrismOperation: Request-/Result-Schema der konkreten Operation. Generation
wird hier abgelehnt; LLM-Aufrufe gehören dem Agent-Gateway. Screenshots/ARIA
werden als Evidenz zum Control hochgeladen. HTTP 200 enthält den neutralen
Worker-Result, einschließlich errored; Control lehnt alles außer completed ab.

## 4–6. Fehler, Abbruch und Neustart

Siehe PCR-PRISM-WORKER-001 und -002. `terminate` setzt lediglich einen Boolean;
Renderer-/Engine-Aufrufe erhalten hier kein durchgehendes AbortSignal.
Input-Fetch erhält es, Evidence-Upload nicht. Anfrage-Disconnect wird nicht als
Executor-Signal verdrahtet. Requestfehler werden pauschal HTTP 422.
`/health` antwortet ohne Abhängigkeitstest; `/ready` prüft die Nonce-Tabelle.
Engine-Idempotenz/Restart und teilweise externe Uploads noch vollständig verfolgen.

## 7–9. Vertrauen, Limits und Architektur

SPIFFE-Proxy-/Header-Sanitisierung und geschützter Loopback sind Voraussetzungen,
keine hier geprüften Infrastrukturbehauptungen. HMAC-Pfad benötigt Postgres-
Nonce-Tabelle und Secret; keine Werte in diesem Review. Input wird vollständig
gepuffert; parallel zugelassene HTTP-Anfragen haben hier keine aggregierte
Kapazitätsgrenze. Prozesse werden mit festem Wert 1 gemeldet, RSS/CPU auf
Serviceprozess bezogen. Browser-Unterprozesse und harte Ressourcendurchsetzung
sind noch nachzuprüfen. Permanente Engine/DB-Pool-Lebensdauer und Shutdown offen.

## 10–12. Tests, Dokumentation und Befunde

Das vorhandene `check-pipeline-worker-attempt-executor.mts:596–601` erwartet
explizit WORKER_LOG_STORE_FAILED für eine loggende Operation ohne storeFullLog.
Das prüft den Core-Vertrag mit einer Testoperation, nicht diesen Prism-Service.
Kein Ersatz-Control, kein Mock-Postgres und kein künstliches positives
Prism-E2E-Ergebnis erstellt. Live-Service-Reproduktion ist ausstehend.
Dokumentationsstatus: unvollständig; vorhandene Worker-/Prism-Betriebsbehauptungen
müssen gegen diese konkrete Integration korrigiert werden. Historische W4/W6-
Punkte aus `docs/architecture/pipeline-reliability-remediation.md` bleiben offen.

### PCR-PRISM-WORKER-001 — Pflicht-Logspeicher fehlt am Executor-Aufruf

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

### PCR-PRISM-WORKER-002 — CPU-Messung zählt die gesamte Prozesslebensdauer

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
