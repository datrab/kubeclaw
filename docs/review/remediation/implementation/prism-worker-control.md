# Prism Worker-Abschluss und Control-Ergebnisbindung

Stand: 2026-09-09. Zugeordnet: **PCR-PRISM-WORKER-001** und
**PCR-PRISM-CONTROL-001**; Entscheidungen D01, D07, D08, D09 und D10.
Implementiert und gezielt lokal geprüft; kein vollständiger Dienst-/Betriebsnachweis.

## Umsetzung

- `server/worker.ts` verwendet `executeWorkerAttempt`, das den echten
  `WorkerAttemptExecutor` mit einem verpflichtenden `storeFullLog` verbindet.
  Der vollständige Callbackinhalt wird als `prism-full-log` über denselben
  authentifizierten CASpfad persistiert; Digest, Größe und Uploadquittung werden
  geprüft. Kein Dummycallback, kein Abschalten der Logretention und keine
  zusätzliche zentrale Logsammlung. Der neutrale Core rechnet das Log gegen das
  Evidenzbudget; Speicherfehler bleiben `WORKER_LOG_STORE_FAILED`.
- `WorkerArtifactClient` liest nur vom konfigurierten Control-Origin mit exaktem
  Digestpfad/Artifact-ID, ohne URLcredentials, Query, Fragment oder Redirect.
  Reads sind größenbegrenzt und prüfen vollständige Bytes gegen Digest und Größe;
  Uploadquittungen sind ebenfalls begrenzt und werden gegen den gesendeten Inhalt
  geprüft. Die aus Control extrahierte Originalroute authentifiziert Worker/
  Control via bestehendem SPIFFEpfad bzw. Secret, verweigert leere Secrets und
  prüft POSTbytes gegen den URLdigest **vor** `put`.
- `acceptWorkerResult` validiert Envelope, Resultvertrag und Resultdigest,
  Protokoll, Attempt, Claim, Claimgeneration und Worker sowie das konkrete
  Prism-Resultschema samt Schemadigest und Werten. `hydrateWorkerResult` prüft
  zunächst sämtliche Evidenzdeklarationen, erlaubte Typen/Medientypen,
  Doppelungen, Wertkonflikte, URLs und Gesamtbudgets. Fehlendes Voll-Log wird
  abgelehnt. Erst danach folgen Bytesreads und abschließende Fachvalidierung.
  Control schreibt das Result erst nach dieser Annahme in die DB.
- Der Cache speichert Envelope und gebundenes Workerresult. Replay bindet die
  gespeicherte Execution-ID an die vorhandene DBkennung und den gespeicherten
  Operation/Inputdigest an den aktuellen Requestdigest; danach durchläuft es
  dieselbe Result-/Evidenzprüfung. Die historisch `attempt_id` benannte DBspalte
  enthält weiterhin die Execution-ID. Alte ungebundene Resultobjekte liefern
  `PRISM_WORKER_CACHE_UNBOUND` mit expliziter Reconciliationdiagnose; dieser Pfad
  startet keinen Ersatzrender und bestätigt keine ungebundenen Daten.

## Ausgeführte Belege

`node --test skills/prism/tests/worker-service.test.mts skills/prism/tests/engine.test.mts skills/prism/tests/internal-auth.test.mts skills/prism/tests/storage.test.mts skills/prism/tests/control.test.mts`

**20/20 bestanden**, keine übersprungenen Tests. Die fünf Workertests führen
Original-Engine, Original-Operation und Original-Executor mit dem tatsächlich in
Control verwendeten Artifact-Handler auf einem lokalen nativen HTTPserver und
echtem temporärem Dateispeicher aus. Kein Ersatzexecutor, Mocktransport oder
Mock-CAS. Konkret belegt:

1. Derselbe loggende Originaloperationspfad ohne Callback reproduziert
   `WORKER_LOG_STORE_FAILED`; die neue Serviceverdrahtung liefert completed und
   das bytegenau lesbare Voll-Log mit korrekter Größe/Digest.
2. Ein tatsächlich korrumpiertes vorhandenes CASlog lässt die fachlich
   erfolgreiche Operation weiterhin errored enden, inklusive Originaldiagnose.
3. Ergebnisse eines anderen echten Attempts, veränderte Claim-/Workerbindung,
   Result-/Schemadigests, fehlende Pflichtwerte und ungültige, doppelte oder
   fehlende Evidenz werden vor dem ersten Evidenz-HTTPkontakt abgelehnt.
   Gebundener Replay gelingt; andere Request-/Executionbindung sowie Altcache
   werden abgelehnt.
4. Unauthentifizierter Artifact-GET wird abgelehnt; POST mit falschem URLdigest
   scheitert und das bestehende korrekte Artifact bleibt verfügbar.
5. Zu kleines Evidenzbudget blockiert den Voll-Logupload im neutralen Executor:
   nur der erforderliche Input-GET findet statt, kein übergroßer Log-POST.

`node_modules/.bin/tsc --noEmit -p skills/prism/tsconfig.json`: **bestanden**.
Kanonisches ESLint mit
`--config charts/kubeclaw/files/config/eslint.config.mjs`: alle sechs neuen
Produktionshelper und `worker-service.test.mts` **bestanden**. Die ebenfalls
ausgeführte Prüfung von `server/control.ts` und `server/worker.ts` ist weiterhin
rot: 58 bzw. 12 vorhandene Monolith-/Env-/Async-Lintbefunde. Vergleich mit dem
Original-HEAD per ESLint-stdin auf denselben Dateipfaden: 64 bzw. 14 Befunde.
Kein Lintgate abgeschwächt, keine vollständige Lintfreigabe behauptet.

## Grenzen und offene Nachweise

- Kein Start beider vollständiger Originaldienste mit nativem PostgreSQLpool,
  Sessions/Noncepersistenz und DB-Commit-/Rollbackbeobachtung. Die vorhandenen
  Storage/Authtests verwenden unter anderem PGlite; sie sind kein nativer
  Postgres- oder Multi-Replica-Nachweis. Der volle HTTP-/DBregressionstest aus
  den historischen Befunden bleibt offen.
- SPIFFEproxy, Cluster, Chromiumcapture und verlorenes Commit-ACK wurden hier
  nicht durchgespielt; keine CI-/Deploymentänderungen oder Kompatibilitätsshims.
- **PCR-PRISM-WORKER-002/-003 bleiben offen:** kumulative Prozess-CPU, tatsächliche
  Browser-/Prozessterminierung, Claimdeadline über sämtliche Abschlussphasen
  und aggregierte Zulassung sind nicht durch diese Behebung gelöst. Begrenzte
  Artifact-HTTPcalls sind kein Beweis tatsächlicher Terminierung.
- Der bestehende Rollback-/Neuausführungspfad ohne bereits gespeichertes Result
  wird nicht als vollständig sichere Recovery externer Seiteneffekte behauptet.
  Ein gemeinsamer interner CAS ist keine attemptbezogene Zugriffskontrolle.

## Exakter Patchumfang für Rootreview

- Neu: `skills/prism/control/worker-evidence.ts`, `worker-results.ts`;
  `skills/prism/server/internal-artifacts.ts`, `worker-artifacts.ts`,
  `worker-attempt.ts`, `worker-operation.ts`;
  `skills/prism/tests/worker-service.test.mts`; diese Implementationsnotiz.
- Geändert: `skills/prism/server/worker.ts` (Executor-/Artifactverdrahtung und
  Auslagerung der bestehenden Operation).
- `skills/prism/server/control.ts` ausschließlich vier Workerhelperimports,
  Entfernung von `WorkerEvidence`/`hydrateWorkerEvidence`, gebundene Annahme/
  Speicherung/Replay in `runWorker` und Austausch der internen Artifactroute.
  Direction-/Präferenzimports und zugehörige HTTP-/SQLhunks gehören zum separaten
  Controlarbeitspaket.
