# Buster — einzelne Pflichtfälle

Diese Matrix präzisiert die [Cutover-Arbeitsmatrix](buster-native-cutover-20260920.md)
nach dem unabhängigen Review R2. Sie entstand **nach** Umsetzung und Prüfung des
W3-Verzeichnisfixes. Damit ist die ursprüngliche A1-Vorabbedingung für diesen
Slice nicht rückwirkend erfüllt. Für noch nicht implementierte Fälle ist sie
die vorab festgelegte Sollmenge. Kein Gesamt- oder Findingabschluss wird erklärt.

## Prüfpfade und Umgebungen

Die Pfadkürzel in jeder Zeile sind Bestandteil ihrer Produktionspfadzuordnung:

- P: `production.ts` → `BusterRemotePlanService.#execute` → `TestPlanRunner`.
- F: P, Fixture und echter abhängiger Node; Ziel ist `startNativeBusterFixture`
  mit `FileBusterFixtureJournal` und `NativeAttemptJournal`. Noch nicht produktiv verdrahtet.
- R: `BusterRemotePlanService.recover` und `#execute`; native Ownership-Recovery
  muss davor stattfinden. Diese Integration fehlt.
- C: `BusterRemotePlanService.#execute` → `cleanupTerminalWorkspace`.
- J: `FileBusterPlanJobStore` und `remote-plan-compaction.ts`, Originalconsumer/Replays.

L = lokales Linux/Node 24 mit echten Dateien, unabhängige Wiederholung im
[Prüfstand](../../evidence/independent-slices-20260920/identities.json).
N = Linux mit delegierten CPU-/Memory-/PIDs-Cgroups und Produktionsentrypoint;
noch nicht bereitgestellter Aufbau. H = reale Hostrollen, Nova→Buster, Images,
persistente Volumes; noch nicht bereitgestellter Liveaufbau. N/H benötigen vorab
unveränderte effektive CPU-/RAM-/Task-/Zeitgrenzen, Rollenreserve und belegte
Recoveryfrist aus dem Betriebsvertrag. Diese Zahlen fehlen; es werden keine
nachträglichen Sollwerte aus Messergebnissen abgeleitet.

„Nicht ausgeführt“ bezeichnet sowohl fehlende Implementierung als auch fehlenden
Testaufbau, niemals bestanden. Bei diesen Zeilen sind konkrete Testdatei und
Rohbeleg **noch ausstehend**. Die Angaben unter Messung definieren deren benötigte
Wirkung; Dateinamensplatzhalter oder bloße Quelltextsuche sind kein Ersatz.

## Ressourcen und produktive Lebensdauer

| Fall / Kriterium | Pfad / Umgebung | Eingabe und Vorzustand | Erwartete Wirkung und Messung | Test / Rohbeleg / Zustand |
| --- | --- | --- | --- | --- |
| B01 / B1 | P / N | Ein Providerattempt ohne Helfer; leere zugeordnete Scope | Provider-PID und Nachkommen in genau dieser Scope; unabhängige Kernelbeobachtung | ausstehend / — / nicht ausgeführt |
| B02 / B1 | P / N | Attempt ruft lokalen Capabilityhelfer auf | Helferarbeit gehört zum selben Scope, nicht zum Parent; PID-/Cgroupzuordnung | ausstehend / — / nicht ausgeführt |
| B03 / B1 | P / N | Zwei überlappende RPCs im selben Attempt | Beide arbeiten unter gemeinsamem Budget; Kernelverbrauch samt Kindprozessen | ausstehend / — / nicht ausgeführt |
| B04 / B1 | P / N | Provider fertig; große Reports und Abschluss-I/O noch ausstehend | Grenze bis nach Report-/Abschlussarbeit aktiv; keine vorzeitige Endmessung | ausstehend / — / nicht ausgeführt |
| B05 / B1 | P / N | Delegation fehlt vor Admission | Start scheitert vor Arbeitsannahme; kein Provider und kein Samplingfallback | ausstehend / — / nicht ausgeführt |
| B06 / B1 | P / H | Containerbuild mit echtem externem BuildKit | Externe Arbeit separat budgetiert/ausgewiesen; keine fiktive lokale Gesamtabrechnung | ausstehend / — / nicht ausgeführt |
| B07 / B2 | P / N | CPU-Last nur im Provider, gültiges fixes CPUbudget | Überschreitung löst CPUfehler aus; Kernel-CPUzähler und Prozessende | ausstehend / — / nicht ausgeführt |
| B08 / B2 | P / N | CPU-Last nur im Helfer, gleicher Budgetvertrag | Derselbe Grenzvertrag greift; Helfer wird mitgezählt | ausstehend / — / nicht ausgeführt |
| B09 / B2 | P / N | RAM-Last nur im Provider | Memorygrenze greift; OOM-/Peakdaten und terminaler Receipt | ausstehend / — / nicht ausgeführt |
| B10 / B2 | P / N | RAM-Last nur im Helfer | Helfer unterliegt derselben Memorygrenze; keine Parentausweicharbeit | ausstehend / — / nicht ausgeführt |
| B11 / B2 | P / N | Viele Providerthreads bei festem Tasklimit | Tasks einschließlich Threads zählen; pids.events und Resultat | ausstehend / — / nicht ausgeführt |
| B12 / B2 | P / N | Viele Helferthreads bei festem Tasklimit | Dasselbe Tasklimit greift auch für Helfer | ausstehend / — / nicht ausgeführt |
| B13 / B2 | P / N | Schnell startende/sterbende Kinder zwischen Polls | Verbrauch geht nicht durch Sampling verloren; Kernelzähler | ausstehend / — / nicht ausgeführt |
| B14 / B2 | P / N | Zwei parallele Attempts mit verschiedener Last | Getrennte Scope-/Receiptmessungen, keine gegenseitige Attribution | ausstehend / — / nicht ausgeführt |
| B15 / B2,D16 | P / H | Parallele Buster-/Prismadmission an Rollenreservegrenze | Keine doppelte Host-/Podvergabe; reale Reservierungen und abgewiesener Überschuss | ausstehend / — / nicht ausgeführt |
| B16 / B3 | P / N | Laufender Provider+Helfer überschreiten Deadline | Alle eigenen Prozesse enden, Receipt enthält tatsächliche Gesamtabrechnung | ausstehend / — / nicht ausgeführt |
| B17 / B3 | P / N | Cancel während paralleler Arbeit | Kein unzugeordneter Restprozess nach Drain; tatsächlicher Abbruchreceipt | ausstehend / — / nicht ausgeführt |
| B18 / B3 | P,R / N | Supervisor-SIGKILL bei laufender Arbeit | Wiederanlauf reconciliert Originalownership; Orphans beendet oder vertraglich übernommen | ausstehend / — / nicht ausgeführt |
| B19 / B3 | P / L,N | Native Implementierung und produktiver Aufruf | Core bleibt generisch; Imports/Review plus produktive Ausführung ohne V1-/Filefallback | ausstehend / — / nicht ausgeführt |
| B20 / B4 | F / N | Setup erfolgreich; Consumer läuft weiter | Fixtureprozess und Budget bleiben bis Consumerende erhalten; kein Setupterminal als Cleanup | ausstehend / — / nicht ausgeführt |
| B21 / B4 | F,R / N | Restart vor dauerhafter Bereitschaft | Kein historischer Ready-Replay als Startfreigabe; Ownership erhalten/reconciliert | ausstehend / — / nicht ausgeführt |
| B22 / B4 | F,R / N | Restart nach Bereitschaft, vor Teardown | Keine verlorene Scope-/Budgetbindung; aktueller Recoveryvertrag bestimmt Consumerverhalten | ausstehend / — / nicht ausgeführt |
| B23 / B4 | F,R / N | Restart nach Teardownintention, vor Cleanupreceipt | Erste Intention erhalten; Budget erst nach bestätigtem Ende freigegeben | ausstehend / — / nicht ausgeführt |
| B24 / B4,D13 | P,J / L,N | Historische Prozessreceipts und neue Taskreceipts | Historische Consumer lesen unveränderte Historie; neue Einheit explizit versioniert | ausstehend / — / nicht ausgeführt |
| B25 / B5 | F / N | Echter Consumer wartet auf langsames Fixture-Setup | Consumer startet erst nach fsynced Readiness und ACK | ausstehend / — / nicht ausgeführt |
| B26 / B5 | F / N | Setup schlägt vor Ready fehl | Echter Consumer startet nie; Fehler und Cleanup nachgewiesen | ausstehend / — / nicht ausgeführt |
| B27 / B5 | F / N | Cancel vor Ready mit wartendem echtem Consumer | Kein später Start nach Cancel; eigene Lebensdauer korrekt beendet | ausstehend / — / nicht ausgeführt |
| B28 / B5 | F,R / N | Restart mit wartendem echtem Consumer | Keine vorzeitige Fixturebeendigung oder ungebundene Wiederaufnahme | ausstehend / — / nicht ausgeführt |
| B29 / B5 | F / N | Fixturecleanup schlägt fehl | Besitz/Budget nicht als freigegeben behauptet; Admission wird sicher gefenced | ausstehend / — / nicht ausgeführt |
| B30 / B5 | Prism-Produktionsentrypoint / N | Normaler Prismattempt neben Busterfixture | Prism behält normale Attemptlebensdauer, keine Fixturesemantik | ausstehend / — / nicht ausgeführt |
| B31 / Live | P,F,R / H | Reale Nova→Buster-Jobs in Produktionsimages | Gesamte B01–B30-Wirkung mit aktiven Bundles und Rollenbelegen wiederholt | ausstehend / — / nicht ausgeführt |
| B32 / B5 | F / N | Cancel nach Ready mit laufendem echtem Consumer | Consumer-/Fixtureende korrekt gebunden, kein vorzeitiger Cleanupabschluss | ausstehend / — / nicht ausgeführt |
| B33 / B5 | F,R / N | Restart mit laufendem echtem Consumer | Keine ungebundene Wiederaufnahme oder verlorene Fixturelebensdauer | ausstehend / — / nicht ausgeführt |
| B34 / D13 | P / N | Bekannte Anzahl Prozesse und Threads einschließlich Hauptthreads | Linux-Tasks genau einmal gezählt; Prozesse nicht zusätzlich addiert | ausstehend / — / nicht ausgeführt |
| B35 / D13 | P,F / N | Tatsächliche typische und maximale Workerarbeit vor Limitkalibrierung | Großzügige Reserve aus gemessener Last begründet; keine feste Prozess→Taskumrechnung | ausstehend / — / nicht ausgeführt |
| B36 / D14 | F / N | Speicherlast schon während Setup, danach retained Nutzung | Dieselbe physische Bindung bleibt; kein Cgroupwechsel als Übertragung alter Charges | ausstehend / — / nicht ausgeführt |
| B37 / D14 | F,J / L,N | Historischer Setupreceipt neben neuem Lifetimeabschluss | Alte Budget-/Receiptbytes unverändert; neue Lifetimebelege explizit versioniert/gebunden | ausstehend / — / nicht ausgeführt |
| B38 / D16 | P und Prism / H | Hostrollen aktiv, Pods fordern zusätzliche Kapazität | Scheduler berücksichtigt reale feste Rollenreservierung; keine Zweitvergabe an Pods | ausstehend / — / nicht ausgeführt |
| B39 / D16 | P und Prism / H | Rollenlast nahe Gesamtlimit, andere Hostdienste aktiv | Getrennte Hostdienstreserve bleibt; reale Hostkapazität geprüft | ausstehend / — / nicht ausgeführt |
| B40 / D16 | P und Prism / H | Node-/Runtime-Anbindung unvollständig | Aktivierung/Admission scheitert vor Start; keine nur nominelle Reservation | ausstehend / — / nicht ausgeführt |
| B41 / Live | P,F,R und Prism / H | Reale B32–B40-Fälle in aktiven Images/Hostrollen | Ergänzende Entscheidungsfälle mit tatsächlichen Reservierungen und Originalreceipts | ausstehend / — / nicht ausgeführt |

## Recovery und Quellen

| Fall / Kriterium | Pfad / Umgebung | Eingabe und Vorzustand | Erwartete Wirkung und Messung | Test / Rohbeleg / Zustand |
| --- | --- | --- | --- | --- |
| W01 / W1 | P,C / N | Realer erfolgreicher Job mit temporären Quellen | Nach belegtem Ende entfernt; Dateien/Bytes messen, Resultate lesen | ausstehend / — / nicht ausgeführt |
| W02 / W1 | P,C / N | Realer fachlicher Testfehlschlag bei sauberer Ausführung | Quellen entfernt; Fehlerreceipt/Evidence bleiben lesbar | ausstehend / — / nicht ausgeführt |
| W03 / W1 | P,C / N | Ausführungsfehler mit belegtem Prozessende | Quellen entfernt; keine pauschale Retention trotz positivem Ownershipbeleg | ausstehend / — / nicht ausgeführt |
| W04 / W1 | P,C / N | Realer Cancel mit positiv belegtem Drain | Quellen entfernt, originaler Cancelstatus bleibt | ausstehend / — / nicht ausgeführt |
| W05 / W1 | P,C / N | Fehler während realer Archiveextraktion | Extraktor beendet; kein unzugeordnetes temporäres Archiv | ausstehend / — / nicht ausgeführt |
| W06 / W2 | R,C / N | SIGKILL unmittelbar vor Terminalschreibung | Wiederanlauf prüft Besitz erneut; kein Löschen allein aufgrund Metadata | ausstehend / — / nicht ausgeführt |
| W07 / W2 | R,C / N | SIGKILL unmittelbar nach Terminalschreibung | Gleiche Ownershipprüfung trotz Terminalrecord | ausstehend / — / nicht ausgeführt |
| W08 / W2 | R,C / N | SIGKILL mitten in Cleanup | Wiederholung idempotent; Evidence und Originalreceipts lesbar | ausstehend / — / nicht ausgeführt |
| W09 / W2 | R,C / N | PID wiederverwendet, anderer Prozessstart | Fremder Prozess nicht beendet; Quelle nicht unsicher gelöscht; konkrete Diagnose | ausstehend / — / nicht ausgeführt |
| W10 / W2 | R,C / N | Cgroupbesitz unbekannt/Bindung abweichend | Keine Löschfreigabe; konkrete nächste Diagnose statt Erfolg | ausstehend / — / nicht ausgeführt |
| W11 / W2 | F,R,C / N | Terminaler Setuprecord, Fixture noch aktiv | Keine Quellenlöschung und keine Budgetfreigabe | ausstehend / — / nicht ausgeführt |
| W12 / W3 | C-Helper / L | Reale drei Quellpfade und sechs geschützte Pfade; zweiter Cleanupaufruf | Quellen weg, sechs Originalinhalte erhalten; idempotent | T0 / E1 / bestanden (nur Helper) |
| W13 / W3 | C-Helper / L | Workspace-/Jobsymlink vor Aufruf, fremde Quellen dahinter | Parentinvalidfehler, keine fremde Löschung | T1 / E1 / bestanden (nur Helper) |
| W14 / W3 | C-Helper / L | Leafsymlink auf retained Evidence, fehlender Job bei Wiederholung | Nur Link entfernt; Ziel bleibt; fehlender Job idempotent | T2 / E1 / bestanden (nur Helper) |
| W15 / W3 | C-Helper / L | Ancestorsymlink oberhalb Jobroot | Parentinvalidfehler vor jeder Löschung | T3 / E1,E2 / bestanden (nur Helper) |
| W16 / W3 | C-Helper / L | Jobverzeichnis direkt vor rm umbenannt und ersetzt | Originalquellen entfernt, fremder Baum und geschützte Daten unverändert | T4 / E1,E2 / bestanden (nur Helper) |
| W17 / W3 | C-Helper / L | Workspace direkt vor rm umbenannt und ersetzt | Originalquellen entfernt, fremder Baum und geschützte Daten unverändert | T5 / E1,E2 / bestanden (nur Helper) |
| W18 / W3 | P,C / N | W12–W17 über echte Jobausführung | Gleiche Grenzen im Produktionsaufrufer mit tatsächlicher Quieszenz | ausstehend / — / nicht ausgeführt |
| W19 / W3 | P,C,J / N | Mehrere abgeschlossene Jobs an unveränderter Kapazitätsgrenze | Nettoquellenbytes sinken messbar; separat verbleibende Record-/Resultquoten korrekt ausgewiesen | ausstehend / — / nicht ausgeführt |
| W20 / W4 | R,C / N | Restart, eindeutig eigene bereits tote Prozesse | Quellen innerhalb vorab begründeter Recoveryfrist tatsächlich freigegeben | ausstehend / — / nicht ausgeführt |
| W21 / W4 | R,C / N | Restart mit noch lebenden eigenen Orphans | Beenden/vertraglich übernehmen, Ende beweisen, anschließend tatsächlich löschen | ausstehend / — / nicht ausgeführt |
| W22 / W4 | R,C / N | Mehrere Crash-/Restartzyklen | Jedes berechtigte Cleanup terminiert innerhalb Frist; kumulative Platzfreigabe | ausstehend / — / nicht ausgeführt |
| W23 / W5 | J / L,N | Completedrecord mit eingebettetem Archiv und Originalresultat | Compaction gibt tatsächliche Metadatabytes frei; Originalconsumer/Replay unverändert | ausstehend / — / nicht ausgeführt |
| W24 / W5 | J,R / L,N | Failedrecord mit eingebettetem Archiv | Explizite Retentionsentscheidung, vollständige Inventarisierung, keine fiktive Freigabe | ausstehend / — / nicht ausgeführt |
| W25 / W5 | J,R / L,N | Cancelledrecord mit eingebettetem Archiv | Gleiche explizite Retentionsentscheidung und Originalconsumerprüfung | ausstehend / — / nicht ausgeführt |
| W26 / W5,R1–R4 | P,J,R / N | Gesamter runtimeRoot und alle Record-/Result-/Metadatalimits | Vollständige gebundene Inventarliste, kein Ausblenden verbleibender Quoten | ausstehend / — / nicht ausgeführt |
| W27 / Live | P,R,C,J / H | Worker-/Podrestart bei echten Jobs auf persistenten Volumes | W01–W26 soweit liveabhängig wiederholt; Originalreceipts abrufbar | ausstehend / — / nicht ausgeführt |

## Dokumentationsfälle

| Fall | Eingabe / Vorzustand / Pfad | Erwartung / Messung | Zustand |
| --- | --- | --- | --- |
| BD01 / B-DOC | Vollständiger Cutover; Ressourcenvertrag, Rollen-/Task-/Fixturebeschreibung | Tatsächliches Verhalten vollständig dokumentiert; Beispiele/Links/Diagnose geprüft; exakter Diff und Rohbelege | nicht ausgeführt |
| WD01 / W-DOC | W3-Helperfix; Betriebsdoku und Arbeitsmatrix | Linux-/FD-Grenze und verbleibende Quieszenz-/Restart-/Quota-Lücken korrekt beschrieben | bestanden nur für Slice: E1, unabhängiger Bericht; kein W-DOC-Gesamtabschluss |
| WD02 / W-DOC | Vollständige Recovery-/Quellenimplementierung | Betriebsrunbook mit Fristen, Orphan-/Unknownownershipdiagnose und Retention tatsächlich validiert | nicht ausgeführt |

## Exakte bereits ausgeführte Tests und Rohbelege

T0: `skills/buster/engine/test-gates/tests/terminal-workspace.test.ts`.
T1–T5: `tests/verification/reliability/buster-terminal-workspace-native.test.mts`:

- T1: `terminal cleanup refuses linked parent directories and preserves another job source`
- T2: `terminal cleanup unlinks a leaf symlink without deleting its target and remains idempotent`
- T3: `terminal cleanup rejects symlinks in ancestors of the job root`
- T4: `terminal cleanup stays on original directory after job is replaced during deletion`
- T5: `terminal cleanup stays on original directory after workspace is replaced during deletion`

E1: [unabhängiger Bericht](independent-slices-review-20260920.md),
[Testausgabe](../../evidence/independent-slices-20260920/tests.txt),
[gespeicherter Diff](../../evidence/independent-slices-20260920/reviewed.patch),
[Dateiidentitäten](../../evidence/independent-slices-20260920/identities.json).
E2: [Vorher-Negativkontrolle](../../evidence/independent-slices-20260920/old-cleanup-tests.txt).
Diese Belege gelten ausschließlich für die dort gespeicherten Code-/Testbytes.
Die Matrix selbst kam später hinzu. Spätere fachliche Änderungen verlangen neue
gezielte Läufe und Belegbindung.

Die bestehenden zwölf Fixture-Control-/Journaltests wurden später unter proot
mit `-b '/tmp/prism-native-tools/root/usr/bin/flock:/usr/bin/flock!'` erfolgreich
ausgeführt: [kombinierter Rohbeleg](../../evidence/buster-boundaries-20260920/tests.txt),
[Code-/Testidentitäten und exakter Aufruf](../../evidence/buster-boundaries-20260920/identities.json).
Der frühere BusyBox-Fehllauf bleibt sichtbar. Ohne produktiven Scheduler und echte
Consumer wird damit keine der offenen B-/W-Zeilen bestanden gesetzt.

## Capability-Konstruktionsrefactor: begrenzte Regression

Diese nachträglich einzeln dokumentierten Fälle belegen den engen Refactorvertrag,
nicht die A1-Vorabbedingung oder native Ressourcenisolation. Produktionspfad ist
jeweils `BusterRemotePlanService.#execute` → `createBusterCapabilityRuntime`;
die direkten Factorytests beginnen erst am zweiten Aufruf. Umgebung L, echte
Loopback-HTTP-Server, keine Cgroups. Exakter Test für RC01–RC03:
`http-authority.test.mts`, `suffix matching cannot contact an unrelated real HTTP
service; exact origin works and redirects stop`. RC04 verwendet
`tests/verification/contracts/check-pipeline-remote-plan-runtime.mts` mit dessen
unverändertem injizierten Executor. Alle vier Fälle sind im kombinierten
Rohbeleg oben gebunden.

| Fall | Eingabe und Vorzustand | Erwartung / Messung | Zustand |
| --- | --- | --- | --- |
| RC01 | Konfigurierter exakter erlaubter Origin; Serverkontaktzähler null | GET liefert Originalbody, genau ein Kontakt | bestanden, Factorygrenze |
| RC02 | Nur passendes Suffix, kein exakter Origin; Serverkontaktzähler null | GET und HEAD werden vor Kontakt verweigert | bestanden, Factorygrenze |
| RC03 | Erlaubter Origin liefert echten Redirect | Redirectfehler, Ziel wird nie kontaktiert | bestanden, Factorygrenze |
| RC04 | Echte Remoteplan-HTTP-Services, echte Stores/Archive, injizierter Executor | Bestehende Transport-, Deadline-, Cancel- und Restartassertions unverändert bestanden | bestanden, kein Provider-/Nativebeweis |
| RC05 | Originaler Store schreibt `running`, dann tatsächlicher Service-Cancel vor Extraktion; Executorstartzähler null | Kein Executorstart nach frühem Cancel, echter cancelled-Status innerhalb unveränderter 5000-ms-Servicefrist; Tarspawn hat zusätzlich initiale Abortprüfung | bestanden im finalen lokalen Lauf, unabhängige Gegenprüfung ausstehend |

RC05 wurde vor der zugehörigen Produktionskorrektur ergänzt. Prüfpfad ist
`BusterRemotePlanService.#execute` → `runTar` → Executor; dieselbe Linux/proot-
Umgebung wie RC04. Der Testhook wartet die originale dauerhafte Transition ab
und ruft dann den echten Service-Cancel auf; er ersetzt weder Storewirkung noch
Abbruchbehandlung. Testdatei bleibt `check-pipeline-remote-plan-runtime.mts`,
Assertion `an already cancelled job must not start its executor after extraction`.
Rohbelege werden unter `buster-early-cancel-20260920` gebunden. Der unabhängige
RC04-Fehllauf `independent-config-20260920/buster-service.txt` bleibt erhalten;
RC04 ist bis zur geklärten Gegenprüfung nicht als flakefrei abgeschlossen anzusehen.
Der [Diagnosebericht](buster-early-cancel-20260920.md) trennt reproduzierten
Produktionsfehler, mangelhafte Cancel-Testfixture und Late-Submit-Zeitannahme.
[Finaler lokaler Lauf](../../evidence/buster-early-cancel-20260920/final.txt):
21 Tests bestanden, keine Skips. Die Fehler- und Mutantläufe bleiben erhalten;
RC04/RC05 benötigen die unabhängige Wiederholung am korrigierten Stand.

Der kombinierte Lauf besteht aus 21 Tests ohne Skips; das ist keine Zahl
bestandener B-/W-Pflichtfälle. Die zwölf Fixturebaselinefälle und der weitere
HTTP-Leasefall sind ergänzende Regressionen. Dokumentergänzungen nach der
Belegaufnahme verändern keine getesteten Code-/Testbytes; die älteren
Dokumentsnapshots bleiben absichtlich bytegleich als `.md.snapshot` erhalten,
mit [Speicherabbildung](../../evidence/buster-boundaries-20260920/storage-map.json).
