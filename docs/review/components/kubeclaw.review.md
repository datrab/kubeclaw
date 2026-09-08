# kubeclaw.review — Diffgate, Repositoryaudit und Befundnachprüfung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema Revision7. Abschluss nach Zusammenführung der Gate-/Context-, Policy- und
Auditteilprüfungen; keine Vollständigkeit aus dem eigenen Auditstatus abgeleitet.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

Alle88 Implementierungsmodule unter `skills/nova/plugins/review/src/` vollständig
untersucht. Die [Leseabdeckung](../evidence/review-source-coverage.json) nennt die
konkreten Dateien. Alle50 direkten Testdateien ebenfalls gelesen, mit abgestimmter
Zuordnung im [Testassessment](../evidence/review-tests-assessment.md). Zusätzlich
Manifest, Paketbefehle, README, registrierte Schemas, drei Schemageneratoren und
beide Evaluationsskripte untersucht. Kein eigenes Worker-/Service-/Observerpaket.

Manifest registriert drei Stages: `review`/`kubeclaw.decision.review` → stage.execute,
`repository-audit`/`kubeclaw.audit.repository-review` → executeRepositoryAudit,
`repository-revalidation` → executeRepositoryRevalidation. Rollenmanifest Nova
liefert das Paket. `project/compiler.ts:122–126` ruft das Diffgate nach Lint auf,
mit Implementation-sourceStageId, ownedPaths und Requirements; request_fix geht
zur Implementation zurück. Audit/Revalidation sind eigenständige explizite
Graph-/APIauswahlen, keine automatische Teilnahme an diesem Modulcompilerpfad.
Die Operationsskripte starten/überwachen vorhandene Pipelinegraphen; ihr Review
steht im [Operationsanhang](../operations-and-packaging.md).

## 2. Eingaben, Ausgaben und beide Schnittstellenseiten

Diffgate: geschlossener Task, Base oder Implementationreferenz, erlaubte/Owned-
Präfixe, Requirements, gehashte Evidenz und Contextdeskriptoren. SDK löst die
Implementationrevision; Repositoryadapter friert HEAD mit HMAC-Proof ein und
liefert Changedmanifest, revisionierte Texte, Inventar/Referenzen und Zeilenranges.
Empfänger prüft Head/Manifest-/Textdigest/Bytezahl, nicht nur Typen. Context wird
mit Herkunftstiefe/Scope und Datei-/Bytebudget hydriert, sortiert und höchstens
um eine bekannte ausgelassene Auswahl erweitert. Fehlende Changedfiles verhindern
Review. Import-/Caller-/Test-/Schemaentdeckung ist eine begrenzte Sourceheuristik,
kein vollständiger Sprachcompiler oder Beweis aller Runtimeabhängigkeiten.

Echo erhält unveränderlichen Bundle und liefert Assessments/Vorschläge, kein
StageResult. Parser und Preflight verlangen tatsächliche angebotene/inspizierte
Belege, vollständige Requirements und gebundene Locations. Frische semantische
Verifikation bindet Bundle-, Policy- und Proposalsetdigests; private Objektzertifikate
verbinden Preflight/Reconciliation/Findings/Policy vor der reinen Reduktion.
Diffgate bindet Requests über die vertraute Runtimecapability; Audit vergleicht
zusätzlich exakte Runtime-/Agent-/Modell-/Thinkingattestierung. HTTPbackend vertraut
dem konfigurierten Peer; Digest allein ist keine unabhängige Herkunftssignatur.

Audit plant Repo-/Plugin-/Pathscope, Komponentenslices und begrenzte Beziehungen,
führt ausgewählte Jobs/Expansion/Verifikation aus und schreibt Berichte. Revalidation
liest einen bestätigten Altbericht, bindet Fingerprint/Head/Quellbelege und schreibt
Backlogdispositionen, führt dessen validationCommands nicht selbst aus. Die echte
Scopeproducer-/Repositoryreceiver-Inkonsistenz ist PCR-REVIEW-AUDIT-002.

## 3. Zustand, Persistenz und Nebenwirkungen

Modeldispatch und Git-/Artefaktoperationen ausschließlich über freigegebene
Capabilities. Kein direkter Produktrepo-Write, Deployment oder Notification im
Stagepaket. Diffgate erzeugt Pflichtreport; dessen Writer bestätigt ID, Namespace,
Mediatype, kanonischen Digest, Größe und alle Producer-Attemptfelder. Erst danach
wird der Ref dem StageResult angehängt. Project-summary konsumiert finalen
Reviewbericht und verlangt die ausgewählte Source-Headbindung.

Audit checkpointet Preparedcompilation vor Dispatch, einzelne Job-/Verifikations-
antworten und Follow-up-Zähler vor nächsten Phasen. Core erkennt checkpoint:true
und prüft ArtifactRef vor artifact.created. Artefaktstore/DurableStore besitzen
fsync-/Rename-/Lock-/Replaysemantik; Plugin besitzt keine konkurrierende Persistenz-
implementierung. Revalidation schreibt nur finalen Backlog. Private WeakMaps und
Encoder-/Contentcaches sind RAMzustand, keine dauerhafte Prüfungshistorie.

## 4. Korrektheit und Fehlerdisposition

Diffgate behandelt ungültige Input-/Proof-/Verifikationsdaten geschlossen, hält
unverifizierte Anforderungen von passed fern und lässt Agentenausgabe keine
Kontrollautorität übernehmen. Reducer trennt Blocker, Advisory, Follow-up und
Orchestrator. Governor kontrolliert Core-remediation-Zyklen und Datei-/LOC-/
Ownershipwachstum. Fehlende erforderliche Berichtspersistenz blockiert den
Abschluss. Custompolicy-/Reportdrift ist PCR-REVIEW-POLICY-001.

Audit hat eine konkrete Fehlfreigabe trotz dieser Diffgategarantien: malformed
Jobantwort wird nur incomplete, Completion dennoch passed/all-completed und die
Antwort wiederverwendbar gecacht (AUDIT-001). Revalidation wirft dagegen auch
Transportfehler in eine endgültige Integritätsdisposition (AUDIT-004). Beide
Pfade separat geprüft; keine Übertragung eines grünen Diffgatetests auf Audit.
Sliced-Requirementaggregation bevorzugt violated, danach satisfied vor unverified;
die semantische Vollständigkeit einer solchen Teilbewertung bleibt eine explizite
Verifikationsfrage. Kein zusätzlicher Defekt aus dieser Reihenfolge allein abgeleitet.

## 5. Zeitlimits, Abbruch, Wiederholung und Parallelität

Diffgate wartet sequenziell auf Slices und einen Verifier, besitzt keine eigene
absolute Stagebudgetsteuerung einschließlich Git/Report. Corelease und Runtime
müssen die gesamte Arbeit begrenzen. Audit nutzt Waves bis32, per-job Retries,
phasenweite Admission und Prompt-/Token-/Kostenbudgets. Compilation liegt vor
seiner Dispatchdeadline. Promise.race beendet keine laufende Remoteaktion und
Promise.all bei erster Ablehnung drainiert Geschwister nicht; Fencing/Runtime-
Abbruch und nachlaufende Checkpointversuche bleiben relevante Integrationsgrenzen.
Revalidation verliert zusätzlich gemeinsame Retry-/Joblimits (AUDIT-003).

OpenClaw-Receiver prüft weitergereichte Promptdeadline und exakte Promptgröße;
generischer HTTPbackend liefert nicht automatisch dieselbe Kontrolle. Bekannte
Abbruch-/Workspacedefekte gehören [runtime-dispatch](kubeclaw.runtime-dispatch.md)
und [implementation-agent](kubeclaw.implementation-agent.md). Neue Handlerausführung
ist kein Beleg erneuten externen Sends; Effectreceipts und Sessionrecovery zählen.

## 6. Neustart, Wiederaufnahme und gültige Abschlusspräfixe

Diffgate: vor Reportwrite kein Bericht; Write vor ACK kann bereits Artefakt
hinterlassen; validierter Ref vor Corecommit ist noch keine Recoveryprojektion.
Gemeinsamer Verlust von Resultartefaktprojektionen bleibt PCR-EXEC-002. Governor
liest ältere passende Run-/Stageberichte und blockiert fehlende notwendige
Baseline statt Wachstum neu großzügig zu messen. Nach Restart müssen private
Objektzertifikate aus gevalidierten Inputs neu aufgebaut werden.

Audit: Preparedcheckpoint erlaubt Plan→Execute und späteren Attempt; Jobcache
bindet Quelle/Policy/Modell/Runtime/Evidence, weitere Attempts lesen bestätigte
Checkpointartefakte. Verlorener Modellabschluss vor Checkpoint bleibt ungewiss;
Cachepersistenz nach Antwort allein beweist weder Cost-exactly-once noch Ende
aller Remotechildren. Revalidation hat keine Zwischencheckpointaufnahme. Sämtliche
hier beschriebenen Präfixe sind Code-/Originalfixtureprüfung; kein vollständiger
SIGKILL-/Mehrprozess-/echter Hostwiederanlauf in dieser Reviewkomponente behauptet.

## 7. Authentifizierung, Autorisierung und Evidenzherkunft

Registry erlaubt runtime.dispatch, git.repository.read und artifacts.read/write;
Plugin hat keine Reparaturcapability. Operatorgraph und Settingspolicy sind
vertrauenswürdige Auswahl. Repositoryproof bindet Head/Attempt; Stage kontrolliert
angebotene Belegidentitäten und erzeugt zertifizierte Reduktionsobjekte intern.
WeakMapzertifizierung ist keine kryptografische Grenze gegen kompromittierten
Hostcode. Implizit vertraute HTTPattestierung nicht mit unabhängiger Modellbestätigung
verwechseln. Eine zulässige cross-run Baseline der Revalidation ist absichtlich
möglich und benötigt deren Provenienz-/Autorisierungsvertrag, kein pauschaler Bug.

Quelltext und Auftrag bleiben nicht vertrauenswürdiger Modellkontext. Das Modell
kann falsch urteilen, trotz gültigem Format; unabhängiger Verifier bleibt ebenfalls
semantischer Agent. Semantische Genauigkeit wird nicht aus Digest-/Contracttests
abgeleitet. Collector-Pfadgrenze aus PCR-REPOSITORY-001 wirkt über Runtime; keine
neue identische Befund-ID hier. Rekursive Schemafaktextraktion besitzt keinen
nachgewiesenen allgemeinen Tiefenschutz; der gemeldete Kandidat wurde nicht
reproduziert und bleibt begründete Ressourcenfrage, keine bestätigte Schwachstelle.

## 8. Ressourcen, Cleanup und Retention

Diffbundle höchstens16MiB, begrenzte Context-/Finding-/Evidencecounts; Audit
4MiB/Datei,512MiB initiale Quellen,1M Inventarpfade, phasenweise Tokens/Kosten und
Ausgabereserven. Speicherprüfungen nach JSON/Traversal sind keine harte Heapquote.
Große Preparedartefakte können kleinere Default-Storelimits überschreiten; kein
bestandener Produktions-Scale-/Retentionnachweis. Job-/Reportcheckpointgeschichte
hat keine pluginseitige GC-Policy; zentrale Storelimits/Retention bleiben maßgeblich.

Produzent/Simplification sammelt Regexmatches vor Kürzung; stille Producerauslassung
unterscheidet sich von ausdrücklich gezählten Reportomissions (POLICY-002).
Tiktokenencoder werden pro zwei erlaubten Encodings gecacht; typed interne Graph-
und Cachehelper setzen normale begrenzte Eingänge voraus, sind kein universeller
Getter-/Zyklusvalidator. Tool-/Git-/Modelltermination gehört den Gegenstellen.

## 9. Architektur und Vereinfachung

88 kleine Module bilden mehrere überwiegend getrennte Verträge: Diffgate,
Repositoryaudit, Revalidation, heuristische Navigation und semantische Findings.
Die Trennung Vorschlag→belegte Verifikation→Policyentscheidung ist sinnvoll;
Auditcompletion und Revalidation duplizieren jedoch die Fehler-/Budgetlogik mit
realen Abweichungen. Dauerhafte Prioritäten: gemeinsame kanonische Scopegrenze,
explizite Jobzustands-/Completionreduktion, gemeinsame Budget-/Retryadmission und
einheitlicher Policy-/Reportvertrag. Sourcefakten syntax-/scopebewusst erzeugen,
keine weiteren Regexshims oder rein kosmetische Statuskorrektur.

## 10. Tests, Ausführung und tatsächliche Aussagekraft

[Gesamtsuite](../evidence/review-all-original-tests.txt) scheitert am synthetischen
Million-Line-Compilerbenchmark:52.195ms über45.000ms. Der bereits gestartete
[separate Lauf](../evidence/review-audit-compiler-original.txt) ebenfalls rot mit
47.693ms. Keine kontrollierte Ursachenisolierung; daraus weder genereller
Korrektheitsdefekt noch pauschal bloße Parallelitätsursache behauptet.

13 [Gatebefehle](../evidence/review-gate-original-tests.txt),19
[Policybefehle](../evidence/review-policy-tests.txt) und7
[Auditbefehle](../evidence/review-audit-original-tests.txt) separat bestanden.
Vorherige bestandene Teilbefehle der Gesamtsuite bleiben eng begrenzte Nachweise;
die vollständige Suite ist nicht grün. [Testassessment](../evidence/review-tests-assessment.md)
ordnet alle50 direkten Dateien ein. Stagefixtures konstruieren Runtimeantworten;
Live-function nutzt echten Core/Git/HTTP/Artefaktstore mit festem Peer und Memorylock.
Cachecrashfixture ist Map+Exception, kein fsync-/SIGKILLtest. Qualitycorpus testet
historische feste Werte, kein frisch ausgeführtes Modell. Keine neuen Ersatzmodule.

Sechs Findings unten besitzen Originalfunktions-/Stageproben; diese erhalten reale
Produktimporte, teils die vorhandenen handverdrahteten Testcontexts. Es wurden
keine Live-Modellaufrufe oder CI angefordert. `evaluate:quality --live` wäre ein
separater kosten-/zeitbehafteter Modelllauf und wurde nicht gestartet. Beide
Evaluationsskripte wurden gelesen: lokale Git-/Qualitätsartefaktanalyse, Live-
modus mit eigenem Tempverzeichnis/Retry/Transcriptprüfung; keine neue Deployment-
autorität. Drei Generatoren vergleichen mit --check gegen die echten TSschema-
Exports; diese Prüfungen bestanden in der Gesamtsuite, keine Produktdateien neu
generiert. Paketbuild wurde nicht als ausgeführt behauptet.

## 11. Dokumentationsabgleich

README vorhanden, aber allgemeines fail-closed/all-completed, Retrygrenzen und
Transportfehlerweitergabe gelten nicht für alle drei Stages (AUDIT-001/003/004).
[Scalabilityplan](../../architecture/echo-review-scalability-plan.md) beschreibt
Scope-/Incompletegarantien, die an Originalgegenstellen widerlegt sind. Historische
Phase7-Architektur ist für heutige Auditstage/Reportv2 unvollständig. Inhaltliches
high-confidence bei Simplification ist von heuristischer Erkennung zu trennen.
Operationsheartbeat und gespeicherter Reviewstatus sind Diagnostik, keine autonome
Bestätigung aller hier durchgeführten manuellen Einzelreviews. Keine umfassende
Neufassung dieser Produktdokumente in diesem Auftrag.

## 12. Befunde, Ursachenbehebung und verbleibende Nachweise

Sechs stabile IDs unten; alle Implementierungen unverändert. Teilbegründungen und
vollständige Lese-/Testdetails: [Policyteil](../evidence/review-policy-subreview.md),
[Auditteil](../evidence/review-audit-subreview.md). Offene Laufzeitnachweise sind
Core+Originalstores über Crashpräfixe, tatsächliche Agent-/Verifierqualität,
produktive absolute Deadline/Remotechildcleanup und Source-/Store-Scalegrenzen.
Diese verbleibenden Verifikationen sind getrennt vom abgeschlossenen Code-/
Schnittstellen-/Testreview. Ein gestoppter Teilagent wurde nur nach seinem schon
vorhandenen Übergabestand gefragt; dessen offene Leselücken wurden durch Root und
Testreview geschlossen, keine fehlgeschlagene Sicherheitsprüfung umgangen.

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


### PCR-REVIEW-POLICY-001 — medium — Gültige Custompolicy scheitert erst an erforderlichem Report

**Trigger:** Stagekonfiguration behält built-in `profile: gate`, enthält aber eine vollständige gültige Settingspolicy mit eigenem `policy.profile: custom` (entsprechend dem freien Stable-ID-Vertrag und Resolveroriginaltests mit settings/run).

**Beleg:** `review-policy-contract.ts:92–95,148–150` erlaubt Profilstring/Stable-ID, `review-policy-parser.ts:199–204` liest ihn, `review-policy-resolver.ts:56–75` akzeptiert/selektiert Settingsquelle. Tatsächlicher Aufrufer `stage.ts:119–126` reicht sie durch. `review-report-builder.ts:178` übernimmt `input.policy.policy.profile`, `review-report-contract.ts:33,128–137` akzeptiert nur gate/lean/audit. Builder wirft „built review report is invalid“, `review-report-flow.ts:60–65` übersetzt in report_write_failed/blocked. Eigener Originalfunktionsrepro bestätigt die Producer/Receiverinkompatibilität.

**Auswirkung:** Autorisierte Custompolicy kann einen Reviewversuch nach erfolgter Modelarbeit nicht erfolgreich mit Pflichtreport abschließen; kein Report wird geschrieben. Kein stilles Pass und kein fremder Zugriff.

**Ursachenbehebung:** Entscheiden, ob profile ein freier Settingsname oder ein geschlossenes Verhaltensprofil ist, und dieselbe Semantik in Policyparser, Report-Type, Reportschema und Builder verwenden. Falls nur drei IDs gewünscht, Customwert früh als invalid_policy ablehnen; falls freie Namen beabsichtigt, Reportvertrag erweitern. **Regression:** vollständige Stage mit gültiger Customsettingspolicy bis Pflichtartifact; erwarteten Vertrag sowohl AJV als auch Parser/Builder prüfen. Bestehender Resolver-PASS allein deckt die Endgrenze nicht ab.

### PCR-REVIEW-POLICY-002 — medium — Eigenproduzierte Simplification-Evidenz ist nicht parser- und scopekohärent

**Trigger:** Rechtmäßiger JS/TS-Wrapper mit `$` im Namen, oder zwei gleichnamige lokale Wrapper zum gleichen Target in verschiedenen Scopes derselben Datei. Alternative Fehlklassifikation: passender Wrappertext steht nur in einem Kommentar/String.

**Beleg:** `simplification-fact-producer.ts:13–38` erkennt Rawtext per Regex, akzeptiert `$`/`_`-Symbole und bildet Fact-ID nur aus Pfad+Symbol+Target ohne Scope/Quellposition. `simplification-parser.ts:42–68` validiert symbol via StableIdentifier und fordert einzigartige FactIDs; `review-bundle-values.ts:33–36` verbietet `$` und führendes `_`. `simplification-miner.ts:79–82` verwirft bei einem solchen Parsefehler den gesamten Source und liefert malformed_source, selbst wenn weitere richtige Fakten enthalten sind. Tatsächliche Einbindung `review-preparation.ts:42–49`. Repro: good+$wrap erzeugt zwei Fakten, null Kandidaten; zwei unabhängige Scope-wrapper ebenfalls zwei Fakten, null Kandidaten. Kommentar ghost erzeugt ein high-confidence Fact ohne ausführbare Wrapperfunktion.

**Auswirkung:** Lean-/Audit-Simplification verliert vollständige erzeugte Empfehlungsevidenz bei normalem Quellcode oder sendet irreführende high-confidence Kandidaten. Diagnostic bleibt sichtbar; kein nachgewiesener automatischer Fix oder Gatebypass. Medium wegen deterministischem Verlust einer aktivierten Reviewfunktion, nicht Securitykritikalität.

**Ursachenbehebung:** Sourcefakten aus syntax-/scopebewusstem Analysepfad erzeugen; Symbolfelder müssen gültige Sprachsymbole repräsentieren, stabile FactIDs davon getrennt mit Scope/Positionsidentität bilden; Produzentenresultat gegen eigenen Contract validieren. Kommentare/Strings nicht als Funktionen interpretieren. Producer-Auslassungen explizit diagnostizieren statt nur slice. **Regression:** legal `$`-/`_`-Namen, mehrere lokale gleichnamige Wrapper, Kommentar/String-Decoys und >256 echte Kandidaten; gültige andere Fakten dürfen nicht unbemerkt verschwinden. Nur advisorybezogene Semantik behaupten, bis unabhängige Echo-/Gateketten explizit geprüft sind.

## Exakte Testdateiliste für Gesamtcoverage

Alle unter `skills/nova/plugins/review/`, jeweils vollständig gelesen und Originalskript ausgeführt:

- `tests/review-governor.unit.test.mjs`
- `tests/review-report-contract.unit.test.mjs`
- `tests/review-report-builder.unit.test.mjs`
- `tests/simplification-contract.unit.test.mjs`
- `tests/simplification-miner.unit.test.mjs`
- `tests/simplification-manifest.unit.test.mjs`
- `tests/simplification-fact-producer.unit.test.mjs`
- `tests/echo-review-output.unit.test.mjs`
- `tests/echo-review-verification.unit.test.mjs`
- `tests/review-verdict-policy.unit.test.mjs`
- `tests/review-verified-findings.unit.test.mjs`
- `tests/review-policy-contract.unit.test.mjs`
- `tests/review-invariants.unit.test.mjs`
- `tests/review-policy-resolver.unit.test.mjs`
- `tests/review-policy-profiles.unit.test.mjs`
- `tests/review-reducer.unit.test.mjs`
- `tests/review-decision-matrix.unit.test.mjs`
- `tests/review-contract-parity.unit.test.mjs`
- `tests/review-evaluation-metadata.unit.test.mjs`
