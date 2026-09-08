# kubeclaw.git-workspace

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Registrierung und beide Schnittstellenseiten

Vollständig gelesen: `skills/common/plugins/git-workspace/src/{adapter,values,
runner,operations}.ts`, Manifest/Configschema/README/Paketdatei und beide Tests.
Manifest `git` bietet workspace.create/remove, commit, merge, sync. Core
`authorization.ts:git` bindet Repo- und Workspacewurzeln; Adapter kontrolliert
canonical absolute Pfade, Symlinks und resource/repositoryRoot-Gleichheit.
Workspaceziel muss neu unter workspaceRoot liegen. Refs/Branches/Message werden
auf Options-/Refausdrücke geprüft, Commitpfade auf traversal und bestehende Symlinks.

Sender `nova/plugins/blueprint-sync/src/stage.ts` ruft sync_paths(ref,controlPaths),
liest synced/missing, committet gemeldete Änderungen, schreibt State/Artefakt;
missing wird request_fix mit blueprint.control_files_missing. So wirkt 001 am
Empfänger, nicht nur als interner Runnerfehler. Operationen create/commit/merge
liefern nach rev-parse sourceRevision; fetch/rebase/push liefern Runnerresult.
Entfernen optional mit Branchlöschung; Adapter kennt keine separate Branchowner-ID.

## 3–4. Zustandsänderungen und Fehlergrenzen

Create = worktree add -b, dann rev-parse; commit = add, commit scoped paths,
rev-parse; merge = merge --no-ff, rev-parse; sync_paths = show/local compare,
checkout pro Datei; remove = worktree remove --force, optional branch -D.
Jeder Schritt kann bereits mutiert haben, bevor ein späterer fehlschlägt.
Git-eigene Locks/Dateiformate sind Persistenzbackend, kein eigener fsync-/Journal-
oder ACKvertrag. Fetch/prune, rebase und push sind echte implementierte Operationen.

GitRunner liefert nur exit0 als Erfolg, sonst GIT_COMMAND_FAILED/Limit/Abort.
stdout wird als UTF8 gelesen; sync_paths vergleicht Text, kein Byteblob-API.
Der catch-all um show löscht Fehlerdisposition (001). Hooks und Signing werden
per -c deaktiviert; Environment leer, author identity explizit. Repository-/System-
Gitconfig wirkt trotzdem auf andere Einstellungen (Remotes, Filter, Helfer).

## 5–7. Abbruch, Parallelität, Neustart und Autorität

Jeder Gitprozess hat maxExecutionMs, nicht die gesamte mehrstufige Operation;
N Dateien können N*(show+checkout)-Fristen plus Cleanup beanspruchen. Kein
adapter.receipt und keine Idempotenzledger. Retry nach verlorenem ACK kann an
bestehendem Worktree/fehlender Branch/leerem Commit scheitern oder Remoteaktion
wiederholen. Core muss unbekannten Ausgang reconciliieren, nicht blind replayen.
Parallelmutationen desselben Repos benötigen äußeren Core-Ressourcenlock;
Adapter selbst besitzt nur aktive Prozessmenge.

Runner prüft Signal vor jedem spawn, SIGTERM/Grace/SIGKILL in Prozessgruppe,
shutdown wartet gespeicherte close-Promises. Führer-exit bei geerbten Kindpipes
besitzt dieselbe strukturelle Gefahr wie PCR-COMMAND-001: terminate prüft exitCode,
keine unabhängige Gruppenreinigung nach Führerexit. Hier Codebefund, kein eigener
Git-Nachfahrenlauf. Keine neuen doppelten UTF8-/Prozess-IDs. Runner Pipes ohne
stdin, keine expliziten stdout/stderr-error-Handler. Kein vollständiges Reaping-
oder Powerloss-E2E behauptet.

Roots/Dateisystem/Git-Konfiguration sind Vertrauensannahmen, shell:false allein
verhindert nicht durch Gitconfig gestartete Helfer. scopedPaths übergibt Strings
als Git-Pathspec nach --; dessen Magic/Globbing wird nicht explizit deaktiviert.
Offener präziser Scope-Regressionspfad, noch kein belegter produktiver Bypass.

## 8–9. Ressourcen und Vereinfachung

Schema maximal 1 h pro Gitprozess, 16 MiB combined output, 60 s Grace; Anzahl
angefragter Pfade/Kindprozesse und Repo-/Remotegröße besitzen keine eigenen
harten Caps. Kein cgroup/Memorybudget. Worktree/Branches werden nur auf explizite
remove-Operation entfernt; Konflikte/rebase state bleiben zur Klärung erhalten.
Unicode-Chunkkorruption gehört PCR-ISOLATION-003, lokale Git-Blob-UTF8-Konvertierung
ist für binäre Steuerdateien keine verlässliche Gleichheitsprüfung.
Vereinfachung: explizite Git-Aktions-/Resultatdisposition pro Schritt und
Recovery-Protokoll anstatt catch-all oder redundanter Retryheuristik.

## 10. Tests und konkrete Aussagekraft

Original `node tests/package-boundary.test.mjs && node tests/live-function.test.ts`
im Paketverzeichnis bestanden. Echter lokaler Git und bare Remote testen
Worktree, scoped Commit bei unrelated staged files, Hookdeaktivierung, nested
Pfad, fetch/push/rebase, whitespace sync, Merge, Options-/Traversal-/Symlink-
Ablehnungen. Prozesslimitfälle benutzen vorhandene ausführbare Shell-Fixtures
als Gitersatz, daher keine Aussage über echten Gitprozessbaum. Fence ist leer.
Boundarytest ist Regex. Kein tatsächlicher externer Push/Deploy durchgeführt.

Eigene `node docs/review/evidence/capability-adapter-probes.mjs` mit echtem
Originaladapter und temporärem Gitrepo: vorhandene 1024-Byte-Datei bei 128-Byte-
Ausgabelimit wird missing; bereits abgebrochenes Signal bei sync_paths ebenso.
Kontrolliertes lokales Repository, keine Produktionsdaten. Keine Funktionsänderung.

## 11. Dokumentation

README explizit veraltet: „does not fetch, push, or contact remotes“ widerspricht
operations.ts fetch/push und den eigenen Tests. Ebenso dürfen bounded execution
und path scope nicht als gesamte Versuchslaufzeit/harte Sandbox gelesen werden.
Katalog bestätigt Registrierung, erklärt Mutations-/Recoverypräfixe nicht.

## 12. Befund

### PCR-GIT-001 — sync_paths meldet Ausführungsfehler als fehlende Dateien

Schweregrad hoch: valide Kontrollevidenz wird als abwesend bewertet, echte
Timeouts/Abbrüche/Outputlimits werden fachlicher request_fix statt operativer
Fehler; mehrere Dateien können schon verändert worden sein. Nachgewiesener
Defekt, `src/operations.ts:32–45 syncPaths`, insbesondere catch um runner.run(show).
Auslöser vorhandener Blob größer maxOutputBytes, ungültiges Ref oder Abort.
Ablauf: GitRunner wirft, catch fügt Pfad zu missing hinzu und setzt Schleife fort.
Blueprint-Empfänger stage.ts:21–48 schreibt diese falsche Disposition dauerhaft.
Echte Repros oben. Ursachenbehebung: Blobabwesenheit separat durch strukturiertes
Git-Existenzprotokoll bestimmen; Abort/Timeout/Limit/ungültige Ref weiterwerfen.
Regression mit realem Git: missing Blob, invalid ref, Ausgabegrenze, Abort und
partielle Mehrdateisynchronisierung müssen unterscheidbar bleiben.
