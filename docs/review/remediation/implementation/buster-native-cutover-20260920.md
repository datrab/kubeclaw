# Buster: nativer Cutover und Quellenbereinigung

Stand: 2026-09-20. Dies ist die Arbeitsmatrix, kein Abschlussnachweis.
Maßgeblich bleiben [B1–B5 und W1–W5](../acceptance-20260920.md).
Die [einzelne Pflichtfallmatrix](buster-native-cases-20260920.md) ordnet Inputs,
Vorzustände, Pfade und Nachweise zu; sie präzisiert nachträglich die erste
aggregierte Fassung und erfüllt A1 für den W3-Slice nicht rückwirkend.

## Implementierungsschnitt

Der Produktionsrunner verwendet noch `WorkerAttemptExecutor` V1 und
`LocalWorkerRuntime`. Dessen Callback lässt sich nicht allein durch den nativen
V3-Prozessstarter ersetzen: Provider, Capability-RPCs, Reportadapter und
Abschlussarbeit müssen gemeinsam in die gebundene Prozesslebensdauer wechseln.
Die bereits vorhandenen `NativeAttemptJournal`, `NativeWorkerOwnership` und
`startNativeBusterFixture` liefern dauerhafte Bausteine, beweisen jedoch keinen
Produktionscutover. Insbesondere ist ein gestarteter Gesamtjobprozess kein
Ersatz für getrennte Attemptbudgets und retained Fixturelifetimes.

Der vollständige Schnitt umfasst:

1. V3-Admission und dauerhafte Job→Attempt-/Fixturezuordnung vor Prozessstart.
2. Einen spezialisierten Buster-Prozess mit Provider, Capabilityarbeit und
   Reportabschluss in derselben nativen Grenze; WorkerCore bleibt generisch.
3. Fixturebereitschaft und Teardown über den vorhandenen dauerhaften
   Controlkanal; abhängige Nodes starten nur nach bestätigter Bereitschaft.
4. Startup-Recovery über Originaljournal und Ownership, danach Freigabe
   ausschließlich temporärer Quellen. Unbekannter Besitz bleibt geschützt.
5. Entfernen des bisherigen produktiven V1-/Filecapability-/Samplingpfads,
   sobald sämtliche Produktionsverbraucher umgestellt und geprüft sind.

Kein Fallback und keine Statushochsetzung während der Teilintegration.
Änderungen an Broker, Hostrollen und Produktionskonfiguration müssen mit
deren Eigentümern abgestimmt werden.

## Pflichtfallmatrix

| Kriterien | Tatsächliche Prüfung | Stand |
| --- | --- | --- |
| B1 | Echter Produktionsaufruf: Provider, parallele Capability-RPCs, Reports und Abschluss; kein Parent-Workload | offen |
| B2 | Reale CPU-/RAM-/Tasklast, kurzlebige Kinder, parallele Attempts, Rollenadmission | offen; vorhandene Coretests allein reichen nicht |
| B3 | Timeout, Cancel, Supervisor-SIGKILL, vollständige Abrechnung und Restprozesssuche | offen |
| B4 | Fixture vor/nach Readiness, Restart, Budgetbindung bis Cleanup; historische Receipts | offen im Produktionsrunner |
| B5 | Echte Consumer bei Setupfehler, Cancel, Restart und Cleanupfehler | offen |
| W1 | Erfolg, fachlicher Fehler, Ausführungsfehler, Cancel, Extraktionsfehler | offen für alle Produktionsfälle |
| W2 | SIGKILL an Terminal-/Cleanupgrenzen, PID-Reuse, unbekannter Besitz, aktive Fixtures | offen |
| W3 | Wiederholung, Symlink- und Parentwechsel; fremde Quellen, Logs und Evidence erhalten | lokale Regression wird erweitert |
| W4 | Tote und lebende eigene Orphans; mehrere Restartzyklen mit tatsächlicher Freigabe und Frist | offen |
| W5 | Eingebettete Archive, runtimeRoot, Fehler-/Abbruchretention, Replay und sämtliche Quoten | offen |
| B-DOC/W-DOC | Betriebsanleitung, Ressourcenvertrag, Recoverydiagnose und aktuelle Grenzen | dieses Dokument beschreibt nur Zwischenstand |

Kernel-/Hostrollen- und reale Nova→Buster-/Podrestartprüfungen bleiben separate
Pflichtnachweise. Lokale Tests ohne delegierte Cgroups ersetzen sie nicht.

## Umgesetzt: gepinnte Verzeichnisgrenzen bei temporären Quellen

`cleanupTerminalWorkspace` öffnet auf Linux jeden Pfadbestandteil mit
`O_DIRECTORY | O_NOFOLLOW` und verwendet die gehaltenen Directory-FDs für die
Löschung. Die vorherige Folge `lstat` → `rm` auf dem ursprünglichen Pfad erlaubte
einen Verzeichnistausch zwischen Prüfung und Löschung. Nun kann ein ersetzter
Job-/Workspacepfad die Löschung nicht zu einem fremden Job umleiten. Die
Quieszenzpflicht des Aufrufers bleibt bestehen; diese Änderung implementiert
keine native Ownership-Recovery und verhindert keine noch aktiven Schreiber
innerhalb des temporären Quellbaums.

Prüfung mit Node v24.21.0:

```sh
node --test tests/verification/reliability/buster-terminal-workspace-native.test.mts skills/buster/engine/test-gates/tests/terminal-workspace.test.ts
npx --no-install tsc --noEmit -p skills/buster/engine/tsconfig.json
```

Sechs Tests bestanden, keine Skips; Engine-Typecheck bestanden. Die Regression
ersetzt echte Verzeichnisse genau vor dem ersten Löschaufruf und führt danach
die originale `fs.rm`-Implementierung aus. Sie prüft fremde Quellen sowie
verbleibende Ergebnis-, Evidence- und Scratchdateien. Als Negativkontrolle wurde
der unveränderte `HEAD`-Stand der Cleanupfunktion in einem temporären Verzeichnis
mit denselben Tests geprüft: zwei bisherige Fälle bestanden, alle drei neuen
Fälle scheiterten. Bei den beiden Parentwechseln wurden tatsächlich fremde
Dateien gelöscht. Die neue Prüfung erkennt somit den vorherigen Defekt.

Die bestehende Fixture-Control-/Journalbaseline konnte hier noch nicht
ausgeführt werden: alle zwölf Tests scheitern an BusyBox `/usr/bin/flock`, das
`--timeout` nicht unterstützt, vor ihren fachlichen Assertions. Ein util-linux
`flock` unter `/tmp` und eine PATH-Anpassung lösen dies nicht, weil der Store den
absoluten Pfad verwendet. Weder Assertions noch der Produktionslockpfad wurden
dafür gelockert. Das ist kein bestandener Fixture-Nachweis.

Nachtrag: Ein isolierter proot-Bind auf ein echtes util-linux `flock` ermöglicht
die unveränderten Tests, ohne Systemdateien oder Produktionscode zu verändern.
Die frühere Fehlursache bleibt damit nachvollziehbar; der finale Rohbeleg wird
im neuen Evidenceordner gebunden. Dies beweist weiterhin keine produktive
Fixtureverdrahtung.

Die Betriebsdoku wurde im Abschnitt „What existing cleanup actually does“ von
[Observability retention](../../../operations/observability-retention.md)
aktualisiert: Voraussetzungen, Symlinkdiagnose, geschützte Daten und verbleibende
Restart-/Quota-Grenzen. B-DOC/W-DOC sind erst mit dem vollständigen Cutover und
den übrigen Pflichtfällen abschließbar.

## Nächster Schnitt: ein produktiver Capability-Konstruktionspunkt

`capability-runtime.ts` enthält jetzt die elf bisherigen Capabilityrouten und
deren Optionsvertrag. `BusterRemotePlanService` verwendet diese Funktion;
die alte Inlinekonstruktion wurde entfernt. Ressourcen, Fehlercodes, erlaubte
Capabilities und Shutdownverhalten bleiben unverändert. Das ist ein vorbereitender
Refactor am echten Produktionsaufruf: der spätere native Host kann denselben
einen Baustein besitzen, statt eine zweite Brokerimplementation zu erhalten.
Aktuell wird er weiterhin im Serviceprozess konstruiert. B1 ist damit ausdrücklich
noch nicht erfüllt; ein Konstruktorumzug allein misst oder isoliert keine Arbeit.

Der vorhandene HTTP-Authoritytest führt seinen erlaubten und verbotenen realen
HTTP-Zugriff jetzt durch diesen produktiven Konstruktionspunkt aus. Unverändert
bleiben die Assertions für null Kontakte bei verbotenem Zugriff, Originalbody
bei erlaubtem Zugriff und keinen Kontakt des Redirectziels. Der vollständige
Remoteplan-Transporttest verwendet weiterhin seinen vorhandenen injizierten
Executor; er prüft Service-/Transportregressionen, keinen nativen Provider.
Die zwölf bestehenden Fixturetests betreffen Journal/Control, keinen produktiven
Scheduler. Diese Prüfgrenzen dürfen nicht zu einem B1–B5-Abschluss zusammengezählt
werden.

Die einzelne A1-Matrix wurde vor dem Capabilityrefactor begonnen, enthielt aber
noch keine eigenen Refactorfälle; diese zusätzliche zeitliche Prozessgrenze
wird nicht durch nachträgliche Dokumentation geheilt. Der nächste fachliche
Cutoverschnitt muss vor seiner Umsetzung eigene konkrete Produktionsfälle haben.

Finale lokale Regression: [21 Tests, keine Skips](../../evidence/buster-boundaries-20260920/tests.txt),
gebunden an [Dateidigests und Aufruf](../../evidence/buster-boundaries-20260920/identities.json)
und [Sourcepatch](../../evidence/buster-boundaries-20260920/reviewed.patch).
Engine-Typecheck, Fixture-Typecheck und separater Typecheck des geänderten
HTTP-Authoritytests bestanden. GNU tar 1.35 und util-linux flock wurden nur unter
`/tmp` extrahiert und per proot an die erwarteten absoluten Pfade gebunden;
die Systeminstallation blieb unverändert. Der erste Remoteplantestversuch
scheiterte vor fachlicher Prüfung am fehlenden `/usr/bin/tar`; der finale Lauf
verwendet die echte GNU-Binary. Ein Provider-/Kernel-/Liveabschluss wird daraus
nicht abgeleitet.
