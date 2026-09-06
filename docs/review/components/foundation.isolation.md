# foundation.isolation — Pluginprozess und nativer Supervisor

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Vier Implementierungsdateien vollständig untersucht; echte Prozessprüfungen mit
unten dokumentierten Fehlern/Umgebungsblockaden, kein bestandener Sandboxbetrieb.

## 1. Verantwortung, Grenzen und Verwendung

`runner.ts` (41 Zeilen), `session.ts` (129), `child.mjs` (98) und `sandbox.c`
(442) bilden externe Nova-Stage-/Observerausführung. Registry activation.ts:43–81
liefert für isolierte Registrierungen eine Funktion, die Argument, Context und
optional drittes AbortSignal an invokeIsolated weitergibt. Externe Adapter bleiben
abgewiesen. Nova-Ausführungs- und Observerruntime sind Eigentümer von Lease,
Capabilities und Lebenszyklus. Der gleiche C-Launcher wird von Busters Provider-,
Report-, Command- und Browserruntimes verwendet; diese benutzen eigene Protokolle,
nicht automatisch diese Nova-Session. Providerloader canonicalModule/Spawn und
Reportadapter runtime-Snapshot/Spawn als Gegenstellen geprüft; deren Gesamtprüfung
folgt bei buster.engine. Buildscript `scripts/build-plugin-sandbox.mjs` vollständig
gelesen und ausgeführt. Es kompiliert Original-C gehärtet, chmod und rename;
keine Quellcodeänderung oder Deployment.

## 2. Eingaben, Ausgaben, Schema und Übergaben

Runner canonicalisiert Root/Modul und verlangt echte Datei unter Root. Argument
und context.contract müssen JSON-serialisierbar und jeweils ≤1MiB sein. Anschließend
muss auch der gesamte Invoke-Envelope ≤1MiB sein. Child liest NDJSON, verlangt
invoke + surface stage/observer, importiert Funktion und reicht argument sowie
Contextproxy weiter. Contractfreeze ist nur flach; Childänderungen ändern keine
Hostgrants. Proxy verwaltet RPC-IDs und Artifactmap, sendet capability/event und
wartet auf Hostresponse. Host ruft den ursprünglichen invoke/emit-Context auf,
Result wird nur auf Serialisierbarkeit geprüft; Stage-Contractprüfung liegt in
Nova.execution. Console wird nach stderr umgeleitet, direkte stdout-Schreibzugriffe
bleiben ein untrusted Protokolleingang. Keine kryptographische Remotegrenze: private
Prozesspipes. Unbekannte Messages werden ignoriert; kein geschlossenes Envelope-
Schema/Sequenzzustand oder Limit gleichzeitig offener Host-RPCs.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

Session hält Streamreste, settled-Flag und Timer; Child offene RPC-Promises nur
im Speicher. Keine dauerhafte Queue, kein Replay und keine lokale Journaldatei.
Capabilityaufrufe können echte persistente/externe Nebenwirkungen im Host auslösen;
Session selbst kennt deren Commitstatus nicht. Dafür bleiben EffectCoordinator,
RevocableLease und jeweiliger Adapter zuständig. Erfolgsresult beendet Session
sofort, auch wenn ein Plugin frühere RPCs nicht abwartet. Späte Responses können
noch auf eine geschlossene Pipe schreiben (PCR-ISOLATION-001).

## 4. Korrektheit und Fehlerbehandlung

Invalid JSON, zu große Zeile/Restbuffer/stderr, Childfehler und Timeout erzeugen
ISOLATION-/ISOLATED_PLUGIN-Fehler. Settled schützt Promise vor mehrfacher Auflösung,
aber nicht alle Streamereignisse. Childprozess-'error' und close sind registriert;
stdin-'error' fehlt. Das originale Phase11- und External-engine-Programm stürzt
hier mit unbehandeltem EPIPE ab, statt einen eingegrenzten Stagefehler zu liefern.
Chunkweise UTF-8-Decodierung verändert gültige übertragenen Werte, siehe 003.

## 5. Timeouts, Abbruch, Retry, Doppellung und Parallelität

Walltimer beginnt nach Spawn. Bereits abgebrochenes Signal führt trotzdem zuerst
zum Spawn und danach finish. finish killt nur den gespeicherten direkten Child-PID
mit SIGKILL und wartet nicht auf close/Reaping. Dieser PID ist inzwischen der
C-Supervisor, nicht der eigentliche Pluginprozess (002). Offene Hostoperationen
werden nicht von Session separat abgebrochen; die oberhalb liegende Lease muss
sie begrenzen. Aufrufe laufen pro Session parallel, keine Backpressure auf
child.stdin.write oder Anzahl ausstehender Requests. Jede Invokation startet
neuen Prozess; keine idempotente Session-Wiederholung.

## 6. Neustart und teilweise abgeschlossene Aktionen

Corecrash verliert Session-/RPC-Zustand; kein Parent-Death-Signal im Launcher.
Supervisor setzt CHILD_SUBREAPER, startet Hauptkind, signalisiert/adoptiert/reapt
Nachkommen bei Hauptkindende oder SIGTERM/INT. Das hilft nur, solange Supervisor
lebt. Externe Effekte können trotz verlorener Childresponse abgeschlossen sein;
Wiederaufnahme muss Receipt-/Unknownzustand des Effectjournals verwenden.
Bestandstest Phase11 prüft nur abgelehntes Cancellationpromise, nicht Prozessbaum.
Runtime-bundle-isolation prüft dagegen Hauptkindende und SIGTERM-Prozessgruppe;
er übt nicht den SIGKILL-Pfad der Nova-Session aus.

## 7. Authentifizierung, Autorisierung, Vertrauensgrenzen

Env enthält nur NODE_NO_WARNINGS. Nodepermission erlaubt Childdatei und Paket
lesen, keine Schreib-/Subprozess-/Worker-/Addonrechte; --no-addons zusätzlich.
Capabilityauthority bleibt im Hostcontext; Paket kann keine eigenen Grants setzen.
C seccomp gilt nur AUDIT_ARCH_X86_64, verweigert gefährliche Systemaufrufe und im
Defaultmodus Netzwerk. Kein allgemeiner Syscall-Allowlistbeweis; Nodepermission
ist hier Teil der Grenze. Browserspezialmodus erlaubt Unix- und Internetstream-
sockets, blockiert Datagram/raw; optional Landlock TCP-Zielport (kein Origincheck)
und Filesystemroots. Der aufrufende Browserproxy muss Origins begrenzen. Diese
Optionssemantik an browser-playwright-runtime.ts:108 nachvollzogen.

Landlock FS benötigt ABI≥2, Truncate wird erst ab ABI3 eingeschränkt; TCP ABI≥4.
Node-Runner setzt keine read-/write-root-Landlockoptionen und keine eigene UID:
seine Dateigrenze beruht auf Nodepermission. C unterstützt UID/GIDabwurf nach
Cgroupbeitritt, höchstens64 Readroots. Hostkonfiguration/Capabilities zum Beitritt
müssen vorhanden sein, ohne sie stillschweigend anzunehmen. Launcher benötigt
`/proc/<pid>/task/<pid>/children`; hier nicht verfügbar. Dies ist eine dokumentierte
Umgebungsabhängigkeit und spätere Infrastrukturfolgeprüfung, kein Infrastrukturumbau.

## 8. Ressourcenbegrenzung, Cleanup und Aufbewahrung

Host: 256KiB pro fertiger NDJSON-Zeile, 1MiB aktueller stdout-Rest, 64KiB stderr,
1MiB Serialisierung. Das sind keine kumulativen Kommunikations-/RPC-Budgets;
JSON.stringify läuft vor der Byteprüfung. C setzt RLIMIT_CPU auf gerundete Sekunden,
NOFILE, CORE=0 und RLIMIT_AS auf max(2GiB,8×memoryBytes). Nodeoldspace ist 70% des
angeforderten memoryBytes mit16MiB-Minimum. Dies ist kein hartes RSS-/externes
Bufferlimit in Höhe des Leasewerts. Browser darf Addressspace explizit ausnehmen
und braucht dann aufrufereigene Messung/Cgroup. Kein RLIMIT_NPROC; externe
Nodeplugins dürfen stattdessen keine Subprozesse/Worker erzeugen. Siehe 004.
Sandbox kopiert keine Dateien, lokale Tests entfernen ihre temporären Pakete.
Bei Host-EPIPE ist finally im Testprozess nicht mehr garantiert; dessen einzelne
temporäre Fixtures sind keine produktiven Retentiondaten.

## 9. Architektur und Vereinfachung

Ein gemeinsamer, expliziter Prozessbaum-Lebenszyklus muss Start, Drain, Cancel,
Graceperiode, harte Beendigung und Reaping besitzen. Session darf nicht ein
neues Supervisorlayout wie einen einzelnen Executor-PID behandeln. Kommunikative
Resourcebounds sollten einmal pro Session für beide Richtungen definiert sein,
inklusive ausstehender RPCs und UTF-8-Framing. Keine bloßen Retry-/EPIPE-Shims.
Native Sandbox, Nodepermission und Hostauthorization sind verschiedene Schichten;
die Dokumentation darf deren Grenzen nicht zu einer pauschalen Garantie vermischen.

## 10. Untersuchte Tests und tatsächliche Aussagekraft

Vollständig gelesen: check-plugin-system-v2-isolation.mjs, phase11.mts,
external-engine.mjs, check-runtime-bundle-isolation.mjs. Letzterer enthält echte
Supervisor/setsid-, SIGTERM-, TCPport-, UDP/raw- und spätere Bundleprüfungen; die
Bundleanteile werden bei Entry/Inventar weiter ausgewertet. Gelesene Tests sind
keine erfolgreiche Ausführung aller Assertions.

[isolation-tests.txt](../evidence/isolation-tests.txt): Originalbuild Exit0;
Phase11 und External-engine Exit1 unbehandeltes EPIPE; direkter Launcher /bin/true
Exit70 „open task children: No such file or directory“; Bundleisolation Exit1 an
erster Supervisorassertion. Somit keine aktuellen FS-/Netz-/Crash-/Cancelgarantien
bestätigt, keine späteren Bundletests erreicht. Einfacher Isolationstest nach
identischem Startblocker nicht zusätzlich ausgeführt. Es wurde kein Ersatzlauncher
gebaut oder Schutz entfernt. [isolation-utf8.mjs](../evidence/isolation-utf8.mjs)
startet Originalchild und Originalsession ohne Sandbox, gezielte gültige UTF-8-
Chunkteilung bestätigt Datenkorruption; nur Protokolltest, kein Isolationstest.

## 11. Dokumentation und ältere Prüfbehauptungen

security-model.md behauptet eingegrenzte Crashes/Cancellation und Ressourcen;
Phase11-evidence.json beschreibt immediate_sigkill und Memory/Processcountlimits;
Implementationplan Phase11 ist abgehakt. Neu geprüft: Architekturquelle vorhanden,
aber Supervisoränderung und aktuelle EPIPE-/Memorygrenzen widerlegen pauschale
Betriebsgarantien. Kein früherer Gate-/CI-Erfolg übernommen. Dokumentationsstatus
veraltet/unvollständig. Kernel-/Node-/Proc-/Architekturmatrix, Grenzwerte und
Aufruf-spezifische Sandboxoptionen fehlen; spätere Infrastrukturdokumentation
soll diese Komponentenvoraussetzungen übernehmen.

## 12. Befunde und nächste Verifikation

### PCR-ISOLATION-001 — Pipefehler beendet den Hostprozess

- **Hoch, nachgewiesener Defekt.** Ein früher Childexit oder verspätete RPCresponse
  kann die komplette Nova-Coreinstanz beenden, statt nur ihren Pluginversuch.
- **Belege:** session.ts:15–27 schreibt Antworten; :49–54 registriert Childerror,
  aber keinen stdin-error; :54 schreibt Invoke. Originaltests oben liefern EPIPE
  als unbehandeltes Socketereignis. Lokaler Auslöser ist Launcherexit70, nicht
  ein bewiesener bösartiger Pluginexploit.
- **Ursache/Lösung:** Pipes als Teil der Session besitzen, alle Streamfehler in
  einen einmaligen Terminalzustand überführen; Writes nur solange aktiv, offene
  RPCs kontrolliert drainen/abbrechen und auf Prozessende warten.
- **Regression:** unveränderter originaler Start mit absichtlich sofort endendem
  echten Launcherchild und ein echter Pluginexit während Host-RPC; Host bleibt
  lebendig, Invocation endet typisiert, keine unhandled error/rejection.

### PCR-ISOLATION-002 — SIGKILL trifft Supervisor statt Prozessbaum

- **Hoch, nachgewiesener Codepfaddefekt; Laufzeitreproduktion blockiert.** Nach
  Cancel/Timeout kann der eigentliche Pluginprozess weiterlaufen und Ressourcen
  behalten; Promiseabschluss bestätigt kein Cleanup.
- **Belege/Ablauf:** runner.ts:31 spawn launcher; sandbox.c:285–292 fork+exec;
  session.ts:120–125 SIGKILL nur launcher-PID. Supervisor-SIGTERM/INT-Handler und
  Reaping (:294–333) können SIGKILL nicht behandeln; kein PDEATHSIG vorhanden.
- **Ursachenbehebung:** Session und Supervisor auf einen gemeinsamen begrenzten
  Terminationsvertrag bringen, TERM/Grace/gesamter Cgroup- oder Prozessbaumkill,
  Wait/Reap vor Cleanupbestätigung; Hostcrash ebenfalls abdecken. Kein isoliertes
  Ändern auf TERM ohne harte Grenze und Nachkommensnachweis.
- **Regression:** Originalrunner mit echter lang lebender Stage, PIDbeobachtung
  außerhalb Sandbox, Abbruch und Timeout; alle Prozesse verschwinden auch bei
  ignoriertem TERM, Hauptkind-setsid und Core-SIGKILL. Lokaler Procblocker bleibt
  sichtbar, bestehender Promise-/SIGTERMtest genügt nicht.

### PCR-ISOLATION-003 — UTF-8 wird an Streamchunkgrenzen beschädigt

- **Mittel, nachgewiesener Defekt.** Gültige Result-/Event-/Capabilitystrings
  ändern ihren Inhalt ohne Transportfehler; Identitäten/Artefaktwerte betroffen.
- **Beleg:** session.ts:57–65 ruft pro Buffer chunk.toString('utf8') auf; getrennte
  Mehrbytezeichen werden unabhängig ersetzt. Original-Protokollrepro sendet
  gültiges Emoji über zwei Chunks; Host liefert vier U+FFFD statt U+1F600.
- **Ursachenbehebung:** Streaming-UTF-8-Decoder bzw. Byteframing bis vollständiger
  Zeile, ungültige Wirebytes explizit ablehnen; Bytebudgets vor Decodierung messen.
- **Regression:** Originalchild/Session mit vollständigen JSONmessages, jede
  mögliche Teilung innerhalb 2/3/4-Bytezeichen in Result und RPC, exakte Gleichheit;
  fehlerhafte UTF-8-Sequenzen getrennt negativ prüfen. Kein Ersatzparser.

### PCR-ISOLATION-004 — Lease-Memorywert ist kein erzwungenes Speichermaximum

- **Mittel, begründeter Verdacht hinsichtlich realer Überschreitung; Codegrenze
  nachgewiesen.** Ein externes Plugin mit vielen nativen Buffern kann trotz
  kleiner Lease deutlich mehr Hostspeicher binden. Quantitative Überschreitung
  hier wegen Launcherblocker nicht gemessen.
- **Beleg:** runner.ts:30–35 setzt nur oldspace; sandbox.c:379–397 setzt AS auf
  mindestens2GiB bzw.8×memory und keinen RSS-/Cgroupwert für diesen Runner.
  Phase11-evidence nennt dagegen schlicht memory als enforced limit.
- **Ursachenbehebung:** gleiche Leasegrenze im zuständigen cgroup-v2-Speicherbudget
  für den vollständigen Prozessbaum erzwingen, fail-closed wenn erforderlich und
  nicht verfügbar; V8heaplimit nur zusätzlich. Keine höhere verdeckte Ersatzgrenze.
- **Verifikation:** echte Buffer-/Heap-/Childlast separat unter verschiedenen
  Leasewerten, maximumMemory aus Kernelcounter beobachten, Überschreitung führt
  zu typisiertem Fehler und vollständiger Bereinigung. Kernel-/Cgroupbereitstellung
  als Folgeprüfung, in diesem Auftrag keine Infrastrukturänderung.


Betroffene zweite Übergabe bei PCR-ISOLATION-003: worker/core/worker/
attempt-executor.ts:280 erhält von Buster provider-loader.ts:173/263 Bufferchunks
und decodiert sie ebenfalls separat. Workerreview rückgeprüft; dort Codebeleg,
kein zusätzlich behaupteter ausgeführter Worker-Repro. Gleiche Ursachenbehebung
muss pro Logstream einschließlich Flush beim Abschluss berücksichtigt werden.
