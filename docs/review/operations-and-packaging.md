# Ergänzende Aufruf- und Auslieferungsgrenzen

Baseline `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Dieser Anhang ergänzt
[nova.scaffold](components/nova.scaffold.md) für dessen vier inventarisierte
Operationsskripte und den Inventarabschluss für die drei Rollenpakete. Er zählt
nicht als zusätzliche, künstlich abgetrennte Komponente. Keine Infrastruktur-
oder ChatGPT-Ausführungsdiagnose: diese Repositoryskripte laufen nicht als
Supervisor der hier verwendeten Review-Session.

## 1. Verantwortung und tatsächliche Verwendung

`package.json:43–45` registriert review:status, review:status:format und
review:supervise. Vollständig gelesen: scripts/repository-review-status.mjs,
format-repository-review-status.mjs, supervise-repository-review.mjs und
lib/repository-review-run-root.mjs (613 Zeilen), dazu der Originaltest (185).
Supervisor startet npm run pipeline mit aktuellem --pipeline-Flag, beobachtet
lokale Runjournale, schreibt Heartbeats und kann begrenzt recover erneut starten.
Formatter ruft Status und optional OpenClaw subagents.list auf; er ist weder
Scheduler noch unabhängiger Nachweis einer tatsächlich arbeitenden KI.

## 2. Eingaben, Ausgaben und Gegenstellen

Lokale CLI-Pfadargumente/Run-ID und autorisierte Plattformkonfiguration sind
Eingaben. Parser akzeptieren unbekannte/doppelte Paare; required und numerische
Grenzen werden separat geprüft. Runroot entspricht Core SHA256-Runverzeichnis,
Legacyauflösung scannt vollständige Zeilen mit 256-KiB-Zeilenbudget und bindet
runId. Status liest Artifactstore-Metadaten und Blobs direkt, keine öffentliche
Storevalidierung; Logs/Dateien müssen vertrauenswürdig sein. Artifactwerte werden
hier nicht erneut gegen den im Namen stehenden Digest geprüft.

Status unterscheidet running/terminal und active/stale/degraded, zählt originale
Reviewcache-Protokolle und nur initiale Jobdigests als primary. Formatter bindet
OpenClaw-Rückgabe an output.details und unterstützt active/tasks. Fallback auf
gezählte Runtime-Locks ist sichtbar; tatsächlicher Tokenverbrauch ausdrücklich
unavailable, Planbudget ist Schätzung. Keine Modellleistung aus Heartbeat ableiten.

## 3. Persistenz und Commit

Lease exklusiv mit wx, Heartbeat/Diagnostik über temporäre Datei und rename,
Ressourcenjournal append. Diese Diagnosewrites haben kein fsync-Protokoll und
sind nicht die fachliche Coreautorität. Lease besitzt instanceId für Freigabe.
Pipeline schreibt seine autoritativen Corejournale selbst. Die Diagnoseablage
kann bei vollem Speicher werfen; periodischer asynchroner Heartbeat hat keinen
catch und kann unhandled rejection erzeugen. Kein persistenter Diagnose-GC.

## 4. Fehlerbehandlung

Statusfehler werden im Supervisor zu undefined, anschließend fälschlich wie ein
terminaler Zustand behandelt: PCR-SCAFFOLD-OPS-001. Formatter schlägt bei fehlendem
Status dagegen ausdrücklich fehl. Fehlende optionale Ressourcen-/Taskdaten
werden unavailable, keine Nullmessung. Ein Terminalfehler eines tatsächlich
beobachteten Childs wird nicht zu succeeded; initial/adopted Status != running
liefert jedoch generell 0, auch blocked. Exitcode und fachlichen Runstatus deshalb
nicht gleichsetzen. Spawn-error hat keinen eigenen error-Handler; nicht verfügbare
npm-Binary wurde nicht separat provoziert.

## 5. Timeout, Abbruch, Wiederholungen und Parallelität

Supervisor begrenzt Recoveries auf maximal100 (Default5). Preflight optional,
bis240s; hier nicht ausgeführt, da es echte Agenten ansprechen kann. Heartbeat
alle15s mit2s Gatewayhealth-Timeout. reviewStatus spawnSync selbst ohne Deadline;
Formatter gibt10s/2MiB vor. Abbruch sendet SIGTERM an detached Childprozessgruppe,
kein nachfolgendes SIGKILL-Budget. Ignoriert ein Child das Signal, kann Supervisor
auf exit weiter warten. Abort während Recoverypause wird beim neuen runAttempt
nicht vor Spawn geprüft. Das ist eine konkrete ungetestete Abbruchgrenze.

Lease-Reclamation liest PID, löscht alte Datei und erzeugt wx ohne atomare
Besitzerbindung. Mehrprozessrennen/PID-Reuse/PID-Namespace bleiben offen; die
bekannten Mutexrepros aus nova.state sind dafür kein separater Laufzeitbeweis.

## 6. Neustart und Teilaktionen

Adoption prüft lebende PID und cmdline-Substrings pipeline/runId; kein Prozess-
Startzeit-/Containeridentitätsnachweis. auto entscheidet anhand Eventdateiexistenz
zwischen start/recover. Core prüft den tatsächlichen Snapshot-/Eventzustand.
Nach Childexit werden Sample/Diagnostik geschrieben und Status erneut gelesen.
Core-Präfix-/Effectbefunde bleiben maßgeblich. Diagnoseverlust darf keinen neuen
fachlichen Erfolg begründen; fehlender Status muss ausdrücklich unbekannt bleiben.

## 7. Vertrauensgrenzen

Lokale Pfade, Runjournal und Plattform sind Operatorautorität. Kein Netzwerk-
Listener, keine Secrets im Anhang. Health-URL/CLI-Binary sind konfigurierbare
Operatorwerte. Formatierte Statusdaten kontrollieren keine Core-Autorisierung.
Umgebungsweitergabe an npm und optionales OpenClaw setzt vertrauenswürdige
Hostprogramme voraus. Weder dieser Code noch sein Test belegt CNI/Proxy/Cluster.

## 8. Ressourcen und Aufbewahrung

Eventtail1MiB, Ressourcentail8MiB; dadurch können ältere terminale Events oder
Attempt-IDs fehlen. Artifact-Metadaten und einzelne Blobs werden vollständig
synchron gelesen, nicht global begrenzt. Aktive Locks werden nur für Attempt-IDs
im Tail gezählt. CPU/RAM stammen aus cgroup und sind nicht notwendigerweise nur
Pipelineprozesswerte; RSS separat. Keine Rotation von Pipeline-/Resource-Logs.
Der Kommentar „bounded read“ gilt daher nicht pauschal für sämtliche Eingaben.

## 9. Architektur und Vereinfachung

Status als nichtautoritative Projektion ist sinnvoll, sollte jedoch strenge
Storeleser und explizites unknown/error verwenden. Diagnoselease nicht als Ersatz
für den Core-Runlock behandeln. Gemeinsame Runroot-Implementierung statt kopierter
Legacylogik verringert Drift; aktueller Originaltest vergleicht beide.
Keine weiteren Wiederanlauf-Wrapper hinzufügen, die unbekannten Zustand verschlucken.

## 10. Tests und tatsächliche Nachweise

`node --test scripts/tests/repository-review-operations.test.mjs`: **5/5 bestanden**,
[evidence/nova-operations-tests.txt](evidence/nova-operations-tests.txt).
Originalstatus/-formatter/-supervisor, echte Dateien und Kindprozesse; vorhandene
fake-npm/fake-openclaw-Fixtures simulieren Pipeline/Taskantworten. Kein echter
Agentlauf, keine neu geschriebenen Ersatzimplementierungen zum Grünmachen.
Test deckt Status/Legacy/Resume/Terminal/Flag ab, keinen unkooperativen Prozess,
Lost-ACK, Multi-Supervisor-Wettlauf oder Speicherfehler.
Zusatzprobe [nova-supervisor-status-failure.mjs](evidence/nova-supervisor-status-failure.mjs)
startet unveränderten Supervisor mit fehlender Plattformdatei: **Exit0, keine
Fehlermeldung, keine Pipeline gestartet**. [Ergebnis](evidence/nova-supervisor-status-failure.txt).

## 11. Dokumentation

Paketbefehle existieren; keine zugeordnete vollständige Operationsanleitung zu
Abbrucheskalation, Diagnoseretention, Status-unbekannt und Diagnose-/Runautorität
in den durchsuchten Markdownquellen gefunden. Zugeordnete Scaffoldanleitung
beschreibt Projektgenerierung, nicht diese vollständige Supervisorsemantik.
Dokumentationsstatus dieser Teilgrenze: fehlend/unvollständig. Vorhandene Tests
sind Verifikation, keine Betriebsanleitung.

## 12. PCR-SCAFFOLD-OPS-001 — Statusfehler beendet Supervisor scheinbar erfolgreich

**Mittel; nachgewiesener Defekt.** `scripts/supervise-repository-review.mjs:79–85`
normalisiert gescheiterten Statuschild zu undefined; `:230–232` testet
`initialStatus?.status !== 'running'` und liefert0. `observeExistingPipeline`
verwendet dieselbe Verwechslung bei Statusverlust. Auslöser: fehlende/defekte
Plattformdatei, kaputtes Artefakt oder anderer Statuslesefehler. Folge: ausdrücklich
angeforderter Start bleibt aus bzw. Beobachtung endet, Exit0 und leere Ausgabe
verbergen den Fehler. Originalprobe bestätigt fehlende Plattform, nicht jede
Dateifehlerklasse separat. Ursache beheben: fehlenden Status strikt als error/
unknown behandeln und mit diagnostiziertem Nichtnullstatus beenden oder begrenzt
wiederholen; nur bestätigten fachlichen Terminalzustand entsprechend melden.
Regression: Original-CLI mit ungültiger Plattform und anschließend lesbarer
Plattform; erster Lauf muss sichtbar scheitern und darf keinen Erfolg behaupten,
zweiter muss korrekt starten. Adopted-Pipeline bei temporärem Statusfehler separat
nachweisen. Keine funktionale Änderung in diesem Auftrag.

## Rollenpakete und Inventarabschluss

Vollständig gelesen: `scripts/check-runtime-role-manifests.mjs`,
`build-runtime-role-bundle.mjs`, `package-agent-skill-bundle.sh`, alle drei
`packaging/runtime/roles/*.json` und `package-ownership.json` sowie die
Builder-/Cutovertests. Rollen wählen Pakete/Plugins/Extension explizit;
Package-Dependencies und kubeclawRuntimeAssets bilden weitere Closure. Builder
prüft Quellselektion vor/nach Kopieren, lehnt Symlinks und Zielkollisionen ab,
kopiert externe Dependencies aus installiertem node_modules und erzeugt interne
Paketlinks. Das prüft keine neue Supplychain-Vertrauenswurzel oder echte Container.

`node scripts/check-runtime-role-manifests.mjs`: **bestanden**,3 Rollen,46
Pipelineplugins. `node tests/verification/contracts/check-runtime-bundle-builder.mjs`:
**bestanden**, echte temporäre Paketzusammenstellung und getrennte Quell-freie
Importprozesse für Nova/Buster/Prism. Kein Imagebuild, keine Veröffentlichung,
kein Sandboxstart und kein Test jedes exportierten Aufrufs. Original-Cutovertest
auf reproduzierbare tar/gzip-Archive gelesen, nicht zusätzlich ausgeführt: die
Inventarfrage ist mit Auswahl und tatsächlichen Bundleimports ausreichend geprüft.

Alle46 Pipelineplugin-Manifeste und beide OpenClaw-Manifeste sind erfasst.
Manifest-ID `kubeclaw-prism` gehört zur stabilen Review-ID `prism.extension`;
der reine IDvergleich darf dies nicht als fehlende49. Komponente interpretieren.
Prompt-contract hat kein Pipelinepluginmanifest und keine Rollenlieferung.
Alle17 package-ownership-Einträge sind auf die bestehenden93 Grenzen abbildbar;
Entrypoint-Pakete sind Fassaden, keine doppelten Coreimplementierungen.
Quellabdeckung in skills/cmd/contracts bedeutet Zuordnung, nicht automatisch
fachlichen Reviewabschluss. Dynamische Aktivierung folgt dem geprüften
Registrypfad package.root/registration.module/export; sie macht nicht jeden
registrierten Provider aktiv. Besondere Bibliotheks-/Legacy-/Testpfade bleiben
in den jeweiligen Reviews ausdrücklich gekennzeichnet.
