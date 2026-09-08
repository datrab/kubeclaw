# kubeclaw.command-runner

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Auswahl, Eingaben und Empfänger

Vollständig gelesen: `skills/common/plugins/command-runner/src/adapter.ts`,
`runner.ts` einschließlich cgroup/helpers, Manifest, Configschema, README und
beide Tests. Manifest `command` bietet command.execute. Core autorisiert exakte
Executables/canonical working roots; Adapter löst realpath/X_OK, Catalog und cwd
auf, verweigert Payload-environment, NUL-Argumente und falsche resource.type.
Catalog bis 128 Einträge, Config verlangt positive Ausgabe-/Zeit-/Gracegrenzen.

Zweiter tatsächlicher Aufrufer: Buster
`engine/test-gates/direct-command-runtime.ts:DirectCommandCapabilityInvoker`
importiert exportierten CommandRunner direkt, setzt Sandbox-Executable, cgroup,
Ressourcenlimits, kontrolliertes PATH/HOME/TMPDIR und writable/read-only roots.
Er fängt CommandRunError und gibt Output plus errorCode an Testprovider zurück.
Das ist von Nova-Adapteractivate zu unterscheiden: dieser startet direkt mit
leerer Umgebung und ohne Sandbox. Direktaufruf mit Dateigrenzen ohne Sandbox wird
COMMAND_SANDBOX_REQUIRED. Busterzuständigkeit/weitere Testgateabschlussphasen siehe
[buster.engine](buster.engine.md); kein eigener Worker-Claim in diesem Paket.

## 3–4. Prozesszustand und Fehler

spawn mit shell:false, getrennte Pipes, eigene Prozessgruppe auf POSIX. Output
besteht aus exitCode, Signal, stdout/stderr, sequenziellen Streamrecords und
Ressourcenproben. Nonzero Exit bleibt normales Ergebnis; Adapter-/Limitfehler
werfen CommandRunError mit Teiloutput. Keine persistente Receipt-/Idempotenz-
Implementierung; beliebige gestartete Programme können externe Mutationen ausführen.
Kein fsync/Commitvertrag für ihre Daten, Host-Neustart kann externen Ausgang offenlassen.

## 5–7. Deadline, Prozessbaum, Restart und Autorität

Timeout plus SIGTERM/Grace/SIGKILL; Ergebnis erst beim close und anschließender
Gruppenbereinigung. Bei bereits beendetem Gruppenführer und weiter offenen
Kindpipes greift diese Abfolge nicht, PCR-COMMAND-001. Shutdown setzt stopping,
terminiert aktive Handles und wartet close; derselbe Defekt betrifft sein Warten.
Direkte Runner.run-API selbst prüft stopping/already-aborted nicht vor spawn;
Novaadapter/Busteraufrufkontext sind nicht gleichwertige Garantie für beliebige
Library-Aufrufer. Offene API-Vertragsfrage, nicht als neue produktive Verletzung behauptet.

Exakte Executable-/cwd-Allowlist ist keine Beschränkung beliebiger argv-Semantik:
erlaubtes Node/Git kann Dateien/Netzwerk nach OS-Rechten benutzen. Operator muss
Auswahl vertrauen oder Buster-Sandbox nutzen. Neue Prozesssitzungen können Gruppe
verlassen; cgroup schützt nur den entsprechend verdrahteten Busterpfad. Keine
vollständige externe Aktionswiederaufnahme/Exactly-once-Garantie.

## 8–9. Ressourcen und Vereinfachung

Combined bytes vor UTF8-Decodierung begrenzt, höchstens 4096 wechselnde
Streamrecords. Chunk.toString beschädigt gesplittete UTF8-Zeichen: gemeinsame
[PCR-ISOLATION-003](foundation.isolation.md), hier derselbe Fehlermechanismus.
25-ms-/proc-Samples zählen aktuell auffindbare Nachfahren; kurzlebige oder
reparentete Prozesse können CPU-/Memoryspitzen verlieren. CPU-Zeit nimmt 100-Hz-
Ticks an; keine portable präzise Accountinggarantie. cgroupFacts liefert CPU und
Memory, process count bleibt /proc-Nachfahrenzahl; pids.max wird separat erzwungen.
Hard cgroup-Limits setzen delegierte pids/memory/cpu-Controller voraus; Sandbox
verlangt cgroup außer explizitem sampled fallback. Messwerte sind Maximalsamples,
keine vollständigen Versuchskosten. cgroup.kill/rmdir-Fehler beim Cleanup werden
ignoriert; Cleanup nach SIGKILL wartet nicht sicher auf alle Reap-Ereignisse.

Keine stdin-Schreibpipe (ignore), stdout/stderr-Fehler haben keine eigenen Handler.
Kein absichtlicher Pipefehlertest durchgeführt. Vereinfachung: ein gemeinsamer
Prozessgruppen-Lifecycle mit exit und close getrennt; echte cgroup-Endzustands-
Bestätigung statt mehr verstreuten Timern und ignorierten Cleanupfehlern.

## 10. Tests und Grenzen

Original `node tests/package-boundary.test.mjs && node tests/live-function.test.ts`
im Paketverzeichnis bestanden, Node 24.19.0. Echte Nodeprozesse prüfen cwd/empty
env, Nonzero, Grants/Argumente, Outputlimit, Timeout, aktiven Abort, SIGTERM-
resistenten Shutdown und unzulässige Dateigrenzen ohne Sandbox. Leerer Test-Fence,
kein produktiver Core-Lease. Boundarytest Regex. Kein delegierter cgroup-/Sandbox-
Integrationstest in diesem Paket; vorhandene Buster-/Isolationsergebnisse ersetzen
keinen neuen Hardware-/Cluster-Nachweis.

Eigene Original-Runner-Probe in `evidence/capability-adapter-probes.mjs`: echter
Shellführer startet sleep-Kind mit geerbten Pipes und endet; Kind endet aus Sicherheits-
gründen selbst nach 1200 ms. Runner hat 200 ms Deadline +25 ms Grace, antwortet
aber erst nach Kindende mit COMMAND_TIMEOUT. Keine dauerhaft hinterlassene Last.

## 11–12. Dokumentation und Befund

README korrekt zu empty env/nonzero exit, aber pauschal begrenzte Termination
wird durch 001 widerlegt; shared Runner/Buster-cgroup-Semantik nicht erklärt.
Dokumentationsstatus veraltet in dieser Zusage, sonst unvollständig.

### PCR-COMMAND-001 — Beendeter Gruppenführer verhindert Termination offener Kindpipes

Schweregrad hoch: laufende Nachfahren können Timeout, Abbruch und Shutdown
unbegrenzt aufhalten. Nachgewiesener Defekt. `src/runner.ts:257–274,279–295`:
Timer setzt Fehler, #terminate kehrt bei exitCode/signalCode sofort zurück;
#cleanupGroup wird erst auf close aufgerufen, das wegen geerbter Pipes ausbleibt.
Ein bereits beendeter Führer bedeutet keine beendete Prozessgruppe. Reale Probe
mit selbst endendem Kind zeigt deutlich überschrittene 225-ms-Grenze.
Ursachenbehebung: Gruppen-/cgroup-Leben unabhängig vom Führer verfolgen, beim
Timeout Gruppe auch nach exit killen, Termination/Reaping/Streamclose unter
Gesamtdeadline koordinieren. Regression mit Führer-exit, pipehaltendem Kind,
Timeout, Abort und Shutdown; alle müssen Kind rechtzeitig beenden. Eigenständiger
Root-Cause gegenüber PCR-ISOLATION-002 (Supervisor-SIGKILL).
