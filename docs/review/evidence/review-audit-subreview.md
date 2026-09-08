# Teilreview kubeclaw.review: Repository Audit, Revalidation und Scale-Ausführung

Baseline `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; ausschließlich lesende Codeprüfung,
Originaltests und zusätzliche lokale Evidenzproben. Keine funktionalen Änderungen,
keine realen Modellaufrufe, Notifications, CI oder Deployments. IDs sind im abschließenden Komponentenbericht unverändert übernommen. Stand: 2026-09-08.

## Tatsächlich vollständig gelesen

Alle folgenden Dateien unter `skills/nova/plugins/review/src/` wurden vollständig
inhaltlich gelesen, nicht nur durchsucht:

- `repository-audit-stage.ts`, `repository-audit-cache.ts`, `repository-audit-results.ts`;
- `repository-revalidation-stage.ts`, `repository-revalidation-contract.ts`;
- `repository-review-profile.ts`, `review-content-cache.ts`;
- `scalable-review-compiler.ts`, `scalable-review-execution.ts`, `scalable-review-jobs.ts`;
- `scalable-review-topology.ts`, `scalable-review-types.ts`;
- `scalable-review-verification.ts`, `scalable-review-verification-evidence.ts`.

Vollständig gelesene direkte Tests unter `tests/`: die acht
`{repository-audit-stage,repository-revalidation,repository-review-profile,review-content-cache,scalable-review-compiler,scalable-review-jobs,scalable-review-topology,scalable-review-verification}.unit.test.mjs`.
Insgesamt 3.477 Zeilen zugewiesene Implementierung und 1.191 Zeilen direkte Tests.

Zusätzliche vollständig gelesene Schnittstellen: Review `plugin.json`,
`review-execution-settings.ts`, `review-prompt-budget.ts`, `review-runtime-attestation.ts`,
`schemas/repository-revalidation-input.schema.json`, `schemas/repository-audit-config.schema.json`;
`skills/nova/plugins/repository-adapter/src/{adapter,revision-reader}.ts`;
`skills/common/plugins/artifact-store/src/adapter.ts`;
`skills/common/plugins/runtime-dispatch/src/{adapter,dispatch-adapter,openclaw-adapter,openclaw-session}.ts`;
`skills/nova/core/execution/artifact-checkpoints.ts`.
`runtime-dispatch/src/openclaw.ts` wurde für den konkreten Dispatch-/Deadline-/Attestierungspfad
238–290 gelesen, nicht als ganzes Modul abgeschlossen. Zugeordnete Dokumentation:
Review-README inhaltlich gelesen; `docs/architecture/echo-review-scalability-plan.md`
75–159 inhaltlich gelesen. Gesamtprüfung der Adapter und Core-Lifecycle bleibt
bei deren Eigentümern; diese Gegenstellenprüfung ist kein Gesamtabschluss dieser Komponenten.

## Kriterien und Grenzen

1. **Verantwortung / Nutzung.** `plugin.json` registriert getrennte Stage-Typen
`kubeclaw.audit.repository-review` und `kubeclaw.audit.repository-review-revalidation`
mit ihren tatsächlichen Exports. Audit plant vollständige ausgewählte Quellmenge,
bündelt Komponenten/Grenzen/Topologie, dispatcht Review und unabhängige Verifikation
und schreibt Berichte. Revalidation liest bestätigte Altfunde und aktuelle Quellen
und schreibt einen Backlog. Beide verwenden nur `runtime.dispatch`,
`git.repository.read`, `artifacts.read/write`; keine Reparaturautorität und keine
Observer-/Nachrichtenregistrierung. Topologie ist Navigation und eigene begrenzte
Evidenz, kein Ersatz für Codebeweise. Tatsächliche Deploymentaktivierung der Stage
ist durch Registrierung allein nicht bewiesen.

2. **Eingaben / beide Seiten.** Scope-/Grad-/Token-/Kostenprofile, Frozen-Head-Proof,
Inventar-Blob-ID/Größe und SHA-256 werden geprüft. Der wirkliche Repository-Adapter
bindet seine HMAC-Proof an Attempt-ID und Head, prüft Scope und erwartete Blob-ID/Größe,
liest Git-Blobs mit fatalem UTF-8-Decoder. An dieser echten Grenze liegt Befund 002.
Review-Antworten werden lokal mit Job-ID/-Digest gekennzeichnet; die normale
Echo-Ausgabe selbst quittiert keinen Job-Digest. Zuordnung vertraut dem aufgerufenen
Runtime-Adapter. Verifikation prüft zusätzlich Bundle-, Policy-, Proposal-Set-Digest,
genau einen Proposal-Key und Quellbeweise. OpenClaw liefert eigene Runtime-Attestierung;
das konfigurierbare generische HTTP-Backend vertraut dagegen dem authentifizierten
Antwortserver. Revalidation bindet Fingerprint/Target-Head/Quellpfad/-Digest/-Zeilenbereich
und erlaubte Beziehungsfingerprints, validiert Abhängigkeitszyklen und verlangt einen
akzeptierten Supersession-Owner desselben Clusters.

3. **Zustand / Commit / Effekte.** Audit persistiert Prepared-Plan vor Modellen,
Job-Cache jeweils nach Antwort, Follow-up-Zählstände vor Phasen und den Endbericht.
`checkpoint:true` wird tatsächlich von Core `artifactFromWrite` erkannt; dort werden
alle Producer-Felder, Digest, Größe, ID, Namespace und Media-Type vor `artifact.created`
geprüft. Artifact-Store schreibt zuerst idempotente Metadatenabsicht, danach Blob;
fehlende Blobs werden beim Lesen nicht als abgeschlossene Artefakte ausgegeben.
Fsync/Verzeichnisdauerhaftigkeit liegen bei den bereits separat geprüften Durable-Stores,
nicht in diesen Stage-Modulen. Revalidation besitzt ausschließlich den finalen
Backlog-Write, keine eigenen Zwischenstände.

4. **Korrektheit / Dispositionen.** Nicht gefundene Quellen, Coveragefehler,
Cacheintegrität und falsche Runtime-Identität blockieren Audit; Transportfehler werden
an Core weitergegeben. Die Lücke zwischen `incompleteJobs` und `integrityIssues`
lässt dennoch fehlerhafte Review-Antworten durch (001). Verifikation hält
`insufficient_evidence` im Eintrag als eigenes Verdict, gruppiert es aber mit `rejected`;
die aggregierten rejected-Fakten sind somit keine reine Widerlegungszahl.
Revalidation reduziert jeden Fehler zu blocked (004).

5. **Deadline / Retry / Parallelität.** Scale-Jobs laufen in Waves bis Concurrency 32,
mit per-job Retries und gemeinsamem Retry-Zähler; Cache-Reads haben 16 Worker und
warten vor Fehlerausgabe auf alle bereits laufenden Reads. Dispatch-Waves verwenden
`Promise.all` und warten bei erster Ablehnung nicht auf alle Geschwister; laufende
Geschwister können noch Checkpoints anfordern. Core-Fencing bleibt Voraussetzung.
Audit setzt eine Phasen-übergreifende Laufzeitdeadline erst nach Compilation und prüft
sie in den Dispatch-Helfern; kein gesamtes absolutes Stage-Claim-Budget wird hier
berechnet. Revalidation reicht dieselbe Deadline als `runtimePromptBudget` weiter,
hat selbst keinen Timeout-Race. **Kein behaupteter unbeschränkter Produktionsdispatch:**
der tatsächliche OpenClaw-Receiver erzeugt daraus ein AbortSignal und prüft es vor
Ergebnisausgabe. Generischer HTTP-Adapter besitzt diese Zusatzkontrolle nicht;
Claim-Deadline/Netzwerk-Abbruch verbleiben bei Core/Adapter. Eigenständiger Defekt der
Revalidation-Job-/Retry-Grenzen ist 003.

6. **Neustart / ungewisse Aktionen.** Audit-Cache erlaubt frühere Attempts desselben
Stages/Runs; Prepared-Plan zusätzlich sichtbare Plan-Stage-Artefakte im selben Run,
was den dokumentierten Plan→Execute-Pfad ermöglicht. Core entscheidet, welche
Dependency-Artefakte überhaupt sichtbar sind. Cache prüft konflikthafte Digests,
Record-/Wertdigest und Runtime-Identität. Bei Prozessverlust vor Cache-Checkpoint
bleibt Modellabschluss ungewiss; Runtime-Dispatch-Idempotenz/Session-Reattachment sind
Adapterverantwortung. Prepared-/Cache-Checkpoint nach Commit und fehlender finaler
Report sind als Präfixe fortsetzbar, sofern Core die `artifact.created`-Projektion
wiederherstellt. Original-MemoryStore-Test modelliert Verlust nach dem ersten Write;
kein echter SIGKILL-/Mehrprozess-/fsync-Nachweis. Fehlerhafte terminale Antworten werden
auch gecacht (001). Revalidation beginnt ohne Plugin-Checkpoint erneut und setzt
lokale Zähler zurück; Backend-Reattachment kann Doppelarbeit begrenzen, wird hier
nicht als bewiesene Recovery beansprucht.

7. **Trust / Autorität.** Keine Quelle oder Finding darf selbst StageResult erzeugen.
Artifact-Proofs sind Integritätsbeweise, keine Signaturen gegen den bereits
privilegierten Artefaktwriter. Prepared-Plan wird nicht rekursiv neu kompiliert:
Vertrauensanker sind geliefertes ArtifactRef und dessen vollständiger Content-Digest;
Unterobjektdigests allein wären dafür nicht hinreichend. Revalidation kann eine
explizite Baseline-Referenz auch aus einem anderen Run lesen, da das ihr Zweck ist;
`get_json` gibt keinen Producer zurück. Es wird kein zusätzlicher kryptografischer
Herkunftsnachweis für einen "bestätigten" Altbericht verlangt. Review-gesteuerte
`validationCommands` sind Text im Backlog, kein Nachweis, dass sie ausgeführt wurden.

8. **Ressourcen / Retention.** 4 MiB/Quelldatei, 512 MiB initiale Gesamtquelle,
1 Mio. Inventarpfade; begrenzte Promptbytes/-tokens, Ausgabe-Reserve, Kosten und
Phasentokenbudget. Revalidation: 128 MiB deklarierter Baseline-Report,
2048 bestätigte Altfunde, 100.000 Relationen, 64 Beleg-/Beziehungs-/Quellobjekte pro
Finding. Byteprüfungen nach `canonicalJson` begrenzen nicht die vorherige Serialisierung.
Typed interne Compiler-/Cache-/Topologiefunktionen sind keine allgemeinen Schutzparser
für zyklische, Getter-, sparse oder extrem tiefe In-Memory-Objekte; Wire-/SDK-Grenze
bleibt Voraussetzung. Keine neuen adversarialen Serializer-Proben durchgeführt.
Artefaktstore besitzt eigene konfigurierbare Objekt-/Gesamtspeicherlimits (Default
16 MiB Objekt, 256 MiB Store, 100.000 Records), die erheblich kleiner als Audit-
Quellobergrenzen sein können. Prepared-Plan/Report müssen auch tatsächlich hineinpassen;
kein End-to-End-Storage-Scale-Nachweis. Keine lokale Retention-/GC-Routine in Review.

9. **Architektur / Vereinfachung.** Allgemeine Dispatch-/Budget-/Checkpoint-Helfer
sind für Audit vorhanden, Revalidation dupliziert deren Ablauf teilweise und verliert
dabei Retry-/Jobgrenzen und Fehlerklassifikation. Dauerhafte Vereinfachung ist eine
geteilte Dispatch-Transaktion mit expliziten Ergebnisdispositionen und Checkpoints,
nicht zusätzliche lokale Guards an jeder Stage. Scope muss an einer gemeinsamen
kanonischen Pfadgrenze normalisiert werden.

10. **Tests / Aussagekraft.** Siehe Befunde und Testprotokolle unten. Alle acht
Original-Testdateien wurden ganz gelesen. Die Proben fügen nur Fixture-Aufrufe unter
`docs/review/evidence/` hinzu; sie ersetzen keine importierten Produktmodule. Zwei
Proben übernehmen die vollständigen Original-Stage-Teststatements, ändern nur die
Importpfade und hängen zusätzliche Assertions an. Eine dritte ruft den echten
Repository-Adapter gegen die unveränderte Arbeitskopie auf. Kein echter Modell-
Qualitäts-, Mehrprozess-, Crash- oder Infrastrukturtest.

11. **Dokumentation.** Scalability-Plan: Aussagen zu Fail-closed bei malformed/incomplete
(86,149) widersprechen 001. Scope-Unterstützung (149) widerspricht der tatsächlichen
Producer-/Receiver-Normalisierung (002). README beschreibt die gewünschte Trennung
zwischen Policy-Deferral und semantischer Unvollständigkeit (61–64); das rechtfertigt
kein `all-requested-work-completed` für malformed Antworten. Die generelle Aussage
"Runtime and transport failures propagate to core" trifft auf Revalidation nicht zu.
Veraltete/zu breite Aussagen statt fehlender Dokumentation. Keine vollständige Suche
nach jedem möglichen separaten Betriebsdokument als Vollständigkeitsbeweis.

12. **Unsicherheit / Folgeschritte.** Nachfolgende Defekte sind konkret reproduziert.
Restliche offenen Grenzen sind oben ausdrücklich keine bewiesenen Defekte. Für eine
Gesamtabnahme fehlen echter StageExecutor+ArtifactStore-Präfix-/Restarttest und
Live-Runtime-/Deploymenttrace; keine CI-/Produktionsaktion dafür ausgeführt.

## Übernommene Befunde

### PCR-REVIEW-AUDIT-001 — Malformed Review wird als vollständig bestanden berichtet und erneut gecacht

**Hoch; nachgewiesener Defekt.** Eigentümer `kubeclaw.review`.
`scalable-review-execution.ts:40–44` gibt beim letzten Versuch auch unvollständiges
Parsed-Result zurück; `scalable-review-verification.ts:141–174` schreibt diese Fehler
nur nach `incompleteJobs`; `repository-audit-stage.ts:422–425` blockiert nur
`integrityIssues`. `runRepositoryAudit` setzt Primary-/Selected-Follow-up completed
auf alle Jobs und failed auf 0; `repository-audit-results.ts:64–89,178–180` macht daraus
`all-requested-work-completed`, unabhängig von den separat ausgewiesenen incomplete IDs.

Auslöser: ein komponentenweiser Runtime-Call liefert korrekt attestiert `{garbage:true}`,
Retries sind ausgeschöpft (Probe: `maxRetries:0`). Ergebnis: `passed`,
`review.repository_incomplete_jobs=1`, `review.repository_completeness_state=all-requested-work-completed`.
Keine Policy-Deferral liegt vor. Der Cache schreibt diese unbrauchbare Antwort;
ein weiterer Attempt mit unverändertem Profil übernimmt sie und dispatcht nicht erneut.
Die Scope-Coverage behauptet damit eine abgeschlossene Prüfung, obwohl keine gültige
Reviewantwort vorliegt. Die Existenz einer separaten incomplete-Zahl mildert die
Auswirkung für sorgfältige Leser, repariert den falschen Completionstatus aber nicht.

**Beleg:** `review-audit-malformed-probe.mjs` und `.txt`, Assertions auf beide Attempts;
Original-Verifikationstest erwartet bereits `incompleteJobs` bei fremdem Belegdigest,
prüft aber keinen Stage-Completionstatus dafür.
**Ursachenbehebung:** obligatorisch unvollständige Selected-Jobs getrennt von bewusst
zurückgestellten Context-Jobs behandeln und vor Endbericht blockieren; ungültige
terminale Outputs nicht als erfolgreiche wiederverwendbare Cache-Werte checkpointen.
Completion aus tatsächlich zertifizierten Resultaten ableiten.
**Regression:** echte Audit-Stage mit malformed Output nach letztem Retry, falscher
Evidence und erneutem ContextRequest in der Expansion; jedesmal kein vollständig
bestandenes Report. Anschließender Retry darf gültigen Reviewer erneut verwenden.

### PCR-REVIEW-AUDIT-002 — Automatisch erzeugter Plugin-Scope wird vom echten Repository-Adapter abgewiesen

**Hoch; nachgewiesener Defekt.** Eigentümer `kubeclaw.review` für den Producer.
`repository-review-profile.ts:197–209` erzeugt Plugin- und Dependency-Präfixe immer mit
abschließendem `/`. `repository-audit-stage.ts:197–201` übergibt sie unverändert an
`inventory_revision`. Receiver
`skills/nova/plugins/repository-adapter/src/revision-reader.ts:29–35,75–93,254–257`
ruft `repositoryRelativePath` auf, das leere Pfadsegmente einschließlich des Endsegments
verbietet. Alle regulär erzeugten Plugin-Scopes scheitern vor Inventarisierung;
manuell übergebene Path-Scopes mit Slash ebenfalls. Revalidation teilt denselben
Profile-/Compilerpfad und ist entsprechend betroffen. Repository-Scope `.` ist nicht betroffen.

**Beleg:** `review-audit-scope-probe.mjs` + `.txt`: tatsächliches `activate` des
Repository-Adapters, tatsächliche Frozen-Head-Operation, anschließend Stage-Plan mit
Plugin-Scope `review` bzw. Path-Scope `skills/nova/plugins/review/`; beide verlässlich
`REPOSITORY_PATH_FORBIDDEN`. Der Probe-Fence ist lokal, alle Repository-Leseoperationen
stammen aus Originalimplementierung. Originalprofiletests erwarten gerade die
Slash-Präfixe; Stage-Tests mocken den Adapter und übersehen dessen Ablehnung.
**Ursachenbehebung:** gemeinsame kanonische Scope-Normalisierung (kein abschließender
Slash außer zulässigem Root-Sentinel); Profile und Receiver müssen denselben Vertrag
verwenden. Eingaben früh validieren, ungültige User-Scopewerte nicht als transienten
Infrastrukturfehler weiterreichen.
**Regression:** Audit `plan` und Revalidation mit Plugin-Scope Radius 0/1 gegen echten
Repository-Adapter in temporärem Git-Repo; sicherstellen, dass nur korrekte Präfixe
ins Inventar gelangen. Pfad-Scopes mit/ohne terminalem Slash und verbotenen Segmenten
explizit vertraglich festlegen.

### PCR-REVIEW-AUDIT-003 — Revalidation ignoriert konfigurierte Job- und gemeinsame Retrygrenzen

**Mittel; nachgewiesener Defekt.** Eigentümer `kubeclaw.review`.
`repository-revalidation-stage.ts:187–201,301–318` verwendet ausschließlich per-job
`maxRetries` und Concurrency und dispatcht jeden In-Scope-Fund. Das Profil enthält
`maxRetryAttemptsPerPhase` und `maxVerificationJobs`, doch beide gelangen weder in
die Loop noch in `ReviewDispatchBudget`; dessen Limits schützen Tokens/Kosten,
nicht Job-/Retryzahlen. Zusätzliche reale Modellarbeit kann die zugesagte Zahl
überschreiten, solange die anderen Limits noch Kapazität haben.

**Beleg:** `review-audit-revalidation-probe.mjs` + `.txt`: bei gemeinsamer Retryreserve
0 und `maxRetries:1` führt ein transienter Erstfehler zu zwei Calls und passed;
bei `maxVerificationJobs:1` werden zwei verschiedene In-Scope-Fingerprints verarbeitet
und passed zurückgegeben.
**Ursachenbehebung:** Revalidation an dieselbe phasenweite Retryadmission und explizite
Jobauswahl binden; entweder deterministisch zurückgestellte Fingerprints mit
Unvollständigkeitsstatus berichten oder vor Dispatch einen klaren Budgetfehler liefern.
**Regression:** beide reproduzierten Fälle in echter Stage; bei parallel fehlschlagenden
Jobs gemeinsame Retryreserve atomar verbrauchen und niemals mehr Calls zulassen.

### PCR-REVIEW-AUDIT-004 — Revalidation verwandelt temporäre Infrastrukturfehler in endgültigen Integritätsblock

**Mittel; nachgewiesener Defekt auf Stage-Grenze.** Eigentümer `kubeclaw.review`.
`repository-revalidation-stage.ts:336–340` fängt jeden Fehler und erzeugt
`kubeclaw.review.repository_revalidation_incomplete`. Erschöpfte Transport-/Storage-
Fehler unterscheiden sich damit für Core nicht von einer completed malformed Antwort.
Der vergleichbare Auditpfad unterscheidet diese bewusst (Funktionen `auditDispatch` und `executeRepositoryAudit` in
`repository-audit-stage.ts`) und lässt
Infrastrukturfehler durch, damit Core die Attemptpolicy ausführt.

**Beleg:** `review-audit-revalidation-probe.mjs` + `.txt` liefert für
`runtime.dispatch` eine lokale Exception `transport unavailable` mit `maxRetries:0`;
Stage resolves zu `blocked`, statt zu rejecten. Das Original-Audit-Testprogramm
assertiert dagegen `rejects` für `reviewer unavailable`. Es wird keine automatisch
erfolgreiche Core-Recovery behauptet; der Verlust der Disposition ist direkt bewiesen.
**Ursachenbehebung:** eigene Integritäts-/Inputfehlerklasse und selektiver Catch;
Transport-/persistente Infrastrukturfehler unverändert zu Core propagieren. Bei
Wiederaufnahme explizite Revalidation-Checkpoints statt stiller vollständiger Neuberechnung
vorsehen, sofern Resume zugesagt wird.
**Regression:** gleiche valide Baseline mit unavailable Runtime, fehlgeschlagenem
Artifact-Read/Write und completed malformed Modellantwort; nur der letzte Fall soll
einen Integritätsblock erzeugen. Core-Test soll tatsächliche begrenzte Attemptwiederholung
für den Transportfall belegen.

## Ausgeführte Tests und Evidenz

`review-audit-original-tests.txt`: sieben unveränderte Einzelbefehle
`node tests/<name>.unit.test.mjs`, jeweils Exit 0; Namen wie oben ohne Compiler.
Die zwei erweiterten Stageproben liefen vollständig samt Originalassertions mit Exit 0;
der echte Adapter-Scope-Probe ebenfalls Exit 0. `.mjs`-Dateien sind ausschließlich
zusätzliche lokale Evidenz, keine geänderten Produktmodule oder CI-Tests.

Der Komponentenverantwortliche führte `npm test` unverändert aus. Sein Lauf scheiterte
in `scalable-review-compiler.unit.test.mjs:91`: gemessene 52.195 ms über der 45.000-ms-
Fixturegrenze bei paralleler Reviewlast. Die Assertion misst die Compilerzeit einer
synthetischen Million-Zeilen-Fixture, nicht Ergebnisrichtigkeit und nicht Ressourcen
pro echtem Agent-Versuch. Der separate unveränderte Rerun endete ebenfalls mit Exit 1: 47.693 ms über 45.000 ms
(`review-audit-compiler-original.txt`). Beide Fehlschläge bleiben sichtbar. Daraus wird
ohne kontrollierte Last-/Hardwaremessung kein eigenständiger Korrektheitsdefekt abgeleitet.

Nicht ausgeführt: Live-Terra/OpenClaw, CI, echter Crash, externer Persistent-Store-
Scale- oder vollständiger Core-Claim-Deadline-Test. Kein Test wurde durch eine
Ersatzimplementierung oder funktionale Codeänderung grün gemacht.

Untersuchung auf Anweisung Root beendet. Keine weiteren optionalen Proben oder Tests.
