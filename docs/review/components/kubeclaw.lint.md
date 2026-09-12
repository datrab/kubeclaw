# kubeclaw.lint

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Nutzung und Vertragsgrenzen

Vollständig gelesen: Paketmanifest, vier Schemas, README, package.json,
src/{adapter,stage,candidate}.ts, beide support-Reexports und sämtliche 27
Engine-Dateien (rund 3.700 Zeilen). Gegenstellen: Nova
`project/compiler.ts:110–132`, Core `execution/authorization.ts:95–99`,
SDK resolveSourceRevision, Core Effect-/Adaptergrenze und Artifactstore aus den
vorausgehenden Reviews. `pre-check`/`full` liefern zwei Stages;
`executor` liefert unabhängig freizugebendes lint.execute. Compiler setzt nach
Implementation `kubeclaw.lint.full`, bindet sourceStageId und leitet request_fix
zur Implementation zurück. Kein Agent und keine command.execute-Weiterleitung.
Die Sprache-/Toolregistry ist lokale Paketimplementierung; native Prozesse
werden innerhalb dieser privilegierten Adaptergrenze gestartet.

Stage sendet workingDirectory, policyPath/policyProject, tier, optional
modulePath/changedFiles/Kubernetes-Inputs und Sichtbarkeit. Core kontrolliert
allowedProjects anhand resource.canonicalId sowie Repository-/Policyroots;
Adapter realpath-prüft beide Startpfade nochmals. Bei sourceStageId liest SDK das
exakte Implementationartefakt; candidate klont shared/no-checkout, checkt den
40-stelligen Commit detached aus und verifiziert HEAD. Stage prüft die
zurückgegebene sourceRevision exakt und schreibt sie ins Reportartefakt.
Unversionierte Aufrufe analysieren dagegen den lebenden Arbeitsbaum.

Policy v7 verlangt genau ein Projekt, deklarierte Sprachen/Evidenz, vollständige
Toolkonfiguration, Scopes, positive Timeouts, Governance und Baseline v2.
Registry erhält individuelle detect-Funktionen; changed-file Scopes und geänderte
Configs können Vollprüfung auslösen. Explizite Kubernetes-Inputs verdrängen
generische Helm-Schemaauswahl. Report v7 prüft Status, Findings, SHA-Fingerprints,
Summen und Evidenzlimits. Optional angebotene expected-Policy-/Tier-/Toolinventory-
Vergleiche werden an beiden Call-sites nicht übergeben: Empfänger prüft hier
Selbstkonsistenz plus sourceRevision, keine unabhängige Bindung aller Reportfelder.
Beim eingebauten vertrauenswürdigen Executor kein konkret nachgewiesener
Fremdreportpfad; Providerwechsel muss diese Vertrauensannahme berücksichtigen.

## 3–4. Seiteneffekte, Commit und Dispositionen

Resultat entsteht nach sequenziellen Toolläufen; dann artifacts.write put_json,
dann StageResult. Toolausführungsfehler → blocked; fachliche Blockingfindings →
request_fix; sonst passed. Artifactfehler wird Core-Runtimefehler, keine positive
Gateentscheidung. Required fehlende Programme sind Toolfehler, optionale fehlende
Programme not_applicable. Experimental Findings verändern Blocking-/Debtcounts
nicht; Ausführungsfehler experimenteller Tools zählen weiterhin tools_failed.
Baseline-Fingerprints werden vor Zählung ausgesondert; Vollprüfung ohne Scope
verwirft stale Suppressions nur für erfolgreich gelaufene Tools. Findings mit
gleichem Text erhalten teils quell-/occurrencebasierte Seeds; SCCs sortierte
Mitglieder. Kein eigener dauerhafter Jobzustand oder Commit im analysierten Repo.

Geprüfte Parser-/Toolpfade: tsc, ESLint, Ruff, mypy, ShellCheck/shfmt, Semgrep;
Dependency-Cruiser Layergrenzen und Tarjan-Zyklen, Knip und jscpd; gofmt/vet/list,
gocyclo/staticcheck/govulncheck; Terraform fmt/init/validate, tflint/Trivy;
Hadolint, Helm/yamllint/kubeconform; in-process Kubernetes/OpenAPI-Regeln.
Viele Parser unterscheiden nonzero mit Findings von Ausführungs-/Parsefehlern.
Die Formstrenge ist unterschiedlich; nicht alle realen Toolversionen wurden
ausgeführt. Insbesondere Knip liest data.issues, während ein mögliches separates
Top-level files-Feld ungeprüft bleibt: Toolversionsnachweis offen, kein bestätigter
Befund aus einem selbst erfundenen JSON-Beispiel.

## 5–6. Deadline, Abbruch, Retry und Wiederanlauf

Adapter prüft signal/fence ausschließlich am Eintritt. Engine und Candidate
erhalten kein Signal, shutdown ist leer. execFileSync/which sowie Kandidaten-Git
blockieren den Eventloop; Tooltimeout plus mehrere weitere Tools und Gitphasen
werden nicht gegen eine absolute Claimdeadline budgetiert. Native Timeout-
Erkennung ist zusätzlich falsch (Befunde unten). Keine gemeinsame Prozessgruppe,
kein forcierter Reaping-/Abschlussnachweis. Auch temporäre Gitaufrufe besitzen
je 60 Sekunden, kein Gesamtbudget. Lease-/Aborttimer auf demselben Eventloop
können während laufender Tools nicht fortschreiten.

Kein eigener Retry; Core Effectreceipt entscheidet bei Wiederholung desselben
Effects. Ein erneuter Stagehandler allein beweist deshalb keine erneute
Toolausführung. Neue Attempts können Analyse wiederholen; versionierte
Candidates begrenzen Arbeitsbaumdrift, native Toolversion/Umgebung und Caches
bleiben externe Faktoren. SIGKILL kann Kandidaten-/Terraform-/Renderverzeichnisse
hinterlassen. Kein Scan/Reaper für solche Reste. Artifact-/Result-/Stageprojektion
verbleibt Corezuständigkeit, siehe PCR-EXEC-001/002; kein Gesamt-Crashnachweis aus
dem hier vorhandenen Artefaktfehler-Funktionstest.

## 7–8. Vertrauen, Evidenz, Ressourcen und Aufräumen

Policy und native Config sind operator-controlled, kein Sandbox-Ersatz. Die
Umgebungsallowlist begrenzt Variablen, erlaubt aber unter anderem PATH, HOME,
SSH_AUTH_SOCK und Containerhosts. Kandidaten-Git erbt die Prozessumgebung;
Hooks sind deaktiviert. Tools können eigene Config-/Pluginmechanismen besitzen.
Repositoryroot-Freigabe allein umfasst nicht sicher alle tatsächlich gelesenen
Targets (PCR-LINT-001). Governance-Metadaten sind keine Signaturprüfung; ihre
Autorität folgt der geschützten Policydatei. Config-/Baselinebytes werden gehasht;
Kubernetes-Packs sind zusätzlich digestgebunden und pfadbegrenzt.

Pro Nativeoutput 10 MiB, Defaulttimeout 30 Sekunden; Policytimeout ohne globales
Oberbudget. Generische rekursive Targetsuche sammelt synchron ohne Gesamtdatei-/
Bytegrenze (discovery_max_depth begrenzt Spracherkennung, nicht jede Targetsuche).
Kubernetes besitzt max_files/file_bytes/rendered_bytes/documents, pack max1 MiB/
256 Regeln und Symlinkprüfung; YAML-Aliase sind limitiert. Reportevidenz max256,
referenziert max64 MiB je Eintrag, inline max256 KiB mit echter Byte-/SHA-Prüfung.
Nicht-inline Evidenz bleibt Digest/Größe/Herkunft, kein automatisch gespeicherter
reproduzierbarer Blob. Voller Datenträger verursacht Fehler; endlich-Pfade räumen
per finally auf. Gemeinsame `/tmp/kubeclaw-lint-cache`-Verzeichnisse sind 0700,
haben aber weder Quote noch Retention und werden über Attempts geteilt.
Logs gehen als JSON an console.error; output.ts besitzt keinen aktiv gesetzten
logPath und keine eigene kanonische Worker-Logstore-Verdrahtung.

## 9 und 11. Architektur und Dokumentationsabweichungen

Ein gemeinsamer Policykern für beide Stages ist nachvollziehbar. Dauerhafte
Vereinfachung: ein einziger begrenzter asynchroner Prozess-Lifecycle und dieselbe
kanonische Pfadprüfung für sämtliche Tools, statt gesonderter Kuberneteshärtung.
Keinen zweiten ungebundenen Validator-/Ausführungsweg hinzufügen. Globale
Discoverydiagnostik und gemeinsame Cachepfade brauchen bei echter Parallelisierung
einen aufrufbezogenen Besitz-/Quotenplan.

README nennt das Paket weiterhin non-authoritative/v1 aktiv; Compiler und
`docs/architecture/pipeline-test-gate-manifest-lint-cutover-final-audit.md`
beschreiben/implementieren bereits den v2-Nova-Pfad. README behauptet npm test
baue das Paket; tatsächlich ist build separat und test startet nur sechs Dateien.
Die behauptete Cancellationverification prüft ausschließlich vorab abgebrochenes
Signal. Inputdokumentation nennt sourceStageId/revision/Kubernetes nicht. Der
historische Cutover-Audit mit bestandenen Helm-/Kubeconformtests ist kein
Nachweis eines erfolgreichen Laufs in dieser Umgebung.

## 10. Gelesene und ausgeführte Tests

Alle sechs Pakettests vollständig gelesen. `npm test` im Lintpaket: Stage-
Invalidreport, Paketgrenze, Adaptergrenze, Discovery und echte ESLint-
Disziplinregeln bestanden. Live-function erreichte Original-Core, echte
Filejournale/Artifactstore und den eingebauten Executor, scheiterte aber schon
am erwarteten clean-Pass, weil shellcheck/shfmt fehlen. Der Test selbst enthält
später pass/fail für beide Stages, Artefaktspeicherfehler und echte Gitcommit-
Candidatebindung; diese späteren Assertions wurden nicht erreicht. Kein Mock
ersetzt die fehlenden Programme. MemoryResourceLockManager bleibt Fixturelimit.
Vollständige Ausgabe: `../evidence/lint-original-tests.txt`.

Zusätzlich `tests/verification/contracts/check-pipeline-manifest-lint-implementation.mts`
vollständig gelesen und unverändert mit Node gestartet. Er prüft echte Engine,
Helm/Kubeconform, lokale vereinfachte Schemas, Digest-/Größen-/Symlink-/Source-
Spoofing-/Inputauswahlfälle. Hier scheitert bereits erster erwarteter Schema-ok-
Status: helm und kubeconform fehlen. Details
`../evidence/lint-manifest-original-test.txt`. Kein Cluster, kein Produktions-
Toolchain-/gesamter Paritätsnachweis und kein Paket-Build behauptet.

`node docs/review/evidence/lint-boundary-probes.mjs` bestand mit Originalfunktionen,
echtem /bin/sleep und echten temporären Dateien/Symlinks. Der erste Probeentwurf
fehlte beim direkten Policyhelfer das normalisierte leere Kubernetesfeld;
TypeError vor der Pfadassertion, dann fixtureformgerecht ergänzt und erneut
bestanden. Ergebnis in `../evidence/lint-boundary-probes-results.txt`.

## 12. Bestätigte Befunde und Ursachenbehebung

### PCR-LINT-001 — hoch: generische Targets verlassen die freigegebene Repositorygrenze

`engine/policy.ts:310–355` prüft generische Targets nur lexikalisch/existent;
`discovery.ts:86–114` folgt statSync beziehungsweise existsSync und übergibt diese
Pfade an native Tools. Trigger: freigegebenes Repo mit konfiguriertem `src`, das
als Symlink auf ein außerhalb liegendes Verzeichnis zeigt, oder entsprechender
changedFiles-Eintrag. Originalprobe akzeptiert Policytargets und liefert in
beiden Modi `repo/src/external.sh`, dessen realpath `outside/external.sh` ist.
Damit kann repositorykontrollierter Inhalt lokale Quelldateien außerhalb der
Grantgrenze in Analyse/Findings einbeziehen. Keine Exfiltration oder Mutation
außerhalb der kontrollierten Fixture behauptet. Rootfix: jede Projekt-/Target-/
Changedfileauflösung kanonisch gegen den freigegebenen Root binden, Symlinks
ablehnen oder sicher innerhalb halten; beim Öffnen Race gegen Austausch beachten.
Regression über echten Adapter/Nativeprogramm mit Target-, Projektroot-,
Changedfile- und Parent-Symlinkvarianten. Kubernetes-Spezialschutz nicht entfernen.

### PCR-LINT-002 — hoch: laufender Lintversuch besitzt keinen wirksamen Abbruch-Lifecycle

`adapter.ts:64–82`, `engine/index.ts`, `engine/execution.ts:82–104` und
`candidate.ts`: Signal wird nach Eintritt nicht weitergegeben; synchrone
Subprozesse verhindern zudem Timerverarbeitung. Originalprobe führt /bin/sleep
0.12 aus; der vorher gesetzte 5-ms-Timer ist nach 151 ms noch nicht gelaufen.
Das belegt Eventloopblockade; vollständiger Claimverlust-/Prozessbaumtest wurde
nicht ausgeführt. Wirkung: Deadline/Shutdown/Lease-Abbruch kann Analyse nicht
zuverlässig stoppen, weitere Toolphasen erhalten kein Restbudget, native
Nachfahren sind nicht gemeinschaftlich beendet. Ursachenfix: async spawn mit
durchgereichtem AbortSignal, absolutem Restbudget einschließlich Git/Report/
Aufräumen, Prozessgruppen-TERM/KILL/Reaping und shutdown-Verfolgung. Regression:
echtes langlaufendes Tool mit Nachfahren, Abbruch nach Start und messbar begrenzte
Gesamtdauer/Restprozesse. Anderer Eigentümer als PCR-COMMAND-001: dieser Adapter
umgeht den CommandRunner vollständig.

### PCR-LINT-003 — mittel: echte native Timeouts werden als Startfehler klassifiziert

`execution.ts:74–76,105–120` erkennt ausschließlich error.killed. Original
execFileSync-Probe /bin/sleep 0.15 mit timeout20 liefert ETIMEDOUT,
exitCode -1, timedOut false; requireToolExecution erzeugt probe-execution-failed
statt probe-timeout. Gate bleibt blockiert, aber diagnostische Disposition und
eventuelle Recoverysteuerung verlieren die Timeoutursache. Fix: tatsächlichen
ChildProcess-Timeoutcode/-zustand explizit klassifizieren, getrennt von ENOENT,
Outputoverflow und fachlichem nonzero. Regression mit realem Timeout, fehlendem
Programm und ordinary finding exit; nicht über ein künstliches killed-Feld.
