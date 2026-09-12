# nova.test-gates — Planauflösung und Remote-Gate-Steuerung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Alle zehn Implementierungsdateien (1.994 Zeilen), relevante direkte Gegenstellen
und die unten bezeichneten Tests untersucht. Abschluss ist kein Produktions-
oder vollständiger Prozessrestartnachweis.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

`skills/nova/core/test-gates/` enthält zwei verbundene Bibliotheksaufgaben:
Deklarationen zu unveränderlichen Testplänen auflösen sowie bereits aufgelöste
Pläne mit signiertem Gitarchiv an Buster senden und dessen Fakten importieren.
`core/src/index.ts:55–104` exportiert die Funktionen. `remote-gate-cli.ts` ist
ein eigener ausführbarer Einstieg; `production.ts` komponiert denselben Pfad.
Der registrierte `nova/plugins/remote-test-gate/src/adapter.ts:76–93` ruft diese
Produktionskomposition für `test.plan.execute` auf. Seine Konfiguration und
Grants-/Repositoryprüfung wurden als Gegenstelle gelesen; eigenes Pluginreview
bleibt separat.

Der Resolver hat am Prüfstand außerhalb seines Exports keine direkten
Produktaufrufer im untersuchten Repository: Aufrufe stehen in Verification/
Preflight-Programmen, darunter `check-project-compiler.mts:34–46`. Der
Projektcompiler bekommt den bereits aufgelösten Providerplan. Daher aktive
Remote-Ausführung und verfügbare, bisher von Tests/Preflights aufgerufene
Resolver-API unterscheiden; keine automatische Suiteauswahl im Core behaupten.

Buster-Service, HTTP, Runner und Capabilityruntimes sind eigene Komponenten.
Hier wurden HTTP-Routen vollständig und Service-Admission, Identitätsprüfung,
Result-/Evidencezugriff, Cancel und Recovery als Empfängerseite untersucht.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

`pipeline.ts` akzeptiert den Dateinamen `pipeline.json`, einen Projektstring und
exakt einen Modul-/Gatescope. Der Loader selektiert suites/tests/fixtures/
concurrencyLimits; andere Projektfelder prüft er nicht. Die separate Lint-
Deklaration verlangt `kubeclaw.lint.full`, Policyprojekt und mindestens einen
Manifest-/Chartpfad. Vollständige Projektvalidierung ist nicht sein Auftrag.

`resolver.ts:433–475,718–749` validiert Policy, Fakten, IDs, Datum und Scope.
Alle Katalogvorlagen werden geprüft, nur explizite Auswahl wird expandiert.
Providerdefaults folgen nach Suite-/Projekt-/Matrixmerge; Konfiguration wird
gegen das tatsächliche Providerschema geprüft. Version, Paketdigest,
Registrydigest, Template-Digest und Configschemadigest stehen im Plan.

`connectGraph:625–691` kontrolliert beide registrierten Ports: Value-Schema muss
identisch sein, Artifact-Medientyp muss in beiden Ports vorkommen; erforderliche
Inputs fehlen nicht stillschweigend. Links erzeugen exakt Passed-Abhängigkeiten.
Matrixquellen mit mehreren Varianten bleiben absichtlich mehrdeutig und werden
abgelehnt. Zyklus-, Selbst-, Kollisions- und Referenzprüfungen folgen vor der
Vertragsvalidierung und dem rekursiven Freeze. `inputs.*.schemaId` ist kein
zulässiges Deklarationsfeld; siehe [PCR-TEST-CONTRACT-002](contract.test-gate.md).

`createRemotePlanJob` bindet Plan, Stage, Signatur, Base64archiv, Grants und
Idempotenzschlüssel. Buster prüft in `remote-plan-service.ts:94–116,409–449`
Signatur/Authority, Job-/Plan-/Requestdigest, installierte Provideridentität und
Capabilityallowlist erneut. Status enthält eine begrenzte Resultreferenz;
`remote-plan-http.ts:112–153` und Novas Transport stimmen bei POST/GET/DELETE,
URL-kodierten IDs sowie Result-/Evidence-Digestpfaden überein.

`remote-result-import.ts:100–164` bindet Result an Job, Plan, Run, exakte
Knotenmenge, Provider, Scope, Execution/Testidentität und Modus. Versuche müssen
fortlaufend sein, das Retrymaximum und den finalen Nodezustand einhalten;
Vertragsvalidatoren prüfen Digests/Receipts. Evidence wird nach Job/Digest
abgerufen, nicht über Busters lokale `file:`-URL. Buster prüft Zugehörigkeit,
kanonischen Jobpfad, reguläre Datei, Größe und Digest; Nova wiederholt Größe/
Digest und dedupliziert widersprüchliche Größen nicht stillschweigend.

## 3. Zustand, Persistenz und Nebenwirkungen

Git-Snapshotaufbau liest ausschließlich den aufgelösten Commit/Tree, erzeugt
`git archive --format=tar.gz` und signiert die Archivbindung mit Ed25519.
Kein Commit, Workspaceumbau oder Providerstart durch den Resolver.

`remote-dispatch.ts:63–115`: zuerst ganzer Job einschließlich Archiv in
FileDurableRecordStore, danach Archivblob. `load` stellt einen fehlenden Blob
aus dem kanonischen Record wieder her. Der doppelte Archivinhalt ist damit
bewusst Teil des Recoverypfads, aber Speicher- und Kopieraufwand.

Import: erst vollständiger Download/Verifikation, dann `pending_evidence`,
Blobpersistenz, CAS-Transition zu `complete` (`remote-result-import.ts:225–264`).
Nur vollständige Records erzeugen in `readExecutionGraphs:218–224` die
Testgraphprojektion. Es gibt keine separat autoritative `execution-graph/`-
Datei mehr. Gleicher Job mit verändertem Source/Request/Result/Decision/Evidence
wird abgelehnt. Fremde laufende Jobs werden nicht überschrieben.

## 4. Korrektheit und Fehlerbehandlung

Policy unterscheidet blocking/advisory, echte Execution-/Cleanuperrors,
deterministische Reportfehler und ausdrücklich angeforderte Agentbewertung.
Executionerror hat Vorrang vor Reviewbedarf und fachlichem Fail. Skipped Nodes
blockieren nicht, Fixtures erhalten keinen Testmodus. Agentreview beginnt hier
nicht selbst; das Ergebnis enthält eine Reviewanforderung.

HTTP 408/425/429/5xx und Fehler vor Empfang der Antwortheader sind retryable;
404 kann nach verlorenem Submit zur erneuten identischen Submission führen.
Body-Lesefehler liegen außerhalb des Fetch-catch und sind nicht einheitlich als
Transportfehler normalisiert. Externe Abbrüche werden im äußeren Dispatcher-
catch erkannt; interne Deadlines nicht auf jedem Pfad (PCR-NOVA-GATE-001).
Keine festgestellte Möglichkeit, einen widersprüchlichen Resultdigest durch die
Produktionskomposition als bestandenen Gateentscheid zu importieren.

## 5. Zeitlimits, Abbruch, Wiederholung und Parallelität

Resolver setzt pro Node Timeouts, Ressourcenobergrenzen, Matrix-/Nodeanzahl,
Concurrencygruppen und Retryregeln. Retry-safe hat standardmäßig einen Retry,
unsafe null zusätzliche Versuche; explizite Risikoannahme ist für unsafe Retry
nötig. Die tatsächliche Ausführung dieser Grenzen gehört zum Busterreview.

Dispatcher startet seine Uhr nach der lokalen Persistenz und übergibt jeder
Submit-/Statusoperation die verbleibende Zeit. Cancellation nutzt separat bis
zu zehn Sekunden. Ein äußerer Callerabort kann den Cancelpfad doppelt durchlaufen.
Die Deadline endet jedoch am Dispatch; Import und synchroner Gitaufbau sind
nicht eingeschlossen (PCR-NOVA-GATE-002). Der Adapter reicht das Stage-Abortsignal
weiter, die CLI erzeugt selbst kein solches Signal.

Ein verlorenes ACK führt zum gleichen Job, nicht zu einer neuen Jobidentität.
Originaltests prüfen gleichzeitige identische/widersprüchliche Einreichungen
und getrennte parallele Jobs. `abortableDelay:141–149` entfernt seinen
Abortlistener nach normalem Timerablauf nicht: ungeprüfter Langzeit-
Ressourcenverdacht, bei langen Pollingläufen Listeneranzahl messen.

## 6. Neustart und teilweise abgeschlossene externe Aktionen

Persistenz vor Submit erlaubt erneutes Verbinden nach Novaabbruch. Dieselbe
Produktionsanforderung muss denselben Commit, submittedAt, Plan und Schlüssel
behalten; bewegliches HEAD erzeugt einen Konflikt, keinen unsichtbaren Austausch.
Buster startet accepted-Aufträge nach erneuter Autorisierung; laufende Aufträge
werden bei Recovery explizit failed, cancelling wird cancelled. Kein blindes
Wiederholen unbekannter Providernebenwirkungen.

Gültige Importpräfixe: fehlender Dispatchblob ist aus Jobrecord rekonstruierbar;
pending_evidence wird nicht als Graph/Passed freigegeben; erneuter vollständiger
Import kann fehlende Blobs schreiben; complete ist selbst Projektionsquelle.
Der Importer lädt auch bei bereits vorhandenem Complete zuerst wieder vom
Remote-Service. Offline-Reimport nach Löschung des Remotejobs ist deshalb
nicht automatisch durch `NovaRemoteTestGate.execute` verfügbar; persistierte
Fakten bleiben über `readExecutionGraphs` lesbar. Dokumentation muss diese
Grenze unterscheiden. Kein tatsächlicher Crash an jedem Importpräfix ausgeführt.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

Produktionsfactory verbietet Nicht-Loopback-Klartext, Credentials in URL und
andere Protokolle. Der niedrigere HttpTransport erlaubt bewusst HTTP auch
außerhalb Loopback; Produktionsaufrufer müssen die Factory verwenden.
Bearer benötigt mindestens 32 Zeichen; Buster vergleicht konstante Länge und
Bytes zeitkonstant. SPIFFE-Modus verlangt lokalen Proxy, am Empfänger passende
verifizierte Peer-ID und Loopbackpeer. IPv6loopback wird am Nova-Transport falsch
abgelehnt (PCR-NOVA-GATE-003). Proxyidentität/TLS-Konfiguration bleiben
Infrastrukturannahmen, kein Infrastrukturreview.

Runtimeconfig lädt getrennt benannte Token-/Private-Key-Umgebungswerte, prüft
Ed25519 und positive Größen. Keine Schlüssel in Reviewdateien. API-/CLIplan und
Repository sind privilegierte lokale Eingaben; der registrierte Adapter prüft
zusätzlich kanonische Repositorywurzeln, Runbindung und exakte Grantknoten.
Runtimeconfig interpretiert unbekannte authentication-Werte als bearer;
Operatorfehlkonfiguration wird damit nicht so strikt abgelehnt wie unbekannte
Felder. Kein nachgewiesener Authentifizierungsbypass daraus.

## 8. Ressourcen, Aufräumen und Aufbewahrung

Streamleser begrenzen Bytezahl vor vollständigem Concat und kontrollieren
Content-Length. Result und Evidence haben getrennte Downloadbudgets. Import
hält alle eindeutigen Evidencebuffer bis zur Persistenz im Speicher; Bytebudget
ist vorhanden, parallele Gateaufrufe multiplizieren den Bedarf. Frühe Ablehnung
zu großer Content-Length cancelt den Body nicht explizit; offener Cleanupnachweis.

Matrixkartesisches Produkt wird erst nach jeder flatMap-Erweiterung gegen das
Maximum geprüft, Gesamtnodegrenze erst nach aller Expansion. Sehr große lokale
Deklarationen können vor Ablehnung viel Speicher beanspruchen. JSON-Merge,
Freeze und Graph-DFS sind rekursiv; keine gemessene sichere Eingangstiefengrenze.
Gitbefehle sind synchron ohne Timeout/Signal, mit festem 160-MiB-maxBuffer;
Archivmaximum wird nach dem Archivbau geprüft. Diese Operator-/Eingangsgrenzen
nicht mit bereits erzwungenen Providerlimits verwechseln.

Archive-/Evidence-Storegesamtlimits sind falsch verdrahtet (PCR-NOVA-GATE-004).
Recordlimits begrenzen separat Records, aber ersetzen keine Blobgesamtquote.
Keine GC-/Aufbewahrungsstrategie hier; zentrale Folgefrage
[PCR-OBS-002](foundation.observability.md). Speicher braucht lokale fsync-,
Hardlink- und Locksemantik der Foundation; deren Befunde gelten unverändert.

## 9. Architektur und Vereinfachungsmöglichkeiten

Planauflösung, Authentisierung, Ausführung und Gatepolicy sind klar getrennt.
Die vorhandenen Originalinterfaces sollten erhalten bleiben, aber eine einzige
absolute Operationsdeadline sollte über alle Phasen laufen. Cancelentscheidung
gehört an eine gemeinsame Abschlussstelle. Storequoten sollten explizite
Einzelobjekt-/Gesamtparameter verwenden; keine weiteren Wrapper zur Kaschierung.

Importgraph direkt aus Complete-Records reduziert eine frühere zweite
Persistenzautorität. Den überholten Restarttest und Dokumentation daran
anpassen, keine obsolete Projektionsdatei zur Testbefriedigung wieder einführen.
Resolver-Canonicalisierung überschneidet sich mit Vertragsserialisierung;
eine spätere Vereinheitlichung muss exakte Template-Digests erhalten.

## 10. Tatsächlich untersuchte Tests und Nachweise

Vollständig gelesen und unverändert lokal ausgeführt, alle Exit 0:

- `check-pipeline-test-suite-resolver.mts` (511 Zeilen): echte Discovery/Registry/
  Resolver mit synthetischen Providerdeklarationen, keine Providerexecution;
  positiver Plan und negative Fälle einschließlich der 17 historischen Fixes.
- `check-pipeline-remote-plan-runtime.mts` (397): echte HTTP-Server, Archive,
  Stores, Auth, Konkurrenz, Reconnect, Cancel und getrenntes Result. Registry und
  execute-Funktion sind vorhandene Testfixtures; kein echter Providerlauf.
- `check-pipeline-remote-result-import.mts` (215): Originalimport/-store und
  Policy, synthetische Transport-/Resultfixtures, sieben Entscheidungen und
  widersprüchlicher finaler Attempt. Keine echte Netzwerkstörung in diesem Test.
- `check-pipeline-remote-runtime-config.mts` (139): echte Key-/Configvalidierung
  und Busterstart/-stop; kein externer Capabilityaufruf.

Befehle/Resultate: [nova-test-gates-tests.txt](../evidence/nova-test-gates-tests.txt).
Committed-Source-Snapshotprüfung bereits im Vertragsreview vollständig gelesen
und bestanden; Original-Gitarchiv/Signatur, keine Workingtree-Ersatzarchive.

`check-pipeline-remote-process-restart.mts` (257) vollständig gelesen, nicht
erneut ausgeführt: echte Providerisolation ist durch den dokumentierten
Launcher-/EPIPE-Blocker belastet. Zusätzlich veraltete Projektionsassertion
PCR-NOVA-GATE-005. Kein bestandener Restartlauf behauptet.

Zusatzproben nutzen Originalcode: reale Loopback-Fehlerproxyverbindungen zeigen
fehlendes Cancel und ungebundenen Import; vorhandener synthetischer
Service-Executor bleibt ausdrücklich Testfixture. Originalresolver mit realer
Busterregistry lehnt zwei Originalbeispiele ab; Originalconstructor lehnt IPv6
ab. Zwei echte signierte Gitarchive überschreiten die konfigurierte Gesamtquote.
Keine Produktdatei oder Schutzgrenze verändert. Cluster-/Browser-/Agent-
Preflights und umfassende Projekt-E2E bleiben Folgeauftrag.

## 11. Dokumentation und historische Befunde

Phase-4-Audit mit allen 17 aufgeführten Resolverfixes an Code/Originaltest erneut
abgeglichen: entsprechende Prüfungen vorhanden, lokaler Test besteht. Seine
Legacy-progress.json-/zukünftige-Phase5-Aussagen sind historisch, keine aktuelle
Betriebsanleitung.

Phase-7-C/D/Final-Audits erneut gelesen. Bounded Statusreferenz, Evidenceimport,
identische Submission und Sourcebindung bestehen die untersuchten Prüfungen.
Die pauschale Aussage Cancel bei Timeout ist durch PCR-NOVA-GATE-001 widerlegt.
Die frühere separate Graphpersistenz wurde inzwischen entfernt; der behauptete
Prozessnachweis gilt nicht unverändert für die aktuelle Testdatei. Phase7-Ds
Wiederaufnahmebeschreibung lässt die erneute Remoteabhängigkeit und fehlende
Importdeadline aus. `production.ts`-Kommentar nennt noch Legacy-Authorityauswahl,
obwohl die Komposition keine solche Auswahl mehr enthält.

Dokumentationsstatus: unvollständig und teilweise veraltet. Für spätere
Produktdokumentation: tatsächlicher Resolveraufrufer, absolute Deadline,
Cancelbestätigung bei Kommunikationsverlust, Importwiederaufnahme ohne Remote,
Storequoten/Retention und aktuelle Restartnachweise explizit darstellen.

## 12. Befunde, Ursachenbehebung und verbleibende Unsicherheiten

### PCR-NOVA-GATE-001 — Timeout nach verlorenem Submit lässt Job laufen

**Mittel; nachgewiesener Defekt.** Remote-Arbeit kann trotz lokalem Timeout
weiter Ressourcen und externe Aktionen beanspruchen; kein genereller Datenverlust.
Belege: `remote-dispatch.ts:188–202,215–230`; Gegenstelle
`buster/engine/test-gates/remote-plan-service.ts:505–519` cancelt nur auf Anfrage.
Buster nimmt POST an, Proxy verwirft Submit-/Statusantworten, Deadline läuft aus:
Zeile 200 wirft ohne Cancel, äußerer catch prüft nur Callerabort. Originalprobe
zeigt `running`, `NOVA_REMOTE_PLAN_TIMEOUT`, **0 DELETEs**.
Ursache beheben: ein gemeinsamer zeitbegrenzter Cancel-/Reconciliationabschluss
für jeden Deadline-/Abortpfad, unbekannten Remotestatus sichtbar halten.
Regression: echter Service und verlorene Antworten wie
[nova-remote-timeouts.mjs](../evidence/nova-remote-timeouts.mjs), danach Cancel-
Anfrage und terminales Ergebnis nachweisen; zusätzlich Timeout während Bodylesen.

### PCR-NOVA-GATE-002 — Gate-Zeitlimit endet vor Ergebnisimport

**Mittel; nachgewiesener Defekt.** `NovaRemoteTestGate.execute` kann über timeoutMs
hinaus hängen; CLI hat keine äußere Stageuhr. Belege: `remote-result-import.ts:
285–312,330–333`, `production.ts:60–73`, `remote-gate-cli.ts:29–35`.
Nach Completedstatus hält der reale Proxy GET results offen. Bei 300 ms Limit
ist die Operation nach 900 ms weiter pending; nur zusätzlicher Callerabort
beendet sie. Synchrone Archivkonstruktion liegt ebenfalls außerhalb der Uhr,
aber dafür wurde kein Laufzeithänger provoziert.
Ursache beheben: absolute Deadline vom Eintritt bis einschließlich Import und
Persistenz; abbrechbare, begrenzte Gitprozesse. Bereits abgeschlossene Remote-
Arbeit bei Importabbruch über dauerhaften Importzustand wieder aufnehmen.
Regression: ursprünglicher HTTP-/Importpfad mit verzögerten Result- UND
Evidenceantworten muss innerhalb Deadline plus dokumentierter Cleanupfrist enden.

### PCR-NOVA-GATE-003 — IPv6loopback im SPIFFE-Modus fälschlich abgelehnt

**Niedrig; nachgewiesener Defekt.** Ausschließlich legitime IPv6konfiguration
blockiert, kein Autorisierungsbypass. `remote-dispatch.ts:251–253` vergleicht
URL.hostname mit `::1`; Node liefert `[::1]`. Dieselbe Prüfung im
`remote-test-gate/src/adapter.ts:51–53`; zentrale Zuständigkeit hier.
Originalconstructor mit `http://[::1]:8080` wirft NOT_LOOPBACK, obwohl
`secure-endpoint.ts` diesen Loopback akzeptiert.
Ursache: konsistente kanonische Loopbackklassifikation an beiden Grenzen.
Regression: Originalfactory/Adapter mit IPv4, IPv6, localhost und Nichtloopback;
Proxyvertrauen nicht erweitern. [Probe](../evidence/nova-resolver-examples.mjs).

### PCR-NOVA-GATE-004 — Storegesamtquote als Einzelbloblimit übergeben

**Mittel; nachgewiesener Defekt.** Konfigurierte Archiv-/Evidence-Gesamtbudgets
begrenzen den Store nicht; mehrere unterschiedliche Blobs können sie übersteigen.
Belege: `remote-dispatch.ts:77`, `remote-result-import.ts:216`; Empfänger
`common/plugin-runtime/foundation/observability/durable-records.ts:213–228,261`:
Gesamtquote ist dritter optionaler Parameter, Nova setzt nur den zweiten.
Zwei echte Gitarchive im Original-Dispatchstore überschreiten die konfigurierte
Gesamtquote; [Messung](../evidence/nova-archive-budget.txt),
[Probe](../evidence/nova-archive-budget.mjs). Evidencepfad identischer
Constructorfehler durch Code nachgewiesen, kein separater Multijob-Importlauf.
Ursache beheben: Einzelbloblimit und Gesamtquote korrekt getrennt verdrahten,
atomare Foundationbudgetprüfung nutzen. Regression: zwei verschiedene Archive/
Evidenceblobs einzeln zulässig, zusammen zu groß; zweiter Import darf nicht
complete werden, bestehende Blobs bleiben lesbar, Deduplikation kostet keine
zweite Quote. Kein Disk-full-Test ausgeführt.

### PCR-NOVA-GATE-005 — Prozessrestarttest erwartet entfernte Graphdatei

**Niedrig; nachgewiesener Testdefekt durch Codevergleich.**
`check-pipeline-remote-process-restart.mts:223–225` liest
`nova-state/execution-graph/records/store.json`. `production.ts:104–108`
komponiert nur imports, dessen `readExecutionGraphs:218–224` aus vollständigen
Importrecords ableitet. Originalimporttest prüft ausdrücklich, dass eine
vergiftete obsolete execution-graph-Position keine Autorität hat.
Auswirkung: auch nach erfolgreicher Providerisolation würde der Prozessproof an
dieser entfernten Datei scheitern, bevor sein Buster-Restartteil erreicht wird.
Kein aktueller Prozesslauf bis zu diesem ENOENT behauptet.
Ursache beheben: tatsächlichen dauerhaften Import über öffentliche Graphlese-API
nach Neustart prüfen; keine alte Datei wieder einführen. Regression: vorhandenen
echten SIGKILL-Test danach vollständig mit Originalsandbox ausführen.

Offen: Listenerwachstum, explizites Bodycleanup, Multijob-/Mehrprozess-Importquota,
Matrix-/JSON-Tiefenbelastung, Offline-Reimport und echte Crashpräfixe der
Importpersistenz. Diese Grenzen sind sichtbar untersucht bzw. abgegrenzt;
fehlende Laufzeitnachweise werden nicht als bestanden gezählt.

### Nachprüfung vor Commit (2026-09-08)

Originalcode der fünf Befunde erneut abgeglichen; Archivquote und Resolver-/
IPv6proben erneut bestanden. Der erste Timeout-Probenlauf scheiterte an der
zu engen Annahme, der Auftrag müsse unmittelbar nach 300 ms bereits running
sein: tatsächlich war er accepted. Nach begrenzter Beobachtung wechselte er
ohne Cancel zu running. Die ursprüngliche 900-ms-Importbeobachtung erreichte
unter paralleler Last noch keinen Resultrequest und bestätigte diesen zweiten
Fall daher nicht. Das Evidenzskript wartet jetzt beim ersten Fall höchstens
10 Sekunden auf den Original-Servicezustand und nutzt für den zweiten Fall
5 Sekunden Gatebudget mit 6,5 Sekunden Beobachtung. Keine Produktimplementierung
oder Fixtureexecution ersetzt. Die erneute Probe bestätigt beide Defekte;
[nova-remote-timeouts-recheck.txt](../evidence/nova-remote-timeouts-recheck.txt)
enthält das Ergebnis. Die historischen Messwerte oben bleiben als ursprünglicher
Lauf gekennzeichnet; Laufzeit-/Schedulingannahmen sind kein Komponentenbefund.
