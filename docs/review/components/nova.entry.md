# nova.entry

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und tatsächliche Verwendung

`skills/nova/pipeline.ts:1–14` ist der kanonische, importgeschützte Launcher und
reexportiert `core/src/index.ts`. `package.json` führt ihn als `pipeline` aus.
Direkter Start importiert `project/cli.ts`; ohne `--project` delegiert diese an
`@kubeclaw/nova-core/cli`. Der Product-Compiler `project/compiler.ts` erzeugt
Stagegraphen, nicht eine zweite Lifecycleengine. Der Index enthält Exporte und
den eingefrorenen leeren Kernel, keine implizite Stageaktivierung. Registry,
Execution, Test-Gates und Scaffold bleiben eigene Reviewgrenzen.

## 2. Eingaben, Ausgaben und Gegenstellen

Die Core-CLI lädt Plattform und `pipeline-definition.v2`, routet Run/Recover/
Resume/Audit und liefert JSON plus Exitcode (nur succeeded = 0). Die Project-CLI
lehnt unbekannte/doppelte Argumente und Compile/Recover/Signal-Kombinationen ab.
Die ältere Core-CLI überschreibt doppelte Flags und ignoriert unbekannte Flags;
die dokumentierten Run/Recover-/Audit-Konflikte werden dennoch abgewiesen.
Compiler untersucht: geschlossene Objekte, absolute normalisierte Pfade,
40-stelliger Gitbaseline, 1–128 Module, Abhängigkeiten/Zyklen, überlappende
Ownership-Präfixe, Requirements, Agent-/Lintkonfiguration und digestgebundene
Resolved Plans mit passendem Run/Project/Module und blockierendem Test.

Ausgabe ist ein deterministischer DAG mit genau Implementation → Lint → Review
→ Quality je Modul, `maxConcurrency=1`, serialisierter Veröffentlichung und
Remediation zurück zur jeweiligen Implementation. Gegenstellen wurden an
`implementation-agent`, `lint`, `review`, `buster-quality-gate` und deren
Inputschemas abgeglichen: dynamische `sourceStageId` statt vorgetäuschtem
Ergebnis; Requirements gehen in Revieweingabe und digestgebundene Evidenz.
`validatePipelineRuntimeV2` (`core/execution/engine.ts:18–22`) überprüft
installierte Registrierungen/Grants/Inputs vor Graphausgabe. Compile allein
validiert weder physische Repoexistenz noch tatsächliche Providerleistung.

## 3. Zustand und Nebenwirkungen

`--compile` schreibt genau eine neue Datei mit `wx`; vorhandene Dateien werden
nicht überschrieben. Kein Runverzeichnis wird dabei erstellt (im Test belegt).
Normale Projectausführung prüft Git HEAD und sauberen Status vor Corestart.
Runzustand/Locks/Artefakte verwaltet die Coreengine; `runRoot` validiert Run-IDs
und bildet sie auf SHA-256-Verzeichnisse ab. Der Compiler bleibt ohne I/O und
liefert einen geklonten Graphen. Compileausgabe ist nicht fsync-/rename-gesichert;
bei Prozessabbruch kann eine unvollständige neue Datei zurückbleiben.

## 4. Fehlerbehandlung

Project-CLI gibt Fehler als JSON mit Exitcode 1 aus; `wx`, Schema- und Gitfehler
laufen durch denselben Pfad. Coreusage verwendet Exitcode 2, Runtimefehler 1.
Registry-/Graphfehler verhindern Stageausführung. Ein gültiger Graph beweist
keine Feasibility oder Testabdeckung. Coredefekte werden nicht hier dupliziert:
[Execution](nova.execution.md), [Lifecycle](nova.lifecycle.md),
[Test-Gates](nova.test-gates.md).

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Compiler begrenzt Module und setzt pro Stage 30 Minuten, 2 Attempts und
2 Remediationzyklen; Semantik erzwingt der Core. Die Launcher verbinden
SIGTERM/SIGINT nicht mit dem optionalen `runPipelineV2`-AbortSignal. Ein beendeter
CLIprozess ist daher kein belegter sauberer Abbruch externer Aktionen. Git-
Preflight verwendet synchrone Prozesse ohne explizites Timeout. Externe Änderungen
zwischen HEAD-Prüfung und Ausführung bleiben möglich; die dokumentierte einzelne
Projectlane koordiniert keine fremden Prozesse. Runidentität/Executionlock müssen
Duplikate verhindern; der Launcher besitzt keinen zweiten Lock.

## 6. Neustart und teilweise abgeschlossene Aktionen

Recover verlangt denselben Project-Run; Resume lädt das Signal und delegiert
Corevalidierung. Die Repository-Clean-Prüfung wird bei beiden bewusst nicht
wiederholt, da Arbeit bereits veröffentlicht sein kann. Unveränderte Graph-/
Registrysnapshots prüft Core. Für mehrstufige Result-/Wait-/Artefakt-Commitfenster
gelten PCR-EXEC-001/002; kein eigener Wiederherstellungsmechanismus im Launcher.
Unvollständige Compiledateien müssen nach einem Crash explizit geprüft/entfernt
werden, bevor `wx` erneut schreiben kann.

## 7. Vertrauen und Autorisierung

Lokaler CLI-/Dateizugriff ist die administrative Vertrauensgrenze. JSON-Signale
sind keine kryptographisch authentifizierten Operatoren allein durch ihren
Inhalt; Core prüft Wait-/Issuerbindung, die CLI setzt autorisierten lokalen
Dateizugriff voraus. Plattformgrants begrenzen tatsächliche Adapterrechte.
Ownershipnamen im Compiler sind validiert, ersetzen aber keine Host-/Git-
Sandbox. Workspace-Ausschluss ist lexikalisch; reale Pfad-/Symlinkgrenzen sind
zusätzlich von Git-/Repositoryadaptern zu erzwingen.

## 8. Ressourcen und Aufräumen

128 Module begrenzen Graphbreite; Dateieingaben und Requirement-/Tasktexte haben
hier kein eigenes Bytebudget vor JSON.parse. Lokale Eingaben sind vertrauenswürdig
vorausgesetzt. Compiler benötigt nur Speicher; CLI erzeugt keine eigenen
Worktrees. Retention/Artefaktquoten und externer Prozesscleanup gehören den
zuständigen Adaptern. Voraussetzungen: passendes Node mit TS-Unterstützung,
Workspacepakete, Git, installierte Plugins, persistente Corestorage und für
ausgeführte Stages die jeweils freigegebenen Dienste.

## 9. Architektur und Vereinfachung

Productcompiler sauber vom generischen Core getrennt; einfache lineare
Publikationslane vermeidet modulfremde HEAD-Drift innerhalb dieses Graphen.
CLIargumentparser könnten zu einer geschlossenen konsistenten Schnittstelle
vereinheitlicht werden. Kein Ersatz des alten Scaffolds behauptet. Ein zentrales
Launcher-Abbruchprotokoll wäre einfacher als individuelle Signalhandler in
Plugins; tatsächliche externe Effects-Recovery muss erhalten bleiben.

## 10. Untersuchte Tests und ausgeführte Prüfung

Vollständig gelesen und ausgeführt:
`node tests/verification/contracts/check-project-compiler.mts` → **bestanden**,
`{"ok":true,"scope":"source-launcher","modules":2,"executedStages":0}`.
Originalcompiler, echte temporäre Gitcommits, Providerregistry, Planresolver,
Stageinput-/Grantvalidierung und Start der Source-CLI; deterministische Sortierung,
Zyklen, fremde Plans, Ownership, verbotenes Caller-Ergebnis und kein Runzustand bei
Compile geprüft. **Keine Implementierungs-/Review-/Teststage ausgeführt.**
Archivoption des Tests nicht ausgeführt; kein neuer Bundle- oder Agent-E2E-Nachweis.
Die sehr breite alte Inventartestliste enthält transitive Coreimporte und zählt
nicht als 60 eigene Entrypointprüfungen. Signal-/Crash-/External-Effecttests werden
in den zuständigen Core-/Pluginreviews bewertet.

## 11. Dokumentationsabgleich

`skills/nova/project/README.md` und `docs/architecture/nova-project-runtime.md`
beschreiben Routing, Compiler, Lane, Einschränkungen und Compile-Testgrenze korrekt.
Dokumentationsstatus: **vorhanden, betrieblich unvollständig** für CLI-Signalabbruch,
Compile-Crashreste, fehlende lokale Inputlimits und die Unterschiede der beiden
Argumentparser. Keine pauschale Übernahme alter E2E-/Scaffold-Annahmen.

## 12. Befunde und verbleibende Nachweise

Kein zusätzlicher hoch-/mittelgradiger Defekt an dieser Grenze nachgewiesen.
Die aufgeführten Abbruch-/Ressourcen-/TOCTOU-Grenzen sind konkrete Designgrenzen,
keine behaupteten erfolgreichen Angriffe. Nachweisbedarf: echter CLI-SIGTERM mit
laufendem Adapter/Kindprozess; Wiederaufnahme mit unveränderten Snapshots nach
abgebrochener externer Aktion; extrahierter Launcher mit dem Produktionsbundle.
Nicht erforderlich für den fachlichen Reviewabschluss, aber offen für spätere
Betriebsabnahme. Ursachenbehebung bestehender Crashdefekte bleibt beim Core.
